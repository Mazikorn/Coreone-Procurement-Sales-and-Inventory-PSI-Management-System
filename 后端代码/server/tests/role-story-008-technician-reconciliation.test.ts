process.env.DATABASE_PATH = ':memory:'

import request from 'supertest'
import { describe, expect, it, beforeAll } from 'vitest'

let app: any
let technicianToken: string

async function login(username: string, password = 'CoreOne2026!') {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password })
  expect(res.status).toBe(200)
  return res.body.data.token
}

describe('role story 008 technician reconciliation boundaries', () => {
  beforeAll(async () => {
    const imported = await import('../src/app.js')
    app = imported.default
    technicianToken = await login('zhangwei')
  })

  it('allows technicians to read consumption reconciliation context', async () => {
    for (const path of [
      '/api/v1/reconciliation/summary',
      '/api/v1/reconciliation/projects',
      '/api/v1/reconciliation/materials',
      '/api/v1/reconciliation/cases',
      '/api/v1/reconciliation/logs',
    ]) {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${technicianToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    }
  })

  it('allows technicians to read trusted ABC cost results needed by slice-cost review', async () => {
    const res = await request(app)
      .get('/api/v1/abc/profitability')
      .query({ dimension: 'bom', pageSize: 10 })
      .set('Authorization', `Bearer ${technicianToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('blocks technicians from writing finance-owned ABC configuration', async () => {
    const createPool = await request(app)
      .post('/api/v1/abc/cost-pools')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ activityCenterId: 'ac-1', yearMonth: '2026-06', totalCost: 100 })
    expect(createPool.status).toBe(403)

    const runMappingAudit = await request(app)
      .post('/api/v1/abc/bom-fee-mappings/audit')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({})
    expect(runMappingAudit.status).toBe(403)
  })
})
