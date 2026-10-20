-- Migration 029: forecast-accuracy data (Sprint 22.3)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/029_sprint22_rollups.sql
--
-- The Forecast's "expected arrivals" = booked + a late-booking allowance. To check (and tune) that allowance against reality we keep,
-- for every day, what was BOOKED to arrive on a future date as of each morning, and later how many guests ACTUALLY arrived:
--   daily_rollups — captured by the daily reconcile: for each of the next 15 days × room-type group: bookings on the books that morning.
--   daily_actuals — filled by the next day's reconcile: guests that actually arrived (status INH/DPT) on that date per room-type group.
-- actual / booked at horizon k  =  the measured late-booking pickup at k days ahead (the number the allowance table estimates).
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS daily_rollups (
  property_id   TEXT         NOT NULL DEFAULT 'default',
  target_date   DATE         NOT NULL,
  base_code     TEXT         NOT NULL,
  horizon_days  INT          NOT NULL,           -- 0 = captured the morning of target_date, 1 = the day before, …
  booked        INT          NOT NULL,           -- reservations with status RES arriving on target_date, as of capture
  captured_on   DATE         NOT NULL,
  captured_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (property_id, target_date, base_code, horizon_days)
);
CREATE INDEX IF NOT EXISTS idx_daily_rollups_target ON daily_rollups(target_date DESC);

CREATE TABLE IF NOT EXISTS daily_actuals (
  property_id   TEXT         NOT NULL DEFAULT 'default',
  arrival_date  DATE         NOT NULL,
  base_code     TEXT         NOT NULL,
  arrivals      INT          NOT NULL,           -- guests that actually arrived (INH/DPT) on arrival_date
  captured_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (property_id, arrival_date, base_code)
);

COMMIT;
