import pool from './src/db.js';
const [rows] = await pool.query('DESCRIBE companies');
rows.forEach(r => console.log(r.Field));
process.exit(0);
