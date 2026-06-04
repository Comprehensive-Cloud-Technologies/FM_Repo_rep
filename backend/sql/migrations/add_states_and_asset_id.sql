-- Migration: states table, companies.state_id, assets.generated_asset_id
-- Run once on local DB, then apply to EC2 when ready

-- 1. States lookup table
CREATE TABLE IF NOT EXISTS states (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  state_name  VARCHAR(120) NOT NULL,
  state_code  VARCHAR(10)  NOT NULL,
  status      ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_states_name (state_name),
  UNIQUE KEY uq_states_code (state_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Link companies to a state (run only if column doesn't exist)
SET @exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'companies' AND COLUMN_NAME = 'state_id');
SET @sql = IF(@exists = 0, 'ALTER TABLE companies ADD COLUMN state_id INT UNSIGNED NULL AFTER state_name', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 3. Add generated_asset_id to assets (run only if column doesn't exist)
SET @exists2 = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND COLUMN_NAME = 'generated_asset_id');
SET @sql2 = IF(@exists2 = 0, 'ALTER TABLE assets ADD COLUMN generated_asset_id VARCHAR(80) NULL AFTER asset_unique_id', 'SELECT 1');
PREPARE stmt2 FROM @sql2; EXECUTE stmt2; DEALLOCATE PREPARE stmt2;

-- 4. Index on generated_asset_id (ignore if already exists)
SET @idx_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'assets' AND INDEX_NAME = 'idx_assets_gen_id');
SET @sql3 = IF(@idx_exists = 0, 'ALTER TABLE assets ADD INDEX idx_assets_gen_id (generated_asset_id)', 'SELECT 1');
PREPARE stmt3 FROM @sql3; EXECUTE stmt3; DEALLOCATE PREPARE stmt3;
