-- Migration 031: encrypted PIN copy for the dev role (Sprint 24.4)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/031_sprint24_pin_vault.sql   (BEFORE deploying Sprint 24.4)
--
-- users.pin_enc = AES-256-GCM copy of the staff PIN (see server/pinvault.js; key = env PIN_VIEW_KEY). Sign-in still checks pin_hash only.
-- NULL = nothing stored (no key configured, PIN set before this sprint and not yet re-entered, or reset). Idempotent.

BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_enc TEXT;
COMMIT;
