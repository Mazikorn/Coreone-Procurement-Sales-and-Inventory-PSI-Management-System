import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { generateNo } from '../utils/generateNo.js'
import { consumeInventoryLocationStock, restoreInventoryLocationStock } from '../utils/inventory-locations.js'

const router = Router()

function generateReturnNo(): string {
  return generateNo('RT')
}

function pickBatch(db: any, materialId: string, quantity: number, batchId?: string) {
  if (batchId) {
    return db.prepare(`
      SELECT id, batch_no, remaining, status, inbound_price
      FROM batches
      WHERE id = ? AND material_id = ?
    `).get(batchId, materialId) as any
  }

  return db.prepare(`
    SELECT id, batch_no, remaining, status, inbound_price
    FROM batches
    WHERE material_id = ? AND status = 1 AND remaining >= ?
    ORDER BY
      CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
      expiry_date ASC,
      created_at ASC
    LIMIT 1
  `).get(materialId, quantity) as any
}

function hasActiveBatch(db: any, materialId: string): boolean {
  const row = db.prepare(`
    SELECT COUNT(*) as count
    FROM batches
    WHERE material_id = ? AND status = 1 AND remaining > 0
  `).get(materialId) as any
  return Number(row?.count || 0) > 0
}

router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword } = req.query
    const normalizedPage = Math.max(1, Number(page) || 1)
    const normalizedPageSize = Math.min(Math.max(1, Number(pageSize) || 20), 1000)
    const db = getDatabase()
    let where = 'r.is_deleted = 0'
    const params: any[] = []
    if (keyword) {
      where += ' AND (r.return_no LIKE ? OR r.reason LIKE ? OR r.remark LIKE ? OR m.name LIKE ?)'
      const like = `%${keyword}%`
      params.push(like, like, like, like)
    }
    const count = (db.prepare(`
      SELECT COUNT(*) as total
      FROM return_records r
      LEFT JOIN materials m ON r.material_id = m.id AND m.is_deleted = 0
      WHERE ${where}
    `).get(...params) as any)?.total || 0
    const offset = (normalizedPage - 1) * normalizedPageSize
    const list = db.prepare(`
      SELECT r.*, m.name as material_name, m.unit as material_unit, b.batch_no
      FROM return_records r
      LEFT JOIN materials m ON r.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN batches b ON r.batch_id = b.id
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, normalizedPageSize, offset) as any[]
    successList(res, list.map((r: any) => ({
      id: r.id, returnNo: r.return_no, materialId: r.material_id,
      materialName: r.material_name, unit: r.material_unit,
      batchId: r.batch_id, batchNo: r.batch_no,
      quantity: r.quantity, reason: r.reason, operator: r.operator,
      unitCost: Number(r.unit_cost || 0), totalCost: Number(r.total_cost || 0),
      status: r.status, remark: r.remark, createdAt: r.created_at,
    })), normalizedPage, normalizedPageSize, count)
  } catch (err: any) { error(res, err.message) }
})

router.post('/', (req, res) => {
  try {
    const { materialId, batchId, quantity, reason, remark } = req.body
    const returnQuantity = Number(quantity)
    if (!materialId || quantity === undefined || quantity === null || !Number.isFinite(returnQuantity) || returnQuantity <= 0 || !reason) {
      error(res, 'Missing or invalid fields', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const operator = (req as any).user?.username || 'system'
    const material = db.prepare('SELECT * FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
    if (!material) { error(res, '物料不存在或已删除', 'NOT_FOUND', 404); return }
    if (Number(material.status) !== 1) { error(res, '物料已停用，不能创建退库记录', 'CONFLICT', 409); return }
    db.exec('BEGIN IMMEDIATE')
    try {
      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
      if (!inv || Number(inv.stock) < returnQuantity) {
        db.exec('ROLLBACK')
        error(res, 'Insufficient stock', 'STOCK_INSUFFICIENT', 422)
        return
      }

      const batch = pickBatch(db, materialId, returnQuantity, batchId)
      if (batchId && !batch) {
        db.exec('ROLLBACK')
        error(res, '退库批次不存在或不属于该物料', 'BATCH_NOT_FOUND', 404)
        return
      }
      if (batch && (Number(batch.status) !== 1 || Number(batch.remaining) < returnQuantity)) {
        db.exec('ROLLBACK')
        error(res, '批次库存不足', 'BATCH_STOCK_INSUFFICIENT', 422)
        return
      }
      if (!batch && hasActiveBatch(db, materialId)) {
        db.exec('ROLLBACK')
        error(res, '请选择库存充足的退库批次', 'BATCH_REQUIRED', 422)
        return
      }

      const unitCost = Number(batch?.inbound_price ?? material.price ?? 0)
      const totalCost = unitCost * returnQuantity
      const id = uuidv4()
      db.prepare(`
        INSERT INTO return_records (id, return_no, material_id, batch_id, quantity, unit_cost, total_cost, reason, operator, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, generateReturnNo(), materialId, batch?.id || null, returnQuantity, unitCost, totalCost, reason, operator, remark || null)
      db.prepare('UPDATE inventory SET stock = stock - ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?').run(returnQuantity, materialId)
      consumeInventoryLocationStock(db, materialId, returnQuantity, { relatedType: 'return', relatedId: id })

      if (batch) {
        const remaining = Number(batch.remaining) - returnQuantity
        db.prepare(`
          UPDATE batches
          SET remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(remaining, remaining <= 0 ? 0 : Number(batch.status), batch.id)
      }

      // 负库存兜底
      const afterCheck = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any)?.stock
      if (afterCheck < 0) {
        db.exec('ROLLBACK')
        error(res, '库存不能为负数', 'STOCK_NEGATIVE', 422)
        return
      }

      const afterStock = Number(inv?.stock || 0) - returnQuantity
      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator)
        VALUES (?, 'return', ?, ?, ?, ?, ?, 'return', ?)
      `).run(logId, materialId, -returnQuantity, Number(inv?.stock || 0), afterStock, id, operator)

      db.exec('COMMIT')
      success(res, { id }, 'Return created')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const operator = (req as any).user?.username || 'system'
    const record = db.prepare('SELECT * FROM return_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在或已删除', 'NOT_FOUND', 404); return }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE return_records SET is_deleted = 1 WHERE id = ?').run(id)

      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any
      const beforeStock = inv?.stock || 0
      const afterStock = beforeStock + record.quantity
      db.prepare('UPDATE inventory SET stock = ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?').run(afterStock, record.material_id)
      restoreInventoryLocationStock(db, record.material_id, Number(record.quantity), { relatedType: 'return', relatedId: id })

      if (record.batch_id) {
        const batch = db.prepare('SELECT id FROM batches WHERE id = ? AND material_id = ?')
          .get(record.batch_id, record.material_id) as any
        if (!batch) {
          db.exec('ROLLBACK')
          error(res, '退库批次不存在，无法恢复批次库存', 'BATCH_NOT_FOUND', 409)
          return
        }
        db.prepare(`
          UPDATE batches
          SET remaining = remaining + ?, status = 1, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(Number(record.quantity), record.batch_id)
      }

      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
        VALUES (?, 'cancel', ?, ?, ?, ?, ?, 'return_cancel', ?, '撤销退库记录')
      `).run(logId, record.material_id, record.quantity, beforeStock, afterStock, id, operator)

      db.exec('COMMIT')
      success(res, null, '退库记录已撤销')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
