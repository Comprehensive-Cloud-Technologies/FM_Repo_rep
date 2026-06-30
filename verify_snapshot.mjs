import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost', user: 'fmapp_user', password: 'FMapp@EC2#2026', database: 'fmapp'
});

// Check the full snapshot values as the SQL in healthcareDashboard.js computes them
const [[snap]] = await conn.query(`
  SELECT
    COUNT(*) AS total_assets,
    COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = 1) THEN 1 ELSE 0 END), 0) AS high_end_count,
    COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = 1)
      AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\.[0-9]+)?$'
      THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS high_end_cost,
    COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.catalyst') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.catalyst') = 1) THEN 1 ELSE 0 END), 0) AS catalyst_count,
    COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.catalyst') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.catalyst') = 1)
      AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\.[0-9]+)?$'
      THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS catalyst_cost
  FROM assets a JOIN asset_details ad ON ad.asset_id = a.id
  WHERE a.company_id = 10
`);

console.log('Dashboard snapshot:');
console.log(`  High End: ${snap.high_end_count} assets, cost = ${snap.high_end_cost} (₹${(snap.high_end_cost/100000).toFixed(2)} L)`);
console.log(`  Catalyst: ${snap.catalyst_count} assets, cost = ${snap.catalyst_cost} (₹${(snap.catalyst_cost/100000).toFixed(2)} L)`);

// Check High End assets
const [highEndAssets] = await conn.query(
  `SELECT a.generated_asset_id, JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')) as cost
   FROM assets a JOIN asset_details ad ON ad.asset_id = a.id
   WHERE a.company_id = 10 AND (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = 1)`
);
console.log('\nHigh End assets:');
highEndAssets.forEach(r => console.log(`  ${r.generated_asset_id}: ${r.cost}`));

await conn.end();
