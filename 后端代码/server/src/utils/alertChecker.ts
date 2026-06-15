import { v4 as uuidv4 } from 'uuid'

/**
 * 自动检查库存预警（入库/出库后调用）
 * @param db 数据库实例
 * @param materialIds 物料ID列表
 */
export function checkStockAlerts(db: any, materialIds: string[]): void {
  try {
    for (const materialId of materialIds) {
      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
      const currentStock = inv?.stock || 0
      const material = db.prepare('SELECT name, safety_stock FROM materials WHERE id = ?').get(materialId) as any
      const safetyStock = material?.safety_stock || 0

      // 库存低于安全库存时生成预警
      if (currentStock <= safetyStock && safetyStock > 0) {
        const exists = db.prepare('SELECT COUNT(*) as c FROM alerts WHERE material_id = ? AND type = ? AND status = "pending"').get(materialId, 'low-stock') as any
        if (exists.c === 0) {
          db.prepare(`INSERT INTO alerts (id, type, level, material_id, material_name, current_stock, threshold, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`)
            .run(uuidv4(), 'low-stock', 'warning', materialId, material?.name || '', currentStock, safetyStock, `库存不足：当前 ${currentStock}，安全库存 ${safetyStock}`)
        }
      }

      // 库存恢复到安全线以上时，关闭 pending 的低库存预警
      if (currentStock > safetyStock) {
        db.prepare(`UPDATE alerts SET status = 'auto_resolved', remark = '库存已恢复', handled_at = CURRENT_TIMESTAMP WHERE material_id = ? AND type = 'low-stock' AND status = 'pending'`).run(materialId)
      }

      // 检查即将过期的批次
      const thresholdDate = new Date()
      thresholdDate.setDate(thresholdDate.getDate() + 30)
      const thresholdStr = thresholdDate.toISOString().split('T')[0]
      const expiringBatches = db.prepare(`
        SELECT b.batch_no, b.expiry_date
        FROM batches b
        WHERE b.material_id = ? AND b.status = 1 AND b.remaining > 0 AND b.expiry_date <= ?
      `).all(materialId, thresholdStr) as any[]

      for (const batch of expiringBatches) {
        const exists = db.prepare('SELECT COUNT(*) as c FROM alerts WHERE material_id = ? AND type = ? AND status = "pending" AND message LIKE ?').get(materialId, 'expiry', `%${batch.batch_no}%`) as any
        if (exists.c === 0) {
          db.prepare(`INSERT INTO alerts (id, type, level, material_id, material_name, threshold, message, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`)
            .run(uuidv4(), 'expiry', 'warning', materialId, material?.name || '', 30, `批次 ${batch.batch_no} 即将过期 (${batch.expiry_date})`)
        }
      }
    }
  } catch (_e) { /* 预警检查失败不影响主流程 */ }
}
