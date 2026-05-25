import { getDatabase } from './src/database/DatabaseManager.js';
const db = getDatabase();
const inv = db.prepare('SELECT COUNT(*) as count FROM inventory').get();
console.log('inventory count:', inv);
const inbound = db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE is_deleted = 0').get();
console.log('inbound count:', inbound);
const outbound = db.prepare('SELECT COUNT(*) as count FROM outbound_records WHERE is_deleted = 0').get();
console.log('outbound count:', outbound);
