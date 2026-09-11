# HTM — develop + testing environments (Option A)

Production stays on its own EC2, untouched. This folder stands up **develop** and
**testing** on **one small EC2**, as two isolated app stacks sharing one MySQL
(two schemas) and one Caddy reverse proxy (automatic HTTPS).

```
                          ┌──────────── dev/test EC2 (t3.small) ────────────┐
 dev.htm…  ──HTTPS──▶     │  Caddy ──▶ dev-frontend  ──▶ dev-backend  ─┐    │
 test.htm… ──HTTPS──▶     │        └─▶ test-frontend ──▶ test-backend ─┤    │
                          │                                  MySQL ◀────┘    │
                          │                     (schemas: fmapp_dev, fmapp_test) │
                          └──────────────────────────────────────────────────┘
        S3 (shared bucket): dev/…   test/…   prod/…      Prod EC2: unchanged
```

Isolation is by **DB schema** + **S3 prefix** + **JWT secret** per environment, so
testing can never read or corrupt develop or production data.

---

## Phase 1 — Server (AWS console + SSH)
1. Launch **1× EC2 `t3.small`** (Amazon Linux 2023, `ap-south-1`, ~20 GB EBS).
   Security group: SSH (22) from your IP; HTTP (80) + HTTPS (443) from anywhere.
2. Install Docker + Compose and create the shared network:
   ```bash
   sudo dnf install -y docker git
   sudo systemctl enable --now docker
   sudo usermod -aG docker ec2-user && newgrp docker
   # Compose v2 as a CLI plugin so `docker compose ...` works
   sudo mkdir -p /usr/local/lib/docker/cli-plugins
   sudo curl -SL https://github.com/docker/compose/releases/latest/download/docker-compose-linux-x86_64 \
     -o /usr/local/lib/docker/cli-plugins/docker-compose
   sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
   docker network create htm_edge
   ```
3. **DNS:** add A-records `dev` and `test` (i.e. `dev.htm.catalystservices.eco`,
   `test.htm.catalystservices.eco`) → this EC2's public IP.

## Phase 2 — Two checkouts (independent versions)
```bash
cd ~
git clone <repo-url> htm-develop && (cd htm-develop && git checkout develop)
git clone <repo-url> htm-testing && (cd htm-testing && git checkout main)   # later: check out an rc tag
```

## Phase 3 — Fill secrets (never committed)
```bash
# Shared MySQL password (used by infra + both backends)
cp ~/htm-develop/deploy/.env.example ~/htm-develop/deploy/.env      # set MYSQL_ROOT_PASSWORD

# Per-env backend config
cp ~/htm-develop/backend/.env.development.example ~/htm-develop/backend/.env.development
cp ~/htm-testing/backend/.env.testing.example     ~/htm-testing/backend/.env.testing
# In each: set DB_PASSWORD (= MYSQL_ROOT_PASSWORD), a UNIQUE JWT_SECRET, and the AWS keys.
```

## Phase 4 — Bring it up
```bash
# 1) Shared infra (MySQL + Caddy) — run once, from the develop checkout
cd ~/htm-develop/deploy
docker compose -f docker-compose.infra.yml -p htm-infra up -d
#    First boot creates schemas fmapp_dev + fmapp_test automatically.

# 2) DEVELOP app stack
APP_ENV=dev  VITE_MODE=develop  BACKEND_ENV_FILE=../backend/.env.development \
  docker compose -p htm-dev up -d --build

# 3) TESTING app stack (from the testing checkout)
cd ~/htm-testing/deploy
APP_ENV=test VITE_MODE=testing BACKEND_ENV_FILE=../backend/.env.testing \
  docker compose -p htm-test up -d --build
```
Backend migrations run on boot and build the tables in each schema. Caddy issues
Let's Encrypt certs for both subdomains automatically (needs DNS + ports 80/443).

## Phase 5 — Seed data
Load **sample or anonymised** data into `fmapp_dev` / `fmapp_test`.
**Never** import a raw production dump (strip PII first).

## Phase 6 — Verify
```bash
curl -s https://dev.htm.catalystservices.eco/api/health     # 200
curl -s https://test.htm.catalystservices.eco/api/health    # 200
```
Log in on each, raise a QR-scan ticket, confirm it appears in Ticket Master, and
confirm a record made in **testing** does NOT appear in develop or prod.

---

## Day-to-day ops
```bash
# Redeploy develop after new commits
cd ~/htm-develop && git pull && cd deploy \
  && APP_ENV=dev VITE_MODE=develop BACKEND_ENV_FILE=../backend/.env.development \
     docker compose -p htm-dev up -d --build

# Promote a build to testing (check out the release candidate)
cd ~/htm-testing && git fetch --tags && git checkout v1.2.0-rc.1 && cd deploy \
  && APP_ENV=test VITE_MODE=testing BACKEND_ENV_FILE=../backend/.env.testing \
     docker compose -p htm-test up -d --build

docker compose -p htm-dev logs -f backend      # tail logs
docker compose -p htm-dev down                 # stop a stack
```

## Promotion flow
```
push to develop ─▶ redeploy DEVELOP (dev.htm…)
   │  tag v1.2.0-rc.N
   ▼ check out rc tag in htm-testing ─▶ redeploy TESTING (test.htm…)  → QA
   │  tag v1.2.0  (approve)
   ▼ existing deploy-ec2.yml ─▶ PRODUCTION (htm.catalystservices.eco)
```

## CI/CD (optional, next step)
`.github/workflows/deploy-devtest.yml` can SSH to this box and run the redeploy
commands automatically (push to `develop` → dev; `v*-rc*` tag → testing). It needs
repo **Environment** secrets: `DEVTEST_HOST`, `DEVTEST_USER`, `DEVTEST_SSH_KEY`.
Production continues to deploy via the existing tag-triggered `deploy-ec2.yml`.
