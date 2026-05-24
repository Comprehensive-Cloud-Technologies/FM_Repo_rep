-- Add sector and healthcare-specific fields to companies table
-- MySQL-compatible migration

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS sector VARCHAR(80) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS entity_type VARCHAR(80) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS facility_type VARCHAR(80) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_person_name VARCHAR(160) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_person_phone VARCHAR(32) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_email VARCHAR(160) DEFAULT NULL;
