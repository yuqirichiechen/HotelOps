-- Migration 030: housekeeping assignments (Sprint 23)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/030_sprint23_hk_plans.sql
--
-- One row per property per day: who is working, which rooms each housekeeper cleans / services, and the workload settings used
-- (minimum workload per housekeeper, weights). Written only when a manager presses Save or Print — nothing timer-driven (Neon cost).
-- `assignments` = [{ userId, name, rooms: [{ roomNumber, kind: 'clean'|'service', priority?: true }] }]; rooms nobody has are simply absent.
-- Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS hk_plans (
  property_id  TEXT         NOT NULL DEFAULT 'default',
  plan_date    DATE         NOT NULL,
  settings     JSONB        NOT NULL DEFAULT '{}'::jsonb,
  assignments  JSONB        NOT NULL DEFAULT '[]'::jsonb,
  saved_by     TEXT,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (property_id, plan_date)
);

COMMIT;
