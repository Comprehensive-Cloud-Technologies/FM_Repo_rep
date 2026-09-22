/**
 * zohoBooks.js — Zoho Books integration (Purchase Orders + Bills).
 *
 * Server-to-server via the Zoho Books REST API. Enabled only when
 * BOOKS_PROVIDER=zoho and all credentials are present, so the internal Books
 * flow keeps working untouched until the org opts in.
 *
 * One-time setup (Zoho API Console → Self Client):
 *   1. Create a Self Client, note client_id / client_secret.
 *   2. Generate a grant token with scope:
 *        ZohoBooks.purchaseorders.CREATE,ZohoBooks.bills.CREATE,
 *        ZohoBooks.contacts.CREATE,ZohoBooks.contacts.READ
 *   3. Exchange the grant token once for a long-lived refresh_token.
 *
 * .env:
 *   BOOKS_PROVIDER=zoho
 *   ZOHO_DC=in                 # data centre: in | com | eu | com.au | jp
 *   ZOHO_ORG_ID=xxxxxxxxx
 *   ZOHO_CLIENT_ID=...
 *   ZOHO_CLIENT_SECRET=...
 *   ZOHO_REFRESH_TOKEN=...
 */

const DC = (process.env.ZOHO_DC || "in").replace(/^\./, "");
const ACCOUNTS = `https://accounts.zoho.${DC}`;
const API = `https://www.zohoapis.${DC}/books/v3`;
const ORG_ID = process.env.ZOHO_ORG_ID;

export function isZohoEnabled() {
  return (
    (process.env.BOOKS_PROVIDER || "internal").toLowerCase() === "zoho" &&
    !!process.env.ZOHO_CLIENT_ID &&
    !!process.env.ZOHO_CLIENT_SECRET &&
    !!process.env.ZOHO_REFRESH_TOKEN &&
    !!ORG_ID
  );
}

// ── Access-token cache (refresh tokens are long-lived; access tokens ~1h) ──────
let _token = null;
let _tokenExp = 0;

async function getAccessToken() {
  if (_token && Date.now() < _tokenExp - 60_000) return _token;
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: "refresh_token",
  });
  const res = await fetch(`${ACCOUNTS}/oauth/v2/token?${params}`, { method: "POST" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(`Zoho token refresh failed: ${data.error || res.status}`);
  }
  _token = data.access_token;
  _tokenExp = Date.now() + (Number(data.expires_in || 3600) * 1000);
  return _token;
}

async function zoho(method, path, body) {
  const token = await getAccessToken();
  const sep = path.includes("?") ? "&" : "?";
  const url = `${API}${path}${sep}organization_id=${ORG_ID}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  // Zoho returns code:0 on success; non-zero is an application error.
  if (!res.ok || (data.code != null && data.code !== 0)) {
    throw new Error(`Zoho Books ${method} ${path} failed: ${data.message || res.status}`);
  }
  return data;
}

/**
 * Find a vendor contact by name (exact, case-insensitive), else create one.
 * Returns the Zoho contact_id.
 */
export async function ensureVendor({ name, gst, email, phone } = {}) {
  if (!name) throw new Error("Vendor name required for Zoho sync");
  const found = await zoho("GET", `/contacts?contact_type=vendor&search_text=${encodeURIComponent(name)}`);
  const match = (found.contacts || []).find(
    (c) => (c.contact_name || "").trim().toLowerCase() === name.trim().toLowerCase()
  );
  if (match) return match.contact_id;
  const created = await zoho("POST", "/contacts", {
    contact_name: name,
    contact_type: "vendor",
    ...(gst ? { gst_no: gst, gst_treatment: "business_gst" } : {}),
    ...(email || phone ? { contact_persons: [{ email: email || undefined, phone: phone || undefined }] } : {}),
  });
  return created.contact.contact_id;
}

/**
 * Create a Purchase Order in Zoho Books.
 * @returns { id, number }
 */
export async function createPurchaseOrder({ vendorId, referenceNumber, date, lineItems }) {
  const data = await zoho("POST", "/purchaseorders", {
    vendor_id: vendorId,
    reference_number: referenceNumber || undefined,
    date: date || undefined,
    line_items: (lineItems || []).map((li) => ({
      name: li.name || "Part",
      rate: Number(li.rate || 0),
      quantity: Number(li.quantity || 1),
    })),
  });
  return { id: data.purchaseorder.purchaseorder_id, number: data.purchaseorder.purchaseorder_number };
}

/**
 * Create a Bill in Zoho Books (optionally referencing the PO number).
 * @returns { id, number }
 */
export async function createBill({ vendorId, billNumber, referenceNumber, date, lineItems }) {
  const data = await zoho("POST", "/bills", {
    vendor_id: vendorId,
    bill_number: billNumber || `BILL-${Date.now()}`,
    reference_number: referenceNumber || undefined,
    date: date || undefined,
    line_items: (lineItems || []).map((li) => ({
      name: li.name || "Part",
      rate: Number(li.rate || 0),
      quantity: Number(li.quantity || 1),
    })),
  });
  return { id: data.bill.bill_id, number: data.bill.bill_number };
}

export const zohoDeepLink = {
  po: (id) => `https://books.zoho.${DC}/app#/purchaseorders/${id}`,
  bill: (id) => `https://books.zoho.${DC}/app#/bills/${id}`,
};
