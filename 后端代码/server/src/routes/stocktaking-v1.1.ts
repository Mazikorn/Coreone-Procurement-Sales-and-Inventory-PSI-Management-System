import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { generateNo } from '../utils/generateNo.js'
import { consumeInventoryLocationStock, ensureInventoryLocationRows, restoreInventoryLocationStock } from '../utils/inventory-locations.js'

const router = Router()
const STOCKTAKING_STATUSES = new Set(['completed', 'confirmed'])

function generateStocktakingNo(): string {
  return generateNo('ST')
}

function createStocktakingBatchNo(db: any, materialId: string, stocktakingNo: string): string {
  const base = `STK-${stocktakingNo}`
  let batchNo = base
  let suffix = 1
  while (db.prepare('SELECT 1 FROM batches WHERE material_id = ? AND batch_no = ?').get(materialId, batchNo)) {
    suffix += 1
    batchNo = `${base}-${suffix}`
  }
  return batchNo
}

function applyBatchAdjustment(db: any, record: any) {
  const difference = Number(record.difference || 0)
  if (difference === 0) return

  const activeBatchCount = Number((db.prepare(`
    SELECT COUNT(*) as count
    FROM batches
    WHERE material_id = ? AND status = 1 AND remaining > 0
  `).get(record.material_id) as any)?.count || 0)

  if (difference < 0) {
    if (activeBatchCount === 0) return
    let remainingToDeduct = Math.abs(difference)
    const batches = db.prepare(`
      SELECT id, remaining, status
      FROM batches
      WHERE material_id = ? AND status = 1 AND remaining > 0
      ORDER BY
        CASE WHEN expiry_date IS NULL OR expiry_date = '' THEN 1 ELSE 0 END,
        expiry_date ASC,
        created_at ASC
    `).all(record.material_id) as any[]

    for (const batch of batches) {
      if (remainingToDeduct <= 0) break
      const currentRemaining = Number(batch.remaining || 0)
      const deduct = Math.min(currentRemaining, remainingToDeduct)
      const nextRemaining = currentRemaining - deduct
      db.prepare(`
        UPDATE batches
        SET remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextRemaining, nextRemaining <= 0 ? 0 : Number(batch.status), batch.id)
      db.prepare(`
        INSERT INTO stocktaking_batch_adjustments (id, stocktaking_id, material_id, batch_id, quantity_delta)
        VALUES (?, ?, ?, ?, ?)
      `).run(uuidv4(), record.id, record.material_id, batch.id, -deduct)
      remainingToDeduct -= deduct
    }

    if (remainingToDeduct > 0) {
      throw new Error('批次库存不足，无法确认盘点差异')
    }
    return
  }

  const material = db.prepare('SELECT price FROM materials WHERE id = ? AND is_deleted = 0')
    .get(record.material_id) as any
  const batchId = uuidv4()
  const batchNo = createStocktakingBatchNo(db, record.material_id, record.stocktaking_no)
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, inbound_id, inbound_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(batchId, record.material_id, batchNo, difference, difference, record.id, Number(material?.price || 0))
  db.prepare(`
    INSERT INTO stocktaking_batch_adjustments (id, stocktaking_id, material_id, batch_id, quantity_delta)
    VALUES (?, ?, ?, ?, ?)
  `).run(uuidv4(), record.id, record.material_id, batchId, difference)
}

function revertBatchAdjustment(db: any, record: any): void {
  const adjustments = db.prepare(`
    SELECT *
    FROM stocktaking_batch_adjustments
    WHERE stocktaking_id = ?
    ORDER BY created_at DESC
  `).all(record.id) as any[]

  for (const adjustment of adjustments) {
    const batch = db.prepare('SELECT id, quantity, remaining FROM batches WHERE id = ? AND material_id = ?')
      .get(adjustment.batch_id, adjustment.material_id) as any
    if (!batch) throw new Error('盘点批次调整记录对应批次不存在，无法撤销')

    const delta = Number(adjustment.quantity_delta || 0)
    if (delta < 0) {
      db.prepare(`
        UPDATE batches
        SET remaining = remaining + ?, status = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(Math.abs(delta), adjustment.batch_id)
    } else if (delta > 0) {
      const nextQuantity = Number(batch.quantity || 0) - delta
      const nextRemaining = Number(batch.remaining || 0) - delta
      if (nextQuantity < 0 || nextRemaining < 0) {
        throw new Error('盘点盘盈批次已被使用，无法撤销')
      }
      db.prepare(`
        UPDATE batches
        SET quantity = ?, remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextQuantity, nextRemaining, nextRemaining <= 0 ? 0 : 1, adjustment.batch_id)
    }
  }
}

function buildStocktakingWhere(query: any) {
  const { keyword, status } = query
  let where = 'st.is_deleted = 0'
  const params: any[] = []
  if (keyword) {
    where += ' AND (st.stocktaking_no LIKE ? OR m.name LIKE ? OR m.code LIKE ?)'
    const like = `%${keyword}%`
    params.push(like, like, like)
  }
  if (status && typeof status === 'string') {
    where += ' AND st.status = ?'
    params.push(status)
  }
  return { where, params }
}

function rejectInvalidStocktakingStatus(query: any, res: any) {
  const status = typeof query.status === 'string' ? query.status.trim() : ''
  if (status && !STOCKTAKING_STATUSES.has(status)) {
    error(res, '盘点状态筛选无效', 'INVALID_PARAMETER', 400)
    return true
  }
  return false
}

function parsePositiveIntegerParam(value: unknown, max?: number) {
  const text = String(value || '').trim()
  if (!/^\d+$/.test(text)) return null
  const numberValue = Number(text)
  if (!Number.isSafeInteger(numberValue) || numberValue < 1) return null
  if (max !== undefined && numberValue > max) return null
  return numberValue
}

function handleStocktakingStockError(res: any, err: any): boolean {
  if (err?.message !== 'LOCATION_STOCK_INSUFFICIENT') return false
  error(res, '库位库存不足，无法确认盘点差异', 'STOCK_INSUFFICIENT', 422)
  return true
}

router.get('/', (req, res) => {
  try {
    if (rejectInvalidStocktakingStatus(req.query, res)) return
    const { page = 1, pageSize = 20 } = req.query
    const normalizedPage = parsePositiveIntegerParam(page)
    const normalizedPageSize = parsePositiveIntegerParam(pageSize, 100)
    if (!normalizedPage) {
      error(res, '页码必须为正整数', 'INVALID_PARAMETER', 400)
      return
    }
    if (!normalizedPageSize) {
      error(res, '每页数量必须为 1-100 的整数', 'INVALID_PARAMETER', 400)
      return
    }
    const db = getDatabase()
    const { where, params } = buildStocktakingWhere(req.query)
    const count = (db.prepare(`
      SELECT COUNT(*) as total
      FROM stocktaking_records st
      LEFT JOIN materials m ON m.id = st.material_id
      WHERE ${where}
    `).get(...params) as any)?.total || 0
    const offset = (normalizedPage - 1) * normalizedPageSize
    const list = db.prepare(`
      SELECT
        st.*,
        m.name as material_name,
        m.code as material_code,
        m.unit as material_unit,
        c.name as category_name,
        l.name as location_name
      FROM stocktaking_records st
      LEFT JOIN materials m ON m.id = st.material_id
      LEFT JOIN material_categories c ON c.id = m.category_id
      LEFT JOIN locations l ON l.id = m.location_id
      WHERE ${where}
      ORDER BY st.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, normalizedPageSize, offset) as any[]
    successList(res, list.map((r: any) => ({
      id: r.id, stocktakingNo: r.stocktaking_no, materialId: r.material_id,
      materialName: r.material_name, materialCode: r.material_code,
      materialUnit: r.material_unit, categoryName: r.category_name,
      locationName: r.location_name,
      systemStock: r.system_stock, actualStock: r.actual_stock,
      difference: r.difference, operator: r.operator, status: r.status,
      remark: r.remark, createdAt: r.created_at,
    })), normalizedPage, normalizedPageSize, count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/stats', (req, res) => {
  try {
    if (rejectInvalidStocktakingStatus(req.query, res)) return
    const db = getDatabase()
    const { where, params } = buildStocktakingWhere(req.query)
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN st.status = 'completed' THEN 1 ELSE 0 END), 0) as completed,
        COALESCE(SUM(CASE WHEN st.status = 'confirmed' THEN 1 ELSE 0 END), 0) as confirmed,
        COALESCE(SUM(CASE WHEN st.difference != 0 AND st.status != 'confirmed' THEN 1 ELSE 0 END), 0) as diffCount,
        COALESCE(SUM(CASE WHEN st.difference = 0 THEN 1 ELSE 0 END), 0) as matched
      FROM stocktaking_records st
      LEFT JOIN materials m ON m.id = st.material_id
      WHERE ${where}
    `).get(...params) as any
    const total = Number(row?.total || 0)
    const matched = Number(row?.matched || 0)
    success(res, {
      total,
      completed: row?.completed || 0,
      confirmed: row?.confirmed || 0,
      diffCount: row?.diffCount || 0,
      accuracy: total > 0 ? Number(((matched / total) * 100).toFixed(1)) : 100,
    })
  } catch (err: any) { error(res, err.message) }
})

router.post('/', (req, res) => {
  try {
    const { materialId, actualStock, remark } = req.body
    const operator = (req as any).user?.username || 'system'
    if (!materialId || actualStock === undefined) { error(res, 'Missing fields', 'INVALID_PARAMETER', 400); return }
    const normalizedActualStock = Number(actualStock)
    if (!Number.isFinite(normalizedActualStock)) { error(res, 'Invalid actual stock', 'INVALID_PARAMETER', 400); return }
    if (normalizedActualStock < 0) { error(res, 'actualStock 不能为负数', 'INVALID_PARAMETER', 400); return }
    const db = getDatabase()
    const material = db.prepare('SELECT 1 FROM materials WHERE id = ? AND is_deleted = 0').get(materialId)
    if (!material) { error(res, '物料不存在或已删除', 'NOT_FOUND', 404); return }
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    if (!inventory) { error(res, '物料无库存记录，无法创建盘点', 'NOT_FOUND', 404); return }

    db.exec('BEGIN IMMEDIATE')
    try {
      const systemStock = Number(inventory.stock || 0)
      const difference = normalizedActualStock - systemStock
      const id = uuidv4()
      db.prepare('INSERT INTO stocktaking_records (id, stocktaking_no, material_id, system_stock, actual_stock, difference, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, generateStocktakingNo(), materialId, systemStock, normalizedActualStock, difference, operator || 'system', remark || null)

      db.exec('COMMIT')
      success(res, { id }, 'Stocktaking created')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

// 确认盘点记录
router.post('/:id/confirm', (req, res) => {
  try {
    const { id } = req.params
    const { reason, remark } = req.body || {}
    const operator = (req as any).user?.username || 'system'
    const db = getDatabase()
    const record = db.prepare('SELECT * FROM stocktaking_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在或已删除', 'NOT_FOUND', 404); return }
    if (record.status === 'confirmed') { error(res, '盘点已确认', 'BUSINESS_RULE', 400); return }
    if (record.difference !== 0 && !reason) { error(res, '请选择差异原因', 'INVALID_PARAMETER', 400); return }

    db.exec('BEGIN IMMEDIATE')
    try {
      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any
      if (!inv) {
        db.exec('ROLLBACK')
        error(res, '物料无库存记录，无法确认盘点', 'NOT_FOUND', 404)
        return
      }
      const currentStock = Number(inv.stock || 0)
      if (currentStock !== Number(record.system_stock)) {
        db.exec('ROLLBACK')
        error(res, '当前库存已变化，请重新盘点', 'BUSINESS_RULE', 409)
        return
      }

      // 更新状态为已确认
      db.prepare('UPDATE stocktaking_records SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('confirmed', id)

      // 如果有差异，更新库存
      if (record.difference !== 0) {
        try {
          applyBatchAdjustment(db, record)
        } catch (batchErr: any) {
          db.exec('ROLLBACK')
          error(res, batchErr.message, 'BATCH_STOCKTAKING_ADJUST_FAILED', 422)
          return
        }

        ensureInventoryLocationRows(db, record.material_id)
        db.prepare('UPDATE inventory SET stock = ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')
          .run(record.actual_stock, record.material_id)
        if (Number(record.difference) < 0) {
          consumeInventoryLocationStock(db, record.material_id, Math.abs(Number(record.difference)), { relatedType: 'stocktaking', relatedId: id })
        } else if (Number(record.difference) > 0) {
          restoreInventoryLocationStock(db, record.material_id, Number(record.difference), { relatedType: 'stocktaking', relatedId: id })
        }

        // 检查库存是否为负
        const afterStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any)?.stock
        if (afterStock < 0) {
          db.exec('ROLLBACK')
          error(res, '库存不能为负数', 'STOCK_NEGATIVE', 422)
          return
        }

        // 记录库存日志
        const logId = uuidv4()
        const logRemark = [
          reason ? `差异原因:${reason}` : '盘点差异确认',
          remark ? `处理说明:${remark}` : null,
        ].filter(Boolean).join('；')
        db.prepare('INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(logId, 'adjust', record.material_id, record.difference, currentStock, record.actual_stock, id, 'stocktaking', operator, logRemark)
      }

      db.exec('COMMIT')
      success(res, { id, status: 'confirmed' }, '盘点已确认')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) {
    if (handleStocktakingStockError(res, err)) return
    error(res, err.message)
  }
})

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const record = db.prepare('SELECT * FROM stocktaking_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在或已删除', 'NOT_FOUND', 404); return }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE stocktaking_records SET is_deleted = 1 WHERE id = ?').run(id)

      if (record.status === 'confirmed' && record.difference !== 0) {
        const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any
        const beforeStock = inv?.stock || 0
        const afterStock = record.system_stock
        // 使用相对增量恢复到系统库存
        const diff = record.system_stock - beforeStock

        if (Number(beforeStock) !== Number(record.actual_stock)) {
          db.exec('ROLLBACK')
          error(res, '当前库存已变化，无法撤销盘点记录', 'BUSINESS_RULE', 409)
          return
        }

        // 检查恢复后库存是否会变负
        if (afterStock < 0) {
          db.exec('ROLLBACK')
          error(res, `撤销后库存将变为负数（${afterStock}），无法撤销`, 'STOCK_NEGATIVE', 422)
          return
        }

        try {
          revertBatchAdjustment(db, record)
        } catch (batchErr: any) {
          db.exec('ROLLBACK')
          error(res, batchErr.message, 'BATCH_STOCKTAKING_REVERT_FAILED', 409)
          return
        }

        db.prepare('UPDATE inventory SET stock = stock + ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?').run(diff, record.material_id)
        if (diff < 0) {
          consumeInventoryLocationStock(db, record.material_id, Math.abs(diff), { relatedType: 'stocktaking', relatedId: id })
        } else if (diff > 0) {
          restoreInventoryLocationStock(db, record.material_id, diff, { relatedType: 'stocktaking', relatedId: id })
        }

        const logId = uuidv4()
        db.prepare(`
          INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
          VALUES (?, 'cancel', ?, ?, ?, ?, ?, 'stocktaking_cancel', ?, '撤销盘点记录')
        `).run(logId, record.material_id, diff, beforeStock, afterStock, id, (req as any).user?.username || 'system')
      }

      db.exec('COMMIT')
      success(res, null, '盘点记录已撤销')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
