import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { adjustInventoryLocationStock, syncInventoryPrimaryLocation } from '../utils/inventory-locations.js'

const router = Router()
const BATCH_DECREASE_EPSILON = 0.000001

import { checkStockAlerts } from '../utils/alertChecker.js'

// 写入权限检查：仅 admin 和 warehouse_manager 可操作写入
function requireWriteAccess(req: any, res: any, next: any) {
  const role = req.user?.role
  if (role === 'admin' || role === 'warehouse_manager') {
    next()
    return
  }
  error(res, 'Forbidden: insufficient permissions', 'FORBIDDEN', 403)
}

import { generateNo } from '../utils/generateNo.js'

function generateInboundNo(): string {
  return generateNo('IB')
}

type BatchInboundInput = {
  type?: unknown
  materialId?: unknown
  batchNo?: unknown
  quantity?: unknown
  price?: unknown
  supplierId?: unknown
  locationId?: unknown
  productionDate?: unknown
  expiryDate?: unknown
  remark?: unknown
}

type ValidBatchInboundInput = {
  type: string
  materialId: string
  batchNo: string
  quantity: number
  price: number
  supplierId?: string
  locationId: string
  productionDate?: string
  expiryDate: string
  remark?: string
}

function isValidDateText(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function normalizeOptionalDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

function validateBatchInboundRecords(db: any, records: BatchInboundInput[]) {
  const errors: Array<{ row: number; message: string }> = []
  const validRecords: ValidBatchInboundInput[] = []

  records.forEach((record, index) => {
    const row = index + 1
    const rowErrors: string[] = []
    const materialId = typeof record.materialId === 'string' ? record.materialId.trim() : ''
    const batchNo = typeof record.batchNo === 'string' ? record.batchNo.trim() : ''
    const locationId = typeof record.locationId === 'string' ? record.locationId.trim() : ''
    const supplierId = typeof record.supplierId === 'string' ? record.supplierId.trim() : ''
    const productionDate = normalizeOptionalDate(record.productionDate)
    const expiryDate = normalizeOptionalDate(record.expiryDate)
    const quantity = Number(record.quantity)
    const price = record.price === undefined || record.price === null || record.price === '' ? 0 : Number(record.price)

    if (!materialId) rowErrors.push('物料不能为空')
    if (!batchNo) rowErrors.push('批号不能为空')
    if (!locationId) rowErrors.push('库位不能为空')
    if (!Number.isFinite(quantity) || quantity <= 0) rowErrors.push('数量必须大于 0')
    if (!Number.isFinite(price) || price < 0) rowErrors.push('单价不能小于 0')
    if (!expiryDate || !isValidDateText(expiryDate)) rowErrors.push('有效期必须为 YYYY-MM-DD')
    if (productionDate && !isValidDateText(productionDate)) rowErrors.push('生产日期必须为 YYYY-MM-DD')

    if (materialId) {
      const material = db.prepare('SELECT id FROM materials WHERE id = ? AND status = 1 AND is_deleted = 0').get(materialId)
      if (!material) rowErrors.push('物料不存在或已停用')
    }
    if (locationId) {
      const location = db.prepare('SELECT id FROM locations WHERE id = ? AND status = 1 AND is_deleted = 0').get(locationId)
      if (!location) rowErrors.push('库位不存在或已停用')
    }
    if (supplierId) {
      const supplier = db.prepare('SELECT id FROM suppliers WHERE id = ? AND status = 1 AND is_deleted = 0').get(supplierId)
      if (!supplier) rowErrors.push('供应商不存在或已停用')
    }

    if (rowErrors.length > 0) {
      errors.push({ row, message: rowErrors.join('；') })
      return
    }

    validRecords.push({
      type: typeof record.type === 'string' && record.type.trim() ? record.type.trim() : 'direct',
      materialId,
      batchNo,
      quantity,
      price,
      supplierId: supplierId || undefined,
      locationId,
      productionDate,
      expiryDate: expiryDate!,
      remark: typeof record.remark === 'string' ? record.remark.trim() : undefined,
    })
  })

  return { errors, validRecords }
}

function validateInboundReferences(db: any, refs: { materialId?: unknown; supplierId?: unknown; locationId?: unknown }) {
  const materialId = String(refs.materialId || '').trim()
  const supplierId = String(refs.supplierId || '').trim()
  const locationId = String(refs.locationId || '').trim()

  if (materialId) {
    const material = db.prepare('SELECT id, status FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
    if (!material) return { ok: false, status: 404, message: '物料不存在', code: 'NOT_FOUND' }
    if (Number(material.status) !== 1) {
      return { ok: false, status: 409, message: '停用物料不能入库', code: 'CONFLICT' }
    }
  }

  if (supplierId) {
    const supplier = db.prepare('SELECT id, status FROM suppliers WHERE id = ? AND is_deleted = 0').get(supplierId) as any
    if (!supplier) return { ok: false, status: 404, message: '供应商不存在', code: 'NOT_FOUND' }
    if (Number(supplier.status) !== 1) {
      return { ok: false, status: 409, message: '停用供应商不能用于入库', code: 'CONFLICT' }
    }
  }

  if (locationId) {
    const location = db.prepare('SELECT id, status FROM locations WHERE id = ? AND is_deleted = 0').get(locationId) as any
    if (!location) return { ok: false, status: 404, message: '库位不存在', code: 'NOT_FOUND' }
    if (Number(location.status) !== 1) {
      return { ok: false, status: 409, message: '停用库位不能用于入库', code: 'CONFLICT' }
    }
  }

  return { ok: true }
}

function validateInboundBatchDeduction(db: any, record: any, conflictMessage: string) {
  const batchNo = String(record.batch_no || '').trim()
  if (!batchNo) return { ok: true }

  const batch = db.prepare('SELECT id, quantity, remaining FROM batches WHERE material_id = ? AND batch_no = ?')
    .get(record.material_id, batchNo) as any
  if (!batch) {
    return { ok: false, status: 409, code: 'BATCH_NOT_FOUND', message: '入库批次不存在，无法扣减库存' }
  }

  const deduction = Number(record.quantity || 0)
  const batchQuantity = Number(batch.quantity || 0)
  const batchRemaining = Number(batch.remaining || 0)
  if (
    batchQuantity + BATCH_DECREASE_EPSILON < deduction ||
    batchRemaining + BATCH_DECREASE_EPSILON < deduction
  ) {
    return { ok: false, status: 409, code: 'BATCH_UNDERFLOW_CONFLICT', message: conflictMessage }
  }

  return { ok: true }
}

router.get('/', (req, res) => {
  try {
    let { page = 1, pageSize = 20, status, type, materialId, keyword, startDate, endDate } = req.query
    page = Math.max(1, Number(page) || 1)
    pageSize = Math.max(1, Math.min(1000, Number(pageSize) || 20))
    const db = getDatabase()
    let where = 'r.is_deleted = 0'
    const params: any[] = []
    if (status) { where += ' AND r.status = ?'; params.push(status) }
    if (type) { where += ' AND r.type = ?'; params.push(type) }
    if (materialId) { where += ' AND r.material_id = ?'; params.push(materialId) }
    if (keyword) { where += ' AND (r.inbound_no LIKE ? OR m.name LIKE ? OR r.batch_no LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`) }
    if (startDate) { where += ' AND r.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND r.created_at <= ?'; params.push(`${endDate}T23:59:59`) }

    const count = (db.prepare(`
      SELECT COUNT(*) as total
      FROM inbound_records r
      LEFT JOIN materials m ON r.material_id = m.id AND m.is_deleted = 0
      WHERE ${where}
    `).get(...params) as any)?.total || 0
    const offset = (page - 1) * pageSize

    const sql = `
      SELECT r.*, m.name as material_name, s.name as supplier_name, l.name as location_name
      FROM inbound_records r
      LEFT JOIN materials m ON r.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN suppliers s ON r.supplier_id = s.id AND s.is_deleted = 0
      LEFT JOIN locations l ON r.location_id = l.id AND l.is_deleted = 0
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `
    const list = db.prepare(sql).all(...params, pageSize, offset) as any[]

    successList(res, list.map((r: any) => ({
      id: r.id, inboundNo: r.inbound_no, type: r.type, materialId: r.material_id,
      materialName: r.material_name, batchNo: r.batch_no, quantity: r.quantity,
      unit: r.unit, price: r.price, amount: r.amount, supplierId: r.supplier_id,
      supplierName: r.supplier_name, locationId: r.location_id, locationName: r.location_name,
      productionDate: r.production_date, expiryDate: r.expiry_date, operator: r.operator,
      status: r.status, remark: r.remark, createdAt: r.created_at,
      purchaseOrderId: r.purchase_order_id,
      purchaseOrderNo: r.purchase_order_no,
    })), page, pageSize, count)
  } catch (err: any) { error(res, err.message) }
})

// 入库统计
router.get('/stats', (req, res) => {
  try {
    const db = getDatabase()
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const weekStart = new Date(now.getTime() - now.getDay() * 86400000).toISOString().slice(0, 10)
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const total = (db.prepare("SELECT COUNT(*) as c FROM inbound_records WHERE is_deleted = 0").get() as any)?.c || 0
    const monthTotal = (db.prepare("SELECT COUNT(*) as c FROM inbound_records WHERE is_deleted = 0 AND created_at >= ?").get(monthStart) as any)?.c || 0
    const completed = (db.prepare("SELECT COUNT(*) as c FROM inbound_records WHERE is_deleted = 0 AND status = 'completed'").get() as any)?.c || 0
    const cancelled = (db.prepare("SELECT COUNT(*) as c FROM inbound_records WHERE is_deleted = 0 AND status = 'cancelled'").get() as any)?.c || 0
    const amount = (db.prepare("SELECT COALESCE(SUM(amount),0) as c FROM inbound_records WHERE is_deleted = 0 AND status = 'completed'").get() as any)?.c || 0
    const supplierCount = (db.prepare("SELECT COUNT(DISTINCT supplier_id) as c FROM inbound_records WHERE is_deleted = 0 AND status = 'completed' AND supplier_id IS NOT NULL").get() as any)?.c || 0
    const pendingOrders = (db.prepare("SELECT COUNT(*) as c FROM purchase_orders WHERE is_deleted = 0 AND status IN ('pending','partial')").get() as any)?.c || 0
    const quickCounts = {
      all: total,
      today: (db.prepare("SELECT COUNT(*) as c FROM inbound_records WHERE is_deleted = 0 AND created_at >= ?").get(today) as any)?.c || 0,
      week: (db.prepare("SELECT COUNT(*) as c FROM inbound_records WHERE is_deleted = 0 AND created_at >= ?").get(weekStart) as any)?.c || 0,
      month: monthTotal,
    }
    success(res, { total, monthTotal, completed, cancelled, amount, supplierCount, pendingOrders, quickCounts })
  } catch (err: any) { error(res, err.message) }
})

// 获取入库记录详情
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase()
    const record = db.prepare(`
      SELECT r.*, m.name as material_name, s.name as supplier_name, l.name as location_name
      FROM inbound_records r
      LEFT JOIN materials m ON r.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN suppliers s ON r.supplier_id = s.id AND s.is_deleted = 0
      LEFT JOIN locations l ON r.location_id = l.id AND l.is_deleted = 0
      WHERE r.id = ? AND r.is_deleted = 0
    `).get(req.params.id) as any
    if (!record) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    success(res, {
      id: record.id,
      inboundNo: record.inbound_no,
      type: record.type,
      materialId: record.material_id,
      materialName: record.material_name,
      supplierId: record.supplier_id,
      supplierName: record.supplier_name,
      locationId: record.location_id,
      locationName: record.location_name,
      batchNo: record.batch_no,
      quantity: record.quantity,
      price: record.price,
      amount: record.amount,
      productionDate: record.production_date,
      expiryDate: record.expiry_date,
      status: record.status,
      remark: record.remark,
      purchaseOrderId: record.purchase_order_id,
      purchaseOrderNo: record.purchase_order_no,
      operator: record.operator,
      createdAt: record.created_at,
      updatedAt: record.updated_at,
    })
  } catch (err: any) { error(res, err.message) }
})

// 检查入库记录是否可删除
router.get('/:id/check-deletable', (req, res) => {
  try {
    const db = getDatabase()
    const record = db.prepare('SELECT * FROM inbound_records WHERE id = ? AND is_deleted = 0').get(req.params.id) as any
    if (!record) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    const reasons: string[] = []
    let canDelete = true

    if (record.status === 'completed') {
      // 1. 检查是否有出库记录
      const outboundExists = db.prepare(`
        SELECT COALESCE(SUM(oi.quantity),0) as total
        FROM outbound_items oi
        JOIN outbound_records o ON oi.outbound_id = o.id
        WHERE oi.material_id = ? AND (oi.batch_no = ? OR (oi.batch_no IS NULL AND ? IS NULL)) AND o.is_deleted = 0
      `).get(record.material_id, record.batch_no, record.batch_no) as any
      if (outboundExists && outboundExists.total > 0) {
        canDelete = false
        reasons.push(`该批次已有出库记录 ${outboundExists.total} ${record.unit}`)
      }

      // 2. 检查是否有使用中的消耗跟踪
      const inUseExists = db.prepare(
        "SELECT 1 FROM batch_usage_tracking WHERE material_id = ? AND (batch = ? OR (batch IS NULL AND ? IS NULL)) AND status = 'in-use' LIMIT 1"
      ).get(record.material_id, record.batch_no, record.batch_no)
      if (inUseExists) {
        canDelete = false
        reasons.push('该批次库存正在使用中')
      }

      // 3. 检查删除后库存是否为负
      const totalInbound = (db.prepare(
        "SELECT COALESCE(SUM(quantity),0) as total FROM inbound_records WHERE material_id = ? AND (batch_no = ? OR (batch_no IS NULL AND ? IS NULL)) AND status = 'completed' AND is_deleted = 0 AND id != ?"
      ).get(record.material_id, record.batch_no, record.batch_no, record.id) as any)?.total || 0
      const totalOutbound = outboundExists?.total || 0
      if (totalInbound < totalOutbound) {
        canDelete = false
        reasons.push(`删除后该批次库存将变为负数（剩余 ${totalInbound}，已出库 ${totalOutbound}）`)
      }
    }

    success(res, {
      canDelete,
      reasons,
      record: {
        id: record.id,
        inboundNo: record.inbound_no,
        materialId: record.material_id,
        quantity: record.quantity,
        batchNo: record.batch_no,
        unit: record.unit,
      }
    })
  } catch (err: any) { error(res, err.message) }
})

router.post('/batch', requireWriteAccess, (req, res) => {
  try {
    const records = Array.isArray(req.body?.records) ? req.body.records : []
    if (records.length === 0) {
      error(res, '导入数据不能为空', 'INVALID_PARAMETER', 400); return
    }
    if (records.length > 1000) {
      error(res, '单次导入最多支持 1000 条', 'INVALID_PARAMETER', 400); return
    }

    const db = getDatabase()
    const { errors, validRecords } = validateBatchInboundRecords(db, records)
    if (errors.length > 0) {
      const first = errors[0]
      error(res, `导入数据校验失败：第 ${first.row} 行 ${first.message}`, 'INVALID_PARAMETER', 400, { errors })
      return
    }

    const operator = (req as any).user?.username || 'system'
    const createdIds: string[] = []
    const materialIds = new Set<string>()

    db.exec('BEGIN IMMEDIATE')
    try {
      for (const record of validRecords) {
        const id = uuidv4()
        const inboundNo = generateInboundNo()
        const material = db.prepare('SELECT unit FROM materials WHERE id = ? AND status = 1 AND is_deleted = 0').get(record.materialId) as any
        if (!material) throw new Error(`物料不存在或已停用：${record.materialId}`)

        const price = Number(record.price || 0)
        const amount = price * Number(record.quantity)

        db.prepare(`
          INSERT INTO inbound_records (id, inbound_no, type, material_id, batch_no, quantity, unit, price, amount, supplier_id, location_id, production_date, expiry_date, operator, status, remark)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
        `).run(
          id,
          inboundNo,
          record.type || 'direct',
          record.materialId,
          record.batchNo,
          record.quantity,
          material.unit,
          price,
          amount,
          record.supplierId || null,
          record.locationId,
          record.productionDate || null,
          record.expiryDate,
          operator,
          record.remark || null,
        )

        const existingBatch = db.prepare('SELECT * FROM batches WHERE material_id = ? AND batch_no = ?')
          .get(record.materialId, record.batchNo) as any
        if (existingBatch) {
          db.prepare('UPDATE batches SET quantity = quantity + ?, remaining = remaining + ?, status = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(record.quantity, record.quantity, existingBatch.id)
        } else {
          db.prepare(`
            INSERT INTO batches (id, material_id, batch_no, quantity, remaining, production_date, expiry_date, inbound_id, inbound_price, supplier_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).run(uuidv4(), record.materialId, record.batchNo, record.quantity, record.quantity, record.productionDate || null, record.expiryDate, id, price, record.supplierId || null)
        }

        const existingInv = db.prepare('SELECT * FROM inventory WHERE material_id = ?').get(record.materialId) as any
        const beforeStock = Number(existingInv?.stock || 0)
        const afterStock = beforeStock + Number(record.quantity)
        if (existingInv) {
          db.prepare("UPDATE inventory SET stock = ?, location_id = ?, last_inbound_id = ?, last_inbound_date = date('now','localtime'), update_time = CURRENT_TIMESTAMP WHERE material_id = ?")
            .run(afterStock, record.locationId, id, record.materialId)
        } else {
          db.prepare(`
            INSERT INTO inventory (id, material_id, stock, locked_stock, location_id, last_inbound_id, last_inbound_date, update_time)
            VALUES (?, ?, ?, 0, ?, ?, date('now','localtime'), CURRENT_TIMESTAMP)
          `).run(uuidv4(), record.materialId, afterStock, record.locationId, id)
        }
        adjustInventoryLocationStock(db, record.materialId, record.locationId, Number(record.quantity))
        syncInventoryPrimaryLocation(db, record.materialId)

        db.prepare(`
          INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
          VALUES (?, 'inbound', ?, ?, ?, ?, ?, 'inbound_batch', ?, ?)
        `).run(uuidv4(), record.materialId, record.quantity, beforeStock, afterStock, id, operator, '批量导入入库')

        createdIds.push(id)
        materialIds.add(record.materialId)
      }

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }

    checkStockAlerts(db, Array.from(materialIds))
    success(res, { createdCount: createdIds.length, ids: createdIds }, 'Batch inbound created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.post('/', requireWriteAccess, (req, res) => {
  try {
    const { type, materialId, batchNo, quantity, price, supplierId, locationId, purchaseOrderId, productionDate, expiryDate, remark } = req.body
    if (!type || !materialId || quantity === undefined || quantity === null || !locationId) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }

    const db = getDatabase()
    const inboundNo = generateInboundNo()
    const id = uuidv4()
    const operator = (req as any).user?.username || 'system'
    const inboundQuantity = Number(quantity)
    const hasExplicitPrice = price !== undefined && price !== null && price !== ''
    let inboundPrice = hasExplicitPrice ? Number(price) : 0
    let effectiveSupplierId = supplierId || null

    if (!Number.isFinite(inboundQuantity) || inboundQuantity <= 0) {
      error(res, '入库数量必须大于 0', 'INVALID_PARAMETER', 400)
      return
    }

    if (!Number.isFinite(inboundPrice) || inboundPrice < 0) {
      error(res, '入库单价不能小于 0', 'INVALID_PARAMETER', 400)
      return
    }

    const refValidation = validateInboundReferences(db, { materialId, supplierId, locationId })
    if (!refValidation.ok) {
      error(res, refValidation.message, refValidation.code, refValidation.status)
      return
    }

    const material = db.prepare('SELECT unit FROM materials WHERE id = ? AND status = 1 AND is_deleted = 0').get(materialId) as any
    if (!material) { error(res, '物料不存在或已停用', 'NOT_FOUND', 404); return }

    const unit = material.unit

    // 查询采购订单信息
    let purchaseOrderNo: string | null = null
    if (purchaseOrderId) {
      if (type !== 'purchase') {
        error(res, '关联采购订单的入库类型必须为采购入库', 'INVALID_PARAMETER', 400)
        return
      }

      const po = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND is_deleted = 0').get(purchaseOrderId) as any
      if (!po) {
        error(res, '采购订单不存在', 'NOT_FOUND', 404)
        return
      }
      if (po.status === 'cancelled') {
        error(res, '已取消的采购订单不能入库', 'INVALID_PARAMETER', 400)
        return
      }
      if (po.status === 'completed') {
        error(res, '已完成的采购订单不能继续入库', 'INVALID_PARAMETER', 400)
        return
      }
      const poMaterialId = String(po.material_id || '').trim()
      const inboundMaterialId = String(materialId || '').trim()
      if (poMaterialId !== inboundMaterialId) {
        error(res, '采购订单物料不一致，不能用其他物料入库', 'INVALID_PARAMETER', 400)
        return
      }

      const poSupplierId = String(po.supplier_id || '').trim()
      const inboundSupplierId = String(supplierId || '').trim()
      if (poSupplierId && !inboundSupplierId) {
        error(res, '采购订单供应商不一致，采购入库必须使用订单供应商', 'INVALID_PARAMETER', 400)
        return
      }
      if (poSupplierId && inboundSupplierId !== poSupplierId) {
        error(res, '采购订单供应商不一致，不能用其他供应商入库', 'INVALID_PARAMETER', 400)
        return
      }
      effectiveSupplierId = inboundSupplierId || poSupplierId || null

      const remainingQty = Number(po.ordered_qty) - Number(po.received_qty)
      if (inboundQuantity > remainingQty) {
        error(res, '入库数量超过订单剩余数量', 'INVALID_PARAMETER', 400)
        return
      }
      if (!hasExplicitPrice) {
        inboundPrice = Number(po.unit_price)
        if (!Number.isFinite(inboundPrice) || inboundPrice < 0) {
          error(res, '采购订单单价无效，不能入库', 'INVALID_PARAMETER', 400)
          return
        }
      }
      purchaseOrderNo = po.order_no
    }

    const amount = inboundPrice * inboundQuantity

    // 事务保护：入库涉及 records + batches + inventory + stock_logs 多表操作
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        INSERT INTO inbound_records (id, inbound_no, type, material_id, batch_no, quantity, unit, price, amount, supplier_id, location_id, production_date, expiry_date, operator, status, remark, purchase_order_id, purchase_order_no)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?)
      `).run(id, inboundNo, type, materialId, batchNo || null, inboundQuantity, unit, inboundPrice, amount, effectiveSupplierId, locationId, productionDate || null, expiryDate || null, operator, remark || null, purchaseOrderId || null, purchaseOrderNo)

      if (batchNo) {
        // 先查询所有状态的批次（UNIQUE 约束是 (material_id, batch_no)，不区分 status）
        const existingBatch = db.prepare('SELECT * FROM batches WHERE material_id = ? AND batch_no = ?').get(materialId, batchNo) as any
        if (existingBatch) {
          if (existingBatch.status === 0) {
            // 恢复已停用批次
            db.prepare('UPDATE batches SET quantity = quantity + ?, remaining = remaining + ?, status = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(inboundQuantity, inboundQuantity, existingBatch.id)
          } else {
            // 更新已有批次
            db.prepare('UPDATE batches SET quantity = quantity + ?, remaining = remaining + ? WHERE id = ?')
              .run(inboundQuantity, inboundQuantity, existingBatch.id)
          }
        } else {
          const batchId = uuidv4()
          db.prepare(`
            INSERT INTO batches (id, material_id, batch_no, quantity, remaining, production_date, expiry_date, inbound_id, inbound_price, supplier_id, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
          `).run(batchId, materialId, batchNo, inboundQuantity, inboundQuantity, productionDate || null, expiryDate || null, id, inboundPrice, effectiveSupplierId)
        }
      }

      // 更新采购订单收货数量
      if (purchaseOrderId) {
        const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND is_deleted = 0').get(purchaseOrderId) as any
        if (order) {
          const newReceived = Number(order.received_qty) + inboundQuantity
          const orderedQty = Number(order.ordered_qty)
          const poStatus = newReceived >= orderedQty ? 'completed' : 'partial'
          db.prepare('UPDATE purchase_orders SET received_qty = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newReceived, poStatus, purchaseOrderId)
        }
      }

      const existingInv = db.prepare('SELECT * FROM inventory WHERE material_id = ?').get(materialId) as any
      if (existingInv) {
        db.prepare("UPDATE inventory SET stock = stock + ?, location_id = ?, last_inbound_id = ?, last_inbound_date = date('now','localtime'), update_time = CURRENT_TIMESTAMP WHERE material_id = ?")
          .run(inboundQuantity, locationId, id, materialId)
      } else {
        db.prepare(`
          INSERT INTO inventory (id, material_id, stock, locked_stock, location_id, last_inbound_id, last_inbound_date, update_time)
          VALUES (?, ?, ?, 0, ?, ?, date('now','localtime'), CURRENT_TIMESTAMP)
        `).run(uuidv4(), materialId, inboundQuantity, locationId, id)
      }
      adjustInventoryLocationStock(db, materialId, locationId, inboundQuantity)
      syncInventoryPrimaryLocation(db, materialId)

      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator)
        VALUES (?, 'inbound', ?, ?, COALESCE((SELECT stock FROM inventory WHERE material_id = ?), 0) - ?, COALESCE((SELECT stock FROM inventory WHERE material_id = ?), 0), ?, 'inbound', ?)
      `).run(logId, materialId, inboundQuantity, materialId, inboundQuantity, materialId, id, operator)

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }

    // 自动检查库存预警（入库后库存可能恢复）
    checkStockAlerts(db, [materialId])

    success(res, { id, inboundNo, type, materialId, quantity: inboundQuantity, status: 'completed', purchaseOrderId, purchaseOrderNo, createdAt: new Date().toISOString() }, 'Inbound created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.put('/:id', requireWriteAccess, (req, res) => {
  try {
    const { id } = req.params
    const { batchNo, quantity, price, supplierId, locationId, productionDate, expiryDate, remark, status } = req.body
    const db = getDatabase()
    const record = db.prepare('SELECT * FROM inbound_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    const quantityProvided = quantity !== undefined
    const priceProvided = price !== undefined
    const normalizedQuantity = quantityProvided ? Number(quantity) : Number(record.quantity)
    const normalizedPrice = priceProvided
      ? (price === null || price === '' ? 0 : Number(price))
      : Number(record.price)

    if (quantityProvided && (!Number.isFinite(normalizedQuantity) || normalizedQuantity <= 0)) {
      error(res, '入库数量必须大于 0', 'INVALID_PARAMETER', 400)
      return
    }
    if (priceProvided && (!Number.isFinite(normalizedPrice) || normalizedPrice < 0)) {
      error(res, '入库单价不能小于 0', 'INVALID_PARAMETER', 400)
      return
    }

    const oldStatus = record.status
    const newStatus = status !== undefined ? status : oldStatus
    if (status !== undefined && !['completed', 'cancelled'].includes(newStatus)) {
      error(res, '入库状态只能是 completed 或 cancelled', 'INVALID_PARAMETER', 400)
      return
    }
    const restoringCompleted = oldStatus !== 'completed' && newStatus === 'completed'

    const refValidation = validateInboundReferences(db, {
      supplierId: supplierId !== undefined ? supplierId : (restoringCompleted ? record.supplier_id : undefined),
      locationId: locationId !== undefined ? locationId : (restoringCompleted ? record.location_id : undefined),
      materialId: restoringCompleted ? record.material_id : undefined,
    })
    if (!refValidation.ok) {
      error(res, refValidation.message, refValidation.code, refValidation.status)
      return
    }

    const oldQty = Number(record.quantity)
    const newQty = normalizedQuantity
    const newPrice = normalizedPrice
    const oldBatch = record.batch_no
    const newBatch = batchNo !== undefined ? batchNo : oldBatch
    const oldLocationId = record.location_id
    const newLocationId = locationId !== undefined ? locationId : oldLocationId
    const statusChanging = status !== undefined && status !== oldStatus
    const batchChanged = newBatch !== oldBatch
    const supplierChanged = supplierId !== undefined && String(supplierId || '') !== String(record.supplier_id || '')
    const priceChanged = priceProvided && newPrice !== Number(record.price)

    if (statusChanging && (quantityProvided || priceProvided || batchNo !== undefined || supplierId !== undefined || locationId !== undefined)) {
      error(res, '状态变更不能同时修改数量、单价、批次、供应商或库位', 'INVALID_PARAMETER', 400)
      return
    }

    if (oldStatus === 'completed' && supplierChanged) {
      error(res, '已完成入库不可修改供应商，避免库存批次来源断链', 'INVALID_PARAMETER', 400)
      return
    }

    let purchaseOrderUpdate: { newReceived: number; status: string } | null = null
    if (record.purchase_order_id) {
      const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND is_deleted = 0').get(record.purchase_order_id) as any
      if (!order) {
        error(res, '采购订单不存在', 'NOT_FOUND', 404)
        return
      }

      if (supplierId !== undefined) {
        const orderSupplierId = String(order.supplier_id || '').trim()
        const requestedSupplierId = String(supplierId || '').trim()
        if (orderSupplierId && requestedSupplierId !== orderSupplierId) {
          error(res, '采购订单供应商不一致，不能修改为其他供应商', 'INVALID_PARAMETER', 400)
          return
        }
      }

      if (oldStatus === 'completed' && newStatus !== 'cancelled' && quantityProvided) {
        const nextReceived = Number(order.received_qty) + (newQty - oldQty)
        if (nextReceived < 0) {
          error(res, '修改后采购订单收货数量不能小于 0', 'INVALID_PARAMETER', 400)
          return
        }
        if (nextReceived > Number(order.ordered_qty)) {
          error(res, '修改后采购订单收货数量将超过采购数量', 'INVALID_PARAMETER', 400)
          return
        }
        purchaseOrderUpdate = {
          newReceived: nextReceived,
          status: nextReceived === 0 ? 'pending' : (nextReceived >= Number(order.ordered_qty) ? 'completed' : 'partial'),
        }
      }
    }

    if (oldStatus === 'completed' && oldBatch && (batchChanged || priceChanged)) {
      const outboundTotal = (db.prepare(`
        SELECT COALESCE(SUM(oi.quantity),0) as total FROM outbound_items oi
        JOIN outbound_records o ON oi.outbound_id = o.id
        WHERE oi.material_id = ? AND oi.batch_no = ? AND o.is_deleted = 0
      `).get(record.material_id, oldBatch) as any)?.total || 0

      if (outboundTotal > 0 && batchChanged) {
        error(res, `该批次已有出库记录 ${outboundTotal} ${record.unit}，不可修改批次`, 'BUSINESS_RULE', 400)
        return
      }
      if (outboundTotal > 0 && priceChanged) {
        error(res, `该批次已有出库记录 ${outboundTotal} ${record.unit}，不可修改入库单价`, 'BUSINESS_RULE', 400)
        return
      }
    }

    const fields: string[] = []; const params: any[] = []
    if (batchNo !== undefined) { fields.push('batch_no = ?'); params.push(batchNo || null) }
    if (quantityProvided) { fields.push('quantity = ?'); params.push(newQty) }
    if (priceProvided) { fields.push('price = ?'); params.push(newPrice) }
    if (supplierId !== undefined) { fields.push('supplier_id = ?'); params.push(supplierId || null) }
    if (locationId !== undefined) { fields.push('location_id = ?'); params.push(locationId) }
    if (productionDate !== undefined) { fields.push('production_date = ?'); params.push(productionDate || null) }
    if (expiryDate !== undefined) { fields.push('expiry_date = ?'); params.push(expiryDate || null) }
    if (remark !== undefined) { fields.push('remark = ?'); params.push(remark || '') }
    if (status !== undefined) { fields.push('status = ?'); params.push(newStatus) }

    if (priceProvided || quantityProvided) {
      fields.push('amount = ?')
      params.push(newPrice * newQty)
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      // ===== 1. 取消操作（completed → cancelled）=====
      if (oldStatus === 'completed' && newStatus === 'cancelled') {
        const outboundTotal = (db.prepare(`
          SELECT COALESCE(SUM(oi.quantity),0) as total FROM outbound_items oi
          JOIN outbound_records o ON oi.outbound_id = o.id
          WHERE oi.material_id = ? AND (oi.batch_no = ? OR (oi.batch_no IS NULL AND ? IS NULL)) AND o.is_deleted = 0
        `).get(record.material_id, oldBatch, oldBatch) as any)?.total || 0

        if (outboundTotal > 0) {
          db.exec('ROLLBACK')
          error(res, `该批次已有出库记录 ${outboundTotal} ${record.unit}，不可取消`, 'BUSINESS_RULE', 400)
          return
        }

        const inUse = db.prepare("SELECT 1 FROM batch_usage_tracking WHERE material_id = ? AND (batch = ? OR (batch IS NULL AND ? IS NULL)) AND status = 'in-use' LIMIT 1")
          .get(record.material_id, oldBatch, oldBatch)
        if (inUse) {
          db.exec('ROLLBACK')
          error(res, '该批次库存正在使用中，不可取消', 'BUSINESS_RULE', 400)
          return
        }

        const otherInbound = (db.prepare(`
          SELECT COALESCE(SUM(quantity),0) as total FROM inbound_records
          WHERE material_id = ? AND (batch_no = ? OR (batch_no IS NULL AND ? IS NULL)) AND status = 'completed' AND is_deleted = 0 AND id != ?
        `).get(record.material_id, oldBatch, oldBatch, id) as any)?.total || 0
        if (otherInbound < outboundTotal) {
          db.exec('ROLLBACK')
          error(res, `取消后库存将变为负数，不可取消`, 'BUSINESS_RULE', 400)
          return
        }

        const batchDeduction = validateInboundBatchDeduction(
          db,
          record,
          '批次数量已被后续业务调整，无法取消入库记录',
        )
        if (!batchDeduction.ok) {
          db.exec('ROLLBACK')
          error(res, batchDeduction.message, batchDeduction.code, batchDeduction.status)
          return
        }

        if (record.purchase_order_id) {
          const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(record.purchase_order_id) as any
          if (order) {
            const newReceived = Math.max(0, Number(order.received_qty) - oldQty)
            db.prepare('UPDATE purchase_orders SET received_qty = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(newReceived, newReceived === 0 ? 'pending' : 'partial', record.purchase_order_id)
          }
        }

        db.prepare('UPDATE inventory SET stock = stock - ? WHERE material_id = ?').run(oldQty, record.material_id)
        adjustInventoryLocationStock(db, record.material_id, oldLocationId, -oldQty)
        syncInventoryPrimaryLocation(db, record.material_id)
        if (oldBatch) {
          db.prepare('UPDATE batches SET quantity = quantity - ?, remaining = remaining - ? WHERE material_id = ? AND batch_no = ?')
            .run(oldQty, oldQty, record.material_id, oldBatch)
          const b = db.prepare('SELECT remaining FROM batches WHERE material_id = ? AND batch_no = ?')
            .get(record.material_id, oldBatch) as any
          if (b && b.remaining <= 0) {
            db.prepare('UPDATE batches SET status = 0 WHERE material_id = ? AND batch_no = ?')
              .run(record.material_id, oldBatch)
          }
        }
      }

      // ===== 2. 恢复操作（cancelled → completed）=====
      if (oldStatus === 'cancelled' && newStatus === 'completed') {
        db.prepare('UPDATE inventory SET stock = stock + ? WHERE material_id = ?').run(oldQty, record.material_id)
        adjustInventoryLocationStock(db, record.material_id, oldLocationId, oldQty)
        syncInventoryPrimaryLocation(db, record.material_id)
        if (oldBatch) {
          const b = db.prepare('SELECT * FROM batches WHERE material_id = ? AND batch_no = ?').get(record.material_id, oldBatch) as any
          if (b) {
            db.prepare('UPDATE batches SET quantity = quantity + ?, remaining = remaining + ?, status = 1 WHERE id = ?')
              .run(oldQty, oldQty, b.id)
          } else {
            const bid = uuidv4()
            db.prepare(`
              INSERT INTO batches (id, material_id, batch_no, quantity, remaining, production_date, expiry_date, inbound_id, inbound_price, supplier_id, status)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            `).run(bid, record.material_id, oldBatch, oldQty, oldQty, record.production_date, record.expiry_date, id, record.price || 0, record.supplier_id)
          }
        }
        if (record.purchase_order_id) {
          const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(record.purchase_order_id) as any
          if (order) {
            const newReceived = Number(order.received_qty) + oldQty
            if (newReceived > Number(order.ordered_qty)) {
              db.exec('ROLLBACK')
              error(res, '恢复后采购订单收货数量将超过采购数量', 'INVALID_PARAMETER', 400)
              return
            }
            db.prepare('UPDATE purchase_orders SET received_qty = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(newReceived, newReceived >= Number(order.ordered_qty) ? 'completed' : 'partial', record.purchase_order_id)
          }
        }
      }

      // ===== 3. 已完成记录的数量/批次编辑 =====
      if (oldStatus === 'completed' && newStatus !== 'cancelled') {
        const qtyDiff = newQty - oldQty
        const locationChanged = newLocationId !== oldLocationId

        // 检查减少数量时库存是否会变负
        if (qtyDiff < 0) {
          const currentStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any)?.stock || 0
          if (currentStock + qtyDiff < 0) {
            db.exec('ROLLBACK')
            error(res, `库存不足，当前库存 ${currentStock}，无法减少 ${Math.abs(qtyDiff)}`, 'STOCK_INSUFFICIENT', 422)
            return
          }
          if (oldBatch && !batchChanged) {
            const currentBatch = db.prepare('SELECT remaining FROM batches WHERE material_id = ? AND batch_no = ?')
              .get(record.material_id, oldBatch) as any
            const currentRemaining = Number(currentBatch?.remaining ?? 0)
            if (!currentBatch || currentRemaining + qtyDiff < 0) {
              db.exec('ROLLBACK')
              error(res, `批次剩余量不足，当前批次剩余量 ${currentRemaining}，无法减少 ${Math.abs(qtyDiff)}`, 'BUSINESS_RULE', 400)
              return
            }
          }
        }

        if (batchChanged) {
          if (oldBatch) {
            db.prepare('UPDATE batches SET quantity = quantity - ?, remaining = remaining - ? WHERE material_id = ? AND batch_no = ?')
              .run(oldQty, oldQty, record.material_id, oldBatch)
            const b = db.prepare('SELECT remaining FROM batches WHERE material_id = ? AND batch_no = ?')
              .get(record.material_id, oldBatch) as any
            if (b && b.remaining <= 0) {
              db.prepare('UPDATE batches SET status = 0 WHERE material_id = ? AND batch_no = ?')
                .run(record.material_id, oldBatch)
            }
          }
          if (newBatch) {
            const b = db.prepare('SELECT * FROM batches WHERE material_id = ? AND batch_no = ?').get(record.material_id, newBatch) as any
            if (b) {
              db.prepare('UPDATE batches SET quantity = quantity + ?, remaining = remaining + ?, status = 1 WHERE id = ?')
                .run(newQty, newQty, b.id)
            } else {
              const bid = uuidv4()
              db.prepare(`
                INSERT INTO batches (id, material_id, batch_no, quantity, remaining, production_date, expiry_date, inbound_id, inbound_price, supplier_id, status)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
              `).run(bid, record.material_id, newBatch, newQty, newQty, productionDate || record.production_date, expiryDate || record.expiry_date, id, newPrice, supplierId !== undefined ? supplierId : record.supplier_id)
            }
          }
          if (qtyDiff !== 0) {
            db.prepare('UPDATE inventory SET stock = stock + ? WHERE material_id = ?').run(qtyDiff, record.material_id)
          }
          if (locationChanged) {
            adjustInventoryLocationStock(db, record.material_id, oldLocationId, -oldQty)
            adjustInventoryLocationStock(db, record.material_id, newLocationId, newQty)
            syncInventoryPrimaryLocation(db, record.material_id)
          } else if (qtyDiff !== 0) {
            adjustInventoryLocationStock(db, record.material_id, oldLocationId, qtyDiff)
            syncInventoryPrimaryLocation(db, record.material_id)
          }
        } else if (qtyDiff !== 0) {
          db.prepare('UPDATE inventory SET stock = stock + ? WHERE material_id = ?').run(qtyDiff, record.material_id)
          adjustInventoryLocationStock(db, record.material_id, oldLocationId, qtyDiff)
          syncInventoryPrimaryLocation(db, record.material_id)
          if (oldBatch) {
            db.prepare('UPDATE batches SET quantity = quantity + ?, remaining = remaining + ? WHERE material_id = ? AND batch_no = ?')
              .run(qtyDiff, qtyDiff, record.material_id, oldBatch)
          }
        } else if (locationChanged) {
          adjustInventoryLocationStock(db, record.material_id, oldLocationId, -oldQty)
          adjustInventoryLocationStock(db, record.material_id, newLocationId, newQty)
          syncInventoryPrimaryLocation(db, record.material_id)
        }

        if (priceChanged && newBatch) {
          db.prepare('UPDATE batches SET inbound_price = ?, updated_at = CURRENT_TIMESTAMP WHERE material_id = ? AND batch_no = ?')
            .run(newPrice, record.material_id, newBatch)
        }

        if (purchaseOrderUpdate) {
          db.prepare('UPDATE purchase_orders SET received_qty = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(purchaseOrderUpdate.newReceived, purchaseOrderUpdate.status, record.purchase_order_id)
        }
      }

      // 4. 更新入库记录
      if (fields.length > 0) {
        params.push(id)
        db.prepare(`UPDATE inbound_records SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0`).run(...params)
      }

      // 5. 记录日志
      const currentStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any)?.stock || 0
      let logQty = 0, logType = 'update', logRemark = '更新入库记录'
      if (oldStatus === 'completed' && newStatus === 'cancelled') { logQty = -oldQty; logType = 'cancel'; logRemark = '取消入库记录' }
      else if (oldStatus === 'cancelled' && newStatus === 'completed') { logQty = oldQty; logType = 'restore'; logRemark = '恢复入库记录' }
      else if (newQty !== oldQty) { logQty = newQty - oldQty }

      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'inbound_update', ?, ?)
      `).run(logId, logType, record.material_id, logQty, currentStock - logQty, currentStock, id, (req as any).user?.username || 'system', logRemark)

      db.exec('COMMIT')

      let msg = '更新成功'
      if (newStatus === 'cancelled' && oldStatus !== 'cancelled') msg = '取消成功，库存已同步扣减'
      if (newStatus === 'completed' && oldStatus === 'cancelled') msg = '恢复成功，库存已同步增加'
      success(res, { id }, msg)
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  } catch (err: any) { error(res, err.message) }
})

router.delete('/:id', requireWriteAccess, (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const record = db.prepare('SELECT * FROM inbound_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    // 事务保护：删除涉及 records + batches + purchase_orders + stock_logs 多表操作
    db.exec('BEGIN IMMEDIATE')
    try {
      let deleteStockLog: { quantity: number; beforeStock: number; afterStock: number } | null = null

      if (record.status === 'completed') {
        const beforeDeleteStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any)?.stock || 0

        // 1. 检查是否有出库记录
        const outboundExists = db.prepare(`
          SELECT COALESCE(SUM(oi.quantity),0) as total
          FROM outbound_items oi
          JOIN outbound_records o ON oi.outbound_id = o.id
          WHERE oi.material_id = ? AND (oi.batch_no = ? OR (oi.batch_no IS NULL AND ? IS NULL)) AND o.is_deleted = 0
        `).get(record.material_id, record.batch_no, record.batch_no) as any
        if (outboundExists && outboundExists.total > 0) {
          db.exec('ROLLBACK')
          error(res, `该入库记录对应的批次已有出库记录 ${outboundExists.total} ${record.unit}，不可删除。请先作废关联的出库单`, 'BUSINESS_RULE', 400)
          return
        }

        // 2. 检查是否有使用中的消耗跟踪
        const inUseExists = db.prepare(
          "SELECT 1 FROM batch_usage_tracking WHERE material_id = ? AND (batch = ? OR (batch IS NULL AND ? IS NULL)) AND status = 'in-use' LIMIT 1"
        ).get(record.material_id, record.batch_no, record.batch_no)
        if (inUseExists) {
          db.exec('ROLLBACK')
          error(res, '该批次库存正在使用中，请先确认耗尽后再删除', 'BUSINESS_RULE', 400)
          return
        }

        // 3. 检查删除后库存是否为负
        const totalInbound = (db.prepare(
          "SELECT COALESCE(SUM(quantity),0) as total FROM inbound_records WHERE material_id = ? AND (batch_no = ? OR (batch_no IS NULL AND ? IS NULL)) AND status = 'completed' AND is_deleted = 0 AND id != ?"
        ).get(record.material_id, record.batch_no, record.batch_no, id) as any)?.total || 0
        const totalOutbound = (db.prepare(`
          SELECT COALESCE(SUM(oi.quantity),0) as total
          FROM outbound_items oi
          JOIN outbound_records o ON oi.outbound_id = o.id
          WHERE oi.material_id = ? AND (oi.batch_no = ? OR (oi.batch_no IS NULL AND ? IS NULL)) AND o.is_deleted = 0
        `).get(record.material_id, record.batch_no, record.batch_no) as any)?.total || 0
        if (totalInbound < totalOutbound) {
          db.exec('ROLLBACK')
          error(res, `删除后该批次库存将变为负数（剩余 ${totalInbound}，已出库 ${totalOutbound}），不可删除`, 'BUSINESS_RULE', 400)
          return
        }

        const batchDeduction = validateInboundBatchDeduction(
          db,
          record,
          '批次数量已被后续业务调整，无法删除入库记录',
        )
        if (!batchDeduction.ok) {
          db.exec('ROLLBACK')
          error(res, batchDeduction.message, batchDeduction.code, batchDeduction.status)
          return
        }

        // 4. 回退采购订单收货数量
        if (record.purchase_order_id) {
          const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND is_deleted = 0').get(record.purchase_order_id) as any
          if (order) {
            const newReceived = Math.max(0, Number(order.received_qty) - record.quantity)
            const poStatus = newReceived === 0 ? 'pending' : 'partial'
            db.prepare('UPDATE purchase_orders SET received_qty = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
              .run(newReceived, poStatus, record.purchase_order_id)
          }
        }

        // 5. 扣减批次数量
        if (record.batch_no) {
          db.prepare('UPDATE batches SET quantity = quantity - ?, remaining = remaining - ? WHERE material_id = ? AND batch_no = ?')
            .run(record.quantity, record.quantity, record.material_id, record.batch_no)
          const batch = db.prepare('SELECT remaining FROM batches WHERE material_id = ? AND batch_no = ?')
            .get(record.material_id, record.batch_no) as any
          if (batch && batch.remaining <= 0) {
            db.prepare('UPDATE batches SET status = 0 WHERE material_id = ? AND batch_no = ?')
              .run(record.material_id, record.batch_no)
          }
        }

        // 6. 扣减总库存
        db.prepare('UPDATE inventory SET stock = stock - ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')
          .run(record.quantity, record.material_id)
        adjustInventoryLocationStock(db, record.material_id, record.location_id, -Number(record.quantity))
        syncInventoryPrimaryLocation(db, record.material_id)
        const afterDeleteStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any)?.stock || 0
        deleteStockLog = {
          quantity: -Number(record.quantity),
          beforeStock: Number(beforeDeleteStock),
          afterStock: Number(afterDeleteStock),
        }
      }

      // 6. 软删除入库记录
      db.prepare('UPDATE inbound_records SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)

      // 7. 只在真实扣减库存时记录库存流水；已取消记录删除不产生库存变动。
      if (deleteStockLog) {
        const logId = uuidv4()
        db.prepare(`
          INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
          VALUES (?, 'delete', ?, ?, ?, ?, ?, 'inbound_delete', ?, '删除入库记录')
        `).run(logId, record.material_id, deleteStockLog.quantity, deleteStockLog.beforeStock, deleteStockLog.afterStock, id, (req as any).user?.username || 'system')
      }

      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }

    success(res, null, '删除成功，库存已同步扣减')
  } catch (err: any) { error(res, err.message) }
})

router.post('/:id/cancel', requireWriteAccess, (req, res) => {
  try {
    const { id } = req.params
    const { reason } = req.body
    const db = getDatabase()
    const record = db.prepare('SELECT * FROM inbound_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    if (record.status !== 'completed') {
      error(res, '只有已完成的入库记录可以取消', 'BUSINESS_RULE', 400)
      return
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      // 检查出库记录（处理 batch_no 为 NULL 的情况）
      const outboundTotal = (db.prepare(`
        SELECT COALESCE(SUM(oi.quantity),0) as total FROM outbound_items oi
        JOIN outbound_records o ON oi.outbound_id = o.id
        WHERE oi.material_id = ? AND (oi.batch_no = ? OR (oi.batch_no IS NULL AND ? IS NULL)) AND o.is_deleted = 0
      `).get(record.material_id, record.batch_no, record.batch_no) as any)?.total || 0

      if (outboundTotal > 0) {
        db.exec('ROLLBACK')
        error(res, `该批次已有出库记录 ${outboundTotal} ${record.unit}，不可取消`, 'BUSINESS_RULE', 400)
        return
      }

      const inUse = db.prepare("SELECT 1 FROM batch_usage_tracking WHERE material_id = ? AND (batch = ? OR (batch IS NULL AND ? IS NULL)) AND status = 'in-use' LIMIT 1")
        .get(record.material_id, record.batch_no, record.batch_no)
      if (inUse) {
        db.exec('ROLLBACK')
        error(res, '该批次库存正在使用中，不可取消', 'BUSINESS_RULE', 400)
        return
      }

      const otherInbound = (db.prepare(`
        SELECT COALESCE(SUM(quantity),0) as total FROM inbound_records
        WHERE material_id = ? AND (batch_no = ? OR (batch_no IS NULL AND ? IS NULL)) AND status = 'completed' AND is_deleted = 0 AND id != ?
      `).get(record.material_id, record.batch_no, record.batch_no, id) as any)?.total || 0
      if (otherInbound < outboundTotal) {
        db.exec('ROLLBACK')
        error(res, `取消后库存将变为负数，不可取消`, 'BUSINESS_RULE', 400)
        return
      }

      const batchDeduction = validateInboundBatchDeduction(
        db,
        record,
        '批次数量已被后续业务调整，无法取消入库记录',
      )
      if (!batchDeduction.ok) {
        db.exec('ROLLBACK')
        error(res, batchDeduction.message, batchDeduction.code, batchDeduction.status)
        return
      }

      // 回退采购订单
      if (record.purchase_order_id) {
        const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ?').get(record.purchase_order_id) as any
        if (order) {
          const newReceived = Math.max(0, Number(order.received_qty) - record.quantity)
          db.prepare('UPDATE purchase_orders SET received_qty = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newReceived, newReceived === 0 ? 'pending' : 'partial', record.purchase_order_id)
        }
      }

      // 扣减库存
      db.prepare('UPDATE inventory SET stock = stock - ? WHERE material_id = ?').run(record.quantity, record.material_id)
      adjustInventoryLocationStock(db, record.material_id, record.location_id, -Number(record.quantity))
      syncInventoryPrimaryLocation(db, record.material_id)
      // 扣减批次
      if (record.batch_no) {
        db.prepare('UPDATE batches SET quantity = quantity - ?, remaining = remaining - ? WHERE material_id = ? AND batch_no = ?')
          .run(record.quantity, record.quantity, record.material_id, record.batch_no)
        const b = db.prepare('SELECT remaining FROM batches WHERE material_id = ? AND batch_no = ?')
          .get(record.material_id, record.batch_no) as any
        if (b && b.remaining <= 0) {
          db.prepare('UPDATE batches SET status = 0 WHERE material_id = ? AND batch_no = ?')
            .run(record.material_id, record.batch_no)
        }
      }

      db.prepare("UPDATE inbound_records SET status = 'cancelled', cancel_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0")
        .run(reason || '', id)

      const currentStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any)?.stock || 0
      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
        VALUES (?, 'cancel', ?, ?, ?, ?, ?, 'inbound_cancel', ?, '取消入库记录')
      `).run(logId, record.material_id, -record.quantity, currentStock + record.quantity, currentStock, id, (req as any).user?.username || 'system')

      db.exec('COMMIT')
      success(res, null, '取消成功，库存已同步扣减')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  } catch (err: any) {
    if (err.code === 'SQLITE_CONSTRAINT') {
      error(res, '数据约束冲突', 'RESOURCE_CONFLICT', 409)
    } else if (err.code === 'SQLITE_BUSY') {
      error(res, '数据库繁忙，请稍后重试', 'SERVICE_UNAVAILABLE', 503)
    } else {
      error(res, err.message)
    }
  }
})

export default router
