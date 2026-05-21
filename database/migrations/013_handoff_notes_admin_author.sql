-- Migration 013: allow admin-authored handoff notes
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/013_handoff_notes_admin_author.sql
--
-- Sprint 10.4: admin tokens carry their username in `req.auth.sub`
-- (not a UUID — admin creds live in server/config/admins.json,
-- not in the users table). So when an admin authored a handoff
-- note, the INSERT into handoff_notes(author_user_id=UUID NOT NULL
-- REFERENCES users) blew up because there was no matching user row
-- and the cast from 'admin' string to UUID failed.
--
-- Pattern matches the existing audit_logs convention (Sprint 5+):
-- admin actions store `actor_id = NULL` and the admin's username
-- goes into a denormalized column. Here we do the same: nullable
-- `author_user_id` plus a new `author_label` text column that
-- holds the displayable author name when the FK is null.
--
-- Read path: COALESCE(u.name, n.author_label, 'Unknown') gives
-- the author name without per-row branching in client code.

ALTER TABLE handoff_notes
  ALTER COLUMN author_user_id DROP NOT NULL;

ALTER TABLE handoff_notes
  ADD COLUMN IF NOT EXISTS author_label TEXT;

-- Sanity: if neither path is available, the row's unauthored —
-- shouldn't ever happen with the new endpoints but guard against
-- a stray INSERT skipping both fields.
ALTER TABLE handoff_notes
  ADD CONSTRAINT handoff_notes_author_required
  CHECK (author_user_id IS NOT NULL OR author_label IS NOT NULL);
