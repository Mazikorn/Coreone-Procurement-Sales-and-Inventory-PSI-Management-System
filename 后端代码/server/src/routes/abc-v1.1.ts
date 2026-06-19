import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { calculateSlideCostWithFee } from '../utils/cost-calculator.js'
import { recordCostException } from '../utils/cost-exceptions.js'
import { ensurePeriodOpen, getOrCreatePeriod, normalizeMonth, runCostRecalculation, writeAuditLog } from '../utils/cost-runs.js'
import { requireRole, requireStrictRole } from '../middleware/auth.js'

const router = Router()
const requireCostWrite = requireStrictRole('admin', 'finance')

const pageParams = (query: any) => {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
}

const currentMonth = () => new Date().toISOString().slice(0, 7)

const getOperator = (req: any) => req.user?.username || 'system'

const previousMonth = (month: string) => {
  const [year, monthIndex] = month.split('-').map(Number)
  if (!year || !monthIndex) return currentMonth()
  const date = new Date(Date.UTC(year, monthIndex - 2, 1))
  return date.toISOString().slice(0, 7)
}

const changeRate = (current: number, previous: number) => {
  if (previous > 0) return (current - previous) / previous
  return current > 0 ? 1 : 0
}

const periodPayload = (row: any) => ({
  id: row.id,
  yearMonth: row.year_month,
  status: row.status,
  startedAt: row.started_at,
  calculatedAt: row.calculated_at,
  reviewedAt: row.reviewed_at,
  closedAt: row.closed_at,
  closedBy: row.closed_by,
  remark: row.remark,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const parseJsonOrNull = (value: string | null | undefined) => {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch (_e) {
    return null
  }
}

const feeMappingAuditSelect = `
  SELECT
    b.id as bom_id,
    b.code as bom_code,
    b.name as bom_name,
    b.type as bom_type,
    b.status as bom_status,
    b.fee_standard_id as legacy_fee_standard_id,
    legacy_fs.name as legacy_fee_standard_name,
    COUNT(fs.id) as mapping_count,
    GROUP_CONCAT(fs.name, '、') as mapped_fee_names,
    open_ex.id as exception_id,
    open_ex.exception_no,
    open_ex.status as exception_status,
    open_ex.created_at as exception_created_at
  FROM boms b
  LEFT JOIN fee_standards legacy_fs
    ON b.fee_standard_id = legacy_fs.id AND legacy_fs.status = 'active'
  LEFT JOIN bom_fee_mappings m
    ON b.id = m.bom_id AND m.status = 'active'
  LEFT JOIN fee_standards fs
    ON m.fee_standard_id = fs.id AND fs.status = 'active'
  LEFT JOIN cost_exceptions open_ex
    ON open_ex.bom_id = b.id
    AND open_ex.exception_type = 'missing_fee_mapping'
    AND open_ex.status = 'open'
  WHERE b.is_deleted = 0
    AND (b.status = 1 OR b.status = '1' OR b.status = 'active')
`

const feeMappingAuditGroup = `
  GROUP BY b.id, b.code, b.name, b.type, b.status, b.fee_standard_id,
           legacy_fs.name, open_ex.id, open_ex.exception_no, open_ex.status, open_ex.created_at
`

const feeMappingAuditHaving = (status: string) => {
  if (status === 'missing') return ' HAVING mapping_count = 0 AND legacy_fee_standard_id IS NULL'
  if (status === 'mapped') return ' HAVING mapping_count > 0'
  if (status === 'legacy') return ' HAVING mapping_count = 0 AND legacy_fee_standard_id IS NOT NULL'
  return ''
}

const feeMappingStatus = (row: any) => {
  if ((Number(row.mapping_count) || 0) > 0) return 'mapped'
  if (row.legacy_fee_standard_id) return 'legacy'
  return 'missing'
}

const feeMappingAuditPayload = (row: any) => ({
  bomId: row.bom_id,
  bomCode: row.bom_code,
  bomName: row.bom_name,
  bomType: row.bom_type,
  status: feeMappingStatus(row),
  mappingCount: Number(row.mapping_count) || 0,
  mappedFeeNames: row.mapped_fee_names ? String(row.mapped_fee_names).split('、') : [],
  legacyFeeStandardId: row.legacy_fee_standard_id,
  legacyFeeStandardName: row.legacy_fee_standard_name,
  exceptionId: row.exception_id,
  exceptionNo: row.exception_no,
  exceptionStatus: row.exception_status,
  exceptionCreatedAt: row.exception_created_at,
})

const costRunPayload = (row: any) => ({
  id: row.id,
  yearMonth: row.year_month,
  runType: row.run_type,
  status: row.status,
  startedBy: row.started_by,
  startedAt: row.started_at,
  finishedAt: row.finished_at,
  summary: parseJsonOrNull(row.summary),
  createdAt: row.created_at,
})

const costAdjustmentPayload = (row: any) => ({
  id: row.id,
  adjustmentNo: row.adjustment_no,
  yearMonth: row.year_month,
  adjustmentType: row.adjustment_type,
  amount: Number(row.amount) || 0,
  reason: row.reason,
  sourceModule: row.source_module,
  sourceId: row.source_id,
  status: row.status,
  submittedBy: row.submitted_by,
  submittedAt: row.submitted_at,
  reviewedBy: row.reviewed_by,
  reviewedAt: row.reviewed_at,
  reviewRemark: row.review_remark,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const approvedAdjustmentTotal = (db: any, yearMonth: string) => Number((db.prepare(`
  SELECT COALESCE(SUM(amount), 0) as total
  FROM abc_cost_adjustments
  WHERE year_month = ? AND status = 'approved'
`).get(yearMonth) as any)?.total) || 0

const pendingAdjustmentCount = (db: any, yearMonth: string) => Number((db.prepare(`
  SELECT COUNT(*) as total
  FROM abc_cost_adjustments
  WHERE year_month = ? AND status = 'pending'
`).get(yearMonth) as any)?.total) || 0

const countableAbcCostClause = `
  COALESCE(cost_status, 'costed') NOT IN ('pending_cost', 'cost_exception')
`

const csvEscape = (value: unknown) => {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const toCsv = (headers: string[], rows: Array<Array<unknown>>) => [
  headers.map(csvEscape).join(','),
  ...rows.map(row => row.map(csvEscape).join(',')),
].join('\n')

const monthRangeClause = (alias: string, query: any, field = 'cost_month') => {
  const params: any[] = []
  const startMonth = query.startMonth || query.startDate || query.month || query.yearMonth
  const endMonth = query.endMonth || query.endDate || query.month || query.yearMonth
  let where = '1 = 1'
  if (startMonth) { where += ` AND ${alias}.${field} >= ?`; params.push(String(startMonth).slice(0, 7)) }
  if (endMonth) { where += ` AND ${alias}.${field} <= ?`; params.push(String(endMonth).slice(0, 7)) }
  return { where, params }
}

const upsertCostPool = (
  db: any,
  input: {
    activityCenterId: string
    yearMonth: string
    directCost?: number
    indirectCost?: number
    driverQuantity?: number
    source?: string
    description?: string | null
  },
) => {
  const direct = Number(input.directCost) || 0
  const indirect = Number(input.indirectCost) || 0
  const total = direct + indirect
  const driverQty = Math.max(0, Number(input.driverQuantity) || 0)
  const driverRate = driverQty > 0 ? total / driverQty : 0
  const existing = db.prepare(`
    SELECT id FROM abc_cost_pools WHERE activity_center_id = ? AND year_month = ?
  `).get(input.activityCenterId, input.yearMonth) as any

  if (existing) {
    db.prepare(`
      UPDATE abc_cost_pools
      SET direct_cost = ?, indirect_cost = ?, total_cost = ?, driver_quantity = ?,
          driver_rate = ?, amount = ?, source = ?, description = ?
      WHERE id = ?
    `).run(direct, indirect, total, driverQty, driverRate, total, input.source || 'manual', input.description || null, existing.id)
    return existing.id
  }

  const id = uuidv4()
  db.prepare(`
    INSERT INTO abc_cost_pools (
      id, activity_center_id, year_month,
      direct_cost, indirect_cost, total_cost, driver_quantity, driver_rate,
      amount, source, description
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.activityCenterId,
    input.yearMonth,
    direct,
    indirect,
    total,
    driverQty,
    driverRate,
    total,
    input.source || 'manual',
    input.description || null,
  )
  return id
}

const getCostSourceTotals = (db: any, yearMonth: string) => {
  const sampleRows = db.prepare(`
    SELECT p.type as project_type, COALESCE(SUM(r.sample_count), 0) as sample_count
    FROM outbound_records r
    LEFT JOIN projects p ON r.project_id = p.id
    WHERE r.is_deleted = 0 AND r.status = 'completed' AND substr(r.created_at, 1, 7) = ?
    GROUP BY p.type
  `).all(yearMonth) as any[]

  const laborRows = db.prepare(`
    SELECT project_type, standard_minutes, labor_rate_per_minute
    FROM standard_labor_times
  `).all() as any[]

  const sampleCountByType = new Map(sampleRows.map(row => [row.project_type || 'all', Number(row.sample_count) || 0]))
  const totalSamples = sampleRows.reduce((sum, row) => sum + (Number(row.sample_count) || 0), 0)
  const laborTotal = laborRows.reduce((sum, row) => {
    const projectType = row.project_type || 'all'
    const samples = projectType === 'all' ? totalSamples : (sampleCountByType.get(projectType) || 0)
    return sum + samples * (Number(row.standard_minutes) || 0) * (Number(row.labor_rate_per_minute) || 0)
  }, 0)

  const equipmentTotal = (db.prepare(`
    SELECT COALESCE(SUM(depreciation_cost), 0) as total
    FROM equipment_usage
    WHERE substr(COALESCE(usage_date, created_at), 1, 7) = ?
  `).get(yearMonth) as any)?.total || 0

  const indirectTotal = (db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total
    FROM indirect_cost_allocations
    WHERE year_month = ?
  `).get(yearMonth) as any)?.total || 0

  return {
    sampleCount: totalSamples,
    laborTotal,
    equipmentTotal: Number(equipmentTotal) || 0,
    indirectTotal: Number(indirectTotal) || 0,
    total: laborTotal + (Number(equipmentTotal) || 0) + (Number(indirectTotal) || 0),
  }
}

const autoCollectCostPools = (db: any, yearMonth: string) => {
  const centers = db.prepare(`
    SELECT * FROM abc_activity_centers
    WHERE status = 'active' OR status = 1 OR status = '1'
    ORDER BY sort_order ASC
  `).all() as any[]
  if (centers.length === 0) return { updated: 0, sourceTotals: getCostSourceTotals(db, yearMonth) }

  const sourceTotals = getCostSourceTotals(db, yearMonth)
  const driverQty = Math.max(1, sourceTotals.sampleCount)
  const directShare = (sourceTotals.laborTotal + sourceTotals.equipmentTotal) / centers.length
  const indirectShare = sourceTotals.indirectTotal / centers.length

  for (const center of centers) {
    upsertCostPool(db, {
      activityCenterId: center.id,
      yearMonth,
      directCost: directShare,
      indirectCost: indirectShare,
      driverQuantity: driverQty,
      source: 'auto_collect',
      description: `自动归集：人工 ${sourceTotals.laborTotal.toFixed(2)}，设备 ${sourceTotals.equipmentTotal.toFixed(2)}，间接 ${sourceTotals.indirectTotal.toFixed(2)}`,
    })
  }

  return { updated: centers.length, sourceTotals }
}

const listTable = (res: any, table: string, mapRow: (row: any) => any, query: any = {}, orderBy = 'created_at DESC') => {
  const { page, pageSize, offset } = pageParams(query)
  const db = getDatabase()
  const total = (db.prepare(`SELECT COUNT(*) as total FROM ${table}`).get() as any)?.total || 0
  const rows = db.prepare(`SELECT * FROM ${table} ORDER BY ${orderBy} LIMIT ? OFFSET ?`).all(pageSize, offset) as any[]
  successList(res, rows.map(mapRow), page, pageSize, total)
}

const activityCenterPayload = (row: any) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  description: row.description || '',
  costDriverType: row.cost_driver_type || 'slide_count',
  parentId: row.parent_id || null,
  sortOrder: row.sort_order || 0,
  status: row.status || 'active',
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const costDriverPayload = (row: any) => ({
  id: row.id,
  code: row.code,
  name: row.name,
  unit: row.unit || '',
  calculationMethod: row.calculation_method || 'linear',
  tierRules: row.tier_rules ? JSON.parse(row.tier_rules) : null,
  description: row.description || '',
  status: row.status || 'active',
  createdAt: row.created_at,
})

const costExceptionPayload = (row: any) => ({
  id: row.id,
  exceptionNo: row.exception_no,
  sourceModule: row.source_module,
  sourceType: row.source_type,
  sourceId: row.source_id,
  projectId: row.project_id,
  projectName: row.project_name || null,
  bomId: row.bom_id,
  bomName: row.bom_name || null,
  outboundId: row.outbound_id,
  outboundNo: row.outbound_no || null,
  yearMonth: row.year_month,
  exceptionType: row.exception_type,
  severity: row.severity,
  status: row.status,
  message: row.message,
  details: parseJsonOrNull(row.details),
  retryCount: row.retry_count || 0,
  resolvedBy: row.resolved_by,
  resolvedAt: row.resolved_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const trimmedText = (value: unknown) => typeof value === 'string' ? value.trim() : ''

router.get('/periods', (req, res) => {
  try {
    const { page, pageSize, offset } = pageParams(req.query)
    const db = getDatabase()
    const { status, yearMonth } = req.query
    let where = '1 = 1'
    const params: any[] = []

    if (status) { where += ' AND status = ?'; params.push(status) }
    if (yearMonth) { where += ' AND year_month = ?'; params.push(yearMonth) }

    const total = (db.prepare(`SELECT COUNT(*) as total FROM abc_periods WHERE ${where}`).get(...params) as any)?.total || 0
    const rows = db.prepare(`
      SELECT * FROM abc_periods
      WHERE ${where}
      ORDER BY year_month DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as any[]

    successList(res, rows.map(periodPayload), page, pageSize, total)
  } catch (err: any) { error(res, err.message) }
})

router.post('/periods', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const yearMonth = normalizeMonth(req.body?.yearMonth)
    const remark = req.body?.remark || null
    const existing = db.prepare('SELECT * FROM abc_periods WHERE year_month = ?').get(yearMonth) as any

    if (existing) {
      if (remark !== null) {
        db.prepare('UPDATE abc_periods SET remark = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(remark, existing.id)
      }
      success(res, periodPayload(db.prepare('SELECT * FROM abc_periods WHERE id = ?').get(existing.id) as any))
      return
    }

    const id = uuidv4()
    db.prepare(`
      INSERT INTO abc_periods (id, year_month, status, started_at, remark)
      VALUES (?, ?, 'open', CURRENT_TIMESTAMP, ?)
    `).run(id, yearMonth, remark)
    writeAuditLog(db, 'period', 'create', id, { yearMonth, remark }, operator)
    success(res, periodPayload(db.prepare('SELECT * FROM abc_periods WHERE id = ?').get(id) as any), 'Created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.post('/periods/:id/start-collection', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const period = db.prepare('SELECT * FROM abc_periods WHERE id = ?').get(req.params.id) as any
    if (!period) { error(res, '成本期间不存在', 'NOT_FOUND', 404); return }
    if (period.status === 'closed') { error(res, '已关账期间不能重新开始归集', 'PERIOD_CLOSED', 422); return }

    db.prepare(`
      UPDATE abc_periods
      SET status = 'collecting', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(req.params.id)
    writeAuditLog(db, 'period', 'start_collection', req.params.id, { yearMonth: period.year_month }, operator)
    success(res, periodPayload(db.prepare('SELECT * FROM abc_periods WHERE id = ?').get(req.params.id) as any))
  } catch (err: any) { error(res, err.message) }
})

router.post('/periods/:id/close', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const period = db.prepare('SELECT * FROM abc_periods WHERE id = ?').get(req.params.id) as any
    if (!period) { error(res, '成本期间不存在', 'NOT_FOUND', 404); return }
    if (period.status === 'closed') { success(res, periodPayload(period)); return }

    const openFeeMapping = (db.prepare(`
      SELECT COUNT(*) as total
      FROM cost_exceptions
      WHERE (year_month = ? OR year_month IS NULL)
        AND status = 'open'
        AND exception_type = 'missing_fee_mapping'
    `).get(period.year_month) as any)?.total || 0
    if (openFeeMapping > 0) {
      error(res, '存在未处理的收费映射异常，不能关账', 'OPEN_FEE_MAPPING_EXCEPTIONS', 422, { blocking: openFeeMapping })
      return
    }
    const blocking = (db.prepare(`
      SELECT COUNT(*) as total
      FROM cost_exceptions
      WHERE (year_month = ? OR year_month IS NULL) AND status = 'open' AND severity = 'error'
    `).get(period.year_month) as any)?.total || 0
    if (blocking > 0) {
      error(res, '存在未处理的错误级成本异常，不能关账', 'OPEN_COST_EXCEPTIONS', 422, { blocking })
      return
    }
    const pendingCost = (db.prepare(`
      SELECT COUNT(*) as total
      FROM outbound_records
      WHERE is_deleted = 0
        AND status = 'completed'
        AND substr(created_at, 1, 7) = ?
        AND COALESCE(cost_status, 'pending_cost') IN ('pending_cost', 'cost_exception')
    `).get(period.year_month) as any)?.total || 0
    if (pendingCost > 0) {
      error(res, '存在未补算或成本异常的出库记录，不能关账', 'PENDING_COST_ITEMS', 422, { blocking: pendingCost })
      return
    }

    db.prepare(`
      UPDATE abc_periods
      SET status = 'closed', closed_by = ?, closed_at = CURRENT_TIMESTAMP,
          remark = COALESCE(?, remark), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(operator, req.body?.remark || null, req.params.id)
    writeAuditLog(db, 'period', 'close', req.params.id, { yearMonth: period.year_month }, operator)
    success(res, periodPayload(db.prepare('SELECT * FROM abc_periods WHERE id = ?').get(req.params.id) as any))
  } catch (err: any) { error(res, err.message) }
})

router.get('/activity-centers', (_req, res) => {
  try {
    const db = getDatabase()
    const rows = db.prepare('SELECT * FROM abc_activity_centers ORDER BY sort_order ASC, created_at DESC').all() as any[]
    success(res, rows.map(activityCenterPayload))
  } catch (err: any) { error(res, err.message) }
})

router.get('/activity-centers/:id', (req, res) => {
  try {
    const row = getDatabase().prepare('SELECT * FROM abc_activity_centers WHERE id = ?').get(req.params.id) as any
    if (!row) { error(res, '作业中心不存在', 'NOT_FOUND', 404); return }
    success(res, activityCenterPayload(row))
  } catch (err: any) { error(res, err.message) }
})

router.post('/activity-centers', requireCostWrite, (req, res) => {
  try {
    const { code, name, description, costDriverType, parentId, sortOrder } = req.body
    if (!code || !name) { error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return }
    const id = uuidv4()
    getDatabase().prepare(`
      INSERT INTO abc_activity_centers (id, code, name, description, cost_driver_type, parent_id, sort_order, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(id, code, name, description || null, costDriverType || 'slide_count', parentId || null, sortOrder || 0)
    success(res, { id }, 'Created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.put('/activity-centers/:id', requireCostWrite, (req, res) => {
  try {
    const { name, description, costDriverType, parentId, sortOrder, status } = req.body
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM abc_activity_centers WHERE id = ?').get(req.params.id) as any
    if (!existing) { error(res, '作业中心不存在', 'NOT_FOUND', 404); return }
    db.prepare(`
      UPDATE abc_activity_centers
      SET name = ?, description = ?, cost_driver_type = ?, parent_id = ?, sort_order = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name || existing.name,
      description !== undefined ? description : existing.description,
      costDriverType || existing.cost_driver_type,
      parentId !== undefined ? parentId : existing.parent_id,
      sortOrder !== undefined ? sortOrder : existing.sort_order,
      status || existing.status,
      req.params.id
    )
    success(res, { id: req.params.id }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

router.delete('/activity-centers/:id', requireCostWrite, (req, res) => {
  try {
    getDatabase().prepare('DELETE FROM abc_activity_centers WHERE id = ?').run(req.params.id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

router.get('/cost-drivers', (_req, res) => {
  try {
    const rows = getDatabase().prepare('SELECT * FROM abc_cost_drivers ORDER BY created_at DESC').all() as any[]
    success(res, rows.map(costDriverPayload))
  } catch (err: any) { error(res, err.message) }
})

router.post('/cost-drivers', requireCostWrite, (req, res) => {
  try {
    const { code, name, unit, calculationMethod, tierRules, description } = req.body
    if (!code || !name) { error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return }
    const id = uuidv4()
    getDatabase().prepare(`
      INSERT INTO abc_cost_drivers (id, code, name, unit, calculation_method, tier_rules, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, code, name, unit || '', calculationMethod || 'linear', tierRules ? JSON.stringify(tierRules) : null, description || null)
    success(res, { id }, 'Created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.put('/cost-drivers/:id', requireCostWrite, (req, res) => {
  try {
    const { name, unit, calculationMethod, tierRules, description, status } = req.body
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM abc_cost_drivers WHERE id = ?').get(req.params.id) as any
    if (!existing) { error(res, '成本动因不存在', 'NOT_FOUND', 404); return }
    db.prepare(`
      UPDATE abc_cost_drivers
      SET name = ?, unit = ?, calculation_method = ?, tier_rules = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name || existing.name,
      unit !== undefined ? unit : existing.unit,
      calculationMethod || existing.calculation_method,
      tierRules !== undefined ? JSON.stringify(tierRules) : existing.tier_rules,
      description !== undefined ? description : existing.description,
      status || existing.status,
      req.params.id
    )
    success(res, { id: req.params.id }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

router.delete('/cost-drivers/:id', requireCostWrite, (req, res) => {
  try {
    getDatabase().prepare('DELETE FROM abc_cost_drivers WHERE id = ?').run(req.params.id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

router.get('/cost-pools', (req, res) => {
  try {
    const { page, pageSize, offset } = pageParams(req.query)
    const db = getDatabase()
    const { yearMonth, activityCenterId, source, keyword } = req.query
    let where = '1 = 1'
    const params: any[] = []

    if (yearMonth) { where += ' AND p.year_month = ?'; params.push(String(yearMonth).slice(0, 7)) }
    if (activityCenterId) { where += ' AND p.activity_center_id = ?'; params.push(activityCenterId) }
    if (source) { where += ' AND p.source = ?'; params.push(source) }
    if (keyword) {
      where += ' AND (ac.name LIKE ? OR ac.code LIKE ? OR p.description LIKE ? OR p.source LIKE ?)'
      const kw = `%${String(keyword).trim()}%`
      params.push(kw, kw, kw, kw)
    }

    const total = (db.prepare(`
      SELECT COUNT(*) as total
      FROM abc_cost_pools p
      LEFT JOIN abc_activity_centers ac ON p.activity_center_id = ac.id
      WHERE ${where}
    `).get(...params) as any)?.total || 0
    const rows = db.prepare(`
      SELECT p.*, ac.name as activity_center_name, ac.code as activity_center_code
      FROM abc_cost_pools p
      LEFT JOIN abc_activity_centers ac ON p.activity_center_id = ac.id
      WHERE ${where}
      ORDER BY p.year_month DESC, ac.sort_order ASC, p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as any[]

    successList(res, rows.map(row => ({
      id: row.id,
      activityCenterId: row.activity_center_id,
      activityCenterName: row.activity_center_name || '未关联作业中心',
      activityCenterCode: row.activity_center_code || '',
      yearMonth: row.year_month,
      directCost: row.direct_cost || 0,
      indirectCost: row.indirect_cost || 0,
      totalCost: row.total_cost || row.amount || 0,
      driverQuantity: row.driver_quantity || 0,
      driverRate: row.driver_rate || 0,
      amount: row.amount || row.total_cost || 0,
      source: row.source,
      description: row.description,
      createdAt: row.created_at,
    })), page, pageSize, total)
  } catch (err: any) { error(res, err.message) }
})

router.post('/cost-pools', requireCostWrite, (req, res) => {
  try {
    const { activityCenterId, yearMonth, amount, directCost, indirectCost, driverQuantity, source, description } = req.body
    const db = getDatabase()
    const targetMonth = yearMonth || new Date().toISOString().slice(0, 7)
    const direct = Number(directCost) || 0
    const indirect = Number(indirectCost) || 0
    const total = amount !== undefined ? Number(amount) || 0 : direct + indirect
    const driverQty = Number(driverQuantity) || 0
    const driverRate = driverQty > 0 ? total / driverQty : 0

    const existing = activityCenterId
      ? db.prepare('SELECT id FROM abc_cost_pools WHERE activity_center_id = ? AND year_month = ?').get(activityCenterId, targetMonth) as any
      : null

    if (existing) {
      db.prepare(`
        UPDATE abc_cost_pools
        SET direct_cost = ?, indirect_cost = ?, total_cost = ?, driver_quantity = ?,
            driver_rate = ?, amount = ?, source = ?, description = ?
        WHERE id = ?
      `).run(direct, indirect, total, driverQty, driverRate, total, source || 'manual', description || null, existing.id)
      success(res, { id: existing.id }, 'Updated')
      return
    }

    const id = uuidv4()
    db.prepare(`
      INSERT INTO abc_cost_pools (
        id, activity_center_id, year_month,
        direct_cost, indirect_cost, total_cost, driver_quantity, driver_rate,
        amount, source, description
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      activityCenterId || null,
      targetMonth,
      direct,
      indirect,
      total,
      driverQty,
      driverRate,
      total,
      source || 'manual',
      description || null,
    )
    success(res, { id }, 'Created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.post('/cost-pools/:action(sync|auto-collect|recalculate)', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const yearMonth = normalizeMonth(req.body?.yearMonth)
    const action = req.params.action
    ensurePeriodOpen(db, yearMonth)
    const period = getOrCreatePeriod(db, yearMonth, operator)

    if (action === 'sync') {
      const sourceTotals = getCostSourceTotals(db, yearMonth)
      db.prepare(`
        UPDATE abc_periods
        SET status = 'collecting', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(period.id)
      writeAuditLog(db, 'cost_pool', 'sync', period.id, { yearMonth, sourceTotals }, operator)
      success(res, { yearMonth, periodId: period.id, sourceTotals }, 'Synced')
      return
    }

    if (action === 'auto-collect') {
      const result = autoCollectCostPools(db, yearMonth)
      db.prepare(`
        UPDATE abc_periods
        SET status = 'collecting', started_at = COALESCE(started_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(period.id)
      writeAuditLog(db, 'cost_pool', 'auto_collect', period.id, { yearMonth, ...result }, operator)
      success(res, { yearMonth, periodId: period.id, ...result }, 'Collected')
      return
    }

    const collectResult = autoCollectCostPools(db, yearMonth)
    const run = runCostRecalculation(db, yearMonth, operator, 'recalculate')
    success(res, { yearMonth, periodId: period.id, collectResult, run }, 'Recalculated')
  } catch (err: any) {
    const code = err.message?.includes('已关账') ? 'PERIOD_CLOSED' : 'INTERNAL_ERROR'
    error(res, err.message, code, code === 'PERIOD_CLOSED' ? 422 : 500)
  }
})

router.get('/bom-links/:bomId', (req, res) => {
  try {
    const rows = getDatabase().prepare(`
      SELECT l.*, ac.name as activity_center_name, ac.code as activity_center_code
      FROM bom_activity_links l
      LEFT JOIN abc_activity_centers ac ON l.activity_center_id = ac.id
      WHERE l.bom_id = ?
      ORDER BY l.sort_order ASC
    `).all(req.params.bomId) as any[]
    success(res, rows.map(row => ({
      id: row.id,
      bomId: row.bom_id,
      activityCenterId: row.activity_center_id,
      activityCenterName: row.activity_center_name,
      activityCenterCode: row.activity_center_code,
      quantity: row.quantity || 0,
      unit: row.unit,
      sortOrder: row.sort_order || 0,
    })))
  } catch (err: any) { error(res, err.message) }
})

router.put('/bom-links/:bomId', requireCostWrite, (req, res) => {
  try {
    const { links = [] } = req.body
    const db = getDatabase()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM bom_activity_links WHERE bom_id = ?').run(req.params.bomId)
      const stmt = db.prepare(`
        INSERT INTO bom_activity_links (id, bom_id, activity_center_id, quantity, unit, sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      links.forEach((link: any, index: number) => {
        stmt.run(uuidv4(), req.params.bomId, link.activityCenterId, Number(link.quantity) || 0, link.unit || null, link.sortOrder ?? index)
      })
      db.exec('COMMIT')
    } catch (innerErr) {
      db.exec('ROLLBACK')
      throw innerErr
    }
    success(res, { count: links.length }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

router.get('/bom-fee-mappings/audit', (req, res) => {
  try {
    const db = getDatabase()
    const { page, pageSize, offset } = pageParams(req.query)
    const status = ['mapped', 'legacy', 'missing'].includes(String(req.query.status))
      ? String(req.query.status)
      : ''
    const keyword = String(req.query.keyword || '').trim()
    const type = String(req.query.type || '').trim()
    const params: any[] = []
    let whereExtra = ''

    if (keyword) {
      whereExtra += ' AND (b.name LIKE ? OR b.code LIKE ?)'
      params.push(`%${keyword}%`, `%${keyword}%`)
    }
    if (type) {
      whereExtra += ' AND b.type = ?'
      params.push(type)
    }

    const baseSql = `${feeMappingAuditSelect}${whereExtra}${feeMappingAuditGroup}${feeMappingAuditHaving(status)}`
    const countRows = db.prepare(`SELECT COUNT(*) as total FROM (${baseSql}) audit_rows`).get(...params) as any
    const rows = db.prepare(`${baseSql} ORDER BY bom_name ASC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]
    const summaryRows = db.prepare(`${feeMappingAuditSelect}${whereExtra}${feeMappingAuditGroup}`).all(...params) as any[]
    const summary = summaryRows.reduce(
      (acc, row) => {
        acc.total += 1
        acc[feeMappingStatus(row)] += 1
        return acc
      },
      { total: 0, mapped: 0, legacy: 0, missing: 0 } as Record<string, number>,
    )

    successList(res, rows.map(feeMappingAuditPayload), page, pageSize, Number(countRows?.total) || 0, { summary })
  } catch (err: any) { error(res, err.message) }
})

router.post('/bom-fee-mappings/audit', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const yearMonth = normalizeMonth(req.body?.yearMonth || req.query.yearMonth)
    const rows = db.prepare(`${feeMappingAuditSelect}${feeMappingAuditGroup}`).all() as any[]
    const missingRows = rows.filter(row => feeMappingStatus(row) === 'missing')
    const configuredRows = rows.filter(row => feeMappingStatus(row) !== 'missing')
    let created = 0
    let updated = 0
    let resolved = 0

    db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of missingRows) {
        const existing = db.prepare(`
          SELECT id FROM cost_exceptions
          WHERE bom_id = ? AND exception_type = 'missing_fee_mapping' AND status = 'open'
        `).get(row.bom_id) as any
        const details = {
          bomCode: row.bom_code,
          bomName: row.bom_name,
          bomType: row.bom_type,
          action: 'configure_bom_fee_mapping',
        }
        if (existing) {
          db.prepare(`
            UPDATE cost_exceptions
            SET year_month = ?, message = ?, details = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            yearMonth,
            `BOM ${row.bom_name} 未配置收费映射，出库收费与利润核算不可确认`,
            JSON.stringify(details),
            existing.id,
          )
          updated += 1
        } else {
          recordCostException(db, {
            sourceModule: 'abc',
            sourceType: 'bom_fee_mapping',
            sourceId: row.bom_id,
            bomId: row.bom_id,
            yearMonth,
            exceptionType: 'missing_fee_mapping',
            severity: 'warning',
            message: `BOM ${row.bom_name} 未配置收费映射，出库收费与利润核算不可确认`,
            details,
          })
          created += 1
        }
      }

      const configuredIds = configuredRows.map(row => row.bom_id)
      if (configuredIds.length > 0) {
        const placeholders = configuredIds.map(() => '?').join(',')
        const result = db.prepare(`
          UPDATE cost_exceptions
          SET status = 'resolved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE exception_type = 'missing_fee_mapping'
            AND status = 'open'
            AND bom_id IN (${placeholders})
        `).run(operator, ...configuredIds)
        resolved = Number(result.changes) || 0
      }

      writeAuditLog(db, 'bom_fee_mapping', 'audit', null, {
        yearMonth,
        missing: missingRows.length,
        created,
        updated,
        resolved,
      }, operator)
      db.exec('COMMIT')
    } catch (innerErr) {
      db.exec('ROLLBACK')
      throw innerErr
    }

    success(res, {
      yearMonth,
      total: rows.length,
      missing: missingRows.length,
      created,
      updated,
      resolved,
      missingBoms: missingRows.map(feeMappingAuditPayload),
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/bom-fee-mappings/:bomId', (req, res) => {
  try {
    const rows = getDatabase().prepare(`
      SELECT m.*, fs.name as fee_standard_name, fs.code as fee_standard_code, fs.category,
             fs.fee_per_slide, fs.base_price, fs.tier_rules, fs.cap_amount
      FROM bom_fee_mappings m
      LEFT JOIN fee_standards fs ON m.fee_standard_id = fs.id
      WHERE m.bom_id = ?
      ORDER BY m.sort_order ASC, m.created_at ASC
    `).all(req.params.bomId) as any[]
    success(res, rows.map(row => ({
      id: row.id,
      bomId: row.bom_id,
      feeStandardId: row.fee_standard_id,
      feeStandardName: row.fee_standard_name,
      feeStandardCode: row.fee_standard_code,
      category: row.category,
      feePerSlide: row.fee_per_slide || 0,
      basePrice: row.base_price || 0,
      tierRules: parseJsonOrNull(row.tier_rules),
      capAmount: row.cap_amount,
      quantityMultiplier: row.quantity_multiplier || 1,
      aggregationScope: row.aggregation_scope || 'outbound',
      sortOrder: row.sort_order || 0,
      status: row.status || 'active',
    })))
  } catch (err: any) { error(res, err.message) }
})

router.post('/bom-fee-mappings/:bomId/preview', (req, res) => {
  try {
    const db = getDatabase()
    const sampleCount = Math.max(1, Number(req.body?.sampleCount) || 1)
    const month = normalizeMonth(req.body?.yearMonth)
    const caseNo = req.body?.caseNo || null
    const previewMappings = Array.isArray(req.body?.mappings)
      ? req.body.mappings
          .filter((mapping: any) => mapping?.feeStandardId)
          .map((mapping: any) => {
            const feeStandard = db.prepare('SELECT * FROM fee_standards WHERE id = ? AND status = ?')
              .get(mapping.feeStandardId, 'active') as any
            if (!feeStandard) return null
            return {
              fee_standard_id: feeStandard.id,
              fee_standard_name: feeStandard.name,
              category: feeStandard.category,
              project_type: feeStandard.project_type,
              fee_per_slide: feeStandard.fee_per_slide,
              base_price: feeStandard.base_price,
              tier_rules: feeStandard.tier_rules,
              cap_amount: feeStandard.cap_amount,
              quantity_multiplier: Number(mapping.quantityMultiplier) || 1,
              aggregation_scope: mapping.aggregationScope === 'case' ? 'case' : 'outbound',
            }
          })
          .filter(Boolean)
      : undefined
    const result = calculateSlideCostWithFee(db, {
      bomId: req.params.bomId,
      slideCount: sampleCount,
      blockCount: Number(req.body?.blockCount) || 1,
      month,
      materialCost: Number(req.body?.materialCost) || 0,
      caseNo,
      applyCaseAggregation: false,
      feeMappingsOverride: previewMappings,
    })

    success(res, {
      bomId: req.params.bomId,
      caseNo,
      yearMonth: month,
      sampleCount,
      feeAmount: result.feeAmount,
      feeBreakdown: result.feeBreakdown,
      totalCost: result.totalCost,
      profit: result.profit,
      profitRate: result.profitRate,
    })
  } catch (err: any) { error(res, err.message) }
})

router.put('/bom-fee-mappings/:bomId', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const mappings = Array.isArray(req.body?.mappings) ? req.body.mappings : []
    const operator = getOperator(req)

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM bom_fee_mappings WHERE bom_id = ?').run(req.params.bomId)
      const stmt = db.prepare(`
        INSERT INTO bom_fee_mappings (
          id, bom_id, fee_standard_id, quantity_multiplier,
          aggregation_scope, sort_order, status
        )
        VALUES (?, ?, ?, ?, ?, ?, 'active')
      `)
      mappings.forEach((mapping: any, index: number) => {
        if (!mapping.feeStandardId) return
        stmt.run(
          uuidv4(),
          req.params.bomId,
          mapping.feeStandardId,
          Number(mapping.quantityMultiplier) || 1,
          mapping.aggregationScope === 'case' ? 'case' : 'outbound',
          mapping.sortOrder ?? index,
        )
      })
      writeAuditLog(db, 'bom_fee_mapping', 'update', req.params.bomId, { count: mappings.length }, operator)
      db.exec('COMMIT')
    } catch (innerErr) {
      db.exec('ROLLBACK')
      throw innerErr
    }
    success(res, { bomId: req.params.bomId, count: mappings.length })
  } catch (err: any) { error(res, err.message) }
})

router.get('/fee-standards', (req, res) => {
  try {
    listTable(res, 'fee_standards', row => ({
      id: row.id,
      code: row.code,
      name: row.name,
      category: row.category,
      projectType: row.project_type,
      feePerSlide: row.fee_per_slide || 0,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }), req.query)
  } catch (err: any) { error(res, err.message) }
})

router.get('/fee-standards/:id', (req, res) => {
  try {
    const row = getDatabase().prepare('SELECT * FROM fee_standards WHERE id = ?').get(req.params.id) as any
    if (!row) { error(res, '收费标准不存在', 'NOT_FOUND', 404); return }
    success(res, row)
  } catch (err: any) { error(res, err.message) }
})

router.get('/dashboard', (req, res) => {
  try {
    const month = String(req.query.month || new Date().toISOString().slice(0, 7))
    const db = getDatabase()
    const summaryRow = db.prepare(`
      SELECT
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(fee_amount), 0) as total_fee,
        COALESCE(SUM(profit), 0) as total_profit,
        COALESCE(SUM(material_cost), 0) as material_cost,
        COALESCE(SUM(activity_cost), 0) as activity_cost,
        COALESCE(SUM(sample_count), 0) as sample_count,
        COUNT(*) as case_count
      FROM outbound_abc_details
      WHERE cost_month = ? AND ${countableAbcCostClause}
    `).get(month) as any
    const totalFee = Number(summaryRow.total_fee) || 0
    const totalProfit = Number(summaryRow.total_profit) || 0
    const previousSummary = db.prepare(`
      SELECT
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(fee_amount), 0) as total_fee,
        COALESCE(SUM(profit), 0) as total_profit
      FROM outbound_abc_details
      WHERE cost_month = ? AND ${countableAbcCostClause}
    `).get(previousMonth(month)) as any
    const previousTotalCost = Number(previousSummary.total_cost) || 0
    const previousTotalFee = Number(previousSummary.total_fee) || 0
    const previousTotalProfit = Number(previousSummary.total_profit) || 0
    const outboundCount = (db.prepare(`
      SELECT COUNT(*) as total
      FROM outbound_records
      WHERE is_deleted = 0 AND status = 'completed' AND substr(created_at, 1, 7) = ?
    `).get(month) as any)?.total || 0
    const abcSnapshotCount = (db.prepare(`
      SELECT COUNT(*) as total FROM outbound_abc_details WHERE cost_month = ?
    `).get(month) as any)?.total || 0
    const pendingCostCount = (db.prepare(`
      SELECT COUNT(*) as total
      FROM outbound_records
      WHERE is_deleted = 0 AND status = 'completed'
        AND substr(created_at, 1, 7) = ?
        AND COALESCE(cost_status, 'pending_cost') IN ('pending_cost', 'cost_exception')
    `).get(month) as any)?.total || 0
    const openExceptionCount = (db.prepare(`
      SELECT COUNT(*) as total
      FROM cost_exceptions
      WHERE status = 'open' AND (year_month = ? OR year_month IS NULL)
    `).get(month) as any)?.total || 0
    const adjustmentAmount = approvedAdjustmentTotal(db, month)
    const awaitingAdjustmentCount = pendingAdjustmentCount(db, month)
    const latestAdjustments = db.prepare(`
      SELECT *
      FROM abc_cost_adjustments
      WHERE year_month = ?
      ORDER BY created_at DESC
      LIMIT 5
    `).all(month) as any[]
    const profitByProject = db.prepare(`
      SELECT p.id as project_id, p.name as project_name, p.type as project_type,
        COUNT(d.id) as case_count,
        COALESCE(SUM(d.sample_count), 0) as sample_count,
        COALESCE(SUM(d.total_cost), 0) as total_cost,
        COALESCE(SUM(d.fee_amount), 0) as fee_amount,
        COALESCE(SUM(d.profit), 0) as profit
      FROM outbound_abc_details d
      LEFT JOIN projects p ON d.project_id = p.id
      WHERE d.cost_month = ? AND COALESCE(d.cost_status, 'costed') NOT IN ('pending_cost', 'cost_exception')
      GROUP BY p.id
      ORDER BY profit DESC
      LIMIT 10
    `).all(month) as any[]
    const costPoolTotal = (db.prepare(`
      SELECT COALESCE(SUM(total_cost), 0) as total
      FROM abc_cost_pools
      WHERE year_month = ?
    `).get(month) as any)?.total || 0
    const costByActivity = db.prepare(`
      SELECT
        p.activity_center_id,
        ac.name as activity_center_name,
        ac.code as activity_center_code,
        COALESCE(SUM(p.total_cost), 0) as cost
      FROM abc_cost_pools p
      LEFT JOIN abc_activity_centers ac ON p.activity_center_id = ac.id
      WHERE p.year_month = ?
      GROUP BY p.activity_center_id, ac.name, ac.code
      HAVING cost > 0
      ORDER BY cost DESC
      LIMIT 10
    `).all(month) as any[]
    const openExceptions = db.prepare(`
      SELECT e.*, p.name as project_name, b.name as bom_name, o.outbound_no
      FROM cost_exceptions e
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN boms b ON e.bom_id = b.id
      LEFT JOIN outbound_records o ON e.outbound_id = o.id
      WHERE e.status = 'open' AND (e.year_month = ? OR e.year_month IS NULL)
      ORDER BY CASE e.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, e.created_at DESC
      LIMIT 10
    `).all(month) as any[]
    success(res, {
      summary: {
        totalCost: Number(summaryRow.total_cost) || 0,
        totalFee,
        totalProfit,
        profitRate: totalFee > 0 ? totalProfit / totalFee : 0,
        adjustmentAmount,
        pendingAdjustmentCount: awaitingAdjustmentCount,
        adjustedTotalCost: (Number(summaryRow.total_cost) || 0) + adjustmentAmount,
        adjustedTotalProfit: totalProfit - adjustmentAmount,
        adjustedProfitRate: totalFee > 0 ? (totalProfit - adjustmentAmount) / totalFee : 0,
        caseCount: Number(summaryRow.case_count) || 0,
        sampleCount: Number(summaryRow.sample_count) || 0,
        outboundCount: Number(outboundCount) || 0,
        abcSnapshotCount: Number(abcSnapshotCount) || 0,
        openExceptionCount: Number(openExceptionCount) || 0,
        pendingCostCount: Number(pendingCostCount) || 0,
        materialCost: Number(summaryRow.material_cost) || 0,
        activityCost: Number(summaryRow.activity_cost) || 0,
        costChange: changeRate(Number(summaryRow.total_cost) || 0, previousTotalCost),
        feeChange: changeRate(totalFee, previousTotalFee),
        profitChange: changeRate(totalProfit, previousTotalProfit),
      },
      profitByProject: profitByProject.map(row => ({
        projectId: row.project_id,
        projectName: row.project_name || '未关联项目',
        projectType: row.project_type || '',
        caseCount: row.case_count || 0,
        sampleCount: row.sample_count || 0,
        totalCost: row.total_cost || 0,
        feeAmount: row.fee_amount || 0,
        profit: row.profit || 0,
        profitRate: row.fee_amount > 0 ? row.profit / row.fee_amount : 0,
      })),
      costByActivity: costByActivity.map(row => ({
        activityCenterId: row.activity_center_id,
        activityCenterName: row.activity_center_name || '未关联作业中心',
        activityCenterCode: row.activity_center_code || '',
        cost: Number(row.cost) || 0,
        ratio: costPoolTotal > 0 ? (Number(row.cost) || 0) / costPoolTotal : 0,
      })),
      alerts: openExceptions.map(costExceptionPayload),
      adjustments: latestAdjustments.map(costAdjustmentPayload),
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/exceptions', (req, res) => {
  try {
    const { page, pageSize, offset } = pageParams(req.query)
    const db = getDatabase()
    const { status, severity, yearMonth, sourceModule, exceptionType, keyword, outboundId, projectId, includeUnassigned } = req.query
    let where = '1 = 1'
    const params: any[] = []

    if (status) { where += ' AND e.status = ?'; params.push(status) }
    if (severity) { where += ' AND e.severity = ?'; params.push(severity) }
    if (yearMonth && includeUnassigned) {
      where += ' AND (e.year_month = ? OR e.year_month IS NULL)'
      params.push(yearMonth)
    } else if (yearMonth) {
      where += ' AND e.year_month = ?'
      params.push(yearMonth)
    }
    if (sourceModule) { where += ' AND e.source_module = ?'; params.push(sourceModule) }
    if (exceptionType) { where += ' AND e.exception_type = ?'; params.push(exceptionType) }
    if (outboundId) { where += ' AND e.outbound_id = ?'; params.push(outboundId) }
    if (projectId) { where += ' AND e.project_id = ?'; params.push(projectId) }
    if (keyword) {
      where += ' AND (e.exception_no LIKE ? OR e.message LIKE ? OR o.outbound_no LIKE ? OR p.name LIKE ? OR b.name LIKE ?)'
      const kw = `%${keyword}%`
      params.push(kw, kw, kw, kw, kw)
    }

    const total = (db.prepare(`
      SELECT COUNT(*) as total
      FROM cost_exceptions e
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN boms b ON e.bom_id = b.id
      LEFT JOIN outbound_records o ON e.outbound_id = o.id
      WHERE ${where}
    `).get(...params) as any)?.total || 0
    const summaryRows = db.prepare(`
      SELECT e.status, e.severity, COUNT(*) as count
      FROM cost_exceptions e
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN boms b ON e.bom_id = b.id
      LEFT JOIN outbound_records o ON e.outbound_id = o.id
      WHERE ${where}
      GROUP BY e.status, e.severity
    `).all(...params) as any[]
    const summary = summaryRows.reduce((acc, row) => {
      const count = Number(row.count) || 0
      acc.total += count
      acc.status[row.status] = (acc.status[row.status] || 0) + count
      acc.severity[row.severity] = (acc.severity[row.severity] || 0) + count
      return acc
    }, {
      total: 0,
      status: { open: 0, resolved: 0, ignored: 0 },
      severity: { error: 0, warning: 0, info: 0 },
    } as {
      total: number
      status: Record<string, number>
      severity: Record<string, number>
    })
    const rows = db.prepare(`
      SELECT e.*, p.name as project_name, b.name as bom_name, o.outbound_no
      FROM cost_exceptions e
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN boms b ON e.bom_id = b.id
      LEFT JOIN outbound_records o ON e.outbound_id = o.id
      WHERE ${where}
      ORDER BY CASE e.severity WHEN 'error' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, e.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as any[]

    successList(res, rows.map(costExceptionPayload), page, pageSize, total, { summary })
  } catch (err: any) { error(res, err.message) }
})

router.post('/exceptions/:id/resolve', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const row = db.prepare('SELECT * FROM cost_exceptions WHERE id = ?').get(req.params.id) as any
    if (!row) { error(res, '成本异常不存在', 'NOT_FOUND', 404); return }
    const remark = trimmedText(req.body?.remark)
    if (!remark) { error(res, '请填写处理说明', 'INVALID_PARAMETER', 400); return }

    const details = {
      ...(parseJsonOrNull(row.details) || {}),
      resolution: {
        action: 'resolve',
        remark,
        operator,
        at: new Date().toISOString(),
      },
    }
    db.prepare(`
      UPDATE cost_exceptions
      SET status = 'resolved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP,
          details = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(operator, JSON.stringify(details), req.params.id)
    writeAuditLog(db, 'exception', 'resolve', req.params.id, { exceptionNo: row.exception_no, remark }, operator)

    const updated = db.prepare(`
      SELECT e.*, p.name as project_name, b.name as bom_name, o.outbound_no
      FROM cost_exceptions e
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN boms b ON e.bom_id = b.id
      LEFT JOIN outbound_records o ON e.outbound_id = o.id
      WHERE e.id = ?
    `).get(req.params.id) as any
    success(res, costExceptionPayload(updated), 'Resolved')
  } catch (err: any) { error(res, err.message) }
})

router.post('/exceptions/:id/ignore', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const row = db.prepare('SELECT * FROM cost_exceptions WHERE id = ?').get(req.params.id) as any
    if (!row) { error(res, '成本异常不存在', 'NOT_FOUND', 404); return }
    const reason = trimmedText(req.body?.reason || req.body?.remark)
    if (!reason) { error(res, '请填写忽略原因', 'INVALID_PARAMETER', 400); return }

    const details = {
      ...(parseJsonOrNull(row.details) || {}),
      resolution: {
        action: 'ignore',
        reason,
        operator,
        at: new Date().toISOString(),
      },
    }
    db.prepare(`
      UPDATE cost_exceptions
      SET status = 'ignored', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP,
          details = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(operator, JSON.stringify(details), req.params.id)
    writeAuditLog(db, 'exception', 'ignore', req.params.id, { exceptionNo: row.exception_no, reason }, operator)

    const updated = db.prepare(`
      SELECT e.*, p.name as project_name, b.name as bom_name, o.outbound_no
      FROM cost_exceptions e
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN boms b ON e.bom_id = b.id
      LEFT JOIN outbound_records o ON e.outbound_id = o.id
      WHERE e.id = ?
    `).get(req.params.id) as any
    success(res, costExceptionPayload(updated), 'Ignored')
  } catch (err: any) { error(res, err.message) }
})

router.post('/exceptions/:id/retry', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const row = db.prepare('SELECT * FROM cost_exceptions WHERE id = ?').get(req.params.id) as any
    if (!row) { error(res, '成本异常不存在', 'NOT_FOUND', 404); return }
    if (!row.outbound_id) { error(res, '该异常没有关联出库记录，不能自动重试', 'INVALID_PARAMETER', 400); return }

    const yearMonth = normalizeMonth(row.year_month)
    ensurePeriodOpen(db, yearMonth)
    db.prepare('UPDATE cost_exceptions SET retry_count = retry_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(req.params.id)
    const run = runCostRecalculation(db, yearMonth, operator, 'recalculate', row.outbound_id)
    writeAuditLog(db, 'exception', 'retry', req.params.id, { exceptionNo: row.exception_no, runId: run.id }, operator)
    const updated = db.prepare(`
      SELECT e.*, p.name as project_name, b.name as bom_name, o.outbound_no
      FROM cost_exceptions e
      LEFT JOIN projects p ON e.project_id = p.id
      LEFT JOIN boms b ON e.bom_id = b.id
      LEFT JOIN outbound_records o ON e.outbound_id = o.id
      WHERE e.id = ?
    `).get(req.params.id) as any
    success(res, { exceptionId: req.params.id, run, exception: updated ? costExceptionPayload(updated) : null }, 'Retried')
  } catch (err: any) {
    const code = err.message?.includes('已关账') ? 'PERIOD_CLOSED' : 'INTERNAL_ERROR'
    error(res, err.message, code, code === 'PERIOD_CLOSED' ? 422 : 500)
  }
})

router.get('/cost-runs', (req, res) => {
  try {
    const { page, pageSize, offset } = pageParams(req.query)
    const db = getDatabase()
    const { yearMonth, status, runType } = req.query
    let where = '1 = 1'
    const params: any[] = []

    if (yearMonth) { where += ' AND year_month = ?'; params.push(yearMonth) }
    if (status) { where += ' AND status = ?'; params.push(status) }
    if (runType) { where += ' AND run_type = ?'; params.push(runType) }

    const total = (db.prepare(`SELECT COUNT(*) as total FROM cost_runs WHERE ${where}`).get(...params) as any)?.total || 0
    const rows = db.prepare(`
      SELECT * FROM cost_runs
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as any[]

    successList(res, rows.map(costRunPayload), page, pageSize, total)
  } catch (err: any) { error(res, err.message) }
})

router.get('/cost-runs/:id', (req, res) => {
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT * FROM cost_runs WHERE id = ?').get(req.params.id) as any
    if (!row) { error(res, '成本任务不存在', 'NOT_FOUND', 404); return }
    const details = db.prepare(`
      SELECT outbound_id as outboundId, project_id as projectId, bom_id as bomId,
             cost_month as costMonth, cost_status as costStatus, total_cost as totalCost,
             fee_amount as feeAmount, profit, created_at as createdAt
      FROM outbound_abc_details
      WHERE cost_run_id = ?
      ORDER BY created_at DESC
    `).all(req.params.id) as any[]
    success(res, { ...costRunPayload(row), details })
  } catch (err: any) { error(res, err.message) }
})

router.post('/cost-runs', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const yearMonth = normalizeMonth(req.body?.yearMonth)
    const runType = req.body?.runType || 'recalculate'
    const run = runCostRecalculation(db, yearMonth, operator, runType)
    success(res, run, 'Created', 201)
  } catch (err: any) {
    const code = err.message?.includes('已关账') ? 'PERIOD_CLOSED' : 'INTERNAL_ERROR'
    error(res, err.message, code, code === 'PERIOD_CLOSED' ? 422 : 500)
  }
})

router.get('/adjustments', (req, res) => {
  try {
    const { page, pageSize, offset } = pageParams(req.query)
    const db = getDatabase()
    const { yearMonth, status, adjustmentType } = req.query
    let where = '1 = 1'
    const params: any[] = []

    if (yearMonth) { where += ' AND year_month = ?'; params.push(String(yearMonth).slice(0, 7)) }
    if (status) { where += ' AND status = ?'; params.push(status) }
    if (adjustmentType) { where += ' AND adjustment_type = ?'; params.push(adjustmentType) }

    const total = (db.prepare(`SELECT COUNT(*) as total FROM abc_cost_adjustments WHERE ${where}`).get(...params) as any)?.total || 0
    const rows = db.prepare(`
      SELECT * FROM abc_cost_adjustments
      WHERE ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, pageSize, offset) as any[]

    successList(res, rows.map(costAdjustmentPayload), page, pageSize, total)
  } catch (err: any) { error(res, err.message) }
})

router.post('/adjustments', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const yearMonth = normalizeMonth(req.body?.yearMonth)
    const amount = Number(req.body?.amount)
    const reason = String(req.body?.reason || '').trim()
    const adjustmentType = String(req.body?.adjustmentType || 'manual').trim() || 'manual'

    if (!Number.isFinite(amount) || amount === 0) {
      error(res, '调整金额不能为 0', 'INVALID_PARAMETER', 400); return
    }
    if (!reason) {
      error(res, '调整原因不能为空', 'INVALID_PARAMETER', 400); return
    }

    const period = db.prepare('SELECT * FROM abc_periods WHERE year_month = ?').get(yearMonth) as any
    if (!period || period.status !== 'closed') {
      error(res, '只有已关账期间才能创建调整单', 'PERIOD_NOT_CLOSED', 422); return
    }

    const id = uuidv4()
    const adjustmentNo = `ADJ-${yearMonth.replace('-', '')}-${Date.now()}`
    db.prepare(`
      INSERT INTO abc_cost_adjustments (
        id, adjustment_no, year_month, adjustment_type, amount, reason,
        source_module, source_id, status, submitted_by
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
    `).run(
      id,
      adjustmentNo,
      yearMonth,
      adjustmentType,
      amount,
      reason,
      req.body?.sourceModule || null,
      req.body?.sourceId || null,
      operator,
    )
    writeAuditLog(db, 'cost_adjustment', 'create', id, { adjustmentNo, yearMonth, amount, reason }, operator)
    success(res, costAdjustmentPayload(db.prepare('SELECT * FROM abc_cost_adjustments WHERE id = ?').get(id) as any), 'Created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.post('/adjustments/:id/approve', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const row = db.prepare('SELECT * FROM abc_cost_adjustments WHERE id = ?').get(req.params.id) as any
    if (!row) { error(res, '调整单不存在', 'NOT_FOUND', 404); return }
    if (row.status !== 'pending') { error(res, '只有待审核调整单可以审核通过', 'INVALID_STATUS', 422); return }

    db.prepare(`
      UPDATE abc_cost_adjustments
      SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
          review_remark = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(operator, req.body?.remark || null, req.params.id)
    writeAuditLog(db, 'cost_adjustment', 'approve', req.params.id, {
      adjustmentNo: row.adjustment_no,
      yearMonth: row.year_month,
      amount: row.amount,
      remark: req.body?.remark || null,
    }, operator)
    success(res, costAdjustmentPayload(db.prepare('SELECT * FROM abc_cost_adjustments WHERE id = ?').get(req.params.id) as any), 'Approved')
  } catch (err: any) { error(res, err.message) }
})

router.post('/adjustments/:id/reject', requireCostWrite, (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const row = db.prepare('SELECT * FROM abc_cost_adjustments WHERE id = ?').get(req.params.id) as any
    if (!row) { error(res, '调整单不存在', 'NOT_FOUND', 404); return }
    if (row.status !== 'pending') { error(res, '只有待审核调整单可以驳回', 'INVALID_STATUS', 422); return }

    db.prepare(`
      UPDATE abc_cost_adjustments
      SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
          review_remark = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(operator, req.body?.remark || null, req.params.id)
    writeAuditLog(db, 'cost_adjustment', 'reject', req.params.id, {
      adjustmentNo: row.adjustment_no,
      yearMonth: row.year_month,
      amount: row.amount,
      remark: req.body?.remark || null,
    }, operator)
    success(res, costAdjustmentPayload(db.prepare('SELECT * FROM abc_cost_adjustments WHERE id = ?').get(req.params.id) as any), 'Rejected')
  } catch (err: any) { error(res, err.message) }
})

router.get('/profitability', (req, res) => {
  try {
    const { page, pageSize, offset } = pageParams(req.query)
    const db = getDatabase()
    const total = (db.prepare('SELECT COUNT(*) as total FROM outbound_abc_details').get() as any)?.total || 0
    const rows = db.prepare(`
      SELECT d.*, p.name as project_name, p.type as project_type
      FROM outbound_abc_details d
      LEFT JOIN projects p ON d.project_id = p.id
      ORDER BY d.created_at DESC
      LIMIT ? OFFSET ?
    `).all(pageSize, offset) as any[]
    successList(res, rows.map(row => ({
      outboundId: row.outbound_id,
      projectId: row.project_id,
      projectName: row.project_name || '未关联项目',
      projectType: row.project_type || '',
      sampleCount: row.sample_count || 0,
      materialCost: row.material_cost || 0,
      activityCost: row.activity_cost || 0,
      totalCost: row.total_cost || 0,
      feeAmount: row.fee_amount || 0,
      profit: row.profit || 0,
      profitRate: row.profit_rate || 0,
      costMonth: row.cost_month,
    })), page, pageSize, total)
  } catch (err: any) { error(res, err.message) }
})

router.get('/fee-comparison', (req, res) => {
  try {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT d.*, p.name as project_name
      FROM outbound_abc_details d
      LEFT JOIN projects p ON d.project_id = p.id
      ORDER BY d.created_at DESC
      LIMIT 100
    `).all() as any[]
    success(res, rows.map(row => ({
      projectName: row.project_name || '未关联项目',
      materialCost: row.material_cost || 0,
      activityCost: row.activity_cost || 0,
      totalCost: row.total_cost || 0,
      feeAmount: row.fee_amount || 0,
      profit: row.profit || 0,
      profitRate: row.profit_rate || 0,
    })))
  } catch (err: any) { error(res, err.message) }
})

router.get('/slide-cost-trend', (_req, res) => {
  try {
    const rows = getDatabase().prepare(`
      SELECT cost_month as month,
        COALESCE(SUM(total_cost), 0) as total_cost,
        COALESCE(SUM(activity_cost), 0) as activity_cost,
        COALESCE(SUM(material_cost), 0) as material_cost,
        COALESCE(SUM(sample_count), 0) as sample_count
      FROM outbound_abc_details
      GROUP BY cost_month
      ORDER BY cost_month ASC
    `).all() as any[]
    success(res, rows.map(row => ({
      month: row.month,
      totalCost: row.total_cost || 0,
      activityCost: row.activity_cost || 0,
      materialCost: row.material_cost || 0,
      sampleCount: row.sample_count || 0,
      costPerSlide: row.sample_count > 0 ? row.total_cost / row.sample_count : 0,
    })))
  } catch (err: any) { error(res, err.message) }
})

router.get('/export', (req, res) => {
  try {
    const db = getDatabase()
    const operator = getOperator(req)
    const { where, params } = monthRangeClause('d', req.query)
    let filterWhere = where
    const filterParams = [...params]
    if (req.query.projectType && req.query.projectType !== 'all') {
      filterWhere += ' AND p.type = ?'
      filterParams.push(req.query.projectType)
    }
    const rows = db.prepare(`
      SELECT d.*, o.outbound_no, o.type as outbound_type,
             p.name as project_name, p.type as project_type,
             b.name as bom_name, b.code as bom_code
      FROM outbound_abc_details d
      LEFT JOIN outbound_records o ON d.outbound_id = o.id
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN boms b ON d.bom_id = b.id
      WHERE ${filterWhere}
      ORDER BY d.cost_month DESC, d.created_at DESC
    `).all(...filterParams) as any[]
    const exceptionRows = db.prepare(`
      SELECT severity, status, COUNT(*) as count
      FROM cost_exceptions
      WHERE (? IS NULL OR year_month >= ?)
        AND (? IS NULL OR year_month <= ?)
      GROUP BY severity, status
    `).all(
      req.query.startMonth || req.query.startDate || req.query.month || req.query.yearMonth || null,
      String(req.query.startMonth || req.query.startDate || req.query.month || req.query.yearMonth || '').slice(0, 7),
      req.query.endMonth || req.query.endDate || req.query.month || req.query.yearMonth || null,
      String(req.query.endMonth || req.query.endDate || req.query.month || req.query.yearMonth || '').slice(0, 7),
    ) as any[]
    const adjustmentRows = db.prepare(`
      SELECT *
      FROM abc_cost_adjustments
      WHERE (? IS NULL OR year_month >= ?)
        AND (? IS NULL OR year_month <= ?)
      ORDER BY year_month DESC, created_at DESC
    `).all(
      req.query.startMonth || req.query.startDate || req.query.month || req.query.yearMonth || null,
      String(req.query.startMonth || req.query.startDate || req.query.month || req.query.yearMonth || '').slice(0, 7),
      req.query.endMonth || req.query.endDate || req.query.month || req.query.yearMonth || null,
      String(req.query.endMonth || req.query.endDate || req.query.month || req.query.yearMonth || '').slice(0, 7),
    ) as any[]
    const approvedAdjustmentAmount = adjustmentRows
      .filter(row => row.status === 'approved')
      .reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    const rawTotalCost = rows.reduce((sum, row) => sum + (Number(row.total_cost) || 0), 0)
    const rawProfit = rows.reduce((sum, row) => sum + (Number(row.profit) || 0), 0)

    const summary = {
      totalRecords: rows.length,
      sampleCount: rows.reduce((sum, row) => sum + (Number(row.sample_count) || 0), 0),
      materialCost: rows.reduce((sum, row) => sum + (Number(row.material_cost) || 0), 0),
      activityCost: rows.reduce((sum, row) => sum + (Number(row.activity_cost) || 0), 0),
      totalCost: rawTotalCost,
      feeAmount: rows.reduce((sum, row) => sum + (Number(row.fee_amount) || 0), 0),
      profit: rawProfit,
      adjustmentAmount: approvedAdjustmentAmount,
      adjustedTotalCost: rawTotalCost + approvedAdjustmentAmount,
      adjustedProfit: rawProfit - approvedAdjustmentAmount,
      pendingAdjustmentCount: adjustmentRows.filter(row => row.status === 'pending').length,
      exceptions: exceptionRows.reduce((acc: Record<string, number>, row) => {
        acc[`${row.severity}_${row.status}`] = row.count || 0
        return acc
      }, {}),
    }

    const detailCsv = toCsv(
      [
        'cost_month', 'outbound_no', 'project_name', 'project_type', 'bom_name',
        'sample_count', 'material_cost', 'activity_cost', 'total_cost',
        'fee_amount', 'profit', 'profit_rate', 'cost_status', 'cost_run_id',
      ],
      rows.map(row => [
        row.cost_month,
        row.outbound_no,
        row.project_name || '未关联项目',
        row.project_type || '',
        row.bom_name || row.bom_code || '',
        row.sample_count || 0,
        row.material_cost || 0,
        row.activity_cost || 0,
        row.total_cost || 0,
        row.fee_amount || 0,
        row.profit || 0,
        row.profit_rate || 0,
        row.cost_status || '',
        row.cost_run_id || '',
      ]),
    )
    const adjustmentCsv = toCsv(
      ['adjustment_no', 'year_month', 'adjustment_type', 'amount', 'status', 'reason', 'submitted_by', 'reviewed_by', 'review_remark'],
      adjustmentRows.map(row => [
        row.adjustment_no,
        row.year_month,
        row.adjustment_type,
        row.amount,
        row.status,
        row.reason,
        row.submitted_by,
        row.reviewed_by,
        row.review_remark,
      ]),
    )
    const summaryCsv = toCsv(
      ['metric', 'value'],
      [
        ['total_records', summary.totalRecords],
        ['sample_count', summary.sampleCount],
        ['material_cost', summary.materialCost],
        ['activity_cost', summary.activityCost],
        ['total_cost', summary.totalCost],
        ['fee_amount', summary.feeAmount],
        ['profit', summary.profit],
        ['adjustment_amount', summary.adjustmentAmount],
        ['adjusted_total_cost', summary.adjustedTotalCost],
        ['adjusted_profit', summary.adjustedProfit],
        ['pending_adjustment_count', summary.pendingAdjustmentCount],
      ],
    )
    const csv = `# summary\n${summaryCsv}\n\n# cost_details\n${detailCsv}\n\n# cost_adjustments\n${adjustmentCsv}`

    const filename = `abc-cost-export-${String(req.query.month || req.query.yearMonth || currentMonth()).slice(0, 7)}.csv`
    writeAuditLog(db, 'export', 'abc-cost-export', null, { filename, filters: req.query, totalRecords: rows.length }, operator)
    success(res, {
      filename,
      mimeType: 'text/csv;charset=utf-8',
      content: csv,
      summary,
      rows: rows.map(row => ({
        costMonth: row.cost_month,
        outboundId: row.outbound_id,
        outboundNo: row.outbound_no,
        projectName: row.project_name || '未关联项目',
        projectType: row.project_type || '',
        bomName: row.bom_name || row.bom_code || '',
        sampleCount: row.sample_count || 0,
        materialCost: row.material_cost || 0,
        activityCost: row.activity_cost || 0,
        totalCost: row.total_cost || 0,
        feeAmount: row.fee_amount || 0,
        profit: row.profit || 0,
        profitRate: row.profit_rate || 0,
        costStatus: row.cost_status,
        costRunId: row.cost_run_id,
      })),
      adjustments: adjustmentRows.map(costAdjustmentPayload),
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/batch-trace/:batchId', (req, res) => {
  try {
    const db = getDatabase()
    const batch = db.prepare(`
      SELECT b.*, m.name as material_name, m.code as material_code, m.unit,
             s.name as supplier_name
      FROM batches b
      LEFT JOIN materials m ON b.material_id = m.id
      LEFT JOIN suppliers s ON b.supplier_id = s.id
      WHERE b.id = ? OR b.batch_no = ?
    `).get(req.params.batchId, req.params.batchId) as any
    if (!batch) { error(res, '批次不存在', 'NOT_FOUND', 404); return }

    const outboundItems = db.prepare(`
      SELECT oi.*, o.outbound_no, o.type as outbound_type, o.project_id, o.created_at as outbound_at,
             p.name as project_name,
             d.id as abc_detail_id, d.cost_month, d.cost_status, d.total_cost as abc_total_cost,
             d.fee_amount, d.profit, d.cost_run_id
      FROM outbound_items oi
      LEFT JOIN outbound_records o ON oi.outbound_id = o.id
      LEFT JOIN projects p ON o.project_id = p.id
      LEFT JOIN outbound_abc_details d ON d.outbound_id = o.id
      WHERE oi.batch_id = ? OR oi.batch_no = ?
      ORDER BY o.created_at DESC
    `).all(batch.id, batch.batch_no) as any[]
    const stockLogs = db.prepare(`
      SELECT * FROM stock_logs
      WHERE material_id = ? AND (
        related_id = ?
        OR remark LIKE ?
        OR related_id IN (SELECT outbound_id FROM outbound_items WHERE batch_id = ? OR batch_no = ?)
      )
      ORDER BY created_at DESC
      LIMIT 100
    `).all(batch.material_id, batch.inbound_id, `%${batch.batch_no}%`, batch.id, batch.batch_no) as any[]

    success(res, {
      batch: {
        id: batch.id,
        batchNo: batch.batch_no,
        materialId: batch.material_id,
        materialCode: batch.material_code,
        materialName: batch.material_name,
        unit: batch.unit,
        inboundId: batch.inbound_id,
        inboundPrice: batch.inbound_price || 0,
        quantity: batch.quantity || 0,
        remaining: batch.remaining || 0,
        supplierName: batch.supplier_name,
        productionDate: batch.production_date,
        expiryDate: batch.expiry_date,
        createdAt: batch.created_at,
      },
      usage: outboundItems.map(row => ({
        outboundId: row.outbound_id,
        outboundNo: row.outbound_no,
        outboundType: row.outbound_type,
        projectId: row.project_id,
        projectName: row.project_name,
        quantity: row.quantity || 0,
        unit: row.unit,
        unitCost: row.unit_cost || 0,
        totalCost: row.total_cost || 0,
        costMonth: row.cost_month,
        costStatus: row.cost_status,
        abcTotalCost: row.abc_total_cost || 0,
        feeAmount: row.fee_amount || 0,
        profit: row.profit || 0,
        costRunId: row.cost_run_id,
        outboundAt: row.outbound_at,
      })),
      stockLogs: stockLogs.map(row => ({
        id: row.id,
        type: row.type,
        quantity: row.quantity || 0,
        beforeStock: row.before_stock || 0,
        afterStock: row.after_stock || 0,
        relatedId: row.related_id,
        relatedType: row.related_type,
        operator: row.operator,
        remark: row.remark,
        createdAt: row.created_at,
      })),
      summary: {
        consumedQuantity: outboundItems.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0),
        consumedCost: outboundItems.reduce((sum, row) => sum + (Number(row.total_cost) || 0), 0),
        outboundCount: new Set(outboundItems.map(row => row.outbound_id)).size,
        abcSnapshotCount: outboundItems.filter(row => row.abc_detail_id).length,
      },
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/variance-analysis', (req, res) => {
  try {
    const db = getDatabase()
    const { where, params } = monthRangeClause('d', req.query)
    let filterWhere = where
    const filterParams = [...params]
    if (req.query.projectType && req.query.projectType !== 'all') {
      filterWhere += ' AND p.type = ?'
      filterParams.push(req.query.projectType)
    }
    const groupBy = String(req.query.compareType || req.query.dimension || 'project')
    const rows = db.prepare(`
      SELECT d.*, o.outbound_no, o.total_cost as outbound_total_cost,
             p.id as project_id, p.name as project_name, p.type as project_type,
             b.id as bom_id, b.name as bom_name
      FROM outbound_abc_details d
      LEFT JOIN outbound_records o ON d.outbound_id = o.id
      LEFT JOIN projects p ON d.project_id = p.id
      LEFT JOIN boms b ON d.bom_id = b.id
      WHERE ${filterWhere}
      ORDER BY d.cost_month DESC, d.created_at DESC
    `).all(...filterParams) as any[]

    const groups = new Map<string, any>()
    for (const row of rows) {
      const key = groupBy === 'month'
        ? row.cost_month || '未分月'
        : groupBy === 'bom'
          ? row.bom_id || 'unknown-bom'
          : row.project_id || 'unknown-project'
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          month: groupBy === 'month' ? key : row.cost_month,
          projectId: row.project_id,
          projectName: groupBy === 'month' ? key : row.project_name || '未关联项目',
          projectType: row.project_type || '',
          bomId: row.bom_id,
          bomName: row.bom_name || '',
          materialActual: 0,
          activityCost: 0,
          totalActual: 0,
          totalStandard: 0,
          sampleCount: 0,
          recordCount: 0,
        })
      }
      const item = groups.get(key)
      const materialActual = Number(row.outbound_total_cost) || Number(row.material_cost) || 0
      const totalActual = Number(row.total_cost) || 0
      item.materialActual += materialActual
      item.activityCost += Number(row.activity_cost) || 0
      item.totalActual += totalActual
      item.totalStandard += materialActual
      item.sampleCount += Number(row.sample_count) || 0
      item.recordCount += 1
    }

    const list = [...groups.values()].map(item => {
      const variance = item.totalActual - item.totalStandard
      const varianceRate = item.totalStandard > 0 ? variance / item.totalStandard * 100 : 0
      return {
        ...item,
        materialStandard: item.totalStandard,
        laborStandard: 0,
        equipmentStandard: 0,
        indirectStandard: 0,
        totalVariance: Math.round(variance * 100) / 100,
        varianceRate: Math.round(varianceRate * 100) / 100,
        status: Math.abs(varianceRate) > 10 ? 'danger' : Math.abs(varianceRate) > 5 ? 'warn' : 'match',
      }
    })

    const summary = {
      totalActual: Math.round(list.reduce((sum, item) => sum + item.totalActual, 0) * 100) / 100,
      totalStandard: Math.round(list.reduce((sum, item) => sum + item.totalStandard, 0) * 100) / 100,
      totalVariance: Math.round(list.reduce((sum, item) => sum + item.totalVariance, 0) * 100) / 100,
      varianceRate: 0,
      recordCount: rows.length,
    }
    summary.varianceRate = summary.totalStandard > 0
      ? Math.round((summary.totalVariance / summary.totalStandard * 100) * 100) / 100
      : 0

    success(res, { list, summary })
  } catch (err: any) { error(res, err.message) }
})

router.get('/budgets', (req, res) => {
  try {
    listTable(res, 'abc_budgets', row => ({
      id: row.id,
      yearMonth: row.year_month,
      category: row.category,
      budgetAmount: row.budget_amount || 0,
      actualAmount: row.actual_amount || 0,
      description: row.description,
      createdAt: row.created_at,
    }), req.query)
  } catch (err: any) { error(res, err.message) }
})

router.post('/budgets', requireCostWrite, (req, res) => {
  try {
    const id = uuidv4()
    const { yearMonth, category, budgetAmount, actualAmount, description } = req.body
    getDatabase().prepare(`
      INSERT INTO abc_budgets (id, year_month, category, budget_amount, actual_amount, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, yearMonth || new Date().toISOString().slice(0, 7), category || null, Number(budgetAmount) || 0, Number(actualAmount) || 0, description || null)
    success(res, { id }, 'Created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.get('/quality-costs/summary', (req, res) => {
  try {
    const yearMonth = req.query.yearMonth || new Date().toISOString().slice(0, 7)
    const row = getDatabase().prepare('SELECT COALESCE(SUM(amount), 0) as total FROM quality_costs WHERE year_month = ?').get(yearMonth) as any
    success(res, { yearMonth, totalAmount: row?.total || 0 })
  } catch (err: any) { error(res, err.message) }
})

router.get('/quality-costs', (req, res) => {
  try {
    listTable(res, 'quality_costs', row => ({
      id: row.id,
      yearMonth: row.year_month,
      category: row.category,
      amount: row.amount || 0,
      description: row.description,
      createdAt: row.created_at,
    }), req.query)
  } catch (err: any) { error(res, err.message) }
})

router.post('/quality-costs', requireCostWrite, (req, res) => {
  try {
    const id = uuidv4()
    const { yearMonth, category, amount, description } = req.body
    getDatabase().prepare(`
      INSERT INTO quality_costs (id, year_month, category, amount, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, yearMonth || new Date().toISOString().slice(0, 7), category || null, Number(amount) || 0, description || null)
    success(res, { id }, 'Created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.get('/audit-logs', (req, res) => {
  try {
    listTable(res, 'abc_audit_logs', row => ({
      id: row.id,
      module: row.module,
      action: row.action,
      targetId: row.target_id,
      detail: row.detail,
      operator: row.operator,
      createdAt: row.created_at,
    }), req.query)
  } catch (err: any) { error(res, err.message) }
})

router.get('/alert-rules', (_req, res) => {
  try {
    const rows = getDatabase().prepare('SELECT * FROM abc_alert_rules ORDER BY created_at DESC').all() as any[]
    success(res, rows.map(row => ({
      id: row.id,
      type: row.type,
      name: row.name,
      threshold: row.threshold || 0,
      enabled: row.enabled === 1,
      createdAt: row.created_at,
    })))
  } catch (err: any) { error(res, err.message) }
})

router.post('/alert-rules', requireCostWrite, (req, res) => {
  try {
    const id = uuidv4()
    const { type, name, threshold, enabled } = req.body
    getDatabase().prepare(`
      INSERT INTO abc_alert_rules (id, type, name, threshold, enabled)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, type || 'profit', name || '成本预警', Number(threshold) || 0, enabled === false ? 0 : 1)
    success(res, { id }, 'Created', 201)
  } catch (err: any) { error(res, err.message) }
})

export default router
