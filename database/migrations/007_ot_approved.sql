-- Migration 007: Per-entry OT approval flag
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/007_ot_approved.sql
--
-- Adds ot_approved to time_entries. An entry's overtime contribution
-- counts as "approved" only when its weekly bucket is fully approved
-- (every entry in the same Mon–Sun bucket has ot_approved = true).
-- Bulk approval is the standard flow; per-entry approval would be a
-- later add-on if the workflow needs it.

ALTER TABLE time_entries
  ADD COLUMN IF NOT EXISTS ot_approved BOOLEAN NOT NULL DEFAULT FALSE;
