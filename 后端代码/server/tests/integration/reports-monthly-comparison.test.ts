process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../../src/app.js')
  const { getDatabase } = await import('../../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function loginAdmin(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  expect(res.status).toBe(200)
  expect(res.body.success).toBe(true)
  return res.body.data.token
}

describe('集成测试：成本月度环比报表', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('支持按指定月份计算当月、上月和持平状态', async () => {
    const suffix = Date.now()

    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, total_cost, sample_count, operator, status, created_at)
      VALUES
        (?, ?, 'project', 120, 2, 'admin', 'completed', '2099-03-10T09:00:00'),
        (?, ?, 'project', 80, 1, 'admin', 'completed', '2099-03-12T09:00:00'),
        (?, ?, 'project', 200, 3, 'admin', 'completed', '2099-04-05T09:00:00'),
        (?, ?, 'project', 999, 9, 'admin', 'completed', '2099-05-01T09:00:00'),
        (?, ?, 'project', 999, 9, 'admin', 'cancelled', '2099-04-06T09:00:00')
    `).run(
      `cmp-prev-1-${suffix}`, `CMP-PREV-1-${suffix}`,
      `cmp-prev-2-${suffix}`, `CMP-PREV-2-${suffix}`,
      `cmp-current-${suffix}`, `CMP-CUR-${suffix}`,
      `cmp-other-${suffix}`, `CMP-OTHER-${suffix}`,
      `cmp-cancelled-${suffix}`, `CMP-CANCEL-${suffix}`,
    )

    const res = await request(app)
      .get('/api/v1/reports/cost-monthly-comparison?month=2099-04')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.currentMonth).toMatchObject({
      month: '2099-04',
      totalCost: 200,
      sampleCount: 3,
      recordCount: 1,
      isComplete: false,
      dataDays: 0,
    })
    expect(res.body.data.previousMonth).toMatchObject({
      month: '2099-03',
      totalCost: 200,
      sampleCount: 3,
      recordCount: 2,
      isComplete: false,
      dataDays: 0,
    })
    expect(res.body.data.changes).toMatchObject({
      totalChange: 0,
      totalChangeRate: 0,
      direction: 'flat',
      note: '2099-04 数据不完整（仅 0/30 天）',
    })
  })

  it('成本看板可按ABC快照口径计算环比，未补算出库不进入经营成本', async () => {
    const suffix = Date.now()

    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, total_cost, sample_count, operator, status, created_at, cost_status)
      VALUES
        (?, ?, 'bom', 300, 3, 'admin', 'completed', '2099-06-08T09:00:00', 'cost_exception'),
        (?, ?, 'bom', 60, 1, 'admin', 'completed', '2099-05-08T09:00:00', 'recalculated')
    `).run(
      `cmp-abc-pending-${suffix}`, `CMP-ABC-PENDING-${suffix}`,
      `cmp-abc-prev-out-${suffix}`, `CMP-ABC-PREV-OUT-${suffix}`,
    )
    db.prepare(`
      INSERT INTO outbound_abc_details (
        id, outbound_id, sample_count, total_cost, cost_month, cost_status
      )
      VALUES
        (?, ?, 2, 120, '2099-06', 'recalculated'),
        (?, ?, 1, 60, '2099-05', 'costed'),
        (?, ?, 3, 300, '2099-06', 'cost_exception')
    `).run(
      `cmp-abc-current-${suffix}`, `cmp-abc-current-out-${suffix}`,
      `cmp-abc-prev-${suffix}`, `cmp-abc-prev-out-${suffix}`,
      `cmp-abc-exception-${suffix}`, `cmp-abc-pending-${suffix}`,
    )

    const res = await request(app)
      .get('/api/v1/reports/cost-monthly-comparison?month=2099-06&source=abc')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.currentMonth).toMatchObject({
      month: '2099-06',
      totalCost: 120,
      sampleCount: 2,
      recordCount: 1,
    })
    expect(res.body.data.previousMonth).toMatchObject({
      month: '2099-05',
      totalCost: 60,
      sampleCount: 1,
      recordCount: 1,
    })
    expect(res.body.data.changes).toMatchObject({
      totalChange: 60,
      totalChangeRate: 100,
      direction: 'up',
      source: 'abc',
    })
  })
})
