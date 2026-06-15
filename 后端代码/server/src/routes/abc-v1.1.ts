import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'

const router = Router()

const pageParams = (query: any) => {
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 20))
  return { page, pageSize, offset: (page - 1) * pageSize }
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

router.post('/activity-centers', (req, res) => {
  try {
    const { code, name, description, costDriverType, parentId, sortOrder } = req.body
    if (!code || !name) { error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return }
    const id = uuidv4()
    getDatabase().prepare(`
      INSERT INTO abc_activity_centers (id, code, name, description, cost_driver_type, parent_id, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, code, name, description || null, costDriverType || 'slide_count', parentId || null, sortOrder || 0)
    success(res, { id }, 'Created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.put('/activity-centers/:id', (req, res) => {
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

router.delete('/activity-centers/:id', (req, res) => {
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

router.post('/cost-drivers', (req, res) => {
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

router.put('/cost-drivers/:id', (req, res) => {
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

router.delete('/cost-drivers/:id', (req, res) => {
  try {
    getDatabase().prepare('DELETE FROM abc_cost_drivers WHERE id = ?').run(req.params.id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

router.get('/cost-pools', (req, res) => {
  try {
    listTable(res, 'abc_cost_pools', row => ({
      id: row.id,
      activityCenterId: row.activity_center_id,
      yearMonth: row.year_month,
      amount: row.amount || 0,
      source: row.source,
      description: row.description,
      createdAt: row.created_at,
    }), req.query)
  } catch (err: any) { error(res, err.message) }
})

router.post('/cost-pools', (req, res) => {
  try {
    const { activityCenterId, yearMonth, amount, source, description } = req.body
    const id = uuidv4()
    getDatabase().prepare(`
      INSERT INTO abc_cost_pools (id, activity_center_id, year_month, amount, source, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, activityCenterId || null, yearMonth || new Date().toISOString().slice(0, 7), Number(amount) || 0, source || 'manual', description || null)
    success(res, { id }, 'Created', 201)
  } catch (err: any) { error(res, err.message) }
})

router.post('/cost-pools/:action(sync|auto-collect|recalculate)', (req, res) => {
  success(res, { yearMonth: req.body?.yearMonth || new Date().toISOString().slice(0, 7) }, 'OK')
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

router.put('/bom-links/:bomId', (req, res) => {
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
      WHERE cost_month = ?
    `).get(month) as any
    const totalFee = Number(summaryRow.total_fee) || 0
    const totalProfit = Number(summaryRow.total_profit) || 0
    const profitByProject = db.prepare(`
      SELECT p.id as project_id, p.name as project_name, p.type as project_type,
        COUNT(d.id) as case_count,
        COALESCE(SUM(d.sample_count), 0) as sample_count,
        COALESCE(SUM(d.total_cost), 0) as total_cost,
        COALESCE(SUM(d.fee_amount), 0) as fee_amount,
        COALESCE(SUM(d.profit), 0) as profit
      FROM outbound_abc_details d
      LEFT JOIN projects p ON d.project_id = p.id
      WHERE d.cost_month = ?
      GROUP BY p.id
      ORDER BY profit DESC
      LIMIT 10
    `).all(month) as any[]
    success(res, {
      summary: {
        totalCost: Number(summaryRow.total_cost) || 0,
        totalFee,
        totalProfit,
        profitRate: totalFee > 0 ? totalProfit / totalFee : 0,
        caseCount: Number(summaryRow.case_count) || 0,
        sampleCount: Number(summaryRow.sample_count) || 0,
        materialCost: Number(summaryRow.material_cost) || 0,
        activityCost: Number(summaryRow.activity_cost) || 0,
        costChange: 0,
        feeChange: 0,
        profitChange: 0,
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
      costByActivity: [],
      alerts: [],
    })
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

router.get('/export', (_req, res) => success(res, { url: null }))
router.get('/batch-trace/:batchId', (req, res) => success(res, { batchId: req.params.batchId, list: [] }))
router.get('/variance-analysis', (_req, res) => success(res, { list: [], summary: {} }))

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

router.post('/budgets', (req, res) => {
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

router.post('/quality-costs', (req, res) => {
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

router.post('/alert-rules', (req, res) => {
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
