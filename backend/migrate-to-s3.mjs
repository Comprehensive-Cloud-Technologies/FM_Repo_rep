/**
 * migrate-to-s3.mjs
 *
 * One-time migration: copies all files from EC2 backend/uploads/ to S3.
 *
 * What it does (SAFE — never deletes anything):
 *  1. Lists every file under uploads/ on EC2 (via SSH)
 *  2. Uploads each file to S3 under the matching folder
 *  3. Updates DB references from "/uploads/..." paths to full S3 URLs
 *  4. Existing EC2 files are NOT deleted (serve as fallback)
 *
 * Run on EC2:
 *   node /home/ec2-user/fmapp/backend/migrate-to-s3.mjs
 *
 * Or run remotely after SCP'ing this file:
 *   scp -i Key.pem migrate-to-s3.mjs ec2-user@13.206.99.117:/home/ec2-user/fmapp/backend/
 *   ssh -i Key.pem ec2-user@13.206.99.117 "cd /home/ec2-user/fmapp/backend && node migrate-to-s3.mjs"
 */

import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream, readdirSync, statSync } from "fs";
import { join, extname, basename, relative } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import mysql from "mysql2/promise";

const require = createRequire(import.meta.url);
require("dotenv").config();

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const UPLOADS_ROOT = join(__dirname, "../uploads");
const BUCKET  = process.env.AWS_S3_BUCKET  || "catalysthtmappuploads";
const REGION  = process.env.AWS_REGION     || "ap-south-1";

const s3 = new S3Client({
  region: REGION,
  credentials: {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const db = await mysql.createConnection({
  host:     process.env.DB_HOST || "127.0.0.1",
  port:     Number(process.env.DB_PORT || 3306),
  user:     process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "fmapp",
});

const MIME_MAP = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".bmp":  "image/bmp",
  ".svg":  "image/svg+xml",
  ".pdf":  "application/pdf",
  ".mp4":  "video/mp4",
  ".mov":  "video/quicktime",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls":  "application/vnd.ms-excel",
  ".pdf":  "application/pdf",
};

function mimeFor(filename) {
  return MIME_MAP[extname(filename).toLowerCase()] || "application/octet-stream";
}

function s3KeyFor(localAbsPath) {
  // Convert absolute local path → relative to uploads/ → S3 key
  // e.g. /uploads/query-images/foo.jpg → query-images/foo.jpg
  const rel = relative(UPLOADS_ROOT, localAbsPath).replace(/\\/g, "/");
  return rel;
}

function s3Url(key) {
  return `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}

// Walk directory recursively, yield all file paths
function* walkDir(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) yield* walkDir(fullPath);
    else if (entry.isFile()) yield fullPath;
  }
}

// Check if object already exists in S3 (skip re-upload)
async function existsInS3(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch { return false; }
}

// Upload a single file to S3
async function uploadFile(localPath) {
  const key = s3KeyFor(localPath);
  if (await existsInS3(key)) {
    return { key, url: s3Url(key), skipped: true };
  }
  const stream = createReadStream(localPath);
  await s3.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         key,
    Body:        stream,
    ContentType: mimeFor(localPath),
  }));
  return { key, url: s3Url(key), skipped: false };
}

// ── Update DB references ──────────────────────────────────────────────────────
// Build a map of { "/uploads/path" → "https://s3-url" } then update all tables.

async function updateDbReferences(urlMap) {
  console.log("\n── Updating database references ──");

  // 1. asset_queries.images, before_photos, after_photos
  const [aqRows] = await db.query(
    "SELECT id, images, before_photos, after_photos FROM asset_queries WHERE images IS NOT NULL OR before_photos IS NOT NULL OR after_photos IS NOT NULL"
  );
  let aqUpdated = 0;
  for (const row of aqRows) {
    let changed = false;
    const updateCol = (col) => {
      if (!row[col]) return row[col];
      let val = typeof row[col] === "string" ? JSON.parse(row[col]) : row[col];
      if (!Array.isArray(val)) val = [val];
      const updated = val.map(u => {
        if (typeof u === "string" && u.startsWith("/uploads/")) {
          const newUrl = urlMap.get(u);
          if (newUrl) { changed = true; return newUrl; }
        }
        return u;
      });
      return updated;
    };
    const images       = updateCol("images");
    const beforePhotos = updateCol("before_photos");
    const afterPhotos  = updateCol("after_photos");
    if (changed) {
      await db.query(
        "UPDATE asset_queries SET images = ?, before_photos = ?, after_photos = ? WHERE id = ?",
        [JSON.stringify(images), JSON.stringify(beforePhotos), JSON.stringify(afterPhotos), row.id]
      );
      aqUpdated++;
    }
  }
  console.log(`  asset_queries: ${aqUpdated} rows updated`);

  // 2. asset_details.metadata (hcImages, images, invoiceImages, hcInvoiceUrl, invoiceUrl)
  const [adRows] = await db.query("SELECT asset_id, metadata FROM asset_details WHERE metadata IS NOT NULL");
  let adUpdated = 0;
  for (const row of adRows) {
    let meta = typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata;
    if (!meta) continue;
    let changed = false;
    const mapArr = (arr) => {
      if (!Array.isArray(arr)) return arr;
      return arr.map(u => {
        if (typeof u === "string" && u.startsWith("/uploads/")) {
          const n = urlMap.get(u); if (n) { changed = true; return n; }
        }
        return u;
      });
    };
    const mapStr = (s) => {
      if (typeof s === "string" && s.startsWith("/uploads/")) {
        const n = urlMap.get(s); if (n) { changed = true; return n; }
      }
      return s;
    };
    meta.hcImages      = mapArr(meta.hcImages);
    meta.images        = mapArr(meta.images);
    meta.invoiceImages = mapArr(meta.invoiceImages);
    meta.hcInvoiceUrl  = mapStr(meta.hcInvoiceUrl);
    meta.invoiceUrl    = mapStr(meta.invoiceUrl);
    if (changed) {
      await db.query("UPDATE asset_details SET metadata = ? WHERE asset_id = ?", [JSON.stringify(meta), row.asset_id]);
      adUpdated++;
    }
  }
  console.log(`  asset_details: ${adUpdated} rows updated`);

  // 3. companies.logo_url
  const [companies] = await db.query("SELECT id, logo_url FROM companies WHERE logo_url IS NOT NULL");
  let logoUpdated = 0;
  for (const c of companies) {
    if (typeof c.logo_url === "string" && c.logo_url.startsWith("/uploads/")) {
      const newUrl = urlMap.get(c.logo_url);
      if (newUrl) {
        await db.query("UPDATE companies SET logo_url = ? WHERE id = ?", [newUrl, c.id]);
        logoUpdated++;
      }
    }
  }
  console.log(`  companies logo_url: ${logoUpdated} rows updated`);

  // 4. ojt_training_materials.file_url
  try {
    const [ojtRows] = await db.query("SELECT id, file_url FROM ojt_training_materials WHERE file_url IS NOT NULL");
    let ojtUpdated = 0;
    for (const r of ojtRows) {
      if (typeof r.file_url === "string" && r.file_url.startsWith("/uploads/")) {
        const newUrl = urlMap.get(r.file_url);
        if (newUrl) {
          await db.query("UPDATE ojt_training_materials SET file_url = ? WHERE id = ?", [newUrl, r.id]);
          ojtUpdated++;
        }
      }
    }
    console.log(`  ojt_training_materials: ${ojtUpdated} rows updated`);
  } catch { console.log("  ojt_training_materials: table not found, skipping"); }
}

// ── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🚀 S3 Migration — bucket: ${BUCKET} (${REGION})`);
  console.log(`   Source: ${UPLOADS_ROOT}`);
  console.log("   EC2 files will NOT be deleted.\n");

  const files = [...walkDir(UPLOADS_ROOT)];
  console.log(`Found ${files.length} files to migrate\n`);

  let uploaded = 0, skipped = 0, failed = 0;
  const urlMap = new Map(); // "/uploads/..." → "https://s3-url"

  for (let i = 0; i < files.length; i++) {
    const localPath = files[i];
    const relPath   = "/" + relative(join(UPLOADS_ROOT, ".."), localPath).replace(/\\/g, "/");
    try {
      const { url, skipped: wasSkipped } = await uploadFile(localPath);
      urlMap.set(relPath, url);
      if (wasSkipped) { skipped++; process.stdout.write("s"); }
      else            { uploaded++; process.stdout.write("."); }
      if ((i + 1) % 100 === 0) console.log(` [${i + 1}/${files.length}]`);
    } catch (err) {
      failed++;
      console.error(`\n  FAILED: ${relPath} — ${err.message}`);
    }
  }

  console.log(`\n\n✅ Upload complete: ${uploaded} uploaded, ${skipped} already existed, ${failed} failed`);

  if (urlMap.size > 0) {
    await updateDbReferences(urlMap);
  }

  await db.end();
  console.log("\n🎉 Migration done! EC2 files are still on disk as backup.");
}

main().catch(e => { console.error(e); process.exit(1); });
