-- ROLLBACK for migration 036 (Sprint 29.1). Not a numbered migration — run by hand only to undo it. Roll the app back first.
-- Admins sign in from server/config/admins.json again and dev from DEV_PASSWORD_HASH again — any password changed in the app is LOST with this table.
BEGIN;
DROP TABLE IF EXISTS login_accounts;
COMMIT;
