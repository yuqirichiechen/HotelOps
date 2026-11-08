-- Migration 033: Log Book 26.1 — rich-text descriptions, "who edited it / when", notes sent to specific front-desk staff + their read state
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/033_sprint26_1_logbook_rich_notify.sql   (AFTER 032, BEFORE deploying Sprint 26.1)
--
--   body_rich    — the formatted description as a small, validated JSON document (lines of styled text runs: bold / italic / underline / strike / colours).
--                  It is never HTML: the pages draw it with React elements, so nothing in it can run. `body` keeps the plain-text version (search, fallbacks).
--   recipients   — optional: front-desk staff the note is addressed to. They get a notification badge on the Logbook until they have looked at it.
--   logbook_reads — who has seen a note addressed to them (one row per note + person).
--   modified_at / modified_by — set when someone other than dev edits a note that was already published ("Edited by … at …"). Dev edits leave them alone.
-- Idempotent.

BEGIN;

ALTER TABLE logbook_notes
  ADD COLUMN IF NOT EXISTS body_rich   JSONB,
  ADD COLUMN IF NOT EXISTS recipients  UUID[]      NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS modified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS modified_by TEXT;

CREATE TABLE IF NOT EXISTS logbook_reads (
  note_id  UUID        NOT NULL REFERENCES logbook_notes(note_id) ON DELETE CASCADE,
  user_id  UUID        NOT NULL,
  read_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (note_id, user_id)
);

COMMIT;
