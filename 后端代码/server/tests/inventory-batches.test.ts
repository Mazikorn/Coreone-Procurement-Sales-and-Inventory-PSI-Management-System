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

function seedInventoryBatches(db: any, suffix: string) {
  const categoryId = `cat-inv-batch-${suffix}`
  const locationId = `loc-inv-batch-${suffix}`
  const materialId = `mat-inv-batch-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-INV-BATCH-${suffix}`, '库存批次测试分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-INV-BATCH-${suffix}`, '库存批次测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, min_stock, price, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-INV-BATCH-${suffix}`, `库存批次测试物料-${suffix}`, '1ml', '瓶', categoryId, 2, 12, locationId)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, ?, 0, ?)')
    .run(`inv-inv-batch-${suffix}`, materialId, 12, locationId)

  const earlyBatchId = `batch-inv-early-${suffix}`
  const lateBatchId = `batch-inv-late-${suffix}`
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, expiry_date, inbound_id, inbound_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(earlyBatchId, materialId, `BATCH-INV-EARLY-${suffix}`, 5, 5, '2028-01-31', `inbound-inv-early-${suffix}`, 12)
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, expiry_date, inbound_id, inbound_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(lateBatchId, materialId, `BATCH-INV-LATE-${suffix}`, 7, 7, '2028-12-31', `inbound-inv-late-${suffix}`, 13)

  return { materialId, earlyBatchId, lateBatchId }
}

describe('库存列表批次契约', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('INV-BATCH-001: 同一物料多批次时库存列表返回真实批次行和批次库存', async () => {
    const suffix = `${Date.now()}`
    const { materialId, earlyBatchId, lateBatchId } = seedInventoryBatches(db, suffix)

    const res = await request(app)
      .get('/api/v1/inventory')
      .query({ keyword: `MAT-INV-BATCH-${suffix}`, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const rows = res.body.data.list.filter((row: any) => row.materialId === materialId)
    expect(rows).toHaveLength(2)
    expect(rows.map((row: any) => row.batchId).sort()).toEqual([earlyBatchId, lateBatchId].sort())
    expect(rows.map((row: any) => row.stock).sort((a: number, b: number) => a - b)).toEqual([5, 7])
    expect(rows.every((row: any) => row.totalStock === 12)).toBe(true)
  })

  it('INV-FILTER-001: materialId 精确筛选只返回目标物料库存行', async () => {
    const suffix = `filter-${Date.now()}`
    const first = seedInventoryBatches(db, `${suffix}-a`)
    const second = seedInventoryBatches(db, `${suffix}-b`)

    const res = await request(app)
      .get('/api/v1/inventory')
      .query({ materialId: second.materialId, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.list.length).toBeGreaterThan(0)
    expect(res.body.data.list.every((row: any) => row.materialId === second.materialId)).toBe(true)
    expect(res.body.data.list.some((row: any) => row.materialId === first.materialId)).toBe(false)
    expect(new Set(res.body.data.list.map((row: any) => row.batchId))).toEqual(new Set([second.earlyBatchId, second.lateBatchId]))
  })

  it('INV-BATCH-002: 普通出库带 batchId 时只扣减用户选择的批次', async () => {
    const suffix = `outbound-${Date.now()}`
    const { materialId, earlyBatchId, lateBatchId } = seedInventoryBatches(db, suffix)

    const res = await request(app)
      .post('/api/v1/outbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'project',
        items: [{ materialId, batchId: lateBatchId, quantity: 4, usage: 'external', receiver: '测试接收方' }],
        remark: '指定批次出库测试',
      })

    expect(res.status).toBe(201)
    const earlyBatch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(earlyBatchId) as any
    const lateBatch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(lateBatchId) as any
    const outboundItem = db.prepare('SELECT batch_id, quantity FROM outbound_items WHERE outbound_id = ?')
      .get(res.body.data.id) as any

    expect(earlyBatch.remaining).toBe(5)
    expect(lateBatch.remaining).toBe(3)
    expect(outboundItem.batch_id).toBe(lateBatchId)
    expect(outboundItem.quantity).toBe(4)
  })
})
