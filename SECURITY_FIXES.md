# Security & Quality Fixes — Audit Remediation Report (Full)

**Date:** 2026-07-28  
**Branch:** develop  
**Audited by:** Security Review  

---

## Summary

This document covers all findings across two audit sessions:
- **Session 1 (C-series):** Critical/High findings — 2 code changes, 5 already resolved.
- **Session 2 (M/L-series):** High/Medium/Low findings — 10 code changes, 3 already resolved, 7 documented as architectural recommendations.

---

## Session 2 — M/L-Series Fixes

---

## Session 2 — M/L-Series Fixes

### M-3 — Input Validation on Employee Create/Update Endpoints (MEDIUM)

**File:** `backend/src/routes/companyPortal.js` — `POST /employees`, `PUT /employees/:id`

#### What Was Wrong
Both employee management endpoints destructured `req.body` directly with no field-length or format checks. Unbounded string inputs can cause MySQL column overflow errors (silent data truncation) and allow absurdly large inputs to reach the database layer.

#### What Was Changed
Added inline guards at the top of both handlers before any DB operation:
- `fullName`: must be a non-empty string ≤ 160 chars
- `email`: must match basic `user@domain.tld` pattern and be ≤ 160 chars
- `phone`: optional, ≤ 32 chars
- `designation`: optional, ≤ 120 chars
- `username`: optional, ≤ 100 chars
- `password`: optional, but if supplied must be 6–255 chars

All limits match the actual column sizes in the `company_users` table.

---

### M-4 — SVG Files Permitted in Image Uploads (MEDIUM)

**File:** `backend/src/routes/companyPortal.js` — `uploadImage` multer instance (~line 43)

#### What Was Wrong
The image upload filter allowed `.svg` files and used `file.mimetype.startsWith("image/")` as a secondary pass — which also allows SVG (MIME type `image/svg+xml`). SVG is an XML format that can contain embedded `<script>` tags. If an SVG is ever served back to a browser (via a presigned S3 URL or the static uploads route), it executes as JavaScript in the user's origin — a stored XSS vector.

#### What Was Changed
```diff
- const allowed = /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i;
- if (allowed.test(file.originalname) || file.mimetype.startsWith("image/")) cb(null, true);
+ const allowed = /\.(jpg|jpeg|png|gif|webp|bmp)$/i;
+ const allowedMime = /^image\/(jpeg|png|gif|webp|bmp)$/;
+ if (allowed.test(file.originalname) && allowedMime.test(file.mimetype)) cb(null, true);
```

The MIME check was also tightened from an open `startsWith("image/")` to an explicit allowlist so that exotic image subtypes cannot be sneaked through.

---

### M-5 — OJT Upload Allows Macro-Capable File Types (MEDIUM)

**File:** `backend/src/routes/companyPortal.js` — `uploadOjt` multer instance (~line 29)

#### What Was Wrong
The OJT upload filter allowed `.odt` and `.ods` (OpenDocument formats). These formats can contain embedded macros. Any user who downloads a maliciously crafted `.odt`/`.ods` from S3 may execute those macros if they open the file in LibreOffice or Microsoft Office.

#### What Was Changed
```diff
- const allowed = /\.(mp4|mkv|avi|mov|webm|wmv|flv|3gp|pdf|doc|docx|csv|xlsx|xls|pptx|ppt|txt|odt|ods)$/i;
+ // .odt and .ods removed — OpenDocument formats can contain macros (M-5)
+ const allowed = /\.(mp4|mkv|avi|mov|webm|wmv|flv|3gp|pdf|doc|docx|csv|xlsx|xls|pptx|ppt|txt)$/i;
```

---

### M-6 — Unlimited Pagination on GET /api/users (MEDIUM)

**File:** `backend/src/routes/users.js` — `GET /`

#### What Was Wrong
The route returned every row in the `users` table with no `LIMIT`. In a large deployment this could return thousands of rows in a single response, causing memory pressure and slow serialization on the Node.js event loop.

#### What Was Changed
Added `LIMIT ? OFFSET ?` to the query, with pagination query-params (`?limit=` capped at 500, `?offset=`):

```diff
- const [rows] = await pool.query(`SELECT ... FROM users ...`);
+ const limit  = Math.min(Number(req.query.limit)  || 200, 500);
+ const offset = Math.max(Number(req.query.offset) || 0,   0);
+ const [rows] = await pool.query(`SELECT ... FROM users ... LIMIT ? OFFSET ?`, [limit, offset]);
```

Default page size is 200 rows; maximum is 500.

---

### M-7 — Assets API Returns Up to 5000 Rows Per Request (MEDIUM)

**File:** `backend/src/routes/companyPortal.js` — asset list query (~line 1551)

#### What Was Wrong
A single API call could load 5000 asset records including JSON metadata columns, producing a multi-megabyte response that blocks the Node.js event loop during serialisation. This was especially likely when `allCompanies=true` was passed.

#### What Was Changed
```diff
- const reqLimit = req.query.limit ? Math.min(Number(req.query.limit), 5000) : (req.query.allCompanies === "true" ? 5000 : 2000);
+ // Cap at 1000 rows to prevent multi-megabyte responses (M-7)
+ const reqLimit = req.query.limit ? Math.min(Number(req.query.limit), 1000) : (req.query.allCompanies === "true" ? 1000 : 200);
```

The hard cap drops from 5000 → 1000 rows and the unauthenticated default drops from 2000 → 200 rows. Clients that need more must paginate via `?limit=&offset=`.

---

### M-8 — JWT_SECRET Captured at Module Load Time in mobileAuth.js (MEDIUM)

**File:** `backend/src/routes/mobileAuth.js` — line 15

#### What Was Wrong
```js
const JWT_SECRET = process.env.JWT_SECRET; // captured once at startup
```
If `JWT_SECRET` is not set when the process starts, `JWT_SECRET` becomes `undefined`. In older versions of `jsonwebtoken`, `jwt.verify(token, undefined)` silently accepted **any** token. Although `jsonwebtoken@9` now throws on an `undefined` secret, the pattern also prevents the secret from being refreshed without a process restart (relevant for secret rotation without downtime).

#### What Was Changed
Removed the module-level constant. All three call sites now read directly from `process.env.JWT_SECRET`:

```diff
- const JWT_SECRET = process.env.JWT_SECRET;
  ...
- jwt.sign({ ... }, JWT_SECRET, { expiresIn: "90d" })
+ jwt.sign({ ... }, process.env.JWT_SECRET, { expiresIn: "90d" })
  ...
- jwt.verify(token, JWT_SECRET)
+ jwt.verify(token, process.env.JWT_SECRET)
```

If the variable is missing at call time, `jwt` throws `secretOrPrivateKey must have a value` — a clear, early failure rather than a silent security bypass.

---

### M-9 — Network Error Causes User Logout on App Resume (MEDIUM)

**File:** `mobile-app-v2/utils/api.ts` — `verifyToken()`

#### What Was Wrong
`verifyToken()` treated every non-`ok` response — including server errors (`5xx`) and network timeouts (`catch {}`) — the same as an expired-token `401`. It called `clearSession()` or returned `null` in all failure cases, which logged the user out. In a healthcare facility with spotty Wi-Fi, this could evict a nurse mid-shift simply because the backend was temporarily unreachable.

#### What Was Changed
The function now distinguishes between authentication failures and connectivity failures:

```diff
- if (!res.ok) { await clearSession(); return null; }
- } catch { return null; }

+ // Only clear session on definitive auth rejections
+ if (res.status === 401 || res.status === 403) { await clearSession(); return null; }
+ // Server/network error — return cached user without logging out
+ if (!res.ok) {
+   const cached = await getStoredUser();
+   return cached ? { user: cached } : null;
+ }
+ } catch {
+   // Network unreachable — return cached user
+   const cached = await getStoredUser();
+   return cached ? { user: cached } : null;
+ }
```

- `401` / `403` → session cleared (token expired or revoked — correct logout)
- `5xx` / network timeout → cached user returned (app stays functional offline)

---

### M-11 — Offline Queue Uses Math.random() for Item IDs (LOW-MEDIUM)

**File:** `mobile-app-v2/utils/offlineStorage.ts` — `addToOfflineQueue()`

#### What Was Wrong
```js
id: `${Date.now()}_${Math.random()}`
```
`Math.random()` is not cryptographically random. Two items queued in the same millisecond (e.g., a bulk submit) could produce the same `id`, causing the second item to silently overwrite the first when the array is serialised to `AsyncStorage`.

#### What Was Changed
```diff
- queue.push({ ...item, id: `${Date.now()}_${Math.random()}`, queuedAt: Date.now() });
+ // crypto.randomUUID() is available globally in React Native 0.73+ (RN 0.81.5 used here)
+ queue.push({ ...item, id: crypto.randomUUID(), queuedAt: Date.now() });
```

`crypto.randomUUID()` generates a version-4 UUID using the platform CSPRNG — collision probability is negligible even under high load.

---

### M-12 — Calibration Upload Disk Fallback Served Without Authentication (MEDIUM)

**File:** `backend/src/app.js` — static `/uploads/` route

#### What Was Wrong
Calibration certificates falling back to local disk (`uploads/calibration/`) were served via the unauthenticated Express static handler. Any user who knew or could guess a filename (e.g., via brute-force or a directory listing) could access PDF certificates that may contain vendor PHI.

#### What Was Changed
Added `flexCompanyAuth` middleware at the `/uploads/calibration` path prefix, mounted **before** the general static handler so it intercepts requests to that sub-path first:

```js
// Guard must come BEFORE the general static handler
app.use("/uploads/calibration", flexCompanyAuth);

app.use("/uploads", (req, res, next) => { ... }, express.static(...));
```

`flexCompanyAuth` accepts both company-user JWTs and platform-admin JWTs, returning `401` for any unauthenticated request. In production (S3 enabled), calibration files are served via presigned URLs through the authenticated API and this path is never reached.

---

### M-13 — Helmet Used with Default Configuration (No CSP) (MEDIUM)

**File:** `backend/src/app.js` — `app.use(helmet())`

#### What Was Wrong
`helmet()` with no arguments omits a `Content-Security-Policy` header. CSP is the primary defence against XSS on any Express application that serves HTML or mixed content (including uploaded files via the static route).

#### What Was Changed
Replaced `app.use(helmet())` with an explicit CSP configuration appropriate for a REST API / static-file server:

```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:     ["'none'"],   // deny all by default
      scriptSrc:      ["'none'"],   // no scripts from API responses
      objectSrc:      ["'none'"],   // no Flash/plugins
      frameAncestors: ["'none'"],   // prevent clickjacking
      imgSrc:         ["'self'", "data:", "blob:"],  // allow static images
      mediaSrc:       ["'self'"],   // allow static media (OJT videos)
      connectSrc:     ["'self'"],
    },
  },
}));
```

The frontend (React SPA served via Nginx) has its own CSP and is unaffected by this change.

---

### M-14 — Global Rate Limit of 2000 req/min Is Effectively No Limit (MEDIUM)

**File:** `backend/src/app.js` — `globalLimiter`

#### What Was Wrong
2000 requests per minute per IP (≈33 req/s) does not meaningfully protect against insider-threat enumeration, credential stuffing, or scraping. A compromised account can make thousands of requests before hitting the ceiling.

#### What Was Changed
```diff
- max: 2000,   // 33 req/s — effectively unlimited
+ max: 600,    // 10 req/s — comfortable for legitimate multi-tab portal usage
```

600 req/min accommodates the ~20 parallel requests the dashboard fires on load plus polling intervals, even for several concurrent users sharing a hospital NAT IP. Login endpoints retain their tighter `authLimiter` (100 per 5 minutes).

---

## Already Resolved in Session 2 (No Code Changes Required)

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| M-1 | HIGH | `plain_password` stored in company portal employee create/update | Not present — `companyPortal.js` employee routes never write to `plain_password`. Only the schema migration adds the column. |
| M-2 | HIGH | Default password `"changeme123"` stored plaintext | Not present — `companyUsers.js` line 520 uses `crypto.randomBytes(12).toString("hex")` as the default. |
| M-10 | MEDIUM | Mobile app communicates over plain HTTP | Not present — `API_BASE` in `api.ts` is `https://htm.catalystservices.eco`. HTTPS is already used. Certificate pinning is not feasible in managed Expo SDK. |

---

## Architectural Recommendations (Not Code-Fixed)

These issues require significant architectural changes or external tooling and are documented as recommendations for the engineering roadmap:

| ID | Finding | Recommendation |
|----|---------|---------------|
| M-15 | No refresh token / token revocation | Implement a token revocation list (Redis set of invalidated JTIs) checked on every verify call. Until then, the status check on `/verify` (already present) limits deactivated-user window to the next app resume. |
| M-16 | Bulk-import template endpoint is publicly accessible | Low risk (returns only an empty Excel template with column names). Add `requireCompanyAuth` if schema exposure is a concern. |
| L-1 | Dev Python scripts committed to `frontend/src/pages/` | Remove with `git rm` and add `*.py` to `.gitignore`. |
| L-2 | Duplicate helpers in `companyAuth.js` / `mobileAuth.js` | Extract `toObject`, `toArray`, `mergeCrudPermissions`, `readableModules` to `src/utils/authHelpers.js`. |
| L-4 | `multer-s3` dependency unused | Remove from `backend/package.json` with `npm uninstall multer-s3`. |
| L-5 | `xlsx@0.18.5` abandoned / vulnerable | Migrate to `exceljs` (MIT). |
| L-9 | `/uploads/` served without auth (non-calibration paths) | Use S3 presigned URLs exclusively and remove the disk-based static handler, or add per-directory auth middleware for training and query-images sub-paths. |
| L-13 | Biometric auth is a stub | Either implement real `expo-local-authentication` biometric gate or remove the UI. False trust in security controls is a UX security issue. |
| L-14 | `/verify-token` / `/me` endpoints not rate-limited | Wrap in a dedicated rate limiter (e.g., 60 req/min) separate from the global limiter. |

---

## Session 1 — C-Series Fixes

### Fix 1 — Cross-Company User Deletion Authorization Gap (CRITICAL)

**Finding ID:** C-4  
**Severity:** CRITICAL  

#### Files Changed

| File | Lines Affected |
|------|---------------|
| `backend/src/middleware/auth.js` | 10–16 |
| `backend/src/routes/companyUsers.js` | `DELETE /:id` handler |
| `backend/src/routes/companyUsers.js` | `DELETE /employees/:id` handler |

#### What Was Wrong

`DELETE /api/company-users/:id` and `DELETE /api/company-users/employees/:id` only verified that the target user **existed** — they did not verify that the authenticated user belonged to the **same company** as the user being deleted.

Because the main JWT secret (`JWT_SECRET`) is shared across all auth tiers (platform admin, company portal, mobile), a company admin JWT passes the `requireAuth` middleware on the `companyUsers` router. This allowed any company admin to delete staff accounts belonging to any other hospital tenant by simply calling the endpoint with an arbitrary `:id`.

#### Root Cause

`requireAuth` extracted only `{ id, email }` from the JWT payload and discarded the `companyId` claim that is embedded in company-user JWTs. No downstream handler re-read the company context from the token, so the ownership gate was never applied.

#### What Was Changed

**`backend/src/middleware/auth.js`**

```diff
- req.user = { id: payload.sub, email: payload.email };
+ req.user = {
+   id: payload.sub,
+   email: payload.email,
+   // company JWTs embed companyId — capture it so routes can enforce tenant isolation
+   companyId: payload.companyId != null ? parseInt(payload.companyId, 10) : null,
+ };
```

`requireAuth` now passes `companyId` through from the JWT payload when present. Platform admin JWTs do not contain `companyId`, so `req.user.companyId` is `null` for them — preserving existing platform admin behaviour.

**`backend/src/routes/companyUsers.js` — `DELETE /:id`**

Both the existence check and the `DELETE` statement now branch on `req.user.companyId`:

- **Company-scoped token** (`companyId` present): `WHERE id = ? AND company_id = ?` — the target user must belong to the requester's company. Any attempt to delete a user from another company returns `403 Access denied`.
- **Platform admin token** (`companyId` is null): no company restriction — platform admins retain full cross-tenant access as intended.

**`backend/src/routes/companyUsers.js` — `DELETE /employees/:id`**

Identical branch logic applied: company-scoped tokens get `AND company_id = ?` enforced on both the lookup and the `DELETE`; platform admin tokens are unrestricted.

#### Impact

- Any company admin who attempted to delete another tenant's staff will now receive `403 Access denied`.
- Platform admins are unaffected.
- No database schema changes required.

---

### Fix 2 — PostgreSQL Syntax in MySQL Escalation Job (HIGH)

**Finding ID:** C-8  
**Severity:** HIGH  

#### File Changed

| File | Lines Affected |
|------|---------------|
| `backend/src/utils/escalationJob.js` | Main flag query (~line 63) |

#### What Was Wrong

The escalation job used `EXTRACT(EPOCH FROM (NOW() - f.created_at)) / 3600` to calculate how many hours a flag had been open. This is **PostgreSQL-only syntax** and throws a syntax error on MySQL 8. Because the error was absorbed by the outer `try/catch` (which only logged `err.message` at the top-level function boundary), the failure was **not surfaced in PM2 logs in a way that would alert operators**.

The practical consequence: the entire flag escalation engine had never successfully fired on the MySQL production database. Open critical flags were never escalated, SLA deadlines were never enforced, and supervisors were never notified — a significant risk in a healthcare environment.

#### What Was Changed

**`backend/src/utils/escalationJob.js`**

```diff
- EXTRACT(EPOCH FROM (NOW() - f.created_at)) / 3600 AS ageHours
+ TIMESTAMPDIFF(HOUR, f.created_at, NOW()) AS ageHours
```

`TIMESTAMPDIFF(HOUR, start, end)` is standard MySQL 8 syntax and returns the same integer hour-difference.

The main flag query was also moved into its **own `try/catch` block** with an explicit `console.error` and early return:

```js
try {
  [staleFlags] = await pool.query(`...TIMESTAMPDIFF(HOUR, f.created_at, NOW())...`);
} catch (queryErr) {
  console.error("[EscalationJob] Main escalation query failed:", queryErr.message);
  return;
}
```

This ensures that if the query ever fails again (e.g., due to a schema change), the error appears immediately and unambiguously in PM2 logs rather than being swallowed silently.

#### Impact

- The escalation engine will now execute successfully on every 30-minute tick.
- Flags that exceed their severity threshold will be escalated, supervisor notifications will fire, and SLA breach detection will run as designed.
- The explicit error log means any future query failures are immediately visible in `pm2 logs`.

---

## Already Resolved (No Code Changes Required)

The following findings from the audit were confirmed to be **already remediated** in the codebase:

| ID | Severity | Finding | Resolution Already Present |
|----|----------|---------|---------------------------|
| C-2 | CRITICAL | Hardcoded production credentials (`DB_PASS`, `JWT_SECRET`, `ROOT_PASSWORD`) in `ec2-deploy.sh` | `${VAR:?ERROR: ...}` bash parameter expansion — script aborts at startup if any secret is not exported. Hardcoded literals removed. |
| C-3 | CRITICAL | Weak, predictable JWT secret | `ec2-deploy.sh` comment instructs generation via `node -e "require('crypto').randomBytes(32).toString('hex')"`. Secret must be supplied externally. |
| C-5 | HIGH | `GET /api/company-portal/all-companies` returns all tenants to any authenticated user | Role guard present: only `catalyst_admin` and `engineer` receive the full list. All other roles receive only their own company record. |
| C-6 | HIGH | `GET /api/company-portal/departments-by-company/:companyId` allows any user to fetch departments for any company | Ownership check present: non-engineer/admin roles must match `companyId` or have an explicit row in `user_company_access`. Returns `403` otherwise. |
| C-7 | HIGH | Production traffic served over plain HTTP | `ec2-deploy.sh` generates an HTTPS Nginx config (port 443, TLS 1.2/1.3, HTTP→HTTPS redirect) when `DOMAIN_NAME` is exported. Certbot install instructions included. |

---

## Recommended Follow-up Actions

These items are outside the scope of code changes but should be actioned by the infrastructure/ops team:

1. **Rotate all three secrets immediately** — `DB_PASS`, `JWT_SECRET`, and `ROOT_PASSWORD` committed in the git history must be treated as compromised. Generate new values, update GitHub Actions secrets, redeploy.
2. **Generate a strong JWT secret** — run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` and store the output in your secrets manager.
3. **Enable HTTPS** — export `DOMAIN_NAME` before running `ec2-deploy.sh`, then run `sudo certbot --nginx -d <your-domain> --non-interactive --agree-tos -m admin@<your-domain>`.
4. **Consider separate JWT secrets per auth tier** — all three flows (platform, company portal, mobile) currently share one `JWT_SECRET`. Using separate secrets eliminates the cross-tier token reuse vector entirely.
