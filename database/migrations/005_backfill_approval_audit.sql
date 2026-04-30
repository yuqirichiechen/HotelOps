-- Migration 005: Backfill approval_requests + audit_logs
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/005_backfill_approval_audit.sql
--
-- Both tables are part of schema.sql but were missing on the Koyeb
-- deployment — `relation "approval_requests" does not exist` was the
-- actual cause of /api/admin/dashboard returning 500 on production.
-- audit_logs is grouped here because it was likely missed at the same
-- time and the admin hour-override endpoint INSERTs into it.
--
-- All statements are idempotent — safe to run on a clean install too.

-- entry_status enum (defined in schema.sql; guard for partial installs)
DO $$
BEGIN
  CREATE TYPE entry_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- All manual time edits go through manager approval.
CREATE TABLE IF NOT EXISTS approval_requests (
  request_id    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      UUID         NOT NULL REFERENCES time_entries(entry_id),
  requested_by  UUID         NOT NULL REFERENCES users(user_id),
  approved_by   UUID         REFERENCES users(user_id),
  original_data JSONB,
  edited_data   JSONB        NOT NULL,
  reason        TEXT         NOT NULL,
  status        entry_status NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  resolved_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_approval_requests_status ON approval_requests(status);

-- Immutable record of all privileged operations (admin overrides etc.).
-- actor_id may be NULL for admin actions — admins live in admins.json,
-- not the users table; the admin username is stored in new_data instead.
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID         REFERENCES users(user_id),
  action     VARCHAR(100) NOT NULL,
  table_name VARCHAR(100),
  record_id  UUID,
  old_data   JSONB,
  new_data   JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor   ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
