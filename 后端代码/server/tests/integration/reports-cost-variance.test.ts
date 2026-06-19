process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../../src/app.js')
  return { app }
}

async function loginAdmin(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  expect(res.status).toBe(200)
  expect(res.body.success).toBe(true)
  return res.body.data.token
}

describe('集成测试：成本差异报表参数校验', () => {
  let app: any
  let token: string

  beforeAll(async () => {
    ;({ app } = await getApp())
    token = await loginAdmin(app)
  })

  it('REPORT-VARIANCE-001: 拒绝非法对比维度，避免回落成项目维度', async () => {
    const res = await request(app)
      .get('/api/v1/reports/cost-variance?compareType=supplier')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(res.body.error.code).toBe('INVALID_PARAMETER')
  })
})
