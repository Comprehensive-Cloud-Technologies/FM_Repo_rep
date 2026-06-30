import mysql from 'mysql2/promise';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const conn = await mysql.createConnection({
  host: 'localhost', user: 'fmapp_user', password: 'FMapp@EC2#2026', database: 'fmapp'
});

// --- Read CSV and compute expected totals ---
const wb = XLSX.readFile('/tmp/assets_upload.csv', { raw: true, cellDates: false });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });

const normalise = (row) => {
  const n = {};
  for (const [k, v] of Object.entries(row))
    n[k.replace(/[*\s]/g, '').toLowerCase()] = String(v ?? '').trim();
  return n;
};
const pick = (r, ...keys) => {
  for (const k of keys) { const s = (r[k] ?? '').trim(); if (s) return s; }
  return '';
};

const csvTotals = {};
const csvAssets = {};

for (const rawRow of rows) {
  const row = normalise(rawRow);
  const assetId = pick(row, 'assetid', 'asset_id');
  if (!assetId || assetId === '-') continue;

  const costRaw = pick(row, 'purchasecost', 'purchase_cost');
  const maint   = pick(row, 'maintenance', 'maintenancetype') || 'blank';
  const stripped = costRaw.replace(/[,\s₹-]/g, '');
  const cost = /^\d+(\.\d+)?$/.test(stripped) && Number(stripped) > 1 ? Number(stripped) : 0;

  csvTotals[maint] = (csvTotals[maint] || 0) + cost;
  csvAssets[assetId] = { costRaw, stripped, cost, maint };
}

console.log('=== Expected totals from CSV ===');
let csvGrand = 0;
for (const [maint, total] of Object.entries(csvTotals).sort()) {
  console.log(`  ${maint.padEnd(12)}: ${total.toLocaleString('en-IN')}`);
  csvGrand += total;
}
console.log(`  ${'Grand Total'.padEnd(12)}: ${csvGrand.toLocaleString('en-IN')}`);

// --- Get DB actuals ---
const [dbRows] = await conn.query(`
  SELECT a.generated_asset_id,
    JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.maintenanceType')) as legacyMaint,
    JSON_EXTRACT(ad.metadata, '$.maintenanceTypes') as mtypes,
    JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')) as dbCost
  FROM assets a JOIN asset_details ad ON ad.asset_id = a.id
  WHERE a.company_id = 10
`);

const dbTotals = {};
const dbCostMap = {};
for (const r of dbRows) {
  const mt = r.mtypes ? (typeof r.mtypes === 'string' ? JSON.parse(r.mtypes) : r.mtypes) : {};
  let maint = 'blank';
  if (mt.highEnd)   maint = 'High End';
  else if (mt.amc)  maint = 'AMC';
  else if (mt.cmc)  maint = 'CMC';
  else if (mt.warranty) maint = 'Warranty';
  else if (mt.catalyst) maint = 'Catalyst';
  else if (mt.inHouse || mt.inhouse) maint = 'In House';
  else if (r.legacyMaint) maint = r.legacyMaint;

  const stripped = (r.dbCost || '').replace(/[,\s₹]/g, '');
  const cost = /^\d+(\.\d+)?$/.test(stripped) ? Number(stripped) : 0;
  dbTotals[maint] = (dbTotals[maint] || 0) + cost;
  dbCostMap[r.generated_asset_id] = { dbCost: r.dbCost, stripped, cost, maint };
}

console.log('\n=== DB actuals ===');
let dbGrand = 0;
for (const [maint, total] of Object.entries(dbTotals).sort()) {
  console.log(`  ${maint.padEnd(12)}: ${total.toLocaleString('en-IN')}`);
  dbGrand += total;
}
console.log(`  ${'Grand Total'.padEnd(12)}: ${dbGrand.toLocaleString('en-IN')}`);

// --- Compare per-asset ---
console.log('\n=== Asset-level mismatches (CSV cost vs DB cost) ===');
let mismatches = 0;
for (const [id, csv] of Object.entries(csvAssets)) {
  const db = dbCostMap[id];
  if (!db) { console.log(`  MISSING in DB: ${id}`); mismatches++; continue; }
  if (csv.cost !== db.cost || csv.maint !== db.maint) {
    console.log(`  ${id}: CSV cost=${csv.cost} (${csv.maint}) | DB cost=${db.cost} (${db.maint})`);
    mismatches++;
  }
}
console.log(`Total mismatches: ${mismatches}`);

await conn.end();
