-- Migration 011: handoff_notes + handoff_note_reads
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/011_handoff_notes.sql
--
-- Sprint 10: introduce the single first-class entity that drives the
-- Calendar surface's three note views (per-shift threads, general
-- department/all-staff handoffs, and cross-day carryovers — added in
-- Sprint 10.1+). One table, three views via filtering on `scope` +
-- `for_date` + `carry_until`.
--
-- Naming notes:
--   - We use `schedule_id` (not `shift_id`) because notes attach to a
--     specific date-bound assignment (`schedules`), not a shift
--     template (`shifts`). The plan in claude-instructions/part2.md
--     used "shift_id" colloquially; this migration is the source of
--     truth on the column name.
--   - `for_date` is denormalized from schedules.scheduled_date for
--     fast date-range queries that don't need to join. Set on insert.
--   - `carry_until` is the sole signal for cross-day visibility.
--     Sprint 10.1 wires the UI to set/clear it; this migration just
--     creates the column + index.
--
-- The legacy `shift_notes` table (created in schema.sql) is left in
-- place for one sprint cycle so any old client polling it doesn't
-- 500. Sprint 10.3 will fold its rows into handoff_notes and drop
-- the table.

CREATE TABLE IF NOT EXISTS handoff_notes (
  note_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  author_user_id   UUID         NOT NULL REFERENCES users(user_id),
  body             TEXT         NOT NULL,

  -- Scope drives which Calendar view the note appears in. Mutually
  -- exclusive: a note attaches to a *specific schedule*, a
  -- *department on a date*, or *all staff on a date*. The CHECK
  -- below enforces the corresponding FK shape so we never end up
  -- with a 'shift'-scoped note that has no schedule_id, etc.
  scope            VARCHAR(16)  NOT NULL CHECK (scope IN ('shift', 'department', 'all')),
  schedule_id      UUID         REFERENCES schedules(schedule_id)    ON DELETE CASCADE,
  department_id    INT          REFERENCES departments(department_id) ON DELETE SET NULL,

  -- The date the note applies to. For 'shift' scope this mirrors the
  -- schedule's scheduled_date (denormalized at insert time); for
  -- 'department' / 'all' it's caller-supplied.
  for_date         DATE         NOT NULL,

  -- Cross-day carry. NULL = single-day note. When set, the note
  -- appears in the carryover view for every date in
  -- [for_date, carry_until]. Sprint 10.1 UX wires this.
  carry_until      DATE,

  -- Sprint 10.2 will surface pin / resolve UX; columns added now so
  -- the schema is stable from sprint 1 of the series.
  pinned_at        TIMESTAMPTZ,
  resolved_at      TIMESTAMPTZ,

  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  CONSTRAINT handoff_notes_scope_shape CHECK (
    (scope = 'shift'      AND schedule_id IS NOT NULL) OR
    (scope = 'department' AND department_id IS NOT NULL AND schedule_id IS NULL) OR
    (scope = 'all'        AND schedule_id IS NULL AND department_id IS NULL)
  )
);

-- Date-range queries are the most common access path (Day view,
-- Week view counts endpoint coming in 10.1). Index covers them.
CREATE INDEX IF NOT EXISTS idx_handoff_notes_for_date
  ON handoff_notes(for_date);

-- Drawer filtering by department + date.
CREATE INDEX IF NOT EXISTS idx_handoff_notes_department_for_date
  ON handoff_notes(department_id, for_date);

-- Shift-attached threads — when a schedule row is selected, pull
-- its notes directly.
CREATE INDEX IF NOT EXISTS idx_handoff_notes_schedule
  ON handoff_notes(schedule_id);

-- Partial index for "what's still carrying?" — most notes have
-- carry_until NULL so a partial index keeps the index tiny.
CREATE INDEX IF NOT EXISTS idx_handoff_notes_carry_until
  ON handoff_notes(carry_until)
  WHERE carry_until IS NOT NULL;


-- Per-user read tracking. Composite PK lets us upsert efficiently
-- via ON CONFLICT DO NOTHING when marking a batch as read.
CREATE TABLE IF NOT EXISTS handoff_note_reads (
  note_id  UUID        NOT NULL REFERENCES handoff_notes(note_id) ON DELETE CASCADE,
  user_id  UUID        NOT NULL REFERENCES users(user_id)         ON DELETE CASCADE,
  read_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (note_id, user_id)
);

-- "Show me my unread notes" — join handoff_notes LEFT JOIN reads on
-- (note_id, user_id) and filter where reads.note_id IS NULL.
-- Composite PK above already supports this.

-- updated_at trigger so PATCH endpoints don't have to set it
-- manually. Convention used elsewhere in this DB (search schema.sql
-- for similar triggers if any exist).
CREATE OR REPLACE FUNCTION handoff_notes_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_handoff_notes_updated_at ON handoff_notes;
CREATE TRIGGER trg_handoff_notes_updated_at
  BEFORE UPDATE ON handoff_notes
  FOR EACH ROW EXECUTE FUNCTION handoff_notes_touch_updated_at();
