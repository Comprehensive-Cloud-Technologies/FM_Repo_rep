/**
 * fcmService.js
 * Firebase Cloud Messaging — backend push notification sender.
 *
 * Setup (one-time):
 *   1. Go to Firebase Console → Project Settings → Service Accounts
 *   2. Click "Generate new private key" and download the JSON file
 *   3. Save it as:  backend/firebase-service-account.json
 *      OR set env var:  FIREBASE_SERVICE_ACCOUNT_JSON=<full JSON string>
 *
 * The google-services.json (for the Android app) belongs in the
 * Android project's app/ directory — not needed here.
 *
 * Firebase project: android-app-de078
 * Android package:  com.cct.htmapp
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

const __dirname = dirname(fileURLToPath(import.meta.url));

let _initialized = false;
let _messaging    = null;

function init() {
  if (_initialized) return;

  // Already initialized externally (e.g. by other module)?
  if (getApps().length > 0) {
    _messaging    = getMessaging();
    _initialized  = true;
    return;
  }

  let credential;

  // Priority 1: env var (for cloud / CI deployments)
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
      credential   = cert(parsed);
    } catch {
      console.warn("[FCM] FIREBASE_SERVICE_ACCOUNT_JSON is set but failed to parse — notifications disabled.");
      return;
    }
  } else {
    // Priority 2: local file
    const keyPath = join(__dirname, "../../firebase-service-account.json");
    if (existsSync(keyPath)) {
      try {
        const raw  = JSON.parse(readFileSync(keyPath, "utf8"));
        credential = cert(raw);
      } catch {
        console.warn("[FCM] Failed to parse firebase-service-account.json — notifications disabled.");
        return;
      }
    }
  }

  if (!credential) {
    console.warn("[FCM] No service account configured — push notifications disabled.");
    console.warn("[FCM] Download the key from Firebase Console → Project Settings → Service Accounts");
    console.warn("[FCM] Save as:  backend/firebase-service-account.json");
    return;
  }

  initializeApp({ credential, projectId: "android-app-de078" });
  _messaging   = getMessaging();
  _initialized = true;
  console.log("[FCM] Firebase Admin initialized ✓");
}

// Run init once on module load
init();

/**
 * Send a push notification to a single FCM device token.
 * Silently swaps invalid/expired tokens with the error message.
 *
 * @param {string} fcmToken  — The device's FCM registration token
 * @param {string} title     — Notification title
 * @param {string} body      — Notification body text
 * @param {object} data      — Optional key-value payload (all strings)
 * @returns {Promise<boolean>} true on success, false on failure
 */
export async function sendPushNotification(fcmToken, title, body, data = {}) {
  if (!_messaging) return false;
  if (!fcmToken)   return false;

  // Ensure all data values are strings (FCM requirement)
  const safeData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
  );

  try {
    await _messaging.send({
      token:        fcmToken,
      notification: { title, body },
      data:         safeData,
      android: {
        priority: "high",
        notification: {
          channelId: "pms_alerts",
          sound:     "default",
          priority:  "max",
          visibility: "public",
        },
      },
    });
    return true;
  } catch (err) {
    // Log but never throw — notifications are best-effort
    console.warn(`[FCM] Failed to send to token ...${fcmToken.slice(-8)}:`, err.message);
    return false;
  }
}

/**
 * Send to multiple tokens at once (up to 500 per batch).
 * Returns { successCount, failureCount }
 */
export async function sendMulticast(fcmTokens, title, body, data = {}) {
  if (!_messaging || !fcmTokens?.length) return { successCount: 0, failureCount: 0 };

  const safeData = Object.fromEntries(
    Object.entries(data).map(([k, v]) => [k, String(v ?? "")])
  );

  const chunks = [];
  for (let i = 0; i < fcmTokens.length; i += 500) chunks.push(fcmTokens.slice(i, i + 500));

  let successCount = 0, failureCount = 0;
  for (const chunk of chunks) {
    try {
      const result = await _messaging.sendEachForMulticast({
        tokens:       chunk,
        notification: { title, body },
        data:         safeData,
        android: {
          priority: "high",
          notification: { channelId: "pms_alerts", sound: "default", priority: "max" },
        },
      });
      successCount += result.successCount;
      failureCount += result.failureCount;
    } catch (err) {
      console.warn("[FCM] Multicast batch error:", err.message);
      failureCount += chunk.length;
    }
  }
  return { successCount, failureCount };
}
