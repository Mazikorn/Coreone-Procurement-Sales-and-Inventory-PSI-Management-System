process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'

const unique = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

async function getApp() {
  const { default: app } = await import('../../src/app.js')
  const { getDatabase, initializeDatabase } = await import('../../src/database/DatabaseManager.js')
  return { app, db: getDatabase(), initializeDatabase }
}

async function loginAdmin(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })

  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedBase(db: any, suffix: string) {
  const categoryId = `cat-${suffix}`
  const supplierId = `sup-${suffix}`
  const locationId = `loc-${suffix}`
  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)').run(categoryId, `C-${suffix}`, '成本异常分类', 1)
  db.prepare('INSERT INTO suppliers (id, code, name) VALUES (?, ?, ?)').run(supplierId, `S-${suffix}`, '成本异常供应商')
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)').run(locationId, `L-${suffix}`, 'A1', 'shelf', 'A区')
  return { categoryId, supplierId, locationId }
}

function seedMaterialWithStock(db: any, suffix: string, base: ReturnType<typeof seedBase>, stock = 100, price = 50) {
  const materialId = `mat-${suffix}`
  const batchId = `batch-${suffix}`
  const inboundId = `in-${suffix}`
  db.prepare(`
    INSERT INTO materials (id, code, name, unit, category_id, supplier_id, price, location_id)
    VALUES (?, ?, ?, '支', ?, ?, ?, ?)
  `).run(materialId, `M-${suffix}`, '成本异常主物料', base.categoryId, base.supplierId, price, base.locationId)
  db.prepare(`
    INSERT INTO inventory (id, material_id, stock, location_id)
    VALUES (?, ?, ?, ?)
  `).run(`inv-${suffix}`, materialId, stock, base.locationId)
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, inbound_id, inbound_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(batchId, materialId, `B-${suffix}`, stock, stock, inboundId, price)
  return materialId
}

function seedEmptyMaterial(db: any, suffix: string, base: ReturnType<typeof seedBase>) {
  const materialId = `mat-empty-${suffix}`
  db.prepare(`
    INSERT INTO materials (id, code, name, unit, category_id, supplier_id, price, location_id)
    VALUES (?, ?, ?, '支', ?, ?, 12, ?)
  `).run(materialId, `ME-${suffix}`, '成本异常缺货物料', base.categoryId, base.supplierId, base.locationId)
  db.prepare(`
    INSERT INTO inventory (id, material_id, stock, location_id)
    VALUES (?, ?, 0, ?)
  `).run(`inv-empty-${suffix}`, materialId, base.locationId)
  return materialId
}

function seedBomProject(db: any, suffix: string, materialId: string) {
  const bomId = `bom-${suffix}`
  const projectId = `proj-${suffix}`
  db.prepare(`
    INSERT INTO boms (id, code, name, version, type, status)
    VALUES (?, ?, ?, 'v1.0', 'ihc', 1)
  `).run(bomId, `BOM-${suffix}`, '成本异常BOM')
  db.prepare(`
    INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit)
    VALUES (?, ?, ?, 1, '支')
  `).run(`bi-${suffix}`, bomId, materialId)
  db.prepare(`
    INSERT INTO projects (id, code, name, type, bom_id, status)
    VALUES (?, ?, ?, 'ihc', ?, 1)
  `).run(projectId, `PRJ-${suffix}`, '成本异常项目', bomId)
  return { bomId, projectId }
}

describe('成本异常台账', () => {
  let app: any
  let db: any
  let token: string
  let initializeDatabase: () => void

  beforeAll(async () => {
    ({ app, db, initializeDatabase } = await getApp())
    token = await loginAdmin(app)
  })

  afterAll(() => {
    initializeDatabase()
  })

  it('BOM出库跳过扩展物料时写入成本异常', async () => {
    const suffix = unique('skip')
    const base = seedBase(db, suffix)
    const materialId = seedMaterialWithStock(db, `${suffix}-core`, base, 20, 30)
    const skippedMaterialId = seedEmptyMaterial(db, suffix, base)
    const { bomId, projectId } = seedBomProject(db, suffix, materialId)

    db.prepare(`
      INSERT INTO bom_general_reagents (id, bom_id, material_id, usage_per_sample, unit)
      VALUES (?, ?, ?, 1, '支')
    `).run(`gr-${suffix}`, bomId, skippedMaterialId)

    const res = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId, bomId, sampleCount: 2 })

    expect(res.status).toBe(201)
    expect(res.body.data.skippedItems).toHaveLength(1)

    const row = db.prepare(`
      SELECT *
      FROM cost_exceptions
      WHERE outbound_id = ? AND exception_type = 'bom_material_skipped'
    `).get(res.body.data.id) as any
    expect(row).toBeDefined()
    expect(row.severity).toBe('warning')
    expect(JSON.parse(row.details).skippedItems[0].materialId).toBe(skippedMaterialId)
  })

  it('ABC详情写入失败时出库继续并写入成本异常', async () => {
    const suffix = unique('abc')
    const base = seedBase(db, suffix)
    const materialId = seedMaterialWithStock(db, `${suffix}-core`, base, 20, 40)
    const { bomId, projectId } = seedBomProject(db, suffix, materialId)

    db.exec('DROP TABLE outbound_abc_details')

    const res = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId, bomId, sampleCount: 3 })

    expect(res.status).toBe(201)
    expect(res.body.data.totalCost).toBe(120)

    const row = db.prepare(`
      SELECT *
      FROM cost_exceptions
      WHERE outbound_id = ? AND exception_type = 'abc_calculation_failed'
    `).get(res.body.data.id) as any
    expect(row).toBeDefined()
    expect(row.severity).toBe('error')
    expect(JSON.parse(row.details).materialCost).toBe(120)

    initializeDatabase()

    const list = await request(app)
      .get('/api/v1/abc/exceptions?exceptionType=abc_calculation_failed&sourceModule=abc')
      .set('Authorization', `Bearer ${token}`)

    expect(list.status).toBe(200)
    expect(list.body.data.list.some((item: any) => item.outboundId === res.body.data.id)).toBe(true)
  })
})
