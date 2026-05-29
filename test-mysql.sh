#!/bin/bash
# Test MySQL connection
mysql -u fmapp_user -h 127.0.0.1 --password='FMapp@EC2#2026' fmapp -e "SELECT 1 AS ok;" 2>&1
echo "Exit code: $?"
