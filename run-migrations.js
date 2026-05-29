#!/bin/bash
set -e
DB_PASS='FMapp@EC2#2026Root'
SQL_DIR='/home/ec2-user/fmapp/backend/sql/Data'

for f in $(ls "$SQL_DIR"/*.sql | sort); do
  echo "Running: $f"
  mysql -u root -p"$DB_PASS" fmapp < "$f" 2>&1 | grep -v Warning || true
done

echo "All migrations done"
mysql -u root -p"$DB_PASS" fmapp -e "SHOW TABLES;" 2>/dev/null | grep -E "work_orders|flags|company_roles|soft_service"
