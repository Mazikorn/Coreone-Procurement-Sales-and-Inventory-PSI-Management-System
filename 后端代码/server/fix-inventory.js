import { getDatabase } from './src/database/DatabaseManager.js';
const db = getDatabase();

// Clear existing inventory
db.prepare('DELETE FROM inventory').run();
console.log('Cleared inventory table');

// Recalculate inventory from inbound/outbound/return/scrap records
const materials = db.prepare('SELECT id FROM materials WHERE is_deleted = 0').all();
for (const m of materials) {
  const inbound = db.prepare("SELECT COALESCE(SUM(quantity),0) as total FROM inbound_records WHERE material_id = ? AND status = 'completed' AND is_deleted = 0").get(m.id);
  const outbound = db.prepare("SELECT COALESCE(SUM(quantity),0) as total FROM outbound_items oi JOIN outbound_records o ON oi.outbound_id = o.id WHERE oi.material_id = ? AND o.is_deleted = 0").get(m.id);
  const returned = db.prepare("SELECT COALESCE(SUM(quantity),0) as total FROM return_records WHERE material_id = ? AND status = 'completed'").get(m.id);
  const scrap = db.prepare("SELECT COALESCE(SUM(quantity),0) as total FROM scrap_records WHERE material_id = ? AND status = 'completed'").get(m.id);
  
  const stock = Number(inbound?.total || 0) - Number(outbound?.total || 0) + Number(returned?.total || 0) - Number(scrap?.total || 0);
  
  if (stock > 0 || inbound?.total > 0) {
    const lastInbound = db.prepare("SELECT location_id, id as last_id, created_at as last_date FROM inbound_records WHERE material_id = ? AND status = 'completed' AND is_deleted = 0 ORDER BY created_at DESC LIMIT 1").get(m.id);
    db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id, last_inbound_id, last_inbound_date, update_time) VALUES (?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP)')
      .run(crypto.randomUUID(), m.id, Math.max(0, stock), lastInbound?.location_id || null, lastInbound?.last_id || null, lastInbound?.last_date?.slice(0, 10) || null);
  }
}

const count = db.prepare('SELECT COUNT(*) as count FROM inventory').get();
console.log('Inventory recreated:', count);
