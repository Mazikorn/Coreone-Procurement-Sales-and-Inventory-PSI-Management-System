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

async function loginRole(app: any, username: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password: 'CoreOne2026!' })
  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedSupplierReturnMaterial(db: any, suffix: string) {
  const categoryId = `cat-sr-${suffix}`
  const materialId = `mat-sr-${suffix}`
  const supplierId = `sup-sr-${suffix}`
  const locationId = `loc-sr-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-SR-${suffix}`, '供应商退货测试分类', 1)
  db.prepare('INSERT INTO suppliers (id, code, name) VALUES (?, ?, ?)')
    .run(supplierId, `SUP-SR-${suffix}`, '供应商退货测试供应商')
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-SR-${suffix}`, '供应商退货测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, supplier_id, price, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-SR-${suffix}`, '供应商退货测试物料', '1ml', '瓶', categoryId, supplierId, 12, locationId)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, ?, 0, ?)')
    .run(`inv-sr-${suffix}`, materialId, 10, locationId)

  return { materialId, supplierId }
}

function seedSupplierReturnMaterialWithBatch(db: any, suffix: string, batchRemaining = 10) {
  const seeded = seedSupplierReturnMaterial(db, suffix)
  const batchId = `batch-sr-${suffix}`
  const batchNo = `BATCH-SR-${suffix}`
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, inbound_id, inbound_price, supplier_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
  `).run(batchId, seeded.materialId, batchNo, 10, batchRemaining, `inbound-sr-${suffix}`, 12, seeded.supplierId)

  return { ...seeded, batchId, batchNo }
}

describe('供应商退货', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('SR-001: 创建供应商退货时忽略请求体伪造operator，使用登录用户', async () => {
    const { materialId, supplierId } = seedSupplierReturnMaterial(db, `op-${Date.now()}`)

    const res = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        supplierId,
        quantity: 1,
        reason: '测试退货给供应商',
        operator: 'forged-user',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const record = db.prepare('SELECT operator FROM supplier_returns WHERE id = ?').get(res.body.data.id) as any
    const log = db.prepare('SELECT operator FROM stock_logs WHERE related_id = ? AND related_type = ?')
      .get(res.body.data.id, 'supplier_return') as any
    expect(record.operator).toBe('admin')
    expect(log.operator).toBe('admin')
  })

  it('SR-002: 删除供应商退货时忽略请求体伪造operator，使用登录用户', async () => {
    const { materialId, supplierId } = seedSupplierReturnMaterial(db, `cancel-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialId, supplierId, quantity: 1, reason: '测试退货给供应商' })
    expect(createRes.status).toBe(200)

    const res = await request(app)
      .delete(`/api/v1/supplier-returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ operator: 'forged-user' })

    expect(res.status).toBe(200)
    const log = db.prepare('SELECT operator FROM stock_logs WHERE related_id = ? AND related_type = ?')
      .get(createRes.body.data.id, 'supplier_return_cancel') as any
    expect(log.operator).toBe('admin')
  })

  it('SR-003: 状态流转写入操作日志，保留审计线索', async () => {
    const { materialId, supplierId } = seedSupplierReturnMaterial(db, `status-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialId, supplierId, quantity: 1, reason: '测试退货给供应商' })
    expect(createRes.status).toBe(200)

    const res = await request(app)
      .put(`/api/v1/supplier-returns/${createRes.body.data.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'shipped' })

    expect(res.status).toBe(200)
    const log = db.prepare(`
      SELECT * FROM operation_logs
      WHERE operation = ? AND description LIKE ?
      ORDER BY created_at DESC LIMIT 1
    `).get('supplier_return_status_update', `%${createRes.body.data.id}%`) as any
    expect(log?.username).toBe('admin')
  })

  it('SR-004: 创建供应商退货时扣减所选批次并保留批次线索', async () => {
    const { materialId, supplierId, batchId, batchNo } = seedSupplierReturnMaterialWithBatch(db, `batch-${Date.now()}`)

    const res = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        supplierId,
        batchId,
        quantity: 3,
        reason: '批次退货给供应商',
      })

    expect(res.status).toBe(200)
    const record = db.prepare('SELECT batch_id, batch_no, quantity FROM supplier_returns WHERE id = ?')
      .get(res.body.data.id) as any
    const batch = db.prepare('SELECT remaining, status FROM batches WHERE id = ?').get(batchId) as any
    const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any

    expect(record.batch_id).toBe(batchId)
    expect(record.batch_no).toBe(batchNo)
    expect(Number(record.quantity)).toBe(3)
    expect(Number(batch.remaining)).toBe(7)
    expect(Number(batch.status)).toBe(1)
    expect(Number(inv.stock)).toBe(7)
  })

  it('SR-005: 删除待发货供应商退货时恢复对应批次和库存', async () => {
    const { materialId, supplierId, batchId } = seedSupplierReturnMaterialWithBatch(db, `restore-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        supplierId,
        batchId,
        quantity: 4,
        reason: '批次退货后撤销',
      })
    expect(createRes.status).toBe(200)

    const beforeDeleteBatch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(batchId) as any
    expect(Number(beforeDeleteBatch.remaining)).toBe(6)

    const deleteRes = await request(app)
      .delete(`/api/v1/supplier-returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(deleteRes.status).toBe(200)
    const batch = db.prepare('SELECT remaining, status FROM batches WHERE id = ?').get(batchId) as any
    const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any

    expect(Number(batch.remaining)).toBe(10)
    expect(Number(batch.status)).toBe(1)
    expect(Number(inv.stock)).toBe(10)
  })

  it('SR-006: 所选批次库存不足时拒绝退货且不扣总库存', async () => {
    const { materialId, supplierId, batchId } = seedSupplierReturnMaterialWithBatch(db, `insufficient-${Date.now()}`, 2)

    const res = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        supplierId,
        batchId,
        quantity: 3,
        reason: '超过批次余额',
      })

    expect(res.status).toBe(422)
    const batch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(batchId) as any
    const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const records = db.prepare('SELECT COUNT(*) as count FROM supplier_returns WHERE material_id = ?')
      .get(materialId) as any

    expect(Number(batch.remaining)).toBe(2)
    expect(Number(inv.stock)).toBe(10)
    expect(Number(records.count)).toBe(0)
  })

  it('SR-007: 状态流转取消退货时恢复库存和批次', async () => {
    const { materialId, supplierId, batchId } = seedSupplierReturnMaterialWithBatch(db, `status-cancel-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        supplierId,
        batchId,
        quantity: 4,
        reason: '状态取消退货',
      })
    expect(createRes.status).toBe(200)

    const shippedRes = await request(app)
      .put(`/api/v1/supplier-returns/${createRes.body.data.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'shipped' })
    expect(shippedRes.status).toBe(200)

    const cancelRes = await request(app)
      .put(`/api/v1/supplier-returns/${createRes.body.data.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'cancelled' })
    expect(cancelRes.status).toBe(200)

    const record = db.prepare('SELECT status FROM supplier_returns WHERE id = ?').get(createRes.body.data.id) as any
    const batch = db.prepare('SELECT remaining, status FROM batches WHERE id = ?').get(batchId) as any
    const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const cancelLog = db.prepare(`
      SELECT quantity, before_stock, after_stock, operator
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'supplier_return_cancel'
      ORDER BY created_at DESC
      LIMIT 1
    `).get(createRes.body.data.id) as any

    expect(record.status).toBe('cancelled')
    expect(Number(batch.remaining)).toBe(10)
    expect(Number(batch.status)).toBe(1)
    expect(Number(inv.stock)).toBe(10)
    expect(Number(cancelLog.quantity)).toBe(4)
    expect(Number(cancelLog.before_stock)).toBe(6)
    expect(Number(cancelLog.after_stock)).toBe(10)
    expect(cancelLog.operator).toBe('admin')
  })

  it('SR-008: 默认仓管和采购角色可访问并创建供应商退货', async () => {
    const warehouseToken = await loginRole(app, 'wangkq')
    const procurementToken = await loginRole(app, 'zhaohp')
    const warehouseSeed = seedSupplierReturnMaterialWithBatch(db, `whm-role-${Date.now()}`)
    const procurementSeed = seedSupplierReturnMaterialWithBatch(db, `pro-role-${Date.now()}`)

    const warehouseList = await request(app)
      .get('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${warehouseToken}`)
    expect(warehouseList.status).toBe(200)

    const procurementList = await request(app)
      .get('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${procurementToken}`)
    expect(procurementList.status).toBe(200)

    const warehouseCreate = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({
        materialId: warehouseSeed.materialId,
        supplierId: warehouseSeed.supplierId,
        batchId: warehouseSeed.batchId,
        quantity: 1,
        reason: '仓管角色退货',
      })
    expect(warehouseCreate.status).toBe(200)

    const procurementCreate = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${procurementToken}`)
      .send({
        materialId: procurementSeed.materialId,
        supplierId: procurementSeed.supplierId,
        batchId: procurementSeed.batchId,
        quantity: 1,
        reason: '采购角色退货',
      })
    expect(procurementCreate.status).toBe(200)
  })

  it('SR-REF-001: 创建供应商退货拒绝停用物料和停用供应商', async () => {
    const inactiveMaterialSeed = seedSupplierReturnMaterialWithBatch(db, `inactive-material-${Date.now()}`)
    const inactiveSupplierSeed = seedSupplierReturnMaterialWithBatch(db, `inactive-supplier-${Date.now()}`)
    db.prepare('UPDATE materials SET status = 0 WHERE id = ?').run(inactiveMaterialSeed.materialId)
    db.prepare('UPDATE suppliers SET status = 0 WHERE id = ?').run(inactiveSupplierSeed.supplierId)

    const inactiveMaterialRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: inactiveMaterialSeed.materialId,
        supplierId: inactiveMaterialSeed.supplierId,
        batchId: inactiveMaterialSeed.batchId,
        quantity: 2,
        reason: '停用物料退货给供应商',
      })

    expect(inactiveMaterialRes.status).toBe(409)
    expect(inactiveMaterialRes.body.error.message).toContain('物料已停用')

    const inactiveSupplierRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: inactiveSupplierSeed.materialId,
        supplierId: inactiveSupplierSeed.supplierId,
        batchId: inactiveSupplierSeed.batchId,
        quantity: 2,
        reason: '停用供应商退货',
      })

    expect(inactiveSupplierRes.status).toBe(409)
    expect(inactiveSupplierRes.body.error.message).toContain('供应商已停用')

    const materialInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?')
      .get(inactiveMaterialSeed.materialId) as any
    const supplierInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?')
      .get(inactiveSupplierSeed.materialId) as any
    const records = db.prepare('SELECT COUNT(*) as count FROM supplier_returns WHERE material_id IN (?, ?)')
      .get(inactiveMaterialSeed.materialId, inactiveSupplierSeed.materialId) as any

    expect(materialInventory.stock).toBe(10)
    expect(supplierInventory.stock).toBe(10)
    expect(records.count).toBe(0)
  })
})
