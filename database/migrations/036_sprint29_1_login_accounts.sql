-- Migration 036: Sprint 29.1 — admin + dev passwords live in the database so they can be CHANGED from the app.
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/036_sprint29_1_login_accounts.sql   (AFTER 035, before or with the deploy)
--
--   login_accounts   one row per ADMIN (manager) sign-in, and at most one row for the DEV sign-in.
--                    password_hash  bcrypt — what sign-in is checked against (never reversible).
--                    password_enc   admins only: an ENCRYPTED copy (server/pinvault.js, key PIN_VIEW_KEY) that only the dev role can reveal; NULL for dev, and NULL
--                                   when no PIN_VIEW_KEY is configured (then dev can reset a password but not read it).
--                    active         FALSE = cannot sign in (dev can switch it back on).
-- Nothing is copied in here: the existing admin(s) in server/config/admins.json move into this table the first time they sign in (or when dev opens the admin
-- list), and the dev password moves the first time dev changes it. Until then sign-in keeps using admins.json / DEV_PASSWORD_HASH, so applying this changes nothing
-- by itself. Once a row exists for a person, the row is the only password that works (the file / env value no longer does).
-- Recover a lost DEV password: DELETE FROM login_accounts WHERE kind = 'dev';  — the DEV_PASSWORD_HASH environment value works again.
-- Additive, idempotent, one transaction. Undo: 036_sprint29_1_login_accounts_ROLLBACK.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS login_accounts (
  account_id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                VARCHAR(10)  NOT NULL CHECK (kind IN ('admin', 'dev')),
  username            VARCHAR(60)  NOT NULL,
  display_name        VARCHAR(100),
  password_hash       TEXT         NOT NULL,
  password_enc        TEXT,
  active              BOOLEAN      NOT NULL DEFAULT TRUE,
  password_changed_at TIMESTAMPTZ,
  created_by          VARCHAR(80),
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  -- loose on purpose: an existing admins.json name of any length must be importable; the app asks 3–40 characters of NEW admin names (server/accounts.js)
  CONSTRAINT login_accounts_username_format CHECK (username ~ '^[A-Za-z0-9._-]{1,60}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_login_accounts_username ON login_accounts (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS uq_login_accounts_one_dev  ON login_accounts (kind) WHERE kind = 'dev';

COMMIT;
