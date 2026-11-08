-- Migration 032: the Log Book (Sprint 26) — dated notes with a priority, a time span, an audience and a lifecycle (draft / published / archived)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/032_sprint26_logbook.sql   (BEFORE deploying Sprint 26)
--
-- Replaces the Sprint 10–12 prototype (handoff_notes drives the old Admin "Logbook" page + the staff Calendar notes). Those tables are NOT touched
-- or migrated (the user called them a prototype); this is a new table the new pages use.
--   · dates / times are the hotel's local wall-clock (DATE + TIME, no time zone): a note "8:00 AM – 11:00 AM on Nov 20" is that, wherever the server runs.
--     start_time / end_time NULL = all day. A note covers every day from start_date to end_date.
--   · audience: everybody (audience_all) OR a list of departments and/or individual staff. Stored now; the staff side that enforces it, and the
--     acknowledgement ("require_ack") screens, come in a later sprint.
--   · scoped by property_id (same key as hk_plans: env SYNC_PROPERTY_KEY, default 'default') so a second hotel never sees these.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS logbook_notes (
  note_id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id          TEXT         NOT NULL DEFAULT 'default',
  title                VARCHAR(120) NOT NULL,
  body                 TEXT         NOT NULL DEFAULT '',
  priority             VARCHAR(8)   NOT NULL DEFAULT 'general' CHECK (priority IN ('high', 'medium', 'general')),
  start_date           DATE         NOT NULL,
  start_time           TIME,
  end_date             DATE         NOT NULL,
  end_time             TIME,
  audience_all         BOOLEAN      NOT NULL DEFAULT TRUE,
  audience_departments INT[]        NOT NULL DEFAULT '{}',
  audience_staff       UUID[]       NOT NULL DEFAULT '{}',
  show_on_calendar     BOOLEAN      NOT NULL DEFAULT TRUE,
  require_ack          BOOLEAN      NOT NULL DEFAULT FALSE,
  pinned               BOOLEAN      NOT NULL DEFAULT FALSE,
  status               VARCHAR(10)  NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published', 'archived')),
  author_user_id       UUID,
  author_label         TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  published_at         TIMESTAMPTZ,
  archived_at          TIMESTAMPTZ,
  CONSTRAINT logbook_notes_dates_ok CHECK (end_date >= start_date)
);

-- "which notes touch these days": the month grid, the day page and the list all ask this
CREATE INDEX IF NOT EXISTS logbook_notes_range_idx ON logbook_notes (property_id, start_date, end_date);

COMMIT;
