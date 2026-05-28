-- Migration 021: last_published_at on schedule_sheet_cells (Sprint 15.4)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/021_schedule_sheet_cells_last_published_at.sql

-- Sprint 15.4: timestamp of the last publish flip per cell. Backs
-- the "Unpublished Changes" count in the right-rail Week Overview
-- — a cell is considered "modified after publish" when
-- `updated_at > last_published_at`. Without this column we'd have
-- no reliable way to distinguish "edited since publish" from
-- "edited and never published."
--
-- Backfill: for cells that are currently published (is_published =
-- TRUE), seed last_published_at to updated_at so the count starts
-- at zero for the current state of the world (no false-positive
-- "unpublished changes" on a freshly-migrated DB).

ALTER TABLE schedule_sheet_cells
  ADD COLUMN IF NOT EXISTS last_published_at TIMESTAMPTZ;

UPDATE schedule_sheet_cells
   SET last_published_at = updated_at
 WHERE is_published = TRUE
   AND last_published_at IS NULL;
