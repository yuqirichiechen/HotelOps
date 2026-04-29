-- Migration 004: Authentication columns on users
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/004_auth_columns.sql
--
-- Adds optional per-user PIN to support the staff login flow. Admin-controlled
-- via /api/admin/employees/:id/pin/toggle and /api/admin/employees/:id/pin/reset.
-- Admin credentials are stored separately in server/config/admins.json — there
-- is no password column on the users table by design.

-- Bcrypt hash of the user's 4-digit PIN. NULL = not set.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- Whether this user must present a PIN at login. Defaults to false (low-friction).
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_required BOOLEAN NOT NULL DEFAULT FALSE;

-- Forces a "set your PIN" interstitial on next login. Set to true on admin reset.
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_must_set BOOLEAN NOT NULL DEFAULT FALSE;
