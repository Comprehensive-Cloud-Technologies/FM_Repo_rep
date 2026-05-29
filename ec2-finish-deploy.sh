#!/bin/bash
set -e

APP_DIR="/home/ec2-user/fmapp"
FRONTEND_DIST="$APP_DIR/frontend/dist"

echo "====== Adding swap space (2GB) ======"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap created and enabled"
else
  echo "Swap already exists"
fi
free -m

echo "====== Checking installed tools ======"
node --version 2>/dev/null && echo "Node OK" || echo "Node MISSING"
nginx -v 2>&1 || echo "Nginx MISSING"
mysql --version 2>/dev/null && echo "MySQL OK" || echo "MySQL MISSING"
ls "$APP_DIR" 2>/dev/null && echo "App dir OK" || echo "App dir MISSING"

echo "====== Uploading frontend dist ======"
# dist is uploaded separately via SCP - just check it exists
if [ -d "$FRONTEND_DIST" ]; then
  echo "Frontend dist found: $(ls $FRONTEND_DIST | wc -l) items"
else
  echo "ERROR: Frontend dist not found at $FRONTEND_DIST"
  exit 1
fi

echo "====== Installing PM2 globally ======"
npm install -g pm2 --silent

echo "====== Configuring nginx ======"
cat > /etc/nginx/conf.d/fmapp.conf << 'NGINXEOF'
server {
    listen 80;
    server_name _;

    root /home/ec2-user/fmapp/frontend/dist;
    index index.html;

    # Serve frontend static files
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Proxy API to Node.js backend
    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    # Proxy uploads (images, files)
    location /uploads/ {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
    }

    client_max_body_size 50M;
}
NGINXEOF

# Remove default nginx config
rm -f /etc/nginx/conf.d/default.conf

# Fix permissions so nginx can serve files
chmod -R 755 /home/ec2-user
chmod -R 755 "$FRONTEND_DIST"

# Test nginx config
nginx -t && echo "Nginx config OK"

# Start / restart nginx
systemctl enable nginx
systemctl restart nginx
echo "Nginx restarted"

echo "====== Starting backend with PM2 ======"
cd "$APP_DIR/backend"

# Stop any existing pm2 process
pm2 delete fmapp-backend 2>/dev/null || true

# Start backend
pm2 start src/server.js --name fmapp-backend --env production
pm2 save

# Setup PM2 auto-start on reboot
env PATH=$PATH:/usr/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user 2>/dev/null || \
pm2 startup 2>/dev/null | tail -1 | bash 2>/dev/null || true

echo "====== Deployment Complete! ======"
echo ""
echo "App URL:      http://13.206.99.117"
echo "Backend API:  http://13.206.99.117:4000/api"
echo ""
echo "PM2 status:"
pm2 status
echo ""
echo "Nginx status:"
systemctl status nginx --no-pager -l | tail -5
