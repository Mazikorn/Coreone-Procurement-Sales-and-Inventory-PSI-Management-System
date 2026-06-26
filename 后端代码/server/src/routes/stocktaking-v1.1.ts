import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { generateNo } from '../utils/generateNo.js'
import {
  adjustInventoryLocationStock,
  consumeInventoryLocationStock,
  ensureInventoryLocationRows,
  getInventoryLocationStock,
  restoreInventoryLocationStock,
  syncInventoryPrimaryLocation,
} from '../utils/inventory-locations.js'
import {
  adjustBatchLocationStock,
  consumeBatchLocationStock,
  getBatchLocationStock,
  restoreBatchLocationStock,
} from '../utils/batch-locations.js'
import { logOperation } from '../utils/operation-logger.js'
import { checkStockAlerts } from '../utils/alertChecker.js'

const router = Router()
const STOCKTAKING_STATUSES = new Set(['completed', 'confirmed'])
const STOCKTAKING_REASON_CODES = new Set(['normal', 'record', 'physical', 'other'])

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
  const scopedBatchId = record.batch_id || null
  const scopedLocationId = record.location_id || null

  const activeBatchCount = Number((db.prepare(`
    SELECT COUNT(*) as count
    FROM batches
    WHERE material_id = ? AND status = 1 AND remaining > 0
  `).get(record.material_id) as any)?.count || 0)

  if (difference < 0) {
    if (scopedBatchId) {
      const batch = db.prepare(`
        SELECT id, remaining, status
        FROM batches
        WHERE id = ? AND material_id = ? AND status = 1
      `).get(scopedBatchId, record.material_id) as any
      if (!batch) throw new Error('指定盘点批次不存在或不可用')
      const deduct = Math.abs(difference)
      const nextRemaining = Number(batch.remaining || 0) - deduct
      if (nextRemaining < 0) throw new Error('批次库存不足，无法确认盘点差异')
      db.prepare(`
        UPDATE batches
        SET remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextRemaining, nextRemaining <= 0 ? 0 : Number(batch.status), batch.id)
      db.prepare(`
        INSERT INTO stocktaking_batch_adjustments (id, stocktaking_id, material_id, batch_id, location_id, quantity_delta)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), record.id, record.material_id, batch.id, scopedLocationId, -deduct)
      if (scopedLocationId) {
        adjustBatchLocationStock(db, batch.id, record.material_id, scopedLocationId, -deduct, { relatedType: 'stocktaking', relatedId: record.id, operator: record.operator })
      } else {
        consumeBatchLocationStock(db, batch.id, record.material_id, deduct, { relatedType: 'stocktaking', relatedId: record.id, operator: record.operator })
      }
      return
    }

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
        INSERT INTO stocktaking_batch_adjustments (id, stocktaking_id, material_id, batch_id, location_id, quantity_delta)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(uuidv4(), record.id, record.material_id, batch.id, null, -deduct)
      consumeBatchLocationStock(db, batch.id, record.material_id, deduct, { relatedType: 'stocktaking', relatedId: record.id, operator: record.operator })
      remainingToDeduct -= deduct
    }

    if (remainingToDeduct > 0) {
      throw new Error('批次库存不足，无法确认盘点差异')
    }
    return
  }

  if (scopedBatchId) {
    const batch = db.prepare(`
      SELECT id
      FROM batches
      WHERE id = ? AND material_id = ?
    `).get(scopedBatchId, record.material_id) as any
    if (!batch) throw new Error('指定盘点批次不存在或不可用')
    db.prepare(`
      UPDATE batches
      SET quantity = quantity + ?, remaining = remaining + ?, status = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(difference, difference, scopedBatchId)
    db.prepare(`
      INSERT INTO stocktaking_batch_adjustments (id, stocktaking_id, material_id, batch_id, location_id, quantity_delta)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), record.id, record.material_id, scopedBatchId, scopedLocationId, difference)
    if (scopedLocationId) {
      adjustBatchLocationStock(db, scopedBatchId, record.material_id, scopedLocationId, difference, { relatedType: 'stocktaking', relatedId: record.id, operator: record.operator })
    }
    return
  }

  const material = db.prepare('SELECT price FROM materials WHERE id = ? AND is_deleted = 0')
    .get(record.material_id) as any
  const batchId = uuidv4()
  const batchNo = createStocktakingBatchNo(db, record.material_id, record.stocktaking_no)
  const fallbackLocation = scopedLocationId || (db.prepare('SELECT location_id FROM inventory WHERE material_id = ?').get(record.material_id) as any)?.location_id
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, inbound_id, inbound_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(batchId, record.material_id, batchNo, difference, difference, record.id, Number(material?.price || 0))
  db.prepare(`
    INSERT INTO stocktaking_batch_adjustments (id, stocktaking_id, material_id, batch_id, location_id, quantity_delta)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), record.id, record.material_id, batchId, fallbackLocation || null, difference)
  if (fallbackLocation) {
    adjustBatchLocationStock(db, batchId, record.material_id, fallbackLocation, difference, { relatedType: 'stocktaking', relatedId: record.id, operator: record.operator })
  }
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

    if (adjustment.location_id) {
      adjustBatchLocationStock(db, adjustment.batch_id, adjustment.material_id, adjustment.location_id, -delta, { relatedType: 'stocktaking_cancel', relatedId: record.id, operator: record.operator })
    } else if (delta < 0) {
      restoreBatchLocationStock(db, adjustment.batch_id, adjustment.material_id, Math.abs(delta), { relatedType: 'stocktaking', relatedId: record.id, operator: record.operator })
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
  if (err?.message !== 'LOCATION_STOCK_INSUFFICIENT' && err?.message !== 'LOCATION_STOCK_NEGATIVE' && err?.message !== 'BATCH_LOCATION_STOCK_NEGATIVE') return false
  error(res, '库位库存不足，无法确认盘点差异', 'STOCK_INSUFFICIENT', 422)
  return true
}

function normalizeOptionalId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function validateStocktakingScope(db: any, materialId: string, locationId: string | null, batchId: string | null): boolean {
  if (locationId) {
    const location = db.prepare('SELECT id FROM locations WHERE id = ?').get(locationId)
    if (!location) throw new Error('盘点库位不存在')
  }
  if (batchId) {
    const batch = db.prepare('SELECT id FROM batches WHERE id = ? AND material_id = ?').get(batchId, materialId)
    if (!batch) throw new Error('盘点批次不存在或不属于该物料')
  }
  return true
}

function getScopedSystemStock(db: any, materialId: string, locationId: string | null, batchId: string | null): number {
  validateStocktakingScope(db, materialId, locationId, batchId)
  if (batchId && locationId) return getBatchLocationStock(db, batchId, locationId)
  if (batchId) {
    const batch = db.prepare('SELECT remaining FROM batches WHERE id = ? AND material_id = ?').get(batchId, materialId) as any
    return Number(batch?.remaining || 0)
  }
  if (locationId) return getInventoryLocationStock(db, materialId, locationId)
  const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
  return Number(inventory?.stock || 0)
}

function applyInventoryAdjustment(db: any, materialId: string, locationId: string | null, delta: number, relatedId: string): void {
  const difference = Number(delta)
  if (difference === 0) return
  if (locationId) {
    ensureInventoryLocationRows(db, materialId)
    adjustInventoryLocationStock(db, materialId, locationId, difference)
    db.prepare('UPDATE inventory SET stock = stock + ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')
      .run(difference, materialId)
    syncInventoryPrimaryLocation(db, materialId)
    return
  }

  db.prepare('UPDATE inventory SET stock = stock + ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')
    .run(difference, materialId)
  if (difference < 0) {
    consumeInventoryLocationStock(db, materialId, Math.abs(difference), { relatedType: 'stocktaking', relatedId })
  } else {
    restoreInventoryLocationStock(db, materialId, difference, { relatedType: 'stocktaking', relatedId })
  }
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
        l.name as location_name,
        b.batch_no as batch_no
      FROM stocktaking_records st
      LEFT JOIN materials m ON m.id = st.material_id
      LEFT JOIN material_categories c ON c.id = m.category_id
      LEFT JOIN locations l ON l.id = COALESCE(st.location_id, m.location_id)
      LEFT JOIN batches b ON b.id = st.batch_id
      WHERE ${where}
      ORDER BY st.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, normalizedPageSize, offset) as any[]
    successList(res, list.map((r: any) => ({
      id: r.id, stocktakingNo: r.stocktaking_no, materialId: r.material_id,
      locationId: r.location_id, batchId: r.batch_id, batchNo: r.batch_no,
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

// P1-04：批量盘点——一次提交多物料，事务内建多条盘点记录并共享盘点单号(sheet_no)。
// 解决"一物一单、无法周期全仓盘点"的采纳缺口（此前仓管须逐 SKU 走 3 步弹窗）。
router.post('/batch', (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : null
    const operator = (req as any).user?.username || 'system'
    if (!items || items.length === 0) { error(res, 'items 必填且不能为空', 'INVALID_PARAMETER', 400); return }
    if (items.length > 500) { error(res, '单次批量盘点不能超过 500 条', 'INVALID_PARAMETER', 400); return }
    const db = getDatabase()

    // 预校验全部行（任一不合法则整单拒绝，不部分写入）
    const normalized: Array<{ materialId: string; actual: number; locationId: string | null; batchId: string | null; remark: string | null }> = []
    for (let i = 0; i < items.length; i++) {
      const raw = items[i]
      const materialId = raw?.materialId
      const actual = Number(raw?.actualStock)
      const locationId = normalizeOptionalId(raw?.locationId)
      const batchId = normalizeOptionalId(raw?.batchId)
      if (!materialId || raw?.actualStock === undefined || !Number.isFinite(actual) || actual < 0) {
        error(res, `第 ${i + 1} 行：物料和实盘数必填，且实盘数为非负数`, 'INVALID_PARAMETER', 400); return
      }
      if (!db.prepare('SELECT 1 FROM materials WHERE id = ? AND is_deleted = 0').get(materialId)) {
        error(res, `第 ${i + 1} 行：物料不存在或已删除`, 'NOT_FOUND', 404); return
      }
      if (!db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId)) {
        error(res, `第 ${i + 1} 行：物料无库存记录，无法盘点`, 'NOT_FOUND', 404); return
      }
      try { validateStocktakingScope(db, materialId, locationId, batchId) }
      catch (scopeErr: any) { error(res, `第 ${i + 1} 行：${scopeErr.message}`, 'INVALID_PARAMETER', 400); return }
      normalized.push({ materialId, actual, locationId, batchId, remark: raw?.remark || null })
    }

    const sheetNo = generateNo('STKS')
    db.exec('BEGIN IMMEDIATE')
    try {
      const records: Array<{ id: string; stocktakingNo: string; materialId: string; difference: number }> = []
      for (const n of normalized) {
        const systemStock = getScopedSystemStock(db, n.materialId, n.locationId, n.batchId)
        const difference = n.actual - systemStock
        const id = uuidv4()
        const stocktakingNo = generateStocktakingNo()
        db.prepare('INSERT INTO stocktaking_records (id, stocktaking_no, sheet_no, material_id, location_id, batch_id, system_stock, actual_stock, difference, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(id, stocktakingNo, sheetNo, n.materialId, n.locationId, n.batchId, systemStock, n.actual, difference, operator, n.remark)
        records.push({ id, stocktakingNo, materialId: n.materialId, difference })
      }
      db.exec('COMMIT')
      logOperation(db, req as any, {
        operation: 'POST /stocktaking/batch',
        description: `批量盘点 ${sheetNo}（${records.length} 项）`,
        requestData: { module: 'stocktaking', sheetNo, count: records.length },
        responseData: { sheetNo, count: records.length },
      })
      success(res, { sheetNo, count: records.length, records }, 'Batch stocktaking created')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

router.post('/', (req, res) => {
  try {
    const { materialId, actualStock, remark } = req.body
    const locationId = normalizeOptionalId(req.body?.locationId)
    const batchId = normalizeOptionalId(req.body?.batchId)
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
    try {
      validateStocktakingScope(db, materialId, locationId, batchId)
    } catch (scopeErr: any) {
      error(res, scopeErr.message, 'INVALID_PARAMETER', 400)
      return
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      const systemStock = getScopedSystemStock(db, materialId, locationId, batchId)
      const difference = normalizedActualStock - systemStock
      const id = uuidv4()
      const stocktakingNo = generateStocktakingNo()
      db.prepare('INSERT INTO stocktaking_records (id, stocktaking_no, material_id, location_id, batch_id, system_stock, actual_stock, difference, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, stocktakingNo, materialId, locationId, batchId, systemStock, normalizedActualStock, difference, operator || 'system', remark || null)

      db.exec('COMMIT')
      logOperation(db, req as any, {
        operation: 'POST /stocktaking',
        description: `创建库存盘点记录 ${stocktakingNo}`,
        requestData: {
          module: 'stocktaking',
          id,
          stocktakingNo,
          materialId,
          locationId,
          batchId,
          systemStock,
          actualStock: normalizedActualStock,
          difference,
        },
        responseData: { id, stocktakingNo, status: 'completed' },
      })
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
    const normalizedReason = typeof reason === 'string' ? reason.trim() : ''
    const operator = (req as any).user?.username || 'system'
    const db = getDatabase()
    const record = db.prepare('SELECT * FROM stocktaking_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在或已删除', 'NOT_FOUND', 404); return }
    if (record.status === 'confirmed') { error(res, '盘点已确认', 'BUSINESS_RULE', 400); return }
    if (record.difference !== 0 && !normalizedReason) { error(res, '请选择差异原因', 'INVALID_PARAMETER', 400); return }
    if (record.difference !== 0 && !STOCKTAKING_REASON_CODES.has(normalizedReason)) {
      error(res, '盘点差异原因无效', 'INVALID_PARAMETER', 400)
      return
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any
      if (!inv) {
        db.exec('ROLLBACK')
        error(res, '物料无库存记录，无法确认盘点', 'NOT_FOUND', 404)
        return
      }
      const currentStock = record.location_id || record.batch_id
        ? getScopedSystemStock(db, record.material_id, record.location_id || null, record.batch_id || null)
        : Number(inv.stock || 0)
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

        if (record.location_id || record.batch_id) {
          applyInventoryAdjustment(db, record.material_id, record.location_id || null, Number(record.difference), id)
        } else {
          ensureInventoryLocationRows(db, record.material_id)
          db.prepare('UPDATE inventory SET stock = ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')
            .run(record.actual_stock, record.material_id)
          if (Number(record.difference) < 0) {
            consumeInventoryLocationStock(db, record.material_id, Math.abs(Number(record.difference)), { relatedType: 'stocktaking', relatedId: id })
          } else if (Number(record.difference) > 0) {
            restoreInventoryLocationStock(db, record.material_id, Number(record.difference), { relatedType: 'stocktaking', relatedId: id })
          }
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
          normalizedReason ? `差异原因:${normalizedReason}` : '盘点差异确认',
          remark ? `处理说明:${remark}` : null,
        ].filter(Boolean).join('；')
        const afterInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any
        db.prepare('INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(logId, 'adjust', record.material_id, record.difference, Number(inv.stock || 0), Number(afterInventory?.stock || 0), id, 'stocktaking', operator, logRemark)
      }

      db.exec('COMMIT')
      checkStockAlerts(db, [record.material_id])
      logOperation(db, req as any, {
        operation: 'POST /stocktaking/:id/confirm',
        description: `确认库存盘点记录 ${record.stocktaking_no || id}`,
        requestData: {
          module: 'stocktaking',
          id,
          stocktakingNo: record.stocktaking_no,
          materialId: record.material_id,
          locationId: record.location_id || null,
          batchId: record.batch_id || null,
          systemStock: Number(record.system_stock || 0),
          actualStock: Number(record.actual_stock || 0),
          difference: Number(record.difference || 0),
          reason: normalizedReason || null,
          remark: remark || null,
        },
        responseData: { id, status: 'confirmed' },
      })
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
        const beforeStock = Number(inv?.stock || 0)
        const scopedBeforeStock = record.location_id || record.batch_id
          ? getScopedSystemStock(db, record.material_id, record.location_id || null, record.batch_id || null)
          : beforeStock
        const afterStock = record.location_id || record.batch_id
          ? beforeStock + (Number(record.system_stock || 0) - Number(record.actual_stock || 0))
          : Number(record.system_stock || 0)
        // 使用相对增量恢复到系统库存
        const diff = Number(record.system_stock || 0) - Number(record.actual_stock || 0)

        if (Number(scopedBeforeStock) !== Number(record.actual_stock)) {
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

        if (record.location_id || record.batch_id) {
          applyInventoryAdjustment(db, record.material_id, record.location_id || null, diff, id)
        } else {
          db.prepare('UPDATE inventory SET stock = stock + ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?').run(diff, record.material_id)
          if (diff < 0) {
            consumeInventoryLocationStock(db, record.material_id, Math.abs(diff), { relatedType: 'stocktaking', relatedId: id })
          } else if (diff > 0) {
            restoreInventoryLocationStock(db, record.material_id, diff, { relatedType: 'stocktaking', relatedId: id })
          }
        }

        const logId = uuidv4()
        db.prepare(`
          INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
          VALUES (?, 'cancel', ?, ?, ?, ?, ?, 'stocktaking_cancel', ?, '撤销盘点记录')
        `).run(logId, record.material_id, diff, beforeStock, afterStock, id, (req as any).user?.username || 'system')
      }

      db.exec('COMMIT')
      checkStockAlerts(db, [record.material_id])
      logOperation(db, req as any, {
        operation: 'DELETE /stocktaking/:id',
        description: `撤销库存盘点记录 ${record.stocktaking_no || id}`,
        requestData: {
          module: 'stocktaking',
          id,
          stocktakingNo: record.stocktaking_no,
          materialId: record.material_id,
          locationId: record.location_id || null,
          batchId: record.batch_id || null,
          systemStock: Number(record.system_stock || 0),
          actualStock: Number(record.actual_stock || 0),
          difference: Number(record.difference || 0),
          status: record.status,
        },
        responseData: { id, status: 'cancelled' },
      })
      success(res, null, '盘点记录已撤销')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
