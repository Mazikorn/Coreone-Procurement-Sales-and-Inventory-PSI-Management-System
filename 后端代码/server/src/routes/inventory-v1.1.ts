import { Router } from 'express'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

function buildInventoryWhere(query: any) {
  const { categoryId, locationId, keyword, materialId } = query
  let where = "m.is_deleted = 0"
  const params: any[] = []

  if (materialId) {
    where += ' AND i.material_id = ?'
    params.push(materialId)
  }
  if (keyword) {
    where += `
        AND (
          m.name LIKE ?
          OR m.code LIKE ?
          OR EXISTS (
            SELECT 1 FROM batches b
            WHERE b.material_id = i.material_id
              AND b.status = 1
              AND b.remaining > 0
              AND b.batch_no LIKE ?
          )
          OR EXISTS (
            SELECT 1 FROM suppliers ks
            WHERE ks.id = m.supplier_id
              AND ks.is_deleted = 0
              AND (ks.name LIKE ? OR ks.code LIKE ?)
          )
        )
      `
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`, `%${keyword}%`)
  }
  if (categoryId) { where += ' AND m.category_id = ?'; params.push(categoryId) }
  if (locationId) {
    where += `
      AND COALESCE((
        SELECT SUM(il.stock)
        FROM inventory_locations il
        WHERE il.material_id = i.material_id AND il.location_id = ?
      ), CASE WHEN i.location_id = ? THEN i.stock ELSE 0 END) > 0
    `
    params.push(locationId, locationId)
  }

  return { where, params }
}

function buildInventoryStatusWhere(status: unknown) {
  if (status === 'low-stock') return ' AND i.stock > 0 AND i.stock <= m.min_stock AND m.min_stock > 0'
  if (status === 'out-of-stock') return ' AND i.stock <= 0'
  if (status === 'expired') return " AND b.expiry_date IS NOT NULL AND b.expiry_date != '' AND b.expiry_date <= date('now')"
  if (status === 'expiring-soon') return " AND b.expiry_date IS NOT NULL AND b.expiry_date != '' AND b.expiry_date > date('now') AND b.expiry_date <= date('now', '+7 days')"
  if (status === 'expiring-month') return " AND b.expiry_date IS NOT NULL AND b.expiry_date != '' AND b.expiry_date > date('now') AND b.expiry_date <= date('now', '+30 days')"
  return ''
}

function getBatchSubQuery(field: string): string {
  return `(SELECT b.${field} FROM batches b WHERE b.material_id = i.material_id AND b.status = 1 AND b.remaining > 0 ORDER BY b.expiry_date ASC LIMIT 1)`
}

type ConsistencyIssue = {
  code: string
  severity: 'critical' | 'warning'
  entityType: string
  entityId: string
  entityCode?: string | null
  entityName?: string | null
  message: string
  impacts: Record<string, unknown>
}

function buildInventoryConsistencyIssues(db: any): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const addIssue = (issue: ConsistencyIssue) => issues.push(issue)

  const inactiveMaterials = db.prepare(`
    SELECT m.id, m.code, m.name, COALESCE(i.stock, 0) as stock
    FROM materials m
    JOIN inventory i ON i.material_id = m.id AND i.stock > 0
    WHERE m.is_deleted = 0 AND m.status <> 1
  `).all() as any[]
  inactiveMaterials.forEach(row => addIssue({
    code: 'INACTIVE_MATERIAL_WITH_STOCK',
    severity: 'critical',
    entityType: 'material',
    entityId: row.id,
    entityCode: row.code,
    entityName: row.name,
    message: `停用物料仍有总库存 ${Number(row.stock) || 0}`,
    impacts: { stock: Number(row.stock) || 0 },
  }))

  const invalidBomMaterials = db.prepare(`
    WITH bom_materials AS (
      SELECT bom_id, material_id FROM bom_items
      UNION ALL SELECT bom_id, material_id FROM bom_general_reagents
      UNION ALL SELECT bom_id, material_id FROM bom_general_consumables
      UNION ALL SELECT bom_id, material_id FROM bom_quality_controls
    )
    SELECT b.id, b.code, b.name, COUNT(DISTINCT bm.material_id) as invalid_count
    FROM boms b
    JOIN bom_materials bm ON bm.bom_id = b.id
    LEFT JOIN materials m ON m.id = bm.material_id AND m.is_deleted = 0
    WHERE b.is_deleted = 0
      AND b.status = 1
      AND (m.id IS NULL OR m.status <> 1)
    GROUP BY b.id, b.code, b.name
  `).all() as any[]
  invalidBomMaterials.forEach(row => addIssue({
    code: 'ACTIVE_BOM_INVALID_MATERIAL',
    severity: 'critical',
    entityType: 'bom',
    entityId: row.id,
    entityCode: row.code,
    entityName: row.name,
    message: `启用BOM存在 ${Number(row.invalid_count) || 0} 个停用或已删除物料依赖`,
    impacts: { invalidMaterialCount: Number(row.invalid_count) || 0 },
  }))

  const invalidBomEquipment = db.prepare(`
    SELECT b.id, b.code, b.name,
      SUM(CASE WHEN bet.equipment_id IS NOT NULL AND (e.id IS NULL OR e.status <> 1) THEN 1 ELSE 0 END) as invalid_equipment_count,
      SUM(CASE WHEN bet.equipment_type_id IS NOT NULL AND (et.id IS NULL OR et.status <> 1) THEN 1 ELSE 0 END) as invalid_equipment_type_count
    FROM boms b
    JOIN bom_equipment_templates bet ON bet.bom_id = b.id
    LEFT JOIN equipment e ON e.id = bet.equipment_id
    LEFT JOIN equipment_types et ON et.id = bet.equipment_type_id
    WHERE b.is_deleted = 0 AND b.status = 1
    GROUP BY b.id, b.code, b.name
    HAVING invalid_equipment_count > 0 OR invalid_equipment_type_count > 0
  `).all() as any[]
  invalidBomEquipment.forEach(row => addIssue({
    code: 'ACTIVE_BOM_INVALID_EQUIPMENT',
    severity: 'critical',
    entityType: 'bom',
    entityId: row.id,
    entityCode: row.code,
    entityName: row.name,
    message: '启用BOM存在未启用或不存在的设备依赖',
    impacts: {
      invalidEquipmentCount: Number(row.invalid_equipment_count) || 0,
      invalidEquipmentTypeCount: Number(row.invalid_equipment_type_count) || 0,
    },
  }))

  const invalidProjects = db.prepare(`
    SELECT p.id, p.code, p.name, p.type, p.bom_id, b.code as bom_code, b.name as bom_name, b.type as bom_type, b.status as bom_status, b.is_deleted as bom_deleted
    FROM projects p
    LEFT JOIN boms b ON b.id = p.bom_id
    WHERE p.is_deleted = 0
      AND p.status = 1
      AND p.bom_id IS NOT NULL
      AND (
        b.id IS NULL
        OR b.is_deleted <> 0
        OR b.status <> 1
        OR (b.type <> p.type AND b.type <> 'project')
      )
  `).all() as any[]
  invalidProjects.forEach(row => addIssue({
    code: 'ACTIVE_PROJECT_INVALID_BOM',
    severity: 'critical',
    entityType: 'project',
    entityId: row.id,
    entityCode: row.code,
    entityName: row.name,
    message: '启用检测服务绑定了不可用或类型不匹配的BOM',
    impacts: {
      projectType: row.type,
      bomId: row.bom_id,
      bomCode: row.bom_code || null,
      bomName: row.bom_name || null,
      bomType: row.bom_type || null,
      bomStatus: row.bom_status === undefined || row.bom_status === null ? null : Number(row.bom_status),
      bomDeleted: row.bom_deleted === undefined || row.bom_deleted === null ? null : Number(row.bom_deleted),
    },
  }))

  const invalidLocations = db.prepare(`
    SELECT l.id, l.code, l.name, l.status, l.is_deleted, SUM(il.stock) as stock
    FROM locations l
    JOIN inventory_locations il ON il.location_id = l.id AND il.stock > 0
    WHERE l.status <> 1 OR l.is_deleted <> 0
    GROUP BY l.id, l.code, l.name, l.status, l.is_deleted
  `).all() as any[]
  invalidLocations.forEach(row => {
    const deleted = Number(row.is_deleted) !== 0
    addIssue({
      code: deleted ? 'DELETED_LOCATION_WITH_STOCK' : 'INACTIVE_LOCATION_WITH_STOCK',
      severity: 'critical',
      entityType: 'location',
      entityId: row.id,
      entityCode: row.code,
      entityName: row.name,
      message: deleted ? '已删除库位仍有库位库存明细' : '停用库位仍有库位库存明细',
      impacts: {
        stock: Number(row.stock) || 0,
        status: Number(row.status),
        isDeleted: Number(row.is_deleted),
      },
    })
  })

  const batchMismatches = db.prepare(`
    SELECT i.material_id, m.code, m.name, i.stock, COALESCE(SUM(CASE WHEN b.status = 1 THEN b.remaining ELSE 0 END), 0) as batch_remaining
    FROM inventory i
    JOIN materials m ON m.id = i.material_id AND m.is_deleted = 0
    LEFT JOIN batches b ON b.material_id = i.material_id
    GROUP BY i.material_id, m.code, m.name, i.stock
    HAVING ABS(COALESCE(i.stock, 0) - batch_remaining) > 0.0001
  `).all() as any[]
  batchMismatches.forEach(row => addIssue({
    code: 'INVENTORY_BATCH_MISMATCH',
    severity: 'critical',
    entityType: 'material',
    entityId: row.material_id,
    entityCode: row.code,
    entityName: row.name,
    message: '库存总账与启用批次剩余量汇总不一致',
    impacts: {
      inventoryStock: Number(row.stock) || 0,
      activeBatchRemaining: Number(row.batch_remaining) || 0,
    },
  }))

  const overRemainingBatches = db.prepare(`
    SELECT b.id, b.batch_no, b.quantity, b.remaining, m.code, m.name
    FROM batches b
    JOIN materials m ON m.id = b.material_id AND m.is_deleted = 0
    WHERE b.status = 1
      AND COALESCE(b.remaining, 0) - COALESCE(b.quantity, 0) > 0.0001
  `).all() as any[]
  overRemainingBatches.forEach(row => addIssue({
    code: 'BATCH_REMAINING_EXCEEDS_QUANTITY',
    severity: 'critical',
    entityType: 'batch',
    entityId: row.id,
    entityCode: row.batch_no,
    entityName: row.name,
    message: '批次剩余量超过批次数量',
    impacts: {
      materialCode: row.code,
      quantity: Number(row.quantity) || 0,
      remaining: Number(row.remaining) || 0,
    },
  }))

  const negativeBatches = db.prepare(`
    SELECT b.id, b.batch_no, b.quantity, b.remaining, m.code, m.name
    FROM batches b
    JOIN materials m ON m.id = b.material_id AND m.is_deleted = 0
    WHERE COALESCE(b.quantity, 0) < -0.0001
       OR COALESCE(b.remaining, 0) < -0.0001
  `).all() as any[]
  negativeBatches.forEach(row => addIssue({
    code: 'BATCH_NEGATIVE_QUANTITY_OR_REMAINING',
    severity: 'critical',
    entityType: 'batch',
    entityId: row.id,
    entityCode: row.batch_no,
    entityName: row.name,
    message: '批次数量或剩余量为负数',
    impacts: {
      materialCode: row.code,
      quantity: Number(row.quantity) || 0,
      remaining: Number(row.remaining) || 0,
    },
  }))

  const negativeLocationStocks = db.prepare(`
    SELECT il.id, il.material_id, il.location_id, il.stock, m.code as material_code, m.name as material_name, l.code as location_code, l.name as location_name
    FROM inventory_locations il
    JOIN materials m ON m.id = il.material_id AND m.is_deleted = 0
    LEFT JOIN locations l ON l.id = il.location_id
    WHERE COALESCE(il.stock, 0) < -0.0001
  `).all() as any[]
  negativeLocationStocks.forEach(row => addIssue({
    code: 'LOCATION_NEGATIVE_STOCK',
    severity: 'critical',
    entityType: 'inventory_location',
    entityId: row.id,
    entityCode: row.location_code || row.location_id,
    entityName: row.location_name || row.material_name,
    message: '库位库存为负数',
    impacts: {
      materialId: row.material_id,
      materialCode: row.material_code,
      locationId: row.location_id,
      stock: Number(row.stock) || 0,
    },
  }))

  const locationMismatches = db.prepare(`
    SELECT i.material_id, m.code, m.name, i.stock, COALESCE(SUM(il.stock), 0) as location_stock
    FROM inventory i
    JOIN materials m ON m.id = i.material_id AND m.is_deleted = 0
    LEFT JOIN inventory_locations il ON il.material_id = i.material_id
    GROUP BY i.material_id, m.code, m.name, i.stock
    HAVING COALESCE(location_stock, 0) > 0
      AND ABS(COALESCE(i.stock, 0) - location_stock) > 0.0001
  `).all() as any[]
  locationMismatches.forEach(row => addIssue({
    code: 'INVENTORY_LOCATION_MISMATCH',
    severity: 'critical',
    entityType: 'material',
    entityId: row.material_id,
    entityCode: row.code,
    entityName: row.name,
    message: '库存总账与库位库存汇总不一致',
    impacts: {
      inventoryStock: Number(row.stock) || 0,
      locationStock: Number(row.location_stock) || 0,
    },
  }))

  const activeBatchesWithoutInventory = db.prepare(`
    SELECT b.id, b.batch_no, b.material_id, b.remaining, m.code as material_code, m.name as material_name
    FROM batches b
    JOIN materials m ON m.id = b.material_id AND m.is_deleted = 0
    LEFT JOIN inventory i ON i.material_id = b.material_id
    WHERE b.status = 1
      AND COALESCE(b.remaining, 0) > 0.0001
      AND i.material_id IS NULL
  `).all() as any[]
  activeBatchesWithoutInventory.forEach(row => addIssue({
    code: 'ACTIVE_BATCH_WITHOUT_INVENTORY',
    severity: 'critical',
    entityType: 'batch',
    entityId: row.id,
    entityCode: row.batch_no,
    entityName: row.material_name,
    message: '启用批次仍有剩余量但库存总账缺失',
    impacts: {
      materialId: row.material_id,
      materialCode: row.material_code,
      remaining: Number(row.remaining) || 0,
    },
  }))

  const locationStocksWithoutInventory = db.prepare(`
    SELECT il.id, il.material_id, il.location_id, il.stock, m.code as material_code, m.name as material_name, l.code as location_code, l.name as location_name
    FROM inventory_locations il
    JOIN materials m ON m.id = il.material_id AND m.is_deleted = 0
    LEFT JOIN inventory i ON i.material_id = il.material_id
    LEFT JOIN locations l ON l.id = il.location_id
    WHERE COALESCE(il.stock, 0) > 0.0001
      AND i.material_id IS NULL
  `).all() as any[]
  locationStocksWithoutInventory.forEach(row => addIssue({
    code: 'LOCATION_STOCK_WITHOUT_INVENTORY',
    severity: 'critical',
    entityType: 'inventory_location',
    entityId: row.id,
    entityCode: row.location_code || row.location_id,
    entityName: row.location_name || row.material_name,
    message: '库位库存仍有数量但库存总账缺失',
    impacts: {
      materialId: row.material_id,
      materialCode: row.material_code,
      locationId: row.location_id,
      stock: Number(row.stock) || 0,
    },
  }))

  return issues
}

router.get('/consistency-check', requireRole('admin', 'warehouse_manager'), (req, res) => {
  try {
    const db = getDatabase()
    const issues = buildInventoryConsistencyIssues(db)
    const criticalCount = issues.filter(issue => issue.severity === 'critical').length
    const warningCount = issues.filter(issue => issue.severity === 'warning').length
    success(res, {
      summary: {
        issueCount: issues.length,
        criticalCount,
        warningCount,
      },
      issues,
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/', (req, res) => {
  try {
    let { page = 1, pageSize = 20, status } = req.query
    page = Math.max(1, Number(page) || 1)
    pageSize = Math.max(1, Math.min(200, Number(pageSize) || 20))
    const db = getDatabase()
    const { where, params } = buildInventoryWhere(req.query)
    const statusWhere = buildInventoryStatusWhere(status)
    const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : ''

    const countSql = `
      SELECT COUNT(*) as total
      FROM inventory i
      JOIN materials m ON i.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN batches b ON b.material_id = i.material_id AND b.status = 1 AND b.remaining > 0
      WHERE ${where}${statusWhere}
    `
    const count = (db.prepare(countSql).get(...params) as any)?.total || 0

    const sql = `
      SELECT
        i.material_id, i.stock as total_stock,
        COALESCE(il.location_id, i.location_id) as location_id,
        COALESCE(il.stock, CASE WHEN i.location_id = ? THEN i.stock ELSE 0 END) as location_stock,
        m.code, m.name, m.spec, m.unit, m.min_stock, m.max_stock,
        m.category_id, m.supplier_id,
        s.name as supplier_name,
        l.name as location_name,
        b.id as batch_id,
        b.batch_no,
        b.remaining as batch_stock,
        b.expiry_date as expiry,
        COALESCE(b.updated_at, i.update_time) as sort_time
      FROM inventory i
      JOIN materials m ON i.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN inventory_locations il ON il.material_id = i.material_id
        AND ((? = '' AND il.location_id = i.location_id) OR (? != '' AND il.location_id = ?))
      LEFT JOIN batches b ON b.material_id = i.material_id AND b.status = 1 AND b.remaining > 0
      LEFT JOIN locations l ON COALESCE(il.location_id, i.location_id) = l.id AND l.is_deleted = 0
      LEFT JOIN suppliers s ON m.supplier_id = s.id AND s.is_deleted = 0
      WHERE ${where}${statusWhere}
      ORDER BY i.update_time DESC,
        CASE WHEN b.expiry_date IS NULL OR b.expiry_date = '' THEN 1 ELSE 0 END,
        b.expiry_date ASC,
        b.created_at ASC
      LIMIT ? OFFSET ?
    `
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(sql).all(locationId, locationId, locationId, locationId, ...params, Number(pageSize), offset) as any[]

    const result = list.map((row: any) => {
      let status: string = 'normal'
      const totalStock = Number(row.total_stock) || 0
      const locationStock = locationId ? Number(row.location_stock) || 0 : totalStock
      const batchStock = row.batch_id ? Number(row.batch_stock) || 0 : null
      const stock = locationId ? locationStock : (batchStock ?? totalStock)
      const minStock = Number(row.min_stock) || 0
      const expiry = row.expiry

      if (totalStock <= 0) {
        status = 'out-of-stock'
      } else if (expiry && expiry !== '') {
        const today = new Date().toISOString().slice(0, 10)
        if (expiry <= today) {
          status = 'expired'
        } else if (expiry <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)) {
          status = 'warning'
        }
      }
      if (status === 'normal' && minStock > 0 && totalStock <= minStock) {
        status = 'low-stock'
      }

      return {
        id: `INV-${row.material_id}-${row.batch_id || 'default'}`,
        materialId: row.material_id,
        batchId: row.batch_id || null,
        batchNo: row.batch_no || null,
        code: row.code,
        name: row.name,
        spec: row.spec,
        unit: row.unit,
        stock,
        minStock,
        maxStock: row.max_stock,
        availableStock: stock,
        categoryId: row.category_id,
        locationId: row.location_id,
        locationName: row.location_name || '-',
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        status,
        batch: row.batch_no || '-',
        expiry: row.expiry || '-',
        totalStock,
      }
    })

    successList(res, result, Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/stats', (req, res) => {
  try {
    const db = getDatabase()
    const { where, params } = buildInventoryWhere(req.query)

    const batchStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(stock) as total_quantity,
        SUM(CASE
          WHEN stock > min_stock AND (expiry IS NULL OR expiry = '' OR expiry > date('now', '+30 days'))
          THEN 1 ELSE 0
        END) as normal,
        SUM(CASE
          WHEN stock > 0 AND min_stock > 0 AND stock <= min_stock
          THEN 1 ELSE 0
        END) as low_stock,
        SUM(CASE
          WHEN expiry IS NOT NULL AND expiry != '' AND expiry <= date('now', '+7 days') AND expiry > date('now')
          THEN 1 ELSE 0
        END) as expiring_soon,
        SUM(CASE
          WHEN expiry IS NOT NULL AND expiry != '' AND expiry <= date('now', '+30 days') AND expiry > date('now')
          THEN 1 ELSE 0
        END) as expiring,
        SUM(CASE
          WHEN expiry IS NOT NULL AND expiry != '' AND expiry <= date('now')
          THEN 1 ELSE 0
        END) as expired,
        SUM(CASE
          WHEN stock <= 0
          THEN 1 ELSE 0
        END) as out_of_stock
      FROM (
        SELECT
          i.stock,
          m.min_stock,
          ${getBatchSubQuery('expiry_date')} as expiry
        FROM inventory i
        JOIN materials m ON i.material_id = m.id
        WHERE ${where}
      ) t
    `).get(...params) as any

    const totalMaterials = (db.prepare(`
      SELECT COUNT(*) as c
      FROM inventory i
      JOIN materials m ON i.material_id = m.id
      WHERE ${where}
    `).get(...params) as any)?.c || 0

    const totalStockValue = (db.prepare(`
      SELECT SUM(i.stock * COALESCE(m.price, 0)) as v
      FROM inventory i
      JOIN materials m ON i.material_id = m.id
      WHERE ${where}
    `).get(...params) as any)?.v || 0

    const catDist = db.prepare(`
      SELECT c.id as category_id, c.name as category_name, COUNT(m.id) as count
      FROM material_categories c
      LEFT JOIN materials m ON c.id = m.category_id AND m.is_deleted = 0
      WHERE c.is_deleted = 0 AND c.level = 1
      GROUP BY c.id
    `).all() as any[]

    success(res, {
      totalMaterials,
      totalStockValue,
      totalStockCount: Number(batchStats?.total) || 0,
      totalQuantity: Number(batchStats?.total_quantity) || 0,
      normalCount: Number(batchStats?.normal) || 0,
      lowStockCount: Number(batchStats?.low_stock) || 0,
      expiringSoonCount: Number(batchStats?.expiring_soon) || 0,
      expiringCount: Number(batchStats?.expiring) || 0,
      expiredCount: Number(batchStats?.expired) || 0,
      outOfStockCount: Number(batchStats?.out_of_stock) || 0,
      categoryDistribution: catDist.map((c: any) => ({ categoryId: c.category_id, categoryName: c.category_name, count: c.count })),
    })
  } catch (err: any) { error(res, err.message) }
})

export default router
