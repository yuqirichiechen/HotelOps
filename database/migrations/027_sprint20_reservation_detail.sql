-- Migration 027: stored per-reservation detail + deep-fetch job log (Sprint 20.2)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/027_sprint20_reservation_detail.sql

-- Sprint 20.2: the Reservations page used to fetch a reservation's guest
-- detail LIVE from rGuest when a card was tapped. If the reservation had
-- changed (moved, cancelled, merged) since the list snapshot, that call
-- failed and the user saw an error. Now a background job fetches the full
-- detail of every reservation in the snapshot right after the list scrape
-- and stores it here; the UI only ever reads this table.
--
--   reservation_detail — one row per reservation: the RAW per-section
--     rGuest data (admin-only; includes contact info, folio, masked card
--     metadata), a compact `summary` for cards, per-section fetch status,
--     and provenance (fetched_at, list_fingerprint, remote_state).
--   scrape_job — one row per deep-fetch run (progress + heartbeat) so the
--     UI can show "details 37/127" and a crashed run can be detected.

BEGIN;

CREATE TABLE IF NOT EXISTS reservation_detail (
  reservation_id    UUID         PRIMARY KEY,
  confirmation_id   VARCHAR(40),
  remote_state      VARCHAR(12)  NOT NULL DEFAULT 'ok',      -- 'ok' | 'gone' (404 in rGuest: cancelled/merged/purged)
  list_fingerprint  CHAR(64),                                -- sha256 of the list-level fields when fetched; a change triggers a re-fetch
  detail            JSONB        NOT NULL DEFAULT '{}'::jsonb, -- raw sections: reservation, profile, comments, folios, …
  summary           JSONB        NOT NULL DEFAULT '{}'::jsonb, -- compact card fields derived from `detail`
  sections          JSONB        NOT NULL DEFAULT '{}'::jsonb, -- { sectionName: { ok, at, status?, error?, staleSince? } }
  first_fetched_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  fetched_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),     -- last time the core reservation was fetched successfully
  last_attempt_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  attempts          INT          NOT NULL DEFAULT 1,
  last_error        TEXT
);

CREATE INDEX IF NOT EXISTS idx_reservation_detail_fetched ON reservation_detail(fetched_at DESC);

CREATE TABLE IF NOT EXISTS scrape_job (
  job_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kind          VARCHAR(20)  NOT NULL DEFAULT 'detail',
  snapshot_id   UUID         REFERENCES forecast_snapshot(snapshot_id) ON DELETE SET NULL,
  status        VARCHAR(20)  NOT NULL DEFAULT 'running',     -- running | success | partial | failed | interrupted
  total         INT          NOT NULL DEFAULT 0,             -- reservations that needed (re)fetching
  skipped       INT          NOT NULL DEFAULT 0,             -- fresh enough, left alone
  done          INT          NOT NULL DEFAULT 0,
  failed        INT          NOT NULL DEFAULT 0,
  gone          INT          NOT NULL DEFAULT 0,
  error         TEXT,
  options       JSONB        NOT NULL DEFAULT '{}'::jsonb,
  started_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  heartbeat_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_scrape_job_started ON scrape_job(started_at DESC);

COMMIT;
