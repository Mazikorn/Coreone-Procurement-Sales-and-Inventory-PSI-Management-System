process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../src/app.js')
  const { getDatabase } = await import('../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function login(app: any, username: string, password: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password })

  expect(res.status).toBe(200)
  expect(res.body.success).toBe(true)
  return res.body.data.token
}

function seedScrapMaterial(db: any, suffix: string, stock = 10) {
  const categoryId = `cat-scrap-${suffix}`
  const materialId = `mat-scrap-${suffix}`
  const locationId = `loc-scrap-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-SC-${suffix}`, '报废测试分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-SC-${suffix}`, '报废测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, price, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-SC-${suffix}`, '报废测试物料', '1ml', '瓶', categoryId, 12, locationId)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, ?, 0, ?)')
    .run(`inv-scrap-${suffix}`, materialId, stock, locationId)

  return materialId
}

function seedScrapMaterialWithBatch(db: any, suffix: string, stock = 10) {
  const materialId = seedScrapMaterial(db, suffix, stock)
  const batchId = `batch-scrap-${suffix}`
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, expiry_date, inbound_id, inbound_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(batchId, materialId, `BATCH-SC-${suffix}`, stock, stock, '2028-12-31', `inbound-scrap-${suffix}`, 12)

  return { materialId, batchId, batchNo: `BATCH-SC-${suffix}` }
}

describe('报废管理 API', () => {
  let app: any
  let db: any
  let adminToken: string
  let warehouseToken: string
  let technicianToken: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    adminToken = await login(app, 'admin', 'admin123')
    warehouseToken = await login(app, 'wangkq', 'CoreOne2026!')
    technicianToken = await login(app, 'zhangwei', 'CoreOne2026!')
  })

  it('SC-001: admin/warehouse 可查询，技术员和匿名不可查询', async () => {
    const adminRes = await request(app)
      .get('/api/v1/scraps?page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(adminRes.status).toBe(200)
    expect(Array.isArray(adminRes.body.data.list)).toBe(true)

    const warehouseRes = await request(app)
      .get('/api/v1/scraps?page=1&pageSize=10')
      .set('Authorization', `Bearer ${warehouseToken}`)
    expect(warehouseRes.status).toBe(200)

    const forbiddenRes = await request(app)
      .get('/api/v1/scraps?page=1&pageSize=10')
      .set('Authorization', `Bearer ${technicianToken}`)
    expect(forbiddenRes.status).toBe(403)

    const noTokenRes = await request(app).get('/api/v1/scraps?page=1&pageSize=10')
    expect(noTokenRes.status).toBe(401)
  })

  it('SC-002: 创建报废会扣减库存并记录登录用户为操作人', async () => {
    const materialId = seedScrapMaterial(db, `create-${Date.now()}`, 10)

    const res = await request(app)
      .post('/api/v1/scraps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        materialId,
        quantity: 2,
        reason: '测试报废',
        remark: 'Vitest报废测试',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const record = db.prepare('SELECT operator, quantity FROM scrap_records WHERE id = ?').get(res.body.data.id) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const log = db.prepare('SELECT operator, quantity, before_stock, after_stock FROM stock_logs WHERE related_id = ? AND related_type = ?')
      .get(res.body.data.id, 'scrap') as any

    expect(record.operator).toBe('admin')
    expect(record.quantity).toBe(2)
    expect(inventory.stock).toBe(8)
    expect(log.operator).toBe('admin')
    expect(log.quantity).toBe(-2)
    expect(log.before_stock).toBe(10)
    expect(log.after_stock).toBe(8)

    const listRes = await request(app)
      .get('/api/v1/scraps')
      .query({ page: 1, pageSize: 1000 })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(listRes.status).toBe(200)
    const listedRecord = listRes.body.data.list.find((row: any) => row.id === res.body.data.id)
    expect(listedRecord).toMatchObject({
      materialId,
      materialName: '报废测试物料',
      unit: '瓶',
    })
  })

  it('SC-003: 撤销报废会软删除记录、回退库存并写入撤销日志', async () => {
    const materialId = seedScrapMaterial(db, `cancel-${Date.now()}`, 6)
    const createRes = await request(app)
      .post('/api/v1/scraps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ materialId, quantity: 1, reason: '测试撤销报废' })

    expect(createRes.status).toBe(200)

    const cancelRes = await request(app)
      .delete(`/api/v1/scraps/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(cancelRes.status).toBe(200)
    const record = db.prepare('SELECT is_deleted FROM scrap_records WHERE id = ?').get(createRes.body.data.id) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const cancelLog = db.prepare('SELECT operator, quantity, before_stock, after_stock FROM stock_logs WHERE related_id = ? AND related_type = ?')
      .get(createRes.body.data.id, 'scrap_cancel') as any

    expect(record.is_deleted).toBe(1)
    expect(inventory.stock).toBe(6)
    expect(cancelLog.operator).toBe('admin')
    expect(cancelLog.quantity).toBe(1)
    expect(cancelLog.before_stock).toBe(5)
    expect(cancelLog.after_stock).toBe(6)
  })

  it('SC-004: 缺少字段、负数数量、库存不足和不存在资源返回明确错误', async () => {
    const materialId = seedScrapMaterial(db, `invalid-${Date.now()}`, 1)

    const missingMaterialRes = await request(app)
      .post('/api/v1/scraps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ quantity: 1, reason: '缺少物料' })
    expect(missingMaterialRes.status).toBe(400)

    const negativeQtyRes = await request(app)
      .post('/api/v1/scraps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ materialId, quantity: -1, reason: '数量非法' })
    expect(negativeQtyRes.status).toBe(400)

    const notFoundRes = await request(app)
      .post('/api/v1/scraps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ materialId: 'non-existent-id', quantity: 1, reason: '不存在物料' })
    expect(notFoundRes.status).toBe(404)

    const insufficientRes = await request(app)
      .post('/api/v1/scraps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ materialId, quantity: 2, reason: '库存不足' })
    expect(insufficientRes.status).toBe(422)

    const deleteNotFoundRes = await request(app)
      .delete('/api/v1/scraps/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(deleteNotFoundRes.status).toBe(404)
  })

  it('SC-005: 批量报废在一个事务内扣减库存并写入流水', async () => {
    const suffix = `batch-${Date.now()}`
    const materialA = seedScrapMaterial(db, `${suffix}-a`, 10)
    const materialB = seedScrapMaterial(db, `${suffix}-b`, 8)

    const res = await request(app)
      .post('/api/v1/scraps/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        records: [
          { materialId: materialA, quantity: 3, reason: 'expired', remark: '批量报废A' },
          { materialId: materialB, quantity: 2, reason: 'damaged', remark: '批量报废B' },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.createdCount).toBe(2)

    const invA = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialA) as any
    const invB = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialB) as any
    expect(invA.stock).toBe(7)
    expect(invB.stock).toBe(6)

    const logs = db.prepare("SELECT operator, related_type FROM stock_logs WHERE related_type = 'scrap_batch' AND material_id IN (?, ?)")
      .all(materialA, materialB) as any[]
    expect(logs).toHaveLength(2)
    expect(logs.every(log => log.operator === 'admin')).toBe(true)
  })

  it('SC-006: 批量报废校验失败时不写入任何有效行', async () => {
    const suffix = `batch-invalid-${Date.now()}`
    const materialA = seedScrapMaterial(db, `${suffix}-a`, 5)
    const materialB = seedScrapMaterial(db, `${suffix}-b`, 1)

    const res = await request(app)
      .post('/api/v1/scraps/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        records: [
          { materialId: materialA, quantity: 2, reason: 'expired' },
          { materialId: materialB, quantity: 2, reason: 'damaged' },
        ],
      })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)

    const invA = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialA) as any
    const invB = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialB) as any
    const scraps = db.prepare('SELECT COUNT(*) as total FROM scrap_records WHERE material_id IN (?, ?)').get(materialA, materialB) as any

    expect(invA.stock).toBe(5)
    expect(invB.stock).toBe(1)
    expect(scraps.total).toBe(0)
  })

  it('SC-007: 创建和撤销报废会同步扣减和恢复批次剩余量', async () => {
    const suffix = `batch-single-${Date.now()}`
    const { materialId, batchId, batchNo } = seedScrapMaterialWithBatch(db, suffix, 10)

    const res = await request(app)
      .post('/api/v1/scraps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ materialId, batchId, quantity: 4, reason: 'damaged' })

    expect(res.status).toBe(200)
    const record = db.prepare('SELECT batch_id FROM scrap_records WHERE id = ?').get(res.body.data.id) as any
    const inventoryAfterCreate = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batchAfterCreate = db.prepare('SELECT remaining, status FROM batches WHERE id = ?').get(batchId) as any

    expect(record.batch_id).toBe(batchId)
    expect(inventoryAfterCreate.stock).toBe(6)
    expect(batchAfterCreate.remaining).toBe(6)
    expect(batchAfterCreate.status).toBe(1)

    const listRes = await request(app)
      .get('/api/v1/scraps')
      .query({ page: 1, pageSize: 1000 })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(listRes.status).toBe(200)
    const listedRecord = listRes.body.data.list.find((row: any) => row.id === res.body.data.id)
    expect(listedRecord).toMatchObject({ batchId, batchNo })

    const cancelRes = await request(app)
      .delete(`/api/v1/scraps/${res.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(cancelRes.status).toBe(200)

    const inventoryAfterCancel = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batchAfterCancel = db.prepare('SELECT remaining, status FROM batches WHERE id = ?').get(batchId) as any
    expect(inventoryAfterCancel.stock).toBe(10)
    expect(batchAfterCancel.remaining).toBe(10)
    expect(batchAfterCancel.status).toBe(1)
  })

  it('SC-009: 批次数量后续下调后撤销旧报废必须拒绝，避免批次剩余量超过批次数量', async () => {
    const suffix = `batch-stale-cancel-${Date.now()}`
    const { materialId, batchId } = seedScrapMaterialWithBatch(db, suffix, 10)

    const res = await request(app)
      .post('/api/v1/scraps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ materialId, batchId, quantity: 4, reason: 'damaged' })

    expect(res.status).toBe(200)
    db.prepare('UPDATE batches SET quantity = 6 WHERE id = ?').run(batchId)

    const cancelRes = await request(app)
      .delete(`/api/v1/scraps/${res.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(cancelRes.status).toBe(409)
    expect(cancelRes.body.error.code).toBe('BATCH_RESTORE_CONFLICT')

    const record = db.prepare('SELECT is_deleted FROM scrap_records WHERE id = ?').get(res.body.data.id) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batch = db.prepare('SELECT quantity, remaining FROM batches WHERE id = ?').get(batchId) as any
    const cancelLogs = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'scrap_cancel'
    `).get(res.body.data.id) as any

    expect(record.is_deleted).toBe(0)
    expect(inventory.stock).toBe(6)
    expect(batch.quantity).toBe(6)
    expect(batch.remaining).toBe(6)
    expect(cancelLogs.count).toBe(0)
  })

  it('SC-010: 撤销报废时若库存总账缺失必须拒绝，避免只恢复批次和库位', async () => {
    const suffix = `missing-inventory-cancel-${Date.now()}`
    const { materialId, batchId } = seedScrapMaterialWithBatch(db, suffix, 10)

    const res = await request(app)
      .post('/api/v1/scraps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ materialId, batchId, quantity: 4, reason: 'damaged' })

    expect(res.status).toBe(200)
    db.prepare('DELETE FROM inventory WHERE material_id = ?').run(materialId)

    const cancelRes = await request(app)
      .delete(`/api/v1/scraps/${res.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(cancelRes.status).toBe(404)
    expect(cancelRes.body.error.message).toContain('物料无库存记录')

    const record = db.prepare('SELECT is_deleted FROM scrap_records WHERE id = ?').get(res.body.data.id) as any
    const batch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(batchId) as any
    const cancelLogs = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'scrap_cancel'
    `).get(res.body.data.id) as any

    expect(record.is_deleted).toBe(0)
    expect(batch.remaining).toBe(6)
    expect(cancelLogs.count).toBe(0)
  })

  it('SC-008: 批量报废会逐条同步扣减批次剩余量', async () => {
    const suffix = `batch-with-batches-${Date.now()}`
    const materialA = seedScrapMaterialWithBatch(db, `${suffix}-a`, 10)
    const materialB = seedScrapMaterialWithBatch(db, `${suffix}-b`, 8)

    const res = await request(app)
      .post('/api/v1/scraps/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        records: [
          { materialId: materialA.materialId, batchId: materialA.batchId, quantity: 3, reason: 'expired' },
          { materialId: materialB.materialId, batchId: materialB.batchId, quantity: 2, reason: 'damaged' },
        ],
      })

    expect(res.status).toBe(200)
    expect(res.body.data.createdCount).toBe(2)

    const batchA = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(materialA.batchId) as any
    const batchB = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(materialB.batchId) as any
    const records = db.prepare('SELECT batch_id FROM scrap_records WHERE id IN (?, ?) ORDER BY batch_id')
      .all(res.body.data.ids[0], res.body.data.ids[1]) as any[]

    expect(batchA.remaining).toBe(7)
    expect(batchB.remaining).toBe(6)
    expect(records.map(record => record.batch_id).sort()).toEqual([materialA.batchId, materialB.batchId].sort())
  })

  it('SC-011: 单条和批量报废在库位库存不足时返回业务错误并回滚全部副作用', async () => {
    const singleSuffix = `location-insufficient-single-${Date.now()}`
    const single = seedScrapMaterialWithBatch(db, singleSuffix, 10)
    const singleMaterial = db.prepare('SELECT location_id FROM materials WHERE id = ?').get(single.materialId) as any
    db.prepare(`
      INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock)
      VALUES (?, ?, ?, 1, 0)
    `).run(`invloc-scrap-single-${singleSuffix}`, single.materialId, singleMaterial.location_id)

    const singleRes = await request(app)
      .post('/api/v1/scraps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ materialId: single.materialId, batchId: single.batchId, quantity: 3, reason: '库位库存不足报废' })

    expect(singleRes.status).toBe(422)
    expect(singleRes.body.error.code).toBe('STOCK_INSUFFICIENT')
    expect(singleRes.body.error.message).toContain('库位库存不足')

    const singleInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(single.materialId) as any
    const singleBatch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(single.batchId) as any
    const singleLocation = db.prepare(`
      SELECT stock
      FROM inventory_locations
      WHERE material_id = ? AND location_id = ?
    `).get(single.materialId, singleMaterial.location_id) as any
    const singleRecords = db.prepare('SELECT COUNT(*) as count FROM scrap_records WHERE material_id = ?')
      .get(single.materialId) as any
    const singleLogs = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE material_id = ? AND related_type = 'scrap'
    `).get(single.materialId) as any

    expect(singleInventory.stock).toBe(10)
    expect(singleBatch.remaining).toBe(10)
    expect(singleLocation.stock).toBe(1)
    expect(singleRecords.count).toBe(0)
    expect(singleLogs.count).toBe(0)

    const batchSuffix = `location-insufficient-batch-${Date.now()}`
    const batch = seedScrapMaterialWithBatch(db, batchSuffix, 8)
    const batchMaterial = db.prepare('SELECT location_id FROM materials WHERE id = ?').get(batch.materialId) as any
    db.prepare(`
      INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock)
      VALUES (?, ?, ?, 1, 0)
    `).run(`invloc-scrap-batch-${batchSuffix}`, batch.materialId, batchMaterial.location_id)

    const batchRes = await request(app)
      .post('/api/v1/scraps/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        records: [
          { materialId: batch.materialId, batchId: batch.batchId, quantity: 3, reason: '库位库存不足批量报废' },
        ],
      })

    expect(batchRes.status).toBe(422)
    expect(batchRes.body.error.code).toBe('STOCK_INSUFFICIENT')
    expect(batchRes.body.error.message).toContain('库位库存不足')

    const batchInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(batch.materialId) as any
    const batchRecord = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(batch.batchId) as any
    const batchLocation = db.prepare(`
      SELECT stock
      FROM inventory_locations
      WHERE material_id = ? AND location_id = ?
    `).get(batch.materialId, batchMaterial.location_id) as any
    const batchRecords = db.prepare('SELECT COUNT(*) as count FROM scrap_records WHERE material_id = ?')
      .get(batch.materialId) as any
    const batchLogs = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE material_id = ? AND related_type = 'scrap_batch'
    `).get(batch.materialId) as any

    expect(batchInventory.stock).toBe(8)
    expect(batchRecord.remaining).toBe(8)
    expect(batchLocation.stock).toBe(1)
    expect(batchRecords.count).toBe(0)
    expect(batchLogs.count).toBe(0)
  })

  it('SC-REF-001: 单条和批量报废拒绝停用物料且不扣库存', async () => {
    const singleMaterialId = seedScrapMaterial(db, `inactive-single-${Date.now()}`, 10)
    const batchMaterialId = seedScrapMaterial(db, `inactive-batch-${Date.now()}`, 8)
    db.prepare('UPDATE materials SET status = 0 WHERE id IN (?, ?)').run(singleMaterialId, batchMaterialId)

    const singleRes = await request(app)
      .post('/api/v1/scraps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ materialId: singleMaterialId, quantity: 2, reason: '停用物料报废' })

    expect(singleRes.status).toBe(409)
    expect(singleRes.body.error.message).toContain('物料已停用')

    const batchRes = await request(app)
      .post('/api/v1/scraps/batch')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        records: [
          { materialId: batchMaterialId, quantity: 2, reason: '停用物料批量报废' },
        ],
      })

    expect(batchRes.status).toBe(409)
    expect(batchRes.body.error.message).toContain('物料已停用')

    const singleInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(singleMaterialId) as any
    const batchInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(batchMaterialId) as any
    const scraps = db.prepare('SELECT COUNT(*) as count FROM scrap_records WHERE material_id IN (?, ?)')
      .get(singleMaterialId, batchMaterialId) as any

    expect(singleInventory.stock).toBe(10)
    expect(batchInventory.stock).toBe(8)
    expect(scraps.count).toBe(0)
  })
})
