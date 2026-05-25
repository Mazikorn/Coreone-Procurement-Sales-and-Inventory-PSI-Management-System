import { getDatabase } from './src/database/DatabaseManager.js';
const db = getDatabase();
const inv = db.prepare('SELECT material_id, stock FROM inventory WHERE material_id = ?').get('MAT-HE-001');
console.log('MAT-HE-001:', inv);
const top = db.prepare('SELECT material_id, stock FROM inventory ORDER BY stock DESC LIMIT 5').all();
console.log('Top 5 stock:', top);
