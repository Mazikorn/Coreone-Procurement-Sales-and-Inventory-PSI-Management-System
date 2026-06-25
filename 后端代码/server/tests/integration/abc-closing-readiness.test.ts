process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'

const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

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

function seedCalculatedPeriod(db: any, yearMonth: string) {
  db.prepare(`
    INSERT OR REPLACE INTO abc_periods (id, year_month, status, started_at, calculated_at)
    VALUES (?, ?, 'calculated', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(`period-${yearMonth}`, yearMonth)
}

function seedOutbound(db: any, yearMonth: string, costStatus: string) {
  const id = unique(`out-${costStatus}`)
  db.prepare(`
    INSERT INTO outbound_records (
      id, outbound_no, type, total_cost, sample_count, operator, status,
      created_at, updated_at, cost_status
    )
    VALUES (?, ?, 'bom', 120, 2, 'tester', 'completed', ?, ?, ?)
  `).run(id, `OUT-${id}`, `${yearMonth}-12 09:00:00`, `${yearMonth}-12 09:00:00`, costStatus)
  return id
}

describe('ABC 成本结账健康检查', () => {
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

  it('CLOSING-READINESS-001: 干净且已核算期间返回 ready', async () => {
    const yearMonth = '2098-01'
    seedCalculatedPeriod(db, yearMonth)

    const res = await request(app)
      .get('/api/v1/abc/closing-readiness')
      .query({ yearMonth })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      yearMonth,
      status: 'ready',
      summary: {
        blockerCount: 0,
        warningCount: 0,
        infoCount: 0,
      },
      blockers: [],
      warnings: [],
    })
    expect(res.body.data.sources.abc_periods.status).toBe('calculated')
  })

  it('CLOSING-READINESS-002: 未核算期间返回 blocked 并提示先重算/核算', async () => {
    const yearMonth = '2098-02'
    db.prepare(`
      INSERT OR REPLACE INTO abc_periods (id, year_month, status, started_at)
      VALUES (?, ?, 'collecting', CURRENT_TIMESTAMP)
    `).run(`period-${yearMonth}`, yearMonth)

    const res = await request(app)
      .get('/api/v1/abc/closing-readiness')
      .query({ yearMonth })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('blocked')
    expect(res.body.data.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'abc_periods',
        code: 'PERIOD_NOT_CALCULATED',
      }),
    ]))
    expect(res.body.data.nextActions).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: 'recalculate_costs' }),
    ]))
  })

  it('CLOSING-READINESS-003: 开放错误级成本异常返回 blocked', async () => {
    const yearMonth = '2098-03'
    const exceptionId = unique('ex-error')
    seedCalculatedPeriod(db, yearMonth)
    db.prepare(`
      INSERT INTO cost_exceptions (
        id, exception_no, source_module, source_type, year_month,
        exception_type, severity, status, message
      )
      VALUES (?, ?, 'abc', 'closing_readiness_test', ?, 'calculation_failed', 'error', 'open', '测试错误级异常')
    `).run(exceptionId, `CE-${exceptionId}`, yearMonth)

    const res = await request(app)
      .get('/api/v1/abc/closing-readiness')
      .query({ yearMonth })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('blocked')
    expect(res.body.data.sources.cost_exceptions.openErrorCount).toBe(1)
    expect(res.body.data.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'cost_exceptions',
        code: 'OPEN_ERROR_COST_EXCEPTIONS',
        count: 1,
      }),
    ]))
  })

  it('R4: 完全吸收硬门禁——未吸收残差时 readiness=blocked 且关账 422，resolve 后放行（CHAIN-10）', async () => {
    const yearMonth = '2097-09'
    const exceptionId = unique('ex-absorb')
    seedCalculatedPeriod(db, yearMonth)
    db.prepare(`
      INSERT INTO cost_exceptions (
        id, exception_no, source_module, source_type, year_month,
        exception_type, severity, status, message
      )
      VALUES (?, ?, 'cost_pool', 'absorption', ?, 'absorption_residual', 'warning', 'open', 'Σ池≠Σ来源残差')
    `).run(exceptionId, `CE-${exceptionId}`, yearMonth)

    // ① readiness 把未吸收残差列为 blocker（而非仅 warning）
    const readiness = await request(app)
      .get('/api/v1/abc/closing-readiness')
      .query({ yearMonth })
      .set('Authorization', `Bearer ${token}`)
    expect(readiness.status).toBe(200)
    expect(readiness.body.data.status).toBe('blocked')
    expect(readiness.body.data.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'INCOMPLETE_ABSORPTION', source: 'cost_exceptions', count: 1 }),
    ]))
    // 不应同时被算进 warning（已从 warning 查询排除）
    expect(readiness.body.data.summary.warningCount).toBe(0)

    // ② 关账端点硬门禁：422 INCOMPLETE_ABSORPTION
    const blocked = await request(app)
      .post(`/api/v1/abc/periods/period-${yearMonth}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(blocked.status).toBe(422)
    expect(blocked.body.error.code).toBe('INCOMPLETE_ABSORPTION')

    // ③ resolve 残差后放行
    db.prepare(`UPDATE cost_exceptions SET status = 'resolved' WHERE id = ?`).run(exceptionId)
    const closed = await request(app)
      .post(`/api/v1/abc/periods/period-${yearMonth}/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
    expect(closed.status).toBe(200)
    expect((db.prepare('SELECT status FROM abc_periods WHERE year_month = ?').get(yearMonth) as any).status).toBe('closed')
  })

  it('CLOSING-READINESS-004: 未补算或成本异常出库返回 blocked', async () => {
    const yearMonth = '2098-04'
    seedCalculatedPeriod(db, yearMonth)
    seedOutbound(db, yearMonth, 'pending_cost')
    seedOutbound(db, yearMonth, 'cost_exception')

    const res = await request(app)
      .get('/api/v1/abc/closing-readiness')
      .query({ yearMonth })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('blocked')
    expect(res.body.data.sources.outbound_records.pendingCostCount).toBe(2)
    expect(res.body.data.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'outbound_records',
        code: 'PENDING_COST_ITEMS',
        count: 2,
      }),
    ]))
  })

  it('CLOSING-READINESS-005: 库存 critical 一致性问题返回 blocked 且不自动修正', async () => {
    const yearMonth = '2098-05'
    const suffix = unique('closing-inv')
    const categoryId = `cat-${suffix}`
    const materialId = `mat-${suffix}`
    const beforePeriodCount = (db.prepare('SELECT COUNT(*) as total FROM abc_periods').get() as any).total
    seedCalculatedPeriod(db, yearMonth)
    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, 1)')
      .run(categoryId, `CAT-${suffix}`, '结账健康检查分类')
    db.prepare('INSERT INTO materials (id, code, name, unit, category_id, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(materialId, `MAT-${suffix}`, '结账健康检查物料', '支', categoryId)
    db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock) VALUES (?, ?, 10, 0)')
      .run(`inv-${suffix}`, materialId)
    db.prepare(`
      INSERT INTO batches (id, material_id, batch_no, quantity, remaining, expiry_date, inbound_id, inbound_price, status)
      VALUES (?, ?, ?, 5, 4, ?, ?, 10, 1)
    `).run(`batch-${suffix}`, materialId, `BATCH-${suffix}`, '2028-12-31', `inbound-${suffix}`)

    const res = await request(app)
      .get('/api/v1/abc/closing-readiness')
      .query({ yearMonth })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('blocked')
    expect(res.body.data.sources.inventory_consistency.criticalCount).toBeGreaterThanOrEqual(1)
    expect(res.body.data.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'inventory_consistency',
        code: 'CRITICAL_INVENTORY_CONSISTENCY',
      }),
    ]))
    expect((db.prepare('SELECT COUNT(*) as total FROM abc_periods').get() as any).total).toBe(beforePeriodCount + 1)
    expect((db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any).stock).toBe(10)
  })
})
