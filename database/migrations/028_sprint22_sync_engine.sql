-- Migration 028: auto-sync engine (Sprint 22)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/028_sprint22_sync_engine.sql
--
-- The reservation mirror is the existing `reservation_history` table (Sprint 18.5: one row per reservation, upserted by
-- id, never deleted). This migration makes it the source of truth the incremental sync maintains:
--   * extra typed columns: fingerprint (change detection), gone_at/gone_reason (cancelled / arrived / not found —
--     rows are NEVER deleted), pms_created_at + booked_by (from the reservation detail), raw (last raw rGuest list row),
--     property_id (multi-property groundwork — one value today).
--   * reservation_events — change feed: new / changed / arrived / departed / cancelled / no_show / gone / reappeared.
--   * sync_runs          — one row per sync run: kind, counts, duration, errors (the dev-settings "sync health" panel).
--   * sync_state         — one row per property: slice counts for the hourly count-gate, backfill cursor, last-run times.
-- Idempotent (IF NOT EXISTS everywhere) so it is safe to re-run.

BEGIN;

ALTER TABLE reservation_history
  ADD COLUMN IF NOT EXISTS property_id      TEXT        NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS fingerprint      CHAR(64),
  ADD COLUMN IF NOT EXISTS rate_plan_code   TEXT,
  ADD COLUMN IF NOT EXISTS pms_created_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS booked_by        TEXT,
  ADD COLUMN IF NOT EXISTS last_changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS gone_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gone_reason      TEXT,
  ADD COLUMN IF NOT EXISTS raw              JSONB;

-- Names/labels from rGuest are not guaranteed to fit the old VARCHAR limits.
ALTER TABLE reservation_history
  ALTER COLUMN source       TYPE TEXT,
  ALTER COLUMN base_label   TYPE TEXT,
  ALTER COLUMN sub_label    TYPE TEXT,
  ALTER COLUMN vip_label    TYPE TEXT,
  ALTER COLUMN guest_name   TYPE TEXT,
  ALTER COLUMN type_code    TYPE TEXT,
  ALTER COLUMN status_label TYPE TEXT;

CREATE INDEX IF NOT EXISTS idx_reservation_history_departure ON reservation_history(departure_date);
CREATE INDEX IF NOT EXISTS idx_reservation_history_created   ON reservation_history(pms_created_at DESC) WHERE pms_created_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reservation_history_gone      ON reservation_history(gone_at DESC) WHERE gone_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS reservation_events (
  event_id        BIGSERIAL    PRIMARY KEY,
  property_id     TEXT         NOT NULL DEFAULT 'default',
  reservation_id  UUID         NOT NULL,
  event_type      TEXT         NOT NULL,   -- new | changed | arrived | departed | cancelled | no_show | moved | gone | reappeared
  occurred_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),   -- when the sync OBSERVED it (rGuest has no change timestamps on list rows)
  changes         JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- { field: [old, new] }
  info            JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- confirmation_id, type_code, arrival/departure, booked_by … (no guest PII)
  run_id          UUID
);
CREATE INDEX IF NOT EXISTS idx_reservation_events_time ON reservation_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_events_res  ON reservation_events(reservation_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS sync_runs (
  run_id       UUID         PRIMARY KEY,
  property_id  TEXT         NOT NULL DEFAULT 'default',
  kind         TEXT         NOT NULL,       -- frequent | hourly | reconcile | backfill | full
  trigger      TEXT         NOT NULL,       -- tick | manual | startup
  status       TEXT         NOT NULL,       -- success | partial | failed | skipped
  started_at   TIMESTAMPTZ  NOT NULL,
  finished_at  TIMESTAMPTZ,
  duration_ms  INT,
  calls        INT          NOT NULL DEFAULT 0,
  fetched      INT          NOT NULL DEFAULT 0,
  new_count    INT          NOT NULL DEFAULT 0,
  changed      INT          NOT NULL DEFAULT 0,
  gone         INT          NOT NULL DEFAULT 0,
  unchanged    INT          NOT NULL DEFAULT 0,
  complete     BOOLEAN      NOT NULL DEFAULT TRUE,   -- FALSE: some slice could not be fetched exactly → "gone" detection was skipped for it
  error        TEXT,
  details      JSONB        NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started ON sync_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS sync_state (
  property_id        TEXT         PRIMARY KEY,
  initialized        BOOLEAN      NOT NULL DEFAULT FALSE,   -- first full backfill of the forward window finished → "new" events start
  slice_counts       JSONB        NOT NULL DEFAULT '{}'::jsonb,   -- { "2026-10-12": 299, … } RES totals per 30-day slice (hourly count-gate)
  backfill           JSONB        NOT NULL DEFAULT '{}'::jsonb,   -- { from, to, cursor, done, chunks }
  last_frequent_at   TIMESTAMPTZ,
  last_hourly_at     TIMESTAMPTZ,
  last_reconcile_at  TIMESTAMPTZ,
  last_full_at       TIMESTAMPTZ,
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

COMMIT;
