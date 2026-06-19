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

describe('ABC质量成本接口', () => {
  let app: any
  let token: string

  beforeAll(async () => {
    app = await getApp()
    token = await loginAdmin(app)
  })

  it('创建质量成本后列表保留成本类型和子类型，汇总按四类成本返回', async () => {
    const yearMonth = '2099-09'

    const createRes = await request(app)
      .post('/api/v1/abc/quality-costs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        yearMonth,
        costType: 'prevention',
        subType: 'training',
        amount: 1200,
        description: '质量成本字段契约红灯',
      })

    expect(createRes.status).toBe(201)

    const listRes = await request(app)
      .get(`/api/v1/abc/quality-costs?yearMonth=${yearMonth}`)
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.list).toHaveLength(1)
    expect(listRes.body.data.list[0]).toMatchObject({
      yearMonth,
      costType: 'prevention',
      subType: 'training',
      amount: 1200,
      description: '质量成本字段契约红灯',
    })

    const summaryRes = await request(app)
      .get(`/api/v1/abc/quality-costs/summary?yearMonth=${yearMonth}`)
      .set('Authorization', `Bearer ${token}`)

    expect(summaryRes.status).toBe(200)
    expect(summaryRes.body.data).toMatchObject({
      totalQualityCost: 1200,
      preventionCost: 1200,
      appraisalCost: 0,
      internalFailureCost: 0,
      externalFailureCost: 0,
    })
  })

  it('拒绝负数质量成本金额', async () => {
    const res = await request(app)
      .post('/api/v1/abc/quality-costs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        yearMonth: '2099-10',
        costType: 'prevention',
        subType: 'training',
        amount: -1,
      })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
