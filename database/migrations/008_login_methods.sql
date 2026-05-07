-- Migration 008: Multi-identifier login (Sprint 7)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/008_login_methods.sql
--
-- Staff can now log in via any one of {phone_number, username, employee_code}.
-- Phone is no longer required at the DB level — a staff record may be created
-- with only a username, only an employee_code, or any combination. A CHECK
-- constraint enforces that every row has at least one identifier so a row
-- can never be inserted that nobody can log in as.
--
-- Format rules (also enforced in the app for friendlier errors):
--   - phone_number  : 10 digits (existing VARCHAR(10) UNIQUE constraint)
--   - employee_code : 4–6 digits, stored as text so leading zeros are preserved
--   - username      : 3–16 chars from [A-Za-z0-9._-], must contain at least one
--                     letter (so an all-digit username can't shadow an
--                     employee_code at login auto-detect time), case-insensitive
--                     uniqueness via LOWER() functional index.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS username      TEXT,
  ADD COLUMN IF NOT EXISTS employee_code TEXT;

-- Drop NOT NULL on phone_number so staff can be created without one. UNIQUE
-- constraint stays — duplicate phones are still rejected.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'phone_number' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE users ALTER COLUMN phone_number DROP NOT NULL;
  END IF;
END $$;

-- Case-insensitive unique index on username (partial — NULLs don't collide).
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower
  ON users (LOWER(username))
  WHERE username IS NOT NULL;

-- Unique index on employee_code.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_employee_code
  ON users (employee_code)
  WHERE employee_code IS NOT NULL;

-- At least one identifier required per row.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_at_least_one_identifier'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_at_least_one_identifier
      CHECK (
        phone_number  IS NOT NULL OR
        username      IS NOT NULL OR
        employee_code IS NOT NULL
      );
  END IF;
END $$;

-- employee_code format: 4–6 digits.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_employee_code_format'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_employee_code_format
      CHECK (employee_code IS NULL OR employee_code ~ '^[0-9]{4,6}$');
  END IF;
END $$;

-- username format: 3–16 chars from [A-Za-z0-9._-], must contain a letter.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_format'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_username_format
      CHECK (
        username IS NULL OR (
          username ~ '^[A-Za-z0-9._-]{3,16}$' AND
          username ~ '[A-Za-z]'
        )
      );
  END IF;
END $$;
