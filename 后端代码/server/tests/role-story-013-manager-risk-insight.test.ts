process.env.DATABASE_PATH = ':memory:'

import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

let app: any
let managerToken: string
let db: any

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
    const database = await import('../src/database/DatabaseManager.js')
    db = database.getDatabase()
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

  it('blocks managers from reading finance-owned cost configuration workbench data', async () => {
    for (const path of [
      '/api/v1/indirect-costs',
      '/api/v1/abc/activity-centers',
      '/api/v1/abc/cost-drivers',
      '/api/v1/abc/cost-pools',
      '/api/v1/abc/bom-fee-mappings/audit',
      '/api/v1/abc/fee-standards',
    ]) {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${managerToken}`)

      expect(res.status).toBe(403)
    }
  })

  it('exposes cost insight quality so managers do not treat unclosed or exception data as final', async () => {
    const yearMonth = '2099-08'
    const projectId = 'rs013-project-quality'
    const outboundId = 'rs013-outbound-quality'
    const pendingOutboundId = 'rs013-outbound-pending-quality'

    db.prepare(`
      INSERT OR REPLACE INTO projects (id, code, name, type, cycle, manager, description, status)
      VALUES (?, 'RS013-QUALITY', '管理者口径验证项目', 'he', '常规', '顾管理', '用于管理者口径验证', 1)
    `).run(projectId)
    db.prepare(`
      INSERT OR REPLACE INTO abc_periods (id, year_month, status, started_at, remark)
      VALUES ('rs013-period-quality', ?, 'calculated', CURRENT_TIMESTAMP, '已核算但未关账')
    `).run(yearMonth)
    db.prepare(`
      INSERT OR REPLACE INTO outbound_records (
        id, outbound_no, type, project_id, total_cost, operator, status, created_at, updated_at, cost_status, sample_count
      )
      VALUES (?, 'RS013-OUT-QUALITY', 'bom', ?, 120, 'wangkq', 'completed', ?, ?, 'costed', 2)
    `).run(outboundId, projectId, `${yearMonth}-10 10:00:00`, `${yearMonth}-10 10:00:00`)
    db.prepare(`
      INSERT OR REPLACE INTO outbound_records (
        id, outbound_no, type, project_id, total_cost, operator, status, created_at, updated_at, cost_status, sample_count
      )
      VALUES (?, 'RS013-OUT-PENDING', 'bom', ?, 0, 'wangkq', 'completed', ?, ?, 'pending_cost', 1)
    `).run(pendingOutboundId, projectId, `${yearMonth}-11 10:00:00`, `${yearMonth}-11 10:00:00`)
    db.prepare(`
      INSERT OR REPLACE INTO outbound_abc_details (
        id, outbound_id, project_id, sample_count, material_cost, activity_cost,
        total_cost, cost_per_slide, fee_amount, profit, profit_rate, cost_month, cost_status
      )
      VALUES (
        'rs013-abc-quality', ?, ?, 2, 60, 40,
        100, 50, 180, 80, 0.444444, ?, 'costed'
      )
    `).run(outboundId, projectId, yearMonth)
    db.prepare(`
      INSERT OR REPLACE INTO cost_exceptions (
        id, exception_no, source_module, source_type, source_id, project_id, outbound_id,
        year_month, exception_type, severity, status, message
      )
      VALUES (
        'rs013-exception-quality', 'RS013-CE-QUALITY', 'abc', 'manager_quality', ?,
        ?, ?, ?, 'calculation_failed', 'error', 'open', '管理者口径验证开放异常'
      )
    `).run(outboundId, projectId, outboundId, yearMonth)

    const profitability = await request(app)
      .get(`/api/v1/abc/profitability?dimension=project&startDate=${yearMonth}&endDate=${yearMonth}`)
      .set('Authorization', `Bearer ${managerToken}`)

    expect(profitability.status).toBe(200)
    expect(profitability.body.data.insightQuality).toMatchObject({
      yearMonth,
      periodStatus: 'calculated',
      isClosed: false,
      isFinal: false,
      openExceptionCount: 1,
      pendingCostCount: 1,
      abcSnapshotCount: 1,
      outboundCount: 2,
      reliability: 'attention',
    })
    expect(profitability.body.data.insightQuality.message).toContain('未关账')
    expect(profitability.body.data.insightQuality.message).toContain('开放成本异常')
    expect(profitability.body.data.insightQuality.message).toContain('未补算')
    expect(profitability.body.data.insightQualityByMonth[yearMonth]).toMatchObject({
      yearMonth,
      isFinal: false,
      reliability: 'attention',
    })

    const rangeProfitability = await request(app)
      .get(`/api/v1/abc/profitability?dimension=project&startDate=${yearMonth}&endDate=2099-09`)
      .set('Authorization', `Bearer ${managerToken}`)

    expect(rangeProfitability.status).toBe(200)
    expect(rangeProfitability.body.data.insightQualityByMonth[yearMonth]).toMatchObject({
      yearMonth,
      isFinal: false,
      reliability: 'attention',
    })
    expect(rangeProfitability.body.data.insightQualityByMonth['2099-09']).toMatchObject({
      yearMonth: '2099-09',
      periodStatus: 'not_started',
      isFinal: false,
      reliability: 'draft',
    })

    const trend = await request(app)
      .get('/api/v1/abc/slide-cost-trend?months=1')
      .set('Authorization', `Bearer ${managerToken}`)

    expect(trend.status).toBe(200)
    expect(trend.body.data.insightQuality[yearMonth]).toMatchObject({
      yearMonth,
      periodStatus: 'calculated',
      isClosed: false,
      isFinal: false,
      openExceptionCount: 1,
      pendingCostCount: 1,
      reliability: 'attention',
    })
  })
})
