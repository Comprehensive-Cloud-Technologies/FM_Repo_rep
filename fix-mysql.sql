CREATE USER IF NOT EXISTS 'fmapp_user'@'localhost' IDENTIFIED BY 'FMapp@EC2#2026';
GRANT ALL PRIVILEGES ON fmapp.* TO 'fmapp_user'@'localhost';
ALTER USER 'fmapp_user'@'localhost' IDENTIFIED BY 'FMapp@EC2#2026';
FLUSH PRIVILEGES;
SELECT User, Host FROM mysql.user WHERE User='fmapp_user';
