#!/bin/bash
# ── EC2 Full Deployment Script ──────────────────────────────────────────────
# Deploys: backend (Node.js/Express), frontend (React/Vite), MySQL DB
# EC2 IP: 13.206.99.117 | GitHub repo: Comprehensive-Cloud-Technologies/FM_Repo_rep
set -e

# ── Required runtime secrets — must be exported before running this script ─────
# In GitHub Actions, configure as Actions secrets and pass them via env: block:
#   env:
#     EC2_IP:        ${{ secrets.EC2_IP }}
#     DB_PASS:       ${{ secrets.DB_PASS }}
#     JWT_SECRET:    ${{ secrets.JWT_SECRET }}
#     ROOT_PASSWORD: ${{ secrets.ROOT_PASSWORD }}
# Locally: export each variable in your shell before invoking.
# NEVER hard-code values in this file — it is version-controlled.
EC2_IP="${EC2_IP:?ERROR: EC2_IP must be exported (e.g. export EC2_IP=1.2.3.4)}"
DB_PASS="${DB_PASS:?ERROR: DB_PASS must be exported as an environment variable}"
JWT_SECRET="${JWT_SECRET:?ERROR: JWT_SECRET must be exported (generate: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")}"
ROOT_PASSWORD="${ROOT_PASSWORD:?ERROR: ROOT_PASSWORD must be exported as an environment variable}"

# ── Optional — set DOMAIN_NAME to enable HTTPS via Let's Encrypt ───────────────
# export DOMAIN_NAME=htm.yourdomain.com
# If unset, Nginx will serve HTTP only (NOT recommended for production).
DOMAIN_NAME="${DOMAIN_NAME:-}"

REPO_URL="https://github.com/Comprehensive-Cloud-Technologies/FM_Repo_rep.git"
BRANCH="develop"
APP_DIR="/home/ec2-user/fmapp"
DB_NAME="fmapp"
DB_USER="fmapp_user"
BACKEND_PORT=4000

echo "====== Installing dependencies ======"
# Node.js 20 via NodeSource
if ! command -v node &> /dev/null; then
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
  sudo yum install -y nodejs
fi
echo "Node: $(node --version)"

# Nginx
if ! command -v nginx &> /dev/null; then
  sudo yum install -y nginx
fi

# MySQL 8.0
if ! command -v mysql &> /dev/null; then
  sudo yum install -y https://dev.mysql.com/get/mysql80-community-release-el9-1.noarch.rpm 2>/dev/null || true
  sudo yum install -y mysql-community-server --nogpgcheck
  sudo systemctl start mysqld
  sudo systemctl enable mysqld
fi

# PM2
if ! command -v pm2 &> /dev/null; then
  sudo npm install -g pm2
fi

# Git
if ! command -v git &> /dev/null; then
  sudo yum install -y git
fi

echo "====== Setting up MySQL ======"
# Get MySQL temporary root password if first install
MYSQL_TEMP_PASS=$(sudo grep 'temporary password' /var/log/mysqld.log 2>/dev/null | tail -1 | sed 's/.*: //' || echo "")

# Set up MySQL database and user
if [ -n "$MYSQL_TEMP_PASS" ]; then
  # Fresh install — change root password and create app user
  mysql --connect-expired-password -uroot -p"$MYSQL_TEMP_PASS" <<SQLEOF
ALTER USER 'root'@'localhost' IDENTIFIED BY '${DB_PASS}Root';
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQLEOF
else
  # MySQL already configured - just ensure DB and user exist
  mysql -uroot -p"${DB_PASS}Root" <<SQLEOF 2>/dev/null || mysql -u${DB_USER} -p"${DB_PASS}" -e "SELECT 1" 2>/dev/null || true
CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQLEOF
fi

echo "====== Cloning / Updating repo ======"
if [ -d "$APP_DIR" ]; then
  cd "$APP_DIR"
  git fetch origin
  # Use reset instead of checkout to avoid touching untracked files (uploads, etc.)
  git reset --hard "origin/$BRANCH"
  git pull --ff-only origin "$BRANCH" 2>/dev/null || true
else
  git clone -b "$BRANCH" "$REPO_URL" "$APP_DIR"
  cd "$APP_DIR"
fi

echo "====== Configuring backend .env ======"
# Only write .env if it does not already exist — never overwrite to preserve
# secrets like ROOT_PASSWORD that are added manually after initial deploy.
if [ ! -f "$APP_DIR/backend/.env" ]; then
  if [ -n "$DOMAIN_NAME" ]; then
    ALLOW_ORIGIN_VAL="https://${DOMAIN_NAME},http://${EC2_IP},http://${EC2_IP}:3000"
  else
    ALLOW_ORIGIN_VAL="http://${EC2_IP},http://${EC2_IP}:3000"
  fi
cat > "$APP_DIR/backend/.env" <<ENVEOF
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_NAME=${DB_NAME}
DB_POOL_SIZE=10
DB_CONNECT_TIMEOUT_MS=10000
PORT=${BACKEND_PORT}
ALLOW_ORIGIN=${ALLOW_ORIGIN_VAL}
JWT_SECRET=${JWT_SECRET}
NODE_ENV=production
ROOT_USERNAME=rootadmin
ROOT_PASSWORD=${ROOT_PASSWORD}
ENVEOF
else
  echo ".env already exists, skipping overwrite."
fi

echo "====== Installing backend dependencies ======"
cd "$APP_DIR/backend"
npm ci --omit=dev

echo "====== Importing database schema ======"
mysql -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" < "$APP_DIR/backend/sql/schema.sql" 2>/dev/null || echo "Schema already applied or partial import"
# Run supplement SQL if exists
[ -f "$APP_DIR/backend/sql/supplement-mysql.sql" ] && mysql -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" < "$APP_DIR/backend/sql/supplement-mysql.sql" 2>/dev/null || true

echo "====== Installing frontend dependencies & building ======"
cd "$APP_DIR/frontend"
npm ci

# Set API base URL — use HTTPS domain if available, HTTP IP fallback otherwise
if [ -n "$DOMAIN_NAME" ]; then
  VITE_API_BASE="https://${DOMAIN_NAME}"
else
  VITE_API_BASE="http://${EC2_IP}:${BACKEND_PORT}"
fi
cat > "$APP_DIR/frontend/.env.production" <<FEENV
VITE_API_BASE_URL=${VITE_API_BASE}
FEENV

npm run build

echo "====== Configuring Nginx ======"
if [ -n "$DOMAIN_NAME" ]; then
  # HTTPS mode: redirect HTTP → HTTPS; TLS via Let's Encrypt certificate
  sudo tee /etc/nginx/conf.d/fmapp.conf > /dev/null <<NGINXCONF
server {
    listen 80;
    server_name ${DOMAIN_NAME};
    # Redirect all HTTP to HTTPS
    return 301 https://\$host\$request_uri;
}

server {
    listen 443 ssl;
    server_name ${DOMAIN_NAME};

    ssl_certificate     /etc/letsencrypt/live/${DOMAIN_NAME}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN_NAME}/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;

    # Frontend (built React app)
    root ${APP_DIR}/frontend/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        client_max_body_size 50m;
    }

    # Uploaded files
    location /uploads/ {
        alias ${APP_DIR}/backend/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }
}
NGINXCONF
  # Install certbot if not present
  if ! command -v certbot &> /dev/null; then
    sudo yum install -y certbot python3-certbot-nginx 2>/dev/null || true
  fi
  echo "INFO: To obtain a TLS certificate run:"
  echo "  sudo certbot --nginx -d ${DOMAIN_NAME} --non-interactive --agree-tos -m admin@${DOMAIN_NAME}"
else
  # HTTP-only fallback — NOT recommended for production
  sudo tee /etc/nginx/conf.d/fmapp.conf > /dev/null <<NGINXCONF
server {
    listen 80;
    server_name ${EC2_IP} _;

    # Frontend (built React app)
    root ${APP_DIR}/frontend/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Backend API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:${BACKEND_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        client_max_body_size 50m;
    }

    # Uploaded files
    location /uploads/ {
        alias ${APP_DIR}/backend/uploads/;
        expires 7d;
        add_header Cache-Control "public";
    }
}
NGINXCONF
  echo "WARNING: DOMAIN_NAME is not set. Nginx is configured for HTTP only."
  echo "WARNING: Set DOMAIN_NAME environment variable to enable HTTPS for production."
fi

# Remove default config if exists
sudo rm -f /etc/nginx/conf.d/default.conf /etc/nginx/sites-enabled/default 2>/dev/null || true

sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx

echo "====== Starting backend with PM2 ======"
cd "$APP_DIR/backend"
pm2 delete fmapp-backend 2>/dev/null || true
pm2 start src/server.js --name fmapp-backend --interpreter node \
  --env production \
  -e /home/ec2-user/fmapp-backend-error.log \
  -o /home/ec2-user/fmapp-backend-out.log

pm2 save
# Register PM2 startup
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u ec2-user --hp /home/ec2-user 2>/dev/null || true
pm2 save

echo ""
echo "============================================"
echo " Deployment complete!"
if [ -n "$DOMAIN_NAME" ]; then
  echo " App URL:     https://${DOMAIN_NAME}"
  echo " Backend API: https://${DOMAIN_NAME}/api"
else
  echo " App URL:     http://${EC2_IP}  (WARNING: HTTP only)"
  echo " Backend API: http://${EC2_IP}:${BACKEND_PORT}/api"
  echo " WARNING: Set DOMAIN_NAME and re-run to enable HTTPS."
fi
echo " PM2 status:  pm2 status"
echo " Nginx logs:  sudo journalctl -u nginx"
echo " Backend logs: pm2 logs fmapp-backend"
echo "============================================"
