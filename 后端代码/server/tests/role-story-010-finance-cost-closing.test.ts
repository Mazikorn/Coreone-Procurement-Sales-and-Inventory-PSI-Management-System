process.env.DATABASE_PATH = ':memory:'

import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

let app: any
let financeToken: string
let technicianToken: string

async function login(username: string, password = 'CoreOne2026!') {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password })
  expect(res.status).toBe(200)
  return res.body.data.token
}

describe('role story 010 finance reconciliation and cost closing boundaries', () => {
  beforeAll(async () => {
    const imported = await import('../src/app.js')
    app = imported.default
    financeToken = await login('sunli')
    technicianToken = await login('zhangwei')
  })

  it('lets finance read reconciliation context needed before monthly cost closing', async () => {
    for (const path of [
      '/api/v1/reconciliation/summary',
      '/api/v1/reconciliation/projects',
      '/api/v1/reconciliation/materials',
      '/api/v1/reconciliation/cases',
      '/api/v1/reconciliation/logs',
    ]) {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${financeToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    }
  })

  it('does not let finance change BOM standards through reconciliation fixes', async () => {
    const financeRes = await request(app)
      .post('/api/v1/reconciliation/logs')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({})

    expect(financeRes.status).toBe(403)
    expect(financeRes.body.error.code).toBe('FORBIDDEN')

    const technicianRes = await request(app)
      .post('/api/v1/reconciliation/logs')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({})

    expect(technicianRes.status).toBe(400)
    expect(technicianRes.body.error.code).toBe('INVALID_PARAMETER')
  })
})
