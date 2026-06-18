process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../../src/app.js')
  const { getDatabase } = await import('../../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function loginAdmin(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  expect(res.status).toBe(200)
  expect(res.body.success).toBe(true)
  return res.body.data.token
}

describe('集成测试：非ABC成本趋势报表', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('月度和季度成本趋势支持按检测项目类型过滤', async () => {
    const suffix = Date.now()
    const heProjectId = `trend-he-${suffix}`
    const ihcProjectId = `trend-ihc-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type)
      VALUES
        (?, ?, '趋势HE项目', 'he'),
        (?, ?, '趋势IHC项目', 'ihc')
    `).run(heProjectId, `TREND-HE-${suffix}`, ihcProjectId, `TREND-IHC-${suffix}`)

    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, operator, status, created_at)
      VALUES
        (?, ?, 'project', ?, 100, 2, 'admin', 'completed', '2026-01-10T09:00:00'),
        (?, ?, 'project', ?, 300, 3, 'admin', 'completed', '2026-01-12T09:00:00'),
        (?, ?, 'project', ?, 80, 1, 'admin', 'completed', '2026-04-02T09:00:00'),
        (?, ?, 'project', ?, 999, 9, 'admin', 'cancelled', '2026-04-03T09:00:00')
    `).run(
      `trend-out-1-${suffix}`, `TREND-OUT-1-${suffix}`, heProjectId,
      `trend-out-2-${suffix}`, `TREND-OUT-2-${suffix}`, ihcProjectId,
      `trend-out-3-${suffix}`, `TREND-OUT-3-${suffix}`, heProjectId,
      `trend-out-4-${suffix}`, `TREND-OUT-4-${suffix}`, heProjectId,
    )

    const monthlyRes = await request(app)
      .get('/api/v1/reports/cost-trend?dimension=monthly&projectType=he&startDate=2026-01-01&endDate=2026-12-31')
      .set('Authorization', `Bearer ${token}`)

    expect(monthlyRes.status).toBe(200)
    expect(monthlyRes.body.success).toBe(true)
    expect(monthlyRes.body.data.trend).toEqual([
      { period: '2026-01', cost: 100, recordCount: 1, sampleCount: 2 },
      { period: '2026-04', cost: 80, recordCount: 1, sampleCount: 1 },
    ])

    const quarterlyRes = await request(app)
      .get('/api/v1/reports/cost-trend?dimension=quarterly&projectType=he&startDate=2026-01-01&endDate=2026-12-31')
      .set('Authorization', `Bearer ${token}`)

    expect(quarterlyRes.status).toBe(200)
    expect(quarterlyRes.body.data.trend.map((row: any) => ({
      period: row.period,
      cost: row.cost,
      recordCount: row.recordCount,
      sampleCount: row.sampleCount,
    }))).toEqual([
      { period: '2026-Q1', cost: 100, recordCount: 1, sampleCount: 2 },
      { period: '2026-Q2', cost: 80, recordCount: 1, sampleCount: 1 },
    ])
  })

  it('REPORT-TREND-001: 按项目类型过滤成本趋势时不因项目后续软删除而丢失历史成本', async () => {
    const suffix = Date.now()
    const deletedProjectId = `trend-deleted-he-${suffix}`
    const otherProjectId = `trend-active-ihc-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, is_deleted)
      VALUES
        (?, ?, '已删除但有趋势历史HE项目', 'he', 0),
        (?, ?, '趋势过滤对照IHC项目', 'ihc', 0)
    `).run(deletedProjectId, `TREND-DEL-HE-${suffix}`, otherProjectId, `TREND-ACT-IHC-${suffix}`)

    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, operator, status, created_at, is_deleted)
      VALUES
        (?, ?, 'project', ?, 140, 2, 'admin', 'completed', '2027-02-10T09:00:00', 0),
        (?, ?, 'project', ?, 360, 3, 'admin', 'completed', '2027-02-11T09:00:00', 0)
    `).run(
      `trend-del-out-${suffix}`, `TREND-DEL-OUT-${suffix}`, deletedProjectId,
      `trend-other-out-${suffix}`, `TREND-OTHER-OUT-${suffix}`, otherProjectId,
    )
    db.prepare('UPDATE projects SET is_deleted = 1 WHERE id = ?').run(deletedProjectId)

    const monthlyRes = await request(app)
      .get('/api/v1/reports/cost-trend?dimension=monthly&projectType=he&startDate=2027-02-01&endDate=2027-02-28')
      .set('Authorization', `Bearer ${token}`)

    expect(monthlyRes.status).toBe(200)
    expect(monthlyRes.body.success).toBe(true)
    expect(monthlyRes.body.data.trend).toEqual([
      { period: '2027-02', cost: 140, recordCount: 1, sampleCount: 2 },
    ])

    const quarterlyRes = await request(app)
      .get('/api/v1/reports/cost-trend?dimension=quarterly&projectType=he&startDate=2027-01-01&endDate=2027-03-31')
      .set('Authorization', `Bearer ${token}`)

    expect(quarterlyRes.status).toBe(200)
    expect(quarterlyRes.body.data.trend.map((row: any) => ({
      period: row.period,
      cost: row.cost,
      recordCount: row.recordCount,
      sampleCount: row.sampleCount,
    }))).toEqual([
      { period: '2027-Q1', cost: 140, recordCount: 1, sampleCount: 2 },
    ])
  })
})
