/**
 * WhatsApp Cloud API webhook.
 *
 * Lets a person who scanned an asset QR raise a case log straight from WhatsApp
 * (no login). The inbound message is mapped to the asset via a "Ref:" token that
 * the scan page pre-fills, then inserted into `asset_queries` — the same table the
 * web scan form uses — so it shows up in the company's Requests / Asset Queries
 * panel.
 *
 * Endpoints (mounted at /api/whatsapp):
 *   GET  /webhook   – Meta verification handshake (hub.challenge).
 *   POST /webhook   – inbound messages + delivery statuses.
 *
 * This router is INERT until the Meta credentials are configured via env:
 *   WHATSAPP_VERIFY_TOKEN     – arbitrary string, must match the value you enter
 *                               in the Meta webhook config.
 *   WHATSAPP_APP_SECRET       – Meta App secret, used to verify request signatures.
 *   WHATSAPP_TOKEN            – permanent access token, used to send the reply.
 *   WHATSAPP_PHONE_NUMBER_ID  – the Cloud API phone-number id, used to send the reply.
 *
 * With none set, the GET handshake and reply-send simply no-op/log — existing
 * functionality is unaffected.
 */

import { Router } from "express";
import crypto from "crypto";
import pool from "../db.js";

const router = Router();

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";

/* ── helpers ─────────────────────────────────────────────────────────────────── */

// Verify Meta's HMAC-SHA256 signature. Returns true when no app secret is
// configured (so the webhook still works in a not-yet-secured setup) — set
// WHATSAPP_APP_SECRET in production to enforce it.
function verifySignature(req) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true;
  const sig = req.get("x-hub-signature-256");
  if (!sig || !req.rawBody) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", secret).update(req.rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Pull the asset reference the scan page embedded ("Ref: HTM-<id>" for a known
// asset, or "Ref: QR-<uid>" for a pre-generated sticker).
function parseRef(text) {
  const htm = text.match(/HTM-(\d+)/i);
  if (htm) return { assetId: Number(htm[1]) };
  const qr = text.match(/QR-([A-Za-z0-9][A-Za-z0-9-]*)/i);
  if (qr) return { uid: qr[1] };
  return {};
}

// Read the value the user typed after a "Label:" line, ignoring our bracketed
// hint lines like "(Low / Normal / High / Critical)".
function parseField(text, label) {
  const re = new RegExp(`${label}\\s*:\\s*(.+)`, "i");
  const m = text.match(re);
  if (!m) return null;
  const v = m[1].trim();
  if (!v || v.startsWith("(")) return null;
  return v;
}

// Everything after "Details:" (may span multiple lines).
function parseDetails(text) {
  const idx = text.search(/details\s*:/i);
  if (idx === -1) return null;
  const after = text.slice(idx).replace(/details\s*:/i, "").trim();
  return after || null;
}

async function resolveAsset({ assetId, uid }) {
  if (assetId) {
    const [[a]] = await pool.query(
      "SELECT id, company_id, asset_name FROM assets WHERE id = ?",
      [assetId]
    );
    return a || null;
  }
  if (uid) {
    const [[qr]] = await pool.query(
      "SELECT asset_id FROM asset_pre_qr WHERE qr_unique_id = ?",
      [uid]
    );
    if (qr?.asset_id) {
      const [[a]] = await pool.query(
        "SELECT id, company_id, asset_name FROM assets WHERE id = ?",
        [qr.asset_id]
      );
      return a || null;
    }
  }
  return null;
}

// Pick a default assignee (admin > supervisor > technician) for the company, so
// the request lands with an owner — mirrors the web scan-form behaviour.
async function pickAssignee(companyId) {
  try {
    const [[u]] = await pool.query(
      `SELECT id FROM company_users
        WHERE company_id = ? AND role IN ('admin','supervisor','technician')
        ORDER BY FIELD(role,'admin','supervisor','technician')
        LIMIT 1`,
      [companyId]
    );
    return u?.id || null;
  } catch {
    return null;
  }
}

async function sendReply(to, bodyText) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId || typeof fetch !== "function") return;
  try {
    await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        text: { body: bodyText },
      }),
    });
  } catch (err) {
    console.error("[whatsapp] reply send failed:", err.message);
  }
}

/* ── GET /webhook — Meta verification handshake ──────────────────────────────── */
router.get("/webhook", (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

/* ── POST /webhook — inbound messages ────────────────────────────────────────── */
router.post("/webhook", async (req, res) => {
  // Acknowledge Meta immediately; do the work after. Meta retries on non-200.
  if (!verifySignature(req)) return res.sendStatus(403);
  res.sendStatus(200);

  try {
    const entries = req.body?.entry || [];
    for (const entry of entries) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        const messages = value.messages || [];
        const contacts = value.contacts || [];
        const profileName = contacts[0]?.profile?.name || null;

        for (const msg of messages) {
          if (msg.type !== "text") continue; // only handle text for now
          const from = msg.from; // sender phone (E.164, no +)
          const text = (msg.text?.body || "").trim();
          if (!text) continue;

          const ref = parseRef(text);
          const asset = await resolveAsset(ref);
          if (!asset) {
            await sendReply(
              from,
              "We couldn't match this message to an equipment. Please scan the QR code on the machine again and send the pre-filled message without editing the *Ref* line."
            );
            continue;
          }

          const queryType = parseField(text, "Issue type");
          const priority = parseField(text, "Priority");
          const details = parseDetails(text);

          // Compose a readable message body for the Requests panel, keeping the
          // priority visible even though asset_queries has no priority column.
          const messageBody = [
            priority ? `Priority: ${priority}` : null,
            details || (!queryType ? text : null),
            "(raised via WhatsApp)",
          ]
            .filter(Boolean)
            .join("\n");

          const assignee = await pickAssignee(asset.company_id);

          await pool.execute(
            `INSERT INTO asset_queries
               (asset_id, company_id, requester_name, requester_phone, query_type, message, assigned_to)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              asset.id,
              asset.company_id,
              profileName || `WhatsApp ${from}`,
              from,
              queryType || null,
              messageBody,
              assignee,
            ]
          );

          await sendReply(
            from,
            `✅ Thank you! Your issue for *${asset.asset_name || "the equipment"}* has been logged with our team. We'll follow up shortly.`
          );
        }
      }
    }
  } catch (err) {
    console.error("[whatsapp] webhook processing error:", err.message);
  }
});

export default router;
