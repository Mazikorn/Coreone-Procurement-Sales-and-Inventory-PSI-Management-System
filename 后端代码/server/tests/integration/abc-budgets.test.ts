process.env.DATABASE_PATH = ':memory:'

import { beforeAll, describe, expect, it } from 'vitest'
import request from 'supertest'

async function getApp() {
  const { default: app } = await import('../../src/app.js')
  return app
}

async function loginAdmin(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })

  expect(res.status).toBe(200)
  return res.body.data.token
}

const uniqueMonth = (offset = 0) => {
  const seed = Date.now() + offset
  const year = 2100 + (seed % 7000)
  const month = String((seed % 12) + 1).padStart(2, '0')
  return `${year}-${month}`
}

describe('ABC预算管理接口', () => {
  let app: any
  let token: string
  let db: any

  beforeAll(async () => {
    app = await getApp()
    token = await loginAdmin(app)
    const { getDatabase } = await import('../../src/database/DatabaseManager.js')
    db = getDatabase()
  })

  it('更新预算时修改同一条记录并返回最新执行率', async () => {
    const yearMonth = uniqueMonth()
    const createRes = await request(app)
      .post('/api/v1/abc/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        yearMonth,
        category: 'material',
        budgetAmount: 1000,
        actualAmount: 250,
        description: '预算更新红灯',
      })

    expect(createRes.status).toBe(201)
    const budgetId = createRes.body.data.id

    const updateRes = await request(app)
      .put(`/api/v1/abc/budgets/${budgetId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        yearMonth,
        category: 'material',
        budgetAmount: 2000,
        actualAmount: 500,
        description: '预算更新后',
      })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data).toMatchObject({
      id: budgetId,
      yearMonth,
      category: 'material',
      budgetAmount: 2000,
      actualAmount: 500,
      executionRate: 0.25,
      status: 'active',
    })

    const listRes = await request(app)
      .get(`/api/v1/abc/budgets?yearMonth=${yearMonth}`)
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.list).toHaveLength(1)
    expect(listRes.body.data.list[0]).toMatchObject({
      id: budgetId,
      budgetAmount: 2000,
      actualAmount: 500,
      executionRate: 0.25,
      status: 'active',
    })

    const updateAudit = db.prepare(`
      SELECT module, action, target_id, detail, operator
      FROM abc_audit_logs
      WHERE module = 'budget' AND action = 'update' AND target_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(budgetId) as any

    expect(updateAudit).toMatchObject({
      module: 'budget',
      action: 'update',
      target_id: budgetId,
      operator: 'admin',
    })
    expect(JSON.parse(updateAudit.detail)).toMatchObject({
      before: {
        yearMonth,
        category: 'material',
        budgetAmount: 1000,
        actualAmount: 250,
        description: '预算更新红灯',
      },
      after: {
        yearMonth,
        category: 'material',
        budgetAmount: 2000,
        actualAmount: 500,
        description: '预算更新后',
      },
    })
  })

  it('创建预算写入ABC审计，支撑预算口径追溯', async () => {
    const yearMonth = uniqueMonth(10)
    const createRes = await request(app)
      .post('/api/v1/abc/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        yearMonth,
        category: 'equipment',
        budgetAmount: 3600,
        actualAmount: 900,
        description: '预算创建审计',
      })

    expect(createRes.status).toBe(201)
    const budgetId = createRes.body.data.id
    const createAudit = db.prepare(`
      SELECT module, action, target_id, detail, operator
      FROM abc_audit_logs
      WHERE module = 'budget' AND action = 'create' AND target_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(budgetId) as any

    expect(createAudit).toMatchObject({
      module: 'budget',
      action: 'create',
      target_id: budgetId,
      operator: 'admin',
    })
    expect(JSON.parse(createAudit.detail)).toMatchObject({
      after: {
        yearMonth,
        category: 'equipment',
        budgetAmount: 3600,
        actualAmount: 900,
        executionRate: 0.25,
        description: '预算创建审计',
      },
    })
  })

  it('审计业务链接可按预算ID keyword 回到目标预算', async () => {
    const yearMonth = uniqueMonth(15)
    const createRes = await request(app)
      .post('/api/v1/abc/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({
        yearMonth,
        category: 'qc',
        budgetAmount: 2600,
        actualAmount: 1300,
        description: '预算深链回跳审计',
      })

    expect(createRes.status).toBe(201)
    const budgetId = createRes.body.data.id

    const listRes = await request(app)
      .get(`/api/v1/abc/budgets?keyword=${budgetId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.list).toHaveLength(1)
    expect(listRes.body.data.list[0]).toMatchObject({
      id: budgetId,
      yearMonth,
      category: 'qc',
      budgetAmount: 2600,
      actualAmount: 1300,
      description: '预算深链回跳审计',
    })
  })

  it('月份筛选只返回目标月份预算', async () => {
    const firstMonth = uniqueMonth(20)
    const secondMonth = uniqueMonth(40)

    await request(app)
      .post('/api/v1/abc/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth: firstMonth, category: 'labor', budgetAmount: 300 })

    await request(app)
      .post('/api/v1/abc/budgets')
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth: secondMonth, category: 'labor', budgetAmount: 400 })

    const listRes = await request(app)
      .get(`/api/v1/abc/budgets?yearMonth=${secondMonth}`)
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.list.map((item: any) => item.yearMonth)).toEqual([secondMonth])
  })
})
