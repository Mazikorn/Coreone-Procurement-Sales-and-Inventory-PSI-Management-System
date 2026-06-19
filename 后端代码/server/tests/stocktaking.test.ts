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

function seedStocktakingFixture(db: any, suffix: string, stock = 10) {
  const categoryId = `cat-stocktaking-${suffix}`
  const locationId = `loc-stocktaking-${suffix}`
  const materialId = `mat-stocktaking-${suffix}`
  const recordId = `st-record-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-ST-${suffix}`, '盘点测试分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-ST-${suffix}`, '盘点测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, price, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-ST-${suffix}`, '盘点测试物料', '1ml', '瓶', categoryId, 20, locationId)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, ?, 0, ?)')
    .run(`inv-stocktaking-${suffix}`, materialId, stock, locationId)
  db.prepare(`
    INSERT INTO stocktaking_records (
      id, stocktaking_no, material_id, system_stock, actual_stock, difference, operator, status, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(recordId, `ST-TEST-${suffix}`, materialId, stock, stock - 2, -2, 'warehouse-local', 'completed', '测试盘点')

  return { materialId, recordId }
}

function getLocationStock(db: any, materialId: string): number {
  const row = db.prepare(`
    SELECT COALESCE(SUM(stock), 0) as stock
    FROM inventory_locations
    WHERE material_id = ?
  `).get(materialId) as any
  return Number(row?.stock || 0)
}

function seedStocktakingFixtureWithBatch(db: any, suffix: string, stock = 10) {
  const fixture = seedStocktakingFixture(db, suffix, stock)
  const batchId = `batch-stocktaking-${suffix}`
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, expiry_date, inbound_id, inbound_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(batchId, fixture.materialId, `BATCH-ST-${suffix}`, stock, stock, '2028-12-31', `inbound-stocktaking-${suffix}`, 20)

  return { ...fixture, batchId }
}

function seedMaterialWithoutInventory(db: any, suffix: string) {
  const categoryId = `cat-stocktaking-no-inv-${suffix}`
  const locationId = `loc-stocktaking-no-inv-${suffix}`
  const materialId = `mat-stocktaking-no-inv-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-ST-NOINV-${suffix}`, '无库存盘点分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-ST-NOINV-${suffix}`, '无库存盘点库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, price, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-ST-NOINV-${suffix}`, '无库存盘点物料', '1ml', '瓶', categoryId, 20, locationId)

  return { materialId }
}

describe('库存盘点 API', () => {
  let app: any
  let db: any
  let adminToken: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    adminToken = await loginAdmin(app)
  })

  it('ST-001: 盘点列表返回真实物料信息并支持状态/关键词筛选', async () => {
    const suffix = `list-${Date.now()}`
    const { recordId } = seedStocktakingFixture(db, suffix, 12)

    const res = await request(app)
      .get(`/api/v1/stocktaking?page=1&pageSize=10&keyword=MAT-ST-${suffix}&status=completed`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const item = res.body.data.list.find((row: any) => row.id === recordId)
    expect(item).toBeDefined()
    expect(item.materialName).toBe('盘点测试物料')
    expect(item.materialCode).toBe(`MAT-ST-${suffix}`)
    expect(item.materialUnit).toBe('瓶')
    expect(item.locationName).toBe('盘点测试库位')
  })

  it('ST-002: 确认盘点差异会更新库存，并以登录用户写入库存日志', async () => {
    const suffix = `confirm-${Date.now()}`
    const { materialId, recordId } = seedStocktakingFixture(db, suffix, 10)

    const res = await request(app)
      .post(`/api/v1/stocktaking/${recordId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'physical',
        remark: '月末复核',
        operator: 'forged-user',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const record = db.prepare('SELECT status FROM stocktaking_records WHERE id = ?').get(recordId) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const log = db.prepare(`
      SELECT operator, quantity, before_stock, after_stock, remark
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'stocktaking'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(recordId) as any

    expect(record.status).toBe('confirmed')
    expect(inventory.stock).toBe(8)
    expect(log.operator).toBe('admin')
    expect(log.quantity).toBe(-2)
    expect(log.before_stock).toBe(10)
    expect(log.after_stock).toBe(8)
    expect(log.remark).toContain('physical')
    expect(log.remark).toContain('月末复核')

    const secondConfirm = await request(app)
      .post(`/api/v1/stocktaking/${recordId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'physical' })
    expect(secondConfirm.status).toBe(400)
  })

  it('ST-003: 盘点统计接口按筛选条件返回全量口径', async () => {
    const stamp = Date.now()
    const diff = seedStocktakingFixture(db, `stats-diff-${stamp}`, 10)
    const matched = seedStocktakingFixture(db, `stats-match-${stamp}`, 20)
    const confirmed = seedStocktakingFixture(db, `stats-confirmed-${stamp}`, 30)

    db.prepare(`
      UPDATE stocktaking_records
      SET actual_stock = system_stock, difference = 0
      WHERE id = ?
    `).run(matched.recordId)
    db.prepare('UPDATE stocktaking_records SET status = ? WHERE id = ?')
      .run('confirmed', confirmed.recordId)

    const listRes = await request(app)
      .get('/api/v1/stocktaking')
      .query({ keyword: String(stamp), page: 1, pageSize: 1 })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.total).toBe(3)
    expect(listRes.body.data.list).toHaveLength(1)

    const statsRes = await request(app)
      .get('/api/v1/stocktaking/stats')
      .query({ keyword: String(stamp) })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(statsRes.status).toBe(200)
    expect(statsRes.body.data).toMatchObject({
      total: 3,
      completed: 2,
      confirmed: 1,
      diffCount: 1,
      accuracy: 33.3,
    })

    const completedStats = await request(app)
      .get('/api/v1/stocktaking/stats')
      .query({ keyword: String(stamp), status: 'completed' })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(completedStats.status).toBe(200)
    expect(completedStats.body.data).toMatchObject({
      total: 2,
      completed: 2,
      confirmed: 0,
      diffCount: 1,
      accuracy: 50,
    })
    expect(diff.materialId).toBeTruthy()
  })

  it('ST-012: 盘点列表和统计必须拒绝非法状态筛选，避免伪装成空结果', async () => {
    const listRes = await request(app)
      .get('/api/v1/stocktaking?status=archived')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(listRes.status).toBe(400)
    expect(listRes.body.success).toBe(false)
    expect(listRes.body.error.code).toBe('INVALID_PARAMETER')

    const statsRes = await request(app)
      .get('/api/v1/stocktaking/stats?status=archived')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(statsRes.status).toBe(400)
    expect(statsRes.body.success).toBe(false)
    expect(statsRes.body.error.code).toBe('INVALID_PARAMETER')
  })

  it('ST-013: 盘点列表必须拒绝非法分页参数', async () => {
    const invalidPage = await request(app)
      .get('/api/v1/stocktaking')
      .query({ page: 'abc' })
      .set('Authorization', `Bearer ${adminToken}`)

    const zeroPage = await request(app)
      .get('/api/v1/stocktaking')
      .query({ page: '0' })
      .set('Authorization', `Bearer ${adminToken}`)

    const invalidPageSize = await request(app)
      .get('/api/v1/stocktaking')
      .query({ pageSize: 'abc' })
      .set('Authorization', `Bearer ${adminToken}`)

    const oversizedPageSize = await request(app)
      .get('/api/v1/stocktaking')
      .query({ pageSize: '101' })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(invalidPage.status).toBe(400)
    expect(invalidPage.body.error.code).toBe('INVALID_PARAMETER')
    expect(zeroPage.status).toBe(400)
    expect(zeroPage.body.error.code).toBe('INVALID_PARAMETER')
    expect(invalidPageSize.status).toBe(400)
    expect(invalidPageSize.body.error.code).toBe('INVALID_PARAMETER')
    expect(oversizedPageSize.status).toBe(400)
    expect(oversizedPageSize.body.error.code).toBe('INVALID_PARAMETER')
  })

  it('ST-004: 创建盘点不立即调整库存，确认后才写库存和流水', async () => {
    const suffix = `create-confirm-${Date.now()}`
    const { materialId } = seedStocktakingFixture(db, suffix, 10)

    const createRes = await request(app)
      .post('/api/v1/stocktaking')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        materialId,
        actualStock: 7,
        remark: '创建后待确认',
      })

    expect(createRes.status).toBe(200)
    const recordId = createRes.body.data.id
    const beforeConfirmInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const beforeConfirmLog = db.prepare("SELECT COUNT(*) as total FROM stock_logs WHERE related_id = ? AND related_type = 'stocktaking'")
      .get(recordId) as any

    expect(beforeConfirmInventory.stock).toBe(10)
    expect(beforeConfirmLog.total).toBe(0)

    const confirmRes = await request(app)
      .post(`/api/v1/stocktaking/${recordId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'physical', remark: '复核后确认' })

    expect(confirmRes.status).toBe(200)

    const afterConfirmInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const log = db.prepare(`
      SELECT quantity, before_stock, after_stock, remark
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'stocktaking'
    `).get(recordId) as any

    expect(afterConfirmInventory.stock).toBe(7)
    expect(log.quantity).toBe(-3)
    expect(log.before_stock).toBe(10)
    expect(log.after_stock).toBe(7)
    expect(log.remark).toContain('physical')
  })

  it('ST-VALIDATION-001: 创建盘点拒绝非有限实际库存且不写盘点记录', async () => {
    const suffix = `finite-number-${Date.now()}`
    const { materialId } = seedStocktakingFixture(db, suffix, 10)

    const beforeInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const beforeCount = (db.prepare('SELECT COUNT(*) as count FROM stocktaking_records WHERE material_id = ?')
      .get(materialId) as any).count

    const res = await request(app)
      .post('/api/v1/stocktaking')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        materialId,
        actualStock: 'Infinity',
        remark: '非有限盘点库存',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('actual stock')

    const afterInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const afterCount = (db.prepare('SELECT COUNT(*) as count FROM stocktaking_records WHERE material_id = ?')
      .get(materialId) as any).count
    expect(afterInventory.stock).toBe(beforeInventory.stock)
    expect(afterCount).toBe(beforeCount)
  })

  it('ST-005: 确认盘点前库存已变化时拒绝覆盖新库存', async () => {
    const suffix = `stale-${Date.now()}`
    const { materialId } = seedStocktakingFixture(db, suffix, 10)

    const createRes = await request(app)
      .post('/api/v1/stocktaking')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ materialId, actualStock: 8, remark: '库存变动冲突' })

    expect(createRes.status).toBe(200)
    const recordId = createRes.body.data.id
    db.prepare('UPDATE inventory SET stock = 9 WHERE material_id = ?').run(materialId)

    const confirmRes = await request(app)
      .post(`/api/v1/stocktaking/${recordId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'physical' })

    expect(confirmRes.status).toBe(409)
    expect(confirmRes.body.error.message).toContain('当前库存已变化')

    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const record = db.prepare('SELECT status FROM stocktaking_records WHERE id = ?').get(recordId) as any
    expect(inventory.stock).toBe(9)
    expect(record.status).toBe('completed')
  })

  it('ST-006: 盘亏确认会同步扣减批次，撤销后恢复批次剩余量', async () => {
    const suffix = `batch-loss-${Date.now()}`
    const { materialId, recordId, batchId } = seedStocktakingFixtureWithBatch(db, suffix, 10)

    const confirmRes = await request(app)
      .post(`/api/v1/stocktaking/${recordId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'physical', remark: '盘亏复核' })

    expect(confirmRes.status).toBe(200)
    const inventoryAfterConfirm = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batchAfterConfirm = db.prepare('SELECT remaining, status FROM batches WHERE id = ?').get(batchId) as any
    const adjustment = db.prepare('SELECT quantity_delta FROM stocktaking_batch_adjustments WHERE stocktaking_id = ? AND batch_id = ?')
      .get(recordId, batchId) as any
    expect(inventoryAfterConfirm.stock).toBe(8)
    expect(batchAfterConfirm.remaining).toBe(8)
    expect(batchAfterConfirm.status).toBe(1)
    expect(adjustment.quantity_delta).toBe(-2)

    const deleteRes = await request(app)
      .delete(`/api/v1/stocktaking/${recordId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(deleteRes.status).toBe(200)

    const inventoryAfterDelete = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batchAfterDelete = db.prepare('SELECT remaining, status FROM batches WHERE id = ?').get(batchId) as any
    expect(inventoryAfterDelete.stock).toBe(10)
    expect(batchAfterDelete.remaining).toBe(10)
    expect(batchAfterDelete.status).toBe(1)
  })

  it('ST-007: 盘盈确认会生成盘点调整批次，撤销后回滚该批次', async () => {
    const suffix = `batch-surplus-${Date.now()}`
    const { materialId } = seedStocktakingFixtureWithBatch(db, suffix, 10)

    const createRes = await request(app)
      .post('/api/v1/stocktaking')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ materialId, actualStock: 12, remark: '盘盈复核' })
    expect(createRes.status).toBe(200)
    const recordId = createRes.body.data.id

    const confirmRes = await request(app)
      .post(`/api/v1/stocktaking/${recordId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'physical', remark: '盘盈确认' })
    expect(confirmRes.status).toBe(200)

    const inventoryAfterConfirm = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const adjustment = db.prepare('SELECT batch_id, quantity_delta FROM stocktaking_batch_adjustments WHERE stocktaking_id = ?')
      .get(recordId) as any
    const adjustmentBatch = db.prepare('SELECT batch_no, quantity, remaining, status FROM batches WHERE id = ?')
      .get(adjustment.batch_id) as any
    expect(inventoryAfterConfirm.stock).toBe(12)
    expect(adjustment.quantity_delta).toBe(2)
    expect(adjustmentBatch.batch_no).toMatch(/^STK-ST-/)
    expect(adjustmentBatch.quantity).toBe(2)
    expect(adjustmentBatch.remaining).toBe(2)
    expect(adjustmentBatch.status).toBe(1)

    const deleteRes = await request(app)
      .delete(`/api/v1/stocktaking/${recordId}`)
      .set('Authorization', `Bearer ${adminToken}`)
    expect(deleteRes.status).toBe(200)

    const inventoryAfterDelete = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const adjustmentBatchAfterDelete = db.prepare('SELECT quantity, remaining, status FROM batches WHERE id = ?')
      .get(adjustment.batch_id) as any
    expect(inventoryAfterDelete.stock).toBe(10)
    expect(adjustmentBatchAfterDelete.quantity).toBe(0)
    expect(adjustmentBatchAfterDelete.remaining).toBe(0)
    expect(adjustmentBatchAfterDelete.status).toBe(0)
  })

  it('ST-008: 盘点确认后库存再次变化时禁止撤销旧盘点覆盖新库存', async () => {
    const suffix = `delete-stale-${Date.now()}`
    const { materialId, recordId, batchId } = seedStocktakingFixtureWithBatch(db, suffix, 10)

    const confirmRes = await request(app)
      .post(`/api/v1/stocktaking/${recordId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'physical', remark: '盘亏确认后再出库' })
    expect(confirmRes.status).toBe(200)

    db.prepare('UPDATE inventory SET stock = stock - 1 WHERE material_id = ?').run(materialId)
    db.prepare('UPDATE batches SET remaining = remaining - 1 WHERE id = ?').run(batchId)

    const deleteRes = await request(app)
      .delete(`/api/v1/stocktaking/${recordId}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(deleteRes.status).toBe(409)
    expect(deleteRes.body.error.message).toContain('当前库存已变化')

    const record = db.prepare('SELECT is_deleted, status FROM stocktaking_records WHERE id = ?').get(recordId) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(batchId) as any

    expect(record).toMatchObject({ is_deleted: 0, status: 'confirmed' })
    expect(inventory.stock).toBe(7)
    expect(batch.remaining).toBe(7)
  })

  it('ST-009: 盘点确认必须保持库存总账和库位明细一致', async () => {
    const lossSuffix = `location-loss-${Date.now()}`
    const lossFixture = seedStocktakingFixtureWithBatch(db, lossSuffix, 10)

    const lossConfirmRes = await request(app)
      .post(`/api/v1/stocktaking/${lossFixture.recordId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'physical', remark: '盘亏库位明细一致性' })

    expect(lossConfirmRes.status).toBe(200)
    const lossInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?')
      .get(lossFixture.materialId) as any
    expect(lossInventory.stock).toBe(8)
    expect(getLocationStock(db, lossFixture.materialId)).toBe(8)

    const surplusSuffix = `location-surplus-${Date.now()}`
    const surplusFixture = seedStocktakingFixtureWithBatch(db, surplusSuffix, 10)

    const surplusCreateRes = await request(app)
      .post('/api/v1/stocktaking')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        materialId: surplusFixture.materialId,
        actualStock: 12,
        remark: '盘盈库位明细一致性',
      })
    expect(surplusCreateRes.status).toBe(200)

    const surplusConfirmRes = await request(app)
      .post(`/api/v1/stocktaking/${surplusCreateRes.body.data.id}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'physical', remark: '盘盈确认' })

    expect(surplusConfirmRes.status).toBe(200)
    const surplusInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?')
      .get(surplusFixture.materialId) as any
    expect(surplusInventory.stock).toBe(12)
    expect(getLocationStock(db, surplusFixture.materialId)).toBe(12)
  })

  it('ST-011: 盘亏确认遇到库位库存不足时返回业务错误并回滚全部副作用', async () => {
    const suffix = `location-insufficient-${Date.now()}`
    const { materialId, recordId, batchId } = seedStocktakingFixtureWithBatch(db, suffix, 10)
    const material = db.prepare('SELECT location_id FROM materials WHERE id = ?').get(materialId) as any
    db.prepare(`
      INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock)
      VALUES (?, ?, ?, 1, 0)
    `).run(`invloc-stocktaking-${suffix}`, materialId, material.location_id)

    const res = await request(app)
      .post(`/api/v1/stocktaking/${recordId}/confirm`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'physical', remark: '库位库存不足盘亏确认' })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('STOCK_INSUFFICIENT')
    expect(res.body.error.message).toContain('库位库存不足')

    const record = db.prepare('SELECT status FROM stocktaking_records WHERE id = ?').get(recordId) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(batchId) as any
    const locationStock = db.prepare(`
      SELECT stock
      FROM inventory_locations
      WHERE material_id = ? AND location_id = ?
    `).get(materialId, material.location_id) as any
    const batchAdjustments = db.prepare(`
      SELECT COUNT(*) as count
      FROM stocktaking_batch_adjustments
      WHERE stocktaking_id = ?
    `).get(recordId) as any
    const logs = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'stocktaking'
    `).get(recordId) as any

    expect(record.status).toBe('completed')
    expect(inventory.stock).toBe(10)
    expect(batch.remaining).toBe(10)
    expect(locationStock.stock).toBe(1)
    expect(batchAdjustments.count).toBe(0)
    expect(logs.count).toBe(0)
  })

  it('ST-010: 创建盘点拒绝没有库存记录的物料，避免生成无法确认的盘点单', async () => {
    const suffix = `no-inventory-${Date.now()}`
    const { materialId } = seedMaterialWithoutInventory(db, suffix)

    const res = await request(app)
      .post('/api/v1/stocktaking')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        materialId,
        actualStock: 3,
        remark: '没有库存记录的盘点',
      })

    expect(res.status).toBe(404)
    expect(res.body.error.message).toContain('无库存记录')

    const records = db.prepare('SELECT COUNT(*) as count FROM stocktaking_records WHERE material_id = ?')
      .get(materialId) as any
    expect(records.count).toBe(0)
  })
})
