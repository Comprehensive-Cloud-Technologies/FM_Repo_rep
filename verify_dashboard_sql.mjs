import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost', user: 'fmapp_user', password: 'FMapp@EC2#2026', database: 'fmapp'
});

// Run exact SQL from healthcareDashboard.js
const [[snap]] = await conn.query(`
  SELECT
    COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = 1)
      AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\.[0-9]+)?$'
      THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS high_end_cost,

    COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.catalyst') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.catalyst') = 1)
      AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\.[0-9]+)?$'
      THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS catalyst_cost,

    COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.warranty') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.warranty') = 1)
      AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\.[0-9]+)?$'
      THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS warranty_cost,

    COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.amc') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.amc') = 1)
      AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\.[0-9]+)?$'
      THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS amc_cost,

    COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.cmc') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.cmc') = 1)
      AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\.[0-9]+)?$'
      THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS cmc_cost,

    COALESCE(SUM(CASE WHEN REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\.[0-9]+)?$'
      THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS total_asset_value

  FROM assets a JOIN asset_details ad ON ad.asset_id = a.id
  WHERE a.company_id = 10
`);

// Better total calculation
const [[total]] = await conn.query(`
  SELECT COALESCE(SUM(CASE
    WHEN REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\.[0-9]+)?$'
    THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS total
  FROM assets a JOIN asset_details ad ON ad.asset_id = a.id WHERE a.company_id = 10
`);

const fmt = (n) => Number(n).toLocaleString('en-IN');
console.log('=== Dashboard API values (exact SQL match) ===');
console.log(`  High End    : ${fmt(snap.high_end_cost)}  (Excel: 5,06,40,000)`);
console.log(`  Catalyst    : ${fmt(snap.catalyst_cost)}  (Excel: 8,69,37,509)`);
console.log(`  Warranty    : ${fmt(snap.warranty_cost)}  (Excel: 68,85,500)`);
console.log(`  AMC         : ${fmt(snap.amc_cost)}  (Excel: 1,85,25,000)`);
console.log(`  CMC         : ${fmt(snap.cmc_cost)}  (Excel: 22,70,000)`);
console.log(`  Grand Total : ${fmt(total.total)}  (Excel: 16,52,58,009)`);

console.log('\n=== Match check ===');
const checks = [
  ['High End',   Number(snap.high_end_cost),  50640000],
  ['Catalyst',   Number(snap.catalyst_cost),  86937509],
  ['Warranty',   Number(snap.warranty_cost),   6885500],
  ['AMC',        Number(snap.amc_cost),       18525000],
  ['CMC',        Number(snap.cmc_cost),        2270000],
  ['Grand Total',Number(total.total),        165258009],
];
for (const [name, db, expected] of checks) {
  const ok = db === expected;
  console.log(`  ${ok ? '✓' : '✗'} ${name.padEnd(12)}: DB=${db} | Excel=${expected}${ok ? '' : ` DIFF=${db-expected}`}`);
}

await conn.end();
