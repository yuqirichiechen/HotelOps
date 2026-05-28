-- Migration 020: notes on schedule_sheet_cells (Sprint 15.3)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/020_schedule_sheet_cells_notes.sql

-- Sprint 15.3: per-cell free-form notes. Backs the textarea inside
-- the Edit Shift popover. Surfaced on the calendar planned-shift
-- overlay via the hover title attribute. NULL = no note.

ALTER TABLE schedule_sheet_cells
  ADD COLUMN IF NOT EXISTS notes TEXT;
