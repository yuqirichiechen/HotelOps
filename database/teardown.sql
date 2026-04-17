-- =============================================================================
-- HotelOps Database Teardown
-- Drops everything created by schema.sql in reverse dependency order.
--
-- WARNING: This permanently deletes all data.
-- Run this only if you intend to fully rebuild the schema.
--
-- Usage:
--   psql "<connection-string>?sslmode=require" -f database/teardown.sql
--   psql "<connection-string>?sslmode=require" -f database/schema.sql
-- =============================================================================

-- Triggers
DROP TRIGGER IF EXISTS trg_shift_notes_updated_at ON shift_notes;
DROP TRIGGER IF EXISTS trg_users_updated_at        ON users;
DROP FUNCTION IF EXISTS set_updated_at();

-- Tables (leaf → root to respect foreign keys)
DROP TABLE IF EXISTS audit_logs        CASCADE;
DROP TABLE IF EXISTS forecasts         CASCADE;
DROP TABLE IF EXISTS room_types        CASCADE;
DROP TABLE IF EXISTS shift_notes       CASCADE;
DROP TABLE IF EXISTS schedules         CASCADE;
DROP TABLE IF EXISTS shifts            CASCADE;
DROP TABLE IF EXISTS approval_requests CASCADE;
DROP TABLE IF EXISTS time_entries      CASCADE;
DROP TABLE IF EXISTS users             CASCADE;
DROP TABLE IF EXISTS departments       CASCADE;

-- Enums
DROP TYPE IF EXISTS entry_status;
DROP TYPE IF EXISTS user_role;
