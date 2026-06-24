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

  return { materialId, locationId, earlyBatchId, lateBatchId }
}

function seedBatchTraceFacts(db: any, suffix: string) {
  const categoryId = `cat-inv-trace-${suffix}`
  const supplierId = `sup-inv-trace-${suffix}`
  const locationAId = `loc-inv-trace-a-${suffix}`
  const locationBId = `loc-inv-trace-b-${suffix}`
  const materialId = `mat-inv-trace-${suffix}`
  const inboundId = `inbound-inv-trace-${suffix}`
  const transferId = `transfer-trace-${suffix}`
  const outboundId = `outbound-trace-${suffix}`
  const batchId = `batch-inv-trace-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-INV-TRACE-${suffix}`, '库存追溯测试分类', 1)
  db.prepare('INSERT INTO suppliers (id, code, name, status) VALUES (?, ?, ?, 1)')
    .run(supplierId, `SUP-INV-TRACE-${suffix}`, '追溯供应商')
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationAId, `LOC-INV-TRACE-A-${suffix}`, '追溯A库位', 'shelf', 'A区')
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationBId, `LOC-INV-TRACE-B-${suffix}`, '追溯B库位', 'shelf', 'B区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, supplier_id, min_stock, price, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-INV-TRACE-${suffix}`, `库存追溯物料-${suffix}`, '10ml', '瓶', categoryId, supplierId, 2, 12, locationAId)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, ?, 0, ?)')
    .run(`inv-inv-trace-${suffix}`, materialId, 10, locationAId)
  db.prepare(`
    INSERT INTO inbound_records (id, inbound_no, type, material_id, batch_id, batch_no, quantity, unit, price, amount, supplier_id, location_id, production_date, expiry_date, operator, status, created_at, updated_at)
    VALUES (?, ?, 'purchase', ?, ?, ?, 10, '瓶', 12, 120, ?, ?, '2026-01-01', '2028-01-31', '王仓管', 'completed', '2026-06-20 09:00:00', '2026-06-20 09:00:00')
  `).run(inboundId, `IN-TRACE-${suffix}`, materialId, batchId, `BATCH-TRACE-${suffix}`, supplierId, locationAId)
  db.prepare(`
    INSERT INTO inbound_records (id, inbound_no, type, material_id, batch_no, quantity, unit, location_id, from_location_id, from_location_name, operator, status, created_at, updated_at)
    VALUES (?, ?, 'transfer', ?, ?, 3, '瓶', ?, ?, '追溯A库位', '赵调拨', 'completed', '2026-06-20 09:30:00', '2026-06-20 09:30:00')
  `).run(transferId, `TF-TRACE-${suffix}`, materialId, `BATCH-TRACE-${suffix}`, locationBId, locationAId)
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, production_date, expiry_date, inbound_id, inbound_price, supplier_id, status, created_at, updated_at)
    VALUES (?, ?, ?, 10, 8, '2026-01-01', '2028-01-31', ?, 12, ?, 1, '2026-06-20 09:00:00', '2026-06-20 10:00:00')
  `).run(batchId, materialId, `BATCH-TRACE-${suffix}`, inboundId, supplierId)
  db.prepare(`
    INSERT INTO batch_location_balances (id, batch_id, material_id, location_id, remaining, created_at, updated_at)
    VALUES (?, ?, ?, ?, 5, '2026-06-20 09:00:00', '2026-06-20 10:00:00')
  `).run(`blb-trace-a-${suffix}`, batchId, materialId, locationAId)
  db.prepare(`
    INSERT INTO batch_location_balances (id, batch_id, material_id, location_id, remaining, created_at, updated_at)
    VALUES (?, ?, ?, ?, 3, '2026-06-20 09:30:00', '2026-06-20 10:00:00')
  `).run(`blb-trace-b-${suffix}`, batchId, materialId, locationBId)
  db.prepare(`
    INSERT INTO batch_location_adjustments (id, related_type, related_id, batch_id, material_id, location_id, quantity_delta, created_at)
    VALUES (?, 'transfer', ?, ?, ?, ?, -3, '2026-06-20 09:30:00')
  `).run(`bla-trace-out-${suffix}`, transferId, batchId, materialId, locationAId)
  db.prepare(`
    INSERT INTO batch_location_adjustments (id, related_type, related_id, batch_id, material_id, location_id, quantity_delta, created_at)
    VALUES (?, 'transfer', ?, ?, ?, ?, 3, '2026-06-20 09:30:01')
  `).run(`bla-trace-in-${suffix}`, transferId, batchId, materialId, locationBId)
  db.prepare(`
    INSERT INTO outbound_records (id, outbound_no, type, total_cost, operator, status, created_at, updated_at)
    VALUES (?, ?, 'project', 24, '吴出库', 'completed', '2026-06-20 09:45:00', '2026-06-20 09:45:00')
  `).run(outboundId, `OB-TRACE-${suffix}`)
  db.prepare(`
    INSERT INTO batch_location_adjustments (id, related_type, related_id, batch_id, material_id, location_id, quantity_delta, created_at)
    VALUES (?, 'outbound', ?, ?, ?, ?, -2, '2026-06-20 09:45:00')
  `).run(`bla-trace-outbound-${suffix}`, outboundId, batchId, materialId, locationAId)

  return { batchId, materialId, locationAId, locationBId }
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

  it('INV-FILTER-002: 按库位筛选多批次库存时每行显示对应批次库存', async () => {
    const suffix = `location-${Date.now()}`
    const { materialId, locationId, earlyBatchId, lateBatchId } = seedInventoryBatches(db, suffix)

    const res = await request(app)
      .get('/api/v1/inventory')
      .query({ locationId, materialId, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const rows = res.body.data.list.filter((row: any) => row.materialId === materialId)
    expect(rows).toHaveLength(2)
    expect(rows.find((row: any) => row.batchId === earlyBatchId)?.stock).toBe(5)
    expect(rows.find((row: any) => row.batchId === lateBatchId)?.stock).toBe(7)
    expect(rows.every((row: any) => row.locationId === locationId)).toBe(true)
    expect(rows.every((row: any) => row.totalStock === 12)).toBe(true)
  })

  it('INV-BATCH-TRACE-001: 批次追溯返回入库形成、库位余额和批次库位调整流水', async () => {
    const suffix = `trace-${Date.now()}`
    const { batchId, materialId } = seedBatchTraceFacts(db, suffix)

    const res = await request(app)
      .get(`/api/v1/inventory/batches/${batchId}/trace`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.batch).toMatchObject({
      id: batchId,
      materialId,
      batchNo: `BATCH-TRACE-${suffix}`,
      quantity: 10,
      remaining: 8,
      inboundNo: `IN-TRACE-${suffix}`,
      supplierName: '追溯供应商',
      locationName: '追溯A库位',
    })
    expect(res.body.data.locationBalances).toEqual([
      expect.objectContaining({ locationName: '追溯A库位', remaining: 5 }),
      expect.objectContaining({ locationName: '追溯B库位', remaining: 3 }),
    ])
    expect(res.body.data.movements).toEqual([
      expect.objectContaining({ type: 'inbound', label: '采购入库', quantityDelta: 10, documentNo: `IN-TRACE-${suffix}`, locationName: '追溯A库位', operator: '王仓管' }),
      expect.objectContaining({ type: 'transfer', label: '调拨转出', quantityDelta: -3, locationName: '追溯A库位', operator: '赵调拨' }),
      expect.objectContaining({ type: 'transfer', label: '调拨转入', quantityDelta: 3, locationName: '追溯B库位', operator: '赵调拨' }),
      expect.objectContaining({ type: 'outbound', label: '出库扣减', quantityDelta: -2, documentNo: `OB-TRACE-${suffix}`, locationName: '追溯A库位', operator: '吴出库' }),
    ])
  })

  it('INV-BATCH-002: 普通出库带 batchId 时只扣减用户选择的批次', async () => {
    const suffix = `outbound-${Date.now()}`
    const { materialId, earlyBatchId, lateBatchId } = seedInventoryBatches(db, suffix)
    const projectId = `project-inv-batch-${suffix}`
    db.prepare('INSERT INTO projects (id, code, name, type, status) VALUES (?, ?, ?, ?, 1)')
      .run(projectId, `PROJ-INV-BATCH-${suffix}`, '库存批次出库项目', 'ihc')

    const res = await request(app)
      .post('/api/v1/outbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'project',
        projectId,
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
