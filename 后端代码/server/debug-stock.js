import { getDatabase } from './src/database/DatabaseManager.js';
const db = getDatabase();
const inv = db.prepare('SELECT material_id, stock FROM inventory WHERE material_id = ?').get('MAT-HE-001');
console.log('MAT-HE-001 inventory:', inv);
const inbound = db.prepare("SELECT COALESCE(SUM(quantity),0) as total FROM inbound_records WHERE material_id = ? AND status = 'completed' AND is_deleted = 0").get('MAT-HE-001');
console.log('MAT-HE-001 inbound:', inbound);
const outbound = db.prepare("SELECT COALESCE(SUM(quantity),0) as total FROM outbound_items oi JOIN outbound_records o ON oi.outbound_id = o.id WHERE oi.material_id = ? AND o.is_deleted = 0").get('MAT-HE-001');
console.log('MAT-HE-001 outbound:', outbound);
