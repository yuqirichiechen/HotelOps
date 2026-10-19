-- Minimal stand-in tables for testing Sprint 20 SQL against a throwaway local Postgres.
-- Apply BEFORE database/migrations/025 and 027. Not the full schema.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE forecast_snapshot (snapshot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), payload JSONB, status VARCHAR(20), scraped_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE audit_logs (log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), actor_id UUID, action VARCHAR(100) NOT NULL, table_name VARCHAR(100), record_id UUID, old_data JSONB, new_data JSONB, ip_address INET, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE time_entries (entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id UUID, clock_in_time TIMESTAMPTZ, clock_out_time TIMESTAMPTZ, system_generated BOOLEAN DEFAULT FALSE);
CREATE TABLE room_type_mapping (type_code TEXT PRIMARY KEY, type_name TEXT, base_code TEXT, base_label TEXT, sub_suffix TEXT, sub_label TEXT, admin_override BOOLEAN DEFAULT FALSE);
