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

describe('集成测试：检测项目详情', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('PROJECT-DETAIL-001: 项目详情成本统计按真实样本数汇总而不是按出库单数计数', async () => {
    const suffix = Date.now()
    const projectId = `project-detail-sample-${suffix}`
    const outboundIdA = `project-detail-out-a-${suffix}`
    const outboundIdB = `project-detail-out-b-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status, is_deleted)
      VALUES (?, ?, '项目详情样本数项目', 'ihc', 1, 0)
    `).run(projectId, `PROJECT-DETAIL-SAMPLE-${suffix}`)
    db.prepare(`
      INSERT INTO outbound_records (
        id, outbound_no, type, project_id, total_cost, sample_count,
        operator, status, created_at, is_deleted
      )
      VALUES
        (?, ?, 'project', ?, 100, 5, 'admin', 'completed', '2032-08-10T09:00:00', 0),
        (?, ?, 'project', ?, 120, 5, 'admin', 'completed', '2032-08-11T09:00:00', 0)
    `).run(
      outboundIdA, `PROJECT-DETAIL-OUT-A-${suffix}`, projectId,
      outboundIdB, `PROJECT-DETAIL-OUT-B-${suffix}`, projectId,
    )

    const res = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.costStats).toMatchObject({
      totalCost: 220,
      sampleCount: 10,
      unitCost: 22,
    })
  })
})
