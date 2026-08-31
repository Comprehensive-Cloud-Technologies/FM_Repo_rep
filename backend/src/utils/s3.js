/**
 * s3.js — Centralised AWS S3 helpers
 *
 * All uploads go to:  s3://catalysthtmappuploads/<folder>/<filename>
 * All reads return a pre-signed URL that expires after AWS_S3_URL_EXPIRY seconds.
 *
 * Backward-compatibility rule:
 *   If a stored URL already starts with "http" (old EC2 absolute URL) or "/"
 *   (old relative path like /uploads/…) it is served AS-IS from the EC2 server.
 *   Only new uploads use S3.
 */

import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Upload } from "@aws-sdk/lib-storage";
import path from "path";

const BUCKET  = process.env.AWS_S3_BUCKET  || "catalysthtmappuploads";
const REGION  = process.env.AWS_REGION     || "ap-south-1";
const EXPIRY  = Number(process.env.AWS_S3_URL_EXPIRY || 3600); // seconds

// Use explicit credentials from env vars when provided; otherwise fall back to
// the SDK default credential provider chain (reads ~/.aws/credentials, IAM roles,
// environment variables etc.) — this lets EC2 instances with IAM roles or an
// existing ~/.aws/credentials file work without any .env changes.
const clientConfig = { region: REGION };
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}
export const s3Client = new S3Client(clientConfig);

// ── Folder mapping ────────────────────────────────────────────────────────────
export const S3_FOLDERS = {
  uploads:      "uploads",        // generic single-file upload endpoint
  queryImages:  "query-images",   // asset-query before/after photos
  logos:        "logos",          // company logos
  ojt:          "ojt",            // OJT training files (pdf, video, etc.)
  assets:       "asset-images",   // asset registration photos (mobile)
  excel:        "tmp-excel",      // bulk import xlsx (auto-cleaned)
};

// ── Upload a Buffer / Stream to S3 ────────────────────────────────────────────
export async function uploadToS3({ buffer, stream, mimetype, folder, filename }) {
  const key = `${folder}/${filename}`;
  const body = buffer || stream;

  const upload = new Upload({
    client: s3Client,
    params: {
      Bucket:      BUCKET,
      Key:         key,
      Body:        body,
      ContentType: mimetype || "application/octet-stream",
    },
  });

  await upload.done();
  return buildS3Url(key);
}

// ── Build a permanent S3 URL (path-style, public-read bucket) ─────────────────
// Use pre-signed URL so bucket can stay fully private.
export function buildS3Url(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

// ── Generate a pre-signed GET URL (expires after EXPIRY seconds) ──────────────
export async function getPresignedUrl(key, expiresIn = EXPIRY) {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3Client, cmd, { expiresIn });
}

// ── Extract S3 key from a full S3 URL ─────────────────────────────────────────
export function keyFromS3Url(url) {
  const prefix = `https://${BUCKET}.s3.${REGION}.amazonaws.com/`;
  if (url && url.startsWith(prefix)) return url.slice(prefix.length);
  return null;
}

// ── Delete an object from S3 ─────────────────────────────────────────────────
export async function deleteFromS3(urlOrKey) {
  const key = keyFromS3Url(urlOrKey) || urlOrKey;
  if (!key) return;
  await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

// ── Check if a URL is an S3 URL for our bucket ───────────────────────────────
export function isS3Url(url) {
  return typeof url === "string" &&
    url.startsWith(`https://${BUCKET}.s3.${REGION}.amazonaws.com/`);
}

// ── Normalize any image URL for the frontend ─────────────────────────────────
// Returns the URL unchanged if it is already an absolute URL (http/https).
// Prepends the API base URL if it is a relative path (old EC2 path like /uploads/…).
export function normalizeImageUrl(url, apiBase) {
  if (!url || typeof url !== "string") return url;
  if (url.startsWith("http")) return url; // already absolute (S3 or old EC2)
  // Relative EC2 path — make it absolute using the current API base
  const base = (apiBase || process.env.API_BASE_URL || "").replace(/\/$/, "");
  return url.startsWith("/") ? `${base}${url}` : `${base}/${url}`;
}

export { BUCKET, REGION, EXPIRY };

// ── Pre-sign all S3 image URLs inside an asset metadata object ────────────────
// Walks hcImages, images, invoiceImages, hcInvoiceUrl, invoiceUrl and replaces
// any direct S3 object URLs with time-limited pre-signed GET URLs.
export async function presignMetadataImages(meta, expiresIn = EXPIRY) {
  if (!meta || typeof meta !== "object") return meta;
  const signUrl = async (url) => {
    if (!url || typeof url !== "string") return url;
    const key = keyFromS3Url(url);
    if (!key) return url; // not an S3 URL (old EC2 path) — leave as-is
    try { return await getPresignedUrl(key, expiresIn); } catch { return url; }
  };
  const signArr = (arr) =>
    Array.isArray(arr) ? Promise.all(arr.map(signUrl)) : Promise.resolve(arr);

  const [hcImages, images, invoiceImages, hcInvoiceUrl, invoiceUrl] = await Promise.all([
    signArr(meta.hcImages),
    signArr(meta.images),
    signArr(meta.invoiceImages),
    signUrl(meta.hcInvoiceUrl),
    signUrl(meta.invoiceUrl),
  ]);
  return { ...meta, hcImages, images, invoiceImages, hcInvoiceUrl, invoiceUrl };
}

// ── Presign a single stored URL if it points at our (private) S3 bucket ───────
// Non-S3 URLs (old EC2 paths, empty values) are returned unchanged. Never throws.
export async function presignIfS3(url, expiresIn = EXPIRY) {
  if (!url || typeof url !== "string") return url;
  const key = keyFromS3Url(url);
  if (!key) return url; // not one of our S3 objects — leave as-is
  try { return await getPresignedUrl(key, expiresIn); } catch { return url; }
}

// ── Presign a list of attachment URLs (array of strings OR {url,...} objects) ──
// Returns the list in the same shape with S3 URLs swapped for time-limited ones.
export async function presignUrlList(list, expiresIn = EXPIRY) {
  if (!Array.isArray(list)) return list;
  return Promise.all(list.map(async (item) => {
    if (item && typeof item === "object" && typeof item.url === "string") {
      return { ...item, url: await presignIfS3(item.url, expiresIn) };
    }
    return presignIfS3(item, expiresIn);
  }));
}
