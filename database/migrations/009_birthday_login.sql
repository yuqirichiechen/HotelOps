-- Migration 009: Birthday as a fourth login identifier (Sprint 9)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/009_birthday_login.sql
--
-- Adds `birthday` to the users table. Unlike phone_number / username /
-- employee_code, birthday is *not* unique — two staff members can share a
-- birthday legitimately. Login attempts that match more than one active
-- user fall through to a "specify another identifier" message (see
-- server.js's staff/login handler). Admin UI warns when adding/editing a
-- birthday that already exists in the system.
--
-- Birthday is stored as DATE for sane comparisons and range queries.
-- Format on input from the staff login keypad is 8 digits MMDDYYYY,
-- normalized to a YYYY-MM-DD ISO string by the server's classifier
-- before lookup.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS birthday DATE;

CREATE INDEX IF NOT EXISTS idx_users_birthday ON users(birthday) WHERE birthday IS NOT NULL;
