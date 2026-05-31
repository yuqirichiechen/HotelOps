-- Migration 022: preferred_language on users (Sprint 16.2)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/022_users_preferred_language.sql

-- Sprint 16.2: per-staff UI language. Backs the i18n layer added
-- in 16.2 so admin can assign a staff member a language and every
-- staff-facing screen renders in it (login → focused-action →
-- home → auto-signout banner). Three seed languages — English
-- (default), Spanish, Mandarin Chinese — sized to the GM's actual
-- workforce. Extending later is a CHECK-constraint relax + dict
-- entry; no migration churn.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS preferred_language TEXT NOT NULL DEFAULT 'en';

-- Wrap the CHECK in a DO block so re-runs against a DB that
-- already has the constraint don't error out (Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS prior to 9.6+ syntax in some
-- managed envs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_preferred_language_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_preferred_language_check
      CHECK (preferred_language IN ('en', 'es', 'zh'));
  END IF;
END $$;
