# FM Replica: Implementation and EC2 Deployment Guide

## 1) Where Your Project Files Are

Workspace root:

- `d:/FM_Replica`

Main repository used for deployment:

- `d:/FM_Replica/FM_Repo_rep`

Important folders:

- `backend/` : Node.js + Express API, SQL files, migrations
- `frontend/` : React + Vite web app
- `mobile-app-v2/` : Expo mobile app
- `backend/sql/schema.sql` : base schema
- `backend/sql/supplement-mysql.sql` : extra MySQL changes
- `backend/sql/migrations/` : migration scripts

Deployment scripts already present:

- `ec2-deploy.sh`
- `ec2-finish-deploy.sh`
- `setup-ec2.sh`

ER and DB docs:

- `backend/ERD_RELATIONS.md` (full FK inventory)
- `backend/ERD_MERMAID.md` (core visual ERD)

---

## 2) Backend Implementation Summary

Key backend routes (under `backend/src/routes/`):

- `companies.js`:
  - company management
  - `GET /:id/role-permissions`
  - `PUT /:id/role-permissions`
- `companyAuth.js`:
  - company portal login
  - now merges `role_permissions` + `company_users.permissions` as effective CRUD permissions
  - derives module access fallback from readable (`r`) permissions
- `mobileAuth.js`:
  - mobile login
  - now uses the same permission merge and module-access fallback
- `companyPortal.js`:
  - company portal APIs including `/me`

Permission model now used:

- Role defaults: `role_permissions.permissions` JSON
- User override: `company_users.permissions` JSON
- Effective user policy at login: role defaults merged with user overrides
- Tab visibility fallback: modules having read permission (`r`/`read`/`view`) are auto-enabled if explicit `module_access` is not set

---

## 3) Frontend Implementation Summary

Key frontend files:

- `frontend/src/pages/CompanyPortal.jsx`
  - client-side admin portal
  - Role Permissions modal is mapped to company-portal tabs (not legacy module list)
  - CRUD matrix is persisted through backend role-permission endpoints
- `frontend/src/pages/CompanyEmployeePortal.jsx`
  - employee/company portal sidebar + page router
  - nav filtering now applies:
    1. company enabled modules
    2. role CRUD read permission filter
    3. user module_access filter (if provided)
- `frontend/src/components/HealthcareDashboard.jsx`
  - KPI card order updated so Verified and RBER are interchanged explicitly

---

## 4) Deploy Frontend + Backend + Database to EC2

Current scripts are configured around this EC2 target:

- Host: `13.206.99.117`
- App path: `/home/ec2-user/fmapp`
- Backend port: `4000`

### 4.1 One-time EC2 setup (on EC2)

```bash
cd /home/ec2-user
bash setup-ec2.sh
```

### 4.2 Full deployment (on EC2)

```bash
cd /home/ec2-user/fmapp
bash ec2-deploy.sh
```

What this script does:

- Installs Node, Nginx, MySQL, PM2, Git
- Clones/pulls repo
- Creates backend `.env`
- Imports DB schema/supplement SQL
- Builds frontend
- Configures Nginx reverse proxy
- Starts backend with PM2

### 4.3 Finalize deployment (optional hardening pass)

```bash
cd /home/ec2-user/fmapp
sudo bash ec2-finish-deploy.sh
```

### 4.4 Health checks

```bash
pm2 status
curl -I http://127.0.0.1:4000/api/health || true
sudo nginx -t
sudo systemctl status nginx --no-pager
```

---

## 5) How to Connect to Your Database on EC2

### 5.1 SSH into EC2

```bash
ssh -i <your-key.pem> ec2-user@13.206.99.117
```

### 5.2 Connect locally on EC2 host

```bash
mysql -u fmapp_user -p fmapp
```

If you need root:

```bash
mysql -u root -p
```

### 5.3 Connect remotely from your laptop (safe approach: SSH tunnel)

From local machine:

```bash
ssh -i <your-key.pem> -L 3307:127.0.0.1:3306 ec2-user@13.206.99.117
```

Then from local SQL client:

- Host: `127.0.0.1`
- Port: `3307`
- Database: `fmapp`
- Username: `fmapp_user`
- Password: value configured in backend `.env` on EC2

### 5.4 Verify app data quickly

```sql
USE fmapp;
SHOW TABLES;
SELECT COUNT(*) FROM companies;
SELECT COUNT(*) FROM company_users;
SELECT COUNT(*) FROM role_permissions;
```

---

## 6) Important Security Note

Rotate any hardcoded credentials currently present in deployment scripts (`DB_PASS`, `JWT_SECRET`) before production use.
Use EC2 environment variables or AWS SSM Parameter Store instead of plain text in shell scripts.

---

## 7) Suggested Clean Deploy Flow (Neat Process)

1. Push latest code to your deployment branch.
2. SSH to EC2.
3. Pull latest repo in `/home/ec2-user/fmapp`.
4. Run `ec2-deploy.sh`.
5. Run `ec2-finish-deploy.sh`.
6. Validate PM2 + Nginx + API health.
7. Run SQL checks for critical tables.
8. Smoke-test login and portal tab access per role.
