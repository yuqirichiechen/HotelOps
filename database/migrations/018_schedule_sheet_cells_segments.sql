-- Migration 018: parsed_segments on schedule_sheet_cells (Sprint 14.3)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/018_schedule_sheet_cells_segments.sql

-- Sprint 14.3: split-shift support. A single cell can now hold
-- multiple time ranges ("9-12 / 4-8" = [{start:09:00, end:12:00},
-- {start:16:00, end:20:00}]). `parsed_start` and `parsed_end` are
-- kept as the first segment's start and the last segment's end,
-- respectively, so existing queries that scope a cell to a single
-- range (e.g. the calendar overlay's bar-positioning math) still
-- work without changes. The full segment array lives in
-- `parsed_segments`; clients that want to render every range read
-- from there.

ALTER TABLE schedule_sheet_cells
  ADD COLUMN IF NOT EXISTS parsed_segments JSONB;

-- Backfill: existing rows have a single (parsed_start, parsed_end)
-- pair. Translate that into a one-element segments array so the new
-- column is non-null for any cell that was parseable before this
-- migration ran.
UPDATE schedule_sheet_cells
   SET parsed_segments = jsonb_build_array(
         jsonb_build_object(
           'start', to_char(parsed_start, 'HH24:MI:SS'),
           'end',   to_char(parsed_end,   'HH24:MI:SS')
         )
       )
 WHERE parsed_segments IS NULL
   AND parsed_start IS NOT NULL
   AND parsed_end   IS NOT NULL;
