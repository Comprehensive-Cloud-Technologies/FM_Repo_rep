-- =============================================================================
-- Migration: Healthcare Asset Management Module
-- Date: 2026-05-21
-- Description:
--   Adds healthcare-specific fields to assets table and creates records tables
--   for Call Logs, PMS, Calibration, Training, and RBER records.
-- =============================================================================

-- ── Step 1: Add healthcare fields to assets ──────────────────────────────────
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS is_verified    TINYINT(1)   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS criticality    VARCHAR(20)  NOT NULL DEFAULT 'Non_Critical',
  ADD COLUMN IF NOT EXISTS working_status VARCHAR(20)  NOT NULL DEFAULT 'Working',
  ADD COLUMN IF NOT EXISTS location_detail VARCHAR(255) NULL,
  ADD COLUMN IF NOT EXISTS asset_category VARCHAR(120) NULL;

-- ── Step 2: Call Log History ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hc_call_logs (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  company_id      INT UNSIGNED  NOT NULL,
  asset_id        INT UNSIGNED  NULL,
  asset_name      VARCHAR(200)  NULL,
  department_id   INT UNSIGNED  NULL,
  location        VARCHAR(255)  NULL,
  call_date       DATE          NOT NULL,
  call_time       TIME          NULL,
  caller_name     VARCHAR(160)  NULL,
  caller_contact  VARCHAR(60)   NULL,
  issue_reported  TEXT          NULL,
  call_type       VARCHAR(80)   NULL,
  priority        VARCHAR(20)   NOT NULL DEFAULT 'medium',
  status          VARCHAR(30)   NOT NULL DEFAULT 'open',
  resolved_by     INT UNSIGNED  NULL,
  resolved_at     DATETIME      NULL,
  resolution_note TEXT          NULL,
  created_by      INT UNSIGNED  NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hc_call_logs_company  (company_id),
  KEY idx_hc_call_logs_asset    (asset_id),
  KEY idx_hc_call_logs_date     (call_date),
  KEY idx_hc_call_logs_status   (status),
  CONSTRAINT fk_hc_call_logs_company    FOREIGN KEY (company_id)    REFERENCES companies(id)       ON DELETE CASCADE,
  CONSTRAINT fk_hc_call_logs_asset      FOREIGN KEY (asset_id)      REFERENCES assets(id)          ON DELETE SET NULL,
  CONSTRAINT fk_hc_call_logs_department FOREIGN KEY (department_id) REFERENCES departments(id)     ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Step 3: PMS (Planned Maintenance System) Records ─────────────────────────
CREATE TABLE IF NOT EXISTS hc_pms_records (
  id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  company_id           INT UNSIGNED  NOT NULL,
  asset_id             INT UNSIGNED  NULL,
  asset_name           VARCHAR(200)  NULL,
  department_id        INT UNSIGNED  NULL,
  location             VARCHAR(255)  NULL,
  scheduled_date       DATE          NOT NULL,
  completed_date       DATE          NULL,
  maintenance_type     VARCHAR(80)   NULL,
  frequency            VARCHAR(40)   NULL,
  technician_name      VARCHAR(160)  NULL,
  technician_id        INT UNSIGNED  NULL,
  checklist_used       VARCHAR(200)  NULL,
  findings             TEXT          NULL,
  action_taken         TEXT          NULL,
  next_due_date        DATE          NULL,
  status               VARCHAR(30)   NOT NULL DEFAULT 'scheduled',
  cost                 DECIMAL(12,2) NULL,
  remarks              TEXT          NULL,
  document_url         VARCHAR(500)  NULL,
  created_by           INT UNSIGNED  NULL,
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hc_pms_company     (company_id),
  KEY idx_hc_pms_asset       (asset_id),
  KEY idx_hc_pms_scheduled   (scheduled_date),
  KEY idx_hc_pms_status      (status),
  CONSTRAINT fk_hc_pms_company    FOREIGN KEY (company_id)    REFERENCES companies(id)   ON DELETE CASCADE,
  CONSTRAINT fk_hc_pms_asset      FOREIGN KEY (asset_id)      REFERENCES assets(id)      ON DELETE SET NULL,
  CONSTRAINT fk_hc_pms_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Step 4: Calibration Records ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hc_calibration_records (
  id                  INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  company_id          INT UNSIGNED  NOT NULL,
  asset_id            INT UNSIGNED  NULL,
  asset_name          VARCHAR(200)  NULL,
  department_id       INT UNSIGNED  NULL,
  location            VARCHAR(255)  NULL,
  calibration_date    DATE          NOT NULL,
  next_due_date       DATE          NULL,
  calibrated_by       VARCHAR(200)  NULL,
  lab_name            VARCHAR(200)  NULL,
  certificate_no      VARCHAR(120)  NULL,
  certificate_url     VARCHAR(500)  NULL,
  calibration_result  VARCHAR(40)   NOT NULL DEFAULT 'Pass',
  deviation           VARCHAR(120)  NULL,
  standard_used       VARCHAR(200)  NULL,
  remarks             TEXT          NULL,
  status              VARCHAR(30)   NOT NULL DEFAULT 'valid',
  created_by          INT UNSIGNED  NULL,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hc_cal_company  (company_id),
  KEY idx_hc_cal_asset    (asset_id),
  KEY idx_hc_cal_date     (calibration_date),
  KEY idx_hc_cal_status   (status),
  CONSTRAINT fk_hc_cal_company    FOREIGN KEY (company_id)    REFERENCES companies(id)   ON DELETE CASCADE,
  CONSTRAINT fk_hc_cal_asset      FOREIGN KEY (asset_id)      REFERENCES assets(id)      ON DELETE SET NULL,
  CONSTRAINT fk_hc_cal_department FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Step 5: Training Records ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hc_training_records (
  id                INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  company_id        INT UNSIGNED  NOT NULL,
  asset_id          INT UNSIGNED  NULL,
  asset_name        VARCHAR(200)  NULL,
  department_id     INT UNSIGNED  NULL,
  employee_id       INT UNSIGNED  NULL,
  employee_name     VARCHAR(160)  NULL,
  training_title    VARCHAR(300)  NOT NULL,
  training_type     VARCHAR(80)   NULL,
  trainer_name      VARCHAR(160)  NULL,
  training_date     DATE          NOT NULL,
  expiry_date       DATE          NULL,
  score             DECIMAL(5,2)  NULL,
  result            VARCHAR(20)   NOT NULL DEFAULT 'Pass',
  certificate_no    VARCHAR(120)  NULL,
  certificate_url   VARCHAR(500)  NULL,
  remarks           TEXT          NULL,
  created_by        INT UNSIGNED  NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hc_training_company    (company_id),
  KEY idx_hc_training_asset      (asset_id),
  KEY idx_hc_training_employee   (employee_id),
  KEY idx_hc_training_date       (training_date),
  CONSTRAINT fk_hc_training_company    FOREIGN KEY (company_id)    REFERENCES companies(id)       ON DELETE CASCADE,
  CONSTRAINT fk_hc_training_asset      FOREIGN KEY (asset_id)      REFERENCES assets(id)          ON DELETE SET NULL,
  CONSTRAINT fk_hc_training_department FOREIGN KEY (department_id) REFERENCES departments(id)     ON DELETE SET NULL,
  CONSTRAINT fk_hc_training_employee   FOREIGN KEY (employee_id)   REFERENCES company_users(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Step 6: RBER (Risk Based Equipment Review) Records ───────────────────────
CREATE TABLE IF NOT EXISTS hc_rber_records (
  id                   INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  company_id           INT UNSIGNED  NOT NULL,
  asset_id             INT UNSIGNED  NULL,
  asset_name           VARCHAR(200)  NULL,
  department_id        INT UNSIGNED  NULL,
  location             VARCHAR(255)  NULL,
  review_date          DATE          NOT NULL,
  next_review_date     DATE          NULL,
  reviewer_name        VARCHAR(160)  NULL,
  reviewer_id          INT UNSIGNED  NULL,
  risk_score           TINYINT UNSIGNED NULL,
  risk_level           VARCHAR(20)   NOT NULL DEFAULT 'Medium',
  equipment_function   VARCHAR(300)  NULL,
  failure_consequences TEXT          NULL,
  maintenance_strategy VARCHAR(200)  NULL,
  recommended_interval VARCHAR(80)   NULL,
  action_required      TEXT          NULL,
  status               VARCHAR(30)   NOT NULL DEFAULT 'pending',
  remarks              TEXT          NULL,
  document_url         VARCHAR(500)  NULL,
  created_by           INT UNSIGNED  NULL,
  created_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hc_rber_company  (company_id),
  KEY idx_hc_rber_asset    (asset_id),
  KEY idx_hc_rber_date     (review_date),
  KEY idx_hc_rber_status   (status),
  CONSTRAINT fk_hc_rber_company    FOREIGN KEY (company_id)    REFERENCES companies(id)       ON DELETE CASCADE,
  CONSTRAINT fk_hc_rber_asset      FOREIGN KEY (asset_id)      REFERENCES assets(id)          ON DELETE SET NULL,
  CONSTRAINT fk_hc_rber_department FOREIGN KEY (department_id) REFERENCES departments(id)     ON DELETE SET NULL,
  CONSTRAINT fk_hc_rber_reviewer   FOREIGN KEY (reviewer_id)   REFERENCES company_users(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Step 7: Work Orders enhancements for request tracking ────────────────────
ALTER TABLE work_orders
  ADD COLUMN IF NOT EXISTS cutoff_time          DATETIME     NULL,
  ADD COLUMN IF NOT EXISTS is_overdue           TINYINT(1)   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS department_id        INT UNSIGNED NULL,
  ADD COLUMN IF NOT EXISTS asset_category       VARCHAR(120) NULL,
  ADD COLUMN IF NOT EXISTS source_label         VARCHAR(80)  NULL,
  ADD COLUMN IF NOT EXISTS on_hold_reason       TEXT         NULL,
  ADD COLUMN IF NOT EXISTS completion_note      TEXT         NULL;

-- ── Work order comments/remarks ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_order_remarks (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  work_order_id   INT UNSIGNED  NOT NULL,
  remark          TEXT          NOT NULL,
  added_by        INT UNSIGNED  NULL,
  added_by_name   VARCHAR(160)  NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wo_remarks_order (work_order_id),
  CONSTRAINT fk_wo_remarks_order FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── Work order assignment history ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_order_assignment_history (
  id              INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  work_order_id   INT UNSIGNED  NOT NULL,
  assigned_to     INT UNSIGNED  NULL,
  assigned_name   VARCHAR(160)  NULL,
  assigned_by     INT UNSIGNED  NULL,
  assigned_by_name VARCHAR(160) NULL,
  note            TEXT          NULL,
  created_at      TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wo_assign_hist_order (work_order_id),
  CONSTRAINT fk_wo_assign_hist_order FOREIGN KEY (work_order_id) REFERENCES work_orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
