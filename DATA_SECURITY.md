# Data Security — HTM / FM App

*Reflects the codebase as of July 2026 (develop branch)*

---

## 1. Authentication

### 1.1 JWT-Based Stateless Auth

Three independent JWT flows, all signed with the same `JWT_SECRET` env var:

| Flow | Issued by | Middleware enforcing it | Token lifetime |
|---|---|---|---|
| Main platform (admin/ops) | `POST /api/auth/login` | `requireAuth` | 8 h |
| Company portal (employees) | `POST /api/company-auth/login` | `requireCompanyAuth` | 8 h |
| Mobile (field users) | `POST /api/mobile-auth/login` | `requireCompanyAuth` | 8 h |

Tokens are sent as `Authorization: Bearer <token>` and verified on every request. Expired or tampered tokens return `401`.

`flexCompanyAuth` is used on shared routes that must accept either token type (e.g. submission reports).

### 1.2 Password Hashing

All passwords are hashed with **bcryptjs** at cost factor **10** before being stored. Plain-text passwords are never persisted or logged.

```
bcrypt.hash(password, 10)   // on create/update
bcrypt.compare(plain, hash) // on login
```

This applies to: `users`, `company_users`, and all auth routes.

### 1.3 Root Admin Login

A separate root login endpoint (`POST /api/root-login`) is protected by credentials stored entirely in server-side env vars (`ROOT_USERNAME`, `ROOT_PASSWORD`). If either env var is unset, the endpoint returns `503` — it cannot be brute-forced without the env configuration.

---

## 2. Authorization & Role-Based Access Control

### 2.1 Permission Model

Every company portal user has a three-layer effective permission set computed at login:

1. **Role defaults** — `role_permissions.permissions` JSON (per company, per role)
2. **User overrides** — `company_users.permissions` JSON
3. **Module access** — explicit list or auto-derived from readable permissions

The merged effective policy is embedded in the JWT payload at login and enforced server-side on every request via `req.companyUser.role`.

### 2.2 Multi-Tenancy Isolation

All company-portal routes use `getAccessibleCompanyIds(userId, companyId)` to enforce that a user can only read/write data belonging to their own company hierarchy. Cross-company data leakage is prevented at the query level with parameterized `WHERE company_id IN (?)` clauses.

---

## 3. API-Level Security

### 3.1 HTTP Security Headers — Helmet.js

`helmet()` is applied globally on every response. This sets:

- `Content-Security-Policy`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: SAMEORIGIN`
- `Strict-Transport-Security` (when served over HTTPS)
- `Referrer-Policy`
- `X-XSS-Protection`
- And several others by default

### 3.2 CORS — Allowlist Only

CORS is configured with an explicit origin allowlist read from `ALLOW_ORIGIN` (comma-separated in `.env`). If the env var is empty, CORS is completely disabled (`origin: false`). No wildcard `*` is used.

```js
origin: allowedOrigins?.length > 0 ? allowedOrigins : false,
credentials: true,
```

### 3.3 Rate Limiting

| Limiter | Routes | Window | Max requests |
|---|---|---|---|
| `authLimiter` | `/api/auth`, `/api/company-auth`, `/api/mobile-auth`, `/api/root-login` | 5 minutes | 100 per IP |
| `globalLimiter` | All `/api/*` routes | 1 minute | 2 000 per IP |

Exceeding limits returns `429 Too Many Requests`. Configured with `standardHeaders: true` so clients receive `RateLimit-*` headers.

### 3.4 HTTP Parameter Pollution (HPP)

`hpp()` middleware is applied globally to prevent attackers from sending duplicate query-string parameters to confuse the application logic (e.g. `?role=admin&role=employee`).

### 3.5 Input Validation

Login endpoints use **express-validator** rules enforced via the `validate()` middleware. Validation errors return `400` with the first failing message before the request reaches any business logic or database query.

### 3.6 Parameterized SQL Queries

All database queries use the **mysql2** parameterized query API (`?` placeholders). No string interpolation or template literals are used to construct SQL. This eliminates SQL injection at the data-access layer.

```js
pool.query("SELECT * FROM users WHERE email = ?", [email])
```

---

## 4. File Upload Security

Uploads are handled by **multer** with strict controls before any file reaches storage:

| Control | Value |
|---|---|
| Allowed extensions | `jpeg`, `jpg`, `png`, `gif`, `webp`, `pdf`, `mp4`, `mov`, `avi` |
| Max file size | **20 MB** |
| Storage engine | `memoryStorage()` — file is never written to EC2 disk |
| Filename on storage | `<timestamp>-<random6digits>.<ext>` — original name is discarded, preventing path-traversal |
| Auth required | `requireAuth` middleware must pass before upload handler runs |

---

## 5. AWS S3 Storage

### 5.1 Bucket

All uploaded files are stored in a dedicated S3 bucket:  
`s3://catalysthtmappuploads` (region: `ap-south-1`)

Folder namespacing keeps file types isolated:

| Folder | Contents |
|---|---|
| `uploads/` | Generic single-file uploads |
| `query-images/` | Asset query before/after photos |
| `logos/` | Company logos |
| `ojt/` | OJT training PDFs/videos |
| `asset-images/` | Asset registration photos (mobile) |
| `tmp-excel/` | Bulk import XLSX files |

### 5.2 Credentials

AWS credentials are injected via environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`). If those vars are absent, the SDK falls back to the IAM Instance Profile of the EC2 machine — meaning on production EC2 no long-lived keys need to be stored at all.

### 5.3 Pre-Signed URLs

File access uses **pre-signed GET URLs** that expire after a configurable `AWS_S3_URL_EXPIRY` (default **3 600 seconds / 1 hour**). The bucket does not need to be public. Expired URLs return `403` from S3.

---

## 6. Infrastructure (EC2 + Nginx)

### 6.1 Nginx Reverse Proxy

Nginx sits in front of the Node.js backend (port 4000). The backend is **not exposed directly** to the internet. Nginx forwards:

- `/api/*` → `http://localhost:4000`
- `/uploads/*` → `http://localhost:4000`
- All other paths → React SPA (`index.html`)

Real client IP is preserved via `X-Real-IP` and `X-Forwarded-For` headers, and the backend sets `trust proxy 1` so rate-limiting uses the real IP rather than the proxy address.

### 6.2 PM2 Process Manager

The backend runs under **PM2** with auto-restart on crash and auto-start on EC2 reboot (`pm2 save` + startup hook). This prevents prolonged service outages from unexpected crashes.

### 6.3 Dependencies

Production deployment uses `npm ci --omit=dev`, ensuring no development/testing packages are installed on the server.

---

## 7. Secrets Management

All secrets are stored in a `.env` file at `backend/.env` and loaded with `dotenv`. The file is **not committed to source control** (`.gitignore`). Secrets in use:

| Variable | Purpose |
|---|---|
| `JWT_SECRET` | Signs / verifies all JWTs |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL connection |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | S3 access (optional if IAM role is used) |
| `AWS_S3_BUCKET`, `AWS_REGION`, `AWS_S3_URL_EXPIRY` | S3 configuration |
| `ROOT_USERNAME`, `ROOT_PASSWORD` | Root admin login |
| `ALLOW_ORIGIN` | CORS allowlist |

---

## 8. Known Gaps & Recommendations

| # | Gap | Recommendation |
|---|---|---|
| 1 | **No HTTPS** — Current Nginx config listens on port 80 only | Install a TLS certificate via Let's Encrypt (`certbot --nginx`) and redirect all HTTP → HTTPS |
| 2 | **Root password not hashed** — `ROOT_PASSWORD` is compared as a plain string | Hash it with bcrypt or replace with a short-lived admin JWT flow |
| 3 | **S3 URL generation** — `buildS3Url()` returns a permanent direct URL (not pre-signed); pre-signed URL generation exists but isn't always called | Audit each call-site and consistently use `getPresignedUrl()` for private content |
| 4 | **No account lockout** — Rate limiter is IP-based; a distributed attacker can still try 100 passwords per 5 min per credential pair | Add failed-login counting per user and lock the account after N consecutive failures |
| 5 | **JWT no revocation** — Tokens are valid for 8 hours with no server-side invalidation | Add a server-side token blocklist (Redis or DB table) on logout for high-sensitivity roles |
| 6 | **MySQL exposed on default port** — No indication port 3306 is restricted | Ensure EC2 Security Group inbound rules block 3306 from 0.0.0.0/0; allow only the EC2 private IP or VPC CIDR |
