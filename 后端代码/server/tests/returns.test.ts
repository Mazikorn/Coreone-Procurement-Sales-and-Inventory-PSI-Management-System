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

function seedReturnSource(db: any, suffix: string, options: { outboundQty?: number; currentStock?: number; materialStatus?: number } = {}) {
  const outboundQty = options.outboundQty ?? 3
  const currentStock = options.currentStock ?? 7
  const originalQty = currentStock + outboundQty
  const categoryId = `cat-return-${suffix}`
  const materialId = `mat-return-${suffix}`
  const locationId = `loc-return-${suffix}`
  const batchId = `batch-return-${suffix}`
  const outboundId = `out-return-${suffix}`
  const outboundItemId = `out-item-return-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-RT-${suffix}`, '退库测试分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-RT-${suffix}`, '退库测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, price, location_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-RT-${suffix}`, '退库测试物料', '1ml', '瓶', categoryId, 12, locationId, options.materialStatus ?? 1)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, ?, 0, ?)')
    .run(`inv-return-${suffix}`, materialId, currentStock, locationId)
  db.prepare(`
    INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock)
    VALUES (?, ?, ?, ?, 0)
  `).run(`invloc-return-${suffix}`, materialId, locationId, currentStock)
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, expiry_date, inbound_id, inbound_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(batchId, materialId, `BATCH-RT-${suffix}`, originalQty, currentStock, '2028-12-31', `inbound-return-${suffix}`, 13.5)
  db.prepare(`
    INSERT INTO batch_location_balances (id, batch_id, material_id, location_id, remaining)
    VALUES (?, ?, ?, ?, ?)
  `).run(`blb-return-${suffix}`, batchId, materialId, locationId, currentStock)
  db.prepare(`
    INSERT INTO outbound_records (id, outbound_no, type, total_cost, operator, status, is_deleted)
    VALUES (?, ?, 'project', ?, 'admin', 'completed', 0)
  `).run(outboundId, `OB-RT-${suffix}`, outboundQty * 13.5)
  db.prepare(`
    INSERT INTO outbound_items (id, outbound_id, material_id, batch_id, batch_no, quantity, unit, unit_cost, total_cost)
    VALUES (?, ?, ?, ?, ?, ?, '瓶', 13.5, ?)
  `).run(outboundItemId, outboundId, materialId, batchId, `BATCH-RT-${suffix}`, outboundQty, outboundQty * 13.5)

  return { materialId, batchId, batchNo: `BATCH-RT-${suffix}`, locationId, outboundId, outboundItemId, outboundNo: `OB-RT-${suffix}` }
}

describe('退库管理', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('RT-001: 创建退库必须绑定真实出库明细，并恢复库存、批次和库位', async () => {
    const source = seedReturnSource(db, `create-${Date.now()}`)

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        outboundItemId: source.outboundItemId,
        quantity: 2,
        reason: 'unused',
        operator: 'forged-user',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const record = db.prepare('SELECT outbound_item_id, material_id, batch_id, quantity, unit_cost, total_cost, operator FROM return_records WHERE id = ?')
      .get(res.body.data.id) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(source.materialId) as any
    const locationStock = db.prepare('SELECT stock FROM inventory_locations WHERE material_id = ? AND location_id = ?')
      .get(source.materialId, source.locationId) as any
    const batch = db.prepare('SELECT remaining, status FROM batches WHERE id = ?').get(source.batchId) as any
    const batchLocation = db.prepare(`
      SELECT remaining FROM batch_location_balances
      WHERE batch_id = ? AND material_id = ? AND location_id = ?
    `).get(source.batchId, source.materialId, source.locationId) as any
    const log = db.prepare('SELECT quantity, before_stock, after_stock, operator FROM stock_logs WHERE related_id = ? AND related_type = ?')
      .get(res.body.data.id, 'return') as any

    expect(record).toMatchObject({
      outbound_item_id: source.outboundItemId,
      material_id: source.materialId,
      batch_id: source.batchId,
      quantity: 2,
      unit_cost: 13.5,
      total_cost: 27,
      operator: 'admin',
    })
    expect(inventory.stock).toBe(9)
    expect(locationStock.stock).toBe(9)
    expect(batch.remaining).toBe(9)
    expect(batch.status).toBe(1)
    expect(Number(batchLocation.remaining)).toBe(9)
    expect(log).toMatchObject({ quantity: 2, before_stock: 7, after_stock: 9, operator: 'admin' })
  })

  it('RT-002: 退库不能无来源或超过原出库可退数量', async () => {
    const source = seedReturnSource(db, `limit-${Date.now()}`, { outboundQty: 3, currentStock: 7 })

    const missingSource = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 1, reason: 'unused' })
    expect(missingSource.status).toBe(400)
    expect(missingSource.body.error.message).toContain('outboundItemId')

    const firstReturn = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ outboundItemId: source.outboundItemId, quantity: 2, reason: 'unused' })
    expect(firstReturn.status).toBe(200)

    const overReturn = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ outboundItemId: source.outboundItemId, quantity: 2, reason: 'unused' })
    expect(overReturn.status).toBe(422)
    expect(overReturn.body.error.code).toBe('RETURN_QUANTITY_EXCEEDED')

    const finalReturn = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ outboundItemId: source.outboundItemId, quantity: 1, reason: 'unused' })
    expect(finalReturn.status).toBe(200)
  })

  it('RT-003: 撤销退库会反向扣回库存、批次和库位，并使用登录用户写审计', async () => {
    const source = seedReturnSource(db, `cancel-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ outboundItemId: source.outboundItemId, quantity: 2, reason: 'unused' })
    expect(createRes.status).toBe(200)

    const cancelRes = await request(app)
      .delete(`/api/v1/returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ operator: 'forged-user' })
    expect(cancelRes.status).toBe(200)

    const record = db.prepare('SELECT is_deleted FROM return_records WHERE id = ?').get(createRes.body.data.id) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(source.materialId) as any
    const locationStock = db.prepare('SELECT stock FROM inventory_locations WHERE material_id = ? AND location_id = ?')
      .get(source.materialId, source.locationId) as any
    const batch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(source.batchId) as any
    const batchLocation = db.prepare(`
      SELECT remaining FROM batch_location_balances
      WHERE batch_id = ? AND material_id = ? AND location_id = ?
    `).get(source.batchId, source.materialId, source.locationId) as any
    const log = db.prepare('SELECT quantity, before_stock, after_stock, operator FROM stock_logs WHERE related_id = ? AND related_type = ?')
      .get(createRes.body.data.id, 'return_cancel') as any

    expect(record.is_deleted).toBe(1)
    expect(inventory.stock).toBe(7)
    expect(locationStock.stock).toBe(7)
    expect(batch.remaining).toBe(7)
    expect(Number(batchLocation.remaining)).toBe(7)
    expect(log).toMatchObject({ quantity: -2, before_stock: 9, after_stock: 7, operator: 'admin' })
  })

  it('RT-004: 撤销退库时若返回库存已被消耗必须拒绝，避免库存或批次为负', async () => {
    const source = seedReturnSource(db, `cancel-conflict-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ outboundItemId: source.outboundItemId, quantity: 2, reason: 'unused' })
    expect(createRes.status).toBe(200)

    db.prepare('UPDATE inventory SET stock = 1 WHERE material_id = ?').run(source.materialId)

    const cancelRes = await request(app)
      .delete(`/api/v1/returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(cancelRes.status).toBe(409)
    expect(cancelRes.body.error.code).toBe('RETURN_CANCEL_CONFLICT')
    expect((db.prepare('SELECT is_deleted FROM return_records WHERE id = ?').get(createRes.body.data.id) as any).is_deleted).toBe(0)
  })

  it('RT-004B: 撤销退库时若库位库存不足必须拒绝并回滚', async () => {
    const source = seedReturnSource(db, `cancel-location-conflict-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ outboundItemId: source.outboundItemId, quantity: 2, reason: 'unused' })
    expect(createRes.status).toBe(200)

    db.prepare('UPDATE inventory_locations SET stock = 1 WHERE material_id = ?').run(source.materialId)

    const cancelRes = await request(app)
      .delete(`/api/v1/returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(cancelRes.status).toBe(409)
    expect(cancelRes.body.error.code).toBe('RETURN_CANCEL_CONFLICT')
    expect((db.prepare('SELECT is_deleted FROM return_records WHERE id = ?').get(createRes.body.data.id) as any).is_deleted).toBe(0)
    expect((db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(source.materialId) as any).stock).toBe(9)
  })

  it('RT-005: 退库来源列表和退库列表返回可回看的出库关系', async () => {
    const source = seedReturnSource(db, `list-${Date.now()}`)
    const sourcesRes = await request(app)
      .get('/api/v1/returns/sources')
      .query({ keyword: source.outboundNo })
      .set('Authorization', `Bearer ${token}`)

    expect(sourcesRes.status).toBe(200)
    expect(sourcesRes.body.data.list[0]).toMatchObject({
      outboundItemId: source.outboundItemId,
      outboundNo: source.outboundNo,
      materialId: source.materialId,
      batchId: source.batchId,
      returnableQuantity: 3,
      unitCost: 13.5,
    })

    const createRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ outboundItemId: source.outboundItemId, quantity: 1, reason: `原因-${source.outboundNo}` })
    expect(createRes.status).toBe(200)

    const listRes = await request(app)
      .get('/api/v1/returns')
      .query({ keyword: source.outboundNo })
      .set('Authorization', `Bearer ${token}`)
    expect(listRes.status).toBe(200)
    expect(listRes.body.data.list[0]).toMatchObject({
      id: createRes.body.data.id,
      outboundItemId: source.outboundItemId,
      outboundNo: source.outboundNo,
      batchNo: source.batchNo,
      unitCost: 13.5,
      totalCost: 13.5,
    })
  })

  it('RT-REF-001: 创建退库拒绝停用物料且不改库存', async () => {
    const source = seedReturnSource(db, `inactive-ref-${Date.now()}`, { materialStatus: 0 })

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ outboundItemId: source.outboundItemId, quantity: 2, reason: '停用物料退库' })

    expect(res.status).toBe(409)
    expect(res.body.error.message).toContain('物料已停用')
    expect((db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(source.materialId) as any).stock).toBe(7)
    expect((db.prepare('SELECT COUNT(*) as count FROM return_records WHERE material_id = ?').get(source.materialId) as any).count).toBe(0)
  })

  it('RT-AUDIT-001: 创建和撤销退库必须写入操作日志，便于仓管交接回看', async () => {
    const source = seedReturnSource(db, `audit-${Date.now()}`)

    const createRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ outboundItemId: source.outboundItemId, quantity: 2, reason: 'unused' })
    expect(createRes.status).toBe(200)

    const createLog = db.prepare(`
      SELECT operation, username, request_data, response_data
      FROM operation_logs
      WHERE operation = 'POST /returns' AND description LIKE ?
      ORDER BY created_at DESC LIMIT 1
    `).get(`%${createRes.body.data.id}%`) as any
    expect(createLog?.username).toBe('admin')
    expect(JSON.parse(createLog.request_data)).toMatchObject({ outboundItemId: source.outboundItemId, quantity: 2 })
    expect(JSON.parse(createLog.response_data)).toMatchObject({ id: createRes.body.data.id })

    const deleteRes = await request(app)
      .delete(`/api/v1/returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleteRes.status).toBe(200)

    const deleteLog = db.prepare(`
      SELECT operation, username, response_data
      FROM operation_logs
      WHERE operation = 'DELETE /returns/:id' AND description LIKE ?
      ORDER BY created_at DESC LIMIT 1
    `).get(`%${createRes.body.data.id}%`) as any
    expect(deleteLog?.username).toBe('admin')
    expect(JSON.parse(deleteLog.response_data)).toMatchObject({ id: createRes.body.data.id, status: 'cancelled' })
  })

  it('RT-ALERT-001: 退库恢复安全库存后自动关闭低库存预警，撤销退库后重新触发', async () => {
    const source = seedReturnSource(db, `alert-${Date.now()}`, { outboundQty: 3, currentStock: 7 })
    db.prepare('UPDATE materials SET safety_stock = 8 WHERE id = ?').run(source.materialId)
    db.prepare(`
      INSERT INTO alerts (id, type, level, material_id, material_name, current_stock, threshold, message, status)
      VALUES (?, 'low-stock', 'warning', ?, '退库预警物料', 7, 8, '库存不足', 'pending')
    `).run(`alert-return-${Date.now()}`, source.materialId)

    const createRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ outboundItemId: source.outboundItemId, quantity: 2, reason: 'unused' })
    expect(createRes.status).toBe(200)

    const afterReturnPending = db.prepare(`
      SELECT COUNT(*) as count
      FROM alerts
      WHERE material_id = ? AND type = 'low-stock' AND status = 'pending'
    `).get(source.materialId) as any
    const autoResolved = db.prepare(`
      SELECT COUNT(*) as count
      FROM alerts
      WHERE material_id = ? AND type = 'low-stock' AND status = 'auto_resolved'
    `).get(source.materialId) as any
    expect(Number(afterReturnPending.count)).toBe(0)
    expect(Number(autoResolved.count)).toBeGreaterThanOrEqual(1)

    const deleteRes = await request(app)
      .delete(`/api/v1/returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleteRes.status).toBe(200)

    const afterCancelPending = db.prepare(`
      SELECT COUNT(*) as count
      FROM alerts
      WHERE material_id = ? AND type = 'low-stock' AND status = 'pending'
    `).get(source.materialId) as any
    expect(Number(afterCancelPending.count)).toBe(1)
  })
})
