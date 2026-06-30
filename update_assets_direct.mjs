// Direct asset update script — reads /tmp/assets_upload.csv and updates the DB
import mysql from 'mysql2/promise';
import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const normalizeDate = (val) => {
  if (!val) return val;
  const s = String(val).trim();
  if (!s || s === '-' || s.toLowerCase() === 'na') return '';
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n >= 32874 && n <= 58037) {
      const d = new Date((n - 25569) * 86400000);
      return `${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}/${d.getUTCFullYear()}`;
    }
    return '';
  }
  const monMap = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  const dmyM = s.match(/^(\d{1,2})[\/\-]([A-Za-z]{3})[\/\-](\d{2,4})$/);
  if (dmyM) {
    const day = dmyM[1].padStart(2,'0');
    const mon = monMap[dmyM[2].toLowerCase()];
    if (mon) {
      let yr = dmyM[3];
      if (yr.length === 2) yr = Number(yr) <= 30 ? `20${yr.padStart(2,'0')}` : `19${yr}`;
      return `${day}/${mon}/${yr}`;
    }
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const usDate = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usDate) {
    const p1 = Number(usDate[1]), p2 = Number(usDate[2]);
    if (p1 > 12) return s;
    if (p2 > 12) return `${String(p2).padStart(2,'0')}/${String(p1).padStart(2,'0')}/${usDate[3]}`;
    return s;
  }
  return s;
};

const conn = await mysql.createConnection({
  host: 'localhost', user: 'fmapp_user', password: 'FMapp@EC2#2026', database: 'fmapp'
});

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

let updated = 0, unchanged = 0, notFound = 0, errors = 0;

// Get the company_id from an existing asset matching the 004- prefix
const [[companyRow]] = await conn.query(
  `SELECT company_id FROM assets WHERE generated_asset_id LIKE '004-27-%' LIMIT 1`
);
if (!companyRow) { console.error('Could not determine company_id'); process.exit(1); }
const companyId = companyRow.company_id;
console.log(`Using company_id: ${companyId}\n`);

for (const rawRow of rows) {
  const row = normalise(rawRow);
  let assetId = pick(row, 'assetid', 'asset_id');
  if (!assetId || assetId === '-') continue;

  // If XLSX auto-converted the asset ID to an Excel date serial, reverse it
  // e.g. 004-27-000012 → Excel strips zeros → 4-27-12 → April 27, 2012 → serial 41026
  if (/^\d+$/.test(assetId)) {
    const serial = Number(assetId);
    if (serial >= 20000 && serial <= 60000) {
      const d = new Date((serial - 25569) * 86400000);
      const m  = String(d.getUTCMonth() + 1).padStart(3, '0');
      const dy = d.getUTCDate();
      const y2 = String(d.getUTCFullYear() % 100).padStart(6, '0');
      assetId = `${m}-${dy}-${y2}`;
    }
  }

  const [[existing]] = await conn.query(
    `SELECT a.id, a.generated_asset_id, a.asset_name, a.criticality, a.working_status,
            a.status, a.is_verified, a.department_id, a.building, a.floor, a.room, ad.id AS detail_id, ad.metadata
     FROM assets a
     LEFT JOIN asset_details ad ON ad.asset_id = a.id
     WHERE a.generated_asset_id = ? AND a.company_id = ? LIMIT 1`,
    [assetId, companyId]
  );

  if (!existing) {
    console.log(`NOT FOUND: ${assetId}`);
    notFound++;
    continue;
  }

  try {
    // --- core asset fields ---
    const assetChanges = {};

    const assetName = pick(row, 'equipmentname', 'assetname', 'name');
    if (assetName && assetName !== existing.asset_name) assetChanges.asset_name = assetName;

    const critRaw = pick(row, 'category', 'criticality');
    if (critRaw) {
      const cl = critRaw.toLowerCase();
      const criticality = cl.includes('non') ? 'Non_Critical' : cl.includes('crit') ? 'Critical' : null;
      if (criticality && criticality !== existing.criticality) assetChanges.criticality = criticality;
    }

    const wkRaw = pick(row, 'workingstatus', 'working_status');
    if (wkRaw) {
      const wl = wkRaw.toLowerCase();
      const workingStatus = wl.includes('not') ? 'Not_Working' : (wl === 'wip' ? 'WIP' : 'Working');
      if (workingStatus !== existing.working_status) assetChanges.working_status = workingStatus;
    }

    const verifiedRaw = pick(row, 'verifiedstatus', 'verified_status');
    if (verifiedRaw) {
      const isVerifiedNew = verifiedRaw.toLowerCase() === 'verified' ? 1 : 0;
      if (isVerifiedNew !== Number(existing.is_verified ?? 0)) assetChanges.is_verified = isVerifiedNew;
    }

    // --- metadata ---
    const existingMeta = existing.metadata
      ? (typeof existing.metadata === 'string' ? JSON.parse(existing.metadata) : existing.metadata)
      : {};
    const incomingMeta = {};

    const make = pick(row, 'make', 'manufacturer');
    if (make && make.toLowerCase() !== 'na') incomingMeta.make = make;

    const model = pick(row, 'model');
    if (model && model.toLowerCase() !== 'na') incomingMeta.model = model;

    const serialNo = pick(row, 'serialno', 'serial_no', 'serialnumber');
    if (serialNo && serialNo.toLowerCase() !== 'na') incomingMeta.serialNo = serialNo;

    const accessories = pick(row, 'accessories');
    if (accessories && accessories.toLowerCase() !== 'na') incomingMeta.accessories = accessories;

    const purchaseCost = pick(row, 'purchasecost', 'purchase_cost');
    if (purchaseCost && purchaseCost !== '-' && purchaseCost !== '1') incomingMeta.purchaseCost = purchaseCost;

    const invoiceNo = pick(row, 'invoiceno', 'invoice_no');
    if (invoiceNo && invoiceNo.toLowerCase() !== 'na') incomingMeta.invoiceNo = invoiceNo;

    const mfgYear = pick(row, 'mfg.year', 'mfgyear', 'mfg_year', 'manufacturingyear');
    if (mfgYear) incomingMeta.manufacturingYear = mfgYear;

    const instDate = normalizeDate(pick(row, 'installationdate', 'installation_date'));
    if (instDate) incomingMeta.installationDate = instDate;

    const purchDate = normalizeDate(pick(row, 'purchasedate', 'purchase_date'));
    if (purchDate) incomingMeta.purchaseDate = purchDate;

    const remarks = pick(row, 'remarks', 'notes');
    if (remarks) incomingMeta.remarks = remarks;

    const rberRaw = pick(row, 'rber');
    if (rberRaw) incomingMeta.rber = rberRaw.toLowerCase() === 'yes' || rberRaw === '1' || rberRaw.toLowerCase() === 'true';

    const maintenance = pick(row, 'maintenance', 'maintenancetype');
    if (maintenance) {
      incomingMeta.maintenanceType = maintenance;
      const ml = maintenance.toLowerCase();
      incomingMeta.maintenanceTypes = {
        warranty: ml === 'warranty', amc: ml === 'amc', cmc: ml === 'cmc',
        inhouse: ml === 'in house' || ml === 'inhouse',
        catalyst: ml === 'catalyst',
        highEnd: ml === 'high end' || ml === 'highend',
        rented: ml === 'rented'
      };
    }

    const startDate = normalizeDate(pick(row, 'startdate', 'start_date'));
    const endDate   = normalizeDate(pick(row, 'enddate',   'end_date'));
    if (startDate || endDate) {
      const ml = (incomingMeta.maintenanceType || existingMeta.maintenanceType || '').toLowerCase();
      if (ml === 'warranty') {
        if (startDate) incomingMeta.warrantyStart = startDate;
        if (endDate)   incomingMeta.warrantyEnd   = endDate;
      } else if (ml === 'amc') {
        if (startDate) incomingMeta.amcStart = startDate;
        if (endDate)   incomingMeta.amcEnd   = endDate;
      } else if (ml === 'cmc') {
        if (startDate) incomingMeta.cmcStart = startDate;
        if (endDate)   incomingMeta.cmcEnd   = endDate;
      } else if (ml === 'high end' || ml === 'highend') {
        if (startDate) incomingMeta.highEndStart = startDate;
        if (endDate)   incomingMeta.highEndEnd   = endDate;
      }
    }

    // Merge metadata (only overwrite keys present in incoming)
    const mergedMeta = { ...existingMeta };
    let metaChanged = false;
    for (const [k, v] of Object.entries(incomingMeta)) {
      const curr = mergedMeta[k];
      // Use JSON.stringify for objects to properly detect differences
      const oldStr = (curr !== null && curr !== undefined && typeof curr === 'object')
        ? JSON.stringify(curr) : String(curr ?? '');
      const newStr = (v !== null && v !== undefined && typeof v === 'object')
        ? JSON.stringify(v) : String(v);
      if (oldStr !== newStr) {
        mergedMeta[k] = v;
        metaChanged = true;
      }
    }

    const hasAssetChanges = Object.keys(assetChanges).length > 0;
    if (!hasAssetChanges && !metaChanged) {
      unchanged++;
      continue;
    }

    if (hasAssetChanges) {
      const setClauses = Object.keys(assetChanges).map(k => `${k} = ?`).join(', ');
      await conn.query(
        `UPDATE assets SET ${setClauses}, updated_at = NOW() WHERE id = ?`,
        [...Object.values(assetChanges), existing.id]
      );
    }

    if (metaChanged) {
      if (existing.detail_id) {
        await conn.query('UPDATE asset_details SET metadata = ? WHERE id = ?', [JSON.stringify(mergedMeta), existing.detail_id]);
      } else {
        await conn.query('INSERT INTO asset_details (asset_id, metadata) VALUES (?, ?)', [existing.id, JSON.stringify(mergedMeta)]);
      }
    }

    const changedFields = [...Object.keys(assetChanges), ...(metaChanged ? ['metadata'] : [])];
    console.log(`UPDATED ${assetId}: [${changedFields.join(', ')}]`);
    updated++;
  } catch (err) {
    console.error(`ERROR ${assetId}: ${err.message}`);
    errors++;
  }
}

console.log(`\n===== DONE =====`);
console.log(`Updated:   ${updated}`);
console.log(`Unchanged: ${unchanged}`);
console.log(`Not found: ${notFound}`);
console.log(`Errors:    ${errors}`);

await conn.end();
