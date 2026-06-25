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
      const material = db.prepare('SELECT name, min_stock, safety_stock FROM materials WHERE id = ?').get(materialId) as any
      // P0-04 统一低库存阈值口径：优先 min_stock（前端"安全库存"栏写入、列表/表格/统计同源），
      // min_stock 未设(0)时回退 safety_stock，避免旧/演示数据漏报。消除"列表标红但预警静默不触发"的双轨割裂。
      const threshold = Number(material?.min_stock) || Number(material?.safety_stock) || 0

      // 库存低于预警阈值时生成预警
      if (currentStock <= threshold && threshold > 0) {
        const exists = db.prepare("SELECT COUNT(*) as c FROM alerts WHERE material_id = ? AND type = ? AND status = 'pending'").get(materialId, 'low-stock') as any
        if (exists.c === 0) {
          const triggerCondition = `当前库存 ${currentStock} <= 安全库存 ${threshold}`
          db.prepare(`INSERT INTO alerts (id, type, level, material_id, material_name, current_stock, threshold, message, status, rule_id, trigger_condition, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP)`)
            .run(uuidv4(), 'low-stock', 'warning', materialId, material?.name || '', currentStock, threshold, `库存不足：当前 ${currentStock}，安全库存 ${threshold}`, 'RULE-001', triggerCondition)
        }
      }

      // 库存恢复到阈值以上时，关闭 pending 的低库存预警
      if (currentStock > threshold) {
        db.prepare(`UPDATE alerts SET status = 'auto_resolved', remark = '库存已恢复', handled_at = CURRENT_TIMESTAMP WHERE material_id = ? AND type = 'low-stock' AND status = 'pending'`).run(materialId)
      }

      // 检查即将过期的批次
      const thresholdDate = new Date()
      thresholdDate.setDate(thresholdDate.getDate() + 30)
      const thresholdStr = thresholdDate.toISOString().split('T')[0]
      const expiringBatches = db.prepare(`
        SELECT b.id as batch_id, b.batch_no, b.expiry_date
        FROM batches b
        WHERE b.material_id = ? AND b.status = 1 AND b.remaining > 0 AND b.expiry_date <= ?
      `).all(materialId, thresholdStr) as any[]

      for (const batch of expiringBatches) {
        const exists = db.prepare(`
          SELECT COUNT(*) as c
          FROM alerts
          WHERE material_id = ?
            AND type = 'expiry'
            AND status = 'pending'
            AND (batch_id = ? OR batch_no = ? OR message LIKE ?)
        `).get(materialId, batch.batch_id, batch.batch_no, `%${batch.batch_no}%`) as any
        if (exists.c === 0) {
          const triggerCondition = `批次 ${batch.batch_no} 有效期 ${batch.expiry_date} <= 预警截止 ${thresholdStr}`
          db.prepare(`INSERT INTO alerts (id, type, level, material_id, material_name, threshold, message, status, batch_id, batch_no, rule_id, trigger_condition, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, CURRENT_TIMESTAMP)`)
            .run(uuidv4(), 'expiry', 'warning', materialId, material?.name || '', 30, `批次 ${batch.batch_no} 即将过期 (${batch.expiry_date})`, batch.batch_id, batch.batch_no, 'RULE-002', triggerCondition)
        }
      }
    }
  } catch (_e) { /* 预警检查失败不影响主流程 */ }
}
