-- Migration 019: status_codes (Sprint 15.0)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/019_status_codes.sql

-- Sprint 15.0: admin-defined status codes for the Shift Sheet's
-- inline pill rendering (Sprint 15.2 consumes these). A status code
-- is matched against a cell's display_text (case-insensitive,
-- whole-string) and renders as a colored pill instead of raw text.
--
-- Five system codes are seeded with is_system = TRUE so the admin
-- can't accidentally delete them (they can still rename / re-color).
-- Custom codes the admin adds later are is_system = FALSE and are
-- fully editable / deletable.

CREATE TABLE status_codes (
  code_id        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  label          TEXT         NOT NULL,
  -- The string the cell text must match (case-insensitive) to
  -- render as a pill. Usually the short form, e.g. "HELP" or
  -- "DEEP CLEAN".
  abbreviation   TEXT         NOT NULL,
  -- Hex color used for the pill background. Text color is derived
  -- on the client (light/dark heuristic against the bg).
  color          TEXT         NOT NULL,
  -- System codes ship with the schema and can't be deleted.
  is_system      BOOLEAN      NOT NULL DEFAULT FALSE,
  -- Display order; admin can reorder via the settings UI.
  sort_order     INTEGER      NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT status_codes_abbr_unique UNIQUE (abbreviation)
);

CREATE INDEX idx_status_codes_sort ON status_codes(sort_order, label);

-- Seed defaults. Colors picked from the existing dept palette so
-- the sheet reads cohesively next to the dept badges.
INSERT INTO status_codes (label, abbreviation, color, is_system, sort_order) VALUES
  ('Help / Extra Shift', 'HELP',       '#38a169', TRUE, 10),
  ('Break',              'BRK',        '#dd6b20', TRUE, 20),
  ('Deep Clean',         'DEEP CLEAN', '#d69e2e', TRUE, 30),
  ('House Meeting',      'H.M',        '#4a5568', TRUE, 40),
  ('Day Off',            'OFF',        '#a0aec0', TRUE, 50);
