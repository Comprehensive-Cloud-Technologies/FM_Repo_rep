# ── Incremental Safe Deploy to EC2 ────────────────────────────────────────────
# Pushes ONLY source code changes. Does NOT touch .env, database, or uploads.
# Usage: .\deploy-incremental.ps1

$EC2_IP   = "13.206.99.117"
$EC2_USER = "ec2-user"
$KEY      = "C:\Users\PariksheetMoghekar\Downloads\Key.pem"
$APP_DIR  = "/home/ec2-user/fmapp"
$LOCAL    = "d:\FM_Replica\FM_Repo_rep"

Write-Host "======================================================" -ForegroundColor Cyan
Write-Host "  Safe Incremental Deploy → $EC2_IP" -ForegroundColor Cyan
Write-Host "  Target: $APP_DIR" -ForegroundColor Cyan
Write-Host "  Key:    $KEY" -ForegroundColor Cyan
Write-Host "======================================================" -ForegroundColor Cyan

# ── Step 1: Build frontend locally first ─────────────────────────────────────
Write-Host "`n[1/4] Building frontend locally..." -ForegroundColor Yellow
Push-Location "$LOCAL\frontend"
npm run build
if ($LASTEXITCODE -ne 0) { Write-Host "Frontend build FAILED" -ForegroundColor Red; exit 1 }
Pop-Location
Write-Host "  Frontend build OK" -ForegroundColor Green

# ── Step 2: Rsync backend source (no node_modules, no .env, no uploads) ──────
Write-Host "`n[2/4] Syncing backend source code..." -ForegroundColor Yellow
& ssh -i $KEY -o StrictHostKeyChecking=no "${EC2_USER}@${EC2_IP}" "mkdir -p $APP_DIR/backend $APP_DIR/frontend"

# Use scp for backend/src and package.json (rsync may not be available on Windows without WSL)
# We'll use ssh + tar approach for reliability
$backendTar = "$env:TEMP\backend-deploy.tar.gz"
$frontendTar = "$env:TEMP\frontend-deploy.tar.gz"

Write-Host "  Packing backend/src..." -ForegroundColor Gray
Push-Location "$LOCAL\backend"
tar -czf $backendTar --exclude="node_modules" --exclude=".env" --exclude="uploads" .
Pop-Location

Write-Host "  Packing frontend/dist..." -ForegroundColor Gray
Push-Location "$LOCAL\frontend"
tar -czf $frontendTar dist
Pop-Location

# ── Step 3: Upload archives ───────────────────────────────────────────────────
Write-Host "`n[3/4] Uploading to server..." -ForegroundColor Yellow

Write-Host "  Uploading backend..." -ForegroundColor Gray
& scp -i $KEY -o StrictHostKeyChecking=no $backendTar "${EC2_USER}@${EC2_IP}:/tmp/backend-deploy.tar.gz"

Write-Host "  Uploading frontend dist..." -ForegroundColor Gray
& scp -i $KEY -o StrictHostKeyChecking=no $frontendTar "${EC2_USER}@${EC2_IP}:/tmp/frontend-deploy.tar.gz"

# ── Step 4: Remote commands — extract, install deps, restart PM2 ─────────────
Write-Host "`n[4/4] Applying on server and restarting services..." -ForegroundColor Yellow

$remoteScript = @"
set -e

echo '--- Extracting backend source (preserving .env & uploads) ---'
cd $APP_DIR/backend
# Extract but DO NOT overwrite .env or uploads/
tar -xzf /tmp/backend-deploy.tar.gz \
  --exclude='.env' \
  --exclude='uploads' \
  --exclude='node_modules'

echo '--- Installing backend dependencies (production only) ---'
npm install --omit=dev --prefer-offline 2>&1 | tail -5

echo '--- Extracting frontend dist ---'
mkdir -p $APP_DIR/frontend/dist
cd $APP_DIR/frontend
tar -xzf /tmp/frontend-deploy.tar.gz

echo '--- Reloading backend with PM2 (zero-downtime) ---'
if pm2 list | grep -q 'fmapp\|backend\|server\|app'; then
  pm2 reload all --update-env
  echo 'PM2 reload done'
else
  cd $APP_DIR/backend
  pm2 start src/app.js --name fmapp --update-env 2>/dev/null || pm2 restart fmapp --update-env
  pm2 save
  echo 'PM2 started'
fi

echo '--- Reloading Nginx ---'
sudo nginx -t && sudo systemctl reload nginx

echo '--- Cleanup temp files ---'
rm -f /tmp/backend-deploy.tar.gz /tmp/frontend-deploy.tar.gz

echo '--- PM2 status ---'
pm2 list

echo '====== Deploy Complete! ======'
"@

& ssh -i $KEY -o StrictHostKeyChecking=no "${EC2_USER}@${EC2_IP}" $remoteScript

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✅ Deploy succeeded!" -ForegroundColor Green
    Write-Host "   App URL: http://$EC2_IP" -ForegroundColor Cyan
} else {
    Write-Host "`n❌ Deploy failed — check output above." -ForegroundColor Red
    exit 1
}

# Cleanup local temp archives
Remove-Item -Force $backendTar -ErrorAction SilentlyContinue
Remove-Item -Force $frontendTar -ErrorAction SilentlyContinue
