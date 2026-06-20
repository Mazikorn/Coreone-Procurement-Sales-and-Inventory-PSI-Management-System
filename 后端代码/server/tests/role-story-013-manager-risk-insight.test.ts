process.env.DATABASE_PATH = ':memory:'

import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

let app: any
let managerToken: string

async function login(username: string, password = 'CoreOne2026!') {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password })
  expect(res.status).toBe(200)
  return res.body.data.token
}

describe('role story 013 manager dashboard risk insight boundaries', () => {
  beforeAll(async () => {
    const imported = await import('../src/app.js')
    app = imported.default
    managerToken = await login('guanli')
  })

  it('allows managers to read operating, inventory, alert, and trusted ABC insight', async () => {
    for (const path of [
      '/api/v1/inventory',
      '/api/v1/inventory/stats',
      '/api/v1/alerts',
      '/api/v1/alerts/stats',
      '/api/v1/abc/dashboard',
      '/api/v1/abc/slide-cost-trend',
      '/api/v1/abc/profitability',
    ]) {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    }
  })

  it('blocks managers from execution, system administration, and cost configuration writes', async () => {
    const userCreate = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ username: 'rs013-user', password: 'CoreOne2026!', realName: '越权用户', role: 'manager' })
    expect(userCreate.status).toBe(403)

    const outboundCreate = await request(app)
      .post('/api/v1/outbound')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ type: 'normal', items: [] })
    expect(outboundCreate.status).toBe(403)

    const alertHandle = await request(app)
      .post('/api/v1/alerts/ALERT-RS013/process')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ remark: '管理者不直接处理预警' })
    expect(alertHandle.status).toBe(403)

    const periodCreate = await request(app)
      .post('/api/v1/abc/periods')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ yearMonth: '2099-12' })
    expect(periodCreate.status).toBe(403)

    const feeMapping = await request(app)
      .put('/api/v1/abc/bom-fee-mappings/not-a-bom')
      .set('Authorization', `Bearer ${managerToken}`)
      .send({ mappings: [] })
    expect(feeMapping.status).toBe(403)
  })
})
