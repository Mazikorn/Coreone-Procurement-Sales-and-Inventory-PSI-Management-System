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

function seedBatchInboundFixture(db: any, suffix: string) {
  const categoryId = `cat-in-batch-${suffix}`
  const supplierId = `sup-in-batch-${suffix}`
  const locationId = `loc-in-batch-${suffix}`
  const materialId = `mat-in-batch-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-INB-${suffix}`, '批量入库分类', 1)
  db.prepare('INSERT INTO suppliers (id, code, name, status) VALUES (?, ?, ?, ?)')
    .run(supplierId, `SUP-INB-${suffix}`, '批量入库供应商', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(locationId, `LOC-INB-${suffix}`, '批量入库库位', 'shelf', 'A区', 1)
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, supplier_id, price, location_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-INB-${suffix}`, '批量入库物料', '1ml', '瓶', categoryId, supplierId, 12, locationId, 1)

  return { materialId, supplierId, locationId }
}

function seedNoBatchOutbound(db: any, fixture: { materialId: string; locationId: string }, suffix: string, quantity = 3) {
  const outboundId = `out-nobatch-${suffix}`
  const itemId = `out-item-nobatch-${suffix}`

  db.prepare(`
    INSERT INTO outbound_records (id, outbound_no, type, total_cost, operator, status)
    VALUES (?, ?, 'manual', ?, 'admin', 'completed')
  `).run(outboundId, `OB-NOBATCH-${suffix}`, quantity * 10)
  db.prepare(`
    INSERT INTO outbound_items (id, outbound_id, material_id, batch_no, quantity, unit, unit_cost, total_cost)
    VALUES (?, ?, ?, NULL, ?, '瓶', 10, ?)
  `).run(itemId, outboundId, fixture.materialId, quantity, quantity * 10)
  db.prepare('UPDATE inventory SET stock = stock - ? WHERE material_id = ?')
    .run(quantity, fixture.materialId)
  db.prepare('UPDATE inventory_locations SET stock = stock - ? WHERE material_id = ? AND location_id = ?')
    .run(quantity, fixture.materialId, fixture.locationId)

  return { outboundId, itemId }
}

function seedLegacyNoBatchInbound(db: any, fixture: { materialId: string; supplierId: string; locationId: string }, suffix: string, quantity = 10) {
  const inboundId = `in-legacy-nobatch-${suffix}`
  const inboundNo = `IB-LEGACY-NOBATCH-${suffix}`
  db.prepare(`
    INSERT INTO inbound_records (id, inbound_no, type, material_id, batch_no, quantity, unit, price, amount, supplier_id, location_id, expiry_date, operator, status)
    VALUES (?, ?, 'direct', ?, NULL, ?, '瓶', 10, ?, ?, ?, '2027-01-01', 'admin', 'completed')
  `).run(inboundId, inboundNo, fixture.materialId, quantity, quantity * 10, fixture.supplierId, fixture.locationId)
  db.prepare(`
    INSERT INTO inventory (id, material_id, stock, locked_stock, location_id, last_inbound_id, last_inbound_date, update_time)
    VALUES (?, ?, ?, 0, ?, ?, date('now','localtime'), CURRENT_TIMESTAMP)
  `).run(`inv-legacy-nobatch-${suffix}`, fixture.materialId, quantity, fixture.locationId, inboundId)
  db.prepare(`
    INSERT INTO inventory_locations (id, material_id, location_id, stock)
    VALUES (?, ?, ?, ?)
  `).run(`inv-loc-legacy-nobatch-${suffix}`, fixture.materialId, fixture.locationId, quantity)

  return { inboundId, inboundNo }
}

describe('批量入库 API', () => {
  let app: any
  let db: any
  let adminToken: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    adminToken = await loginAdmin(app)
  })

  it('INB-BATCH-001: 一次事务写入入库记录、批次、库存和流水', async () => {
    const suffix = `ok-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)

    const res = await request(app)
      .post('/api/v1/inbound/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        records: [
          {
            type: 'direct',
            materialId: fixture.materialId,
            batchNo: `B-INB-${suffix}-1`,
            quantity: 10,
            price: 21,
            supplierId: fixture.supplierId,
            locationId: fixture.locationId,
            productionDate: '2026-01-01',
            expiryDate: '2027-01-01',
            remark: '第一批',
          },
          {
            type: 'direct',
            materialId: fixture.materialId,
            batchNo: `B-INB-${suffix}-2`,
            quantity: 5,
            price: 30,
            supplierId: fixture.supplierId,
            locationId: fixture.locationId,
            expiryDate: '2027-02-01',
          },
        ],
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    expect(res.body.data.createdCount).toBe(2)

    const inventory = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?')
      .get(fixture.materialId) as any
    expect(inventory.stock).toBe(15)
    expect(inventory.location_id).toBe(fixture.locationId)

    const batches = db.prepare('SELECT batch_no, quantity, remaining, inbound_price, supplier_id FROM batches WHERE material_id = ? ORDER BY batch_no')
      .all(fixture.materialId) as any[]
    expect(batches).toMatchObject([
      { batch_no: `B-INB-${suffix}-1`, quantity: 10, remaining: 10, inbound_price: 21, supplier_id: fixture.supplierId },
      { batch_no: `B-INB-${suffix}-2`, quantity: 5, remaining: 5, inbound_price: 30, supplier_id: fixture.supplierId },
    ])

    const logs = db.prepare('SELECT operator, before_stock, after_stock, related_type FROM stock_logs WHERE material_id = ? ORDER BY created_at, after_stock')
      .all(fixture.materialId) as any[]
    expect(logs).toHaveLength(2)
    expect(logs[0]).toMatchObject({ operator: 'admin', before_stock: 0, after_stock: 10, related_type: 'inbound_batch' })
    expect(logs[1]).toMatchObject({ operator: 'admin', before_stock: 10, after_stock: 15, related_type: 'inbound_batch' })
  })

  it('INB-BATCH-002: 校验失败时不写入任何有效行', async () => {
    const suffix = `bad-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)

    const res = await request(app)
      .post('/api/v1/inbound/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        records: [
          {
            type: 'direct',
            materialId: fixture.materialId,
            batchNo: `B-INB-${suffix}-VALID`,
            quantity: 3,
            price: 18,
            locationId: fixture.locationId,
            expiryDate: '2027-03-01',
          },
          {
            type: 'direct',
            materialId: fixture.materialId,
            batchNo: '',
            quantity: 2,
            price: 18,
            locationId: 'missing-location',
            expiryDate: '2027/03/01',
          },
        ],
      })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)

    const inboundCount = (db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE material_id = ?')
      .get(fixture.materialId) as any).count
    const batchCount = (db.prepare('SELECT COUNT(*) as count FROM batches WHERE material_id = ?')
      .get(fixture.materialId) as any).count
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any

    expect(inboundCount).toBe(0)
    expect(batchCount).toBe(0)
    expect(inventory).toBeUndefined()
  })

  it('INB-REF-001: 普通入库拒绝停用物料、供应商或库位', async () => {
    const suffix = `ref-${Date.now()}`
    const inactiveMaterialFixture = seedBatchInboundFixture(db, `${suffix}-mat`)
    const inactiveSupplierFixture = seedBatchInboundFixture(db, `${suffix}-sup`)
    const inactiveLocationFixture = seedBatchInboundFixture(db, `${suffix}-loc`)

    db.prepare('UPDATE materials SET status = 0 WHERE id = ?').run(inactiveMaterialFixture.materialId)
    db.prepare('UPDATE suppliers SET status = 0 WHERE id = ?').run(inactiveSupplierFixture.supplierId)
    db.prepare('UPDATE locations SET status = 0 WHERE id = ?').run(inactiveLocationFixture.locationId)

    const inactiveMaterial = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: inactiveMaterialFixture.materialId,
        batchNo: `B-INB-${suffix}-MAT`,
        quantity: 1,
        price: 10,
        supplierId: inactiveMaterialFixture.supplierId,
        locationId: inactiveMaterialFixture.locationId,
        expiryDate: '2027-01-01',
      })

    const inactiveSupplier = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: inactiveSupplierFixture.materialId,
        batchNo: `B-INB-${suffix}-SUP`,
        quantity: 1,
        price: 10,
        supplierId: inactiveSupplierFixture.supplierId,
        locationId: inactiveSupplierFixture.locationId,
        expiryDate: '2027-01-01',
      })

    const inactiveLocation = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: inactiveLocationFixture.materialId,
        batchNo: `B-INB-${suffix}-LOC`,
        quantity: 1,
        price: 10,
        supplierId: inactiveLocationFixture.supplierId,
        locationId: inactiveLocationFixture.locationId,
        expiryDate: '2027-01-01',
      })

    expect(inactiveMaterial.status).toBe(409)
    expect(inactiveSupplier.status).toBe(409)
    expect(inactiveLocation.status).toBe(409)

    const count = (db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE batch_no LIKE ?')
      .get(`B-INB-${suffix}%`) as any).count
    expect(count).toBe(0)
  })

  it('INB-VALIDATION-001: 普通入库拒绝非正数量和负单价，避免写入负库存或负金额', async () => {
    const suffix = `single-validation-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)

    const invalidPayloads = [
      { quantity: -1, price: 10, batchNo: `B-INB-${suffix}-NEG-QTY`, message: '数量' },
      { quantity: 0, price: 10, batchNo: `B-INB-${suffix}-ZERO-QTY`, message: '数量' },
      { quantity: 1, price: -10, batchNo: `B-INB-${suffix}-NEG-PRICE`, message: '单价' },
    ]

    for (const payload of invalidPayloads) {
      const res = await request(app)
        .post('/api/v1/inbound')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'direct',
          materialId: fixture.materialId,
          batchNo: payload.batchNo,
          quantity: payload.quantity,
          price: payload.price,
          supplierId: fixture.supplierId,
          locationId: fixture.locationId,
          expiryDate: '2027-01-01',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain(payload.message)
    }

    const inboundCount = (db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE batch_no LIKE ?')
      .get(`B-INB-${suffix}%`) as any).count
    const batchCount = (db.prepare('SELECT COUNT(*) as count FROM batches WHERE material_id = ?')
      .get(fixture.materialId) as any).count
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any

    expect(inboundCount).toBe(0)
    expect(batchCount).toBe(0)
    expect(inventory).toBeUndefined()
  })

  it('INB-VALIDATION-002: 普通入库必须写入批号和有效期，避免批次和预警链路断裂', async () => {
    const suffix = `single-required-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)

    const missingBatch = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        quantity: 1,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })

    const missingExpiry = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo: `B-INB-${suffix}-NO-EXPIRY`,
        quantity: 1,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
      })

    expect(missingBatch.status).toBe(400)
    expect(missingBatch.body.error.message).toContain('批号')
    expect(missingExpiry.status).toBe(400)
    expect(missingExpiry.body.error.message).toContain('有效期')

    const inboundCount = (db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE material_id = ?')
      .get(fixture.materialId) as any).count
    const batchCount = (db.prepare('SELECT COUNT(*) as count FROM batches WHERE material_id = ?')
      .get(fixture.materialId) as any).count
    expect(inboundCount).toBe(0)
    expect(batchCount).toBe(0)
  })

  it('INB-VALIDATION-003: 采购入库必须关联采购订单，避免采购收货进度靠线下核对', async () => {
    const suffix = `single-po-required-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)

    const res = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'purchase',
        materialId: fixture.materialId,
        batchNo: `B-INB-${suffix}-PO`,
        quantity: 1,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('采购订单')

    const inboundCount = (db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE material_id = ?')
      .get(fixture.materialId) as any).count
    expect(inboundCount).toBe(0)
  })

  it('INB-BATCH-003: 同一物料同一批号拒绝不同单价或供应商再次入库', async () => {
    const suffix = `cost-source-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)
    const otherSupplierId = `sup-in-batch-other-${suffix}`
    db.prepare('INSERT INTO suppliers (id, code, name, status) VALUES (?, ?, ?, ?)')
      .run(otherSupplierId, `SUP-INB-OTHER-${suffix}`, '批次来源冲突供应商', 1)
    const batchNo = `B-INB-${suffix}-LOCKED`

    const first = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo,
        quantity: 10,
        price: 21,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })

    expect(first.status).toBe(201)

    const differentPrice = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo,
        quantity: 2,
        price: 22,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(differentPrice.status).toBe(409)
    expect(differentPrice.body.error.message).toContain('入库单价必须一致')

    const differentSupplier = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo,
        quantity: 2,
        price: 21,
        supplierId: otherSupplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(differentSupplier.status).toBe(409)
    expect(differentSupplier.body.error.message).toContain('供应商必须一致')

    const batch = db.prepare('SELECT quantity, remaining, inbound_price, supplier_id FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, batchNo) as any
    const inboundCount = (db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, batchNo) as any).count

    expect(batch).toMatchObject({ quantity: 10, remaining: 10, inbound_price: 21, supplier_id: fixture.supplierId })
    expect(inboundCount).toBe(1)
  })

  it('INB-BATCH-004: 批量导入同一物料同一批号拒绝不同单价', async () => {
    const suffix = `batch-conflict-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)
    const batchNo = `B-INB-${suffix}-DUP`

    const res = await request(app)
      .post('/api/v1/inbound/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        records: [
          {
            type: 'direct',
            materialId: fixture.materialId,
            batchNo,
            quantity: 2,
            price: 21,
            supplierId: fixture.supplierId,
            locationId: fixture.locationId,
            expiryDate: '2027-01-01',
          },
          {
            type: 'direct',
            materialId: fixture.materialId,
            batchNo,
            quantity: 3,
            price: 22,
            supplierId: fixture.supplierId,
            locationId: fixture.locationId,
            expiryDate: '2027-01-01',
          },
        ],
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('入库单价必须一致')

    const inboundCount = (db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, batchNo) as any).count
    const batchCount = (db.prepare('SELECT COUNT(*) as count FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, batchNo) as any).count
    expect(inboundCount).toBe(0)
    expect(batchCount).toBe(0)
  })

  it('INB-UPDATE-001: 普通入库更新拒绝非正数量和负单价，避免事后污染库存事实', async () => {
    const suffix = `update-validation-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)
    const invalidPayloads = [
      { quantity: 0, message: '数量' },
      { quantity: -1, message: '数量' },
      { price: -1, message: '单价' },
    ]

    for (let index = 0; index < invalidPayloads.length; index += 1) {
      const batchNo = `B-INB-${suffix}-${index}`
      const inboundRes = await request(app)
        .post('/api/v1/inbound')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          type: 'direct',
          materialId: fixture.materialId,
          batchNo,
          quantity: 5,
          price: 10,
          supplierId: fixture.supplierId,
          locationId: fixture.locationId,
          expiryDate: '2027-01-01',
        })
      expect(inboundRes.status).toBe(201)
      const inboundId = inboundRes.body.data.id

      const updateRes = await request(app)
        .put(`/api/v1/inbound/${inboundId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidPayloads[index])

      expect(updateRes.status).toBe(400)
      expect(updateRes.body.error.message).toContain(invalidPayloads[index].message)

      const record = db.prepare('SELECT quantity, price, amount FROM inbound_records WHERE id = ?').get(inboundId) as any
      const batch = db.prepare('SELECT quantity, remaining FROM batches WHERE material_id = ? AND batch_no = ?')
        .get(fixture.materialId, batchNo) as any

      expect(record).toMatchObject({ quantity: 5, price: 10, amount: 50 })
      expect(batch.quantity).toBe(5)
      expect(batch.remaining).toBe(5)
    }

    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any
    expect(inventory.stock).toBe(15)
  })

  it('INB-UPDATE-004: 普通入库更新不能清空批号、库位或有效期，避免事后断开批次和预警链路', async () => {
    const suffix = `update-required-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)
    const batchNo = `B-INB-${suffix}-A`

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo,
        quantity: 5,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(inboundRes.status).toBe(201)
    const inboundId = inboundRes.body.data.id

    const invalidPayloads = [
      { body: { batchNo: '' }, message: '批号' },
      { body: { locationId: '' }, message: '库位' },
      { body: { expiryDate: '' }, message: '有效期' },
      { body: { expiryDate: '2027/01/01' }, message: '有效期' },
      { body: { productionDate: '2027/01/01' }, message: '生产日期' },
    ]

    for (const payload of invalidPayloads) {
      const updateRes = await request(app)
        .put(`/api/v1/inbound/${inboundId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(payload.body)

      expect(updateRes.status).toBe(400)
      expect(updateRes.body.error.message).toContain(payload.message)
    }

    const record = db.prepare('SELECT batch_no, location_id, expiry_date, production_date FROM inbound_records WHERE id = ?')
      .get(inboundId) as any
    const batch = db.prepare('SELECT quantity, remaining, expiry_date FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, batchNo) as any

    expect(record).toMatchObject({
      batch_no: batchNo,
      location_id: fixture.locationId,
      expiry_date: '2027-01-01',
      production_date: null,
    })
    expect(batch).toMatchObject({ quantity: 5, remaining: 5, expiry_date: '2027-01-01' })
  })

  it('INB-UPDATE-002: 已有出库记录的入库批次不能改批号，避免出库追溯失真', async () => {
    const suffix = `update-batch-outbound-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)
    const batchNo = `B-INB-${suffix}-A`

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo,
        quantity: 10,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(inboundRes.status).toBe(201)
    const inboundId = inboundRes.body.data.id

    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, total_cost, operator, status)
      VALUES (?, ?, 'normal', 30, 'admin', 'completed')
    `).run(`out-${suffix}`, `OUT-${suffix}`)
    db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, batch_no, quantity, unit, unit_cost, total_cost)
      VALUES (?, ?, ?, ?, 3, '瓶', 10, 30)
    `).run(`out-item-${suffix}`, `out-${suffix}`, fixture.materialId, batchNo)
    db.prepare('UPDATE batches SET remaining = 7 WHERE material_id = ? AND batch_no = ?')
      .run(fixture.materialId, batchNo)
    db.prepare('UPDATE inventory SET stock = 7 WHERE material_id = ?')
      .run(fixture.materialId)

    const updateRes = await request(app)
      .put(`/api/v1/inbound/${inboundId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ batchNo: `B-INB-${suffix}-B` })

    expect(updateRes.status).toBe(400)
    expect(updateRes.body.error.message).toContain('已有出库记录')

    const oldBatch = db.prepare('SELECT quantity, remaining, status FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, batchNo) as any
    const newBatch = db.prepare('SELECT id FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, `B-INB-${suffix}-B`) as any
    const record = db.prepare('SELECT batch_no FROM inbound_records WHERE id = ?').get(inboundId) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any

    expect(updateRes.status).toBe(400)
    expect(oldBatch).toMatchObject({ quantity: 10, remaining: 7, status: 1 })
    expect(newBatch).toBeUndefined()
    expect(record.batch_no).toBe(batchNo)
    expect(inventory.stock).toBe(7)
  })

  it('INB-UPDATE-003: 入库数量更新不能把已有出库的批次剩余量扣成负数', async () => {
    const suffix = `update-batch-remaining-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)
    const consumedBatchNo = `B-INB-${suffix}-A`
    const spareBatchNo = `B-INB-${suffix}-B`

    const consumedInbound = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo: consumedBatchNo,
        quantity: 10,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(consumedInbound.status).toBe(201)

    const spareInbound = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo: spareBatchNo,
        quantity: 20,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(spareInbound.status).toBe(201)

    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, total_cost, operator, status)
      VALUES (?, ?, 'normal', 80, 'admin', 'completed')
    `).run(`out-${suffix}`, `OUT-${suffix}`)
    db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, batch_no, quantity, unit, unit_cost, total_cost)
      VALUES (?, ?, ?, ?, 8, '瓶', 10, 80)
    `).run(`out-item-${suffix}`, `out-${suffix}`, fixture.materialId, consumedBatchNo)
    db.prepare('UPDATE batches SET remaining = 2 WHERE material_id = ? AND batch_no = ?')
      .run(fixture.materialId, consumedBatchNo)
    db.prepare('UPDATE inventory SET stock = 22 WHERE material_id = ?')
      .run(fixture.materialId)
    db.prepare('UPDATE inventory_locations SET stock = 22 WHERE material_id = ? AND location_id = ?')
      .run(fixture.materialId, fixture.locationId)

    const updateRes = await request(app)
      .put(`/api/v1/inbound/${consumedInbound.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: 1 })

    expect(updateRes.status).toBe(400)
    expect(updateRes.body.error.message).toContain('批次剩余量')

    const record = db.prepare('SELECT quantity, amount FROM inbound_records WHERE id = ?')
      .get(consumedInbound.body.data.id) as any
    const consumedBatch = db.prepare('SELECT quantity, remaining, status FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, consumedBatchNo) as any
    const spareBatch = db.prepare('SELECT quantity, remaining, status FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, spareBatchNo) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any
    const locationStock = db.prepare('SELECT stock FROM inventory_locations WHERE material_id = ? AND location_id = ?')
      .get(fixture.materialId, fixture.locationId) as any

    expect(record).toMatchObject({ quantity: 10, amount: 100 })
    expect(consumedBatch).toMatchObject({ quantity: 10, remaining: 2, status: 1 })
    expect(spareBatch).toMatchObject({ quantity: 20, remaining: 20, status: 1 })
    expect(inventory.stock).toBe(22)
    expect(locationStock.stock).toBe(22)
  })

  it('INB-DELETE-001: 删除已完成入库的库存流水必须记录物料总库存真实扣减', async () => {
    const suffix = `delete-log-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)

    const firstInbound = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo: `B-INB-${suffix}-A`,
        quantity: 5,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(firstInbound.status).toBe(201)

    const secondInbound = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo: `B-INB-${suffix}-B`,
        quantity: 10,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(secondInbound.status).toBe(201)

    const deleteRes = await request(app)
      .delete(`/api/v1/inbound/${firstInbound.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(deleteRes.status).toBe(200)

    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any
    const firstBatch = db.prepare('SELECT quantity, remaining, status FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, `B-INB-${suffix}-A`) as any
    const secondBatch = db.prepare('SELECT quantity, remaining, status FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, `B-INB-${suffix}-B`) as any
    const deleteLog = db.prepare(`
      SELECT quantity, before_stock, after_stock, related_type
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'inbound_delete'
    `).get(firstInbound.body.data.id) as any

    expect(inventory.stock).toBe(10)
    expect(firstBatch).toMatchObject({ quantity: 0, remaining: 0, status: 0 })
    expect(secondBatch).toMatchObject({ quantity: 10, remaining: 10, status: 1 })
    expect(deleteLog).toMatchObject({
      quantity: -5,
      before_stock: 15,
      after_stock: 10,
      related_type: 'inbound_delete',
    })
  })

  it('INB-DELETE-003: 批次数量后续下调后删除旧入库必须拒绝，避免批次和总库存扣成负数', async () => {
    const suffix = `delete-stale-batch-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)
    const batchNo = `B-INB-${suffix}`

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo,
        quantity: 10,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(inboundRes.status).toBe(201)
    const inboundId = inboundRes.body.data.id

    db.prepare('UPDATE batches SET quantity = 6, remaining = 6 WHERE material_id = ? AND batch_no = ?')
      .run(fixture.materialId, batchNo)
    db.prepare('UPDATE inventory SET stock = 6 WHERE material_id = ?')
      .run(fixture.materialId)
    db.prepare('UPDATE inventory_locations SET stock = 6 WHERE material_id = ? AND location_id = ?')
      .run(fixture.materialId, fixture.locationId)
    const logCountBefore = db.prepare('SELECT COUNT(*) as count FROM stock_logs WHERE related_id = ?')
      .get(inboundId) as any

    const deleteRes = await request(app)
      .delete(`/api/v1/inbound/${inboundId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(deleteRes.status).toBe(409)
    expect(deleteRes.body.error.code).toBe('BATCH_UNDERFLOW_CONFLICT')

    const record = db.prepare('SELECT is_deleted, status FROM inbound_records WHERE id = ?').get(inboundId) as any
    const batch = db.prepare('SELECT quantity, remaining, status FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, batchNo) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any
    const locationStock = db.prepare('SELECT stock FROM inventory_locations WHERE material_id = ? AND location_id = ?')
      .get(fixture.materialId, fixture.locationId) as any
    const logCountAfter = db.prepare('SELECT COUNT(*) as count FROM stock_logs WHERE related_id = ?')
      .get(inboundId) as any

    expect(record).toMatchObject({ is_deleted: 0, status: 'completed' })
    expect(batch).toMatchObject({ quantity: 6, remaining: 6, status: 1 })
    expect(inventory.stock).toBe(6)
    expect(locationStock.stock).toBe(6)
    expect(Number(logCountAfter.count)).toBe(Number(logCountBefore.count))
  })

  it('INB-DELETE-002: 删除已取消入库不应再生成库存变动流水', async () => {
    const suffix = `delete-cancelled-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo: `B-INB-${suffix}`,
        quantity: 5,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(inboundRes.status).toBe(201)
    const inboundId = inboundRes.body.data.id

    const cancelRes = await request(app)
      .post(`/api/v1/inbound/${inboundId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '删除已取消记录前置' })
    expect(cancelRes.status).toBe(200)

    const deleteRes = await request(app)
      .delete(`/api/v1/inbound/${inboundId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(deleteRes.status).toBe(200)

    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any
    const record = db.prepare('SELECT status, is_deleted FROM inbound_records WHERE id = ?').get(inboundId) as any
    const deleteLogCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'inbound_delete'
    `).get(inboundId) as any).count
    const cancelLog = db.prepare(`
      SELECT quantity, before_stock, after_stock
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'inbound_cancel'
    `).get(inboundId) as any

    expect(inventory.stock).toBe(0)
    expect(record).toMatchObject({ status: 'cancelled', is_deleted: 1 })
    expect(deleteLogCount).toBe(0)
    expect(cancelLog).toMatchObject({ quantity: -5, before_stock: 5, after_stock: 0 })
  })

  it('INB-CHECK-001: 无批号入库存在出库记录时删除预检查必须阻断', async () => {
    const suffix = `check-nobatch-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)
    const { inboundId } = seedLegacyNoBatchInbound(db, fixture, suffix, 10)
    seedNoBatchOutbound(db, fixture, suffix, 3)

    const checkRes = await request(app)
      .get(`/api/v1/inbound/${inboundId}/check-deletable`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(checkRes.status).toBe(200)
    expect(checkRes.body.data.canDelete).toBe(false)
    expect(checkRes.body.data.reasons.join('；')).toContain('已有出库记录')
  })

  it('INB-STATUS-001: 通用状态取消必须阻断已有出库的无批号入库并避免负库存', async () => {
    const suffix = `status-cancel-nobatch-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)
    const { inboundId } = seedLegacyNoBatchInbound(db, fixture, suffix, 10)
    seedNoBatchOutbound(db, fixture, suffix, 3)

    const cancelRes = await request(app)
      .put(`/api/v1/inbound/${inboundId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' })

    expect(cancelRes.status).toBe(400)
    expect(cancelRes.body.error.message).toContain('已有出库记录')

    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any
    const locationStock = db.prepare('SELECT COALESCE(SUM(stock), 0) as stock FROM inventory_locations WHERE material_id = ? AND location_id = ?')
      .get(fixture.materialId, fixture.locationId) as any
    const record = db.prepare('SELECT status FROM inbound_records WHERE id = ?').get(inboundId) as any
    const cancelLogCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE related_id = ? AND type = 'cancel'
    `).get(inboundId) as any).count

    expect(inventory.stock).toBe(7)
    expect(locationStock.stock).toBe(7)
    expect(record.status).toBe('completed')
    expect(cancelLogCount).toBe(0)
  })

  it('INB-CANCEL-002: 批次数量后续下调后专用取消入库必须拒绝，避免批次和总库存扣成负数', async () => {
    const suffix = `cancel-stale-batch-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)
    const batchNo = `B-INB-${suffix}`

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo,
        quantity: 10,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(inboundRes.status).toBe(201)
    const inboundId = inboundRes.body.data.id

    db.prepare('UPDATE batches SET quantity = 6, remaining = 6 WHERE material_id = ? AND batch_no = ?')
      .run(fixture.materialId, batchNo)
    db.prepare('UPDATE inventory SET stock = 6 WHERE material_id = ?')
      .run(fixture.materialId)
    db.prepare('UPDATE inventory_locations SET stock = 6 WHERE material_id = ? AND location_id = ?')
      .run(fixture.materialId, fixture.locationId)
    const logCountBefore = db.prepare('SELECT COUNT(*) as count FROM stock_logs WHERE related_id = ?')
      .get(inboundId) as any

    const cancelRes = await request(app)
      .post(`/api/v1/inbound/${inboundId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '后续批次已下调' })

    expect(cancelRes.status).toBe(409)
    expect(cancelRes.body.error.code).toBe('BATCH_UNDERFLOW_CONFLICT')

    const record = db.prepare('SELECT status, is_deleted FROM inbound_records WHERE id = ?').get(inboundId) as any
    const batch = db.prepare('SELECT quantity, remaining, status FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, batchNo) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any
    const locationStock = db.prepare('SELECT stock FROM inventory_locations WHERE material_id = ? AND location_id = ?')
      .get(fixture.materialId, fixture.locationId) as any
    const logCountAfter = db.prepare('SELECT COUNT(*) as count FROM stock_logs WHERE related_id = ?')
      .get(inboundId) as any

    expect(record).toMatchObject({ status: 'completed', is_deleted: 0 })
    expect(batch).toMatchObject({ quantity: 6, remaining: 6, status: 1 })
    expect(inventory.stock).toBe(6)
    expect(locationStock.stock).toBe(6)
    expect(Number(logCountAfter.count)).toBe(Number(logCountBefore.count))
  })

  it('INB-STATUS-003: 批次数量后续下调后通用状态取消入库必须拒绝，避免批次和总库存扣成负数', async () => {
    const suffix = `status-stale-batch-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)
    const batchNo = `B-INB-${suffix}`

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo,
        quantity: 10,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(inboundRes.status).toBe(201)
    const inboundId = inboundRes.body.data.id

    db.prepare('UPDATE batches SET quantity = 6, remaining = 6 WHERE material_id = ? AND batch_no = ?')
      .run(fixture.materialId, batchNo)
    db.prepare('UPDATE inventory SET stock = 6 WHERE material_id = ?')
      .run(fixture.materialId)
    db.prepare('UPDATE inventory_locations SET stock = 6 WHERE material_id = ? AND location_id = ?')
      .run(fixture.materialId, fixture.locationId)
    const logCountBefore = db.prepare('SELECT COUNT(*) as count FROM stock_logs WHERE related_id = ?')
      .get(inboundId) as any

    const cancelRes = await request(app)
      .put(`/api/v1/inbound/${inboundId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cancelled' })

    expect(cancelRes.status).toBe(409)
    expect(cancelRes.body.error.code).toBe('BATCH_UNDERFLOW_CONFLICT')

    const record = db.prepare('SELECT status, is_deleted FROM inbound_records WHERE id = ?').get(inboundId) as any
    const batch = db.prepare('SELECT quantity, remaining, status FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, batchNo) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any
    const locationStock = db.prepare('SELECT stock FROM inventory_locations WHERE material_id = ? AND location_id = ?')
      .get(fixture.materialId, fixture.locationId) as any
    const logCountAfter = db.prepare('SELECT COUNT(*) as count FROM stock_logs WHERE related_id = ?')
      .get(inboundId) as any

    expect(record).toMatchObject({ status: 'completed', is_deleted: 0 })
    expect(batch).toMatchObject({ quantity: 6, remaining: 6, status: 1 })
    expect(inventory.stock).toBe(6)
    expect(locationStock.stock).toBe(6)
    expect(Number(logCountAfter.count)).toBe(Number(logCountBefore.count))
  })

  it('INB-STATUS-002: 入库更新必须拒绝不存在的状态，避免状态机被污染', async () => {
    const suffix = `invalid-status-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo: `B-INB-${suffix}`,
        quantity: 6,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(inboundRes.status).toBe(201)
    const inboundId = inboundRes.body.data.id

    const updateRes = await request(app)
      .put(`/api/v1/inbound/${inboundId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'archived' })

    expect(updateRes.status).toBe(400)
    expect(updateRes.body.error.message).toContain('状态')

    const record = db.prepare('SELECT status FROM inbound_records WHERE id = ?').get(inboundId) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any
    const statusLogCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'inbound_update'
    `).get(inboundId) as any).count

    expect(record.status).toBe('completed')
    expect(inventory.stock).toBe(6)
    expect(statusLogCount).toBe(0)
  })

  it('INB-RESTORE-001: 恢复已取消入库必须拒绝已停用库位，避免库存回到不可用位置', async () => {
    const suffix = `restore-location-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo: `B-INB-${suffix}`,
        quantity: 6,
        price: 10,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-01-01',
      })
    expect(inboundRes.status).toBe(201)
    const inboundId = inboundRes.body.data.id

    const cancelRes = await request(app)
      .post(`/api/v1/inbound/${inboundId}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: '恢复前取消' })
    expect(cancelRes.status).toBe(200)

    db.prepare('UPDATE locations SET status = 0 WHERE id = ?').run(fixture.locationId)

    const restoreRes = await request(app)
      .put(`/api/v1/inbound/${inboundId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'completed' })

    expect(restoreRes.status).toBe(409)
    expect(restoreRes.body.error.message).toContain('库位')

    const record = db.prepare('SELECT status FROM inbound_records WHERE id = ?').get(inboundId) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any
    const locationStock = db.prepare('SELECT COALESCE(SUM(stock), 0) as stock FROM inventory_locations WHERE material_id = ? AND location_id = ?')
      .get(fixture.materialId, fixture.locationId) as any
    const restoreLogCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE related_id = ? AND type = 'restore'
    `).get(inboundId) as any).count

    expect(record.status).toBe('cancelled')
    expect(inventory.stock).toBe(0)
    expect(locationStock.stock).toBe(0)
    expect(restoreLogCount).toBe(0)
  })

  it('INB-LIST-001: 关键字筛选总数带物料关联，引用数据请求不会被截断到前100条', async () => {
    const suffix = `refs-${Date.now()}`
    const fixture = seedBatchInboundFixture(db, suffix)
    const insert = db.prepare(`
      INSERT INTO inbound_records (
        id, inbound_no, type, material_id, batch_no, quantity, unit, price,
        amount, supplier_id, location_id, operator, status
      ) VALUES (?, ?, 'direct', ?, ?, 1, '瓶', 12, 12, ?, ?, 'admin', 'completed')
    `)

    for (let i = 1; i <= 105; i += 1) {
      const padded = String(i).padStart(3, '0')
      insert.run(
        `inb-refs-${suffix}-${padded}`,
        `IB-REFS-${suffix}-${padded}`,
        fixture.materialId,
        `B-INB-REFS-${suffix}-${padded}`,
        fixture.supplierId,
        fixture.locationId,
      )
    }

    const res = await request(app)
      .get('/api/v1/inbound')
      .query({ keyword: '批量入库物料', page: 1, pageSize: 999 })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBeGreaterThanOrEqual(105)
    expect(res.body.data.pagination.pageSize).toBe(999)
    expect(res.body.data.list.length).toBeGreaterThanOrEqual(105)

    const stats = await request(app)
      .get('/api/v1/inbound/stats')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(stats.status).toBe(200)
    expect(stats.body.data.monthTotal).toBeGreaterThanOrEqual(105)
    expect(stats.body.data.quickCounts.all).toBeGreaterThanOrEqual(105)
    expect(stats.body.data.quickCounts.month).toBe(stats.body.data.monthTotal)
  })
})
