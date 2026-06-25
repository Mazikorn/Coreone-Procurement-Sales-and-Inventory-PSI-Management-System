/**
 * 补货（演示用）：为所有 BOM 用到的物料建充足批次 + 库存，使真实月度出库可执行（FEFO 批次消耗）。
 * 真实场景=实验室月初备货。幂等：每次新增一批 RPL 批次（批号带序号），可重复但建议只跑一次。
 * 用法：npx tsx scripts/seed-replenish-stock.ts [每物料数量=5000]
 */

import { getDatabase } from '../src/database/DatabaseManager.js'
import { v4 as uuidv4 } from 'uuid'

export function replenishStock(database?: any, qtyEach = 5000): Record<string, number> {
  const db = database || getDatabase()
  // 复用一个既有 inbound_id 满足 batches.inbound_id 外键/非空
  const ref = db.prepare('SELECT inbound_id FROM batches WHERE inbound_id IS NOT NULL LIMIT 1').get() as any
  const inboundId = ref?.inbound_id || null

  // 覆盖 BOM 全部四层（特异性试剂/通用试剂/通用耗材/质控品）用到的物料
  const mats = db.prepare(`
    SELECT DISTINCT mid as material_id, COALESCE(m.price, 100) as price
    FROM (
      SELECT material_id mid FROM bom_items
      UNION SELECT material_id FROM bom_general_reagents
      UNION SELECT material_id FROM bom_general_consumables
      UNION SELECT material_id FROM bom_quality_controls
    ) u JOIN materials m ON m.id = u.mid AND m.is_deleted = 0
  `).all() as any[]

  const insBatch = db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, production_date, expiry_date, inbound_id, inbound_price, status, verified, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, date('now'), '2027-12-31', ?, ?, 1, 1, datetime('now'), datetime('now'))
  `)
  const getInv = db.prepare('SELECT id FROM inventory WHERE material_id = ?')
  const updInv = db.prepare(`UPDATE inventory SET stock = stock + ?, update_time = datetime('now') WHERE material_id = ?`)
  const insInv = db.prepare(`INSERT INTO inventory (id, material_id, stock, locked_stock, update_time, created_at, updated_at) VALUES (?, ?, ?, 0, datetime('now'), datetime('now'), datetime('now'))`)

  let n = 0
  for (const m of mats) {
    insBatch.run(uuidv4(), m.material_id, `RPL-202606-${n}`, qtyEach, qtyEach, inboundId, Number(m.price) || 100)
    if (getInv.get(m.material_id)) updInv.run(qtyEach, m.material_id)
    else insInv.run(uuidv4(), m.material_id, qtyEach)
    n++
  }
  return { materials: n, qtyEach }
}

const isMain = process.argv[1] && process.argv[1].includes('seed-replenish-stock')
if (isMain) {
  const qty = Number(process.argv[2]) || 5000
  console.log('补货完成：', JSON.stringify(replenishStock(undefined, qty)))
}
