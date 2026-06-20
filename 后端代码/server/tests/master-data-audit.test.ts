process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../src/app.js')
  const { getDatabase } = await import('../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function loginAdmin(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  expect(res.status).toBe(200)
  return res.body.data.token
}

describe('基础资料操作审计', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('MDA-001: 管理员成功维护核心基础资料后写入操作日志', async () => {
    const suffix = Date.now()

    const category = await request(app)
      .post('/api/v1/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `审计分类-${suffix}`, auditGroup: `role-story-002-${suffix}` })
    expect(category.status).toBe(201)

    const location = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `审计库位-${suffix}`, type: 'shelf', zone: `Z${suffix}`, capacity: 100, auditGroup: `role-story-002-${suffix}` })
    expect(location.status).toBe(201)

    const material = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `审计物料-${suffix}`,
        unit: '支',
        categoryId: category.body.data.id,
        locationId: location.body.data.id,
        price: 10,
        auditGroup: `role-story-002-${suffix}`,
      })
    expect(material.status).toBe(201)

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `AUD-PRJ-${suffix}`, name: `审计项目-${suffix}`, type: 'ihc', auditGroup: `role-story-002-${suffix}` })
    expect(project.status).toBe(201)

    const equipment = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `AUD-EQ-${suffix}`,
        name: `审计设备-${suffix}`,
        purchasePrice: 10000,
        residualValue: 1000,
        depreciableLifeYears: 5,
        depreciationMethod: 'straight_line',
        auditGroup: `role-story-002-${suffix}`,
      })
    expect(equipment.status).toBe(201)

    const bom = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `AUD-BOM-${suffix}`,
        name: `审计BOM-${suffix}`,
        type: 'ihc',
        serviceId: project.body.data.id,
        materials: [{ materialId: material.body.data.id, usagePerSample: 1, unit: '支' }],
        equipmentTemplates: [{ equipmentId: equipment.body.data.id, usageMinutes: 10 }],
        auditGroup: `role-story-002-${suffix}`,
      })
    expect(bom.status).toBe(201)

    const modules = db.prepare(`
      SELECT operation, request_data
      FROM operation_logs
      WHERE request_data LIKE ?
      ORDER BY rowid ASC
    `).all(`%"auditGroup":"role-story-002-${suffix}"%`) as any[]

    expect(modules.map(row => row.operation)).toEqual([
      'POST /categories',
      'POST /locations',
      'POST /materials',
      'POST /projects',
      'POST /equipment',
      'POST /boms',
    ])
  })
})
