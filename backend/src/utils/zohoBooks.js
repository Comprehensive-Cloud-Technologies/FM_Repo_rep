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

/**
 * Find an item by name (exact, case-insensitive), else create it. Returns the
 * Zoho item_id. Used to keep the HTM parts master in sync with Zoho Items so
 * PO/bill line items reference real inventory items.
 */
let _purchaseAccountId = null;
async function getPurchaseAccountId() {
  if (_purchaseAccountId) return _purchaseAccountId;
  try {
    const acc = await zoho("GET", "/chartofaccounts");
    const all = acc.chartofaccounts || [];
    const pick = all.find((a) => a.account_type === "cost_of_goods_sold")
      || all.find((a) => a.account_type === "expense")
      || all.find((a) => a.account_type === "other_expense");
    _purchaseAccountId = pick?.account_id || null;
  } catch { _purchaseAccountId = null; }
  return _purchaseAccountId;
}

// Cache tax_id lookups by rate so we don't hit /settings/taxes repeatedly.
const _taxCache = new Map();
async function getTaxIdForRate(rate) {
  if (rate == null) return null;
  const key = Number(rate);
  if (_taxCache.has(key)) return _taxCache.get(key);
  let id = null;
  try {
    const res = await zoho("GET", "/settings/taxes");
    const t = (res.taxes || []).find((x) => Number(x.tax_percentage) === key);
    id = t?.tax_id || null;
  } catch { id = null; }
  _taxCache.set(key, id);
  return id;
}

/**
 * Find an item by name (exact, case-insensitive), else create it as a PURCHASE
 * item (Zoho only allows purchase items on a PO). Returns the Zoho item_id.
 */
export async function ensureItem({ name, sku, rate, hsn, taxRate, unit, description } = {}) {
  if (!name) throw new Error("Item name required for Zoho sync");
  const found = await zoho("GET", `/items?search_text=${encodeURIComponent(name)}`);
  const match = (found.items || []).find(
    (i) => (i.name || "").trim().toLowerCase() === name.trim().toLowerCase()
  );
  if (match) return match.item_id;
  const purchaseAccountId = await getPurchaseAccountId();
  const taxId = await getTaxIdForRate(taxRate);
  // item_type sales_and_purchases + a purchase (COGS/expense) account is what
  // makes Zoho treat the item as purchasable so it can go on a Purchase Order.
  const base = {
    name,
    ...(sku ? { sku } : {}),
    ...(unit ? { unit } : {}),
    ...(hsn ? { hsn_or_sac: hsn } : {}),
    ...(taxId ? { tax_id: taxId } : {}),
    ...(description ? { description, purchase_description: description } : {}),
    rate: Number(rate || 0),
    product_type: "goods",
    item_type: "sales_and_purchases",
    purchase_rate: Number(rate || 0),
    ...(purchaseAccountId ? { purchase_account_id: purchaseAccountId } : {}),
  };
  const created = await zoho("POST", "/items", base);
  return created.item.item_id;
}

/**
 * Create a DRAFT purchase order in Zoho (the "quotation" the purchase team
 * prices). Line items may carry an item_id (preferred) or a name. Rates start
 * at 0 — the purchase team fills them in Zoho. @returns { id, number }
 */
export async function createDraftPurchaseOrder({ vendorId, referenceNumber, date, lineItems }) {
  const body = {
    reference_number: referenceNumber || undefined,
    date: date || undefined,
    line_items: (lineItems || []).map((li) => ({
      ...(li.itemId ? { item_id: li.itemId } : {}),
      name: li.name || "Part",
      rate: Number(li.rate || 0),
      quantity: Number(li.quantity || 1),
    })),
  };
  // vendor_id is required by Zoho for a PO; use a placeholder vendor if none yet.
  if (vendorId) body.vendor_id = vendorId;
  const data = await zoho("POST", "/purchaseorders", body);
  return { id: data.purchaseorder.purchaseorder_id, number: data.purchaseorder.purchaseorder_number };
}

/** Read a purchase order (line items, rates, vendor, total, status). */
export async function getPurchaseOrder(poId) {
  const data = await zoho("GET", `/purchaseorders/${poId}`);
  const po = data.purchaseorder || {};
  return {
    id: po.purchaseorder_id,
    number: po.purchaseorder_number,
    status: po.status,
    vendorId: po.vendor_id,
    vendorName: po.vendor_name,
    total: Number(po.total || 0),
    lineItems: (po.line_items || []).map((li) => ({
      itemId: li.item_id, name: li.name, rate: Number(li.rate || 0), quantity: Number(li.quantity || 0),
    })),
  };
}

/** Mark a draft PO as issued/open (called after HTM price approval). */
export async function markPurchaseOrderIssued(poId) {
  return zoho("POST", `/purchaseorders/${poId}/status/open`, {});
}

export const zohoDeepLink = {
  po: (id) => `https://books.zoho.${DC}/app#/purchaseorders/${id}`,
  bill: (id) => `https://books.zoho.${DC}/app#/bills/${id}`,
};
