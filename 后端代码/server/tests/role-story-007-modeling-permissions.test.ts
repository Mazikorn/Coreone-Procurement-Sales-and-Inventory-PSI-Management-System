process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../src/app.js')
  const { getDatabase } = await import('../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function login(app: any, username: string, password = 'CoreOne2026!') {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password })
  expect(res.status).toBe(200)
  return res.body.data.token as string
}

function seedCoreMaterial(db: any, suffix: string) {
  const categoryId = `cat-rs007-${suffix}`
  const materialId = `mat-rs007-${suffix}`
  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, 1)')
    .run(categoryId, `CAT-RS007-${suffix}`, `角色故事007物料分类-${suffix}`)
  db.prepare('INSERT INTO materials (id, code, name, unit, category_id, price, status) VALUES (?, ?, ?, ?, ?, ?, 1)')
    .run(materialId, `MAT-RS007-${suffix}`, `角色故事007核心物料-${suffix}`, '盒', categoryId, 12)
  return materialId
}

describe('角色故事007 技术建模权限边界', () => {
  let app: any
  let db: any
  let adminToken: string
  let technicianToken: string
  let pathologistToken: string
  let warehouseToken: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    adminToken = await login(app, 'admin', 'admin123')
    technicianToken = await login(app, 'zhangwei')
    pathologistToken = await login(app, 'liuyf')
    warehouseToken = await login(app, 'wangkq')
  })

  it('RS-007-AUTH-001: 技术员可维护项目、BOM、设备和标准工时', async () => {
    const suffix = String(Date.now())
    const materialId = seedCoreMaterial(db, suffix)

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ code: `PRJ-RS007-${suffix}`, name: `技术员项目-${suffix}`, type: 'ihc', manager: '张伟' })
    expect(project.status).toBe(201)

    const bom = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        code: `BOM-RS007-${suffix}`,
        name: `技术员BOM-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '盒' }],
      })
    expect(bom.status).toBe(201)

    const equipment = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        code: `EQ-RS007-${suffix}`,
        name: `技术员设备-${suffix}`,
        purchasePrice: 100000,
        purchaseDate: '2026-01-01',
        depreciableLifeYears: 5,
        residualValue: 10000,
        depreciationMethod: 'straight_line',
        totalCapacity: 0,
        capacityUnit: 'minutes',
        status: 'active',
      })
    expect(equipment.status).toBe(201)

    const laborTime = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        stepCode: `LAB-RS007-${suffix}`,
        stepName: `技术员标准工时-${suffix}`,
        projectType: 'ihc',
        standardMinutes: 18,
        laborRatePerMinute: 2,
      })
    expect(laborTime.status).toBe(201)
  })

  it('RS-007-AUTH-002: 病理医生可读建模资料但不可写项目、BOM、设备和标准工时', async () => {
    const suffix = String(Date.now())
    const materialId = seedCoreMaterial(db, `doc-${suffix}`)

    for (const path of ['/api/v1/projects', '/api/v1/boms', '/api/v1/equipment', '/api/v1/labor-times']) {
      const read = await request(app).get(path).set('Authorization', `Bearer ${pathologistToken}`)
      expect(read.status).toBe(200)
    }

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${pathologistToken}`)
      .send({ code: `PRJ-DOC-${suffix}`, name: `医生项目-${suffix}`, type: 'ihc' })
    expect(project.status).toBe(403)

    const bom = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${pathologistToken}`)
      .send({
        code: `BOM-DOC-${suffix}`,
        name: `医生BOM-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '盒' }],
      })
    expect(bom.status).toBe(403)

    const equipment = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${pathologistToken}`)
      .send({ code: `EQ-DOC-${suffix}`, name: `医生设备-${suffix}`, purchasePrice: 1 })
    expect(equipment.status).toBe(403)

    const laborTime = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${pathologistToken}`)
      .send({ stepCode: `LAB-DOC-${suffix}`, stepName: `医生工时-${suffix}`, projectType: 'ihc', standardMinutes: 10 })
    expect(laborTime.status).toBe(403)
  })

  it('RS-007-AUTH-003: 仓管可读取项目和BOM用于出库交接，但不可写技术模型', async () => {
    const suffix = String(Date.now())

    const projects = await request(app).get('/api/v1/projects').set('Authorization', `Bearer ${warehouseToken}`)
    expect(projects.status).toBe(200)
    const boms = await request(app).get('/api/v1/boms').set('Authorization', `Bearer ${warehouseToken}`)
    expect(boms.status).toBe(200)

    const writeProject = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ code: `PRJ-WH-${suffix}`, name: `仓管项目-${suffix}`, type: 'ihc' })
    expect(writeProject.status).toBe(403)
  })

  it('RS-007-AUTH-004: 建模写操作进入操作日志以支撑交接审计', async () => {
    const suffix = String(Date.now())
    const materialId = seedCoreMaterial(db, `audit-${suffix}`)

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ code: `PRJ-AUDIT-${suffix}`, name: `审计项目-${suffix}`, type: 'ihc' })
    expect(project.status).toBe(201)

    const bom = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        code: `BOM-AUDIT-${suffix}`,
        name: `审计BOM-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '盒' }],
      })
    expect(bom.status).toBe(201)

    const logs = db.prepare(`
      SELECT operation
      FROM operation_logs
      WHERE request_data LIKE ?
      ORDER BY created_at ASC
    `).all(`%${suffix}%`) as any[]
    expect(logs.map(log => log.operation)).toEqual(expect.arrayContaining(['POST /projects', 'POST /boms']))
  })
})
