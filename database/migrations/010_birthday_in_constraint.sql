-- Migration 010: Birthday counts toward "at least one login identifier"
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/010_birthday_in_constraint.sql
--
-- Sprint 9.0 added birthday as a fourth login identifier but kept it
-- supplemental — birthday-only staff records were rejected by the
-- existing users_at_least_one_identifier CHECK. Sprint 9.1 (GM feedback)
-- treats all four identifier types as equal: a birthday alone is enough
-- to create a staff record. Drop and recreate the constraint to include
-- birthday.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_at_least_one_identifier;

ALTER TABLE users ADD CONSTRAINT users_at_least_one_identifier
  CHECK (
    phone_number  IS NOT NULL OR
    username      IS NOT NULL OR
    employee_code IS NOT NULL OR
    birthday      IS NOT NULL
  );
