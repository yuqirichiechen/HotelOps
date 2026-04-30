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
--   shift_notes       — role-filtered shift handoff communications
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
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

INSERT INTO departments (name) VALUES
  ('Front Desk'),
  ('Housekeeping'),
  ('Maintenance'),
  ('Food & Beverage'),
  ('Management');


-- ── USERS ─────────────────────────────────────────────────────────────────────
-- Covers all staff roles. Phone number is the clock-in identifier.

CREATE TABLE users (
  user_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number     VARCHAR(10)  NOT NULL UNIQUE,
  name             VARCHAR(200) NOT NULL,
  email            VARCHAR(255) UNIQUE,
  role             user_role    NOT NULL DEFAULT 'employee',
  department_id    INT          REFERENCES departments(department_id),
  hire_date        DATE         NOT NULL DEFAULT CURRENT_DATE,
  base_hourly_rate NUMERIC(6,2),
  active           BOOLEAN      NOT NULL DEFAULT TRUE,
  pin_hash         TEXT,                            -- bcrypt; NULL = no PIN set
  pin_required     BOOLEAN      NOT NULL DEFAULT FALSE,  -- admin-controlled
  pin_must_set     BOOLEAN      NOT NULL DEFAULT FALSE,  -- forces set-PIN interstitial after admin reset
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_phone      ON users(phone_number);
CREATE INDEX idx_users_role       ON users(role);
CREATE INDEX idx_users_department ON users(department_id);


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


-- ── SHIFT NOTES ───────────────────────────────────────────────────────────────
-- Shift handoff communications with role-based visibility.
-- visible_to NULL = visible to all roles.

CREATE TABLE shift_notes (
  note_id       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     UUID         NOT NULL REFERENCES users(user_id),
  department_id INT          REFERENCES departments(department_id),
  title         VARCHAR(255) NOT NULL,
  body          TEXT         NOT NULL,
  visible_to    user_role[],
  notify_at     TIMESTAMPTZ,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_shift_notes_department ON shift_notes(department_id);
CREATE INDEX idx_shift_notes_created    ON shift_notes(created_at DESC);


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

CREATE TRIGGER trg_shift_notes_updated_at
  BEFORE UPDATE ON shift_notes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
