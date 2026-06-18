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

describe('集成测试：非ABC项目成本报表', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('REPORT-PROJECT-001: 历史出库成本不因项目后续软删除而从报表消失', async () => {
    const suffix = Date.now()
    const projectId = `report-project-deleted-${suffix}`
    const outboundId = `report-project-outbound-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status, is_deleted)
      VALUES (?, ?, '已删除但有历史出库项目', 'ihc', 1, 0)
    `).run(projectId, `REPORT-PROJECT-${suffix}`)
    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, operator, status, created_at, is_deleted)
      VALUES (?, ?, 'project', ?, 360, 3, 'admin', 'completed', '2026-06-10T09:00:00', 0)
    `).run(outboundId, `REPORT-OUT-${suffix}`, projectId)
    db.prepare('UPDATE projects SET is_deleted = 1 WHERE id = ?').run(projectId)

    const res = await request(app)
      .get('/api/v1/reports/cost-by-project?startDate=2026-06-01&endDate=2026-06-30')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const projectCost = res.body.data.projects.find((row: any) => row.id === projectId)
    expect(projectCost).toMatchObject({
      id: projectId,
      name: '已删除但有历史出库项目',
      category: 'ihc',
      sampleCount: 3,
      totalCost: 360,
      unitCost: 120,
    })
    expect(res.body.data.summary.totalCost).toBeGreaterThanOrEqual(360)
  })

  it('REPORT-PROJECT-002: 全成本项目报表不因项目后续软删除而丢失历史材料成本', async () => {
    const suffix = Date.now()
    const projectId = `report-full-project-deleted-${suffix}`
    const outboundId = `report-full-project-outbound-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status, is_deleted)
      VALUES (?, ?, '已删除但有历史全成本项目', 'he', 1, 0)
    `).run(projectId, `REPORT-FULL-PROJECT-${suffix}`)
    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, operator, status, created_at, is_deleted)
      VALUES (?, ?, 'project', ?, 480, 4, 'admin', 'completed', '2026-06-11T09:00:00', 0)
    `).run(outboundId, `REPORT-FULL-OUT-${suffix}`, projectId)
    db.prepare('UPDATE projects SET is_deleted = 1 WHERE id = ?').run(projectId)

    const res = await request(app)
      .get('/api/v1/reports/full-cost-by-project?startDate=2026-06-01&endDate=2026-06-30')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const projectCost = res.body.data.projects.find((row: any) => row.id === projectId)
    expect(projectCost).toMatchObject({
      id: projectId,
      name: '已删除但有历史全成本项目',
      type: 'he',
      sampleCount: 4,
      materialCost: 480,
    })
    expect(res.body.data.summary.materialCost).toBeGreaterThanOrEqual(480)
  })

  it('REPORT-PROJECT-003: 成本差异按项目维度不因项目后续软删除而丢失历史成本行', async () => {
    const suffix = Date.now()
    const projectId = `report-variance-project-deleted-${suffix}`
    const outboundId = `report-variance-project-outbound-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status, is_deleted)
      VALUES (?, ?, '已删除但有成本差异项目', 'ihc', 1, 0)
    `).run(projectId, `REPORT-VAR-PROJECT-${suffix}`)
    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, operator, status, created_at, is_deleted)
      VALUES (?, ?, 'project', ?, 240, 2, 'admin', 'completed', '2026-06-14T09:00:00', 0)
    `).run(outboundId, `REPORT-VAR-OUT-${suffix}`, projectId)
    db.prepare('UPDATE projects SET is_deleted = 1 WHERE id = ?').run(projectId)

    const res = await request(app)
      .get('/api/v1/reports/cost-variance?compareType=project&startDate=2026-06-01&endDate=2026-06-30')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const item = res.body.data.items.find((row: any) => row.projectId === projectId)
    expect(item).toMatchObject({
      projectId,
      projectName: '已删除但有成本差异项目',
      groupType: 'project',
      materialActual: 240,
      sampleCount: 2,
    })
    expect(item.totalActual).toBeGreaterThanOrEqual(240)
  })
})
