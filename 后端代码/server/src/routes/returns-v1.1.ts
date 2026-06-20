import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { generateNo } from '../utils/generateNo.js'
import { consumeInventoryLocationStock, restoreInventoryLocationStock } from '../utils/inventory-locations.js'

const router = Router()
const BATCH_RESTORE_EPSILON = 0.000001
const RETURN_EPSILON = 0.000001

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

function handleReturnStockError(res: any, err: any): boolean {
  if (err?.message !== 'LOCATION_STOCK_INSUFFICIENT') return false
  error(res, '库位库存不足，无法撤销退库记录', 'RETURN_CANCEL_CONFLICT', 409)
  return true
}

function getReturnSource(db: any, outboundItemId: string) {
  return db.prepare(`
    SELECT
      oi.id as outbound_item_id,
      oi.outbound_id,
      o.outbound_no,
      o.status as outbound_status,
      o.is_deleted as outbound_deleted,
      oi.material_id,
      m.name as material_name,
      m.unit as material_unit,
      m.status as material_status,
      m.location_id as material_location_id,
      oi.batch_id,
      oi.batch_no,
      oi.quantity as outbound_quantity,
      oi.unit_cost,
      oi.total_cost,
      COALESCE(ret.returned_quantity, 0) as returned_quantity
    FROM outbound_items oi
    JOIN outbound_records o ON o.id = oi.outbound_id
    JOIN materials m ON m.id = oi.material_id AND m.is_deleted = 0
    LEFT JOIN (
      SELECT outbound_item_id, SUM(quantity) as returned_quantity
      FROM return_records
      WHERE is_deleted = 0 AND status != 'cancelled' AND outbound_item_id IS NOT NULL
      GROUP BY outbound_item_id
    ) ret ON ret.outbound_item_id = oi.id
    WHERE oi.id = ?
  `).get(outboundItemId) as any
}

function mapReturnSource(row: any) {
  const returnableQuantity = Math.max(0, Number(row.outbound_quantity || 0) - Number(row.returned_quantity || 0))
  return {
    outboundItemId: row.outbound_item_id,
    outboundId: row.outbound_id,
    outboundNo: row.outbound_no,
    materialId: row.material_id,
    materialName: row.material_name,
    unit: row.material_unit,
    batchId: row.batch_id,
    batchNo: row.batch_no,
    outboundQuantity: Number(row.outbound_quantity || 0),
    returnedQuantity: Number(row.returned_quantity || 0),
    returnableQuantity,
    unitCost: Number(row.unit_cost || 0),
    totalCost: Number(row.total_cost || 0),
  }
}

router.get('/sources', (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, materialId } = req.query
    const normalizedPage = Math.max(1, Number(page) || 1)
    const normalizedPageSize = Math.min(Math.max(1, Number(pageSize) || 20), 1000)
    const db = getDatabase()
    let where = "o.status = 'completed' AND o.is_deleted = 0"
    const params: any[] = []
    if (materialId) {
      where += ' AND oi.material_id = ?'
      params.push(String(materialId))
    }
    if (keyword) {
      where += ' AND (o.outbound_no LIKE ? OR m.name LIKE ? OR oi.batch_no LIKE ?)'
      const like = `%${keyword}%`
      params.push(like, like, like)
    }

    const baseSql = `
      FROM outbound_items oi
      JOIN outbound_records o ON o.id = oi.outbound_id
      JOIN materials m ON m.id = oi.material_id AND m.is_deleted = 0
      LEFT JOIN (
        SELECT outbound_item_id, SUM(quantity) as returned_quantity
        FROM return_records
        WHERE is_deleted = 0 AND status != 'cancelled' AND outbound_item_id IS NOT NULL
        GROUP BY outbound_item_id
      ) ret ON ret.outbound_item_id = oi.id
      WHERE ${where}
        AND (oi.quantity - COALESCE(ret.returned_quantity, 0)) > ?
    `
    const sourceParams = [...params, RETURN_EPSILON]
    const count = (db.prepare(`SELECT COUNT(*) as total ${baseSql}`).get(...sourceParams) as any)?.total || 0
    const offset = (normalizedPage - 1) * normalizedPageSize
    const rows = db.prepare(`
      SELECT
        oi.id as outbound_item_id,
        oi.outbound_id,
        o.outbound_no,
        oi.material_id,
        m.name as material_name,
        m.unit as material_unit,
        oi.batch_id,
        oi.batch_no,
        oi.quantity as outbound_quantity,
        oi.unit_cost,
        oi.total_cost,
        COALESCE(ret.returned_quantity, 0) as returned_quantity
      ${baseSql}
      ORDER BY o.created_at DESC, oi.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...sourceParams, normalizedPageSize, offset) as any[]

    successList(res, rows.map(mapReturnSource), normalizedPage, normalizedPageSize, count)
  } catch (err: any) {
    if (handleReturnStockError(res, err)) return
    error(res, err.message)
  }
})

router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword } = req.query
    const normalizedPage = Math.max(1, Number(page) || 1)
    const normalizedPageSize = Math.min(Math.max(1, Number(pageSize) || 20), 1000)
    const db = getDatabase()
    let where = 'r.is_deleted = 0'
    const params: any[] = []
    if (keyword) {
      where += ' AND (r.return_no LIKE ? OR r.reason LIKE ? OR r.remark LIKE ? OR m.name LIKE ? OR o.outbound_no LIKE ?)'
      const like = `%${keyword}%`
      params.push(like, like, like, like, like)
    }
    const count = (db.prepare(`
      SELECT COUNT(*) as total
      FROM return_records r
      LEFT JOIN materials m ON r.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN outbound_items oi ON r.outbound_item_id = oi.id
      LEFT JOIN outbound_records o ON oi.outbound_id = o.id
      WHERE ${where}
    `).get(...params) as any)?.total || 0
    const offset = (normalizedPage - 1) * normalizedPageSize
    const list = db.prepare(`
      SELECT r.*, m.name as material_name, m.unit as material_unit, b.batch_no, o.outbound_no
      FROM return_records r
      LEFT JOIN materials m ON r.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN batches b ON r.batch_id = b.id
      LEFT JOIN outbound_items oi ON r.outbound_item_id = oi.id
      LEFT JOIN outbound_records o ON oi.outbound_id = o.id
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, normalizedPageSize, offset) as any[]
    successList(res, list.map((r: any) => ({
      id: r.id, returnNo: r.return_no, outboundItemId: r.outbound_item_id, outboundNo: r.outbound_no, materialId: r.material_id,
      materialName: r.material_name, unit: r.material_unit,
      batchId: r.batch_id, batchNo: r.batch_no,
      quantity: r.quantity, reason: r.reason, operator: r.operator,
      unitCost: Number(r.unit_cost || 0), totalCost: Number(r.total_cost || 0),
      status: r.status, remark: r.remark, createdAt: r.created_at,
    })), normalizedPage, normalizedPageSize, count)
  } catch (err: any) {
    if (handleReturnStockError(res, err)) return
    error(res, err.message)
  }
})

router.post('/', (req, res) => {
  try {
    const { outboundItemId, quantity, reason, remark } = req.body
    const returnQuantity = Number(quantity)
    const normalizedOutboundItemId = String(outboundItemId || '').trim()
    if (!normalizedOutboundItemId || quantity === undefined || quantity === null || !Number.isFinite(returnQuantity) || returnQuantity <= 0 || !reason) {
      error(res, 'outboundItemId、quantity 和 reason 为必填字段', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const operator = (req as any).user?.username || 'system'
    db.exec('BEGIN IMMEDIATE')
    try {
      const source = getReturnSource(db, normalizedOutboundItemId)
      if (!source || Number(source.outbound_deleted) === 1 || source.outbound_status !== 'completed') {
        db.exec('ROLLBACK')
        error(res, '来源出库明细不存在或不可退库', 'OUTBOUND_ITEM_NOT_FOUND', 404)
        return
      }
      if (Number(source.material_status) !== 1) {
        db.exec('ROLLBACK')
        error(res, '物料已停用，不能创建退库记录', 'CONFLICT', 409)
        return
      }
      const returnableQuantity = Number(source.outbound_quantity || 0) - Number(source.returned_quantity || 0)
      if (returnQuantity - returnableQuantity > RETURN_EPSILON) {
        db.exec('ROLLBACK')
        error(res, '退库数量不能超过来源出库明细可退数量', 'RETURN_QUANTITY_EXCEEDED', 422)
        return
      }

      let batch: any = null
      if (source.batch_id) {
        batch = db.prepare('SELECT id, quantity, remaining, status FROM batches WHERE id = ? AND material_id = ?')
          .get(source.batch_id, source.material_id) as any
        if (!batch) {
          db.exec('ROLLBACK')
          error(res, '退库批次不存在，无法恢复批次库存', 'BATCH_NOT_FOUND', 409)
          return
        }
        const nextRemaining = Number(batch.remaining || 0) + returnQuantity
        const batchQuantity = Number(batch.quantity || 0)
        if (nextRemaining - batchQuantity > BATCH_RESTORE_EPSILON) {
          db.exec('ROLLBACK')
          error(res, '退库数量会导致批次剩余量超过批次数量', 'BATCH_RESTORE_CONFLICT', 409)
          return
        }
      }

      const unitCost = Number(source.unit_cost || 0)
      const totalCost = unitCost * returnQuantity
      const id = uuidv4()
      db.prepare(`
        INSERT INTO return_records (id, return_no, outbound_item_id, material_id, batch_id, quantity, unit_cost, total_cost, reason, operator, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, generateReturnNo(), normalizedOutboundItemId, source.material_id, source.batch_id || null, returnQuantity, unitCost, totalCost, reason, operator, remark || null)

      const inv = db.prepare('SELECT id, stock, location_id FROM inventory WHERE material_id = ?').get(source.material_id) as any
      const beforeStock = Number(inv?.stock || 0)
      const afterStock = beforeStock + returnQuantity
      if (inv) {
        db.prepare('UPDATE inventory SET stock = ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?').run(afterStock, source.material_id)
      } else {
        db.prepare(`
          INSERT INTO inventory (id, material_id, stock, locked_stock, location_id)
          VALUES (?, ?, ?, 0, ?)
        `).run(uuidv4(), source.material_id, afterStock, source.material_location_id || null)
      }
      restoreInventoryLocationStock(db, source.material_id, returnQuantity, { relatedType: 'return', relatedId: id })

      if (batch) {
        const remaining = Number(batch.remaining || 0) + returnQuantity
        db.prepare(`
          UPDATE batches
          SET remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(remaining, 1, batch.id)
      }

      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator)
        VALUES (?, 'return', ?, ?, ?, ?, ?, 'return', ?)
      `).run(logId, source.material_id, returnQuantity, beforeStock, afterStock, id, operator)

      db.exec('COMMIT')
      success(res, { id }, 'Return created')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) {
    if (handleReturnStockError(res, err)) return
    error(res, err.message)
  }
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
      const restoreBatch = record.batch_id
        ? db.prepare('SELECT id, quantity, remaining FROM batches WHERE id = ? AND material_id = ?')
          .get(record.batch_id, record.material_id) as any
        : null
      if (record.batch_id && !restoreBatch) {
        db.exec('ROLLBACK')
        error(res, '退库批次不存在，无法撤销退库记录', 'BATCH_NOT_FOUND', 409)
        return
      }
      if (restoreBatch && Number(restoreBatch.remaining || 0) + RETURN_EPSILON < Number(record.quantity || 0)) {
          db.exec('ROLLBACK')
          error(res, '退库库存已被后续业务消耗，无法撤销退库记录', 'RETURN_CANCEL_CONFLICT', 409)
          return
      }

      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any
      if (!inv) {
        db.exec('ROLLBACK')
        error(res, '物料无库存记录，无法撤销退库记录', 'NOT_FOUND', 404)
        return
      }
      if (Number(inv.stock || 0) + RETURN_EPSILON < Number(record.quantity || 0)) {
        db.exec('ROLLBACK')
        error(res, '退库库存已被后续业务消耗，无法撤销退库记录', 'RETURN_CANCEL_CONFLICT', 409)
        return
      }
      const locationStock = db.prepare(`
        SELECT COALESCE(SUM(stock), 0) as stock
        FROM inventory_locations
        WHERE material_id = ?
      `).get(record.material_id) as any
      if (Number(locationStock?.stock || 0) + RETURN_EPSILON < Number(record.quantity || 0)) {
        db.exec('ROLLBACK')
        error(res, '退库库位库存已被后续业务消耗，无法撤销退库记录', 'RETURN_CANCEL_CONFLICT', 409)
        return
      }

      db.prepare('UPDATE return_records SET is_deleted = 1 WHERE id = ?').run(id)

      const beforeStock = Number(inv.stock || 0)
      const afterStock = beforeStock - record.quantity
      db.prepare('UPDATE inventory SET stock = ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?').run(afterStock, record.material_id)
      consumeInventoryLocationStock(db, record.material_id, Number(record.quantity), { relatedType: 'return_cancel', relatedId: id })

      if (record.batch_id) {
        const nextRemaining = Number(restoreBatch.remaining || 0) - Number(record.quantity || 0)
        db.prepare(`
          UPDATE batches
          SET remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).run(nextRemaining, nextRemaining <= RETURN_EPSILON ? 0 : 1, record.batch_id)
      }

      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
        VALUES (?, 'cancel', ?, ?, ?, ?, ?, 'return_cancel', ?, '撤销退库记录')
      `).run(logId, record.material_id, -Number(record.quantity), beforeStock, afterStock, id, operator)

      db.exec('COMMIT')
      success(res, null, '退库记录已撤销')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
