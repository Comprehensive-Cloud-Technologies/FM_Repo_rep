-- =============================================================================
-- Migration: Asset Category, High End Equipment maintenance type, Cost breakdown
-- Date: 2026-06-16
-- Description:
--   1. Ensures criticality column exists on assets table (Critical / Non_Critical)
--   2. Adds asset_category column if not present
--   3. The per-type purchase costs and maintenanceTypes.highEnd are stored in
--      asset_details.metadata as JSON (no schema change needed).
-- =============================================================================

-- ── Ensure criticality column exists ─────────────────────────────────────────
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS criticality VARCHAR(20) NOT NULL DEFAULT 'Non_Critical';

-- ── Ensure asset_category column exists ──────────────────────────────────────
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS asset_category VARCHAR(120) NULL;

-- ── Ensure is_verified column exists ─────────────────────────────────────────
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS is_verified TINYINT(1) NOT NULL DEFAULT 0;

-- ── Ensure working_status column exists ──────────────────────────────────────
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS working_status VARCHAR(30) NULL;

-- ── Update ENUM to allow Unverified status ────────────────────────────────────
-- This is safe to re-run; MODIFY COLUMN is idempotent in MySQL 8+
ALTER TABLE assets
  MODIFY COLUMN status ENUM('Active','Inactive','Unverified') NOT NULL DEFAULT 'Active';
