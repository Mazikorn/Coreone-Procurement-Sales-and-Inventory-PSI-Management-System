import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { allocateBatches, allocateGroupBatches, BatchAllocation, GroupBatchAllocation } from '../utils/allocation.js'
import { consumeInventoryLocationStock, restoreInventoryLocationStock } from '../utils/inventory-locations.js'
import { consumeBatchLocationStockByLocations, getBatchLocationIds, restoreBatchLocationStock } from '../utils/batch-locations.js'
import { logOperation } from '../utils/operation-logger.js'

const router = Router()
const BATCH_RESTORE_EPSILON = 0.000001
const DIRECT_OUTBOUND_TYPES = new Set(['project'])
const OUTBOUND_LIST_TYPES = new Set(['project', 'transfer', 'scrap', 'bom'])
const OUTBOUND_LIST_STATUSES = new Set(['completed', 'pending', 'cancelled'])

import { checkStockAlerts } from '../utils/alertChecker.js'
import { generateNo } from '../utils/generateNo.js'
import { buildBomSourceSnapshot, calculateFeeAmountFromStandard, calculateSlideCostWithFee, getBomPerSampleDriverQty } from '../utils/cost-calculator.js'
import { errorMessage, recordCostException } from '../utils/cost-exceptions.js'
import { writeAuditLog } from '../utils/cost-runs.js'

function generateOutboundNo(): string {
  return generateNo('OB')
}

function validateOutboundBatchRestoreCapacity(
  db: any,
  items: any[],
  conflictMessage = '批次数量已被后续业务调整，无法删除出库记录',
) {
  const quantityByBatch = new Map<string, { batchId: string; materialId: string; quantity: number }>()
  for (const item of items) {
    if (!item.batch_id) continue
    const batchId = String(item.batch_id)
    const materialId = String(item.material_id)
    const key = `${batchId}:${materialId}`
    const current = quantityByBatch.get(key) || { batchId, materialId, quantity: 0 }
    current.quantity += Number(item.quantity || 0)
    quantityByBatch.set(key, current)
  }

  for (const restore of quantityByBatch.values()) {
    const batch = db.prepare('SELECT id, quantity, remaining FROM batches WHERE id = ? AND material_id = ?')
      .get(restore.batchId, restore.materialId) as any
    if (!batch) {
      return { ok: false, status: 409, code: 'BATCH_NOT_FOUND', message: '出库批次不存在，无法恢复批次库存' }
    }

    const nextRemaining = Number(batch.remaining || 0) + restore.quantity
    const batchQuantity = Number(batch.quantity || 0)
    if (nextRemaining - batchQuantity > BATCH_RESTORE_EPSILON) {
      return { ok: false, status: 409, code: 'BATCH_RESTORE_CONFLICT', message: conflictMessage }
    }
  }

  return { ok: true }
}

function validateDirectOutboundReferences(db: any, refs: { projectId?: unknown; items?: unknown; requireProject?: boolean }) {
  const projectId = String(refs.projectId || '').trim()
  if (refs.requireProject && !projectId) {
    return { ok: false, status: 400, message: '检测项目必填，普通出库必须归属到项目', code: 'INVALID_PARAMETER' }
  }
  if (projectId) {
    const project = db.prepare('SELECT id, status FROM projects WHERE id = ? AND is_deleted = 0').get(projectId) as any
    if (!project) return { ok: false, status: 404, message: '检测项目不存在', code: 'NOT_FOUND' }
    if (Number(project.status) !== 1) {
      return { ok: false, status: 409, message: '停用检测项目不能用于出库', code: 'CONFLICT' }
    }
  }

  const items = Array.isArray(refs.items) ? refs.items : []
  for (const item of items) {
    const materialId = String(item?.materialId || '').trim()
    if (!materialId) return { ok: false, status: 400, message: '出库物料不能为空', code: 'INVALID_PARAMETER' }

    const material = db.prepare('SELECT id, status FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
    if (!material) return { ok: false, status: 404, message: '出库物料不存在', code: 'NOT_FOUND' }
    if (Number(material.status) !== 1) {
      return { ok: false, status: 409, message: '停用物料不能用于出库', code: 'CONFLICT' }
    }
  }

  return { ok: true }
}

function validateOutboundItems(items: any) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, message: '缺少必填字段' }
  }
  for (const item of items) {
    const quantity = Number(item?.quantity)
    if (!item?.materialId || item.quantity === undefined || item.quantity === null || !Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, message: 'Invalid quantity' }
    }
    const usage = String(item?.usage || 'self').trim()
    if (!['self', 'external'].includes(usage)) {
      return { ok: false, message: '出库用途无效' }
    }
    const receiver = typeof item?.receiver === 'string' ? item.receiver.trim() : ''
    if (usage === 'external' && !receiver) {
      return { ok: false, message: '外给出库必须填写接收方' }
    }
  }
  return { ok: true }
}

function validateDirectOutboundType(type: unknown) {
  const normalizedType = String(type || '').trim()
  if (normalizedType === 'transfer') {
    return { ok: false, message: '调拨出库请通过调拨管理入口处理' }
  }
  if (normalizedType === 'scrap') {
    return { ok: false, message: '报废出库请通过报废管理入口处理' }
  }
  if (!DIRECT_OUTBOUND_TYPES.has(normalizedType)) {
    return { ok: false, message: '出库类型无效' }
  }
  return { ok: true, type: normalizedType }
}

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function parseOutboundDateRange(query: any) {
  const startDate = query.startDate === undefined ? '' : String(query.startDate).trim()
  const endDate = query.endDate === undefined ? '' : String(query.endDate).trim()

  if (startDate && !isValidDateOnly(startDate)) {
    return { error: '日期格式必须为 YYYY-MM-DD' }
  }
  if (endDate && !isValidDateOnly(endDate)) {
    return { error: '日期格式必须为 YYYY-MM-DD' }
  }
  if (startDate && endDate && startDate > endDate) {
    return { error: '开始日期不能晚于结束日期' }
  }

  return { startDate, endDate }
}

function validateOutboundListFilters(db: any, filters: { projectId?: unknown; materialId?: unknown; status?: unknown; type?: unknown }) {
  const status = filters.status === undefined ? '' : String(filters.status).trim()
  const type = filters.type === undefined ? '' : String(filters.type).trim()
  const projectId = filters.projectId === undefined ? '' : String(filters.projectId).trim()
  const materialId = filters.materialId === undefined ? '' : String(filters.materialId).trim()

  if (status && !OUTBOUND_LIST_STATUSES.has(status)) {
    return { ok: false, message: '出库状态筛选无效' }
  }
  if (type && !OUTBOUND_LIST_TYPES.has(type)) {
    return { ok: false, message: '出库类型筛选无效' }
  }
  if (projectId) {
    const project = db.prepare('SELECT id FROM projects WHERE id = ? AND is_deleted = 0').get(projectId)
    if (!project) return { ok: false, message: '检测项目筛选不存在' }
  }
  if (materialId) {
    const material = db.prepare('SELECT id FROM materials WHERE id = ? AND is_deleted = 0').get(materialId)
    if (!material) return { ok: false, message: '物料筛选不存在' }
  }

  return { ok: true }
}

function normalizeOptionalSampleCount(value: unknown) {
  if (value === undefined || value === null || value === '') return { ok: true, sampleCount: 1 }
  const sampleCount = Number(value)
  if (!Number.isFinite(sampleCount) || sampleCount <= 0) {
    return { ok: false, message: 'Invalid sampleCount' }
  }
  return { ok: true, sampleCount }
}

function validateBomOutboundMaterials(db: any, bomId: string) {
  const groups = [
    { table: 'bom_items', label: '特异性试剂' },
    { table: 'bom_general_reagents', label: '通用试剂' },
    { table: 'bom_general_consumables', label: '通用耗材' },
    { table: 'bom_quality_controls', label: '质控品' },
  ]

  for (const group of groups) {
    const rows = db.prepare(`
      SELECT bi.material_id, m.status, m.is_deleted
      FROM ${group.table} bi
      LEFT JOIN materials m ON bi.material_id = m.id
      WHERE bi.bom_id = ?
    `).all(bomId) as any[]

    for (const row of rows) {
      if (!row.material_id || row.is_deleted === null || row.is_deleted === undefined || Number(row.is_deleted) !== 0) {
        return { ok: false, status: 409, message: `${group.label}包含不存在或已删除物料，不能执行BOM出库`, code: 'CONFLICT' }
      }
      if (Number(row.status) !== 1) {
        return { ok: false, status: 409, message: `${group.label}包含已停用物料，不能执行BOM出库`, code: 'CONFLICT' }
      }
    }
  }

  return { ok: true }
}

router.get('/', (req, res) => {
  try {
    let { page = 1, pageSize = 20, projectId, status, keyword, materialId, type, startDate, endDate } = req.query
    page = Math.max(1, Number(page) || 1)
    pageSize = Math.max(1, Math.min(100, Number(pageSize) || 20))
    const dateRange = parseOutboundDateRange(req.query)
    if (dateRange.error) {
      error(res, dateRange.error, 'INVALID_PARAMETER', 400)
      return
    }
    startDate = dateRange.startDate
    endDate = dateRange.endDate
    const db = getDatabase()
    const filterValidation = validateOutboundListFilters(db, { projectId, materialId, status, type })
    if (!filterValidation.ok) {
      error(res, filterValidation.message, 'INVALID_PARAMETER', 400)
      return
    }
    let where = 'r.is_deleted = 0'
    const params: any[] = []
    if (projectId) { where += ' AND r.project_id = ?'; params.push(projectId) }
    if (status) { where += ' AND r.status = ?'; params.push(status) }
    if (type) { where += ' AND r.type = ?'; params.push(type) }
    if (startDate) { where += ' AND r.created_at >= ?'; params.push(startDate) }
    if (endDate) { where += ' AND r.created_at <= ?'; params.push(`${endDate}T23:59:59`) }
    if (keyword) {
      where += ` AND (r.outbound_no LIKE ? OR EXISTS (
        SELECT 1 FROM outbound_items oi JOIN materials m ON oi.material_id = m.id
        WHERE oi.outbound_id = r.id AND m.is_deleted = 0 AND m.name LIKE ?
      ))`
      params.push(`%${keyword}%`, `%${keyword}%`)
    }
    if (materialId) {
      where += ` AND EXISTS (
        SELECT 1 FROM outbound_items oi WHERE oi.outbound_id = r.id AND oi.material_id = ?
      )`
      params.push(materialId)
    }

    const count = (db.prepare(`SELECT COUNT(*) as total FROM outbound_records r WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)

    const records = db.prepare(`
      SELECT r.*, p.name as project_name
      FROM outbound_records r
      LEFT JOIN projects p ON r.project_id = p.id AND p.is_deleted = 0
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), offset) as any[]

    // 批量查询 items，避免 N+1
    const recordIds = records.map((r: any) => r.id)
    const itemsMap = new Map<string, any[]>()
    if (recordIds.length > 0) {
      const placeholders = recordIds.map(() => '?').join(',')
      const allItems = db.prepare(
        `SELECT oi.*, m.name as material_name FROM outbound_items oi
         LEFT JOIN materials m ON oi.material_id = m.id AND m.is_deleted = 0
         WHERE oi.outbound_id IN (${placeholders})`
      ).all(...recordIds) as any[]
      for (const item of allItems) {
        if (!itemsMap.has(item.outbound_id)) itemsMap.set(item.outbound_id, [])
        itemsMap.get(item.outbound_id)!.push(item)
      }
    }

    const result = records.map((r: any) => {
      const items = itemsMap.get(r.id) || []
      return {
        id: r.id, outboundNo: r.outbound_no, type: r.type, projectId: r.project_id,
        projectName: r.project_name, sampleCount: r.sample_count,
        items: items.map((i: any) => ({
          id: i.id, materialId: i.material_id, materialName: i.material_name,
          batchId: i.batch_id, batchNo: i.batch_no, quantity: i.quantity, unit: i.unit,
          unitCost: i.unit_cost, totalCost: i.total_cost,
          usage: i.usage || 'self', receiver: i.receiver || null,
        })),
        totalCost: r.total_cost, operator: r.operator, status: r.status,
        costStatus: r.cost_status || 'pending_cost',
        caseNo: r.case_no || null,
        remark: r.remark, createdAt: r.created_at,
        abcTotalCost: r.abc_total_cost || 0, abcActivityCost: r.abc_activity_cost || 0,
        feeAmount: r.fee_amount || 0, profit: r.profit || 0,
      }
    })

    successList(res, result, Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/stats', (req, res) => {
  try {
    const db = getDatabase()
    const today = new Date().toISOString().slice(0, 10)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const total = (db.prepare("SELECT COUNT(*) as c FROM outbound_records WHERE is_deleted = 0").get() as any)?.c || 0
    const monthTotal = (db.prepare("SELECT COUNT(*) as c FROM outbound_records WHERE is_deleted = 0 AND created_at >= ?").get(monthStart) as any)?.c || 0
    const completed = (db.prepare("SELECT COUNT(*) as c FROM outbound_records WHERE is_deleted = 0 AND status = 'completed'").get() as any)?.c || 0
    const pending = (db.prepare("SELECT COUNT(*) as c FROM outbound_records WHERE is_deleted = 0 AND status = 'pending'").get() as any)?.c || 0
    const cancelled = (db.prepare("SELECT COUNT(*) as c FROM outbound_records WHERE is_deleted = 0 AND status = 'cancelled'").get() as any)?.c || 0
    const totalCost = (db.prepare("SELECT COALESCE(SUM(total_cost),0) as c FROM outbound_records WHERE is_deleted = 0 AND status = 'completed'").get() as any)?.c || 0
    const quickCounts = {
      all: total,
      today: (db.prepare("SELECT COUNT(*) as c FROM outbound_records WHERE is_deleted = 0 AND created_at >= ?").get(today) as any)?.c || 0,
      week: (db.prepare("SELECT COUNT(*) as c FROM outbound_records WHERE is_deleted = 0 AND created_at >= ?").get(weekAgo) as any)?.c || 0,
      month: monthTotal,
    }
    success(res, { total, monthTotal, completed, pending, cancelled, totalCost, quickCounts })
  } catch (err: any) { error(res, err.message) }
})

router.post('/', requireWriteAccess, (req, res) => {
  try {
    const { type, projectId, items, remark } = req.body
    if (!type) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }
    const typeValidation = validateDirectOutboundType(type)
    if (!typeValidation.ok) {
      error(res, typeValidation.message, 'INVALID_PARAMETER', 400); return
    }
    const itemValidation = validateOutboundItems(items)
    if (!itemValidation.ok) {
      error(res, itemValidation.message, 'INVALID_PARAMETER', 400); return
    }
    const sampleCountValidation = normalizeOptionalSampleCount(req.body.sampleCount)
    if (!sampleCountValidation.ok) {
      error(res, sampleCountValidation.message, 'INVALID_PARAMETER', 400); return
    }

    const db = getDatabase()
    const outboundNo = generateOutboundNo()
    const id = uuidv4()
    const operator = (req as any).user?.username || 'system'
    const sc = sampleCountValidation.sampleCount

    const normalizedProjectId = String(projectId || '').trim()
    const refValidation = validateDirectOutboundReferences(db, { projectId: normalizedProjectId, items, requireProject: true })
    if (!refValidation.ok) {
      error(res, refValidation.message, refValidation.code, refValidation.status)
      return
    }

    const materialUnits = db.prepare('SELECT id, unit FROM materials WHERE status = 1 AND is_deleted = 0 AND id IN (' + items.map(() => '?').join(',') + ')').all(...items.map((i: any) => i.materialId)) as any[]
    const unitMap = new Map(materialUnits.map((m: any) => [m.id, m.unit]))

    let totalCost = 0

    db.exec('BEGIN IMMEDIATE')
    try {
      const itemAllocations: Array<{
        materialId: string
        quantity: number
        usage: string
        receiver: string | null
        allocations: BatchAllocation[]
        itemTotalCost: number
      }> = []

      for (const item of items) {
        const { materialId, quantity, batchId } = item
        const qty = Number(quantity)
        const allocations = allocateBatches(db, materialId, qty, typeof batchId === 'string' ? batchId.trim() : undefined)
        const itemTotalCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0)
        totalCost += itemTotalCost

        itemAllocations.push({
          materialId,
          quantity: qty,
          usage: String(item.usage || 'self').trim(),
          receiver: typeof item.receiver === 'string' ? item.receiver.trim() || null : null,
          allocations,
          itemTotalCost,
        })
      }

      db.prepare(`
        INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, operator, status, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'completed', ?)
      `).run(id, outboundNo, typeValidation.type, normalizedProjectId, totalCost, sc, operator, remark || null)

      for (const ia of itemAllocations) {
        for (const alloc of ia.allocations) {
          const itemId = uuidv4()
          const subtotal = alloc.quantity * alloc.unitCost

          // 保存 beforeStock（在 UPDATE 之前）
          const beforeStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(ia.materialId) as any)?.stock || 0

          db.prepare(`
            INSERT INTO outbound_items (id, outbound_id, material_id, batch_id, batch_no, quantity, unit, unit_cost, total_cost, usage, receiver)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(itemId, id, ia.materialId, alloc.batchId, alloc.batchNo, alloc.quantity, unitMap.get(ia.materialId) || 'pcs', alloc.unitCost, subtotal, ia.usage, ia.receiver)

          db.prepare(`
            UPDATE inventory
            SET stock = stock - ?,
                last_outbound_id = ?,
                last_outbound_date = date('now','localtime'),
                update_time = CURRENT_TIMESTAMP
            WHERE material_id = ?
          `).run(alloc.quantity, id, ia.materialId)
          const batchLocationIds = alloc.batchId ? getBatchLocationIds(db, alloc.batchId, ia.materialId) : []
          const consumedLocations = consumeInventoryLocationStock(
            db,
            ia.materialId,
            alloc.quantity,
            { relatedType: 'outbound', relatedId: id },
            { preferredLocationIds: batchLocationIds },
          )

          if (alloc.batchId) {
            consumeBatchLocationStockByLocations(db, alloc.batchId, ia.materialId, consumedLocations, { relatedType: 'outbound', relatedId: id, operator })
            db.prepare('UPDATE batches SET remaining = remaining - ? WHERE id = ?').run(alloc.quantity, alloc.batchId)
            const batchRemaining = (db.prepare('SELECT remaining FROM batches WHERE id = ?').get(alloc.batchId) as any)?.remaining
            if (batchRemaining <= 0) {
              db.prepare('UPDATE batches SET status = 0 WHERE id = ?').run(alloc.batchId)
            }
          }

          if (ia.usage === 'self' && alloc.batchId) {
            const mat = db.prepare('SELECT name, spec FROM materials WHERE id = ? AND is_deleted = 0').get(ia.materialId) as any
            const trkId = uuidv4()
            const today = new Date().toISOString().split('T')[0]
            db.prepare(`
              INSERT INTO batch_usage_tracking
              (id, material_id, material_name, batch, spec, total_qty, remaining, unit, start_date, days_used, expected_days, progress, usage, receiver, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, 'in-use', datetime('now'), datetime('now'))
            `).run(trkId, ia.materialId, mat?.name || '', alloc.batchNo || '', mat?.spec || '', alloc.quantity, alloc.quantity, unitMap.get(ia.materialId) || 'pcs', today, 30, 'self', ia.receiver)
          }

          const logId = uuidv4()
          const afterStock = beforeStock - alloc.quantity
          db.prepare(`
            INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator)
            VALUES (?, 'outbound', ?, ?, ?, ?, ?, 'outbound', ?)
          `).run(logId, ia.materialId, -alloc.quantity, beforeStock, afterStock, id, operator)
        }
      }

      db.exec('COMMIT')

      // 自动检查库存预警（出库后库存可能不足）
      const outboundMaterialIds = itemAllocations.map((ia: any) => ia.materialId)
      checkStockAlerts(db, [...new Set(outboundMaterialIds)])
      logOperation(db, req as any, {
        operation: 'POST /outbound',
        description: `创建普通出库记录 ${id}`,
        requestData: { type: typeValidation.type, projectId: normalizedProjectId, items, remark: remark || null, sampleCount: sc },
        responseData: { id, outboundNo, type: typeValidation.type, projectId: normalizedProjectId, totalCost, status: 'completed' },
      })
    } catch (err: any) {
      db.exec('ROLLBACK')
      if (err.message && (err.message.includes('批次库存不足') || err.message.includes('指定出库批次'))) {
        error(res, err.message, 'STOCK_INSUFFICIENT', 422); return
      }
      throw err
    }

    success(res, { id, outboundNo, type, projectId: normalizedProjectId, totalCost, status: 'completed', createdAt: new Date().toISOString() }, 'Outbound created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.post('/bom', (req, res) => {
  try {
    const { projectId, bomId, sampleCount, caseNo, remark } = req.body
    const normalizedCaseNo = String(caseNo || '').trim()
    const requestedBomId = String(bomId || '').trim()
    if ((!projectId && !normalizedCaseNo) || sampleCount === undefined || sampleCount === null) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }
    const sc = Number(sampleCount)
    if (!Number.isFinite(sc) || sc <= 0) {
      error(res, 'Invalid sampleCount', 'INVALID_PARAMETER', 400); return
    }

    const db = getDatabase()
    const outboundNo = generateOutboundNo()
    const id = uuidv4()
    const operator = (req as any).user?.username || 'system'

    const lisCase = normalizedCaseNo
      ? db.prepare(`
        SELECT lc.*, p.name as joined_project_name, p.bom_id as joined_bom_id
        FROM lis_cases lc
        LEFT JOIN projects p ON lc.project_id = p.id AND p.is_deleted = 0
        WHERE lc.case_no = ?
      `).get(normalizedCaseNo) as any
      : null
    const effectiveProjectId = projectId || lisCase?.project_id || null
    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND is_deleted = 0').get(effectiveProjectId) as any
    if (!project) { error(res, 'Project not found', 'NOT_FOUND', 404); return }
    if (Number(project.status) !== 1) {
      error(res, '停用检测服务不能执行标准BOM出库', 'CONFLICT', 409); return
    }
    const configuredBomId = lisCase?.joined_bom_id || project.bom_id
    const effectiveBomId = requestedBomId || configuredBomId
    if (!effectiveBomId) { error(res, '该病例关联项目未配置BOM，不能执行标准BOM出库', 'MISSING_BOM', 422); return }
    if (requestedBomId && configuredBomId && requestedBomId !== configuredBomId) {
      error(res, '所选BOM与项目配置不一致', 'BOM_PROJECT_MISMATCH', 422); return
    }
    const bom = db.prepare('SELECT id, type, status FROM boms WHERE id = ? AND is_deleted = 0').get(effectiveBomId) as any
    if (!bom) { error(res, 'BOM not found', 'NOT_FOUND', 404); return }
    if (Number(bom.status) !== 1) {
      error(res, '停用BOM不能执行标准BOM出库', 'CONFLICT', 409); return
    }
    if (bom.type !== project.type && bom.type !== 'project') {
      error(res, '所选BOM类型与检测服务类型不一致', 'BOM_PROJECT_TYPE_MISMATCH', 422); return
    }

    const bomMaterialValidation = validateBomOutboundMaterials(db, effectiveBomId)
    if (!bomMaterialValidation.ok) {
      error(res, bomMaterialValidation.message, bomMaterialValidation.code, bomMaterialValidation.status)
      return
    }

    const bomItems = db.prepare(`
      SELECT bi.*, m.name, m.spec FROM bom_items bi
      JOIN materials m ON bi.material_id = m.id AND m.is_deleted = 0
      WHERE bi.bom_id = ?
    `).all(effectiveBomId) as any[]
    if (!bomItems || bomItems.length === 0) {
      error(res, 'BOM is empty', 'INVALID_PARAMETER', 400); return
    }

    // 按 group_name 分组（无 group_name 的按 material_id 单独成组）
    const groupMap = new Map<string, any[]>()
    for (const item of bomItems) {
      const groupKey = item.group_name || `_single_${item.material_id}`
      if (!groupMap.has(groupKey)) groupMap.set(groupKey, [])
      groupMap.get(groupKey)!.push(item)
    }

    const materialUnits = db.prepare('SELECT id, unit FROM materials WHERE id IN (' + bomItems.map(() => '?').join(',') + ')').all(...bomItems.map((i: any) => i.material_id)) as any[]
    const unitMap = new Map(materialUnits.map((m: any) => [m.id, m.unit]))

    let totalCost = 0

    db.exec('BEGIN IMMEDIATE')
    try {
      const itemAllocations: Array<{
        materialId: string
        quantity: number
        allocations: GroupBatchAllocation[]
        itemTotalCost: number
      }> = []

      for (const [, groupItems] of groupMap) {
        const firstItem = groupItems[0]
        const quantity = firstItem.usage_per_sample * sc
        if (quantity <= 0) continue

        let allocations: GroupBatchAllocation[]
        if (groupItems.length === 1) {
          // 单物料（无品牌池），使用原有逻辑
          allocations = allocateBatches(db, firstItem.material_id, quantity).map(a => ({
            ...a,
            materialId: firstItem.material_id,
          }))
        } else {
          // 品牌池：在组内多物料间按 FEFO 分配
          allocations = allocateGroupBatches(db, groupItems, quantity)
        }

        const itemTotalCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0)
        totalCost += itemTotalCost

        itemAllocations.push({
          materialId: firstItem.material_id,
          quantity,
          allocations,
          itemTotalCost,
        })
      }

      // 处理扩展配额：通用试剂
      const generalReagents = db.prepare(`
        SELECT gr.*, m.name, m.spec FROM bom_general_reagents gr
        JOIN materials m ON gr.material_id = m.id AND m.is_deleted = 0
        WHERE gr.bom_id = ?
      `).all(effectiveBomId) as any[]
      // P1-01：通用试剂/耗材/质控品库存不足时「跳过、不阻断出库」（BR-OB-022/023/024），
      // 仅核心特异性试剂(bom_items)缺货才整单回滚。跳过项记入 skippedAux 并写进出库备注，保持可追溯。
      const skippedAux: string[] = []
      for (const gr of generalReagents) {
        const quantity = (gr.usage_per_sample || 0) * sc
        if (quantity <= 0) continue
        let allocations
        try {
          allocations = allocateBatches(db, gr.material_id, quantity).map(a => ({ ...a, materialId: gr.material_id }))
        } catch (e: any) {
          if (e?.message?.includes('批次库存不足')) { skippedAux.push(`通用试剂 ${gr.name || gr.material_id}`); continue }
          throw e
        }
        const itemTotalCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0)
        totalCost += itemTotalCost
        itemAllocations.push({ materialId: gr.material_id, quantity, allocations, itemTotalCost })
      }

      // 处理扩展配额：通用耗材
      const generalConsumables = db.prepare(`
        SELECT gc.*, m.name, m.spec FROM bom_general_consumables gc
        JOIN materials m ON gc.material_id = m.id AND m.is_deleted = 0
        WHERE gc.bom_id = ?
      `).all(effectiveBomId) as any[]
      for (const gc of generalConsumables) {
        const quantity = (gc.usage_per_sample || 0) * sc
        if (quantity <= 0) continue
        let allocations
        try {
          allocations = allocateBatches(db, gc.material_id, quantity).map(a => ({ ...a, materialId: gc.material_id }))
        } catch (e: any) {
          if (e?.message?.includes('批次库存不足')) { skippedAux.push(`通用耗材 ${gc.name || gc.material_id}`); continue }
          throw e
        }
        const itemTotalCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0)
        totalCost += itemTotalCost
        itemAllocations.push({ materialId: gc.material_id, quantity, allocations, itemTotalCost })
      }

      // 处理扩展配额：质控品（按批次覆盖样本数计算）
      const qualityControls = db.prepare(`
        SELECT qc.*, m.name, m.spec FROM bom_quality_controls qc
        JOIN materials m ON qc.material_id = m.id AND m.is_deleted = 0
        WHERE qc.bom_id = ?
      `).all(effectiveBomId) as any[]
      for (const qc of qualityControls) {
        const coverage = qc.covers_samples || 1
        const usagePerBatch = qc.usage_per_batch || 1
        const batchesNeeded = Math.ceil(sc / coverage)
        const quantity = batchesNeeded * usagePerBatch
        if (quantity <= 0) continue
        let allocations
        try {
          allocations = allocateBatches(db, qc.material_id, quantity).map(a => ({ ...a, materialId: qc.material_id }))
        } catch (e: any) {
          if (e?.message?.includes('批次库存不足')) { skippedAux.push(`质控品 ${qc.name || qc.material_id}`); continue }
          throw e
        }
        const itemTotalCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0)
        totalCost += itemTotalCost
        itemAllocations.push({ materialId: qc.material_id, quantity, allocations, itemTotalCost })
      }

      const auxNote = skippedAux.length ? `辅料缺货已跳过(不阻断出库, BR-OB-022~024)：${skippedAux.join('、')}` : ''
      const finalRemark = [remark, auxNote].filter(Boolean).join(' | ') || null
      db.prepare(`
        INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, case_no, operator, status, remark)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
      `).run(id, outboundNo, 'bom', effectiveProjectId || null, totalCost, sc, normalizedCaseNo || null, operator, finalRemark)

      for (const ia of itemAllocations) {
        for (const alloc of ia.allocations) {
          const itemId = uuidv4()
          const subtotal = alloc.quantity * alloc.unitCost

          // 保存 beforeStock（在 UPDATE 之前）
          const beforeStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(alloc.materialId) as any)?.stock || 0

          db.prepare(`
            INSERT INTO outbound_items (id, outbound_id, material_id, batch_id, batch_no, quantity, unit, unit_cost, total_cost, usage, receiver)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(itemId, id, alloc.materialId, alloc.batchId, alloc.batchNo, alloc.quantity, unitMap.get(alloc.materialId) || 'pcs', alloc.unitCost, subtotal, 'self', null)

          db.prepare(`
            UPDATE inventory
            SET stock = stock - ?,
                last_outbound_id = ?,
                last_outbound_date = date('now','localtime'),
                update_time = CURRENT_TIMESTAMP
            WHERE material_id = ?
          `).run(alloc.quantity, id, alloc.materialId)
          const batchLocationIds = alloc.batchId ? getBatchLocationIds(db, alloc.batchId, alloc.materialId) : []
          const consumedLocations = consumeInventoryLocationStock(
            db,
            alloc.materialId,
            alloc.quantity,
            { relatedType: 'outbound', relatedId: id },
            { preferredLocationIds: batchLocationIds },
          )

          if (alloc.batchId) {
            consumeBatchLocationStockByLocations(db, alloc.batchId, alloc.materialId, consumedLocations, { relatedType: 'outbound', relatedId: id, operator })
            db.prepare('UPDATE batches SET remaining = remaining - ? WHERE id = ?').run(alloc.quantity, alloc.batchId)
            const batchRemaining = (db.prepare('SELECT remaining FROM batches WHERE id = ?').get(alloc.batchId) as any)?.remaining
            if (batchRemaining <= 0) {
              db.prepare('UPDATE batches SET status = 0 WHERE id = ?').run(alloc.batchId)
            }
          }

          if (alloc.batchId) {
            const mat = db.prepare('SELECT name, spec FROM materials WHERE id = ? AND is_deleted = 0').get(alloc.materialId) as any
            const trkId = uuidv4()
            const today = new Date().toISOString().split('T')[0]
            db.prepare(`
              INSERT INTO batch_usage_tracking
              (id, material_id, material_name, batch, spec, total_qty, remaining, unit, start_date, days_used, expected_days, progress, usage, receiver, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, 'in-use', datetime('now'), datetime('now'))
            `).run(trkId, alloc.materialId, mat?.name || '', alloc.batchNo || '', mat?.spec || '', alloc.quantity, alloc.quantity, unitMap.get(alloc.materialId) || 'pcs', today, 30, 'self', null)
          }

          const logId = uuidv4()
          const afterStock = beforeStock - alloc.quantity
          db.prepare(`
            INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator)
            VALUES (?, 'outbound', ?, ?, ?, ?, ?, 'outbound', ?)
          `).run(logId, alloc.materialId, -alloc.quantity, beforeStock, afterStock, id, operator)
        }
      }

      const costMonth = new Date().toISOString().slice(0, 7)

      // P1-01：辅料缺货已按 BR-OB-022~024 跳过（不阻断出库），但写 cost_exception 标记本次成本可能低估，
      // 保成本完整性意图——可追溯、可补料后重算，而非静默低估。
      for (const auxName of skippedAux) {
        recordCostException(db, {
          sourceModule: 'abc',
          sourceType: 'bom_outbound',
          sourceId: id,
          projectId: effectiveProjectId || null,
          bomId: effectiveBomId,
          outboundId: id,
          yearMonth: costMonth,
          exceptionType: 'bom_material_skipped',
          severity: 'warning',
          message: `辅料缺货已跳过，本次出库成本可能低估：${auxName}`,
          details: { outboundNo, bomId: effectiveBomId, skipped: auxName, sampleCount: sc, action: 'replenish_or_recalculate' },
        })
      }

      // ===== ABC 成本计算（失败不阻断出库）=====
      try {
        // P0：真实块/片/例数 = 每样本驱动量 × 样本数（替代写死 block=1/slide=sc，修期间费率分母）。
        const perSampleDriver = getBomPerSampleDriverQty(db, effectiveBomId)
        const storedBlockCount = Math.round(perSampleDriver.block * sc)
        const storedSlideCount = Math.round((perSampleDriver.slide > 0 ? perSampleDriver.slide : 1) * sc)
        const storedCaseCount = normalizedCaseNo ? 1 : 0
        const slideCostResult = calculateSlideCostWithFee(db, {
          bomId: effectiveBomId,
          slideCount: sc,
          blockCount: 1,
          month: costMonth,
          materialCost: totalCost,
          caseNo: normalizedCaseNo || null,
          applyCaseAggregation: true,
          // R1：逐单分摊按真实驱动量（块/片 = 每样本量 × 样本数；病例 = 本单实际病例数），与期间池同口径。
          sampleCount: sc,
          caseCount: storedCaseCount,
        })
        const missingFeeMapping = slideCostResult.feeBreakdown.length === 0

        // 写入 outbound_abc_details
        const abcDetailId = uuidv4()
        db.prepare(`
          INSERT INTO outbound_abc_details
          (id, outbound_id, bom_id, project_id, sample_count, slide_count, block_count, case_count,
           material_cost, activity_cost, total_cost, cost_per_slide,
           fee_category, fee_standard_id, fee_amount, profit, profit_rate,
           activity_details, cost_month, cost_status, case_no, charge_group_id, calculation_version, source_snapshot)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          abcDetailId, id, effectiveBomId, effectiveProjectId || null,
          sc, storedSlideCount, storedBlockCount, storedCaseCount,
          slideCostResult.materialCost, slideCostResult.totalActivityCost, slideCostResult.totalCost,
          sc > 0 ? slideCostResult.totalCost / sc : 0,
          slideCostResult.feeCategory, slideCostResult.feeStandardId,
          slideCostResult.feeAmount, slideCostResult.profit, slideCostResult.profitRate,
          JSON.stringify(slideCostResult.activityCosts),
          costMonth,
          missingFeeMapping ? 'cost_exception' : 'costed',
          normalizedCaseNo || null,
          slideCostResult.chargeGroupId || (normalizedCaseNo ? `${normalizedCaseNo}-${costMonth}` : id),
          'v1',
          JSON.stringify({
            outboundId: id,
            outboundNo,
            bomId: effectiveBomId,
            projectId: effectiveProjectId || null,
            caseNo: normalizedCaseNo || null,
            lisCaseId: lisCase?.id || null,
            sampleCount: sc,
            materialCost: totalCost,
            bomSnapshot: buildBomSourceSnapshot(db, effectiveBomId),
            feeBreakdown: slideCostResult.feeBreakdown,
            calculatedAt: new Date().toISOString(),
          })
        )

        // 更新 outbound_records 的 ABC 字段
        db.prepare(`
          UPDATE outbound_records SET
            abc_total_cost = ?, abc_activity_cost = ?, fee_amount = ?, profit = ?, cost_status = ?
          WHERE id = ?
        `).run(
          slideCostResult.totalCost,
          slideCostResult.totalActivityCost,
            slideCostResult.feeAmount,
            slideCostResult.profit,
          missingFeeMapping ? 'cost_exception' : 'costed',
          id,
        )

        let exceptionNo: string | null = null
        if (missingFeeMapping) {
          const exception = recordCostException(db, {
            sourceModule: 'abc',
            sourceType: 'bom_outbound',
            sourceId: id,
            projectId: effectiveProjectId || null,
            bomId: effectiveBomId,
            outboundId: id,
            yearMonth: costMonth,
            exceptionType: 'missing_fee_mapping',
            severity: 'warning',
            message: 'BOM未配置收费映射，出库收费与利润核算不可确认',
            details: {
              outboundNo,
              bomId: effectiveBomId,
              projectId: effectiveProjectId || null,
              caseNo: normalizedCaseNo || null,
              sampleCount: sc,
              action: 'configure_bom_fee_mapping',
            },
          })
          exceptionNo = exception.exceptionNo
        }

        writeAuditLog(db, 'outbound', 'update_cost', outboundNo, {
          outboundId: id,
          outboundNo,
          bomId: effectiveBomId,
          projectId: effectiveProjectId || null,
          caseNo: normalizedCaseNo || null,
          sampleCount: sc,
          materialCost: slideCostResult.materialCost,
          activityCost: slideCostResult.totalActivityCost,
          totalCost: slideCostResult.totalCost,
          costMonth,
          costStatus: missingFeeMapping ? 'cost_exception' : 'costed',
          feeAmount: slideCostResult.feeAmount,
          profit: slideCostResult.profit,
          profitRate: slideCostResult.profitRate,
          exceptionNo,
          exceptionType: missingFeeMapping ? 'missing_fee_mapping' : null,
        }, operator)
      } catch (abcErr) {
        const message = errorMessage(abcErr)
        console.error('ABC calculation failed, outbound continues:', abcErr)
        db.prepare("UPDATE outbound_records SET cost_status = 'cost_exception' WHERE id = ?").run(id)
        const exception = recordCostException(db, {
          sourceModule: 'abc',
          sourceType: 'bom_outbound',
          sourceId: id,
          projectId: effectiveProjectId || null,
          bomId: effectiveBomId,
          outboundId: id,
          yearMonth: costMonth,
          exceptionType: 'abc_calculation_failed',
          severity: 'error',
          message: 'BOM出库已完成，但ABC成本计算失败',
          details: {
            outboundNo,
            sampleCount: sc,
            materialCost: totalCost,
            error: message,
          },
        })
        writeAuditLog(db, 'outbound', 'update_cost', outboundNo, {
          outboundId: id,
          outboundNo,
          bomId: effectiveBomId,
          projectId: effectiveProjectId || null,
          caseNo: normalizedCaseNo || null,
          sampleCount: sc,
          materialCost: totalCost,
          costMonth,
          costStatus: 'cost_exception',
          feeAmount: 0,
          profit: -totalCost,
          exceptionNo: exception.exceptionNo,
          exceptionType: 'abc_calculation_failed',
          error: message,
        }, operator)
      }

      if (lisCase?.id) {
        db.prepare(`
          UPDATE lis_cases
          SET project_id = COALESCE(NULLIF(project_id, ''), ?),
              project_name = CASE
                WHEN project_id IS NULL OR project_id = '' THEN ?
                ELSE COALESCE(NULLIF(project_name, ''), ?)
              END,
              status = CASE WHEN status = 'unmatched' THEN 'normal' ELSE status END
          WHERE id = ?
        `).run(
          effectiveProjectId,
          project.name || lisCase.project_name || null,
          project.name || lisCase.project_name || null,
          lisCase.id,
        )
      }

      db.exec('COMMIT')

      // 自动检查库存预警（BOM出库后库存可能不足）
      const bomMaterialIds = itemAllocations.map((ia: any) => ia.materialId)
      checkStockAlerts(db, [...new Set(bomMaterialIds)])
      logOperation(db, req as any, {
        operation: 'POST /outbound/bom',
        description: `创建BOM出库记录 ${id}`,
        requestData: {
          projectId: effectiveProjectId || null,
          bomId: effectiveBomId,
          sampleCount: sc,
          caseNo: normalizedCaseNo || null,
          remark: remark || null,
        },
        responseData: { id, outboundNo, type: 'bom', projectId: effectiveProjectId || null, bomId: effectiveBomId, totalCost, status: 'completed' },
      })
    } catch (err: any) {
      db.exec('ROLLBACK')
      if (err.message && (err.message.includes('批次库存不足') || err.message.includes('指定出库批次'))) {
        error(res, err.message, 'STOCK_INSUFFICIENT', 422); return
      }
      throw err
    }

    success(res, {
      id,
      outboundNo,
      type: 'bom',
      projectId: effectiveProjectId,
      bomId: effectiveBomId,
      caseNo: normalizedCaseNo || null,
      totalCost,
      status: 'completed',
      createdAt: new Date().toISOString(),
    }, 'BOM outbound created', 201)
  } catch (err: any) { error(res, err.message) }
})

// 写入权限检查
function requireWriteAccess(req: any, res: any, next: any) {
  const role = req.user?.role
  if (role === 'admin' || role === 'warehouse_manager') {
    next()
    return
  }
  error(res, 'Forbidden: insufficient permissions', 'FORBIDDEN', 403)
}

function parseJsonOrNull(value: string | null | undefined) {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (_e) {
    return null
  }
}

function feeStandardForCaseReplay(db: any, feeStandardId: string, ruleSnapshot: any, fallbackUnitPrice = 0) {
  const current = db.prepare('SELECT * FROM fee_standards WHERE id = ?').get(feeStandardId) as any
  return {
    ...current,
    fee_per_slide: current?.fee_per_slide ?? fallbackUnitPrice,
    base_price: current?.base_price ?? fallbackUnitPrice,
    tier_rules: Array.isArray(ruleSnapshot?.tierRules)
      ? JSON.stringify(ruleSnapshot.tierRules)
      : current?.tier_rules,
    cap_amount: ruleSnapshot?.capAmount ?? current?.cap_amount ?? null,
  }
}

function replayCaseChargeGroup(db: any, input: {
  caseNo: string
  yearMonth: string
  feeStandardId: string
}) {
  if (!input.caseNo || !input.yearMonth || !input.feeStandardId) return

  const existingGroup = db.prepare(`
    SELECT *
    FROM case_charge_groups
    WHERE case_no = ? AND year_month = ? AND fee_standard_id = ?
  `).get(input.caseNo, input.yearMonth, input.feeStandardId) as any
  const ruleSnapshot = parseJsonOrNull(existingGroup?.rule_snapshot)

  const details = db.prepare(`
    SELECT d.*, r.created_at as outbound_created_at, r.outbound_no
    FROM outbound_abc_details d
    JOIN outbound_records r ON d.outbound_id = r.id
    WHERE d.case_no = ?
      AND d.cost_month = ?
      AND r.is_deleted = 0
    ORDER BY r.created_at ASC, r.outbound_no ASC, d.created_at ASC, d.id ASC
  `).all(input.caseNo, input.yearMonth) as any[]

  let totalQuantity = 0
  let totalFee = 0
  let outboundCount = 0
  let latestRuleSnapshot = existingGroup?.rule_snapshot || null

  for (const detail of details) {
    const snapshot = parseJsonOrNull(detail.source_snapshot) || {}
    const feeBreakdown = Array.isArray(snapshot.feeBreakdown) ? snapshot.feeBreakdown : []
    let changed = false

    for (const feeItem of feeBreakdown) {
      if (
        feeItem?.aggregationScope !== 'case'
        || feeItem?.feeStandardId !== input.feeStandardId
      ) continue

      const quantity = Number(feeItem.quantity) || 0
      const previousFee = totalFee
      totalQuantity += quantity
      const fallbackUnitPrice = quantity > 0 ? (Number(feeItem.feeAmount) || 0) / quantity : 0
      const feeStandard = feeStandardForCaseReplay(db, input.feeStandardId, ruleSnapshot, fallbackUnitPrice)
      totalFee = calculateFeeAmountFromStandard(feeStandard, totalQuantity)
      feeItem.feeAmount = Math.round((totalFee - previousFee) * 100) / 100
      feeItem.chargeGroupId = existingGroup?.id || `${input.caseNo}-${input.yearMonth}-${input.feeStandardId}`
      latestRuleSnapshot = JSON.stringify({
        feeStandardId: input.feeStandardId,
        feeStandardName: feeItem.feeStandardName || feeStandard?.name || feeStandard?.fee_standard_name || null,
        tierRules: feeStandard?.tier_rules ? parseJsonOrNull(feeStandard.tier_rules) : null,
        capAmount: feeStandard?.cap_amount ?? null,
      })
      outboundCount += 1
      changed = true
    }

    if (!changed) continue

    const nextFeeAmount = feeBreakdown.reduce((sum: number, item: any) => sum + (Number(item.feeAmount) || 0), 0)
    const totalCost = Number(detail.total_cost) || 0
    const nextProfit = Math.round((nextFeeAmount - totalCost) * 100) / 100
    const nextProfitRate = nextFeeAmount > 0 ? nextProfit / nextFeeAmount : 0
    db.prepare(`
      UPDATE outbound_abc_details
      SET fee_amount = ?, profit = ?, profit_rate = ?, source_snapshot = ?
      WHERE id = ?
    `).run(
      nextFeeAmount,
      nextProfit,
      nextProfitRate,
      JSON.stringify({ ...snapshot, feeBreakdown, replayedAt: new Date().toISOString() }),
      detail.id,
    )
    db.prepare(`
      UPDATE outbound_records
      SET fee_amount = ?, profit = ?
      WHERE id = ?
    `).run(nextFeeAmount, nextProfit, detail.outbound_id)
  }

  if (totalQuantity <= 0 || outboundCount <= 0) {
    if (existingGroup?.id) db.prepare('DELETE FROM case_charge_groups WHERE id = ?').run(existingGroup.id)
    return
  }

  const groupId = existingGroup?.id || `${input.caseNo}-${input.yearMonth}-${input.feeStandardId}`
  db.prepare(`
    INSERT INTO case_charge_groups (
      id, case_no, year_month, fee_standard_id,
      total_quantity, total_fee, outbound_count, rule_snapshot
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(case_no, year_month, fee_standard_id) DO UPDATE SET
      total_quantity = excluded.total_quantity,
      total_fee = excluded.total_fee,
      outbound_count = excluded.outbound_count,
      rule_snapshot = excluded.rule_snapshot,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    groupId,
    input.caseNo,
    input.yearMonth,
    input.feeStandardId,
    totalQuantity,
    totalFee,
    outboundCount,
    latestRuleSnapshot,
  )
}

function caseChargeReplayKeysForOutbound(db: any, outboundId: string) {
  const details = db.prepare(`
    SELECT case_no, cost_month, source_snapshot
    FROM outbound_abc_details
    WHERE outbound_id = ?
  `).all(outboundId) as any[]
  const keys = new Map<string, { caseNo: string; yearMonth: string; feeStandardId: string }>()
  for (const detail of details) {
    const snapshot = parseJsonOrNull(detail.source_snapshot)
    const feeBreakdown = Array.isArray(snapshot?.feeBreakdown) ? snapshot.feeBreakdown : []
    for (const feeItem of feeBreakdown) {
      if (feeItem?.aggregationScope !== 'case' || !feeItem?.feeStandardId) continue
      const caseNo = detail.case_no || snapshot?.caseNo || ''
      const yearMonth = detail.cost_month || snapshot?.yearMonth || ''
      const feeStandardId = feeItem.feeStandardId
      if (!caseNo || !yearMonth || !feeStandardId) continue
      keys.set(`${caseNo}:${yearMonth}:${feeStandardId}`, { caseNo, yearMonth, feeStandardId })
    }
  }
  return [...keys.values()]
}

function reverseCaseChargeGroupsForOutbound(db: any, outboundId: string) {
  const details = db.prepare(`
    SELECT id, case_no, cost_month, source_snapshot
    FROM outbound_abc_details
    WHERE outbound_id = ?
  `).all(outboundId) as any[]

  for (const detail of details) {
    const snapshot = parseJsonOrNull(detail.source_snapshot)
    const feeBreakdown = Array.isArray(snapshot?.feeBreakdown) ? snapshot.feeBreakdown : []
    for (const feeItem of feeBreakdown) {
      if (feeItem?.aggregationScope !== 'case' || !feeItem?.feeStandardId) continue

      const group = db.prepare(`
        SELECT *
        FROM case_charge_groups
        WHERE id = ?
           OR (case_no = ? AND year_month = ? AND fee_standard_id = ?)
      `).get(
        feeItem.chargeGroupId || '',
        detail.case_no || snapshot.caseNo || '',
        detail.cost_month || snapshot.yearMonth || '',
        feeItem.feeStandardId,
      ) as any
      if (!group) continue

      const nextQuantity = Math.max(0, (Number(group.total_quantity) || 0) - (Number(feeItem.quantity) || 0))
      const nextOutboundCount = Math.max(0, (Number(group.outbound_count) || 0) - 1)
      if (nextQuantity <= 0 || nextOutboundCount <= 0) {
        db.prepare('DELETE FROM case_charge_groups WHERE id = ?').run(group.id)
        continue
      }

      const ruleSnapshot = parseJsonOrNull(group.rule_snapshot)
      const fallbackUnitPrice = Number(feeItem.quantity) > 0
        ? (Number(feeItem.feeAmount) || 0) / Number(feeItem.quantity)
        : 0
      const feeStandard = feeStandardForCaseReplay(db, feeItem.feeStandardId, ruleSnapshot, fallbackUnitPrice)
      const nextFee = calculateFeeAmountFromStandard(feeStandard, nextQuantity)
      db.prepare(`
        UPDATE case_charge_groups
        SET total_quantity = ?, total_fee = ?, outbound_count = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(nextQuantity, nextFee, nextOutboundCount, group.id)
    }
  }
}

router.put('/:id', requireWriteAccess, (req, res) => {
  try {
    const { id } = req.params
    const { type, projectId, items: newItems, remark } = req.body
    if (!Array.isArray(newItems) || newItems.length === 0) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }
    const itemValidation = validateOutboundItems(newItems)
    if (!itemValidation.ok) {
      error(res, itemValidation.message, 'INVALID_PARAMETER', 400); return
    }

    const db = getDatabase()
    const record = db.prepare('SELECT * FROM outbound_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    if (record.type === 'bom') {
      error(res, 'BOM出库单涉及成本快照和病例收费聚合，不能直接编辑，请删除后重新出库', 'BOM_OUTBOUND_IMMUTABLE', 409)
      return
    }
    if (record.type === 'transfer' || record.type === 'scrap') {
      error(res, '调拨/报废出库请通过对应专用入口处理，不能在通用出库入口编辑', 'DEDICATED_OUTBOUND_FLOW_REQUIRED', 409)
      return
    }

    const nextProjectId = projectId !== undefined ? String(projectId || '').trim() : (record.project_id || '')
    const refValidation = validateDirectOutboundReferences(db, {
      projectId: nextProjectId,
      items: newItems,
      requireProject: true,
    })
    if (!refValidation.ok) {
      error(res, refValidation.message, refValidation.code, refValidation.status)
      return
    }

    if (type !== undefined) {
      const typeValidation = validateDirectOutboundType(type)
      if (!typeValidation.ok) {
        error(res, typeValidation.message, 'INVALID_PARAMETER', 400); return
      }
    }
    const nextType = type !== undefined ? String(type || '').trim() : record.type
    const oldItems = db.prepare('SELECT * FROM outbound_items WHERE outbound_id = ?').all(id) as any[]
    const materialUnits = db.prepare('SELECT id, unit FROM materials WHERE id IN (' + newItems.map(() => '?').join(',') + ')').all(...newItems.map((i: any) => i.materialId)) as any[]
    const unitMap = new Map(materialUnits.map((m: any) => [m.id, m.unit]))

    let newTotalCost = 0

    db.exec('BEGIN IMMEDIATE')
    try {
      const batchRestore = validateOutboundBatchRestoreCapacity(
        db,
        oldItems,
        '批次数量已被后续业务调整，无法编辑出库记录',
      )
      if (!batchRestore.ok) {
        db.exec('ROLLBACK')
        error(res, batchRestore.message, batchRestore.code, batchRestore.status)
        return
      }

      // 1. 回退旧 items 库存
      const oldQuantityByMaterial = new Map<string, number>()
      for (const item of oldItems) {
        oldQuantityByMaterial.set(item.material_id, (oldQuantityByMaterial.get(item.material_id) || 0) + Number(item.quantity || 0))
      }
      const restoredOldMaterials = new Set<string>()
      for (const item of oldItems) {
        db.prepare('UPDATE inventory SET stock = stock + ? WHERE material_id = ?').run(item.quantity, item.material_id)
        if (!restoredOldMaterials.has(item.material_id)) {
          restoreInventoryLocationStock(
            db,
            item.material_id,
            oldQuantityByMaterial.get(item.material_id) || Number(item.quantity),
            { relatedType: 'outbound', relatedId: id },
          )
          restoredOldMaterials.add(item.material_id)
        }
        if (item.batch_id) {
          restoreBatchLocationStock(db, item.batch_id, item.material_id, item.quantity, { relatedType: 'outbound', relatedId: id, operator: (req as any).user?.username || 'system' })
          db.prepare('UPDATE batches SET remaining = remaining + ?, status = 1 WHERE id = ?').run(item.quantity, item.batch_id)
        }
        if (item.batch_no) {
          db.prepare("DELETE FROM batch_usage_tracking WHERE material_id = ? AND batch = ? AND status = 'in-use'").run(item.material_id, item.batch_no)
        }
      }

      // 2. 删除旧 items
      db.prepare('DELETE FROM outbound_items WHERE outbound_id = ?').run(id)

      // 3. 重新分配批次并扣减
      const processedItems: Array<{
        materialId: string
        quantity: number
        usage: string
        receiver: string | null
        allocations: BatchAllocation[]
      }> = []

      for (const item of newItems) {
        const { materialId, quantity, batchId } = item
        const qty = Number(quantity)
        const allocations = allocateBatches(db, materialId, qty, typeof batchId === 'string' ? batchId.trim() : undefined)
        const itemCost = allocations.reduce((sum, a) => sum + a.quantity * a.unitCost, 0)
        newTotalCost += itemCost

        processedItems.push({
          materialId,
          quantity: qty,
          usage: String(item.usage || 'self').trim(),
          receiver: typeof item.receiver === 'string' ? item.receiver.trim() || null : null,
          allocations,
        })
      }

      // 4. 更新记录
      db.prepare('UPDATE outbound_records SET type = ?, project_id = ?, total_cost = ?, remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(nextType || 'project', nextProjectId, newTotalCost, remark || null, id)

      // 5. 创建新 items 并扣减库存
      for (const pi of processedItems) {
        for (const alloc of pi.allocations) {
          const itemId = uuidv4()
          const subtotal = alloc.quantity * alloc.unitCost

          // 保存 beforeStock（在 UPDATE 之前）
          const beforeStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(pi.materialId) as any)?.stock || 0

          db.prepare(`
            INSERT INTO outbound_items (id, outbound_id, material_id, batch_id, batch_no, quantity, unit, unit_cost, total_cost, usage, receiver)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(itemId, id, pi.materialId, alloc.batchId, alloc.batchNo, alloc.quantity, unitMap.get(pi.materialId) || 'pcs', alloc.unitCost, subtotal, pi.usage, pi.receiver)

          db.prepare('UPDATE inventory SET stock = stock - ? WHERE material_id = ?').run(alloc.quantity, pi.materialId)
          const batchLocationIds = alloc.batchId ? getBatchLocationIds(db, alloc.batchId, pi.materialId) : []
          const consumedLocations = consumeInventoryLocationStock(
            db,
            pi.materialId,
            alloc.quantity,
            { relatedType: 'outbound', relatedId: id },
            { preferredLocationIds: batchLocationIds },
          )
          if (alloc.batchId) {
            consumeBatchLocationStockByLocations(db, alloc.batchId, pi.materialId, consumedLocations, { relatedType: 'outbound', relatedId: id, operator: (req as any).user?.username || 'system' })
            db.prepare('UPDATE batches SET remaining = remaining - ? WHERE id = ?').run(alloc.quantity, alloc.batchId)
            const remaining = (db.prepare('SELECT remaining FROM batches WHERE id = ?').get(alloc.batchId) as any)?.remaining
            if (remaining <= 0) {
              db.prepare('UPDATE batches SET status = 0 WHERE id = ?').run(alloc.batchId)
            }
          }

          if (pi.usage === 'self' && alloc.batchId) {
            const mat = db.prepare('SELECT name, spec FROM materials WHERE id = ? AND is_deleted = 0').get(pi.materialId) as any
            const trkId = uuidv4()
            const today = new Date().toISOString().split('T')[0]
            db.prepare(`
              INSERT INTO batch_usage_tracking
              (id, material_id, material_name, batch, spec, total_qty, remaining, unit, start_date, days_used, expected_days, progress, usage, receiver, status, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, 'in-use', datetime('now'), datetime('now'))
            `).run(trkId, pi.materialId, mat?.name || '', alloc.batchNo || '', mat?.spec || '', alloc.quantity, alloc.quantity, unitMap.get(pi.materialId) || 'pcs', today, 30, 'self', pi.receiver)
          }

          const logId = uuidv4()
          const afterStock = beforeStock - alloc.quantity
          db.prepare(`
            INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator)
            VALUES (?, 'outbound', ?, ?, ?, ?, ?, 'outbound', ?)
          `).run(logId, pi.materialId, -alloc.quantity, beforeStock, afterStock, id, (req as any).user?.username || 'system')
        }
      }

      db.exec('COMMIT')
      const affectedMaterialIds = [
        ...oldItems.map((item: any) => item.material_id),
        ...processedItems.map(item => item.materialId),
      ]
      checkStockAlerts(db, [...new Set(affectedMaterialIds)])
      logOperation(db, req as any, {
        operation: 'PUT /outbound/:id',
        description: `更新普通出库记录 ${id}`,
        requestData: { id, type: nextType, projectId: nextProjectId, items: newItems, remark: remark || null },
        responseData: { id, totalCost: newTotalCost },
      })
    } catch (err: any) {
      db.exec('ROLLBACK')
      if (err.message && (err.message.includes('批次库存不足') || err.message.includes('指定出库批次'))) {
        error(res, err.message, 'STOCK_INSUFFICIENT', 422); return
      }
      throw err
    }

    success(res, { id, totalCost: newTotalCost }, 'Outbound updated')
  } catch (err: any) { error(res, err.message) }
})

router.delete('/:id', requireWriteAccess, (req, res) => {
  try {
    const { id } = req.params
    const { reason, remark } = req.body
    const db = getDatabase()
    const record = db.prepare('SELECT * FROM outbound_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    const items = db.prepare('SELECT * FROM outbound_items WHERE outbound_id = ?').all(id) as any[]

    db.exec('BEGIN IMMEDIATE')
    try {
      const batchRestore = validateOutboundBatchRestoreCapacity(db, items)
      if (!batchRestore.ok) {
        db.exec('ROLLBACK')
        error(res, batchRestore.message, batchRestore.code, batchRestore.status)
        return
      }

      const replayKeys = caseChargeReplayKeysForOutbound(db, id)

      // 先读取 before_stock，再更新库存（修复 stock_logs 时序）
      const beforeStocks: Record<string, number> = {}
      for (const item of items) {
        beforeStocks[item.material_id] = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(item.material_id) as any)?.stock || 0
      }
      const quantityByMaterial = new Map<string, number>()
      for (const item of items) {
        quantityByMaterial.set(item.material_id, (quantityByMaterial.get(item.material_id) || 0) + Number(item.quantity || 0))
      }

      const restoredMaterials = new Set<string>()
      for (const item of items) {
        db.prepare('UPDATE inventory SET stock = stock + ? WHERE material_id = ?').run(item.quantity, item.material_id)
        if (!restoredMaterials.has(item.material_id)) {
          restoreInventoryLocationStock(
            db,
            item.material_id,
            quantityByMaterial.get(item.material_id) || Number(item.quantity),
            { relatedType: 'outbound', relatedId: id },
          )
          restoredMaterials.add(item.material_id)
        }
        if (item.batch_id) {
          restoreBatchLocationStock(db, item.batch_id, item.material_id, item.quantity, { relatedType: 'outbound', relatedId: id, operator: (req as any).user?.username || 'system' })
          db.prepare('UPDATE batches SET remaining = remaining + ?, status = 1 WHERE id = ?').run(item.quantity, item.batch_id)
        }
        if (item.batch_no) {
          db.prepare("DELETE FROM batch_usage_tracking WHERE material_id = ? AND batch = ? AND status = 'in-use'").run(item.material_id, item.batch_no)
        }
      }

      // 保存取消原因和备注
      db.prepare('UPDATE outbound_records SET is_deleted = 1, cancel_reason = ?, cancel_remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(reason || null, remark || null, id)

      for (const item of items) {
        const before = beforeStocks[item.material_id] || 0
        const after = before + item.quantity
        const logId = uuidv4()
        db.prepare(`
          INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
          VALUES (?, 'delete', ?, ?, ?, ?, ?, 'outbound_delete', ?, ?)
        `).run(logId, item.material_id, item.quantity, before, after, id, (req as any).user?.username || 'system', reason || '删除出库记录')
      }

      // 同步回退病例级收费聚合，再清理 ABC 记录
      reverseCaseChargeGroupsForOutbound(db, id)
      for (const key of replayKeys) {
        replayCaseChargeGroup(db, key)
      }
      db.prepare('DELETE FROM outbound_abc_details WHERE outbound_id = ?').run(id)

      db.exec('COMMIT')
      const affectedMaterialIds = [...new Set(items.map((item: any) => item.material_id))]
      checkStockAlerts(db, affectedMaterialIds)
      logOperation(db, req as any, {
        operation: 'DELETE /outbound/:id',
        description: `删除出库记录 ${id}`,
        requestData: { id, reason: reason || null, remark: remark || null },
        responseData: { id, type: record.type, status: 'deleted' },
      })
      success(res, null, '删除成功，库存已同步回退')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
