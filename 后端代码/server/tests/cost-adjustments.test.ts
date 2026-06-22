process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../src/app.js')
  const { getDatabase } = await import('../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function loginUser(app: any, username: string, password: string): Promise<{ token: string; userId: string }> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password })
  expect(res.status).toBe(200)
  expect(res.body.success).toBe(true)
  return { token: res.body.data.token, userId: res.body.data.user.id }
}

function latestOperationLog(db: any, operation: string, entityId: string) {
  return db.prepare(`
    SELECT *
    FROM operation_logs
    WHERE operation = ?
      AND (request_data LIKE ? OR response_data LIKE ?)
    ORDER BY created_at DESC, rowid DESC
    LIMIT 1
  `).get(operation, `%${entityId}%`, `%${entityId}%`) as any
}

describe('季度成本调整', () => {
  let app: any
  let db: any
  let token: string
  let adminUserId: string
  let financeToken: string
  let financeUserId: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    const admin = await loginUser(app, 'admin', 'admin123')
    const finance = await loginUser(app, 'caiwu', 'CoreOne2026!')
    token = admin.token
    adminUserId = admin.userId
    financeToken = finance.token
    financeUserId = finance.userId
  })

  it('COST-ADJ-001: 创建调整单必须拒绝非法季度和不可解释实际金额且不写入脏记录', async () => {
    const suffix = Date.now()
    const costCenterId = `cost-adj-center-${suffix}`

    db.prepare(`
      INSERT INTO indirect_cost_centers (id, code, name, cost_type, monthly_amount, allocation_base, status)
      VALUES (?, ?, '调整单校验成本中心', 'rent', 1000, 'sample_count', 1)
    `).run(costCenterId, `COST-ADJ-${suffix}`)

    const invalidQuarter = await request(app)
      .post('/api/v1/cost-adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ costCenterId, yearQuarter: '2026-Q5', actualAmount: 1000 })

    expect(invalidQuarter.status).toBe(400)
    expect(invalidQuarter.body.success).toBe(false)
    expect(invalidQuarter.body.error.code).toBe('INVALID_PARAMETER')

    const nonNumericAmount = await request(app)
      .post('/api/v1/cost-adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ costCenterId, yearQuarter: '2026-Q2', actualAmount: 'abc' })

    expect(nonNumericAmount.status).toBe(400)
    expect(nonNumericAmount.body.success).toBe(false)
    expect(nonNumericAmount.body.error.code).toBe('INVALID_PARAMETER')

    const negativeAmount = await request(app)
      .post('/api/v1/cost-adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ costCenterId, yearQuarter: '2026-Q2', actualAmount: -1 })

    expect(negativeAmount.status).toBe(400)
    expect(negativeAmount.body.success).toBe(false)
    expect(negativeAmount.body.error.code).toBe('INVALID_PARAMETER')

    const dirtyCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM cost_adjustments
      WHERE cost_center_id = ?
    `).get(costCenterId) as any)?.count || 0
    expect(Number(dirtyCount)).toBe(0)
  })

  it('合法创建调整单时按季度预提金额计算调整金额', async () => {
    const suffix = Date.now()
    const costCenterId = `cost-adj-valid-center-${suffix}`

    db.prepare(`
      INSERT INTO indirect_cost_centers (id, code, name, cost_type, monthly_amount, allocation_base, status)
      VALUES (?, ?, '合法调整单成本中心', 'rent', 1000, 'sample_count', 1)
    `).run(costCenterId, `COST-ADJ-VALID-${suffix}`)
    db.prepare(`
      INSERT INTO indirect_cost_allocations (id, cost_center_id, year_month, total_amount, allocation_base_value, allocation_rate)
      VALUES
        (?, ?, '2026-04', 100, 10, 10),
        (?, ?, '2026-05', 200, 10, 20),
        (?, ?, '2026-06', 300, 10, 30)
    `).run(
      `cost-adj-valid-alloc-1-${suffix}`, costCenterId,
      `cost-adj-valid-alloc-2-${suffix}`, costCenterId,
      `cost-adj-valid-alloc-3-${suffix}`, costCenterId,
    )

    const res = await request(app)
      .post('/api/v1/cost-adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ costCenterId, yearQuarter: '2026-Q2', actualAmount: 750, adjustmentReason: '季度发票核对' })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.adjustmentAmount).toBe(150)

    const row = db.prepare(`
      SELECT year_quarter, pre_provision_amount, actual_amount, adjustment_amount, submitted_by, review_status
      FROM cost_adjustments
      WHERE id = ?
    `).get(res.body.data.id) as any

    expect(row).toMatchObject({
      year_quarter: '2026-Q2',
      pre_provision_amount: 600,
      actual_amount: 750,
      adjustment_amount: 150,
      submitted_by: adminUserId,
      review_status: 'pending',
    })

    const opLog = latestOperationLog(db, 'POST /cost-adjustments', res.body.data.id)
    expect(opLog).toBeTruthy()
    expect(opLog.description).toBe('创建季度成本调整单')
    expect(JSON.parse(opLog.request_data)).toMatchObject({
      id: res.body.data.id,
      costCenterId,
      costCenterName: '合法调整单成本中心',
      yearQuarter: '2026-Q2',
      preProvisionAmount: 600,
      actualAmount: 750,
      adjustmentAmount: 150,
      adjustmentReason: '季度发票核对',
      reviewStatus: 'pending',
      submittedBy: adminUserId,
    })
    expect(JSON.parse(opLog.response_data)).toMatchObject({ adjustmentId: res.body.data.id, costCenterId })
  })

  it('创建调整单必须拒绝停用成本中心和同季度重复调整', async () => {
    const suffix = Date.now()
    const activeCenterId = `cost-adj-candidate-active-${suffix}`
    const inactiveCenterId = `cost-adj-candidate-inactive-${suffix}`

    db.prepare(`
      INSERT INTO indirect_cost_centers (id, code, name, cost_type, monthly_amount, allocation_base, status)
      VALUES
        (?, ?, '调整单有效候选成本中心', 'rent', 1000, 'sample_count', 1),
        (?, ?, '调整单停用候选成本中心', 'rent', 1000, 'sample_count', 0)
    `).run(
      activeCenterId, `COST-ADJ-CANDIDATE-ACTIVE-${suffix}`,
      inactiveCenterId, `COST-ADJ-CANDIDATE-INACTIVE-${suffix}`,
    )

    const inactiveCreate = await request(app)
      .post('/api/v1/cost-adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ costCenterId: inactiveCenterId, yearQuarter: '2026-Q4', actualAmount: 1200 })

    expect(inactiveCreate.status).toBe(400)
    expect(inactiveCreate.body.success).toBe(false)
    expect(inactiveCreate.body.error.code).toBe('BUSINESS_RULE')

    const firstCreate = await request(app)
      .post('/api/v1/cost-adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ costCenterId: activeCenterId, yearQuarter: '2026-Q4', actualAmount: 1200 })

    expect(firstCreate.status).toBe(201)

    const duplicateCreate = await request(app)
      .post('/api/v1/cost-adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ costCenterId: activeCenterId, yearQuarter: '2026-Q4', actualAmount: 1300 })

    expect(duplicateCreate.status).toBe(409)
    expect(duplicateCreate.body.success).toBe(false)
    expect(duplicateCreate.body.error.code).toBe('RESOURCE_CONFLICT')

    const activeCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM cost_adjustments
      WHERE cost_center_id = ? AND year_quarter = '2026-Q4'
    `).get(activeCenterId) as any)?.count || 0
    const inactiveCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM cost_adjustments
      WHERE cost_center_id = ? AND year_quarter = '2026-Q4'
    `).get(inactiveCenterId) as any)?.count || 0

    expect(Number(activeCount)).toBe(1)
    expect(Number(inactiveCount)).toBe(0)
  })

  it('审核调整单必须阻止提交人自审，并记录真实审核人', async () => {
    const suffix = Date.now()
    const costCenterId = `cost-adj-review-center-${suffix}`

    db.prepare(`
      INSERT INTO indirect_cost_centers (id, code, name, cost_type, monthly_amount, allocation_base, status)
      VALUES (?, ?, '审核调整单成本中心', 'rent', 1000, 'sample_count', 1)
    `).run(costCenterId, `COST-ADJ-REVIEW-${suffix}`)

    const create = await request(app)
      .post('/api/v1/cost-adjustments')
      .set('Authorization', `Bearer ${token}`)
      .send({ costCenterId, yearQuarter: '2026-Q3', actualAmount: 900, adjustmentReason: '审核流测试' })

    expect(create.status).toBe(201)
    const adjustmentId = create.body.data.id

    const selfReview = await request(app)
      .post(`/api/v1/cost-adjustments/${adjustmentId}/review`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'approved', reason: '自己审核自己' })

    expect(selfReview.status).toBe(403)
    expect(selfReview.body.success).toBe(false)
    expect(selfReview.body.error.code).toBe('FORBIDDEN')

    const financeReview = await request(app)
      .post(`/api/v1/cost-adjustments/${adjustmentId}/review`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ status: 'approved', reason: '财务复核通过' })

    expect(financeReview.status).toBe(200)
    expect(financeReview.body.success).toBe(true)

    const reviewed = db.prepare(`
      SELECT submitted_by, review_status, reviewed_by, review_reason
      FROM cost_adjustments
      WHERE id = ?
    `).get(adjustmentId) as any

    expect(reviewed).toMatchObject({
      submitted_by: adminUserId,
      review_status: 'approved',
      reviewed_by: financeUserId,
      review_reason: '财务复核通过',
    })

    const opLog = latestOperationLog(db, 'POST /cost-adjustments/:id/review', adjustmentId)
    expect(opLog).toBeTruthy()
    expect(opLog.description).toBe('审核通过季度成本调整单')
    expect(JSON.parse(opLog.request_data)).toMatchObject({
      before: {
        id: adjustmentId,
        costCenterId,
        yearQuarter: '2026-Q3',
        reviewStatus: 'pending',
        submittedBy: adminUserId,
      },
      after: {
        id: adjustmentId,
        costCenterId,
        yearQuarter: '2026-Q3',
        reviewStatus: 'approved',
        reviewedBy: financeUserId,
        reviewReason: '财务复核通过',
      },
    })
    expect(JSON.parse(opLog.response_data)).toMatchObject({ adjustmentId, status: 'approved' })
  })

  it('调整单列表必须拒绝非法分页、季度、审核状态和不存在成本中心筛选', async () => {
    const cases = [
      { query: { page: 'abc', pageSize: '20' }, label: '非法页码' },
      { query: { page: '1', pageSize: '0' }, label: '非法每页数量' },
      { query: { yearQuarter: '2026-Q5' }, label: '非法季度' },
      { query: { reviewStatus: 'done' }, label: '非法审核状态' },
      { query: { costCenterId: `missing-cost-center-${Date.now()}` }, label: '不存在成本中心' },
    ]

    for (const item of cases) {
      const res = await request(app)
        .get('/api/v1/cost-adjustments')
        .query(item.query)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status, item.label).toBe(400)
      expect(res.body.success, item.label).toBe(false)
      expect(res.body.error.code, item.label).toBe('INVALID_PARAMETER')
    }
  })

  it('调整单列表按季度、成本中心和审核状态筛选时保留正确分页结果', async () => {
    const suffix = Date.now()
    const keepCenterId = `cost-adj-list-keep-center-${suffix}`
    const otherCenterId = `cost-adj-list-other-center-${suffix}`
    const keepId = `cost-adj-list-keep-${suffix}`
    const otherQuarterId = `cost-adj-list-other-quarter-${suffix}`
    const otherStatusId = `cost-adj-list-other-status-${suffix}`

    db.prepare(`
      INSERT INTO indirect_cost_centers (id, code, name, cost_type, monthly_amount, allocation_base, status)
      VALUES
        (?, ?, '列表筛选保留成本中心', 'rent', 1000, 'sample_count', 1),
        (?, ?, '列表筛选其他成本中心', 'rent', 1000, 'sample_count', 1)
    `).run(
      keepCenterId, `COST-ADJ-LIST-KEEP-${suffix}`,
      otherCenterId, `COST-ADJ-LIST-OTHER-${suffix}`,
    )
    db.prepare(`
      INSERT INTO cost_adjustments (
        id, cost_center_id, year_quarter, pre_provision_amount, actual_amount,
        adjustment_amount, adjustment_reason, submitted_by, review_status, created_at
      )
      VALUES
        (?, ?, '2026-Q2', 100, 150, 50, '保留记录', ?, 'pending', '2026-07-01T09:00:00'),
        (?, ?, '2026-Q1', 100, 150, 50, '季度不同', ?, 'pending', '2026-07-01T10:00:00'),
        (?, ?, '2026-Q2', 100, 150, 50, '状态不同', ?, 'approved', '2026-07-01T11:00:00')
    `).run(
      keepId, keepCenterId, adminUserId,
      otherQuarterId, keepCenterId, adminUserId,
      otherStatusId, otherCenterId, adminUserId,
    )

    const res = await request(app)
      .get('/api/v1/cost-adjustments')
      .query({
        page: 1,
        pageSize: 10,
        yearQuarter: '2026-Q2',
        costCenterId: keepCenterId,
        reviewStatus: 'pending',
      })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.total).toBe(1)
    expect(res.body.data.list).toHaveLength(1)
    expect(res.body.data.list[0]).toMatchObject({
      id: keepId,
      costCenterId: keepCenterId,
      costCenterName: '列表筛选保留成本中心',
      yearQuarter: '2026-Q2',
      reviewStatus: 'pending',
      adjustmentReason: '保留记录',
    })
    expect(res.body.data.list.map((item: any) => item.id)).not.toContain(otherQuarterId)
    expect(res.body.data.list.map((item: any) => item.id)).not.toContain(otherStatusId)
  })
})
