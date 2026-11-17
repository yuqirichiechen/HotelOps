-- Migration 035: Sprint 28.10 — "Views": which staff-portal pages a DEPARTMENT's people can open.
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/035_sprint28_10_access_views.sql   (AFTER 034, BEFORE deploying 28.10)
--
--   access_views            — a named set of pages. The pages themselves are hardcoded in the app (server/access.js: reservations, housekeeping, logbook …); a view just
--                             lists which of them it switches on. Dev creates / edits views in Dev → Platform.
--   departments.view_id     — the view a department uses; everyone in the department inherits it. NULL = "Home only" (no extra pages).
--   seed                    — a "Front Desk" view (reservations + housekeeping + logbook = exactly what Front Desk staff had) attached to the Front Desk department,
--                             so nobody gains or loses anything. It is attached only on the run that creates the view, so a re-run never overrides a later choice.
--   app_settings            — access_admin_sets_view = 'false' (dev-only switch: may admins choose a department's view? off by default).
-- Additive only: no existing column / row is changed except departments.view_id on the Front Desk department. Idempotent, one transaction.
-- Undo: 035_sprint28_10_access_views_ROLLBACK.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS access_views (
  view_id    SERIAL       PRIMARY KEY,
  name       VARCHAR(60)  NOT NULL,
  pages      TEXT[]       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT access_views_name_not_blank CHECK (btrim(name) <> '')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_access_views_name ON access_views (lower(btrim(name)));

ALTER TABLE departments ADD COLUMN IF NOT EXISTS view_id INT REFERENCES access_views(view_id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_departments_view ON departments(view_id);

DO $mig$
DECLARE v_id INT; fd_id INT; n_ins INT := 0; n INT := 0;
BEGIN
  SELECT department_id INTO fd_id FROM departments WHERE name ~* '^front[ _-]*desk$' ORDER BY department_id LIMIT 1;
  IF fd_id IS NOT NULL THEN
    INSERT INTO access_views (name, pages) SELECT 'Front Desk', ARRAY['reservations', 'housekeeping', 'logbook']
     WHERE NOT EXISTS (SELECT 1 FROM access_views WHERE lower(btrim(name)) = 'front desk');
    GET DIAGNOSTICS n_ins = ROW_COUNT;
    -- attach it ONLY on the run that creates it: a re-run must never override a later choice (e.g. dev setting the department to "Home only")
    IF n_ins > 0 THEN
      SELECT view_id INTO v_id FROM access_views WHERE lower(btrim(name)) = 'front desk';
      UPDATE departments SET view_id = v_id WHERE department_id = fd_id AND view_id IS NULL;
      GET DIAGNOSTICS n = ROW_COUNT;
    END IF;
  END IF;
  RAISE NOTICE 'migration 035: Front Desk view created: % | attached to the Front Desk department: % (0 = already existed, or no Front Desk department)', n_ins, n;
END
$mig$;

INSERT INTO app_settings (key, value) VALUES ('access_admin_sets_view', 'false') ON CONFLICT (key) DO NOTHING;

COMMIT;
