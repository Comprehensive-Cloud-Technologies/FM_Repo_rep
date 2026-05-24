-- ─────────────────────────────────────────────────────────────────────────────
-- MySQL 8.0 Supplement Schema  (individual ALTER TABLE per column)
-- Run AFTER schema.sql
-- ─────────────────────────────────────────────────────────────────────────────

-- assets: extra columns
ALTER TABLE assets ADD COLUMN IF NOT EXISTS open_flags_count INT NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS health_status    VARCHAR(20) NOT NULL DEFAULT 'green';
ALTER TABLE assets ADD COLUMN IF NOT EXISTS risk_level       VARCHAR(20) NOT NULL DEFAULT 'normal';

-- companies: extra columns
ALTER TABLE companies ADD COLUMN IF NOT EXISTS enabled_modules TEXT DEFAULT NULL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS logo_url        VARCHAR(500) DEFAULT NULL;

-- checklist_templates: extra columns
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS questions  JSON NULL;
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS asset_id   INT UNSIGNED NULL;
ALTER TABLE checklist_templates ADD COLUMN IF NOT EXISTS shift_id   INT UNSIGNED NULL;

-- checklist_template_questions: extra columns
ALTER TABLE checklist_template_questions ADD COLUMN IF NOT EXISTS reference_image_url TEXT NULL;
ALTER TABLE checklist_template_questions ADD COLUMN IF NOT EXISTS question_image_url  TEXT NULL;

-- checklist_submissions: extra columns
ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS company_user_id  INT UNSIGNED NULL;
ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS supervisor_id    INT UNSIGNED NULL;
ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS latitude         DOUBLE NULL;
ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS longitude        DOUBLE NULL;
ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS device_ip        VARCHAR(64) NULL;
ALTER TABLE checklist_submissions ADD COLUMN IF NOT EXISTS location_address TEXT NULL;

-- logsheet_templates: extra columns
ALTER TABLE logsheet_templates ADD COLUMN IF NOT EXISTS layout_type VARCHAR(20) NOT NULL DEFAULT 'standard';
ALTER TABLE logsheet_templates ADD COLUMN IF NOT EXISTS asset_id    INT UNSIGNED NULL;
ALTER TABLE logsheet_templates ADD COLUMN IF NOT EXISTS frequency   VARCHAR(20) NOT NULL DEFAULT 'daily';
ALTER TABLE logsheet_templates ADD COLUMN IF NOT EXISTS shift_id    INT UNSIGNED NULL;

-- logsheet_entries: extra columns
ALTER TABLE logsheet_entries ADD COLUMN IF NOT EXISTS company_user_id  INT UNSIGNED NULL;
ALTER TABLE logsheet_entries ADD COLUMN IF NOT EXISTS latitude         DOUBLE NULL;
ALTER TABLE logsheet_entries ADD COLUMN IF NOT EXISTS longitude        DOUBLE NULL;
ALTER TABLE logsheet_entries ADD COLUMN IF NOT EXISTS device_ip        VARCHAR(64) NULL;
ALTER TABLE logsheet_entries ADD COLUMN IF NOT EXISTS location_address TEXT NULL;

-- work_orders: extra columns
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS flag_id         INT UNSIGNED NULL;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS asset_name      VARCHAR(200) NULL;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS location        VARCHAR(255) NULL;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS issue_source    VARCHAR(80)  NULL;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS company_id      INT UNSIGNED NULL;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS company_user_id INT UNSIGNED NULL;

-- company_users
CREATE TABLE IF NOT EXISTS company_users (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id          INT UNSIGNED NOT NULL,
  full_name           VARCHAR(160) NOT NULL,
  email               VARCHAR(160) NOT NULL,
  phone               VARCHAR(32)  NULL,
  designation         VARCHAR(120) NULL,
  role                VARCHAR(60)  NOT NULL DEFAULT 'employee',
  username            VARCHAR(100) NULL,
  status              VARCHAR(20)  NOT NULL DEFAULT 'Active',
  password_hash       VARCHAR(255) NULL,
  permissions         JSON         NULL,
  module_access       JSON         NULL,
  service_domain      VARCHAR(20)  NOT NULL DEFAULT 'technical',
  push_token          VARCHAR(500) NULL,
  push_token_platform VARCHAR(10)  NULL,
  supervisor_id       INT UNSIGNED NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_users_email (email),
  KEY idx_company_users_company (company_id),
  CONSTRAINT fk_company_users_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- company_roles
CREATE TABLE IF NOT EXISTS company_roles (
  id                      INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id              INT UNSIGNED NOT NULL,
  role_key                VARCHAR(80)  NOT NULL,
  label                   VARCHAR(160) NOT NULL,
  parent_role_key         VARCHAR(80)  NULL,
  sort_order              INT          NOT NULL DEFAULT 0,
  color                   VARCHAR(32)  NULL,
  bg_color                VARCHAR(32)  NULL,
  is_active               TINYINT(1)  NOT NULL DEFAULT 1,
  can_raise_soft_issue    TINYINT(1)  NOT NULL DEFAULT 0,
  can_resolve_soft_issue  TINYINT(1)  NOT NULL DEFAULT 0,
  is_soft_manager         TINYINT(1)  NOT NULL DEFAULT 0,
  is_technical_supervisor TINYINT(1)  NOT NULL DEFAULT 0,
  is_technician           TINYINT(1)  NOT NULL DEFAULT 0,
  created_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_company_roles_key (company_id, role_key),
  KEY idx_company_roles_company (company_id),
  CONSTRAINT fk_company_roles_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- shifts
CREATE TABLE IF NOT EXISTS shifts (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id  INT UNSIGNED NOT NULL,
  name        VARCHAR(160) NOT NULL,
  start_time  TIME         NOT NULL,
  end_time    TIME         NOT NULL,
  description VARCHAR(255) NULL,
  status      VARCHAR(20)  NOT NULL DEFAULT 'active',
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_shifts_company (company_id),
  CONSTRAINT fk_shifts_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- employee_shifts
CREATE TABLE IF NOT EXISTS employee_shifts (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  shift_id        INT UNSIGNED NOT NULL,
  company_user_id INT UNSIGNED NOT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_employee_shifts (shift_id, company_user_id),
  KEY idx_employee_shifts_user (company_user_id),
  CONSTRAINT fk_employee_shifts_shift FOREIGN KEY (shift_id)        REFERENCES shifts(id)        ON DELETE CASCADE,
  CONSTRAINT fk_employee_shifts_user  FOREIGN KEY (company_user_id) REFERENCES company_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- flags
CREATE TABLE IF NOT EXISTS flags (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id          INT UNSIGNED NOT NULL,
  asset_id            INT UNSIGNED NULL,
  source              VARCHAR(40)  NOT NULL DEFAULT 'manual',
  checklist_id        INT UNSIGNED NULL,
  submission_id       INT UNSIGNED NULL,
  question_id         INT UNSIGNED NULL,
  logsheet_entry_id   INT UNSIGNED NULL,
  logsheet_answer_id  INT UNSIGNED NULL,
  raised_by           INT UNSIGNED NULL,
  supervisor_id       INT UNSIGNED NULL,
  description         TEXT         NULL,
  severity            VARCHAR(20)  NOT NULL DEFAULT 'medium',
  status              VARCHAR(20)  NOT NULL DEFAULT 'open',
  entered_value       VARCHAR(255) NULL,
  expected_rule       VARCHAR(500) NULL,
  repeat_count        INT          NOT NULL DEFAULT 1,
  work_order_id       INT UNSIGNED NULL,
  escalated           TINYINT(1)  NOT NULL DEFAULT 0,
  escalated_at        DATETIME     NULL,
  resolved_at         DATETIME     NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_flags_company  (company_id),
  KEY idx_flags_asset    (asset_id),
  KEY idx_flags_status   (status),
  KEY idx_flags_severity (severity),
  CONSTRAINT fk_flags_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_flags_asset   FOREIGN KEY (asset_id)   REFERENCES assets(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- flag_rule_groups
CREATE TABLE IF NOT EXISTS flag_rule_groups (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id            INT UNSIGNED NOT NULL,
  checklist_template_id INT UNSIGNED NULL,
  logsheet_template_id  INT UNSIGNED NULL,
  name                  VARCHAR(255) NOT NULL,
  description           TEXT         NULL,
  logic_operator        VARCHAR(10)  NOT NULL DEFAULT 'AND',
  applies_to            VARCHAR(80)  NULL,
  severity_override     VARCHAR(20)  NULL,
  auto_create_wo        TINYINT(1)  NOT NULL DEFAULT 0,
  auto_wo_threshold     VARCHAR(20)  NOT NULL DEFAULT 'high',
  client_visible        TINYINT(1)  NOT NULL DEFAULT 0,
  visibility_mode       VARCHAR(20)  NOT NULL DEFAULT 'internal',
  is_active             TINYINT(1)  NOT NULL DEFAULT 1,
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_frg_company (company_id),
  CONSTRAINT fk_frg_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- flag_rule_conditions
CREATE TABLE IF NOT EXISTS flag_rule_conditions (
  id                INT UNSIGNED NOT NULL AUTO_INCREMENT,
  group_id          INT UNSIGNED NOT NULL,
  question_id       INT UNSIGNED NULL,
  operator          VARCHAR(40)  NOT NULL DEFAULT 'between',
  value             VARCHAR(255) NULL,
  trigger_value     VARCHAR(255) NULL,
  severity_override VARCHAR(20)  NULL,
  condition_order   INT          NOT NULL DEFAULT 0,
  created_at        TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_frc_group (group_id),
  CONSTRAINT fk_frc_group FOREIGN KEY (group_id) REFERENCES flag_rule_groups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- escalation_matrix
CREATE TABLE IF NOT EXISTS escalation_matrix (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id     INT UNSIGNED NOT NULL,
  severity       VARCHAR(20)  NOT NULL,
  notify_role    VARCHAR(60)  NULL,
  notify_user_id INT UNSIGNED NULL,
  delay_minutes  INT          NOT NULL DEFAULT 0,
  is_active      TINYINT(1)  NOT NULL DEFAULT 1,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_em_company (company_id),
  CONSTRAINT fk_em_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- flag_escalation_history
CREATE TABLE IF NOT EXISTS flag_escalation_history (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  flag_id      INT UNSIGNED NOT NULL,
  escalated_to VARCHAR(80)  NULL,
  message      TEXT         NULL,
  escalated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_feh_flag (flag_id),
  CONSTRAINT fk_feh_flag FOREIGN KEY (flag_id) REFERENCES flags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- soft_service_requests
CREATE TABLE IF NOT EXISTS soft_service_requests (
  id                    INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id            INT UNSIGNED NOT NULL,
  asset_id              INT UNSIGNED NOT NULL,
  template_id           INT UNSIGNED NOT NULL,
  template_type         VARCHAR(20)  NOT NULL DEFAULT 'checklist',
  raise_submission_id   INT UNSIGNED NULL,
  raised_by_user_id     INT UNSIGNED NOT NULL,
  raised_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status                VARCHAR(20)  NOT NULL DEFAULT 'open',
  resolve_submission_id INT UNSIGNED NULL,
  resolved_by_user_id   INT UNSIGNED NULL,
  resolved_at           DATETIME     NULL,
  escalated_at          DATETIME     NULL,
  escalation_level      INT          NOT NULL DEFAULT 0,
  created_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ssr_company  (company_id),
  KEY idx_ssr_asset    (company_id, asset_id, status),
  KEY idx_ssr_raiser   (raised_by_user_id),
  KEY idx_ssr_resolver (resolved_by_user_id),
  CONSTRAINT fk_ssr_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ssr_asset   FOREIGN KEY (asset_id)   REFERENCES assets(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- soft_escalation_settings
CREATE TABLE IF NOT EXISTS soft_escalation_settings (
  company_id   INT UNSIGNED NOT NULL,
  cutoff_hours INT          NOT NULL DEFAULT 24,
  updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (company_id),
  CONSTRAINT fk_ses_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- role_permissions
CREATE TABLE IF NOT EXISTS role_permissions (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id  INT UNSIGNED NOT NULL,
  role        VARCHAR(60)  NOT NULL,
  permissions TEXT         NOT NULL DEFAULT '{}',
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_permissions (company_id, role),
  CONSTRAINT fk_rp_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- template_user_assignments
CREATE TABLE IF NOT EXISTS template_user_assignments (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id    INT UNSIGNED NOT NULL,
  template_type VARCHAR(20)  NOT NULL,
  template_id   INT UNSIGNED NOT NULL,
  assigned_to   INT UNSIGNED NOT NULL,
  assigned_by   INT UNSIGNED NULL,
  note          TEXT         NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_tua (template_type, template_id, assigned_to),
  KEY idx_tua_company     (company_id),
  KEY idx_tua_assigned_to (assigned_to),
  CONSTRAINT fk_tua_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ojt_trainings
CREATE TABLE IF NOT EXISTS ojt_trainings (
  id                         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id                 INT UNSIGNED NOT NULL,
  asset_id                   INT UNSIGNED NULL,
  title                      VARCHAR(255) NOT NULL,
  description                TEXT         NULL,
  status                     VARCHAR(20)  NOT NULL DEFAULT 'draft',
  passing_percentage         INT          NOT NULL DEFAULT 70,
  category                   VARCHAR(60)  NOT NULL DEFAULT 'general',
  estimated_duration_minutes INT          NOT NULL DEFAULT 60,
  is_sequential              TINYINT(1)  NOT NULL DEFAULT 0,
  max_attempts               INT          NOT NULL DEFAULT 3,
  trainer_id                 INT UNSIGNED NULL,
  created_by                 INT UNSIGNED NULL,
  created_at                 TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                 TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ojt_trainings_company (company_id),
  CONSTRAINT fk_ojt_trainings_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_ojt_trainings_asset   FOREIGN KEY (asset_id)   REFERENCES assets(id)   ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ojt_modules
CREATE TABLE IF NOT EXISTS ojt_modules (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  training_id  INT UNSIGNED NOT NULL,
  title        VARCHAR(255) NOT NULL,
  description  TEXT         NULL,
  order_number INT          NOT NULL DEFAULT 0,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ojt_modules_training (training_id),
  CONSTRAINT fk_ojt_modules_training FOREIGN KEY (training_id) REFERENCES ojt_trainings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ojt_module_contents
CREATE TABLE IF NOT EXISTS ojt_module_contents (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  module_id   INT UNSIGNED NOT NULL,
  type        VARCHAR(30)  NOT NULL DEFAULT 'text',
  url         TEXT         NULL,
  description TEXT         NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ojt_module_contents_module (module_id),
  CONSTRAINT fk_ojt_module_contents_module FOREIGN KEY (module_id) REFERENCES ojt_modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ojt_tests
CREATE TABLE IF NOT EXISTS ojt_tests (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  training_id INT UNSIGNED NOT NULL,
  total_marks INT          NOT NULL DEFAULT 100,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_ojt_tests_training FOREIGN KEY (training_id) REFERENCES ojt_trainings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ojt_questions
CREATE TABLE IF NOT EXISTS ojt_questions (
  id             INT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_id        INT UNSIGNED NOT NULL,
  question       TEXT         NOT NULL,
  options        JSON         NULL,
  correct_answer TEXT         NULL,
  marks          INT          NOT NULL DEFAULT 1,
  created_at     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ojt_questions_test (test_id),
  CONSTRAINT fk_ojt_questions_test FOREIGN KEY (test_id) REFERENCES ojt_tests(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ojt_user_progress
CREATE TABLE IF NOT EXISTS ojt_user_progress (
  id                     INT UNSIGNED NOT NULL AUTO_INCREMENT,
  training_id            INT UNSIGNED NOT NULL,
  company_user_id        INT UNSIGNED NOT NULL,
  completed_modules      JSON         NULL,
  score                  INT          NULL,
  status                 VARCHAR(30)  NOT NULL DEFAULT 'not_started',
  certificate_url        TEXT         NULL,
  attempt_number         INT          NOT NULL DEFAULT 1,
  due_date               DATE         NULL,
  assigned_by            INT UNSIGNED NULL,
  assigned_at            DATETIME     NULL,
  trainer_id             INT UNSIGNED NULL,
  trainer_sign_off_at    DATETIME     NULL,
  trainer_sign_off_notes TEXT         NULL,
  started_at             DATETIME     NULL,
  completed_at           DATETIME     NULL,
  created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_ojt_progress (training_id, company_user_id),
  KEY idx_ojt_progress_user (company_user_id),
  CONSTRAINT fk_ojt_progress_training FOREIGN KEY (training_id) REFERENCES ojt_trainings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ojt_test_attempts
CREATE TABLE IF NOT EXISTS ojt_test_attempts (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  progress_id     INT UNSIGNED NOT NULL,
  training_id     INT UNSIGNED NOT NULL,
  company_user_id INT UNSIGNED NOT NULL,
  attempt_number  INT          NOT NULL DEFAULT 1,
  score           INT          NULL,
  earned_marks    INT          NULL,
  total_marks     INT          NULL,
  passed          TINYINT(1)  NULL,
  submitted_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ojt_attempts_progress (progress_id),
  CONSTRAINT fk_ojt_attempts_progress FOREIGN KEY (progress_id) REFERENCES ojt_user_progress(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- fleet_inspections
CREATE TABLE IF NOT EXISTS fleet_inspections (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id      INT UNSIGNED NOT NULL,
  asset_id        INT UNSIGNED NOT NULL,
  inspection_date DATE         NOT NULL DEFAULT (CURRENT_DATE),
  checklist_items JSON         NULL,
  status          VARCHAR(30)  NOT NULL DEFAULT 'pending',
  notes           TEXT         NULL,
  inspected_by    INT UNSIGNED NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fleet_inspections_company (company_id),
  KEY idx_fleet_inspections_asset   (asset_id),
  CONSTRAINT fk_fleet_inspections_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_fleet_inspections_asset   FOREIGN KEY (asset_id)   REFERENCES assets(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- fleet_fuel_logs
CREATE TABLE IF NOT EXISTS fleet_fuel_logs (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  company_id  INT UNSIGNED  NOT NULL,
  asset_id    INT UNSIGNED  NOT NULL,
  fuel_amount DECIMAL(10,2) NULL,
  cost        DECIMAL(10,2) NULL,
  odometer    DECIMAL(10,2) NULL,
  fuel_type   VARCHAR(50)   NULL,
  log_date    DATE          NOT NULL DEFAULT (CURRENT_DATE),
  added_by    INT UNSIGNED  NULL,
  notes       TEXT          NULL,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fleet_fuel_company (company_id),
  KEY idx_fleet_fuel_asset   (asset_id),
  CONSTRAINT fk_fleet_fuel_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_fleet_fuel_asset   FOREIGN KEY (asset_id)   REFERENCES assets(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- fleet_maintenance
CREATE TABLE IF NOT EXISTS fleet_maintenance (
  id             INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  company_id     INT UNSIGNED  NOT NULL,
  asset_id       INT UNSIGNED  NOT NULL,
  issue_title    VARCHAR(255)  NOT NULL,
  description    TEXT          NULL,
  priority       VARCHAR(20)   NOT NULL DEFAULT 'medium',
  status         VARCHAR(30)   NOT NULL DEFAULT 'open',
  assigned_to    INT UNSIGNED  NULL,
  scheduled_date DATE          NULL,
  completed_date DATE          NULL,
  cost           DECIMAL(10,2) NULL,
  created_by     INT UNSIGNED  NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_fleet_maintenance_company (company_id),
  KEY idx_fleet_maintenance_asset   (asset_id),
  CONSTRAINT fk_fleet_maintenance_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_fleet_maintenance_asset   FOREIGN KEY (asset_id)   REFERENCES assets(id)   ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
