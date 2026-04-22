-- Migration 003: Application settings table
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/003_app_settings.sql

CREATE TABLE app_settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT         NOT NULL,
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Default: all staff see all departments on the Shifts board
INSERT INTO app_settings (key, value) VALUES ('schedule_visibility', 'all');
-- updated_at is set manually via ON CONFLICT ... updated_at = NOW() in the API
