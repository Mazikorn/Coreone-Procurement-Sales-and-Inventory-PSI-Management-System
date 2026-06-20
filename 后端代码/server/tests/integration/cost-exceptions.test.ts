process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'

const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

const previousMonth = (month: string) => {
  const [year, monthIndex] = month.split('-').map(Number)
  return new Date(Date.UTC(year, monthIndex - 2, 1)).toISOString().slice(0, 7)
}

async function getApp() {
  const { default: app } = await import('../../src/app.js')
  const { getDatabase, initializeDatabase } = await import('../../src/database/DatabaseManager.js')
  return { app, db: getDatabase(), initializeDatabase }
}

async function loginAdmin(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })

  expect(res.status).toBe(200)
  return res.body.data.token
}

async function loginPathologist(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'liuyf', password: 'CoreOne2026!' })

  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedBase(db: any, suffix: string) {
  const categoryId = `cat-${suffix}`
  const supplierId = `sup-${suffix}`
  const locationId = `loc-${suffix}`
  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)').run(categoryId, `C-${suffix}`, '成本异常分类', 1)
  db.prepare('INSERT INTO suppliers (id, code, name) VALUES (?, ?, ?)').run(supplierId, `S-${suffix}`, '成本异常供应商')
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)').run(locationId, `L-${suffix}`, 'A1', 'shelf', 'A区')
  return { categoryId, supplierId, locationId }
}

function seedMaterialWithStock(db: any, suffix: string, base: ReturnType<typeof seedBase>, stock = 100, price = 50) {
  const materialId = `mat-${suffix}`
  const batchId = `batch-${suffix}`
  const inboundId = `in-${suffix}`
  db.prepare(`
    INSERT INTO materials (id, code, name, unit, category_id, supplier_id, price, location_id)
    VALUES (?, ?, ?, '支', ?, ?, ?, ?)
  `).run(materialId, `M-${suffix}`, '成本异常主物料', base.categoryId, base.supplierId, price, base.locationId)
  db.prepare(`
    INSERT INTO inventory (id, material_id, stock, location_id)
    VALUES (?, ?, ?, ?)
  `).run(`inv-${suffix}`, materialId, stock, base.locationId)
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, inbound_id, inbound_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(batchId, materialId, `B-${suffix}`, stock, stock, inboundId, price)
  return materialId
}

function seedEmptyMaterial(db: any, suffix: string, base: ReturnType<typeof seedBase>) {
  const materialId = `mat-empty-${suffix}`
  db.prepare(`
    INSERT INTO materials (id, code, name, unit, category_id, supplier_id, price, location_id)
    VALUES (?, ?, ?, '支', ?, ?, 12, ?)
  `).run(materialId, `ME-${suffix}`, '成本异常缺货物料', base.categoryId, base.supplierId, base.locationId)
  db.prepare(`
    INSERT INTO inventory (id, material_id, stock, location_id)
    VALUES (?, ?, 0, ?)
  `).run(`inv-empty-${suffix}`, materialId, base.locationId)
  return materialId
}

function seedBomProject(db: any, suffix: string, materialId: string) {
  const bomId = `bom-${suffix}`
  const projectId = `proj-${suffix}`
  db.prepare(`
    INSERT INTO boms (id, code, name, version, type, status)
    VALUES (?, ?, ?, 'v1.0', 'ihc', 1)
  `).run(bomId, `BOM-${suffix}`, '成本异常BOM')
  db.prepare(`
    INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit)
    VALUES (?, ?, ?, 1, '支')
  `).run(`bi-${suffix}`, bomId, materialId)
  db.prepare(`
    INSERT INTO projects (id, code, name, type, bom_id, status)
    VALUES (?, ?, ?, 'ihc', ?, 1)
  `).run(projectId, `PRJ-${suffix}`, '成本异常项目', bomId)
  return { bomId, projectId }
}

function seedFeeMapping(db: any, suffix: string, bomId: string, feePerSlide = 80) {
  const feeStandardId = `fee-${suffix}`
  db.prepare(`
    INSERT INTO fee_standards (id, code, name, category, project_type, fee_per_slide, status)
    VALUES (?, ?, ?, 'test', 'ihc', ?, 'active')
  `).run(feeStandardId, `FEE-${suffix}`, '成本异常测试收费', feePerSlide)
  db.prepare(`
    INSERT INTO bom_fee_mappings (id, bom_id, fee_standard_id, quantity_multiplier, aggregation_scope, sort_order, status)
    VALUES (?, ?, ?, 1, 'outbound', 0, 'active')
  `).run(`bfm-${suffix}`, bomId, feeStandardId)
  return feeStandardId
}

describe('成本异常台账', () => {
  let app: any
  let db: any
  let token: string
  let initializeDatabase: () => void

  beforeAll(async () => {
    ({ app, db, initializeDatabase } = await getApp())
    token = await loginAdmin(app)
  })

  afterAll(() => {
    initializeDatabase()
  })

  it('主任可只读查看ABC看板但不能修改成本期间', async () => {
    const pathologistToken = await loginPathologist(app)

    const readRes = await request(app)
      .get('/api/v1/abc/dashboard')
      .set('Authorization', `Bearer ${pathologistToken}`)

    expect(readRes.status).toBe(200)
    expect(readRes.body.success).toBe(true)

    const writeRes = await request(app)
      .post('/api/v1/abc/periods')
      .set('Authorization', `Bearer ${pathologistToken}`)
      .send({ yearMonth: '2099-01' })

    expect(writeRes.status).toBe(403)
  })

  it('BOM出库扩展物料库存不足时阻断出库，不创建低估成本记录', async () => {
    const suffix = unique('block')
    const base = seedBase(db, suffix)
    const materialId = seedMaterialWithStock(db, `${suffix}-core`, base, 20, 30)
    const skippedMaterialId = seedEmptyMaterial(db, suffix, base)
    const { bomId, projectId } = seedBomProject(db, suffix, materialId)

    db.prepare(`
      INSERT INTO bom_general_reagents (id, bom_id, material_id, usage_per_sample, unit)
      VALUES (?, ?, ?, 1, '支')
    `).run(`gr-${suffix}`, bomId, skippedMaterialId)

    const res = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId, bomId, sampleCount: 2 })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('STOCK_INSUFFICIENT')

    const outboundCount = db.prepare(`
      SELECT COUNT(*) as total
      FROM outbound_records
      WHERE project_id = ? AND is_deleted = 0
    `).get(projectId) as any
    const skippedExceptionCount = db.prepare(`
      SELECT COUNT(*) as total
      FROM cost_exceptions
      WHERE bom_id = ? AND exception_type = 'bom_material_skipped'
    `).get(bomId) as any
    const skippedInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(skippedMaterialId) as any

    expect(outboundCount.total).toBe(0)
    expect(skippedExceptionCount.total).toBe(0)
    expect(skippedInventory?.stock || 0).toBe(0)
  })

  it('ABC详情写入失败时出库继续并写入成本异常', async () => {
    const suffix = unique('abc')
    const base = seedBase(db, suffix)
    const materialId = seedMaterialWithStock(db, `${suffix}-core`, base, 20, 40)
    const { bomId, projectId } = seedBomProject(db, suffix, materialId)

    db.exec('DROP TABLE outbound_abc_details')

    const res = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId, bomId, sampleCount: 3 })

    expect(res.status).toBe(201)
    expect(res.body.data.totalCost).toBe(120)

    const row = db.prepare(`
      SELECT *
      FROM cost_exceptions
      WHERE outbound_id = ? AND exception_type = 'abc_calculation_failed'
    `).get(res.body.data.id) as any
    expect(row).toBeDefined()
    expect(row.severity).toBe('error')
    expect(JSON.parse(row.details).materialCost).toBe(120)

    initializeDatabase()

    const list = await request(app)
      .get('/api/v1/abc/exceptions?exceptionType=abc_calculation_failed&sourceModule=abc')
      .set('Authorization', `Bearer ${token}`)

    expect(list.status).toBe(200)
    expect(list.body.data.list.some((item: any) => item.outboundId === res.body.data.id)).toBe(true)
  })

  it('BOM缺收费映射时出库成功但写入待处理成本异常', async () => {
    const suffix = unique('missing-fee')
    const base = seedBase(db, suffix)
    const materialId = seedMaterialWithStock(db, `${suffix}-core`, base, 20, 25)
    const { bomId, projectId } = seedBomProject(db, suffix, materialId)

    const res = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId, bomId, sampleCount: 2 })

    expect(res.status).toBe(201)

    const outbound = db.prepare('SELECT cost_status, fee_amount, profit FROM outbound_records WHERE id = ?')
      .get(res.body.data.id) as any
    expect(outbound.cost_status).toBe('cost_exception')
    expect(outbound.fee_amount).toBe(0)
    expect(outbound.profit).toBe(-50)

    const detail = db.prepare('SELECT cost_status, fee_amount, source_snapshot FROM outbound_abc_details WHERE outbound_id = ?')
      .get(res.body.data.id) as any
    expect(detail.cost_status).toBe('cost_exception')
    expect(detail.fee_amount).toBe(0)
    expect(JSON.parse(detail.source_snapshot).feeBreakdown).toEqual([])

    const exception = db.prepare(`
      SELECT *
      FROM cost_exceptions
      WHERE outbound_id = ? AND exception_type = 'missing_fee_mapping'
    `).get(res.body.data.id) as any
    expect(exception).toBeDefined()
    expect(exception.status).toBe('open')
    expect(exception.source_type).toBe('bom_outbound')
    expect(JSON.parse(exception.details).action).toBe('configure_bom_fee_mapping')

    const retryRes = await request(app)
      .post(`/api/v1/abc/exceptions/${exception.id}/retry`)
      .set('Authorization', `Bearer ${token}`)

    expect(retryRes.status).toBe(200)
    expect(retryRes.body.data.exception.status).toBe('open')
    expect(retryRes.body.data.exception.retryCount).toBe(1)
    expect(retryRes.body.data.exception.message).toContain('收费映射')

    const retriedException = db.prepare(`
      SELECT status, source_type, retry_count, message
      FROM cost_exceptions
      WHERE id = ?
    `).get(exception.id) as any
    expect(retriedException.status).toBe('open')
    expect(retriedException.source_type).toBe('cost_run')
    expect(retriedException.retry_count).toBe(1)
    expect(retriedException.message).toContain('收费映射')

    const retriedOutbound = db.prepare('SELECT cost_status, fee_amount, profit FROM outbound_records WHERE id = ?')
      .get(res.body.data.id) as any
    expect(retriedOutbound.cost_status).toBe('cost_exception')
    expect(retriedOutbound.fee_amount).toBe(0)

    const period = db.prepare('SELECT id FROM abc_periods WHERE year_month = ?').get(exception.year_month) as any
    const blockedClose = await request(app)
      .post(`/api/v1/abc/periods/${period.id}/close`)
      .set('Authorization', `Bearer ${token}`)

    expect(blockedClose.status).toBe(422)
    expect(blockedClose.body.error.code).toBe('OPEN_FEE_MAPPING_EXCEPTIONS')
  })

  it('成本异常可处理且期间关账会校验错误级开放异常', async () => {
    const yearMonth = '2099-01'
    const periodRes = await request(app)
      .post('/api/v1/abc/periods')
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth, remark: '测试期间' })

    expect(periodRes.status).toBe(201)
    expect(periodRes.body.data.status).toBe('open')

    const startRes = await request(app)
      .post(`/api/v1/abc/periods/${periodRes.body.data.id}/start-collection`)
      .set('Authorization', `Bearer ${token}`)

    expect(startRes.status).toBe(200)
    expect(startRes.body.data.status).toBe('collecting')

    const exceptionId = `ex-${Date.now()}`
    db.prepare(`
      INSERT INTO cost_exceptions (
        id, exception_no, source_module, source_type, year_month,
        exception_type, severity, status, message
      )
      VALUES (?, ?, 'abc', 'period_close_test', ?, 'calculation_failed', 'error', 'open', '测试开放异常')
    `).run(exceptionId, `CE-${Date.now()}`, yearMonth)
    const nullMonthExceptionId = `ex-null-${Date.now()}`
    db.prepare(`
      INSERT INTO cost_exceptions (
        id, exception_no, source_module, source_type, year_month,
        exception_type, severity, status, message
      )
      VALUES (?, ?, 'abc', 'period_close_test', NULL, 'calculation_failed', 'error', 'open', '测试无月份开放异常')
    `).run(nullMonthExceptionId, `CE-NULL-${Date.now()}`)
    const warningExceptionId = `ex-warning-${Date.now()}`
    db.prepare(`
      INSERT INTO cost_exceptions (
        id, exception_no, source_module, source_type, year_month,
        exception_type, severity, status, message
      )
      VALUES (?, ?, 'abc', 'period_close_test', ?, 'manual_review', 'warning', 'open', '测试可忽略异常')
    `).run(warningExceptionId, `CE-WARN-${Date.now()}`, yearMonth)

    const listRes = await request(app)
      .get(`/api/v1/abc/exceptions?yearMonth=${yearMonth}&pageSize=1`)
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.list).toHaveLength(1)
    expect(listRes.body.data.pagination.total).toBeGreaterThanOrEqual(2)
    expect(listRes.body.data.summary.total).toBeGreaterThanOrEqual(2)
    expect(listRes.body.data.summary.status.open).toBeGreaterThanOrEqual(2)
    expect(listRes.body.data.summary.severity.error).toBeGreaterThanOrEqual(1)
    expect(listRes.body.data.summary.severity.warning).toBeGreaterThanOrEqual(1)

    const listWithUnassigned = await request(app)
      .get(`/api/v1/abc/exceptions?yearMonth=${yearMonth}&includeUnassigned=1&pageSize=100`)
      .set('Authorization', `Bearer ${token}`)

    expect(listWithUnassigned.status).toBe(200)
    expect(listWithUnassigned.body.data.list.some((item: any) => item.id === nullMonthExceptionId)).toBe(true)
    expect(listWithUnassigned.body.data.summary.status.open).toBeGreaterThanOrEqual(3)

    const blockedClose = await request(app)
      .post(`/api/v1/abc/periods/${periodRes.body.data.id}/close`)
      .set('Authorization', `Bearer ${token}`)

    expect(blockedClose.status).toBe(422)
    expect(blockedClose.body.error.code).toBe('OPEN_COST_EXCEPTIONS')

    const emptyResolve = await request(app)
      .post(`/api/v1/abc/exceptions/${exceptionId}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remark: '   ' })

    expect(emptyResolve.status).toBe(400)
    expect(emptyResolve.body.error.code).toBe('INVALID_PARAMETER')

    const emptyIgnore = await request(app)
      .post(`/api/v1/abc/exceptions/${warningExceptionId}/ignore`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '' })

    expect(emptyIgnore.status).toBe(400)
    expect(emptyIgnore.body.error.code).toBe('INVALID_PARAMETER')

    const ignoreRes = await request(app)
      .post(`/api/v1/abc/exceptions/${warningExceptionId}/ignore`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '业务确认不影响关账' })

    expect(ignoreRes.status).toBe(200)
    expect(ignoreRes.body.data.status).toBe('ignored')

    const resolveRes = await request(app)
      .post(`/api/v1/abc/exceptions/${exceptionId}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remark: '已确认不影响本期核算' })

    expect(resolveRes.status).toBe(200)
    expect(resolveRes.body.data.status).toBe('resolved')
    expect(resolveRes.body.data.resolvedBy).toBe('admin')

    const ignoreResolved = await request(app)
      .post(`/api/v1/abc/exceptions/${exceptionId}/ignore`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '尝试覆盖已解决结论' })

    expect(ignoreResolved.status).toBe(409)
    expect(ignoreResolved.body.error.code).toBe('COST_EXCEPTION_ALREADY_HANDLED')

    const resolvedAfterConflict = db.prepare('SELECT status, resolved_by FROM cost_exceptions WHERE id = ?')
      .get(exceptionId) as any
    expect(resolvedAfterConflict.status).toBe('resolved')
    expect(resolvedAfterConflict.resolved_by).toBe('admin')

    const resolveIgnored = await request(app)
      .post(`/api/v1/abc/exceptions/${warningExceptionId}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remark: '尝试覆盖已忽略结论' })

    expect(resolveIgnored.status).toBe(409)
    expect(resolveIgnored.body.error.code).toBe('COST_EXCEPTION_ALREADY_HANDLED')

    const ignoredAfterConflict = db.prepare('SELECT status, resolved_by FROM cost_exceptions WHERE id = ?')
      .get(warningExceptionId) as any
    expect(ignoredAfterConflict.status).toBe('ignored')
    expect(ignoredAfterConflict.resolved_by).toBe('admin')

    const blockedByNullMonth = await request(app)
      .post(`/api/v1/abc/periods/${periodRes.body.data.id}/close`)
      .set('Authorization', `Bearer ${token}`)

    expect(blockedByNullMonth.status).toBe(422)
    expect(blockedByNullMonth.body.error.code).toBe('OPEN_COST_EXCEPTIONS')

    const resolveNullMonth = await request(app)
      .post(`/api/v1/abc/exceptions/${nullMonthExceptionId}/resolve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remark: '已确认无月份异常也已处理' })

    expect(resolveNullMonth.status).toBe(200)

    const retryHandledExceptionId = `ex-retry-handled-${Date.now()}`
    const retryHandledOutboundId = `out-retry-handled-${Date.now()}`
    db.prepare(`
      INSERT INTO outbound_records (
        id, outbound_no, type, total_cost, operator, status,
        created_at, updated_at, cost_status, sample_count
      )
      VALUES (?, ?, 'bom', 12, 'tester', 'completed', ?, ?, 'recalculated', 1)
    `).run(retryHandledOutboundId, `OUT-RETRY-HANDLED-${Date.now()}`, `${yearMonth}-15 10:00:00`, `${yearMonth}-15 10:00:00`)
    db.prepare(`
      INSERT INTO cost_exceptions (
        id, exception_no, source_module, source_type, source_id, outbound_id, year_month,
        exception_type, severity, status, message, retry_count
      )
      VALUES (?, ?, 'abc', 'period_close_test', ?, ?, ?, 'calculation_failed', 'error', 'resolved', '已处理异常不能重试', 0)
    `).run(retryHandledExceptionId, `CE-RETRY-HANDLED-${Date.now()}`, retryHandledOutboundId, retryHandledOutboundId, yearMonth)

    const retryHandled = await request(app)
      .post(`/api/v1/abc/exceptions/${retryHandledExceptionId}/retry`)
      .set('Authorization', `Bearer ${token}`)

    expect(retryHandled.status).toBe(409)
    expect(retryHandled.body.error.code).toBe('COST_EXCEPTION_ALREADY_HANDLED')

    const retriedHandledAfterConflict = db.prepare('SELECT status, retry_count FROM cost_exceptions WHERE id = ?')
      .get(retryHandledExceptionId) as any
    expect(retriedHandledAfterConflict.status).toBe('resolved')
    expect(retriedHandledAfterConflict.retry_count).toBe(0)

    const pendingOutboundId = `out-pending-${Date.now()}`
    db.prepare(`
      INSERT INTO outbound_records (
        id, outbound_no, type, total_cost, operator, status,
        created_at, updated_at, cost_status, sample_count
      )
      VALUES (?, ?, 'bom', 12, 'tester', 'completed', ?, ?, 'cost_exception', 1)
    `).run(pendingOutboundId, `OUT-PENDING-${Date.now()}`, `${yearMonth}-15 10:00:00`, `${yearMonth}-15 10:00:00`)

    const blockedByPendingCost = await request(app)
      .post(`/api/v1/abc/periods/${periodRes.body.data.id}/close`)
      .set('Authorization', `Bearer ${token}`)

    expect(blockedByPendingCost.status).toBe(422)
    expect(blockedByPendingCost.body.error.code).toBe('PENDING_COST_ITEMS')

    db.prepare("UPDATE outbound_records SET cost_status = 'recalculated' WHERE id = ?").run(pendingOutboundId)

    const closeRes = await request(app)
      .post(`/api/v1/abc/periods/${periodRes.body.data.id}/close`)
      .set('Authorization', `Bearer ${token}`)

    expect(closeRes.status).toBe(200)
    expect(closeRes.body.data.status).toBe('closed')

    const audit = db.prepare(`
      SELECT COUNT(*) as total FROM abc_audit_logs WHERE target_id = ?
    `).get(exceptionId) as any
    expect(audit.total).toBeGreaterThan(0)
  })

  it('已关账期间不能重算，但可通过审核后的调整单修正财务结果', async () => {
    const yearMonth = '2099-02'
    const periodRes = await request(app)
      .post('/api/v1/abc/periods')
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth, remark: '关账后调整测试期间' })

    expect(periodRes.status).toBe(201)

    const closeRes = await request(app)
      .post(`/api/v1/abc/periods/${periodRes.body.data.id}/close`)
      .set('Authorization', `Bearer ${token}`)

    expect(closeRes.status).toBe(200)
    expect(closeRes.body.data.status).toBe('closed')

    const blockedRun = await request(app)
      .post('/api/v1/abc/cost-runs')
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth, runType: 'recalculate' })

    expect(blockedRun.status).toBe(422)
    expect(blockedRun.body.error.code).toBe('PERIOD_CLOSED')

    const adjustmentRes = await request(app)
      .post('/api/v1/abc/adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({
        yearMonth,
        adjustmentType: 'closed_period_adjustment',
        amount: 128.5,
        reason: '关账后发现设备折旧差异，按财务复核结果调增成本',
      })

    expect(adjustmentRes.status).toBe(201)
    expect(adjustmentRes.body.data.status).toBe('pending')
    expect(adjustmentRes.body.data.amount).toBe(128.5)

    const listRes = await request(app)
      .get(`/api/v1/abc/adjustments?yearMonth=${yearMonth}`)
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.list).toHaveLength(1)

    const approveRes = await request(app)
      .post(`/api/v1/abc/adjustments/${adjustmentRes.body.data.id}/approve`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remark: '测试审核通过' })

    expect(approveRes.status).toBe(200)
    expect(approveRes.body.data.status).toBe('approved')
    expect(approveRes.body.data.reviewedBy).toBe('admin')

    const dashboardRes = await request(app)
      .get(`/api/v1/abc/dashboard?month=${yearMonth}`)
      .set('Authorization', `Bearer ${token}`)

    expect(dashboardRes.status).toBe(200)
    expect(dashboardRes.body.data.summary.adjustmentAmount).toBe(128.5)
    expect(dashboardRes.body.data.summary.adjustedTotalCost).toBe(128.5)
    expect(dashboardRes.body.data.summary.adjustedTotalProfit).toBe(-128.5)
    expect(dashboardRes.body.data.adjustments[0].status).toBe('approved')

    const exportRes = await request(app)
      .get(`/api/v1/abc/export?month=${yearMonth}`)
      .set('Authorization', `Bearer ${token}`)

    expect(exportRes.status).toBe(200)
    expect(exportRes.body.data.summary.adjustmentAmount).toBe(128.5)
    expect(exportRes.body.data.content).toContain('# summary')
    expect(exportRes.body.data.content).toContain('adjusted_profit,-128.5')
    expect(exportRes.body.data.content).toContain('# cost_adjustments')
    expect(exportRes.body.data.content).toContain(adjustmentRes.body.data.adjustmentNo)

    const audit = db.prepare(`
      SELECT COUNT(*) as total
      FROM abc_audit_logs
      WHERE module = 'cost_adjustment' AND target_id = ?
    `).get(adjustmentRes.body.data.id) as any
    expect(audit.total).toBeGreaterThanOrEqual(2)
  })

  it('同一病例多个BOM按病例聚合阶梯收费', async () => {
    const suffix = unique('casefee')
    const caseNo = `CASE-${suffix}`
    const base = seedBase(db, suffix)
    const materialId = seedMaterialWithStock(db, `${suffix}-core`, base, 20, 10)
    const first = seedBomProject(db, `${suffix}-a`, materialId)
    const second = seedBomProject(db, `${suffix}-b`, materialId)
    const feeStandardId = `fee-${suffix}`

    db.prepare(`
      INSERT INTO fee_standards (
        id, code, name, category, project_type,
        fee_per_slide, base_price, tier_rules, status
      )
      VALUES (?, ?, '病例聚合阶梯费', 'case_aggregate', 'ihc', 100, 100, ?, 'active')
    `).run(
      feeStandardId,
      `FEE-${suffix}`,
      JSON.stringify([
        { maxQuantity: 1, unitPrice: 100 },
        { unitPrice: 50 },
      ]),
    )

    const mappingA = await request(app)
      .put(`/api/v1/abc/bom-fee-mappings/${first.bomId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mappings: [{ feeStandardId, quantityMultiplier: 1, aggregationScope: 'case' }] })
    expect(mappingA.status).toBe(200)

    const mappingB = await request(app)
      .put(`/api/v1/abc/bom-fee-mappings/${second.bomId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mappings: [{ feeStandardId, quantityMultiplier: 1, aggregationScope: 'case' }] })
    expect(mappingB.status).toBe(200)

    const mappingList = await request(app)
      .get(`/api/v1/abc/bom-fee-mappings/${first.bomId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(mappingList.status).toBe(200)
    expect(mappingList.body.data[0].aggregationScope).toBe('case')

    const preview = await request(app)
      .post(`/api/v1/abc/bom-fee-mappings/${first.bomId}/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({ sampleCount: 2, caseNo })
    expect(preview.status).toBe(200)
    expect(preview.body.data.feeAmount).toBe(150)
    expect(preview.body.data.feeBreakdown[0].aggregationScope).toBe('case')

    const firstOutbound = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: first.projectId, bomId: first.bomId, sampleCount: 1, caseNo })
    expect(firstOutbound.status).toBe(201)

    const secondOutbound = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: second.projectId, bomId: second.bomId, sampleCount: 1, caseNo })
    expect(secondOutbound.status).toBe(201)

    const firstDetail = db.prepare('SELECT * FROM outbound_abc_details WHERE outbound_id = ?')
      .get(firstOutbound.body.data.id) as any
    const secondDetail = db.prepare('SELECT * FROM outbound_abc_details WHERE outbound_id = ?')
      .get(secondOutbound.body.data.id) as any
    expect(firstDetail.case_no).toBe(caseNo)
    expect(secondDetail.case_no).toBe(caseNo)
    expect(firstDetail.fee_amount).toBe(100)
    expect(secondDetail.fee_amount).toBe(50)

    const group = db.prepare(`
      SELECT * FROM case_charge_groups
      WHERE case_no = ? AND fee_standard_id = ?
    `).get(caseNo, feeStandardId) as any
    expect(group.total_quantity).toBe(2)
    expect(group.total_fee).toBe(150)
    expect(group.outbound_count).toBe(2)
    expect(JSON.parse(secondDetail.source_snapshot).feeBreakdown[0].aggregationScope).toBe('case')

    const cancelSecond = await request(app)
      .delete(`/api/v1/outbound/${secondOutbound.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'case-charge-reversal-test' })
    expect(cancelSecond.status).toBe(200)

    const reversedGroup = db.prepare(`
      SELECT * FROM case_charge_groups
      WHERE case_no = ? AND fee_standard_id = ?
    `).get(caseNo, feeStandardId) as any
    expect(reversedGroup.total_quantity).toBe(1)
    expect(reversedGroup.total_fee).toBe(100)
    expect(reversedGroup.outbound_count).toBe(1)

    const removedDetail = db.prepare('SELECT * FROM outbound_abc_details WHERE outbound_id = ?')
      .get(secondOutbound.body.data.id) as any
    expect(removedDetail).toBeUndefined()
  })

  it('取消非最新病例出库后会重排剩余ABC明细的阶梯收费', async () => {
    const suffix = unique('case-replay')
    const caseNo = `CASE-${suffix}`
    const base = seedBase(db, suffix)
    const materialId = seedMaterialWithStock(db, `${suffix}-core`, base, 20, 10)
    const first = seedBomProject(db, `${suffix}-a`, materialId)
    const second = seedBomProject(db, `${suffix}-b`, materialId)
    const third = seedBomProject(db, `${suffix}-c`, materialId)
    const feeStandardId = `fee-${suffix}`

    db.prepare(`
      INSERT INTO fee_standards (
        id, code, name, category, project_type,
        fee_per_slide, base_price, tier_rules, status
      )
      VALUES (?, ?, '病例聚合重排费', 'case_aggregate', 'ihc', 100, 100, ?, 'active')
    `).run(
      feeStandardId,
      `FEE-${suffix}`,
      JSON.stringify([
        { maxQuantity: 1, unitPrice: 100 },
        { maxQuantity: 2, unitPrice: 80 },
        { unitPrice: 20 },
      ]),
    )

    for (const bomId of [first.bomId, second.bomId, third.bomId]) {
      const mapping = await request(app)
        .put(`/api/v1/abc/bom-fee-mappings/${bomId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ mappings: [{ feeStandardId, quantityMultiplier: 1, aggregationScope: 'case' }] })
      expect(mapping.status).toBe(200)
    }

    const firstOutbound = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: first.projectId, bomId: first.bomId, sampleCount: 1, caseNo })
    const secondOutbound = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: second.projectId, bomId: second.bomId, sampleCount: 1, caseNo })
    const thirdOutbound = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: third.projectId, bomId: third.bomId, sampleCount: 1, caseNo })
    expect(firstOutbound.status).toBe(201)
    expect(secondOutbound.status).toBe(201)
    expect(thirdOutbound.status).toBe(201)

    const thirdBefore = db.prepare('SELECT fee_amount, profit, source_snapshot FROM outbound_abc_details WHERE outbound_id = ?')
      .get(thirdOutbound.body.data.id) as any
    expect(thirdBefore.fee_amount).toBe(20)
    expect(JSON.parse(thirdBefore.source_snapshot).feeBreakdown[0].feeAmount).toBe(20)

    const cancelMiddle = await request(app)
      .delete(`/api/v1/outbound/${secondOutbound.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'case-charge-replay-test' })
    expect(cancelMiddle.status).toBe(200)

    const group = db.prepare(`
      SELECT * FROM case_charge_groups
      WHERE case_no = ? AND fee_standard_id = ?
    `).get(caseNo, feeStandardId) as any
    expect(group.total_quantity).toBe(2)
    expect(group.total_fee).toBe(180)
    expect(group.outbound_count).toBe(2)

    const firstAfter = db.prepare('SELECT fee_amount FROM outbound_abc_details WHERE outbound_id = ?')
      .get(firstOutbound.body.data.id) as any
    const thirdAfter = db.prepare('SELECT fee_amount, profit, source_snapshot FROM outbound_abc_details WHERE outbound_id = ?')
      .get(thirdOutbound.body.data.id) as any
    expect(firstAfter.fee_amount).toBe(100)
    expect(thirdAfter.fee_amount).toBe(80)
    expect(thirdAfter.profit).toBe(70)
    expect(JSON.parse(thirdAfter.source_snapshot).feeBreakdown[0].feeAmount).toBe(80)

    const removedDetail = db.prepare('SELECT * FROM outbound_abc_details WHERE outbound_id = ?')
      .get(secondOutbound.body.data.id) as any
    expect(removedDetail).toBeUndefined()
  })

  it('收费映射完整性审计会把未映射BOM写入异常并在补齐后关闭', async () => {
    const suffix = unique('mapaudit')
    const base = seedBase(db, suffix)
    const materialId = seedMaterialWithStock(db, `${suffix}-core`, base, 20, 10)
    const { bomId } = seedBomProject(db, suffix, materialId)

    const missingList = await request(app)
      .get(`/api/v1/abc/bom-fee-mappings/audit?keyword=${encodeURIComponent(`BOM-${suffix}`)}&status=missing`)
      .set('Authorization', `Bearer ${token}`)

    expect(missingList.status).toBe(200)
    expect(missingList.body.data.list.some((item: any) => item.bomId === bomId)).toBe(true)
    expect(missingList.body.data.summary.missing).toBeGreaterThanOrEqual(1)

    const audit = await request(app)
      .post('/api/v1/abc/bom-fee-mappings/audit')
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth: '2099-02' })

    expect(audit.status).toBe(200)
    expect(audit.body.data.missingBoms.some((item: any) => item.bomId === bomId)).toBe(true)

    const exception = db.prepare(`
      SELECT *
      FROM cost_exceptions
      WHERE bom_id = ? AND exception_type = 'missing_fee_mapping'
    `).get(bomId) as any
    expect(exception).toBeDefined()
    expect(exception.status).toBe('open')
    expect(exception.source_type).toBe('bom_fee_mapping')

    const draftPreview = await request(app)
      .post(`/api/v1/abc/bom-fee-mappings/${bomId}/preview`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        sampleCount: 2,
        mappings: [{ feeStandardId: 'FEE-003', quantityMultiplier: 1, aggregationScope: 'outbound' }],
      })
    expect(draftPreview.status).toBe(200)
    expect(draftPreview.body.data.feeAmount).toBe(410)
    expect(draftPreview.body.data.feeBreakdown[0].feeStandardId).toBe('FEE-003')

    const mapping = await request(app)
      .put(`/api/v1/abc/bom-fee-mappings/${bomId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ mappings: [{ feeStandardId: 'FEE-003', quantityMultiplier: 1, aggregationScope: 'outbound' }] })
    expect(mapping.status).toBe(200)

    const mappedList = await request(app)
      .get(`/api/v1/abc/bom-fee-mappings/audit?keyword=${encodeURIComponent(`BOM-${suffix}`)}&status=mapped`)
      .set('Authorization', `Bearer ${token}`)
    expect(mappedList.status).toBe(200)
    expect(mappedList.body.data.list.some((item: any) => item.bomId === bomId && item.status === 'mapped')).toBe(true)

    const closeAudit = await request(app)
      .post('/api/v1/abc/bom-fee-mappings/audit')
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth: '2099-02' })
    expect(closeAudit.status).toBe(200)
    expect(closeAudit.body.data.resolved).toBeGreaterThanOrEqual(1)

    const resolved = db.prepare('SELECT status, resolved_by FROM cost_exceptions WHERE id = ?')
      .get(exception.id) as any
    expect(resolved.status).toBe('resolved')
    expect(resolved.resolved_by).toBe('admin')
  })

  it('成本池重算会生成成本任务并更新成本快照', async () => {
    const suffix = unique('run')
    const yearMonth = '2099-07'
    const base = seedBase(db, suffix)
    const materialId = seedMaterialWithStock(db, `${suffix}-core`, base, 20, 25)
    const { bomId, projectId } = seedBomProject(db, suffix, materialId)
    seedFeeMapping(db, suffix, bomId, 90)

    const outbound = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId, bomId, sampleCount: 2 })

    expect(outbound.status).toBe(201)
    db.prepare('UPDATE outbound_records SET created_at = ?, updated_at = ? WHERE id = ?')
      .run(`${yearMonth}-08T09:00:00`, `${yearMonth}-08T09:00:00`, outbound.body.data.id)
    db.prepare('UPDATE outbound_abc_details SET cost_month = ? WHERE outbound_id = ?')
      .run(yearMonth, outbound.body.data.id)

    db.prepare('UPDATE abc_activity_centers SET status = 1').run()

    const collect = await request(app)
      .post('/api/v1/abc/cost-pools/auto-collect')
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth })

    expect(collect.status).toBe(200)
    expect(collect.body.data.updated).toBeGreaterThan(0)

    const pools = await request(app)
      .get(`/api/v1/abc/cost-pools?yearMonth=${yearMonth}`)
      .set('Authorization', `Bearer ${token}`)

    expect(pools.status).toBe(200)
    expect(pools.body.data.list.length).toBeGreaterThan(0)
    expect(pools.body.data.list[0].yearMonth).toBe(yearMonth)
    expect(pools.body.data.list[0].source).toBe('auto_collect')
    expect(pools.body.data.list[0].activityCenterName).toBeTruthy()
    expect(pools.body.data.list[0].driverQuantity).toBeGreaterThan(0)
    expect(pools.body.data.list[0].driverRate).toBeGreaterThanOrEqual(0)

    const keywordPools = await request(app)
      .get(`/api/v1/abc/cost-pools?yearMonth=${yearMonth}&keyword=${encodeURIComponent('切片')}`)
      .set('Authorization', `Bearer ${token}`)

    expect(keywordPools.status).toBe(200)
    expect(keywordPools.body.data.list.some((item: any) => item.activityCenterName.includes('切片'))).toBe(true)

    const recalc = await request(app)
      .post('/api/v1/abc/cost-pools/recalculate')
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth })

    expect(recalc.status).toBe(200)
    expect(recalc.body.data.run.summary.processed).toBeGreaterThanOrEqual(1)

    const detail = db.prepare(`
      SELECT * FROM outbound_abc_details WHERE outbound_id = ?
    `).get(outbound.body.data.id) as any
    expect(detail.cost_run_id).toBe(recalc.body.data.run.id)
    expect(detail.cost_status).toBe('recalculated')

    db.prepare(`
      INSERT INTO outbound_abc_details (
        id, outbound_id, bom_id, project_id, sample_count,
        material_cost, activity_cost, total_cost, fee_amount, profit,
        cost_month, cost_status
      )
      VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 'costed')
    `).run(
      `prev-${suffix}`,
      `prev-out-${suffix}`,
      bomId,
      projectId,
      Math.max(1, Number(detail.material_cost || 0) / 2),
      Math.max(1, Number(detail.activity_cost || 0) / 2),
      Math.max(1, Number(detail.total_cost || 0) / 2),
      Math.max(1, Number(detail.fee_amount || 0) / 2),
      Number(detail.profit || 0) / 2,
      previousMonth(yearMonth),
    )

    const record = db.prepare('SELECT cost_status FROM outbound_records WHERE id = ?').get(outbound.body.data.id) as any
    expect(record.cost_status).toBe('recalculated')

    const dashboard = await request(app)
      .get(`/api/v1/abc/dashboard?month=${yearMonth}`)
      .set('Authorization', `Bearer ${token}`)

    expect(dashboard.status).toBe(200)
    expect(dashboard.body.data.summary.outboundCount).toBeGreaterThanOrEqual(1)
    expect(dashboard.body.data.summary.abcSnapshotCount).toBeGreaterThanOrEqual(1)
    expect(dashboard.body.data.summary.pendingCostCount).toBeGreaterThanOrEqual(0)
    expect(dashboard.body.data.summary.openExceptionCount).toBeGreaterThanOrEqual(0)
    expect(dashboard.body.data.summary.costChange).not.toBe(0)
    expect(dashboard.body.data.costByActivity.length).toBeGreaterThan(0)
    expect(dashboard.body.data.costByActivity[0].cost).toBeGreaterThan(0)

    const exported = await request(app)
      .get(`/api/v1/abc/export?month=${yearMonth}`)
      .set('Authorization', `Bearer ${token}`)

    expect(exported.status).toBe(200)
    expect(exported.body.data.filename).toContain(yearMonth)
    expect(exported.body.data.content).toContain('# summary')
    expect(exported.body.data.content).toContain('# cost_details')
    expect(exported.body.data.content).toContain(outbound.body.data.outboundNo)
    expect(exported.body.data.summary.totalRecords).toBeGreaterThanOrEqual(1)

    const trace = await request(app)
      .get(`/api/v1/abc/batch-trace/batch-${suffix}-core`)
      .set('Authorization', `Bearer ${token}`)

    expect(trace.status).toBe(200)
    expect(trace.body.data.batch.batchNo).toBe(`B-${suffix}-core`)
    expect(trace.body.data.usage.some((item: any) => item.outboundId === outbound.body.data.id)).toBe(true)
    expect(trace.body.data.summary.consumedQuantity).toBeGreaterThanOrEqual(2)

    const variance = await request(app)
      .get(`/api/v1/abc/variance-analysis?month=${yearMonth}&compareType=project`)
      .set('Authorization', `Bearer ${token}`)

    expect(variance.status).toBe(200)
    expect(variance.body.data.summary.recordCount).toBeGreaterThanOrEqual(1)
    expect(variance.body.data.list.some((item: any) => item.projectId === projectId)).toBe(true)

    const closed = await request(app)
      .post(`/api/v1/abc/periods/${recalc.body.data.periodId}/close`)
      .set('Authorization', `Bearer ${token}`)

    expect(closed.status).toBe(200)
    expect(closed.body.data.status).toBe('closed')

    const blocked = await request(app)
      .post('/api/v1/abc/cost-runs')
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth, runType: 'recalculate' })

    expect(blocked.status).toBe(422)
    expect(blocked.body.error.code).toBe('PERIOD_CLOSED')
  })

  it('成本看板经营指标只统计已核算快照，异常快照只进入阻断统计', async () => {
    const suffix = unique('dash-cost-status')
    const yearMonth = '2099-08'

    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, total_cost, sample_count, operator, status, created_at, cost_status)
      VALUES
        (?, ?, 'bom', 120, 2, 'admin', 'completed', '2099-08-08T09:00:00', 'recalculated'),
        (?, ?, 'bom', 300, 3, 'admin', 'completed', '2099-08-09T09:00:00', 'cost_exception')
    `).run(
      `dash-ok-out-${suffix}`, `DASH-OK-${suffix}`,
      `dash-ex-out-${suffix}`, `DASH-EX-${suffix}`,
    )
    db.prepare(`
      INSERT INTO outbound_abc_details (
        id, outbound_id, sample_count, material_cost, activity_cost,
        total_cost, fee_amount, profit, cost_month, cost_status
      )
      VALUES
        (?, ?, 2, 70, 50, 120, 200, 80, ?, 'recalculated'),
        (?, ?, 3, 180, 120, 300, 0, -300, ?, 'cost_exception')
    `).run(
      `dash-ok-detail-${suffix}`, `dash-ok-out-${suffix}`, yearMonth,
      `dash-ex-detail-${suffix}`, `dash-ex-out-${suffix}`, yearMonth,
    )

    const dashboard = await request(app)
      .get(`/api/v1/abc/dashboard?month=${yearMonth}`)
      .set('Authorization', `Bearer ${token}`)

    expect(dashboard.status).toBe(200)
    expect(dashboard.body.data.summary).toMatchObject({
      totalCost: 120,
      totalFee: 200,
      totalProfit: 80,
      caseCount: 1,
      sampleCount: 2,
      abcSnapshotCount: 2,
      pendingCostCount: 1,
      materialCost: 70,
      activityCost: 50,
    })
    expect(dashboard.body.data.profitByProject).toHaveLength(1)
    expect(dashboard.body.data.profitByProject[0]).toMatchObject({
      totalCost: 120,
      feeAmount: 200,
      profit: 80,
      sampleCount: 2,
    })
  })
})
