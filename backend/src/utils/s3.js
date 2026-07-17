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

export const s3Client = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

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
