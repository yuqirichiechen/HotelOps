-- Migration 017: schedule_sheet_cells (Sprint 14)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/017_schedule_sheet_cells.sql
--
-- New "Shift Sheet" surface — Excel-style weekly grid the GM uses
-- to plan shifts. Each cell carries the free-form text the GM types
-- ("3p-11p", "OFF", "BRK+help") plus, when parseable, structured
-- start/end times. Sprint 14 ships the sheet as a draft; Sprint
-- 14.x will add a "publish" step that surfaces approved cells as
-- a planned-shift overlay on the existing calendar (alongside the
-- actual clock-entry view — not replacing it).
--
-- One row per (week_start, user_id, day_of_week). Splits (two
-- shifts in one day) get folded into the display_text for now —
-- "9-12 / 4-8" — and parsed_start/end stay null in that case.
-- Worth revisiting if the GM hits that pattern often.

CREATE TABLE schedule_sheet_cells (
  cell_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Monday of the week, in the GM's local timezone. Stored as a
  -- DATE so range queries stay simple; the client converts before
  -- sending so server-tz drift doesn't matter (Sprint 13.4 lesson).
  week_start     DATE         NOT NULL,
  user_id        UUID         NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  day_of_week    SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- Mon=0..Sun=6
  display_text   TEXT         NOT NULL,
  -- Parsed time bounds. Optional — only filled when the cell text
  -- matches the common patterns the parser recognizes ("3p-11p",
  -- "9-5", "11p-7a", "7a-3p", etc.). Free-form notes like "Deep clea"
  -- or "BRK+help" leave both null.
  parsed_start   TIME,
  parsed_end     TIME,
  -- Sprint 14.x: admin-approved cells go on the calendar overlay.
  -- Default draft so generating a sheet doesn't auto-publish.
  is_published   BOOLEAN      NOT NULL DEFAULT FALSE,
  -- Yellow-highlight flag (matches the GM's existing Excel
  -- convention — "BRK+help", "Deep clea" rows get marked).
  highlight      BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- At most one cell per (week, user, day). Upserts target this
  -- constraint so retyping the cell text overwrites in place.
  CONSTRAINT schedule_sheet_cells_unique UNIQUE (week_start, user_id, day_of_week)
);

CREATE INDEX idx_sheet_cells_week ON schedule_sheet_cells(week_start);
CREATE INDEX idx_sheet_cells_user ON schedule_sheet_cells(user_id);
-- Hot path for "what's published in this date range" — calendar
-- overlay query in Sprint 14.x will scan this.
CREATE INDEX idx_sheet_cells_published_week
  ON schedule_sheet_cells(week_start)
  WHERE is_published = TRUE;
