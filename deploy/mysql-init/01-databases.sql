-- Runs once, on the MySQL container's first boot (empty data volume).
-- Creates the two isolated schemas; the backend's own migrations build the tables.
CREATE DATABASE IF NOT EXISTS fmapp_dev  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS fmapp_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
