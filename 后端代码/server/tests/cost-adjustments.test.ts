process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../src/app.js')
  const { getDatabase } = await import('../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function loginAdmin(app: any): Promise<{ token: string; userId: string }> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  expect(res.status).toBe(200)
  expect(res.body.success).toBe(true)
  return { token: res.body.data.token, userId: res.body.data.user.id }
}

describe('季度成本调整', () => {
  let app: any
  let db: any
  let token: string
  let adminUserId: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    const admin = await loginAdmin(app)
    token = admin.token
    adminUserId = admin.userId
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
  })
})
