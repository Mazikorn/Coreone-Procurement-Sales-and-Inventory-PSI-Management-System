process.env.DATABASE_PATH = ':memory:'

import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

let app: any
let financeToken: string
let db: any

async function login(username: string, password = 'CoreOne2026!') {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password })
  expect(res.status).toBe(200)
  return res.body.data.token
}

describe('role story 009 finance ABC configuration boundaries', () => {
  beforeAll(async () => {
    const imported = await import('../src/app.js')
    const database = await import('../src/database/DatabaseManager.js')
    app = imported.default
    db = database.getDatabase()
    financeToken = await login('sunli')
  })

  it('allows finance to read project, BOM, and material context for ABC configuration', async () => {
    for (const path of ['/api/v1/projects', '/api/v1/boms', '/api/v1/materials']) {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${financeToken}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    }
  })

  it('does not let finance write technical master data while configuring costs', async () => {
    const createProject = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ code: 'FIN-PROJ-DENY', name: '财务不能建项目', type: 'ihc' })
    expect(createProject.status).toBe(403)

    const createBom = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ code: 'FIN-BOM-DENY', name: '财务不能建BOM', type: 'ihc', materials: [] })
    expect(createBom.status).toBe(403)

    const createMaterial = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ code: 'FIN-MAT-DENY', name: '财务不能建物料', unit: '支', categoryId: 'missing' })
    expect(createMaterial.status).toBe(403)
  })

  it('keeps finance able to write finance-owned ABC configuration', async () => {
    const suffix = Date.now()
    const center = await request(app)
      .post('/api/v1/abc/activity-centers')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        code: `FIN_AC_${suffix}`,
        name: '财务配置作业中心',
        costDriverType: 'slide_count',
      })

    expect(center.status).toBe(201)
    expect(center.body.success).toBe(true)

    const pool = await request(app)
      .post('/api/v1/abc/cost-pools')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        activityCenterId: center.body.data.id,
        yearMonth: '2098-09',
        directCost: 100,
        indirectCost: 25,
        driverQuantity: 5,
        adjustmentReason: '角色故事验证财务手工录入成本池原因',
        sourceDocumentNo: 'RS009-MANUAL-POOL',
        description: '财务配置故事成本池',
      })

    expect(pool.status).toBe(201)
    expect(pool.body.success).toBe(true)

    const auditRows = db.prepare(`
      SELECT module, action, target_id, operator
      FROM abc_audit_logs
      WHERE target_id IN (?, ?)
      ORDER BY created_at ASC
    `).all(center.body.data.id, pool.body.data.id) as any[]
    expect(auditRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ module: 'activity_center', action: 'create', target_id: center.body.data.id, operator: 'sunli' }),
      expect.objectContaining({ module: 'cost_pool', action: 'create', target_id: pool.body.data.id, operator: 'sunli' }),
    ]))
  })

  it('lets finance map BOM fees when legacy fee standards store active status as 1', async () => {
    const suffix = Date.now()
    const bomId = `rs009-bom-${suffix}`
    const feeStandardId = `rs009-fee-${suffix}`

    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status)
      VALUES (?, ?, ?, 'v1', 'ihc', 1)
    `).run(bomId, `RS009-BOM-${suffix}`, '财务ABC收费映射BOM')
    db.prepare(`
      INSERT INTO fee_standards (
        id, code, name, category, project_type, fee_per_slide, base_price, status
      )
      VALUES (?, ?, ?, 'ihc', 'ihc', 120, 120, 1)
    `).run(feeStandardId, `RS009-FEE-${suffix}`, '财务ABC收费标准')

    const saveMapping = await request(app)
      .put(`/api/v1/abc/bom-fee-mappings/${bomId}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        mappings: [{
          feeStandardId,
          quantityMultiplier: 1,
          aggregationScope: 'outbound',
          sortOrder: 0,
        }],
      })

    expect(saveMapping.status).toBe(200)
    expect(saveMapping.body.success).toBe(true)
    expect(saveMapping.body.data.count).toBe(1)

    const mappingRow = db.prepare(`
      SELECT bom_id, fee_standard_id, status
      FROM bom_fee_mappings
      WHERE bom_id = ? AND fee_standard_id = ?
    `).get(bomId, feeStandardId) as any
    expect(mappingRow).toEqual(expect.objectContaining({
      bom_id: bomId,
      fee_standard_id: feeStandardId,
      status: 'active',
    }))

    const auditRow = db.prepare(`
      SELECT module, action, target_id, operator
      FROM abc_audit_logs
      WHERE module = 'bom_fee_mapping' AND target_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `).get(bomId) as any
    expect(auditRow).toEqual(expect.objectContaining({
      module: 'bom_fee_mapping',
      action: 'update',
      target_id: bomId,
      operator: 'sunli',
    }))
  })
})
