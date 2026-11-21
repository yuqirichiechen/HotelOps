-- Migration 037: Sprint 29.5 — lets the Log Book remember which notes came from the one-time Excel import ("Shift notes for 2026.xlsx").
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/037_sprint29_5_logbook_import.sql   (AFTER 033; BEFORE running server/scripts/import-shift-notes.js --commit)
--
--   import_key    where the note came from ("Jan 2026!R12:note"). Unique per property, so running the import twice can never create a duplicate.
--   import_batch  a name for one import run ("shiftnotes-2026-xlsx"), so a whole import can be undone with  import-shift-notes.js --undo <batch> --commit.
-- Additive only: nothing existing changes; notes written in the app have both columns empty. Idempotent, one transaction.

BEGIN;

ALTER TABLE logbook_notes
  ADD COLUMN IF NOT EXISTS import_key   TEXT,
  ADD COLUMN IF NOT EXISTS import_batch TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS uq_logbook_import_key   ON logbook_notes (property_id, import_key) WHERE import_key IS NOT NULL;
CREATE INDEX        IF NOT EXISTS idx_logbook_import_batch ON logbook_notes (import_batch)            WHERE import_batch IS NOT NULL;

COMMIT;
