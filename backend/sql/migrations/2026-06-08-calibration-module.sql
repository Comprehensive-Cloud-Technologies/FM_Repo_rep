-- Calibration module: asset columns + vendors + records

ALTER TABLE assets ADD COLUMN calibration_required TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE assets ADD COLUMN calibration_frequency VARCHAR(40) NULL;
ALTER TABLE assets ADD COLUMN last_calibration_date DATE NULL;
ALTER TABLE assets ADD COLUMN next_calibration_due_date DATE NULL;
ALTER TABLE assets ADD COLUMN calibration_status VARCHAR(30) NULL;
ALTER TABLE assets ADD COLUMN calibration_vendor_id INT UNSIGNED NULL;
ALTER TABLE assets ADD COLUMN alert_before_days INT NULL;

CREATE INDEX idx_assets_calibration_due ON assets(next_calibration_due_date);
CREATE INDEX idx_assets_calibration_vendor ON assets(calibration_vendor_id);

CREATE TABLE IF NOT EXISTS calibration_vendors (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  vendor_name VARCHAR(200) NOT NULL,
  contact_person VARCHAR(160),
  phone VARCHAR(32),
  email VARCHAR(160),
  address VARCHAR(255),
  status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_calibration_vendor_name (vendor_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS calibration_records (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id INT UNSIGNED NOT NULL,
  calibration_date DATE NOT NULL,
  next_due_date DATE,
  vendor_id INT UNSIGNED,
  certificate_number VARCHAR(160),
  certificate_url VARCHAR(512),
  remarks TEXT,
  calibrated_by VARCHAR(160),
  status VARCHAR(30) NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_calibration_records_asset (asset_id),
  KEY idx_calibration_records_due (next_due_date),
  KEY idx_calibration_records_vendor (vendor_id),
  CONSTRAINT fk_calibration_records_asset FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  CONSTRAINT fk_calibration_records_vendor FOREIGN KEY (vendor_id) REFERENCES calibration_vendors(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE assets
  ADD CONSTRAINT fk_assets_calibration_vendor
  FOREIGN KEY (calibration_vendor_id) REFERENCES calibration_vendors(id)
  ON DELETE SET NULL;

INSERT INTO calibration_vendors (vendor_name, status)
VALUES ('Philips Biomedical', 'Active'),
       ('GE Healthcare', 'Active'),
       ('Siemens Healthcare', 'Active');
