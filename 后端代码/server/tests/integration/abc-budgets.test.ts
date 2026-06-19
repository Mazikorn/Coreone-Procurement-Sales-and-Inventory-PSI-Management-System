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

describe('ABC预算管理接口', () => {
  let app: any
  let token: string

  beforeAll(async () => {
    app = await getApp()
    token = await loginAdmin(app)
  })

  it('更新预算时修改同一条记录并返回最新执行率', async () => {
    const yearMonth = '2099-06'
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
  })

  it('月份筛选只返回目标月份预算', async () => {
    const firstMonth = '2099-07'
    const secondMonth = '2099-08'

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
