-- Migration 015: soft-delete for users (Sprint 11.1.2)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/015_users_soft_delete.sql
--
-- Hard-deleting a user errored on the time_entries.user_id FK
-- constraint — every staff who's clocked in has historical
-- entries we can't legally drop (payroll, audit trail). Switching
-- to soft delete: deleted users get `deleted_at` stamped; the row
-- stays so FK references survive, but the UI hides them.
--
-- Same shape as the existing `active = false` deactivation, with
-- the deleted_at stamp making it permanent (and queryable as
-- "when did this user leave the org"). Soft-deleted users won't
-- come back through the "Include inactive staff" toggle.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Partial index on the not-deleted slice — the hot path (active
-- list, login lookup, schedule joins) all filter on deleted_at IS
-- NULL, so the partial index keeps lookups fast without storing
-- pointers to deleted rows.
CREATE INDEX IF NOT EXISTS idx_users_not_deleted
  ON users(user_id)
  WHERE deleted_at IS NULL;
