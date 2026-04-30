-- Migration 006: Performance config defaults
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/006_perf_config.sql
--
-- Adds three rows to app_settings that drive the staff performance page:
--   overtime_threshold_hours   — weekly hours past which work counts as OT (default 40)
--   on_time_tolerance_minutes  — clock-in lag past scheduled start before "late" (default 10)
--   compare_baseline           — what the deltas on perf cards compare against
--                                ('self' = previous period, 'department' or 'all' later)

INSERT INTO app_settings (key, value) VALUES
  ('overtime_threshold_hours',  '40'),
  ('on_time_tolerance_minutes', '10'),
  ('compare_baseline',          'self')
ON CONFLICT (key) DO NOTHING;
