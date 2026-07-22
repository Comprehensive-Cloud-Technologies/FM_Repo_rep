-- ============================================================
-- PMS Module: Checklists, Schedules, Asset Assignment
-- ============================================================
USE fmapp;

-- ── 1. PMS Checklists (reusable templates) ───────────────────
CREATE TABLE IF NOT EXISTS pms_checklists (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id         INT UNSIGNED NOT NULL,
  checklist_name     VARCHAR(200) NOT NULL,
  checklist_code     VARCHAR(60)  NOT NULL,
  asset_category     VARCHAR(80)  NULL,
  asset_type         VARCHAR(120) NULL,
  manufacturer       VARCHAR(120) NULL,
  model              VARCHAR(120) NULL,
  version            VARCHAR(40)  NOT NULL DEFAULT '1.0',
  estimated_duration INT          NULL COMMENT 'minutes',
  frequency          VARCHAR(40)  NOT NULL DEFAULT 'Monthly',
  description        TEXT         NULL,
  status             ENUM('active','inactive') NOT NULL DEFAULT 'active',
  created_by         INT UNSIGNED NULL,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_pms_code (company_id, checklist_code),
  KEY idx_pms_cl_company (company_id),
  CONSTRAINT fk_pms_cl_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. PMS Checklist Items ────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_checklist_items (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  checklist_id      INT UNSIGNED NOT NULL,
  serial_no         INT          NOT NULL DEFAULT 1,
  inspection_point  VARCHAR(300) NOT NULL,
  check_type        VARCHAR(80)  NOT NULL DEFAULT 'Visual Inspection',
  response_type     VARCHAR(40)  NOT NULL DEFAULT 'Pass/Fail',
  is_mandatory      TINYINT(1)   NOT NULL DEFAULT 1,
  tolerance_value   VARCHAR(100) NULL,
  remarks_required  TINYINT(1)   NOT NULL DEFAULT 0,
  photo_required    TINYINT(1)   NOT NULL DEFAULT 0,
  sort_order        INT          NOT NULL DEFAULT 0,
  created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pms_items_cl (checklist_id),
  CONSTRAINT fk_pms_items_cl FOREIGN KEY (checklist_id) REFERENCES pms_checklists(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. Asset → PMS Checklist link (already applied via migration script) ─────
-- ALTER TABLE assets ADD COLUMN pms_checklist_id INT UNSIGNED NULL;
-- ALTER TABLE assets ADD COLUMN last_pms_date    DATE         NULL;
-- ALTER TABLE assets ADD COLUMN next_pms_due     DATE         NULL;

-- ── 4. PMS Schedules ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_schedules (
  id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id       INT UNSIGNED NOT NULL,
  schedule_number  VARCHAR(60)  NULL,
  maintenance_date DATE         NOT NULL,
  engineer_id      INT UNSIGNED NULL,
  engineer_name    VARCHAR(160) NULL,
  status           VARCHAR(30)  NOT NULL DEFAULT 'scheduled',
  notes            TEXT         NULL,
  created_by       INT UNSIGNED NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_pms_sched_company (company_id),
  KEY idx_pms_sched_date    (maintenance_date),
  CONSTRAINT fk_pms_sched_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 5. PMS Schedule → Assets ─────────────────────────────────
CREATE TABLE IF NOT EXISTS pms_schedule_assets (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  schedule_id    INT UNSIGNED NOT NULL,
  asset_id       INT UNSIGNED NOT NULL,
  checklist_id   INT UNSIGNED NULL,
  status         VARCHAR(30)  NOT NULL DEFAULT 'pending',
  completed_by   INT UNSIGNED NULL,
  completed_at   DATETIME     NULL,
  notes          TEXT         NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sched_asset (schedule_id, asset_id),
  KEY idx_pms_sa_sched (schedule_id),
  KEY idx_pms_sa_asset (asset_id),
  CONSTRAINT fk_pms_sa_sched FOREIGN KEY (schedule_id) REFERENCES pms_schedules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
