#!/bin/bash
set -e

echo "=== Configuring nginx ==="
cat > /etc/nginx/conf.d/fmapp.conf << 'NGINX_END'
server {
    listen 80;
    server_name _;
    root /home/ec2-user/fmapp/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
    location /api/ {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 60s;
        client_max_body_size 50M;
    }
    location /uploads/ {
        proxy_pass http://localhost:4000;
        proxy_set_header Host $host;
    }
    client_max_body_size 50M;
}
NGINX_END

rm -f /etc/nginx/conf.d/default.conf
chmod -R 755 /home/ec2-user
nginx -t
systemctl enable nginx
systemctl restart nginx
echo "Nginx: OK"

echo "=== Installing PM2 ==="
npm install -g pm2 --silent
echo "PM2: OK"

echo "=== Starting backend ==="
cd /home/ec2-user/fmapp/backend
pm2 delete fmapp-backend 2>/dev/null || true
pm2 start src/server.js --name fmapp-backend
pm2 save

# Setup PM2 startup
pm2 startup systemd -u ec2-user --hp /home/ec2-user 2>&1 | tail -3 || true
systemctl enable pm2-ec2-user 2>/dev/null || true

echo ""
echo "=== Deployment Complete! ==="
echo "Frontend: http://13.206.99.117"
echo "Backend:  http://13.206.99.117:4000/api"
echo ""
pm2 status
