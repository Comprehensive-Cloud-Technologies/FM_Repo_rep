# Releasing & Deployment

This project uses **semantic versioning** and **tag-triggered deployments**.
Pushing a `vX.Y.Z` tag builds the app and ships it to the production EC2 server
via GitHub Actions.

---

## Branch strategy

| Branch      | Purpose                                                        |
|-------------|----------------------------------------------------------------|
| `develop`   | Integration branch. Day-to-day work merges here. CI runs on it. |
| `main`      | Mirrors what is (or is about to be) released.                   |
| `vX.Y.Z` tag| An immutable release. Pushing it triggers the production deploy. |

Feature work → PR into `develop` → CI must pass → merge. When `develop` is ready
to ship, cut a release (below).

## Version numbers (SemVer)

`MAJOR.MINOR.PATCH` — e.g. `1.4.2`.

- **PATCH** (`1.1.0 → 1.1.1`) — backward-compatible bug fixes only.
- **MINOR** (`1.1.1 → 1.2.0`) — new features/behaviour, backward compatible.
- **MAJOR** (`1.2.0 → 2.0.0`) — breaking changes to data, APIs, or workflows.

The version lives in three places kept in sync by the release script:
`VERSION`, `frontend/package.json`, and `backend/package.json`. The running
backend reports it at `GET /api/version` and inside `GET /api/health`.

---

## Cutting a release

### Option A — helper script (recommended)

From the repo root, on an up-to-date `develop`:

```bash
pwsh scripts/release.ps1 1.2.0
```

The script bumps the three version files, stamps a dated heading in
`CHANGELOG.md` (move your notes from **Unreleased** into it first), commits, and
creates the `v1.2.0` tag. Then push:

```bash
git push origin develop --follow-tags
```

### Option B — manual

1. Move your notes from `## [Unreleased]` into a new `## [1.2.0] - YYYY-MM-DD`
   heading in `CHANGELOG.md`.
2. Set the version in `VERSION`, `frontend/package.json`, `backend/package.json`.
3. Commit: `git commit -am "chore(release): 1.2.0"`.
4. Tag: `git tag -a v1.2.0 -m "v1.2.0"`.
5. Push: `git push origin develop --follow-tags`.

Pushing the tag starts the **Deploy to EC2** workflow. Watch it under the
repository's **Actions** tab. It finishes with a health check against the live
server.

---

## One-time setup: GitHub secrets

Add these under **Settings → Secrets and variables → Actions → New repository
secret**:

| Secret        | Required | Value                                                       |
|---------------|----------|-------------------------------------------------------------|
| `EC2_SSH_KEY` | yes      | The **private** SSH key (full PEM, incl. header/footer) that logs into the server. |
| `EC2_HOST`    | yes      | Server IP or hostname, e.g. `13.206.99.117`.                |
| `EC2_USER`    | yes      | SSH user, e.g. `ec2-user`.                                  |
| `EC2_APP_DIR` | no       | App dir on the server. Defaults to `/home/ec2-user/fmapp`.  |
| `HEALTH_URL`  | no       | Health URL to verify. Defaults to `https://htm.catalystservices.eco/api/health`. |

> The runner connects over SSH from GitHub's IP ranges, so the server's security
> group must allow inbound SSH (port 22). If SSH is locked to office IPs, either
> add GitHub's ranges or run the deploy from a self-hosted runner.

An optional **production environment** (Settings → Environments → `production`)
lets you require a manual approval before each deploy and restrict which
branches/tags can deploy.

---

## What the deploy does (and does not) touch

Ships only application code — **data-safe**:

- ✅ `backend/src` and `frontend/dist` are updated; prod dependencies installed;
  PM2 reloaded (zero-downtime); nginx reloaded.
- ⛔ The server's `.env`, the MySQL database, and `uploads/` are never modified.
- Database schema migrations run automatically on backend startup (the routes'
  `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... IF NOT EXISTS` blocks), so no
  separate migration step is needed.

## Rollback

Re-deploy a previous good tag from the **Actions** tab:

1. Actions → **Deploy to EC2** → **Run workflow**.
2. Set **ref** to the older tag (e.g. `v1.1.0`) and run.

Because deploys are data-safe, rolling back code does not touch data. (If a
release included a schema change, rolling back code is still safe — additive
`IF NOT EXISTS` migrations leave the extra columns in place, unused.)

## Manual fallback

The original `deploy-incremental.ps1` still works for an ad-hoc deploy from a
developer machine and does the same data-safe steps. Prefer the tagged workflow
for anything that should be traceable to a version.
