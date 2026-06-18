import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { generateNo } from '../utils/generateNo.js'
import { consumeInventoryLocationStock, restoreInventoryLocationStock } from '../utils/inventory-locations.js'

const router = Router()

function generateScrapNo(): string {
  return generateNo('SC')
}

function pickBatch(db: any, materialId: string, quantity: number, batchId?: string) {
  if (batchId) {
    return db.prepare(`
      SELECT id, batch_no, remaining, status
      FROM batches
      WHERE id = ? AND material_id = ?
    `).get(batchId, materialId) as any
  }

  return db.prepare(`
    SELECT id, batch_no, remaining, status
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

function validateBatchForDeduction(db: any, materialId: string, quantity: number, batchId?: string) {
  const batch = pickBatch(db, materialId, quantity, batchId)
  if (batchId && !batch) {
    return { error: { message: '报废批次不存在或不属于该物料', code: 'BATCH_NOT_FOUND', status: 404 } }
  }
  if (batch && (Number(batch.status) !== 1 || Number(batch.remaining) < quantity)) {
    return { error: { message: '批次库存不足', code: 'BATCH_STOCK_INSUFFICIENT', status: 422 } }
  }
  if (!batch && hasActiveBatch(db, materialId)) {
    return { error: { message: '请选择库存充足的报废批次', code: 'BATCH_REQUIRED', status: 422 } }
  }
  return { batch }
}

router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query
    const normalizedPage = Math.max(1, Number(page) || 1)
    const normalizedPageSize = Math.min(Math.max(1, Number(pageSize) || 20), 1000)
    const db = getDatabase()
    const count = (db.prepare('SELECT COUNT(*) as total FROM scrap_records WHERE is_deleted = 0').get() as any)?.total || 0
    const offset = (normalizedPage - 1) * normalizedPageSize
    const list = db.prepare(`
      SELECT s.*, m.name as material_name, m.unit as material_unit, b.batch_no
      FROM scrap_records s
      LEFT JOIN materials m ON s.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN batches b ON s.batch_id = b.id
      WHERE s.is_deleted = 0
      ORDER BY s.created_at DESC
      LIMIT ? OFFSET ?
    `).all(normalizedPageSize, offset) as any[]
    successList(res, list.map((r: any) => ({
      id: r.id, scrapNo: r.scrap_no, materialId: r.material_id, materialName: r.material_name,
      unit: r.material_unit,
      batchId: r.batch_id, batchNo: r.batch_no,
      quantity: r.quantity, reason: r.reason, operator: r.operator,
      status: r.status, remark: r.remark, createdAt: r.created_at,
    })), normalizedPage, normalizedPageSize, count)
  } catch (err: any) { error(res, err.message) }
})

router.post('/batch', (req, res) => {
  try {
    const records = Array.isArray(req.body?.records) ? req.body.records : []
    const operator = (req as any).user?.username || 'system'
    if (records.length === 0) {
      error(res, '报废数据不能为空', 'INVALID_PARAMETER', 400); return
    }
    if (records.length > 100) {
      error(res, '单次最多批量报废 100 条', 'INVALID_PARAMETER', 400); return
    }

    const db = getDatabase()
    const errors: string[] = []
    let errorStatus = 400
    let errorCode = 'INVALID_PARAMETER'
    const stockByMaterial = new Map<string, number>()
    const validRecords = records.map((record: any, index: number) => {
      const row = index + 1
      const materialId = typeof record.materialId === 'string' ? record.materialId.trim() : ''
      const quantity = Number(record.quantity)
      const batchId = typeof record.batchId === 'string' ? record.batchId.trim() : undefined
      const reason = typeof record.reason === 'string' ? record.reason.trim() : ''
      const remark = typeof record.remark === 'string' ? record.remark.trim() : undefined

      if (!materialId) errors.push(`第 ${row} 行物料不能为空`)
      if (!Number.isFinite(quantity) || quantity <= 0) errors.push(`第 ${row} 行数量必须大于 0`)
      if (!reason) errors.push(`第 ${row} 行报废原因不能为空`)
      if (materialId) {
        const material = db.prepare('SELECT id, status FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
        if (!material) {
          errors.push(`第 ${row} 行物料不存在或已删除`)
        } else if (Number(material.status) !== 1) {
          errors.push(`第 ${row} 行物料已停用，不能创建报废记录`)
          errorStatus = 409
          errorCode = 'CONFLICT'
        }
      }

      stockByMaterial.set(materialId, (stockByMaterial.get(materialId) || 0) + (Number.isFinite(quantity) ? quantity : 0))
      return { materialId, batchId, quantity, reason, remark }
    })

    for (const [materialId, requiredQty] of stockByMaterial.entries()) {
      if (!materialId) continue
      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
      if (!inv || Number(inv.stock) < requiredQty) {
        errors.push(`物料 ${materialId} 库存不足，当前可用: ${inv?.stock || 0}`)
      }
    }

    if (errors.length > 0) {
      error(res, errors[0], errorCode, errorStatus, { errors })
      return
    }

    const createdIds: string[] = []
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const record of validRecords) {
        const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.materialId) as any
        const beforeStock = Number(inv?.stock || 0)
        if (beforeStock < record.quantity) {
          db.exec('ROLLBACK')
          error(res, `库存不足，当前可用: ${beforeStock}`, 'STOCK_INSUFFICIENT', 422)
          return
        }
        const batchResult = validateBatchForDeduction(db, record.materialId, record.quantity, record.batchId)
        if (batchResult.error) {
          db.exec('ROLLBACK')
          error(res, batchResult.error.message, batchResult.error.code, batchResult.error.status)
          return
        }

        const id = uuidv4()
        const afterStock = beforeStock - record.quantity
        db.prepare('INSERT INTO scrap_records (id, scrap_no, material_id, batch_id, quantity, reason, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, generateScrapNo(), record.materialId, batchResult.batch?.id || null, record.quantity, record.reason, operator, record.remark || null)
        db.prepare('UPDATE inventory SET stock = ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')
          .run(afterStock, record.materialId)
        consumeInventoryLocationStock(db, record.materialId, record.quantity, { relatedType: 'scrap', relatedId: id })
        if (batchResult.batch) {
          const remaining = Number(batchResult.batch.remaining) - record.quantity
          db.prepare(`
            UPDATE batches
            SET remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(remaining, remaining <= 0 ? 0 : Number(batchResult.batch.status), batchResult.batch.id)
        }
        db.prepare(`
          INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
          VALUES (?, 'scrap', ?, ?, ?, ?, ?, 'scrap_batch', ?, ?)
        `).run(uuidv4(), record.materialId, -record.quantity, beforeStock, afterStock, id, operator, '批量报废')
        createdIds.push(id)
      }

      db.exec('COMMIT')
      success(res, { createdCount: createdIds.length, ids: createdIds }, 'Batch scrap created')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

router.post('/', (req, res) => {
  try {
    const { materialId, batchId, quantity, reason, remark } = req.body
    const scrapQuantity = Number(quantity)
    const operator = (req as any).user?.username || 'system'
    if (!materialId || quantity === undefined || quantity === null || !Number.isFinite(scrapQuantity) || scrapQuantity <= 0 || !reason) {
      error(res, 'Missing or invalid fields', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const material = db.prepare('SELECT * FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
    if (!material) { error(res, '物料不存在或已删除', 'NOT_FOUND', 404); return }
    if (Number(material.status) !== 1) { error(res, '物料已停用，不能创建报废记录', 'CONFLICT', 409); return }

    // 库存检查移入事务内（防止 TOCTOU 竞态条件）
    db.exec('BEGIN IMMEDIATE')
    try {
      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
      if (!inv || Number(inv.stock) < scrapQuantity) {
        db.exec('ROLLBACK')
        error(res, `库存不足，当前可用: ${inv?.stock || 0}`, 'STOCK_INSUFFICIENT', 422)
        return
      }
      const batchResult = validateBatchForDeduction(db, materialId, scrapQuantity, batchId)
      if (batchResult.error) {
        db.exec('ROLLBACK')
        error(res, batchResult.error.message, batchResult.error.code, batchResult.error.status)
        return
      }
      const id = uuidv4()
      db.prepare('INSERT INTO scrap_records (id, scrap_no, material_id, batch_id, quantity, reason, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, generateScrapNo(), materialId, batchResult.batch?.id || null, scrapQuantity, reason, operator || 'system', remark || null)
      db.prepare('UPDATE inventory SET stock = stock - ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?').run(scrapQuantity, materialId)
      consumeInventoryLocationStock(db, materialId, scrapQuantity, { relatedType: 'scrap', relatedId: id })

      if (batchResult.batch) {
        const remaining = Number(batchResult.batch.remaining) - scrapQuantity
        db.prepare(`
          UPDATE batches
          SET remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(remaining, remaining <= 0 ? 0 : Number(batchResult.batch.status), batchResult.batch.id)
      }

      // 负库存兜底
      const afterCheck = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any)?.stock
      if (afterCheck < 0) {
        db.exec('ROLLBACK')
        error(res, '库存不能为负数', 'STOCK_NEGATIVE', 422)
        return
      }

      const afterStock = Number(inv?.stock || 0) - scrapQuantity
      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator)
        VALUES (?, 'scrap', ?, ?, ?, ?, ?, 'scrap', ?)
      `).run(logId, materialId, -scrapQuantity, Number(inv?.stock || 0), afterStock, id, operator || 'system')

      db.exec('COMMIT')
      success(res, { id }, 'Scrap created')
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
    const record = db.prepare('SELECT * FROM scrap_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在或已删除', 'NOT_FOUND', 404); return }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE scrap_records SET is_deleted = 1 WHERE id = ?').run(id)

      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any
      const beforeStock = inv?.stock || 0
      db.prepare('UPDATE inventory SET stock = stock + ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?').run(record.quantity, record.material_id)
      restoreInventoryLocationStock(db, record.material_id, Number(record.quantity), { relatedType: 'scrap', relatedId: id })
      const afterStock = beforeStock + record.quantity

      if (record.batch_id) {
        const batch = db.prepare('SELECT id FROM batches WHERE id = ? AND material_id = ?')
          .get(record.batch_id, record.material_id) as any
        if (!batch) {
          db.exec('ROLLBACK')
          error(res, '报废批次不存在，无法恢复批次库存', 'BATCH_NOT_FOUND', 409)
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
        VALUES (?, 'cancel', ?, ?, ?, ?, ?, 'scrap_cancel', ?, '撤销报废记录')
      `).run(logId, record.material_id, record.quantity, beforeStock, afterStock, id, (req as any).user?.username || 'system')

      db.exec('COMMIT')
      success(res, null, '报废记录已撤销')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
