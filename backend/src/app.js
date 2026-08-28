import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import hpp from "hpp";
import { requireAuth } from "./middleware/auth.js";
import path from "path";
import { fileURLToPath } from "url";
import pool from "./db.js";
import clientsRouter from "./routes/clients.js";
import usersRouter from "./routes/users.js";
import authRouter from "./routes/auth.js";
import companiesRouter from "./routes/companies.js";
import assetTypesRouter from "./routes/assetTypes.js";
import assetsRouter from "./routes/assets.js";
import departmentsRouter from "./routes/departments.js";
import checklistsRouter from "./routes/checklists.js";
import logsRouter from "./routes/logs.js";
import checklistTemplatesRouter from "./routes/templateChecklists.js";
import logsheetTemplatesRouter from "./routes/templateLogs.js";
import companyUsersRouter from "./routes/companyUsers.js";
import companyAuthRouter from "./routes/companyAuth.js";
import companyPortalRouter from "./routes/companyPortal.js";
import companyRolesRouter from "./routes/companyRoles.js";
import assetQRRouter from "./routes/assetQR.js";
import assetQueriesRouter from "./routes/assetQueries.js";
import mobileAuthRouter from "./routes/mobileAuth.js";
import templateAssignmentsRouter from "./routes/templateAssignments.js";
import submissionReportsRouter from "./routes/submissionReports.js";
import shiftsRouter from "./routes/shifts.js";
import flagsRouter from "./routes/flags.js";
import flagRulesRouter from "./routes/flagRules.js";
import notificationsRouter from "./routes/notifications.js";
import templateImportRouter from "./routes/templateImport.js";
import assetDashboardRouter from "./routes/assetDashboard.js";
import companyPortalAssetDashboardRouter from "./routes/companyPortalAssetDashboard.js";
import healthcareDashboardRouter from "./routes/healthcareDashboard.js";
import assetIntelligenceRouter from "./routes/assetIntelligence.js";
import assetTransferRouter from "./routes/assetTransfer.js";
import pmsChecklistsRouter from "./routes/pmsChecklists.js";
import calibrationRouter from "./routes/calibration.js";
import uploadRouter from "./routes/upload.js";
import softServiceRequestsRouter from "./routes/softServiceRequests.js";
import publicDashboardRouter from "./routes/publicDashboard.js";
import mobileCaseLogsRouter from "./routes/mobileCaseLogs.js";
import locationsRouter from "./routes/locations.js";
import statesRouter from "./routes/states.js";
import adminSlaRouter from "./routes/adminSla.js";
import companySlaRouter from "./routes/companySla.js";
import trainingRouter from "./routes/training.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// Trust the first proxy (nginx) so rate-limiter and req.protocol use the real client IP/protocol
app.set("trust proxy", 1);

const allowedOrigins = process.env.ALLOW_ORIGIN?.split(",").map((o) => o.trim());

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  })
);
app.use(express.json());
app.use(hpp()); // HTTP Parameter Pollution prevention
app.use(morgan("tiny"));

const healthHandler = async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected" });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[health] DB check failed:", err.message);
    res.status(503).json({ status: "degraded", db: "error", detail: err.message });
  }
};
// Rate-limit login/auth endpoints — 100 attempts per 5 minutes per IP
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many login attempts. Please try again in 5 minutes." },
});

// Global rate limiter — 2000 requests per minute per IP across all API routes
// The company portal dashboard fires ~20 parallel requests on load plus polling
// intervals for alerts/work-orders; 300/min was too low for real usage.
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down." },
});
app.use("/api/", globalLimiter);

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/clients", clientsRouter);
app.use("/api/users", usersRouter);
app.use("/api/companies", companiesRouter);
app.use("/api/asset-types", assetTypesRouter);
app.use("/api/departments", departmentsRouter);
app.use("/api/assets", assetsRouter);
app.use("/api/checklists", checklistsRouter);
app.use("/api/logs", logsRouter);
app.use("/api/checklist-templates", checklistTemplatesRouter);
app.use("/api/logsheet-templates", logsheetTemplatesRouter);
app.use("/api/company-users", companyUsersRouter);
app.use("/api/company-auth", authLimiter, companyAuthRouter);
// Mount specific sub-paths BEFORE the broad /api/company-portal catch-all so they take precedence
app.use("/api/company-portal/calibration", calibrationRouter);
app.use("/api/company-portal/sla", companySlaRouter);
app.use("/api/company-portal/training", trainingRouter);
app.use("/api/admin/sla", adminSlaRouter);
app.use("/api/company-portal", companyPortalRouter);
app.use("/api/company-portal/roles", companyRolesRouter);
app.use("/api/asset-qr", assetQRRouter);
app.use("/api", assetQueriesRouter);
app.use("/api/mobile-auth", authLimiter, mobileAuthRouter);
// Submission reports – accepts both company JWT and main-platform JWT (must be BEFORE templateAssignmentsRouter)
app.use("/api/template-assignments", submissionReportsRouter);
app.use("/api/template-assignments", templateAssignmentsRouter);
app.use("/api/shifts", shiftsRouter);
app.use("/api/flags", flagsRouter);
app.use("/api/flag-rules", flagRulesRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/template-import", templateImportRouter);
app.use("/api/asset-dashboard", assetDashboardRouter);
app.use("/api/company-portal/asset-dashboard", companyPortalAssetDashboardRouter);
app.use("/api/company-portal/healthcare", healthcareDashboardRouter);
app.use("/api/company-portal/asset-intelligence", assetIntelligenceRouter);
// Mounted AFTER companyPortalRouter so its specific /assets routes win; this
// adds asset transfer + transfer/calibration history endpoints (was unmounted).
app.use("/api/company-portal/assets", assetTransferRouter);
app.use("/api/company-portal/pms", pmsChecklistsRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/soft-service", softServiceRequestsRouter);
app.use("/api/public", publicDashboardRouter);
app.use("/api/mobile/case-logs", mobileCaseLogsRouter);
app.use("/api/locations", locationsRouter);
app.use("/api/states", statesRouter);

app.use("/uploads", (req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(path.join(__dirname, "../uploads")));

// Root portal login endpoint (credentials stored server-side in env)
app.post("/api/root-login", authLimiter, express.json(), (req, res) => {
  const { username, password } = req.body || {};
  const validUser = process.env.ROOT_USERNAME;
  const validPass = process.env.ROOT_PASSWORD;
  if (!validUser || !validPass) {
    return res.status(503).json({ ok: false, message: "Root login not configured" });
  }
  if (!username || !password) return res.status(400).json({ ok: false, message: "Missing credentials" });
  if (username.trim() === validUser && password === validPass) {
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, message: "Invalid username or password" });
});

// Gallery image-to-asset mapping endpoint
app.post("/api/gallery/assign", authLimiter, requireAuth, express.json(), async (req, res) => {
  const { assetId, files } = req.body;
  if (!assetId || !Array.isArray(files) || !files.length)
    return res.status(400).json({ ok: false, error: "assetId and files required" });
  try {
    const [[row]] = await pool.query("SELECT metadata FROM asset_details WHERE asset_id=?", [assetId]);
    if (!row) return res.status(404).json({ ok: false, error: "Asset not found" });
    const meta = JSON.parse(row.metadata || "{}");
    const existing = Array.isArray(meta.hcImages) ? meta.hcImages : [];
    const newUrls = files.map(f => `/uploads/query-images/recovered/${f}`);
    meta.hcImages = [...existing, ...newUrls];
    await pool.query("UPDATE asset_details SET metadata=? WHERE asset_id=?", [JSON.stringify(meta), assetId]);
    res.json({ ok: true, assigned: files.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: "Unexpected error" });
  }
});

// Basic 404 handler
app.use((req, res) => res.status(404).json({ message: "Not found", path: req.originalUrl }));

// Centralized error handler
app.use((err, _req, res, _next) => {
  // eslint-disable-next-line no-console
  console.error(err);
  const msg = String(err?.message || "");
  const code = String(err?.code || "");

  // Detect database connection / tenant configuration problems and surface a
  // clear, actionable message to mobile / web clients instead of leaking
  // low-level driver errors.
  const isDbConfigError =
    msg.includes("Tenant or user not found") ||
    msg.toLowerCase().includes("password authentication failed") ||
    msg.toLowerCase().includes("database") && msg.toLowerCase().includes("does not exist");
  const isDbUnreachable =
    code === "ECONNREFUSED" ||
    code === "ENETUNREACH" ||
    code === "ETIMEDOUT" ||
    msg.toLowerCase().includes("connect etimedout") ||
    msg.toLowerCase().includes("circuit breaker");

  if (isDbConfigError) {
    return res.status(503).json({
      message: "Database configuration error. Please contact your administrator.",
      code: "DB_CONFIG",
    });
  }
  if (isDbUnreachable) {
    return res.status(503).json({
      message: "Service temporarily unavailable. Please try again shortly.",
      code: "DB_UNREACHABLE",
    });
  }
  res.status(500).json({ message: "Unexpected error" });
});

export default app;
