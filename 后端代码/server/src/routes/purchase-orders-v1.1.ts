import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { requireRole } from '../middleware/auth.js'
import { logOperation } from '../utils/operation-logger.js'

const router = Router()
const requirePurchaseOrderWrite = requireRole('admin', 'procurement')

function generateOrderNo(): string {
  const date = new Date()
  const prefix = 'PO' + date.getFullYear() + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0')
  const db = getDatabase()
  const count = (db.prepare("SELECT COUNT(*) as count FROM purchase_orders WHERE order_no LIKE ?").get(prefix + '%') as any)?.count || 0
  return prefix + '-' + String(count + 1).padStart(4, '0')
}

function mapPurchaseOrder(row: any) {
  const orderedQty = Number(row.ordered_qty || 0)
  const receivedQty = Number(row.received_qty || 0)
  return {
    id: row.id,
    orderNo: row.order_no,
    materialId: row.material_id,
    materialName: row.material_name,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name || null,
    orderedQty,
    receivedQty,
    remainingQty: orderedQty - receivedQty,
    unit: row.unit,
    unitPrice: Number(row.unit_price || 0),
    totalAmount: Number(row.total_amount || 0),
    expectedDate: row.expected_date,
    status: row.status,
    remark: row.remark,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function normalizeOptionalId(value: unknown): string | null {
  const normalized = String(value ?? '').trim()
  return normalized || null
}

function readActiveMaterial(db: any, materialId: string) {
  const material = db.prepare(`
    SELECT id, name, unit, price, status
    FROM materials
    WHERE id = ? AND is_deleted = 0
  `).get(materialId) as any

  if (!material) {
    return { ok: false, status: 404, message: '物料不存在', code: 'NOT_FOUND' }
  }
  if (Number(material.status) !== 1) {
    return { ok: false, status: 409, message: '物料已停用，不能创建采购订单', code: 'CONFLICT' }
  }
  return { ok: true, material }
}

function readActiveSupplier(db: any, supplierId: string | null) {
  if (!supplierId) return { ok: true, supplierId: null }

  const supplier = db.prepare(`
    SELECT id, status
    FROM suppliers
    WHERE id = ? AND is_deleted = 0
  `).get(supplierId) as any

  if (!supplier) {
    return { ok: false, status: 404, message: '供应商不存在', code: 'NOT_FOUND' }
  }
  if (Number(supplier.status) !== 1) {
    return { ok: false, status: 409, message: '供应商已停用，不能创建采购订单', code: 'CONFLICT' }
  }
  return { ok: true, supplierId }
}

function purchaseOrderAuditSnapshot(row: any) {
  return {
    materialId: row.material_id,
    materialName: row.material_name,
    supplierId: row.supplier_id,
    orderedQty: Number(row.ordered_qty || 0),
    receivedQty: Number(row.received_qty || 0),
    unit: row.unit,
    unitPrice: Number(row.unit_price || 0),
    totalAmount: Number(row.total_amount || 0),
    expectedDate: row.expected_date || null,
    remark: row.remark || '',
    status: row.status,
  }
}

function diffPurchaseOrderFields(before: any, after: any) {
  return Object.keys(after).filter(key => before[key] !== after[key])
}

// 获取采购订单列表
router.get('/', (req, res) => {
  try {
    let { status, supplierId, keyword, page = '1', pageSize = '20' } = req.query
    const safePage = Math.max(1, Number(page) || 1)
    const safePageSize = Math.max(1, Math.min(1000, Number(pageSize) || 20))
    const db = getDatabase()
    let where = 'po.is_deleted = 0'
    const params: any[] = []
    if (status) {
      const statuses = String(status).split(',').filter(Boolean)
      if (statuses.length === 1) {
        where += ' AND po.status = ?'; params.push(statuses[0])
      } else if (statuses.length > 1) {
        where += ' AND po.status IN (' + statuses.map(() => '?').join(',') + ')'
        params.push(...statuses)
      }
    }
    if (supplierId) { where += ' AND po.supplier_id = ?'; params.push(supplierId) }
    if (keyword) { where += ' AND (po.order_no LIKE ? OR po.material_name LIKE ? OR s.name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`) }
    const total = (db.prepare(`
      SELECT COUNT(*) as count
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id AND s.is_deleted = 0
      WHERE ${where}
    `).get(...params) as any).count
    let sql = `
      SELECT po.*, s.name as supplier_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id AND s.is_deleted = 0
      WHERE ${where}
      ORDER BY po.created_at DESC
      LIMIT ? OFFSET ?
    `
    const offset = (safePage - 1) * safePageSize
    params.push(safePageSize, offset)
    const list = db.prepare(sql).all(...params) as any[]
    successList(res, list.map(mapPurchaseOrder), safePage, safePageSize, total)
  } catch (err: any) { error(res, err.message) }
})

// 获取采购订单详情
router.get('/:id', (req, res) => {
  try {
    const db = getDatabase()
    const order = db.prepare(`
      SELECT po.*, s.name as supplier_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id AND s.is_deleted = 0
      WHERE po.id = ? AND po.is_deleted = 0
    `).get(req.params.id) as any
    if (!order) { error(res, '订单不存在', 'NOT_FOUND', 404); return }
    success(res, mapPurchaseOrder(order))
  } catch (err: any) { error(res, err.message) }
})

// 创建采购订单
router.post('/', requirePurchaseOrderWrite, (req, res) => {
  try {
    const { materialId, supplierId, orderedQty, unitPrice, expectedDate, remark } = req.body
    const normalizedMaterialId = normalizeOptionalId(materialId)
    const normalizedSupplierId = normalizeOptionalId(supplierId)
    const normalizedOrderedQty = Number(orderedQty)
    if (!normalizedMaterialId || !normalizedSupplierId || orderedQty === undefined || orderedQty === null || !Number.isFinite(normalizedOrderedQty) || normalizedOrderedQty <= 0) {
      error(res, '物料、供应商和采购数量必填', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const materialResult = readActiveMaterial(db, normalizedMaterialId)
    if (!materialResult.ok) {
      error(res, materialResult.message, materialResult.code, materialResult.status); return
    }
    const supplierResult = readActiveSupplier(db, normalizedSupplierId)
    if (!supplierResult.ok) {
      error(res, supplierResult.message, supplierResult.code, supplierResult.status); return
    }
    const material = materialResult.material
    const normalizedUnitPrice = unitPrice === undefined || unitPrice === null || unitPrice === ''
      ? Number(material.price || 0)
      : Number(unitPrice)
    if (!Number.isFinite(normalizedUnitPrice) || normalizedUnitPrice < 0) {
      error(res, '采购单价不能为负数', 'INVALID_PARAMETER', 400); return
    }
    const id = uuidv4()
    const orderNo = generateOrderNo()
    const totalAmount = normalizedUnitPrice * normalizedOrderedQty
    db.prepare(`
      INSERT INTO purchase_orders (id, order_no, material_id, material_name, supplier_id, ordered_qty, received_qty, unit, unit_price, total_amount, expected_date, status, remark)
      VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'pending', ?)
    `).run(
      id,
      orderNo,
      normalizedMaterialId,
      material.name || '',
      supplierResult.supplierId,
      normalizedOrderedQty,
      material.unit || '个',
      normalizedUnitPrice,
      totalAmount,
      expectedDate || null,
      remark || '',
    )
    logOperation(db, req, {
      operation: 'POST /purchase-orders',
      description: `创建采购订单 ${orderNo}`,
      requestData: {
        module: 'purchase_orders',
        id,
        orderNo,
        materialId: normalizedMaterialId,
        supplierId: supplierResult.supplierId,
        orderedQty: normalizedOrderedQty,
      },
      responseData: { id, orderNo },
    })
    success(res, { id, orderNo }, '采购订单创建成功')
  } catch (err: any) { error(res, err.message) }
})

// 编辑采购订单：仅允许未收货订单更正，避免已形成库存事实后改写采购源头。
router.put('/:id', requirePurchaseOrderWrite, (req, res) => {
  try {
    const { materialId, supplierId, orderedQty, unitPrice, expectedDate, remark } = req.body
    const normalizedMaterialId = normalizeOptionalId(materialId)
    const normalizedSupplierId = normalizeOptionalId(supplierId)
    const normalizedOrderedQty = Number(orderedQty)
    if (!normalizedMaterialId || !normalizedSupplierId || orderedQty === undefined || orderedQty === null || !Number.isFinite(normalizedOrderedQty) || normalizedOrderedQty <= 0) {
      error(res, '物料、供应商和采购数量必填', 'INVALID_PARAMETER', 400); return
    }

    const db = getDatabase()
    const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND is_deleted = 0').get(req.params.id) as any
    if (!order) { error(res, '订单不存在', 'NOT_FOUND', 404); return }
    if (Number(order.received_qty || 0) > 0 || order.status === 'partial' || order.status === 'completed') {
      error(res, '已收货的采购订单不能直接编辑，请通过入库修正或取消流程处理', 'PURCHASE_ORDER_ALREADY_RECEIVED', 409); return
    }
    if (order.status !== 'pending') {
      error(res, '只有待收货采购订单可以编辑', 'PURCHASE_ORDER_NOT_EDITABLE', 409); return
    }

    const materialResult = readActiveMaterial(db, normalizedMaterialId)
    if (!materialResult.ok) {
      error(res, materialResult.message, materialResult.code, materialResult.status); return
    }
    const supplierResult = readActiveSupplier(db, normalizedSupplierId)
    if (!supplierResult.ok) {
      error(res, supplierResult.message, supplierResult.code, supplierResult.status); return
    }

    const material = materialResult.material
    const normalizedUnitPrice = unitPrice === undefined || unitPrice === null || unitPrice === ''
      ? Number(order.unit_price || material.price || 0)
      : Number(unitPrice)
    if (!Number.isFinite(normalizedUnitPrice) || normalizedUnitPrice < 0) {
      error(res, '采购单价不能为负数', 'INVALID_PARAMETER', 400); return
    }
    const totalAmount = normalizedUnitPrice * normalizedOrderedQty
    const before = purchaseOrderAuditSnapshot(order)

    db.prepare(`
      UPDATE purchase_orders
      SET material_id = ?,
          material_name = ?,
          supplier_id = ?,
          ordered_qty = ?,
          unit = ?,
          unit_price = ?,
          total_amount = ?,
          expected_date = ?,
          remark = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND is_deleted = 0
    `).run(
      normalizedMaterialId,
      material.name || '',
      supplierResult.supplierId,
      normalizedOrderedQty,
      material.unit || '个',
      normalizedUnitPrice,
      totalAmount,
      expectedDate || null,
      remark || '',
      req.params.id,
    )

    const updated = db.prepare(`
      SELECT po.*, s.name as supplier_name
      FROM purchase_orders po
      LEFT JOIN suppliers s ON po.supplier_id = s.id AND s.is_deleted = 0
      WHERE po.id = ? AND po.is_deleted = 0
    `).get(req.params.id) as any
    const after = purchaseOrderAuditSnapshot(updated)
    logOperation(db, req, {
      operation: 'PUT /purchase-orders/:id',
      description: `更正采购订单 ${order.order_no || req.params.id}`,
      requestData: {
        module: 'purchase_orders',
        id: req.params.id,
        orderNo: order.order_no,
        before,
        after,
      },
      responseData: {
        id: req.params.id,
        status: updated.status,
        changedFields: diffPurchaseOrderFields(before, after),
      },
    })

    success(res, mapPurchaseOrder(updated), '采购订单已更新')
  } catch (err: any) { error(res, err.message) }
})

// 采购收货必须通过入库接口完成，避免订单状态和库存批次脱节。
router.put('/:id/receive', requirePurchaseOrderWrite, (req, res) => {
  try {
    const db = getDatabase()
    const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND is_deleted = 0').get(req.params.id) as any
    if (!order) { error(res, '订单不存在', 'NOT_FOUND', 404); return }
    error(res, '采购收货必须通过入库接口创建入库记录', 'INVALID_OPERATION', 400)
  } catch (err: any) { error(res, err.message) }
})

// 取消采购订单
router.put('/:id/cancel', requirePurchaseOrderWrite, (req, res) => {
  try {
    const db = getDatabase()
    const order = db.prepare('SELECT * FROM purchase_orders WHERE id = ? AND is_deleted = 0').get(req.params.id) as any
    if (!order) { error(res, '订单不存在', 'NOT_FOUND', 404); return }
    if (Number(order.received_qty || 0) > 0 || order.status === 'partial' || order.status === 'completed') {
      error(res, '已收货的订单不能取消', 'INVALID_PARAMETER', 400); return
    }
    if (order.status === 'cancelled') {
      error(res, '已取消的订单不能重复取消', 'INVALID_PARAMETER', 400); return
    }
    db.prepare("UPDATE purchase_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0").run(req.params.id)
    logOperation(db, req, {
      operation: 'PUT /purchase-orders/:id/cancel',
      description: `取消采购订单 ${order.order_no || req.params.id}`,
      requestData: { module: 'purchase_orders', id: req.params.id, orderNo: order.order_no },
      responseData: { id: req.params.id, status: 'cancelled' },
    })
    success(res, { id: req.params.id }, '订单已取消')
  } catch (err: any) { error(res, err.message) }
})

export default router
