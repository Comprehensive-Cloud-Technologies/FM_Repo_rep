-- ============================================================
-- Location Management Architecture
-- Creates: buildings, floors, departments (new hierarchy),
--          rooms, locations (master hierarchy table)
-- Alters:  assets to add location FK columns
-- ============================================================

-- ── 1. buildings ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buildings (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id    INT UNSIGNED NOT NULL,
  building_code VARCHAR(80),
  building_name VARCHAR(200) NOT NULL,
  description   VARCHAR(500),
  status        ENUM('Active','Inactive','Deleted') NOT NULL DEFAULT 'Active',
  created_by    INT UNSIGNED,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_building_company_name (company_id, building_name),
  KEY idx_buildings_company (company_id),
  CONSTRAINT fk_buildings_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 2. floors ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS floors (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  building_id  INT UNSIGNED NOT NULL,
  floor_code   VARCHAR(80),
  floor_name   VARCHAR(200) NOT NULL,
  floor_number INT,
  status       ENUM('Active','Inactive','Deleted') NOT NULL DEFAULT 'Active',
  created_by   INT UNSIGNED,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_floor_building_name (building_id, floor_name),
  KEY idx_floors_building (building_id),
  CONSTRAINT fk_floors_building FOREIGN KEY (building_id) REFERENCES buildings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 3. departments_v2 (new hierarchy-aware departments) ──────
--  We keep the existing `departments` table untouched to avoid
--  breaking existing foreign keys.  The new table links to floors.
CREATE TABLE IF NOT EXISTS location_departments (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  floor_id        INT UNSIGNED NOT NULL,
  department_code VARCHAR(80),
  department_name VARCHAR(200) NOT NULL,
  description     VARCHAR(500),
  status          ENUM('Active','Inactive','Deleted') NOT NULL DEFAULT 'Active',
  created_by      INT UNSIGNED,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_dept_floor_name (floor_id, department_name),
  KEY idx_loc_depts_floor (floor_id),
  CONSTRAINT fk_loc_depts_floor FOREIGN KEY (floor_id) REFERENCES floors(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 4. rooms ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rooms (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  department_id INT UNSIGNED NOT NULL,
  room_code     VARCHAR(80),
  room_name     VARCHAR(200) NOT NULL,
  room_type     VARCHAR(80),
  capacity      INT,
  status        ENUM('Active','Inactive','Deleted') NOT NULL DEFAULT 'Active',
  created_by    INT UNSIGNED,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_room_dept_name (department_id, room_name),
  UNIQUE KEY uq_room_dept_code (department_id, room_code),
  KEY idx_rooms_department (department_id),
  CONSTRAINT fk_rooms_department FOREIGN KEY (department_id) REFERENCES location_departments(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 5. locations (master hierarchy table) ────────────────────
CREATE TABLE IF NOT EXISTS locations (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  company_id         INT UNSIGNED NOT NULL,
  location_type      ENUM('Building','Floor','Department','Room') NOT NULL,
  reference_id       INT UNSIGNED NOT NULL,
  parent_location_id INT UNSIGNED,
  location_code      VARCHAR(80),
  location_name      VARCHAR(200) NOT NULL,
  status             ENUM('Active','Inactive','Deleted') NOT NULL DEFAULT 'Active',
  created_by         INT UNSIGNED,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_locations_company (company_id),
  KEY idx_locations_parent (parent_location_id),
  KEY idx_locations_ref (location_type, reference_id),
  CONSTRAINT fk_locations_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  CONSTRAINT fk_locations_parent FOREIGN KEY (parent_location_id) REFERENCES locations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── 6. Alter assets: add location FK columns (nullable) ──────
ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS building_id    INT UNSIGNED AFTER room,
  ADD COLUMN IF NOT EXISTS floor_id       INT UNSIGNED AFTER building_id,
  ADD COLUMN IF NOT EXISTS loc_dept_id    INT UNSIGNED AFTER floor_id,
  ADD COLUMN IF NOT EXISTS room_id        INT UNSIGNED AFTER loc_dept_id,
  ADD COLUMN IF NOT EXISTS location_id    INT UNSIGNED AFTER room_id;

-- Add FK constraints (run only once; safe because tables are new)
ALTER TABLE assets
  ADD CONSTRAINT fk_assets_building    FOREIGN KEY (building_id)  REFERENCES buildings(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_assets_floor       FOREIGN KEY (floor_id)     REFERENCES floors(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_assets_loc_dept    FOREIGN KEY (loc_dept_id)  REFERENCES location_departments(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_assets_room        FOREIGN KEY (room_id)      REFERENCES rooms(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_assets_location    FOREIGN KEY (location_id)  REFERENCES locations(id) ON DELETE SET NULL;
