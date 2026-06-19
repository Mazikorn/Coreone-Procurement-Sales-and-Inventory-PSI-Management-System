import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { requireStrictRole } from '../middleware/auth.js'
import { normalizeDisplayText, requireValidText, type TextGuardResult } from '../utils/text-guard.js'

const router = Router()

// 物料写入权限：物料规范 MAT-14~16 允许 admin 和 warehouse_manager 操作
const requireMaterialWrite = requireStrictRole('admin', 'warehouse_manager')

function buildMaterialWhere(query: any) {
  const { keyword, categoryId, supplierId, status, lowStock } = query
  let where = 'm.is_deleted = 0'
  const params: any[] = []
  if (keyword) {
    where += ' AND (m.name LIKE ? OR m.code LIKE ? OR COALESCE(m.barcode, \'\') LIKE ?)'
    const like = `%${keyword}%`
    params.push(like, like, like)
  }
  if (categoryId) { where += ' AND m.category_id = ?'; params.push(categoryId) }
  if (supplierId) { where += ' AND m.supplier_id = ?'; params.push(supplierId) }
  if (status === 'active' || status === 'inactive') { where += ' AND m.status = ?'; params.push(status === 'active' ? 1 : 0) }
  if (lowStock === true || lowStock === 'true' || lowStock === '1') {
    where += ' AND COALESCE((SELECT stock FROM inventory WHERE material_id = m.id), 0) <= COALESCE(m.min_stock, 0)'
  }
  return { where, params }
}

router.get('/', (req, res) => {
  try {
    let { page = 1, pageSize = 20 } = req.query
    page = Math.max(1, Number(page) || 1)
    pageSize = Math.max(1, Math.min(1000, Number(pageSize) || 20))
    const db = getDatabase()

    const { where, params } = buildMaterialWhere(req.query)

    const countSql = `SELECT COUNT(*) as total FROM materials m WHERE ${where}`
    const count = (db.prepare(countSql).get(...params) as any)?.total || 0

    let sql = `
      SELECT
        m.*,
        c.name as category_name,
        s.name as supplier_name,
        COALESCE(i.location_id, m.location_id) as current_location_id,
        COALESCE(inv_l.name, l.name) as current_location_name,
        COALESCE(i.stock, 0) as stock
      FROM materials m
      LEFT JOIN material_categories c ON m.category_id = c.id
      LEFT JOIN suppliers s ON m.supplier_id = s.id
      LEFT JOIN locations l ON m.location_id = l.id
      LEFT JOIN inventory i ON m.id = i.material_id
      LEFT JOIN locations inv_l ON i.location_id = inv_l.id AND inv_l.is_deleted = 0
      WHERE ${where}
      ORDER BY m.created_at DESC
      LIMIT ? OFFSET ?
    `
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(sql).all(...params, Number(pageSize), offset) as any[]

    successList(res, list.map((row: any) => ({
      id: row.id, code: row.code, barcode: row.barcode, name: row.name, spec: row.spec, unit: row.unit,
      specQty: row.spec_qty, specUnit: row.spec_unit,
      price: row.price, stock: row.stock, minStock: row.min_stock, maxStock: row.max_stock,
      safetyStock: row.safety_stock, locationId: row.current_location_id, locationName: row.current_location_name,
      categoryId: row.category_id, categoryPath: row.category_name, supplierId: row.supplier_id,
      supplierName: row.supplier_name, status: row.status === 1 ? 'active' : 'inactive',
      remark: row.remark, createdAt: row.created_at, updatedAt: row.updated_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/stats', (req, res) => {
  try {
    const db = getDatabase()
    const { where, params } = buildMaterialWhere(req.query)
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN m.status = 1 THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN m.status = 0 THEN 1 ELSE 0 END), 0) as inactive,
        COALESCE(SUM(CASE WHEN COALESCE(i.stock, 0) <= COALESCE(m.min_stock, 0) THEN 1 ELSE 0 END), 0) as lowStock
      FROM materials m
      LEFT JOIN inventory i ON m.id = i.material_id
      WHERE ${where}
    `).get(...params) as any
    success(res, {
      total: row?.total || 0,
      active: row?.active || 0,
      inactive: row?.inactive || 0,
      lowStock: row?.lowStock || 0,
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/barcode/:code', (req, res) => {
  try {
    const code = decodeURIComponent(req.params.code || '').trim()
    if (!code) { error(res, 'Barcode required', 'INVALID_PARAMETER', 400); return }

    const db = getDatabase()
    const row = db.prepare(`
      SELECT
        m.*,
        c.name as category_name,
        s.name as supplier_name,
        COALESCE(i.location_id, m.location_id) as current_location_id,
        COALESCE(inv_l.name, l.name) as current_location_name,
        COALESCE(i.stock, 0) as stock
      FROM materials m
      LEFT JOIN material_categories c ON m.category_id = c.id AND c.is_deleted = 0
      LEFT JOIN suppliers s ON m.supplier_id = s.id AND s.is_deleted = 0
      LEFT JOIN locations l ON m.location_id = l.id AND l.is_deleted = 0
      LEFT JOIN inventory i ON m.id = i.material_id
      LEFT JOIN locations inv_l ON i.location_id = inv_l.id AND inv_l.is_deleted = 0
      WHERE m.is_deleted = 0
        AND m.status = 1
        AND (LOWER(COALESCE(m.barcode, '')) = LOWER(?) OR LOWER(m.code) = LOWER(?))
      ORDER BY CASE WHEN LOWER(COALESCE(m.barcode, '')) = LOWER(?) THEN 0 ELSE 1 END
      LIMIT 1
    `).get(code, code, code) as any

    if (!row) { error(res, '未找到匹配物料', 'NOT_FOUND', 404); return }

    success(res, {
      id: row.id, code: row.code, barcode: row.barcode, name: row.name, spec: row.spec, unit: row.unit,
      specQty: row.spec_qty, specUnit: row.spec_unit,
      price: row.price, stock: row.stock, minStock: row.min_stock, maxStock: row.max_stock,
      safetyStock: row.safety_stock, locationId: row.current_location_id, locationName: row.current_location_name,
      categoryId: row.category_id, categoryPath: row.category_name, supplierId: row.supplier_id,
      supplierName: row.supplier_name, status: 'active',
      remark: row.remark, createdAt: row.created_at, updatedAt: row.updated_at,
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/next-code', (req, res) => {
  try {
    const { categoryId } = req.query
    if (!categoryId) { error(res, 'categoryId required', 'INVALID_PARAMETER', 400); return }
    const db = getDatabase()
    const refValidation = validateMaterialReferences(db, { categoryId })
    if (!refValidation.ok) {
      error(res, refValidation.message, refValidation.code, refValidation.status)
      return
    }
    const code = generateMaterialCode(db, categoryId as string)
    success(res, { code })
  } catch (err: any) { error(res, err.message) }
})

router.get('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const row = db.prepare(`
      SELECT
        m.*,
        c.name as category_name,
        s.name as supplier_name,
        COALESCE(i.location_id, m.location_id) as current_location_id,
        COALESCE(inv_l.name, l.name) as current_location_name,
        COALESCE(i.stock, 0) as stock
      FROM materials m
      LEFT JOIN material_categories c ON m.category_id = c.id AND c.is_deleted = 0
      LEFT JOIN suppliers s ON m.supplier_id = s.id AND s.is_deleted = 0
      LEFT JOIN locations l ON m.location_id = l.id AND l.is_deleted = 0
      LEFT JOIN inventory i ON m.id = i.material_id
      LEFT JOIN locations inv_l ON i.location_id = inv_l.id AND inv_l.is_deleted = 0
      WHERE m.id = ? AND m.is_deleted = 0
    `).get(id) as any

    if (!row) { error(res, 'Not found', 'NOT_FOUND', 404); return }

    const batches = db.prepare('SELECT * FROM batches WHERE material_id = ? AND status = 1 ORDER BY expiry_date').all(id) as any[]
    const stockLogs = db.prepare('SELECT * FROM stock_logs WHERE material_id = ? ORDER BY created_at DESC LIMIT 20').all(id) as any[]

    success(res, {
      id: row.id, code: row.code, barcode: row.barcode, name: row.name, spec: row.spec, unit: row.unit,
      price: row.price, stock: row.stock, minStock: row.min_stock, maxStock: row.max_stock,
      safetyStock: row.safety_stock, locationId: row.current_location_id, locationName: row.current_location_name,
      categoryId: row.category_id, categoryPath: row.category_name, supplierId: row.supplier_id,
      supplierName: row.supplier_name, status: row.status === 1 ? 'active' : 'inactive',
      remark: row.remark,
      batches: batches.map((b: any) => ({
        id: b.id, batchNo: b.batch_no, quantity: b.quantity,
        remaining: b.remaining,
        inboundPrice: b.inbound_price,
        supplierId: b.supplier_id,
        status: Number(b.status) === 1 ? 'normal' : 'depleted',
        productionDate: b.production_date, expiryDate: b.expiry_date, inboundId: b.inbound_id,
      })),
      stockLogs: stockLogs.map((l: any) => ({
        id: l.id, type: l.type, quantity: l.quantity, beforeStock: l.before_stock,
        afterStock: l.after_stock, relatedId: l.related_id, operator: l.operator, createdAt: l.created_at,
      })),
      createdAt: row.created_at, updatedAt: row.updated_at,
    })
  } catch (err: any) { error(res, err.message) }
})

function generateMaterialCode(db: any, categoryId: string): string {
  const category = db.prepare('SELECT code FROM material_categories WHERE id = ? AND status = 1 AND is_deleted = 0').get(categoryId) as any
  let prefix = 'MAT'
  if (category) {
    const c = Math.floor(Number(category.code) / 100)
    if (c === 1) prefix = 'REA'
    else if (c === 2) prefix = 'CON'
    else if (c === 3) prefix = 'DEV'
    else if (c === 4) prefix = 'HZP'
  }
  const max = db.prepare(`SELECT MAX(CAST(SUBSTR(code, 5) AS INTEGER)) as max FROM materials WHERE code LIKE ?`).get(`${prefix}-%`) as any
  const num = (Number(max?.max) || 0) + 1
  return `${prefix}-${String(num).padStart(5, '0')}`
}

function normalizeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return Array.from(new Set(ids.map(id => String(id || '').trim()).filter(Boolean)))
}

function sendTextError(res: any, result: TextGuardResult): result is Extract<TextGuardResult, { ok: false }> {
  if ('message' in result) {
    error(res, result.message, result.code, result.status)
    return true
  }
  return false
}

function validateMaterialReferences(db: any, refs: { categoryId?: unknown; supplierId?: unknown; locationId?: unknown }) {
  const categoryId = String(refs.categoryId || '').trim()
  const supplierId = String(refs.supplierId || '').trim()
  const locationId = String(refs.locationId || '').trim()

  if (categoryId) {
    const category = db.prepare('SELECT id, status FROM material_categories WHERE id = ? AND is_deleted = 0').get(categoryId) as any
    if (!category) return { ok: false, status: 404, message: '物料分类不存在', code: 'NOT_FOUND' }
    if (Number(category.status) !== 1) {
      return { ok: false, status: 409, message: '停用物料分类不能用于物料', code: 'CONFLICT' }
    }
  }

  if (supplierId) {
    const supplier = db.prepare('SELECT id, status FROM suppliers WHERE id = ? AND is_deleted = 0').get(supplierId) as any
    if (!supplier) return { ok: false, status: 404, message: '供应商不存在', code: 'NOT_FOUND' }
    if (Number(supplier.status) !== 1) {
      return { ok: false, status: 409, message: '停用供应商不能用于物料', code: 'CONFLICT' }
    }
  }

  if (locationId) {
    const location = db.prepare('SELECT id, status FROM locations WHERE id = ? AND is_deleted = 0').get(locationId) as any
    if (!location) return { ok: false, status: 404, message: '库位不存在', code: 'NOT_FOUND' }
    if (Number(location.status) !== 1) {
      return { ok: false, status: 409, message: '停用库位不能用于物料', code: 'CONFLICT' }
    }
  }

  return { ok: true }
}

function validateMaterialIdentityUnique(db: any, refs: { id?: string; code?: unknown; barcode?: unknown }) {
  const id = String(refs.id || '').trim()
  const code = String(refs.code || '').trim()
  const barcode = String(refs.barcode || '').trim()

  if (code) {
    const duplicateCode = db.prepare(`
      SELECT id FROM materials
      WHERE is_deleted = 0 AND code = ? AND id <> ?
      LIMIT 1
    `).get(code, id) as any
    if (duplicateCode) {
      return { ok: false, status: 409, message: '物料编码已存在', code: 'RESOURCE_CONFLICT' }
    }
  }

  if (barcode) {
    const duplicateBarcode = db.prepare(`
      SELECT id FROM materials
      WHERE is_deleted = 0
        AND COALESCE(barcode, '') <> ''
        AND LOWER(barcode) = LOWER(?)
        AND id <> ?
      LIMIT 1
    `).get(barcode, id) as any
    if (duplicateBarcode) {
      return { ok: false, status: 409, message: '物料条码已存在', code: 'RESOURCE_CONFLICT' }
    }
  }

  return { ok: true }
}

type MaterialNumberResult =
  | { ok: true; value: number }
  | { ok: false; status: number; message: string; code: string }

type MaterialNumericPayloadResult =
  | { ok: true; values: Record<string, number> }
  | { ok: false; status: number; message: string; code: string }

function normalizeMaterialNumber(value: unknown, label: string, defaultValue: number): MaterialNumberResult {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: defaultValue }
  }
  const numberValue = Number(value)
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return { ok: false, status: 400, message: `${label}必须是有限非负数`, code: 'INVALID_PARAMETER' }
  }
  return { ok: true, value: numberValue }
}

function normalizeMaterialNumericPayload(payload: Record<string, unknown>, defaults: Record<string, number>): MaterialNumericPayloadResult {
  const fields = [
    ['specQty', '规格量'],
    ['price', '参考单价'],
    ['minStock', '最低库存'],
    ['maxStock', '最高库存'],
    ['safetyStock', '安全库存'],
  ] as const
  const normalized: Record<string, number> = {}

  for (const [field, label] of fields) {
    const result = normalizeMaterialNumber(payload[field], label, defaults[field])
    if (result.ok === false) {
      return { ok: false, status: result.status, message: result.message, code: result.code }
    }
    normalized[field] = result.value
  }

  return { ok: true, values: normalized }
}

function getMaterialReferences(db: any, materialId: string) {
  const check = buildMaterialDeleteCheck(db, materialId)
  if (!check) return []
  return [
    { label: '当前库存', count: check.impacts.currentInventoryCount },
    { label: '库位库存', count: check.impacts.inventoryLocationCount },
    { label: '库存批次', count: check.impacts.batchCount },
    { label: '入库记录', count: check.impacts.inboundCount },
    { label: '出库记录', count: check.impacts.outboundCount },
    { label: 'BOM明细', count: check.impacts.bomCount },
    { label: '退库记录', count: check.impacts.returnCount },
    { label: '报废记录', count: check.impacts.scrapCount },
    { label: '供应商退货', count: check.impacts.supplierReturnCount },
    { label: '库存流水', count: check.impacts.stockLogCount },
    { label: '消耗追踪', count: check.impacts.usageTrackingCount },
  ].filter(item => item.count > 0)
}

function buildMaterialDeleteCheck(db: any, materialId: string) {
  const material = db.prepare('SELECT id, code, name FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
  if (!material) return null
  const counts = {
    currentInventoryCount: (db.prepare('SELECT COUNT(*) as count FROM inventory WHERE material_id = ? AND COALESCE(stock, 0) > 0').get(materialId) as any)?.count || 0,
    inventoryLocationCount: (db.prepare('SELECT COUNT(*) as count FROM inventory_locations WHERE material_id = ? AND COALESCE(stock, 0) > 0').get(materialId) as any)?.count || 0,
    batchCount: (db.prepare('SELECT COUNT(*) as count FROM batches WHERE material_id = ?').get(materialId) as any)?.count || 0,
    inboundCount: (db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE material_id = ? AND is_deleted = 0').get(materialId) as any)?.count || 0,
    outboundCount: (db.prepare('SELECT COUNT(*) as count FROM outbound_items WHERE material_id = ?').get(materialId) as any)?.count || 0,
    bomCount: (db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM bom_items WHERE material_id = ?) +
        (SELECT COUNT(*) FROM bom_general_reagents WHERE material_id = ?) +
        (SELECT COUNT(*) FROM bom_general_consumables WHERE material_id = ?) +
        (SELECT COUNT(*) FROM bom_quality_controls WHERE material_id = ?) as count
    `).get(materialId, materialId, materialId, materialId) as any)?.count || 0,
    returnCount: (db.prepare('SELECT COUNT(*) as count FROM return_records WHERE material_id = ? AND is_deleted = 0').get(materialId) as any)?.count || 0,
    scrapCount: (db.prepare('SELECT COUNT(*) as count FROM scrap_records WHERE material_id = ? AND is_deleted = 0').get(materialId) as any)?.count || 0,
    supplierReturnCount: (db.prepare('SELECT COUNT(*) as count FROM supplier_returns WHERE material_id = ? AND is_deleted = 0').get(materialId) as any)?.count || 0,
    stockLogCount: (db.prepare('SELECT COUNT(*) as count FROM stock_logs WHERE material_id = ?').get(materialId) as any)?.count || 0,
    usageTrackingCount: (db.prepare('SELECT COUNT(*) as count FROM batch_usage_tracking WHERE material_id = ?').get(materialId) as any)?.count || 0,
  }
  const labels: Record<keyof typeof counts, string> = {
    currentInventoryCount: '当前库存',
    inventoryLocationCount: '库位库存',
    batchCount: '库存批次',
    inboundCount: '入库记录',
    outboundCount: '出库记录',
    bomCount: 'BOM明细',
    returnCount: '退库记录',
    scrapCount: '报废记录',
    supplierReturnCount: '供应商退货',
    stockLogCount: '库存流水',
    usageTrackingCount: '消耗追踪',
  }
  const reasons = (Object.keys(counts) as Array<keyof typeof counts>)
    .filter(key => counts[key] > 0)
    .map(key => `存在 ${counts[key]} 条${labels[key]}引用`)

  return {
    material,
    deletable: reasons.length === 0,
    impacts: counts,
    reasons,
  }
}

function getActiveBomReferenceCount(db: any, materialId: string) {
  return (db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM bom_items bi JOIN boms b ON b.id = bi.bom_id WHERE bi.material_id = ? AND b.is_deleted = 0 AND b.status = 1) +
      (SELECT COUNT(*) FROM bom_general_reagents br JOIN boms b ON b.id = br.bom_id WHERE br.material_id = ? AND b.is_deleted = 0 AND b.status = 1) +
      (SELECT COUNT(*) FROM bom_general_consumables bc JOIN boms b ON b.id = bc.bom_id WHERE bc.material_id = ? AND b.is_deleted = 0 AND b.status = 1) +
      (SELECT COUNT(*) FROM bom_quality_controls bq JOIN boms b ON b.id = bq.bom_id WHERE bq.material_id = ? AND b.is_deleted = 0 AND b.status = 1) as count
  `).get(materialId, materialId, materialId, materialId) as any)?.count || 0
}

function buildMaterialStatusCheck(db: any, materialId: string, targetStatus: 'active' | 'inactive') {
  const material = db.prepare('SELECT id, code, name, category_id, supplier_id, location_id FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
  if (!material) return null

  const counts = {
    currentInventoryCount: 0,
    inventoryLocationCount: 0,
    activeBomCount: 0,
  }
  const reasons: string[] = []

  if (targetStatus === 'active') {
    const refs = validateMaterialReferences(db, {
      categoryId: material.category_id,
      supplierId: material.supplier_id,
      locationId: material.location_id,
    })
    if (!refs.ok) reasons.push(refs.message)
  } else {
    counts.currentInventoryCount = (db.prepare('SELECT COUNT(*) as count FROM inventory WHERE material_id = ? AND COALESCE(stock, 0) > 0').get(materialId) as any)?.count || 0
    counts.inventoryLocationCount = (db.prepare('SELECT COUNT(*) as count FROM inventory_locations WHERE material_id = ? AND COALESCE(stock, 0) > 0').get(materialId) as any)?.count || 0
    counts.activeBomCount = getActiveBomReferenceCount(db, materialId)
    if (counts.currentInventoryCount > 0) reasons.push(`存在 ${counts.currentInventoryCount} 条当前库存引用`)
    if (counts.inventoryLocationCount > 0) reasons.push(`存在 ${counts.inventoryLocationCount} 条库位库存引用`)
    if (counts.activeBomCount > 0) reasons.push(`存在 ${counts.activeBomCount} 条启用BOM明细引用`)
  }

  return {
    material: {
      id: material.id,
      code: material.code,
      name: material.name,
    },
    targetStatus,
    canChange: reasons.length === 0,
    impacts: counts,
    reasons,
  }
}

function validateMaterialStatusChange(db: any, material: any, status: 'active' | 'inactive') {
  const check = buildMaterialStatusCheck(db, material.id, status)
  if (!check) return { ok: false, status: 404, message: 'Not found', code: 'NOT_FOUND' }
  if (!check.canChange) {
    return {
      ok: false,
      status: status === 'active' ? 409 : 409,
      message: status === 'active' ? check.reasons[0] || '物料绑定的分类、供应商或库位不可用' : '物料仍有当前库存或启用BOM引用，不可停用',
      code: status === 'active' ? 'CONFLICT' : 'MATERIAL_IN_USE',
    }
  }

  return { ok: true }
}

router.post('/', requireMaterialWrite, (req, res) => {
  try {
    const { name, spec, unit, specUnit, categoryId, supplierId, locationId, remark, code: userCode, barcode } = req.body
    const nameText = requireValidText(name, '物料名称')
    if (sendTextError(res, nameText)) return
    const unitText = requireValidText(unit, '物料单位', 40)
    if (sendTextError(res, unitText)) return
    const codeText = normalizeDisplayText(userCode, '物料编码', { maxLength: 60 })
    if (sendTextError(res, codeText)) return
    const barcodeText = normalizeDisplayText(barcode, '物料条码', { maxLength: 80 })
    if (sendTextError(res, barcodeText)) return
    const specText = normalizeDisplayText(spec, '物料规格')
    if (sendTextError(res, specText)) return
    const specUnitText = normalizeDisplayText(specUnit, '规格单位', { maxLength: 40 })
    if (sendTextError(res, specUnitText)) return
    const remarkText = normalizeDisplayText(remark, '物料备注', { maxLength: 500 })
    if (sendTextError(res, remarkText)) return
    if (!categoryId) { error(res, 'Name, unit and category required', 'INVALID_PARAMETER', 400); return }

    const db = getDatabase()
    const refValidation = validateMaterialReferences(db, { categoryId, supplierId, locationId })
    if (!refValidation.ok) {
      error(res, refValidation.message, refValidation.code, refValidation.status)
      return
    }
    const numberPayload = normalizeMaterialNumericPayload(req.body, {
      specQty: 0,
      price: 0,
      minStock: 0,
      maxStock: 999999,
      safetyStock: 0,
    })
    if (numberPayload.ok === false) {
      error(res, numberPayload.message, numberPayload.code, numberPayload.status)
      return
    }
    const id = uuidv4()
    let finalCode: string
    if (codeText.value) {
      finalCode = codeText.value
    } else {
      finalCode = generateMaterialCode(db, categoryId)
    }
    const identityValidation = validateMaterialIdentityUnique(db, {
      id,
      code: finalCode,
      barcode: barcodeText.value,
    })
    if (!identityValidation.ok) {
      error(res, identityValidation.message, identityValidation.code, identityValidation.status)
      return
    }

    db.prepare(`
      INSERT INTO materials (id, code, barcode, name, spec, unit, spec_qty, spec_unit, category_id, supplier_id, price, min_stock, max_stock, safety_stock, location_id, status, remark)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
    `).run(
      id,
      finalCode,
      barcodeText.value,
      nameText.value,
      specText.value,
      unitText.value,
      numberPayload.values.specQty,
      specUnitText.value,
      categoryId,
      supplierId || null,
      numberPayload.values.price,
      numberPayload.values.minStock,
      numberPayload.values.maxStock,
      numberPayload.values.safetyStock,
      locationId || null,
      remarkText.value,
    )

    const invId = uuidv4()
    db.prepare(`INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, 0, 0, ?)`)
      .run(invId, id, locationId || null)

    success(res, { id, code: finalCode, name: nameText.value }, 'Created', 201)
  } catch (err: any) {
    if (err.message.includes('UNIQUE')) { error(res, 'Code already exists', 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

router.get('/:id/check-deletable', requireMaterialWrite, (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const check = buildMaterialDeleteCheck(db, id)
    if (!check) { error(res, 'Not found', 'NOT_FOUND', 404); return }
    success(res, check)
  } catch (err: any) { error(res, err.message) }
})

router.get('/:id/check-status', requireMaterialWrite, (req, res) => {
  try {
    const { id } = req.params
    const status = String(req.query.status || '').trim()
    if (status !== 'active' && status !== 'inactive') {
      error(res, 'Invalid status', 'INVALID_PARAMETER', 400)
      return
    }
    const db = getDatabase()
    const check = buildMaterialStatusCheck(db, id, status)
    if (!check) { error(res, 'Not found', 'NOT_FOUND', 404); return }
    success(res, check)
  } catch (err: any) { error(res, err.message) }
})

router.delete('/batch', requireMaterialWrite, (req, res) => {
  try {
    const ids = normalizeIds(req.body?.ids)
    if (ids.length === 0) {
      error(res, 'Invalid params', 'INVALID_PARAMETER', 400)
      return
    }

    const db = getDatabase()
    const placeholders = ids.map(() => '?').join(',')
    const existing = db.prepare(`
      SELECT id
      FROM materials
      WHERE is_deleted = 0 AND id IN (${placeholders})
    `).all(...ids) as any[]
    if (existing.length !== ids.length) {
      error(res, '存在不存在或已删除的物料，批量删除未执行', 'NOT_FOUND', 404)
      return
    }

    const blocked = ids
      .map(id => buildMaterialDeleteCheck(db, id))
      .filter((check): check is NonNullable<ReturnType<typeof buildMaterialDeleteCheck>> => Boolean(check && !check.deletable))
    if (blocked.length > 0) {
      error(res, '存在已被库存或业务记录引用的物料，批量删除未执行', 'CONFLICT', 409)
      return
    }

    const stmt = db.prepare('UPDATE materials SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0')
    try {
      db.exec('BEGIN')
      for (const id of ids) {
        stmt.run(id)
      }
      db.exec('COMMIT')
    } catch (err) {
      try { db.exec('ROLLBACK') } catch { /* ignore rollback failure */ }
      throw err
    }

    success(res, { deletedCount: ids.length }, 'Batch deleted')
  } catch (err: any) { error(res, err.message) }
})

router.put('/:id', requireMaterialWrite, (req, res) => {
  try {
    const { id } = req.params
    const data = req.body

    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM materials WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!existing) { error(res, 'Not found', 'NOT_FOUND', 404); return }
    if (data.status !== undefined && data.status !== 'active' && data.status !== 'inactive') {
      error(res, 'Invalid status', 'INVALID_PARAMETER', 400); return
    }
    if (data.status !== undefined) {
      const statusValidation = validateMaterialStatusChange(db, existing, data.status)
      if (!statusValidation.ok) {
        error(res, statusValidation.message, statusValidation.code, statusValidation.status)
        return
      }
    }
    const refValidation = validateMaterialReferences(db, {
      categoryId: data.categoryId !== undefined ? data.categoryId : undefined,
      supplierId: data.supplierId !== undefined ? data.supplierId : undefined,
      locationId: data.locationId !== undefined ? data.locationId : undefined,
    })
    if (!refValidation.ok) {
      error(res, refValidation.message, refValidation.code, refValidation.status)
      return
    }
    const identityValidation = validateMaterialIdentityUnique(db, {
      id,
      code: data.code !== undefined ? data.code : undefined,
      barcode: data.barcode !== undefined ? data.barcode : undefined,
    })
    if (!identityValidation.ok) {
      error(res, identityValidation.message, identityValidation.code, identityValidation.status)
      return
    }
    const numberPayload = normalizeMaterialNumericPayload(data, {
      specQty: existing.spec_qty ?? 0,
      price: existing.price ?? 0,
      minStock: existing.min_stock ?? 0,
      maxStock: existing.max_stock ?? 999999,
      safetyStock: existing.safety_stock ?? 0,
    })
    if (numberPayload.ok === false) {
      error(res, numberPayload.message, numberPayload.code, numberPayload.status)
      return
    }

    const fields: string[] = []
    const params: any[] = []

    if (data.code !== undefined) {
      const codeText = requireValidText(data.code, '物料编码', 60)
      if (sendTextError(res, codeText)) return
      fields.push('code = ?'); params.push(codeText.value)
    }
    if (data.barcode !== undefined) {
      const barcodeText = normalizeDisplayText(data.barcode, '物料条码', { maxLength: 80 })
      if (sendTextError(res, barcodeText)) return
      fields.push('barcode = ?'); params.push(barcodeText.value)
    }
    if (data.name !== undefined) {
      const nameText = requireValidText(data.name, '物料名称')
      if (sendTextError(res, nameText)) return
      fields.push('name = ?'); params.push(nameText.value)
    }
    if (data.spec !== undefined) {
      const specText = normalizeDisplayText(data.spec, '物料规格')
      if (sendTextError(res, specText)) return
      fields.push('spec = ?'); params.push(specText.value)
    }
    if (data.unit !== undefined) {
      const unitText = requireValidText(data.unit, '物料单位', 40)
      if (sendTextError(res, unitText)) return
      fields.push('unit = ?'); params.push(unitText.value)
    }
    if (data.specQty !== undefined) { fields.push('spec_qty = ?'); params.push(numberPayload.values.specQty) }
    if (data.specUnit !== undefined) {
      const specUnitText = normalizeDisplayText(data.specUnit, '规格单位', { maxLength: 40 })
      if (sendTextError(res, specUnitText)) return
      fields.push('spec_unit = ?'); params.push(specUnitText.value)
    }
    if (data.categoryId !== undefined) { fields.push('category_id = ?'); params.push(data.categoryId) }
    if (data.supplierId !== undefined) { fields.push('supplier_id = ?'); params.push(data.supplierId) }
    if (data.price !== undefined) { fields.push('price = ?'); params.push(numberPayload.values.price) }
    if (data.minStock !== undefined) { fields.push('min_stock = ?'); params.push(numberPayload.values.minStock) }
    if (data.maxStock !== undefined) { fields.push('max_stock = ?'); params.push(numberPayload.values.maxStock) }
    if (data.safetyStock !== undefined) { fields.push('safety_stock = ?'); params.push(numberPayload.values.safetyStock) }
    if (data.locationId !== undefined) { fields.push('location_id = ?'); params.push(data.locationId) }
    if (data.remark !== undefined) {
      const remarkText = normalizeDisplayText(data.remark, '物料备注', { maxLength: 500 })
      if (sendTextError(res, remarkText)) return
      fields.push('remark = ?'); params.push(remarkText.value)
    }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status === 'active' ? 1 : 0) }

    if (fields.length > 0) {
      params.push(id)
      db.prepare(`UPDATE materials SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0`).run(...params)
    }

    success(res, { id }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

router.delete('/:id', requireMaterialWrite, (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const existing = db.prepare('SELECT * FROM materials WHERE id = ? AND is_deleted = 0').get(id)
    if (!existing) { error(res, 'Not found', 'NOT_FOUND', 404); return }

    const references = getMaterialReferences(db, id)
    if (references.length > 0) {
      error(res, '物料已被库存或业务记录引用，不可删除', 'CONFLICT', 409)
      return
    }

    db.prepare('UPDATE materials SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

router.patch('/batch-status', requireMaterialWrite, (req, res) => {
  try {
    const ids = normalizeIds(req.body?.ids)
    const { status } = req.body
    if (ids.length === 0 || (status !== 'active' && status !== 'inactive')) {
      error(res, 'Invalid params', 'INVALID_PARAMETER', 400)
      return
    }

    const db = getDatabase()
    const placeholders = ids.map(() => '?').join(',')
    const existing = db.prepare(`
      SELECT id, category_id, supplier_id, location_id
      FROM materials
      WHERE is_deleted = 0 AND id IN (${placeholders})
    `).all(...ids) as any[]
    if (existing.length !== ids.length) {
      error(res, '存在不存在或已删除的物料，批量状态未更新', 'NOT_FOUND', 404)
      return
    }
    for (const material of existing) {
      const statusValidation = validateMaterialStatusChange(db, material, status)
      if (!statusValidation.ok) {
        error(res, status === 'active' ? '存在绑定不可用分类、供应商或库位的物料，批量启用未执行' : '存在仍有当前库存或启用BOM引用的物料，批量停用未执行', statusValidation.code, statusValidation.status)
        return
      }
    }

    const stmt = db.prepare('UPDATE materials SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0')
    const newStatus = status === 'active' ? 1 : 0
    try {
      db.exec('BEGIN')
      for (const id of ids) {
        stmt.run(newStatus, id)
      }
      db.exec('COMMIT')
    } catch (err) {
      try { db.exec('ROLLBACK') } catch { /* ignore rollback failure */ }
      throw err
    }

    success(res, { updatedCount: ids.length }, 'Status updated')
  } catch (err: any) { error(res, err.message) }
})

export default router
