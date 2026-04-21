-- Migration 002: Custom time support for schedules
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/002_schedule_custom_times.sql

-- Allow schedules without a shift template (custom time entry)
ALTER TABLE schedules ALTER COLUMN shift_id DROP NOT NULL;

-- Allow schedules created without a known admin user_id
ALTER TABLE schedules ALTER COLUMN created_by DROP NOT NULL;

-- Custom time range columns
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS custom_start_time TIME;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS custom_end_time   TIME;

-- Enforce: must have either a template or explicit times
ALTER TABLE schedules ADD CONSTRAINT chk_schedule_has_time
  CHECK (
    shift_id IS NOT NULL
    OR (custom_start_time IS NOT NULL AND custom_end_time IS NOT NULL)
  );
