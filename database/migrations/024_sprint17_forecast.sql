-- Sprint 17 — Front Desk room forecast backed by Agilysys rGuest Stay.
--
-- Drops the placeholder forecast/room_types model from the initial
-- schema (row-per-date with hardcoded "Standard/Deluxe/Suite/King"
-- seeds — never used) and replaces it with a snapshot-based model
-- driven by the rGuest API client added in this sprint.
--
-- Tables:
--   room_type_mapping   — Agilysys typeCode → display bucket + sub.
--   forecast_config     — singleton; cron schedules + labor constants.
--   forecast_snapshot   — one row per scrape run; JSONB payload + hash.

BEGIN;

DROP TABLE IF EXISTS forecasts   CASCADE;
DROP TABLE IF EXISTS room_types  CASCADE;


-- ── ROOM TYPE MAPPING ────────────────────────────────────
-- Maps Agilysys typeCode (e.g. "NKRRA") to a display bucket.
-- Rule: first 4 chars = base bucket (NKRR / NKJZ / NQRR / NQJZ);
-- trailing letters = sub-category (A=Accessible, P=Pets, D=Hearing
-- Accessible / ADA Tub, G=Hearing Accessible, B=Roll-In, etc.). New
-- codes seen during a scrape auto-insert with the parsed assignment.
-- Admin can override per-row (admin_override=TRUE pins the mapping).

CREATE TABLE room_type_mapping (
  type_code       VARCHAR(20)  PRIMARY KEY,                -- "NKRR", "NKRRA", "NQJZP", "ROH"
  type_name       VARCHAR(200) NOT NULL,                   -- Display name as it comes from rGuest config/roomTypes
  base_code       VARCHAR(10),                             -- 4-char base, or NULL for unmappable (e.g. "ROH")
  base_label      VARCHAR(100),                            -- "King Standard", "Double Queen Studio", …
  sub_suffix      VARCHAR(10)  NOT NULL DEFAULT '',        -- "A", "P", "D", "G", "B", "" for base type
  sub_label       VARCHAR(100) NOT NULL DEFAULT 'Standard',-- "Accessible", "Pets", "Hearing Accessible / ADA Tub", …
  admin_override  BOOLEAN      NOT NULL DEFAULT FALSE,     -- TRUE = scrape won't auto-rewrite the assignment
  first_seen_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Seed the 4 known base buckets so admin UIs render them even before
-- the first scrape lands. The scrape adds suffixed variants as it
-- discovers them.
INSERT INTO room_type_mapping (type_code, type_name, base_code, base_label, sub_suffix, sub_label) VALUES
  ('NKRR', 'King Standard',           'NKRR', 'King Standard',         '', 'Standard'),
  ('NKJZ', 'King Studio',             'NKJZ', 'King Studio',           '', 'Standard'),
  ('NQRR', 'Double Queen Standard',   'NQRR', 'Double Queen Standard', '', 'Standard'),
  ('NQJZ', 'Double Queen Studio',     'NQJZ', 'Double Queen Studio',   '', 'Standard');


-- ── FORECAST CONFIG ──────────────────────────────────────
-- Singleton row. Admin-editable from the Forecast Settings page.
-- A CHECK pins config_id = 1 so the table can hold at most one row.

CREATE TABLE forecast_config (
  config_id            INT          PRIMARY KEY DEFAULT 1 CHECK (config_id = 1),
  cron_schedules       JSONB        NOT NULL DEFAULT '["30 5 * * *", "0 11 * * *"]'::jsonb,
  cron_timezone        VARCHAR(64)  NOT NULL DEFAULT 'America/Los_Angeles',
  productivity_target  NUMERIC(5,2) NOT NULL DEFAULT 6.00, -- rooms one attendant cleans in a shift; KPI input only
  avg_min_per_clean    JSONB        NOT NULL DEFAULT
                       '{"NKRR": 28, "NKJZ": 26, "NQRR": 28, "NQJZ": 26, "STAYOVER": 15, "DEFAULT": 25}'::jsonb,
  dedup_window_minutes INT          NOT NULL DEFAULT 60,
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by           UUID         REFERENCES users(user_id)
);

INSERT INTO forecast_config (config_id) VALUES (1);


-- ── FORECAST SNAPSHOT ────────────────────────────────────
-- One row per scrape run. payload is the computed forecast
-- (per-room sheet, by-cleaning-type rollup, by-floor rollup,
-- arrivals/departures/stayovers totals, dispatch summary).
-- payload_hash is SHA256 of the normalized payload — the scrape
-- endpoint uses it to skip inserting duplicates within
-- forecast_config.dedup_window_minutes.

CREATE TABLE forecast_snapshot (
  snapshot_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  forecast_date      DATE         NOT NULL,                    -- the day this forecast covers (usually today)
  source             VARCHAR(20)  NOT NULL DEFAULT 'manual',   -- 'manual' | 'cron'
  triggered_by       UUID         REFERENCES users(user_id),   -- NULL for cron runs
  status             VARCHAR(20)  NOT NULL DEFAULT 'success',  -- 'success' | 'failed'
  records_processed  INT          NOT NULL DEFAULT 0,          -- rooms + reservations counted
  payload            JSONB        NOT NULL,                    -- full computed forecast
  payload_hash       CHAR(64)     NOT NULL,                    -- SHA256 hex of normalized payload
  logs               JSONB        NOT NULL DEFAULT '[]'::jsonb,-- structured per-step debug log
  error_message      TEXT,                                     -- populated when status='failed'
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_forecast_snapshot_date   ON forecast_snapshot(forecast_date DESC, scraped_at DESC);
CREATE INDEX idx_forecast_snapshot_hash   ON forecast_snapshot(payload_hash, scraped_at DESC);
CREATE INDEX idx_forecast_snapshot_status ON forecast_snapshot(status);

COMMIT;
