-- Migration 023: system_generated on time_entries (Sprint 16.4)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/023_time_entries_system_generated.sql

-- Sprint 16.4: marks time_entries that were auto-closed by the
-- "still clocked in past scheduled end + grace" job. The clock_out
-- timestamp is set to the scheduled end (not NOW) so payroll hours
-- reflect the planned shift rather than however long it took the
-- system to notice. The flag surfaces in the admin UI so the GM
-- can review and adjust upward if the staff member actually
-- worked late.

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS system_generated BOOLEAN NOT NULL DEFAULT FALSE;
