process.env.DATABASE_PATH = ':memory:'

import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

let app: any
let pathologistToken: string

async function login(username: string, password = 'CoreOne2026!') {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password })
  expect(res.status).toBe(200)
  return res.body.data.token
}

describe('role story 012 pathologist readonly insight boundaries', () => {
  beforeAll(async () => {
    const imported = await import('../src/app.js')
    app = imported.default
    pathologistToken = await login('liuyf')
  })

  it('allows pathologists to read project, BOM, cost insight, and alert context', async () => {
    for (const path of [
      '/api/v1/projects',
      '/api/v1/boms',
      '/api/v1/abc/profitability',
      '/api/v1/abc/slide-cost-trend',
      '/api/v1/alerts',
    ]) {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${pathologistToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    }
  })

  it('blocks pathologists from changing modeling, reconciliation, or finance configuration facts', async () => {
    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${pathologistToken}`)
      .send({ code: 'PRJ-RS012-DOC', name: '医生越权项目', type: 'ihc' })
    expect(project.status).toBe(403)

    const bom = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${pathologistToken}`)
      .send({ code: 'BOM-RS012-DOC', name: '医生越权BOM', type: 'ihc', materials: [] })
    expect(bom.status).toBe(403)

    const importLis = await request(app)
      .post('/api/v1/reconciliation/cases/import')
      .set('Authorization', `Bearer ${pathologistToken}`)
      .send({
        items: [
          { caseNo: 'RS012-DOC-CASE', projectName: '医生对账越权', operateTime: '2026-06-20 09:00:00', operator: 'doctor' },
        ],
      })
    expect(importLis.status).toBe(403)

    const period = await request(app)
      .post('/api/v1/abc/periods')
      .set('Authorization', `Bearer ${pathologistToken}`)
      .send({ yearMonth: '2099-12' })
    expect(period.status).toBe(403)

    const feeMapping = await request(app)
      .put('/api/v1/abc/bom-fee-mappings/not-a-bom')
      .set('Authorization', `Bearer ${pathologistToken}`)
      .send({ mappings: [] })
    expect(feeMapping.status).toBe(403)
  })
})
