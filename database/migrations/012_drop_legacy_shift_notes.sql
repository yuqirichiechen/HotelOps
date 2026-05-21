-- Migration 012: drop the legacy shift_notes table
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/012_drop_legacy_shift_notes.sql
--
-- Sprint 10.3: closes out the Calendar consolidation series. The
-- old `shift_notes` table (created in schema.sql, never had a
-- server endpoint serving it — verified with a grep before this
-- migration was written) is being replaced by `handoff_notes`
-- (migration 011). No row migration is needed because the old
-- table never had a write path from the app; any rows present in
-- a particular deployment would be hand-seeded test data and are
-- safe to drop. If a future audit reveals real rows, restore from
-- backup and run a one-shot copy into handoff_notes — see the
-- shape mapping below for reference.
--
-- shift_notes shape (legacy):
--   note_id UUID, author_id UUID, department_id INT, title VARCHAR,
--   body TEXT, visible_to user_role[], notify_at TIMESTAMPTZ,
--   created_at, updated_at
--
-- handoff_notes shape (current):
--   note_id, author_user_id, body, scope, schedule_id,
--   department_id, for_date, carry_until, pinned_at, resolved_at,
--   created_at, updated_at
--
-- Equivalent insert if anyone needs to migrate rows post-hoc:
--   INSERT INTO handoff_notes
--     (note_id, author_user_id, body, scope, department_id, for_date)
--   SELECT
--     note_id, author_id,
--     COALESCE(title || E'\n\n', '') || body,
--     CASE WHEN department_id IS NULL THEN 'all' ELSE 'department' END,
--     department_id,
--     created_at::date
--   FROM shift_notes;

DROP TRIGGER IF EXISTS trg_shift_notes_updated_at ON shift_notes;
DROP INDEX  IF EXISTS idx_shift_notes_department;
DROP INDEX  IF EXISTS idx_shift_notes_created;
DROP TABLE  IF EXISTS shift_notes;
