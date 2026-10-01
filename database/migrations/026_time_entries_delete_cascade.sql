-- Migration 026: let time_entries rows be deleted (Sprint 19.3)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/026_time_entries_delete_cascade.sql

-- Sprint 19.3: admins can now delete a whole time entry from
-- StaffDetail → Override Hours → Delete
-- (DELETE /api/admin/time-entries/:id). The only table with a foreign
-- key into time_entries is approval_requests, and that FK was created
-- without ON DELETE behaviour, so any approval_requests row pointing at
-- an entry would block the delete (error 23503). The server already
-- removes those rows itself inside the delete transaction; this
-- migration makes the database enforce the same rule so the delete can
-- never be blocked by (or leave orphans from) a future code path.
--
-- Safe to re-run: the FK is looked up by what it references (not by
-- name) and recreated as ON DELETE CASCADE. The delete endpoint writes
-- the full original row to audit_logs.old_data before removing it, so
-- nothing is lost silently.

BEGIN;

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT c.conname INTO fk_name
    FROM pg_constraint c
   WHERE c.contype   = 'f'
     AND c.conrelid  = 'approval_requests'::regclass
     AND c.confrelid = 'time_entries'::regclass;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE approval_requests DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE approval_requests
  ADD CONSTRAINT approval_requests_entry_id_fkey
  FOREIGN KEY (entry_id) REFERENCES time_entries(entry_id) ON DELETE CASCADE;

COMMIT;
