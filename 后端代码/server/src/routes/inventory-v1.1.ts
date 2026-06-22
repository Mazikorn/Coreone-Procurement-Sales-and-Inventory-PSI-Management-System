import { Router } from 'express'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { requireRole } from '../middleware/auth.js'
import { buildInventoryConsistencyIssues } from '../utils/inventory-consistency.js'

const router = Router()
const INVENTORY_STATUSES = new Set(['low-stock', 'out-of-stock', 'expired', 'expiring-soon', 'expiring-month'])

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

function rejectInvalidInventoryStatus(res: any, status: unknown) {
  const value = String(status || '').trim()
  if (value && !INVENTORY_STATUSES.has(value)) {
    error(res, '库存状态筛选无效', 'INVALID_PARAMETER', 400)
    return true
  }
  return false
}

function parseInventoryPagination(query: any) {
  const page = query.page === undefined || query.page === null || query.page === ''
    ? 1
    : Number(query.page)
  const pageSize = query.pageSize === undefined || query.pageSize === null || query.pageSize === ''
    ? 20
    : Number(query.pageSize)
  if (!Number.isInteger(page) || page < 1) {
    return { valid: false, message: 'page 必须为正整数' }
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) {
    return { valid: false, message: 'pageSize 必须为 1-200 的整数' }
  }
  return { valid: true, page, pageSize }
}

function rejectUnknownInventoryFilterSources(db: any, query: any, res: any) {
  const categoryId = String(query?.categoryId || '').trim()
  if (categoryId) {
    const category = db.prepare('SELECT id FROM material_categories WHERE id = ?').get(categoryId)
    if (!category) {
      error(res, '物料分类筛选不存在', 'INVALID_PARAMETER', 400)
      return true
    }
  }

  const locationId = String(query?.locationId || '').trim()
  if (locationId) {
    const location = db.prepare('SELECT id FROM locations WHERE id = ?').get(locationId)
    if (!location) {
      error(res, '库位筛选不存在', 'INVALID_PARAMETER', 400)
      return true
    }
  }

  const materialId = String(query?.materialId || '').trim()
  if (materialId) {
    const material = db.prepare('SELECT id FROM materials WHERE id = ?').get(materialId)
    if (!material) {
      error(res, '物料筛选不存在', 'INVALID_PARAMETER', 400)
      return true
    }
  }

  return false
}

function formatBatchMovementLabel(type: string, quantityDelta: number) {
  if (type === 'inbound') return '采购入库'
  if (type === 'transfer') return quantityDelta < 0 ? '调拨转出' : '调拨转入'
  if (type === 'outbound' || type === 'outbound_edit') return quantityDelta < 0 ? '出库扣减' : '出库恢复'
  if (type === 'outbound_delete') return '撤销出库恢复'
  if (type === 'return') return quantityDelta > 0 ? '退库恢复' : '撤销退库扣减'
  if (type === 'scrap') return quantityDelta < 0 ? '报废扣减' : '撤销报废恢复'
  if (type === 'supplier_return') return quantityDelta < 0 ? '供应商退货扣减' : '供应商退货恢复'
  if (type === 'stocktaking') return '盘点调整'
  return quantityDelta < 0 ? '库存扣减' : '库存增加'
}

function getBatchSubQuery(field: string): string {
  return `(SELECT b.${field} FROM batches b WHERE b.material_id = i.material_id AND b.status = 1 AND b.remaining > 0 ORDER BY b.expiry_date ASC LIMIT 1)`
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

router.get('/batches/:batchId/trace', (req, res) => {
  try {
    const { batchId } = req.params
    const db = getDatabase()

    const batch = db.prepare(`
      SELECT
        b.id,
        b.material_id,
        b.batch_no,
        b.quantity,
        b.remaining,
        b.production_date,
        b.expiry_date,
        b.inbound_id,
        b.inbound_price,
        b.status,
        b.created_at,
        b.updated_at,
        m.code as material_code,
        m.name as material_name,
        m.unit,
        i.inbound_no,
        i.type as inbound_type,
        i.quantity as inbound_quantity,
        i.price as inbound_price_actual,
        i.location_id as inbound_location_id,
        i.operator as inbound_operator,
        i.created_at as inbound_created_at,
        s.name as supplier_name,
        l.name as inbound_location_name
      FROM batches b
      JOIN materials m ON b.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN inbound_records i ON b.inbound_id = i.id AND i.is_deleted = 0
      LEFT JOIN suppliers s ON COALESCE(i.supplier_id, b.supplier_id) = s.id AND s.is_deleted = 0
      LEFT JOIN locations l ON i.location_id = l.id AND l.is_deleted = 0
      WHERE b.id = ?
    `).get(batchId) as any

    if (!batch) { error(res, 'Batch not found', 'NOT_FOUND', 404); return }

    const locationBalances = db.prepare(`
      SELECT
        bl.location_id,
        COALESCE(l.name, bl.location_id) as location_name,
        bl.remaining,
        bl.updated_at
      FROM batch_location_balances bl
      LEFT JOIN locations l ON bl.location_id = l.id AND l.is_deleted = 0
      WHERE bl.batch_id = ? AND bl.remaining > 0
      ORDER BY COALESCE(l.name, bl.location_id)
    `).all(batchId) as any[]

    const adjustments = db.prepare(`
      SELECT
        bla.id,
        bla.related_type,
        bla.related_id,
        bla.quantity_delta,
        bla.created_at,
        COALESCE(l.name, bla.location_id) as location_name,
        COALESCE(
          bla.operator,
          ir.operator,
          obr.operator,
          st.operator,
          rr.operator,
          sr.operator,
          scr.operator
        ) as operator
      FROM batch_location_adjustments bla
      LEFT JOIN locations l ON bla.location_id = l.id AND l.is_deleted = 0
      LEFT JOIN inbound_records ir ON ir.id = bla.related_id
        AND bla.related_type IN ('inbound', 'transfer', 'transfer_cancel')
        AND ir.is_deleted = 0
      LEFT JOIN outbound_records obr ON obr.id = bla.related_id
        AND bla.related_type = 'outbound'
        AND obr.is_deleted = 0
      LEFT JOIN stocktaking_records st ON st.id = bla.related_id
        AND bla.related_type IN ('stocktaking', 'stocktaking_cancel')
        AND st.is_deleted = 0
      LEFT JOIN return_records rr ON rr.id = bla.related_id
        AND bla.related_type IN ('return', 'return_cancel')
        AND rr.is_deleted = 0
      LEFT JOIN supplier_returns sr ON sr.id = bla.related_id
        AND bla.related_type = 'supplier_return'
        AND sr.is_deleted = 0
      LEFT JOIN scrap_records scr ON scr.id = bla.related_id
        AND bla.related_type = 'scrap'
        AND scr.is_deleted = 0
      WHERE bla.batch_id = ?
      ORDER BY bla.created_at ASC, bla.id ASC
    `).all(batchId) as any[]

    const movements = [
      ...(batch.inbound_id ? [{
        id: `inbound-${batch.inbound_id}`,
        type: 'inbound',
        label: formatBatchMovementLabel('inbound', Number(batch.inbound_quantity || batch.quantity || 0)),
        relatedType: 'inbound',
        relatedId: batch.inbound_id,
        documentNo: batch.inbound_no || batch.inbound_id,
        quantityDelta: Number(batch.inbound_quantity || batch.quantity || 0),
        locationName: batch.inbound_location_name || batch.inbound_location_id || '-',
        operator: batch.inbound_operator || '-',
        createdAt: batch.inbound_created_at || batch.created_at,
      }] : []),
      ...adjustments.map((row: any) => {
        const quantityDelta = Number(row.quantity_delta || 0)
        return {
          id: row.id,
          type: row.related_type,
          label: formatBatchMovementLabel(row.related_type, quantityDelta),
          relatedType: row.related_type,
          relatedId: row.related_id,
          documentNo: row.related_id,
          quantityDelta,
          locationName: row.location_name || '-',
          operator: row.operator || null,
          createdAt: row.created_at,
        }
      }),
    ]

    success(res, {
      batch: {
        id: batch.id,
        materialId: batch.material_id,
        materialCode: batch.material_code,
        materialName: batch.material_name,
        batchNo: batch.batch_no,
        quantity: Number(batch.quantity || 0),
        remaining: Number(batch.remaining || 0),
        unit: batch.unit,
        productionDate: batch.production_date,
        expiryDate: batch.expiry_date,
        inboundId: batch.inbound_id,
        inboundNo: batch.inbound_no || null,
        inboundPrice: Number(batch.inbound_price || batch.inbound_price_actual || 0),
        supplierName: batch.supplier_name || null,
        locationName: batch.inbound_location_name || null,
        operator: batch.inbound_operator || null,
        status: Number(batch.status) === 1 ? 'normal' : 'depleted',
        createdAt: batch.created_at,
        updatedAt: batch.updated_at,
      },
      locationBalances: locationBalances.map((row: any) => ({
        locationId: row.location_id,
        locationName: row.location_name,
        remaining: Number(row.remaining || 0),
        updatedAt: row.updated_at,
      })),
      movements,
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/', (req, res) => {
  try {
    const { status } = req.query
    if (rejectInvalidInventoryStatus(res, status)) return
    const pagination = parseInventoryPagination(req.query)
    if (!pagination.valid) {
      error(res, pagination.message, 'INVALID_PARAMETER', 400)
      return
    }
    const db = getDatabase()
    if (rejectUnknownInventoryFilterSources(db, req.query, res)) return
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
        COALESCE((
          SELECT COUNT(*)
          FROM inventory_locations ilc
          WHERE ilc.material_id = i.material_id AND ilc.stock > 0
        ), CASE WHEN i.location_id IS NOT NULL AND i.stock > 0 THEN 1 ELSE 0 END) as active_location_count,
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
    const page = pagination.page as number
    const pageSize = pagination.pageSize as number
    const offset = (page - 1) * pageSize
    const list = db.prepare(sql).all(locationId, locationId, locationId, locationId, ...params, pageSize, offset) as any[]

    const result = list.map((row: any) => {
      let status: string = 'normal'
      const totalStock = Number(row.total_stock) || 0
      const locationStock = locationId ? Number(row.location_stock) || 0 : totalStock
      const batchStock = row.batch_id ? Number(row.batch_stock) || 0 : null
      const activeLocationCount = Number(row.active_location_count) || 0
      const stock = locationId
        ? (activeLocationCount <= 1 ? (batchStock ?? locationStock) : locationStock)
        : (batchStock ?? totalStock)
      const stockForStatus = locationId ? stock : totalStock
      const minStock = Number(row.min_stock) || 0
      const expiry = row.expiry

      if (stockForStatus <= 0) {
        status = 'out-of-stock'
      } else if (expiry && expiry !== '') {
        const today = new Date().toISOString().slice(0, 10)
        if (expiry <= today) {
          status = 'expired'
        } else if (expiry <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)) {
          status = 'warning'
        }
      }
      if (status === 'normal' && minStock > 0 && stockForStatus <= minStock) {
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

    successList(res, result, page, pageSize, count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/stats', (req, res) => {
  try {
    const db = getDatabase()
    if (rejectUnknownInventoryFilterSources(db, req.query, res)) return
    const { where, params } = buildInventoryWhere(req.query)
    const locationId = typeof req.query.locationId === 'string' ? req.query.locationId : ''
    const stockExpr = locationId
      ? `COALESCE((
          SELECT SUM(il.stock)
          FROM inventory_locations il
          WHERE il.material_id = i.material_id AND il.location_id = ?
        ), CASE WHEN i.location_id = ? THEN i.stock ELSE 0 END)`
      : 'i.stock'
    const stockParams = locationId ? [locationId, locationId] : []
    const activeLocationCountExpr = `COALESCE((
      SELECT COUNT(*)
      FROM inventory_locations ilc
      WHERE ilc.material_id = i.material_id AND ilc.stock > 0
    ), CASE WHEN i.location_id IS NOT NULL AND i.stock > 0 THEN 1 ELSE 0 END)`
    const rowStockExpr = locationId
      ? `CASE
          WHEN ${activeLocationCountExpr} <= 1 THEN COALESCE(b.remaining, ${stockExpr})
          ELSE ${stockExpr}
        END`
      : 'COALESCE(b.remaining, i.stock)'
    const rowStockParams = locationId ? [...stockParams, ...stockParams] : []

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
          ${rowStockExpr} as stock,
          m.min_stock,
          b.expiry_date as expiry
        FROM inventory i
        JOIN materials m ON i.material_id = m.id
        LEFT JOIN batches b ON b.material_id = i.material_id AND b.status = 1 AND b.remaining > 0
        WHERE ${where}
      ) t
    `).get(...rowStockParams, ...params) as any

    const totalMaterials = (db.prepare(`
      SELECT COUNT(*) as c
      FROM inventory i
      JOIN materials m ON i.material_id = m.id
      WHERE ${where}
    `).get(...params) as any)?.c || 0

    const totalStockValue = (db.prepare(`
      SELECT SUM(stock * unit_price) as v
      FROM (
        SELECT
          ${rowStockExpr} as stock,
          COALESCE(b.inbound_price, m.price, 0) as unit_price
        FROM inventory i
        JOIN materials m ON i.material_id = m.id
        LEFT JOIN batches b ON b.material_id = i.material_id AND b.status = 1 AND b.remaining > 0
        WHERE ${where}
      ) t
    `).get(...rowStockParams, ...params) as any)?.v || 0

    const catDist = db.prepare(`
      SELECT m.category_id, COALESCE(c.name, '未分类') as category_name, COUNT(DISTINCT i.material_id) as count
      FROM inventory i
      JOIN materials m ON i.material_id = m.id
      LEFT JOIN material_categories c ON c.id = m.category_id AND c.is_deleted = 0
      WHERE ${where}
      GROUP BY m.category_id, c.name
      ORDER BY count DESC, category_name ASC
    `).all(...params) as any[]

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
