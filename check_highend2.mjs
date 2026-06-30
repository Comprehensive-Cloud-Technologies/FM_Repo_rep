import mysql from 'mysql2/promise';

const conn = await mysql.createConnection({
  host: 'localhost', user: 'fmapp_user', password: 'FMapp@EC2#2026', database: 'fmapp'
});

// Check full maintenanceTypes for Cathlab
const [rows] = await conn.query(
  `SELECT a.generated_asset_id,
     JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.maintenanceType')) as legacyMaint,
     JSON_EXTRACT(ad.metadata, '$.maintenanceTypes') as mtypes
   FROM assets a
   JOIN asset_details ad ON ad.asset_id = a.id
   WHERE a.company_id = 10 AND a.generated_asset_id = '004-27-000289'`
);
console.log('Cathlab metadata:');
rows.forEach(r => console.log(JSON.stringify(r, null, 2)));

// Also find assets where legacy says High End but new field is false/missing
const [mismatch] = await conn.query(
  `SELECT a.generated_asset_id,
     JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.maintenanceType')) as legacyMaint,
     JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') as highEndNew
   FROM assets a
   JOIN asset_details ad ON ad.asset_id = a.id
   WHERE a.company_id = 10
     AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(ad.metadata, '$.maintenanceType'))) = 'high end'
     AND JSON_EXTRACT(ad.metadata, '$.maintenanceTypes.highEnd') != true`
);
console.log('\nAssets with legacy High End but new highEnd != true:');
mismatch.forEach(r => console.log(JSON.stringify(r)));

await conn.end();
