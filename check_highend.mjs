import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost', user: 'fmapp_user', password: 'FMapp@EC2#2026', database: 'fmapp'
});

// Check the 3 high end assets
const [rows] = await conn.query(
  `SELECT a.generated_asset_id,
     JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')) as purchaseCost,
     JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') as highEnd,
     JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.maintenanceType')) as legacyMaint
   FROM assets a
   JOIN asset_details ad ON ad.asset_id = a.id
   WHERE a.company_id = 10
     AND a.generated_asset_id IN ('004-27-000289','004-27-000145','004-27-000216')`
);

console.log('High End assets in DB:');
rows.forEach(r => {
  const stripped = (r.purchaseCost || '').replace(/[, ]/g, '');
  const parsed = parseFloat(stripped) || 0;
  console.log(` ${r.generated_asset_id}: cost="${r.purchaseCost}" stripped="${stripped}" parsed=${parsed} highEnd=${r.highEnd} legacyMaint=${r.legacyMaint}`);
});

// Check what the SQL actually returns
const [[{high_end_cost}]] = await conn.query(
  `SELECT COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = 1)
     AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\.[0-9]+)?$'
     THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS high_end_cost
   FROM assets a JOIN asset_details ad ON ad.asset_id = a.id WHERE a.company_id = 10`
);
console.log(`\nSQL high_end_cost result: ${high_end_cost}`);

await conn.end();
