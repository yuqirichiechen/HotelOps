-- Migration 016: partial unique identifiers (Sprint 11.1.3)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/016_users_partial_unique_identifiers.sql
--
-- After Sprint 11.1.2 introduced soft-delete, the deleted row keeps
-- its phone_number / email / username / employee_code values — and
-- those columns enforce uniqueness — so onboarding a new staff
-- member who reused a departed colleague's phone or PIN hit
-- "phone already exists". Payroll still needs the historical row;
-- we can't null the identifiers out.
--
-- Convert all four uniqueness constraints to partial unique
-- indexes filtered on `deleted_at IS NULL`. Live users still can't
-- collide; soft-deleted rows fall outside the index entirely, so
-- their identifiers are free for the next person while the row
-- itself stays put for FK references (time_entries, etc.).

-- Drop the column-level UNIQUE constraints. Postgres auto-names
-- them `<table>_<column>_key`; IF EXISTS keeps the migration
-- idempotent in case a re-run hits an already-converted schema.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_number_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;

-- Drop the existing partial unique indexes — they filter on
-- IS NOT NULL but not on the soft-delete state.
DROP INDEX IF EXISTS idx_users_username_lower;
DROP INDEX IF EXISTS idx_users_employee_code;

-- Recreate all four as partial unique indexes scoped to the live
-- (non-deleted) slice. NULLs are also excluded so multiple staff
-- can legitimately have no phone / no email / etc.
CREATE UNIQUE INDEX idx_users_phone_number_live
  ON users (phone_number)
  WHERE phone_number IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_users_email_live
  ON users (email)
  WHERE email IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_users_username_lower
  ON users (LOWER(username))
  WHERE username IS NOT NULL AND deleted_at IS NULL;

CREATE UNIQUE INDEX idx_users_employee_code
  ON users (employee_code)
  WHERE employee_code IS NOT NULL AND deleted_at IS NULL;
