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

describe('集成测试：人员效率报表', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('基于真实出库记录和标准工时汇总人员效率、人工成本和趋势', async () => {
    const suffix = Date.now()
    const techA = `pe-tech-a-${suffix}`
    const techB = `pe-tech-b-${suffix}`
    const pathologist = `pe-path-${suffix}`
    const projectHe = `pe-proj-he-${suffix}`
    const projectIhc = `pe-proj-ihc-${suffix}`

    db.prepare('DELETE FROM standard_labor_times').run()
    db.prepare(`
      INSERT INTO standard_labor_times (id, step_code, step_name, project_type, standard_minutes, labor_rate_per_minute, is_equipment_step)
      VALUES
        (?, 'PE-ALL', '通用接收', 'all', 10, 2, 0),
        (?, 'PE-IHC', '免疫组化染色', 'ihc', 20, 3, 0),
        (?, 'PE-HE', 'HE制片', 'he', 5, 1, 0)
    `).run(`pe-labor-all-${suffix}`, `pe-labor-ihc-${suffix}`, `pe-labor-he-${suffix}`)

    db.prepare(`
      INSERT INTO users (id, username, password, real_name, role)
      VALUES
        (?, ?, 'x', '效率技术员A', 'technician'),
        (?, ?, 'x', '效率技术员B', 'technician'),
        (?, ?, 'x', '效率病理医师', 'pathologist')
    `).run(`user-${techA}`, techA, `user-${techB}`, techB, `user-${pathologist}`, pathologist)

    db.prepare(`
      INSERT INTO projects (id, code, name, type)
      VALUES
        (?, ?, '效率HE项目', 'he'),
        (?, ?, '效率IHC项目', 'ihc')
    `).run(projectHe, `PE-HE-${suffix}`, projectIhc, `PE-IHC-${suffix}`)

    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, operator, status, created_at)
      VALUES
        (?, ?, 'project', ?, 100, 5, ?, 'completed', '2026-06-10T09:00:00'),
        (?, ?, 'project', ?, 40, 2, ?, 'completed', '2026-06-11T10:00:00'),
        (?, ?, 'project', ?, 80, 4, ?, 'completed', '2026-06-12T10:00:00'),
        (?, ?, 'project', ?, 999, 9, ?, 'cancelled', '2026-06-13T10:00:00')
    `).run(
      `pe-out-1-${suffix}`, `PE-OUT-1-${suffix}`, projectHe, techA,
      `pe-out-2-${suffix}`, `PE-OUT-2-${suffix}`, projectIhc, techB,
      `pe-out-3-${suffix}`, `PE-OUT-3-${suffix}`, projectHe, pathologist,
      `pe-out-4-${suffix}`, `PE-OUT-4-${suffix}`, projectHe, techA,
    )

    const res = await request(app)
      .get('/api/v1/reports/personnel-efficiency?startDate=2026-06-01&endDate=2026-06-30&role=technician')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.summary).toMatchObject({
      personCount: 2,
      totalOutput: 7,
      totalLaborCost: 285,
      totalStandardHours: 2.25,
      costPerOutput: 40.71,
    })

    const ranking = res.body.data.ranking
    expect(ranking).toHaveLength(2)
    expect(ranking[0]).toMatchObject({
      id: techA,
      name: '效率技术员A',
      role: 'technician',
      outputCount: 5,
      totalCost: 125,
      standardHours: 1.25,
      costPerOutput: 25,
    })
    expect(ranking[0].efficiency).toBe(1.29)
    expect(ranking[1]).toMatchObject({
      id: techB,
      outputCount: 2,
      totalCost: 160,
      standardHours: 1,
      costPerOutput: 80,
    })
    expect(ranking.some((item: any) => item.id === pathologist)).toBe(false)

    expect(res.body.data.trend).toEqual([
      {
        month: '2026-06',
        avgEfficiency: 1,
        outputPerHour: 3.11,
        totalCost: 285,
        outputCount: 7,
        standardHours: 2.25,
      },
    ])
  })

  it('没有出库记录时返回空列表和零汇总', async () => {
    const res = await request(app)
      .get('/api/v1/reports/personnel-efficiency?startDate=1999-01-01&endDate=1999-01-31')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.summary).toMatchObject({
      personCount: 0,
      totalOutput: 0,
      totalLaborCost: 0,
      totalStandardHours: 0,
      avgEfficiency: 0,
      costPerOutput: 0,
    })
    expect(res.body.data.ranking).toEqual([])
    expect(res.body.data.trend).toEqual([])
  })

  it('REPORT-EFFICIENCY-001: 人员效率不因项目后续软删除而丢失历史项目类型工时', async () => {
    const suffix = Date.now()
    const operator = `pe-deleted-project-tech-${suffix}`
    const projectId = `pe-deleted-project-${suffix}`
    const outboundId = `pe-deleted-project-out-${suffix}`

    db.prepare('DELETE FROM standard_labor_times').run()
    db.prepare(`
      INSERT INTO standard_labor_times (
        id, step_code, step_name, project_type, standard_minutes, labor_rate_per_minute, is_equipment_step
      )
      VALUES (?, 'PE-DEL-HE', '已删除项目HE工时', 'he', 30, 2, 0)
    `).run(`pe-deleted-labor-${suffix}`)
    db.prepare(`
      INSERT INTO users (id, username, password, real_name, role)
      VALUES (?, ?, 'x', '软删除项目历史技术员', 'technician')
    `).run(`user-${operator}`, operator)
    db.prepare(`
      INSERT INTO projects (id, code, name, type, is_deleted)
      VALUES (?, ?, '软删除但有人员效率历史项目', 'he', 0)
    `).run(projectId, `PE-DEL-PROJECT-${suffix}`)
    db.prepare(`
      INSERT INTO outbound_records (
        id, outbound_no, type, project_id, total_cost, sample_count,
        operator, status, created_at, is_deleted
      )
      VALUES (?, ?, 'project', ?, 120, 2, ?, 'completed', '2031-10-10T09:00:00', 0)
    `).run(outboundId, `PE-DEL-OUT-${suffix}`, projectId, operator)
    db.prepare('UPDATE projects SET is_deleted = 1 WHERE id = ?').run(projectId)

    const res = await request(app)
      .get('/api/v1/reports/personnel-efficiency?startDate=2031-10-01&endDate=2031-10-31&role=technician')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.summary).toMatchObject({
      personCount: 1,
      totalOutput: 2,
      totalLaborCost: 120,
      totalStandardHours: 1,
      costPerOutput: 60,
    })
    expect(res.body.data.ranking[0]).toMatchObject({
      id: operator,
      outputCount: 2,
      totalCost: 120,
      standardHours: 1,
      outputPerHour: 2,
      costPerOutput: 60,
    })
  })
})
