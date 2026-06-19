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

function seedReturnMaterial(db: any, suffix: string) {
  const categoryId = `cat-return-${suffix}`
  const materialId = `mat-return-${suffix}`
  const locationId = `loc-return-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-RT-${suffix}`, '退库测试分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-RT-${suffix}`, '退库测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, price, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-RT-${suffix}`, '退库测试物料', '1ml', '瓶', categoryId, 12, locationId)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, ?, 0, ?)')
    .run(`inv-return-${suffix}`, materialId, 10, locationId)

  return materialId
}

function seedReturnMaterialWithBatch(db: any, suffix: string, stock = 10) {
  const materialId = seedReturnMaterial(db, suffix)
  const batchId = `batch-return-${suffix}`
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, expiry_date, inbound_id, inbound_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(batchId, materialId, `BATCH-RT-${suffix}`, stock, stock, '2028-12-31', `inbound-return-${suffix}`, 13.5)

  return { materialId, batchId, batchNo: `BATCH-RT-${suffix}` }
}

describe('退库管理', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('RT-001: 创建退库时忽略请求体伪造operator，使用登录用户', async () => {
    const materialId = seedReturnMaterial(db, `op-${Date.now()}`)

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        quantity: 1,
        reason: '测试退库',
        operator: 'forged-user',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const record = db.prepare('SELECT operator FROM return_records WHERE id = ?').get(res.body.data.id) as any
    const log = db.prepare('SELECT operator FROM stock_logs WHERE related_id = ? AND related_type = ?').get(res.body.data.id, 'return') as any
    expect(record.operator).toBe('admin')
    expect(log.operator).toBe('admin')

    const listRes = await request(app)
      .get('/api/v1/returns')
      .query({ page: 1, pageSize: 1000 })
      .set('Authorization', `Bearer ${token}`)
    expect(listRes.status).toBe(200)
    const listedRecord = listRes.body.data.list.find((row: any) => row.id === res.body.data.id)
    expect(listedRecord).toMatchObject({
      materialId,
      materialName: '退库测试物料',
      unit: '瓶',
    })
  })

  it('RT-002: 撤销退库时忽略请求体伪造operator，使用登录用户', async () => {
    const materialId = seedReturnMaterial(db, `cancel-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialId, quantity: 1, reason: '测试退库' })
    expect(createRes.status).toBe(200)

    const res = await request(app)
      .delete(`/api/v1/returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ operator: 'forged-user' })

    expect(res.status).toBe(200)
    const log = db.prepare('SELECT operator FROM stock_logs WHERE related_id = ? AND related_type = ?')
      .get(createRes.body.data.id, 'return_cancel') as any
    expect(log.operator).toBe('admin')
  })

  it('RT-003: 退库列表支持按物料和原因关键词筛选', async () => {
    const suffix = `keyword-${Date.now()}`
    const materialId = seedReturnMaterial(db, suffix)
    const createRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialId, quantity: 1, reason: `原因-${suffix}`, remark: '关键词筛选验证' })
    expect(createRes.status).toBe(200)

    const materialKeyword = await request(app)
      .get('/api/v1/returns')
      .query({ page: 1, pageSize: 20, keyword: '退库测试物料' })
      .set('Authorization', `Bearer ${token}`)
    expect(materialKeyword.status).toBe(200)
    expect(materialKeyword.body.data.list.some((row: any) => row.id === createRes.body.data.id)).toBe(true)

    const reasonKeyword = await request(app)
      .get('/api/v1/returns')
      .query({ page: 1, pageSize: 20, keyword: `原因-${suffix}` })
      .set('Authorization', `Bearer ${token}`)
    expect(reasonKeyword.status).toBe(200)
    expect(reasonKeyword.body.data.list).toHaveLength(1)
    expect(reasonKeyword.body.data.list[0].id).toBe(createRes.body.data.id)
  })

  it('RT-004: 创建和撤销退库会同步扣减和恢复批次剩余量', async () => {
    const suffix = `batch-${Date.now()}`
    const { materialId, batchId, batchNo } = seedReturnMaterialWithBatch(db, suffix, 10)

    const createRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialId, batchId, quantity: 3, reason: 'unused' })

    expect(createRes.status).toBe(200)
    const record = db.prepare('SELECT batch_id, unit_cost, total_cost FROM return_records WHERE id = ?')
      .get(createRes.body.data.id) as any
    const inventoryAfterCreate = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batchAfterCreate = db.prepare('SELECT remaining, status FROM batches WHERE id = ?').get(batchId) as any

    expect(record.batch_id).toBe(batchId)
    expect(record.unit_cost).toBe(13.5)
    expect(record.total_cost).toBe(40.5)
    expect(inventoryAfterCreate.stock).toBe(7)
    expect(batchAfterCreate.remaining).toBe(7)
    expect(batchAfterCreate.status).toBe(1)

    const listRes = await request(app)
      .get('/api/v1/returns')
      .query({ page: 1, pageSize: 1000 })
      .set('Authorization', `Bearer ${token}`)
    expect(listRes.status).toBe(200)
    const listedRecord = listRes.body.data.list.find((row: any) => row.id === createRes.body.data.id)
    expect(listedRecord).toMatchObject({ batchId, batchNo, unitCost: 13.5, totalCost: 40.5 })

    const cancelRes = await request(app)
      .delete(`/api/v1/returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(cancelRes.status).toBe(200)

    const inventoryAfterCancel = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batchAfterCancel = db.prepare('SELECT remaining, status FROM batches WHERE id = ?').get(batchId) as any
    expect(inventoryAfterCancel.stock).toBe(10)
    expect(batchAfterCancel.remaining).toBe(10)
    expect(batchAfterCancel.status).toBe(1)
  })

  it('RT-005: 批次数量后续下调后撤销旧退库必须拒绝，避免批次剩余量超过批次数量', async () => {
    const suffix = `batch-stale-cancel-${Date.now()}`
    const { materialId, batchId } = seedReturnMaterialWithBatch(db, suffix, 10)

    const createRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialId, batchId, quantity: 3, reason: 'unused' })

    expect(createRes.status).toBe(200)
    db.prepare('UPDATE batches SET quantity = 7 WHERE id = ?').run(batchId)

    const cancelRes = await request(app)
      .delete(`/api/v1/returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(cancelRes.status).toBe(409)
    expect(cancelRes.body.error.code).toBe('BATCH_RESTORE_CONFLICT')

    const record = db.prepare('SELECT is_deleted FROM return_records WHERE id = ?').get(createRes.body.data.id) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batch = db.prepare('SELECT quantity, remaining FROM batches WHERE id = ?').get(batchId) as any
    const cancelLogs = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'return_cancel'
    `).get(createRes.body.data.id) as any

    expect(record.is_deleted).toBe(0)
    expect(inventory.stock).toBe(7)
    expect(batch.quantity).toBe(7)
    expect(batch.remaining).toBe(7)
    expect(cancelLogs.count).toBe(0)
  })

  it('RT-006: 撤销退库时若库存总账缺失必须拒绝，避免只恢复批次和库位', async () => {
    const suffix = `missing-inventory-cancel-${Date.now()}`
    const { materialId, batchId } = seedReturnMaterialWithBatch(db, suffix, 10)

    const createRes = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialId, batchId, quantity: 3, reason: 'unused' })

    expect(createRes.status).toBe(200)
    db.prepare('DELETE FROM inventory WHERE material_id = ?').run(materialId)

    const cancelRes = await request(app)
      .delete(`/api/v1/returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(cancelRes.status).toBe(404)
    expect(cancelRes.body.error.message).toContain('物料无库存记录')

    const record = db.prepare('SELECT is_deleted FROM return_records WHERE id = ?').get(createRes.body.data.id) as any
    const batch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(batchId) as any
    const cancelLogs = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'return_cancel'
    `).get(createRes.body.data.id) as any

    expect(record.is_deleted).toBe(0)
    expect(batch.remaining).toBe(7)
    expect(cancelLogs.count).toBe(0)
  })

  it('RT-007: 总库存和批次足够但库位库存不足时拒绝退库并回滚全部副作用', async () => {
    const suffix = `location-insufficient-${Date.now()}`
    const { materialId, batchId } = seedReturnMaterialWithBatch(db, suffix, 10)
    const material = db.prepare('SELECT location_id FROM materials WHERE id = ?').get(materialId) as any
    db.prepare(`
      INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock)
      VALUES (?, ?, ?, 1, 0)
    `).run(`invloc-return-${suffix}`, materialId, material.location_id)

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialId, batchId, quantity: 3, reason: '库位库存不足退库' })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('STOCK_INSUFFICIENT')
    expect(res.body.error.message).toContain('库位库存不足')

    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(batchId) as any
    const locationStock = db.prepare(`
      SELECT stock
      FROM inventory_locations
      WHERE material_id = ? AND location_id = ?
    `).get(materialId, material.location_id) as any
    const records = db.prepare('SELECT COUNT(*) as count FROM return_records WHERE material_id = ?')
      .get(materialId) as any
    const logs = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE material_id = ? AND related_type = 'return'
    `).get(materialId) as any

    expect(inventory.stock).toBe(10)
    expect(batch.remaining).toBe(10)
    expect(locationStock.stock).toBe(1)
    expect(records.count).toBe(0)
    expect(logs.count).toBe(0)
  })

  it('RT-REF-001: 创建退库拒绝停用物料且不扣库存', async () => {
    const materialId = seedReturnMaterial(db, `inactive-ref-${Date.now()}`)
    db.prepare('UPDATE materials SET status = 0 WHERE id = ?').run(materialId)

    const res = await request(app)
      .post('/api/v1/returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialId, quantity: 2, reason: '停用物料退库' })

    expect(res.status).toBe(409)
    expect(res.body.error.message).toContain('物料已停用')

    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const records = db.prepare('SELECT COUNT(*) as count FROM return_records WHERE material_id = ?')
      .get(materialId) as any

    expect(inventory.stock).toBe(10)
    expect(records.count).toBe(0)
  })
})
