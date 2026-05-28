-- =============================================================================
-- HotelOps Database Schema
-- PostgreSQL 16  |  Normalized to BCNF
-- Database: Koyeb PostgreSQL (Neon)
--
-- HOW TO APPLY (first time or full rebuild):
--   psql "<connection-string>?sslmode=require" -f database/schema.sql
--
-- HOW TO TEAR DOWN & REBUILD (run teardown.sql first, then this file):
--   psql "<connection-string>?sslmode=require" -f database/teardown.sql
--   psql "<connection-string>?sslmode=require" -f database/schema.sql
--
-- TABLE SUMMARY:
--   departments       — lookup table for hotel departments
--   users             — all staff (employee / front_desk / admin roles)
--   time_entries      — clock-in / clock-out records
--   approval_requests — manual time-edit approval workflow
--   shifts            — shift templates (start/end time per department)
--   schedules         — employee ↔ shift assignments by date
--   handoff_notes     — Calendar handoff/communication entity (Sprint 10)
--   handoff_note_reads — per-user read state for handoff_notes (Sprint 10)
--   room_types        — hotel room category lookup
--   forecasts         — daily room availability vs. expected check-ins
--   audit_logs        — full change history for all privileged operations
-- =============================================================================


-- ── ENUMS ────────────────────────────────────────────────────────────────────

CREATE TYPE user_role    AS ENUM ('employee', 'front_desk', 'admin');
CREATE TYPE entry_status AS ENUM ('pending', 'approved', 'rejected');


-- ── DEPARTMENTS ───────────────────────────────────────────────────────────────

CREATE TABLE departments (
  department_id   SERIAL PRIMARY KEY,
  name            VARCHAR(100) NOT NULL UNIQUE,
  -- Sprint 11: admin-settable color for the Calendar dept chips +
  -- shift band tinting. #RRGGBB hex, NULL = frontend neutral fallback.
  color           VARCHAR(7),
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT departments_color_format CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$')
);

INSERT INTO departments (name, color) VALUES
  ('Front Desk',      '#3182ce'),
  ('Housekeeping',    '#38a169'),
  ('Maintenance',     '#dd6b20'),
  ('Food & Beverage', '#805ad5'),
  ('Management',      '#718096');


-- ── USERS ─────────────────────────────────────────────────────────────────────
-- Covers all staff roles. Phone number is the clock-in identifier.

CREATE TABLE users (
  user_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Login identifiers: staff can log in via any of these. At least
  -- one must be set; uniqueness enforced per-column via partial indexes.
  -- Sprint 9 adds birthday — not unique (collisions resolved at login).
  -- Uniqueness for phone_number / username / employee_code / email is
  -- enforced via the partial unique indexes below (Sprint 11.1.3),
  -- not column-level UNIQUE, so soft-deleted rows release their slots.
  phone_number     VARCHAR(10),                     -- 10 digits, optional
  username         TEXT,                            -- 3-16 chars [A-Za-z0-9._-], must contain a letter
  employee_code    TEXT,                            -- 4-6 digits, string so leading zeros work
  birthday         DATE,                            -- Sprint 9: 8-digit MMDDYYYY at the keypad, not unique
  name             VARCHAR(200) NOT NULL,
  email            VARCHAR(255),
  role             user_role    NOT NULL DEFAULT 'employee',
  department_id    INT          REFERENCES departments(department_id),
  hire_date        DATE         NOT NULL DEFAULT CURRENT_DATE,
  base_hourly_rate NUMERIC(6,2),
  active           BOOLEAN      NOT NULL DEFAULT TRUE,
  -- Sprint 11.1.2: soft-delete stamp. Hard-delete fails on FK to
  -- time_entries (and other historical tables); leave the row,
  -- mark deleted, and hide from lookups via WHERE deleted_at IS NULL.
  deleted_at       TIMESTAMPTZ,
  pin_hash         TEXT,                            -- bcrypt; NULL = no PIN set
  pin_required     BOOLEAN      NOT NULL DEFAULT FALSE,  -- admin-controlled
  pin_must_set     BOOLEAN      NOT NULL DEFAULT FALSE,  -- forces set-PIN interstitial after admin reset
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT users_at_least_one_identifier CHECK (
    phone_number IS NOT NULL OR username IS NOT NULL OR employee_code IS NOT NULL OR birthday IS NOT NULL
  ),
  CONSTRAINT users_employee_code_format CHECK (
    employee_code IS NULL OR employee_code ~ '^[0-9]{4,6}$'
  ),
  CONSTRAINT users_username_format CHECK (
    username IS NULL OR (username ~ '^[A-Za-z0-9._-]{3,16}$' AND username ~ '[A-Za-z]')
  )
);

CREATE INDEX idx_users_phone      ON users(phone_number);
CREATE INDEX idx_users_role       ON users(role);
CREATE INDEX idx_users_department ON users(department_id);
-- Sprint 11.1.2: partial index for the hot "not deleted" path.
CREATE INDEX idx_users_not_deleted ON users(user_id) WHERE deleted_at IS NULL;
-- Sprint 11.1.3: identifier uniqueness scoped to live (non-deleted) rows
-- so soft-deleted users release their phone / username / code / email
-- slots for the next hire while preserving the historical row for FKs.
CREATE UNIQUE INDEX idx_users_phone_number_live ON users (phone_number)      WHERE phone_number  IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_email_live        ON users (email)             WHERE email         IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_username_lower    ON users (LOWER(username))   WHERE username      IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX idx_users_employee_code     ON users (employee_code)     WHERE employee_code IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX        idx_users_birthday          ON users(birthday)            WHERE birthday      IS NOT NULL;


-- ── TIME ENTRIES ──────────────────────────────────────────────────────────────
-- One row per clock-in. clock_out_time NULL = currently clocked in.

CREATE TABLE time_entries (
  entry_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(user_id),
  clock_in_time  TIMESTAMPTZ NOT NULL,
  clock_out_time TIMESTAMPTZ,
  regular_hours  NUMERIC(5,2),
  overtime_hours NUMERIC(5,2) DEFAULT 0,
  manual_entry   BOOLEAN     NOT NULL DEFAULT FALSE,
  ot_approved    BOOLEAN     NOT NULL DEFAULT FALSE,   -- migration 007 — admin sign-off on this entry's OT bucket
  notes          TEXT,
  created_by     UUID        REFERENCES users(user_id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_time_entries_user     ON time_entries(user_id);
CREATE INDEX idx_time_entries_clock_in ON time_entries(clock_in_time DESC);
-- Partial index for fast "is employee currently clocked in?" lookup
CREATE INDEX idx_time_entries_open     ON time_entries(user_id)
  WHERE clock_out_time IS NULL;


-- ── APPROVAL REQUESTS ─────────────────────────────────────────────────────────
-- All manual time edits must go through manager approval.

CREATE TABLE approval_requests (
  request_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      UUID         NOT NULL REFERENCES time_entries(entry_id),
  requested_by  UUID         NOT NULL REFERENCES users(user_id),
  approved_by   UUID         REFERENCES users(user_id),
  original_data JSONB,
  edited_data   JSONB        NOT NULL,
  reason        TEXT         NOT NULL,
  status        entry_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX idx_approval_requests_status ON approval_requests(status);


-- ── SHIFTS ────────────────────────────────────────────────────────────────────
-- Reusable shift templates (e.g. "Morning Front Desk 7am-3pm").

CREATE TABLE shifts (
  shift_id      UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id INT     NOT NULL REFERENCES departments(department_id),
  name          VARCHAR(100),
  start_time    TIME    NOT NULL,
  end_time      TIME    NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── SCHEDULES ─────────────────────────────────────────────────────────────────
-- Assigns a shift template to a specific employee on a specific date.

CREATE TABLE schedules (
  schedule_id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(user_id),
  shift_id       UUID NOT NULL REFERENCES shifts(shift_id),
  scheduled_date DATE NOT NULL,
  notes          TEXT,
  created_by     UUID NOT NULL REFERENCES users(user_id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedules_user_date ON schedules(user_id, scheduled_date DESC);
CREATE INDEX idx_schedules_date      ON schedules(scheduled_date);


-- Sprint 10.3: the legacy `shift_notes` table was removed in
-- migration 012. It was superseded by `handoff_notes` (10) which
-- backs the Calendar's handoffs drawer. Old deployments run
-- migration 012 to drop the table; fresh installs never see it.
-- If you find a reference to `shift_notes` anywhere downstream,
-- it's stale and should map onto `handoff_notes`.


-- ── SCHEDULE SHEET CELLS (Sprint 14) ───────────────────────────────────────────
-- Excel-style weekly grid the GM uses to plan shifts. One row per
-- (week_start, user_id, day_of_week). Stores the raw free-form text
-- the GM typed (e.g., "3p-11p", "OFF", "BRK+help") plus, when
-- parseable, structured start/end times. is_published flips when
-- the cell is approved for the calendar overlay.
-- Migration: database/migrations/017_schedule_sheet_cells.sql

CREATE TABLE schedule_sheet_cells (
  cell_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start     DATE         NOT NULL,
  user_id        UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  day_of_week    SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  display_text   TEXT         NOT NULL,
  parsed_start   TIME,
  parsed_end     TIME,
  -- Sprint 14.3: full multi-segment parse for split shifts
  -- ("9-12 / 4-8" → [{start,end},{start,end}]). parsed_start /
  -- parsed_end stay populated for single-range queries; clients
  -- that need every range read parsed_segments instead.
  -- Migration: database/migrations/018_schedule_sheet_cells_segments.sql
  parsed_segments JSONB,
  -- Sprint 15.3: free-form note attached to the cell, written via
  -- the Edit Shift popover. Surfaced as a hover title on the
  -- calendar planned-shift overlay. NULL = no note.
  -- Migration: database/migrations/020_schedule_sheet_cells_notes.sql
  notes          TEXT,
  is_published   BOOLEAN      NOT NULL DEFAULT FALSE,
  highlight      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT schedule_sheet_cells_unique UNIQUE (week_start, user_id, day_of_week)
);

CREATE INDEX idx_sheet_cells_week ON schedule_sheet_cells(week_start);
CREATE INDEX idx_sheet_cells_user ON schedule_sheet_cells(user_id);
CREATE INDEX idx_sheet_cells_published_week
  ON schedule_sheet_cells(week_start)
  WHERE is_published = TRUE;


-- ── STATUS CODES (Sprint 15.0) ──────────────────────────────────────────────
-- Admin-defined codes for the Shift Sheet's inline pill rendering.
-- Cell display_text is matched (case-insensitive, whole-string)
-- against `abbreviation` to render as a colored pill instead of raw
-- text. Five seed rows are is_system = TRUE (renamable, not
-- deletable).
-- Migration: database/migrations/019_status_codes.sql

CREATE TABLE status_codes (
  code_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  label          TEXT         NOT NULL,
  abbreviation   TEXT         NOT NULL,
  color          TEXT         NOT NULL,
  is_system      BOOLEAN      NOT NULL DEFAULT FALSE,
  sort_order     INTEGER      NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT status_codes_abbr_unique UNIQUE (abbreviation)
);

CREATE INDEX idx_status_codes_sort ON status_codes(sort_order, label);


-- ── HANDOFF NOTES (Sprint 10) ──────────────────────────────────────────────────
-- The single first-class entity backing the Calendar surface's three
-- note views: per-shift threads, general department / all-staff
-- handoffs, and cross-day carryovers (10.1+ surfaces). One row drives
-- which views it appears in via `scope` + `for_date` + `carry_until`.
-- Migration: database/migrations/011_handoff_notes.sql

CREATE TABLE handoff_notes (
  note_id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable + author_label text fallback (Sprint 10.4) so admin
  -- (who has no users row — credentials in server/config/admins.json)
  -- can author notes. CHECK below guarantees at least one path is
  -- populated.
  author_user_id UUID        REFERENCES users(user_id),
  author_label   TEXT,
  body           TEXT        NOT NULL,
  scope          VARCHAR(16) NOT NULL CHECK (scope IN ('shift', 'department', 'all')),
  schedule_id    UUID        REFERENCES schedules(schedule_id)     ON DELETE CASCADE,
  department_id  INT         REFERENCES departments(department_id) ON DELETE SET NULL,
  for_date       DATE        NOT NULL,
  carry_until    DATE,
  pinned_at      TIMESTAMPTZ,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT handoff_notes_scope_shape CHECK (
    (scope = 'shift'      AND schedule_id IS NOT NULL) OR
    (scope = 'department' AND department_id IS NOT NULL AND schedule_id IS NULL) OR
    (scope = 'all'        AND schedule_id IS NULL AND department_id IS NULL)
  ),
  CONSTRAINT handoff_notes_author_required CHECK (
    author_user_id IS NOT NULL OR author_label IS NOT NULL
  )
);

CREATE INDEX idx_handoff_notes_for_date              ON handoff_notes(for_date);
CREATE INDEX idx_handoff_notes_department_for_date   ON handoff_notes(department_id, for_date);
CREATE INDEX idx_handoff_notes_schedule              ON handoff_notes(schedule_id);
CREATE INDEX idx_handoff_notes_carry_until           ON handoff_notes(carry_until)
  WHERE carry_until IS NOT NULL;

CREATE TABLE handoff_note_reads (
  note_id  UUID        NOT NULL REFERENCES handoff_notes(note_id) ON DELETE CASCADE,
  user_id  UUID        NOT NULL REFERENCES users(user_id)         ON DELETE CASCADE,
  read_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (note_id, user_id)
);


-- ── ROOM TYPES ────────────────────────────────────────────────────────────────

CREATE TABLE room_types (
  room_type_id SERIAL       PRIMARY KEY,
  name         VARCHAR(100) NOT NULL UNIQUE,
  total_count  INT          NOT NULL DEFAULT 0
);

INSERT INTO room_types (name, total_count) VALUES
  ('Standard', 0),
  ('Deluxe',   0),
  ('Suite',    0),
  ('King',     0);


-- ── FORECASTS ─────────────────────────────────────────────────────────────────
-- Daily room forecast per room type. surplus is auto-computed.

CREATE TABLE forecasts (
  forecast_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type_id      INT  NOT NULL REFERENCES room_types(room_type_id),
  forecast_date     DATE NOT NULL,
  available_rooms   INT  NOT NULL DEFAULT 0,
  expected_checkins INT  NOT NULL DEFAULT 0,
  surplus           INT  GENERATED ALWAYS AS (available_rooms - expected_checkins) STORED,
  source            VARCHAR(50) DEFAULT 'scraper',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_forecasts_date          ON forecasts(forecast_date DESC);
CREATE UNIQUE INDEX idx_forecasts_type_date ON forecasts(room_type_id, forecast_date);


-- ── AUDIT LOGS ────────────────────────────────────────────────────────────────
-- Immutable record of all privileged operations.

CREATE TABLE audit_logs (
  log_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID         REFERENCES users(user_id),
  action     VARCHAR(100) NOT NULL,
  table_name VARCHAR(100),
  record_id  UUID,
  old_data   JSONB,
  new_data   JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_actor   ON audit_logs(actor_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);


-- ── TRIGGERS: auto-update updated_at ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Sprint 10.3: trg_shift_notes_updated_at was removed alongside
-- the shift_notes table itself (migration 012). The equivalent
-- behavior for handoff_notes is set up by migration 011 via its
-- own handoff_notes_touch_updated_at function + trigger.
