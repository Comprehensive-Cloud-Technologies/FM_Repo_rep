/**
 * mobileNotifications.js
 * Routes for mobile app FCM token management.
 * Prefix (registered in app.js): /api/mobile/notifications
 *
 * Endpoints:
 *   POST /register-token   — save/update FCM token for the logged-in mobile user
 *   DELETE /token          — unregister FCM token (on logout)
 */

import { Router }             from "express";
import pool                   from "../db.js";
import { requireCompanyAuth } from "../middleware/companyAuth.js";

const router = Router();

// ── Auto-migration: add fcm_token columns to company_users ──────────────────
(async () => {
  const safe = async (sql) => {
    try { await pool.query(sql); }
    catch { /* column already exists */ }
  };
  await safe(`ALTER TABLE company_users ADD COLUMN fcm_token VARCHAR(512) NULL`);
  await safe(`ALTER TABLE company_users ADD COLUMN fcm_token_updated_at DATETIME NULL`);
})();

router.use(requireCompanyAuth);

/**
 * POST /api/mobile/notifications/register-token
 * Body: { token: "<fcm registration token>" }
 * Called by the Android app after obtaining an FCM token.
 */
router.post("/register-token", async (req, res, next) => {
  try {
    const { token: fcmToken } = req.body;
    if (!fcmToken || typeof fcmToken !== "string" || fcmToken.length < 10) {
      return res.status(400).json({ message: "Invalid FCM token" });
    }

    const userId = req.companyUser.id;
    await pool.query(
      `UPDATE company_users
          SET fcm_token = ?, fcm_token_updated_at = NOW()
        WHERE id = ?`,
      [fcmToken.trim(), userId]
    );

    res.json({ ok: true, message: "FCM token registered" });
  } catch (err) { next(err); }
});

/**
 * DELETE /api/mobile/notifications/token
 * Called on logout to invalidate the stored token.
 */
router.delete("/token", async (req, res, next) => {
  try {
    const userId = req.companyUser.id;
    await pool.query(
      `UPDATE company_users SET fcm_token = NULL, fcm_token_updated_at = NOW() WHERE id = ?`,
      [userId]
    );
    res.json({ ok: true, message: "FCM token cleared" });
  } catch (err) { next(err); }
});

export default router;
