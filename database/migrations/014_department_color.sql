-- Migration 014: department color attribute (Sprint 11)
-- Run: psql "<connection-string>?sslmode=require" -f database/migrations/014_department_color.sql
--
-- Calendar redesign needs colored department chips. Color is admin-
-- settable per the user spec ("later on we will let the admin add
-- their own dept if needed"), so we store it as a per-department
-- value rather than a frontend-hardcoded palette.
--
-- Stored as #RRGGBB hex (VARCHAR(7)). NULL = use the frontend's
-- fallback neutral color; new depts created without a color render
-- in that neutral state until the admin picks one.

ALTER TABLE departments
  ADD COLUMN IF NOT EXISTS color VARCHAR(7);

ALTER TABLE departments
  ADD CONSTRAINT departments_color_format
  CHECK (color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$');

-- Seed reasonable defaults for known seed-data dept names so the
-- visual works on day-1 without admin intervention. Lowercase
-- normalization on the name so casing variation in legacy data
-- doesn't miss a match.
UPDATE departments SET color = '#3182ce' WHERE LOWER(name) = 'front desk'        AND color IS NULL;
UPDATE departments SET color = '#38a169' WHERE LOWER(name) = 'housekeeping'      AND color IS NULL;
UPDATE departments SET color = '#dd6b20' WHERE LOWER(name) = 'maintenance'       AND color IS NULL;
UPDATE departments SET color = '#805ad5' WHERE LOWER(name) IN ('food & beverage', 'food and beverage', 'restaurant', 'f&b') AND color IS NULL;
UPDATE departments SET color = '#718096' WHERE LOWER(name) = 'management'        AND color IS NULL;
UPDATE departments SET color = '#0bc5ea' WHERE LOWER(name) = 'night audit'       AND color IS NULL;
