import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost', user: 'fmapp_user', password: 'FMapp@EC2#2026', database: 'fmapp'
});

// Fix Cathlab: set highEnd=true, catalyst=false (CSV confirms it's "High End")
const [result] = await conn.query(
  `UPDATE asset_details ad
   JOIN assets a ON ad.asset_id = a.id
   SET ad.metadata = JSON_SET(
     JSON_SET(ad.metadata, '$.maintenanceTypes.highEnd', CAST('true' AS JSON)),
     '$.maintenanceTypes.catalyst', CAST('false' AS JSON)
   )
   WHERE a.company_id = 10 AND a.generated_asset_id = '004-27-000289'`
);

console.log(`Updated ${result.affectedRows} row(s)`);

// Verify
const [rows] = await conn.query(
  `SELECT a.generated_asset_id,
     JSON_EXTRACT(ad.metadata, '$.maintenanceTypes') as mtypes,
     JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.maintenanceType')) as legacyMaint
   FROM assets a JOIN asset_details ad ON ad.asset_id = a.id
   WHERE a.company_id = 10 AND a.generated_asset_id = '004-27-000289'`
);
console.log('Cathlab after fix:', JSON.stringify(rows[0], null, 2));

// Re-check the SQL sum
const [[{high_end_cost}]] = await conn.query(
  `SELECT COALESCE(SUM(CASE WHEN (JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = true OR JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') = 1)
     AND REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') REGEXP '^[0-9]+(\.[0-9]+)?$'
     THEN CAST(REPLACE(REPLACE(COALESCE(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.purchaseCost')), ''), ',', ''), ' ', '') AS DECIMAL(15,2)) ELSE 0 END), 0) AS high_end_cost
   FROM assets a JOIN asset_details ad ON ad.asset_id = a.id WHERE a.company_id = 10`
);
console.log(`\nhigh_end_cost after fix: ${high_end_cost}`);
console.log(`Expected: 50640000 (₹5,06,40,000)`);

await conn.end();
