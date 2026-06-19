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

describe('集成测试：非ABC报表日期范围校验', () => {
  let app: any
  let token: string

  beforeAll(async () => {
    ;({ app } = await getApp())
    token = await loginAdmin(app)
  })

  it('REPORT-DATE-001: 非ABC报表接口必须一致拒绝倒置日期范围', async () => {
    const paths = [
      '/api/v1/reports/cost-by-project',
      '/api/v1/reports/cost-by-material',
      '/api/v1/reports/cost-by-supplier',
      '/api/v1/reports/cost-trend?dimension=monthly',
      '/api/v1/reports/cost-by-project-group',
      '/api/v1/reports/full-cost-by-project',
      '/api/v1/reports/cost-structure',
      '/api/v1/reports/cost-variance?compareType=project',
      '/api/v1/reports/personnel-efficiency',
    ]

    for (const path of paths) {
      const separator = path.includes('?') ? '&' : '?'
      const res = await request(app)
        .get(`${path}${separator}startDate=2026-06-30&endDate=2026-06-01`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status, path).toBe(400)
      expect(res.body.success, path).toBe(false)
      expect(res.body.error.code, path).toBe('INVALID_PARAMETER')
    }
  })
})
