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
  expect(res.body.success).toBe(true)
  return res.body.data.token
}

function seedMaterial(db: any, suffix: string, options: { barcode?: string; status?: number } = {}) {
  const categoryId = `cat-barcode-${suffix}`
  const materialId = `mat-barcode-${suffix}`
  const locationId = `loc-barcode-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-BC-${suffix}`, '条码测试分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-BC-${suffix}`, '条码测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, barcode, name, spec, unit, category_id, price, location_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    materialId,
    `MAT-BC-${suffix}`,
    options.barcode || null,
    `条码测试物料${suffix}`,
    '1ml',
    '瓶',
    categoryId,
    12,
    locationId,
    options.status ?? 1,
  )
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, 0, 0, ?)')
    .run(`inv-barcode-${suffix}`, materialId, locationId)

  return { materialId, code: `MAT-BC-${suffix}`, barcode: options.barcode }
}

describe('物料条码查询 API', () => {
  let app: any
  let db: any
  let adminToken: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    adminToken = await loginAdmin(app)
  })

  it('MAT-BC-001: 按 barcode 精确识别启用物料', async () => {
    const suffix = `hit-${Date.now()}`
    const fixture = seedMaterial(db, suffix, { barcode: `BC-${suffix}` })

    const res = await request(app)
      .get(`/api/v1/materials/barcode/${encodeURIComponent(fixture.barcode!)}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.id).toBe(fixture.materialId)
    expect(res.body.data.barcode).toBe(fixture.barcode)
    expect(res.body.data.status).toBe('active')
  })

  it('MAT-BC-002: 没有 barcode 时可用物料编码作为扫码枪输入兜底', async () => {
    const suffix = `code-${Date.now()}`
    const fixture = seedMaterial(db, suffix)

    const res = await request(app)
      .get(`/api/v1/materials/barcode/${encodeURIComponent(fixture.code.toLowerCase())}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.id).toBe(fixture.materialId)
    expect(res.body.data.code).toBe(fixture.code)
  })

  it('MAT-BC-003: 停用或不存在的条码不允许扫码入库', async () => {
    const suffix = `inactive-${Date.now()}`
    const fixture = seedMaterial(db, suffix, { barcode: `BC-${suffix}`, status: 0 })

    const inactiveRes = await request(app)
      .get(`/api/v1/materials/barcode/${encodeURIComponent(fixture.barcode!)}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(inactiveRes.status).toBe(404)

    const missingRes = await request(app)
      .get('/api/v1/materials/barcode/not-exists')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(missingRes.status).toBe(404)
  })

  it('MAT-BC-004: 物料详情返回可供退货批次选择的 remaining/status/inboundPrice', async () => {
    const suffix = `batch-${Date.now()}`
    const fixture = seedMaterial(db, suffix, { barcode: `BC-${suffix}` })
    db.prepare(`
      INSERT INTO batches (id, material_id, batch_no, quantity, remaining, inbound_id, inbound_price, supplier_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `batch-${suffix}`,
      fixture.materialId,
      `BATCH-${suffix}`,
      10,
      7,
      `inbound-${suffix}`,
      12.5,
      `supplier-${suffix}`,
      1,
    )

    const res = await request(app)
      .get(`/api/v1/materials/${fixture.materialId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const batch = res.body.data.batches.find((item: any) => item.id === `batch-${suffix}`)
    expect(batch).toMatchObject({
      id: `batch-${suffix}`,
      batchNo: `BATCH-${suffix}`,
      quantity: 10,
      remaining: 7,
      inboundPrice: 12.5,
      supplierId: `supplier-${suffix}`,
      status: 'normal',
    })
  })
})
