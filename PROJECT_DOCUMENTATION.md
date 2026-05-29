# FM App — Complete Project Documentation

> Everything you need to know: database credentials, EC2 hosting explanation, architecture, ER diagram, flow diagrams, and how to make manual changes.

---

## Table of Contents

1. [Database Credentials & How to Connect](#1-database-credentials--how-to-connect)
2. [EC2 Server — How the Project Was Hosted](#2-ec2-server--how-the-project-was-hosted)
3. [Architecture Diagram](#3-architecture-diagram)
4. [Database (ER) Diagram](#4-database-er-diagram)
5. [Application Flow Diagram](#5-application-flow-diagram)
6. [Project Structure Explained](#6-project-structure-explained)
7. [Backend API Routes Reference](#7-backend-api-routes-reference)
8. [Frontend Pages Reference](#8-frontend-pages-reference)
9. [Mobile App Screens Reference](#9-mobile-app-screens-reference)
10. [How to Make Manual Changes](#10-how-to-make-manual-changes)

---

## 1. Database Credentials & How to Connect

### EC2 Production Database

| Property      | Value                  |
|---------------|------------------------|
| **Host**      | `127.0.0.1` (localhost on EC2) |
| **Port**      | `3306`                 |
| **Database**  | `fmapp`                |
| **User**      | `fmapp_user`           |
| **Password**  | `FMapp@EC2#2026`       |
| **Engine**    | MySQL 8.0              |

### Local Development Database

| Property   | Value          |
|------------|----------------|
| Host       | `127.0.0.1`    |
| Port       | `3306`         |
| Database   | `fmapp`        |
| User       | `root`         |
| Password   | `Pa@24224365`  |

---

### How to Connect to the EC2 Database

#### Option A — MySQL CLI directly on the EC2 server (recommended)

```bash
# 1. SSH into the EC2 server
ssh -i your-key.pem ec2-user@13.206.99.117

# 2. Once logged in, connect to MySQL
mysql -u fmapp_user -p'FMapp@EC2#2026' fmapp

# 3. List all tables
SHOW TABLES;

# 4. Sample query
SELECT * FROM users LIMIT 10;
```

#### Option B — MySQL Workbench / DBeaver via SSH Tunnel

1. Open MySQL Workbench → New Connection → **Standard TCP/IP over SSH**
2. Fill in:
   - SSH Hostname: `13.206.99.117:22`
   - SSH Username: `ec2-user`
   - SSH Key: your `.pem` key file
   - MySQL Hostname: `127.0.0.1`
   - MySQL Port: `3306`
   - MySQL User: `fmapp_user`
   - MySQL Password: `FMapp@EC2#2026`
   - Default Schema: `fmapp`
3. Click **Test Connection** → **OK**

#### Option C — Port-forward from your local machine

```bash
# Run this on your local machine to forward port 3307 → EC2:3306
ssh -i your-key.pem -L 3307:127.0.0.1:3306 ec2-user@13.206.99.117 -N

# Then connect using any MySQL client to:
# Host: 127.0.0.1  Port: 3307  User: fmapp_user  Pass: FMapp@EC2#2026
```

> **Note:** MySQL on EC2 binds only to `127.0.0.1` (not exposed publicly). Port 3306 is NOT open on the AWS Security Group. You MUST go through SSH.

---

## 2. EC2 Server — How the Project Was Hosted

### EC2 Server Details

| Property        | Value                         |
|-----------------|-------------------------------|
| EC2 IP          | `13.206.99.117`               |
| OS              | Amazon Linux 2023 (AL2023)    |
| Instance User   | `ec2-user`                    |
| App directory   | `/home/ec2-user/fmapp`        |
| GitHub Repo     | `Comprehensive-Cloud-Technologies/FM_Repo_rep` (branch: `develop`) |

### What Software Runs on EC2

| Software   | Purpose                                      | Version  |
|------------|----------------------------------------------|----------|
| Node.js    | Runs the Express backend API                 | v20      |
| Nginx      | Serves the React frontend; proxies `/api/` to Node | latest |
| MySQL 8.0  | Database                                     | 8.0      |
| PM2        | Process manager — keeps Node running 24/7    | latest   |

### Step-by-Step: How It Was Deployed

The deployment is automated by `ec2-deploy.sh`. Here is what it does in order:

#### Step 1 — Install software on EC2
```bash
# Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# Nginx
sudo yum install -y nginx

# MySQL 8.0
sudo yum install -y mysql-community-server
sudo systemctl start mysqld && sudo systemctl enable mysqld

# PM2 (global Node process manager)
sudo npm install -g pm2

# Git
sudo yum install -y git
```

#### Step 2 — Configure MySQL
```sql
-- Change root password
ALTER USER 'root'@'localhost' IDENTIFIED BY 'FMapp@EC2#2026Root';

-- Create application database
CREATE DATABASE IF NOT EXISTS fmapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Create a dedicated app user (never use root in production)
CREATE USER IF NOT EXISTS 'fmapp_user'@'localhost' IDENTIFIED BY 'FMapp@EC2#2026';

-- Grant permissions
GRANT ALL PRIVILEGES ON fmapp.* TO 'fmapp_user'@'localhost';
FLUSH PRIVILEGES;
```

#### Step 3 — Clone the GitHub repository
```bash
git clone -b develop https://github.com/Comprehensive-Cloud-Technologies/FM_Repo_rep.git \
  /home/ec2-user/fmapp
```

#### Step 4 — Create the backend `.env` file on EC2
```
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=fmapp_user
DB_PASSWORD=FMapp@EC2#2026
DB_NAME=fmapp
DB_POOL_SIZE=10
DB_CONNECT_TIMEOUT_MS=10000
PORT=4000
ALLOW_ORIGIN=http://13.206.99.117,http://13.206.99.117:3000
JWT_SECRET=fmapp_ec2_prod_jwt_2026_secure
NODE_ENV=production
```

#### Step 5 — Import the database schema
```bash
mysql -u fmapp_user -p'FMapp@EC2#2026' fmapp < /home/ec2-user/fmapp/backend/sql/schema.sql
```

#### Step 6 — Build the React frontend
```bash
cd /home/ec2-user/fmapp/frontend
npm ci

# Tell the frontend where the API lives
echo "VITE_API_BASE_URL=http://13.206.99.117:4000" > .env.production

npm run build
# Output goes to: /home/ec2-user/fmapp/frontend/dist/
```

#### Step 7 — Configure Nginx
Nginx config at `/etc/nginx/conf.d/fmapp.conf`:

```nginx
server {
    listen 80;
    server_name 13.206.99.117 _;

    # Serve the built React app
    root /home/ec2-user/fmapp/frontend/dist;
    index index.html;

    # All non-API routes → React (SPA routing)
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API calls → Node.js backend on port 4000
    location /api/ {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 300s;
        client_max_body_size 50m;
    }

    # File uploads served directly
    location /uploads/ {
        alias /home/ec2-user/fmapp/backend/uploads/;
        expires 7d;
    }
}
```

#### Step 8 — Start the backend with PM2
```bash
cd /home/ec2-user/fmapp/backend
pm2 start src/server.js --name fmapp-backend

# Save PM2 process list
pm2 save

# Register PM2 to auto-start on server reboot
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u ec2-user --hp /home/ec2-user
```

### Ports & Traffic Flow on EC2

```
Internet
   │
   ▼ port 80 (HTTP)
 Nginx
   ├── /           → /home/ec2-user/fmapp/frontend/dist  (static React files)
   ├── /api/*      → 127.0.0.1:4000  (Node.js Express API)
   └── /uploads/*  → /home/ec2-user/fmapp/backend/uploads/

 Node.js (PM2)     → 127.0.0.1:4000
 MySQL 8.0         → 127.0.0.1:3306  (NOT exposed externally)
```

### Useful EC2 Commands

```bash
# Check PM2 status
pm2 status

# View backend logs (live)
pm2 logs fmapp-backend

# Restart backend after code change
pm2 restart fmapp-backend

# Check Nginx
sudo systemctl status nginx
sudo nginx -t              # test config
sudo systemctl reload nginx

# Check MySQL
sudo systemctl status mysqld

# Re-deploy (pull latest code and rebuild)
cd /home/ec2-user/fmapp
git pull origin develop
cd frontend && npm ci && npm run build
cd ../backend && npm ci
pm2 restart fmapp-backend
```

---

## 3. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         AWS EC2 Instance (13.206.99.117)                 │
│                                                                          │
│  ┌──────────────┐     ┌───────────────────────────────────────────────┐  │
│  │   Internet   │────▶│               Nginx (Port 80)                 │  │
│  │   Browser /  │     │  ┌─────────────────┐  ┌────────────────────┐  │  │
│  │  Mobile App  │     │  │  / (Frontend)   │  │  /api/* (Proxy)    │  │  │
│  └──────────────┘     │  │  React dist/    │  │  → localhost:4000  │  │  │
│                       │  └─────────────────┘  └────────────────────┘  │  │
│                       └───────────────────────────────────────────────┘  │
│                                           │                              │
│                          ┌────────────────▼──────────────────┐          │
│                          │    Node.js + Express (Port 4000)   │          │
│                          │    PM2 process: fmapp-backend       │          │
│                          │                                     │          │
│                          │  Routes: /api/auth, /api/assets,   │          │
│                          │  /api/companies, /api/checklists,  │          │
│                          │  /api/users, /api/notifications...  │          │
│                          └────────────────┬──────────────────┘          │
│                                           │                              │
│                          ┌────────────────▼──────────────────┐          │
│                          │    MySQL 8.0 (Port 3306)           │          │
│                          │    Database: fmapp                  │          │
│                          │    User: fmapp_user                │          │
│                          └───────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────┘

                         ┌──────────────────────────┐
                         │   React Native Mobile App │
                         │   (Expo / EAS Build)      │
                         │   Android APK             │
                         │   Calls: http://13.206... │
                         └──────────────────────────┘

                         ┌──────────────────────────┐
                         │   Web Admin Panel         │
                         │   React + Vite            │
                         │   Served by Nginx         │
                         └──────────────────────────┘
```

### Technology Stack

| Layer           | Technology                      | Purpose                          |
|-----------------|---------------------------------|----------------------------------|
| Web Frontend    | React 19 + Vite + React Router  | Admin & company portal web UI    |
| Mobile App      | React Native + Expo (TypeScript)| Field worker mobile app (Android)|
| Backend API     | Node.js 20 + Express            | REST API server                  |
| Database        | MySQL 8.0 (mysql2 driver)       | Persistent data storage          |
| Web Server      | Nginx                           | Reverse proxy + static file host |
| Process Manager | PM2                             | Keep Node alive, auto-restart    |
| Auth            | JWT (jsonwebtoken + bcryptjs)   | Token-based authentication       |
| File Uploads    | Multer                          | Logo & image uploads             |
| AI Queries      | OpenAI API                      | Asset query chat feature         |
| Deployment      | AWS EC2 (Amazon Linux 2023)     | Cloud hosting                    |

---

## 4. Database (ER) Diagram

### All Tables in the `fmapp` Database

```
clients
├── id (PK)
├── client_name
├── email (UNIQUE)
├── phone
├── state_name, pincode, gst_number, company_name, address
└── status, created_at, updated_at

users
├── id (PK)
├── full_name, email (UNIQUE), phone, role
├── password_hash
├── client_id (FK → clients.id)
└── status, created_at, updated_at

companies
├── id (PK)
├── company_name, company_code (UNIQUE)
├── description, address fields (city, state, country…)
├── gst_number, pan_number, cin_number
├── contract_start_date, contract_end_date, billing_cycle
├── max_employees
├── qsr_module, premeal_module, delivery_module (feature flags)
├── user_id (FK → users.id)
└── status, created_at, updated_at

departments
├── id (PK)
├── company_id (FK → companies.id)
├── name, description
└── created_at

assets
├── id (PK)
├── company_id (FK → companies.id)
├── department_id (FK → departments.id)
├── asset_name, asset_unique_id
├── asset_type: ENUM('soft','technical','fleet')
├── building, floor, room
├── qr_code
├── created_by (FK → users.id)
└── status, created_at, updated_at

asset_details
├── id (PK)
├── asset_id (FK → assets.id)
├── metadata JSON   ← flexible key-value data per asset type
└── documents JSON  ← attached file references

asset_history
├── id (PK)
├── asset_id (FK → assets.id)
├── action, details JSON
├── created_by (FK → users.id)
└── created_at

asset_checklists  (asset-specific checklists)
├── id (PK)
├── asset_id (FK → assets.id)
├── name, description
└── asset_category: ENUM('soft','technical','fleet')

asset_checklist_items
├── id (PK)
├── checklist_id (FK → asset_checklists.id)
├── title
├── answer_type: ENUM('yes_no','text')
├── is_required, order_index
└── created_at

asset_logs  (logsheet notes per asset)
├── id (PK)
├── asset_id (FK → assets.id)
├── note TEXT
├── created_by (FK → users.id)
└── created_at

checklist_templates
├── id (PK)
├── company_id (FK → companies.id)
├── template_name, asset_type, category, description
├── frequency: ENUM('Daily','Weekly','Monthly','Custom')
├── custom_hours JSON, shift
├── created_by (FK → users.id)
└── status, is_active, created_at

checklist_template_questions
├── id (PK)
├── template_id (FK → checklist_templates.id)
├── question_text
├── input_type: ENUM('text','yes_no','dropdown','number','photo','signature','ok_not_ok','remark')
├── is_required, order_index
└── options_json JSON, meta JSON

checklist_assignments
├── id (PK)
├── template_id (FK → checklist_templates.id)
├── assigned_to_type: ENUM('asset','location','department','user')
├── assigned_to_id
├── frequency, start_date, due_time
├── attached_by (FK → users.id)
└── status

checklist_submissions
├── id (PK)
├── template_id (FK → checklist_templates.id)
├── assignment_id (FK → checklist_assignments.id)
├── asset_id (FK → assets.id)
├── submitted_by (FK → users.id)
├── shift
├── status: ENUM('draft','pending','submitted','approved','rejected','overdue')
├── completion_pct
├── supervisor_by (FK → users.id)
├── supervisor_note
├── gps_lat, gps_lng
└── submitted_at, approved_at

checklist_submission_answers
├── id (PK)
├── submission_id (FK → checklist_submissions.id)
├── question_id (FK → checklist_template_questions.id)
├── question_text, input_type
└── answer_json JSON, option_selected

logsheet_templates
├── id (PK)
├── company_id (FK → companies.id)
├── template_name
├── asset_type: ENUM('soft','technical','fleet')
├── asset_model, header_config JSON, description
├── created_by (FK → users.id)
└── is_active, created_at

logsheet_sections
├── id (PK)
├── template_id (FK → logsheet_templates.id)
├── section_name, order_index
└── created_at

logsheet_questions
├── id (PK)
├── section_id (FK → logsheet_sections.id)
├── question_text, specification
├── answer_type: ENUM('yes_no','text','number')
├── rule_json JSON
├── is_mandatory, order_index
└── created_at

logsheet_template_assignments
├── id (PK)
├── template_id (FK → logsheet_templates.id)
├── asset_id (FK → assets.id)
├── attached_by (FK → users.id)
└── attached_at

logsheet_entries
├── id (PK)
├── template_id (FK → logsheet_templates.id)
├── asset_id (FK → assets.id)
├── submitted_by (FK → users.id)
├── entry_date, month, year, shift
├── header_values JSON, data JSON
└── submitted_at

logsheet_answers
├── id (PK)
├── entry_id (FK → logsheet_entries.id)
├── question_id (FK → logsheet_questions.id)
├── date_column (day of month 1-31)
├── answer_value
├── is_issue, issue_reason
└── created_at
```

### Key Relationships (Summary)

```
clients ──< users ──< companies ──< departments
                                 ──< assets ──< asset_details
                                            ──< asset_history
                                            ──< asset_checklists ──< asset_checklist_items
                                            ──< asset_logs
                                 ──< checklist_templates ──< checklist_template_questions
                                                         ──< checklist_assignments ──< checklist_submissions ──< checklist_submission_answers
                                 ──< logsheet_templates ──< logsheet_sections ──< logsheet_questions
                                                        ──< logsheet_template_assignments
                                                        ──< logsheet_entries ──< logsheet_answers
```

---

## 5. Application Flow Diagram

### User Authentication Flow

```
┌─────────────────────────────────────────────────────────┐
│                    LOGIN FLOW                            │
│                                                          │
│  [Web Admin / Root Portal]                               │
│    Username: rootadmin                                   │
│    Password: Root@12345  (hardcoded in App.jsx)          │
│    → localStorage: root_portal_auth                      │
│    → Access: Client Management, User Management          │
│                                                          │
│  [Company Portal Login] — /company-login                 │
│    Email + Password → POST /api/company-auth/login       │
│    → Returns JWT token                                   │
│    → localStorage: company_auth_token                    │
│    → Access: Company dashboard, assets, checklists       │
│                                                          │
│  [Mobile App Login] — /login screen                      │
│    Email + Password → POST /api/mobile-auth/login        │
│    → Returns JWT token                                   │
│    → AsyncStorage: authToken                             │
│    → Access: All mobile screens                          │
└─────────────────────────────────────────────────────────┘
```

### Checklist Submission Flow (Mobile App)

```
Field Worker (Mobile)
       │
       ▼
  Scan QR Code (qr-scanner.tsx)
       │
       ▼
  Asset Details Screen (asset-details.tsx)
  Shows: asset info, assigned checklist templates
       │
       ▼
  Select Checklist Template
       │
       ▼
  Checklist Entry Screen (checklist-entry.tsx)
  - Questions loaded from: GET /api/checklist-submissions/template/:id/questions
  - Answer types: text, yes/no, dropdown, photo, signature, ok_not_ok
       │
       ▼
  Submit → POST /api/checklist-submissions
       │
       ▼
  Status: draft → pending → submitted
       │
       ▼
  Supervisor Review (web portal)
  → Approve / Reject → status updated
       │
       ▼
  Report visible in: Submission Reports page
```

### Asset Registration Flow

```
Web Admin / Company Portal
       │
       ▼
  Create Asset → POST /api/assets
  (asset_type: soft | technical | fleet)
       │
       ▼
  Add asset details → POST /api/assets/:id/details
  (metadata JSON: flexible fields per type)
       │
       ▼
  Generate QR Code → GET /api/assets/:id/qr
  (QR contains asset URL for scanner)
       │
       ▼
  Assign Checklist Template → POST /api/checklist-assignments
  (which template, which frequency, start date)
       │
       ▼
  Mobile app worker scans QR → sees assigned checklists
```

### Healthcare Case Log Flow (HC Module)

```
Mobile App Worker
       │
       ▼
  HC Requests Screen (hc-requests.tsx)
  → GET /api/mobile-case-logs/requests
       │
       ▼
  Raise Case Log (hc-raise-case-log.tsx)
  → POST /api/mobile-case-logs
       │
       ▼
  Case is assigned + escalated (background job runs every N minutes)
  src/utils/escalationJob.js
       │
       ▼
  HC Case Log Detail (hc-case-log-detail.tsx)
  → GET /api/mobile-case-logs/:id
       │
       ▼
  Resolve / Close case
```

### Soft Service Request Flow

```
Mobile App (soft-raise.tsx)
       │
       ▼
  POST /api/soft-service-requests
  (category: cleaning, maintenance, etc.)
       │
       ▼
  Work Order created in DB
  Escalation job monitors overdue items
       │
       ▼
  Mobile App (soft-resolve.tsx)
  → PATCH /api/soft-service-requests/:id/resolve
       │
       ▼
  Status → resolved
```

### Notification Flow

```
Backend escalationJob.js (runs every N minutes via setInterval)
       │
       ▼
  Checks: overdue submissions, unresolved requests
       │
       ▼
  Inserts rows into notifications table
  POST /api/notifications (internal)
       │
       ▼
  Mobile App polls: GET /api/notifications
  (Notifications screen: notifications.tsx)
       │
       ▼
  Push notifications via Expo Notifications
  (only in standalone APK builds, not Expo Go)
```

---

## 6. Project Structure Explained

```
FM_Repo_rep/
├── backend/                    ← Node.js + Express API
│   ├── src/
│   │   ├── server.js           ← Entry point — starts HTTP server on PORT 4000
│   │   ├── app.js              ← Express app setup, all route imports, middleware
│   │   ├── db.js               ← MySQL connection pool + SQL normalizer
│   │   ├── validators.js       ← express-validator reusable validators
│   │   ├── middleware/         ← Auth JWT middleware, role guards
│   │   ├── routes/             ← One file per feature (32 route files)
│   │   └── utils/              ← escalationJob.js, workOrderEscalationJob.js, etc.
│   ├── sql/
│   │   ├── schema.sql          ← Complete DB schema (run once to create all tables)
│   │   ├── supplement-mysql.sql← Additional tables added later
│   │   └── migrations/         ← Incremental migration SQL files
│   ├── uploads/                ← Uploaded files (logos, query images)
│   ├── package.json
│   └── .env                    ← DB credentials, JWT secret, PORT
│
├── frontend/                   ← React 19 + Vite web admin panel
│   ├── src/
│   │   ├── main.jsx            ← React entry point
│   │   ├── App.jsx             ← Root component, routing, root login
│   │   ├── api.js              ← All API call functions (axios-style fetch)
│   │   ├── pages/              ← 8 page components
│   │   ├── components/         ← Shared UI components
│   │   └── styles.css          ← Global styles
│   ├── public/                 ← Static assets
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── mobile-app-v2/              ← React Native (Expo) Android app
│   ├── app/                    ← Expo Router file-based routing
│   │   ├── _layout.tsx         ← Root layout, auth bootstrapper, push notif setup
│   │   ├── index.tsx           ← Splash/home redirect
│   │   ├── login.tsx           ← Login screen
│   │   ├── assets.tsx          ← Asset list
│   │   ├── asset-details.tsx   ← Asset details + linked checklists
│   │   ├── qr-scanner.tsx      ← Camera QR scanner
│   │   ├── checklist-entry.tsx ← Fill out a checklist
│   │   ├── hc-*.tsx            ← Healthcare module screens
│   │   ├── soft-*.tsx          ← Soft service request screens
│   │   └── notifications.tsx   ← Notification list
│   ├── context/
│   │   └── AuthContext.tsx     ← Global auth state (user, token)
│   ├── utils/
│   │   ├── api.ts              ← All API calls for mobile
│   │   ├── theme.ts            ← Design tokens (colors, spacing, typography)
│   │   └── notifications.ts    ← Expo push notification setup
│   ├── components/             ← Shared mobile components (OfflineBanner, etc.)
│   ├── app.json                ← Expo app config (bundle ID, version, permissions)
│   ├── eas.json                ← EAS Build config (APK profiles)
│   └── package.json
│
├── ec2-deploy.sh               ← Full automated deployment script for EC2
├── setup-ec2.sh                ← Nginx + PM2 configuration script
└── run-migrations.sh           ← Runs SQL migration files in order
```

---

## 7. Backend API Routes Reference

| Route File               | Base Path                        | Purpose                                |
|--------------------------|----------------------------------|----------------------------------------|
| `auth.js`                | `/api/auth`                      | Root/admin login, JWT issue            |
| `companyAuth.js`         | `/api/company-auth`              | Company user login                     |
| `mobileAuth.js`          | `/api/mobile-auth`               | Mobile app login                       |
| `clients.js`             | `/api/clients`                   | CRUD for clients (top-level tenants)   |
| `users.js`               | `/api/users`                     | CRUD for admin users                   |
| `companies.js`           | `/api/companies`                 | CRUD for companies                     |
| `companyUsers.js`        | `/api/company-users`             | Employees within a company             |
| `companyRoles.js`        | `/api/company-roles`             | Role management per company            |
| `companyPortal.js`       | `/api/company-portal`            | Company portal dashboard data          |
| `departments.js`         | `/api/departments`               | Department CRUD                        |
| `assetTypes.js`          | `/api/asset-types`               | Asset type definitions                 |
| `assets.js`              | `/api/assets`                    | Asset CRUD + bulk import               |
| `assetQR.js`             | `/api/assets/:id/qr`             | QR code generation                     |
| `assetQueries.js`        | `/api/asset-queries`             | AI chat queries about assets           |
| `assetDashboard.js`      | `/api/asset-dashboard`           | Admin asset dashboard stats            |
| `companyPortalAssetDashboard.js` | `/api/cp-asset-dashboard` | Company-level asset dashboard       |
| `checklists.js`          | `/api/checklists`                | Asset-specific checklists              |
| `templateChecklists.js`  | `/api/checklist-templates`       | Template CRUD + questions              |
| `templateAssignments.js` | `/api/checklist-assignments`     | Assign templates to assets             |
| `submissionReports.js`   | `/api/checklist-submissions`     | Submission CRUD, approve/reject        |
| `logs.js`                | `/api/logs`                      | Asset log notes                        |
| `templateLogs.js`        | `/api/logsheet-templates`        | Logsheet template CRUD                 |
| `shifts.js`              | `/api/shifts`                    | Shift management                       |
| `flags.js`               | `/api/flags`                     | Answer flags/alerts                    |
| `flagRules.js`           | `/api/flag-rules`                | Rules that trigger flags               |
| `notifications.js`       | `/api/notifications`             | Notification list + mark read          |
| `softServiceRequests.js` | `/api/soft-service-requests`     | Soft service work orders               |
| `mobileCaseLogs.js`      | `/api/mobile-case-logs`          | Healthcare case logs                   |
| `healthcareDashboard.js` | `/api/healthcare-dashboard`      | HC module dashboard                    |
| `publicDashboard.js`     | `/api/public-dashboard`          | Public-facing dashboard data           |
| `upload.js`              | `/api/upload`                    | File upload (Multer)                   |
| `templateImport.js`      | `/api/template-import`           | Bulk import templates from Excel       |

---

## 8. Frontend Pages Reference

| File                        | URL Path              | Purpose                                     |
|-----------------------------|-----------------------|---------------------------------------------|
| `App.jsx` (RootLogin)       | `/`                   | Root admin login (rootadmin / Root@12345)   |
| `ClientManagement.jsx`      | `/clients`            | Manage clients (tenants)                    |
| `UserManagement.jsx`        | `/users`              | Manage admin users                          |
| `CompanyLogin.jsx`          | `/company-login`      | Company portal login page                   |
| `CompanyPortal.jsx`         | `/company-portal`     | Company dashboard: assets, checklists, etc. |
| `CompanyEmployeePortal.jsx` | `/company-employee`   | Employee-facing portal                      |
| `AssetScanPage.jsx`         | `/scan/:assetId`      | QR scan landing page (public)               |
| `SubmissionsPage.jsx`       | `/submissions`        | View & approve checklist submissions        |
| `PublicDashboard.jsx`       | `/public-dashboard`   | Public analytics dashboard                  |

---

## 9. Mobile App Screens Reference

| Screen File             | Route                  | Purpose                                        |
|-------------------------|------------------------|------------------------------------------------|
| `login.tsx`             | `/login`               | Email + password login                         |
| `index.tsx`             | `/`                    | Splash + redirect (login or home)              |
| `assets.tsx`            | `/assets`              | List all assets                                |
| `asset-details.tsx`     | `/asset-details`       | Asset detail, linked checklists & logsheets    |
| `qr-scanner.tsx`        | `/qr-scanner`          | Camera-based QR code scanner                   |
| `register-asset.tsx`    | `/register-asset`      | Register new asset via mobile                  |
| `checklist-entry.tsx`   | `/checklist-entry`     | Fill out a checklist                           |
| `checklist-history.tsx` | `/checklist-history`   | Past submission history                        |
| `all-templates.tsx`     | `/all-templates`       | Browse all available templates                 |
| `assign-template.tsx`   | `/assign-template`     | Assign template to asset                       |
| `asset-chat.tsx`        | `/asset-chat`          | AI chat query about asset                      |
| `asset-query.tsx`       | `/asset-query`         | Asset query form                               |
| `bulk-import-assets.tsx`| `/bulk-import-assets`  | Excel-based bulk asset import                  |
| `hc-requests.tsx`       | `/hc-requests`         | HC module — pending requests                   |
| `hc-raise-case-log.tsx` | `/hc-raise-case-log`   | Raise a new healthcare case                    |
| `hc-case-logs.tsx`      | `/hc-case-logs`        | HC case log list                               |
| `hc-case-log-detail.tsx`| `/hc-case-log-detail`  | HC case detail + resolution                    |
| `soft-raise.tsx`        | `/soft-raise`          | Raise soft service request                     |
| `soft-resolve.tsx`      | `/soft-resolve`        | Resolve soft service request                   |
| `my-requests.tsx`       | `/my-requests`         | My submitted requests                          |
| `history.tsx`           | `/history`             | Activity history                               |
| `notifications.tsx`     | `/notifications`       | Push notification inbox                        |
| `submission-detail.tsx` | `/submission-detail`   | Single submission detail                       |
| `training-detail.tsx`   | `/training-detail`     | Training content detail                        |

---

## 10. How to Make Manual Changes

### A. Change a Database Value Directly (on EC2)

```bash
# SSH into EC2
ssh -i your-key.pem ec2-user@13.206.99.117

# Connect to MySQL
mysql -u fmapp_user -p'FMapp@EC2#2026' fmapp

# Example: Reset a user's password (password must be bcrypt-hashed)
-- Note: bcrypt hash of "NewPass@123" — use the app's change-password API instead
UPDATE users SET password_hash='$2b$10$...' WHERE email='user@example.com';

# Example: Deactivate a company
UPDATE companies SET status='Inactive' WHERE id=5;

# Example: View all assets for a company
SELECT id, asset_name, asset_type, status FROM assets WHERE company_id=1;
```

### B. Modify Backend API (Express Route)

1. SSH into EC2:
   ```bash
   ssh -i your-key.pem ec2-user@13.206.99.117
   cd /home/ec2-user/fmapp/backend/src/routes
   ```

2. Edit the route file (e.g., `assets.js`):
   ```bash
   nano assets.js
   # Make your changes
   ```

3. Restart the backend:
   ```bash
   pm2 restart fmapp-backend
   pm2 logs fmapp-backend   # verify no errors
   ```

### C. Modify Frontend (Web Admin)

1. Make changes to files in `frontend/src/`
2. Build locally:
   ```bash
   cd frontend
   npm run build
   ```
3. Copy the `dist/` folder to EC2:
   ```bash
   scp -i your-key.pem -r dist/ ec2-user@13.206.99.117:/home/ec2-user/fmapp/frontend/
   ```
4. Nginx serves it immediately (no restart needed).

OR — pull latest from GitHub on EC2:
```bash
ssh -i your-key.pem ec2-user@13.206.99.117
cd /home/ec2-user/fmapp
git pull origin develop
cd frontend && npm ci && npm run build
```

### D. Add a New Database Table

1. Write your SQL, e.g., `new-table.sql`
2. Run it on EC2:
   ```bash
   mysql -u fmapp_user -p'FMapp@EC2#2026' fmapp < new-table.sql
   ```
3. Add corresponding routes in `backend/src/routes/`
4. Register router in `backend/src/app.js`
5. Restart backend: `pm2 restart fmapp-backend`

### E. Change the JWT Secret

1. On EC2, edit the `.env` file:
   ```bash
   nano /home/ec2-user/fmapp/backend/.env
   # Change: JWT_SECRET=your_new_secret
   ```
2. Restart backend:
   ```bash
   pm2 restart fmapp-backend
   ```
> **Warning:** Changing the JWT secret will invalidate all existing user sessions. Everyone will be logged out.

### F. Check if Backend is Running

```bash
# On EC2
pm2 status                         # see all processes
pm2 logs fmapp-backend --lines 50  # last 50 log lines
curl http://localhost:4000/api/health   # health check endpoint → {"status":"ok","db":"connected"}
```

### G. Re-run Database Migrations

```bash
ssh -i your-key.pem ec2-user@13.206.99.117
cd /home/ec2-user/fmapp
bash run-all-migrations.sh
```

### H. Build and Deploy Mobile APK

```bash
# On your local machine, in mobile-app-v2/
eas build --platform android --profile preview

# Download the APK from the EAS dashboard
# or use:
eas build:list
```

---

## Quick Reference Card

| What                          | Value / Command                                          |
|-------------------------------|----------------------------------------------------------|
| EC2 IP                        | `13.206.99.117`                                         |
| SSH user                      | `ec2-user`                                              |
| App directory on EC2          | `/home/ec2-user/fmapp`                                  |
| Database name                 | `fmapp`                                                 |
| DB user (EC2)                 | `fmapp_user`                                            |
| DB password (EC2)             | `FMapp@EC2#2026`                                        |
| DB user (local dev)           | `root`                                                  |
| DB password (local dev)       | `Pa@24224365`                                           |
| Backend port                  | `4000`                                                  |
| Health check                  | `http://13.206.99.117:4000/api/health`                  |
| Frontend URL                  | `http://13.206.99.117`                                  |
| Root admin login              | `rootadmin` / `Root@12345`                              |
| Restart backend               | `pm2 restart fmapp-backend`                             |
| View backend logs             | `pm2 logs fmapp-backend`                                |
| Reload nginx                  | `sudo systemctl reload nginx`                           |
| Connect to MySQL on EC2       | `mysql -u fmapp_user -p'FMapp@EC2#2026' fmapp`         |
| GitHub repo (branch)          | `Comprehensive-Cloud-Technologies/FM_Repo_rep` (develop)|
