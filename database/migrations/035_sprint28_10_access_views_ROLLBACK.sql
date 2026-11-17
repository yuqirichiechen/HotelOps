-- ROLLBACK for migration 035 (Sprint 28.10). Not a numbered migration — run by hand only to undo it. Roll the app back to the previous version first (the
-- new app reads these columns). Drops the views, the department link and the dev switch; users, departments and everything else are untouched.
BEGIN;
ALTER TABLE departments DROP COLUMN IF EXISTS view_id;
DROP TABLE IF EXISTS access_views;
DELETE FROM app_settings WHERE key = 'access_admin_sets_view';
COMMIT;
