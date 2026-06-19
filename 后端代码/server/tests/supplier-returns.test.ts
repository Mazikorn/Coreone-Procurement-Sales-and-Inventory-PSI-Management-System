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

  return { materialId, supplierId, locationId }
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

  it('SR-FILTER-001: 列表拒绝非法状态筛选，避免返回伪空结果', async () => {
    const res = await request(app)
      .get('/api/v1/supplier-returns')
      .query({ status: 'ghost' })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body.error.code).toBe('INVALID_PARAMETER')
  })

  it('SR-FILTER-002: 列表拒绝非法日期范围筛选，避免返回伪空结果', async () => {
    const invalidStartDate = await request(app)
      .get('/api/v1/supplier-returns')
      .query({ startDate: '2026-02-30' })
      .set('Authorization', `Bearer ${token}`)

    const invalidEndDate = await request(app)
      .get('/api/v1/supplier-returns')
      .query({ endDate: 'not-a-date' })
      .set('Authorization', `Bearer ${token}`)

    const reversedRange = await request(app)
      .get('/api/v1/supplier-returns')
      .query({ startDate: '2026-06-30', endDate: '2026-06-01' })
      .set('Authorization', `Bearer ${token}`)

    expect(invalidStartDate.status).toBe(400)
    expect(invalidStartDate.body.error.code).toBe('INVALID_PARAMETER')
    expect(invalidEndDate.status).toBe(400)
    expect(invalidEndDate.body.error.code).toBe('INVALID_PARAMETER')
    expect(reversedRange.status).toBe(400)
    expect(reversedRange.body.error.code).toBe('INVALID_PARAMETER')
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

  it('SR-VALIDATION-001: 供应商退货拒绝非有限数量且不扣库存和批次', async () => {
    const { materialId, supplierId, batchId } = seedSupplierReturnMaterialWithBatch(db, `finite-number-${Date.now()}`)
    const invalidPayloads = [
      { quantity: 'Infinity', refundAmount: 0, message: '数量' },
      { quantity: 1, refundAmount: '1e309', message: '退款金额' },
    ]

    for (const payload of invalidPayloads) {
      const res = await request(app)
        .post('/api/v1/supplier-returns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          materialId,
          supplierId,
          batchId,
          quantity: payload.quantity,
          refundAmount: payload.refundAmount,
          reason: '非有限数值退货',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain(payload.message)
    }

    const batch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(batchId) as any
    const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const records = db.prepare('SELECT COUNT(*) as count FROM supplier_returns WHERE material_id = ?')
      .get(materialId) as any
    const logs = db.prepare('SELECT COUNT(*) as count FROM stock_logs WHERE material_id = ? AND related_type = ?')
      .get(materialId, 'supplier_return') as any

    expect(Number(batch.remaining)).toBe(10)
    expect(Number(inv.stock)).toBe(10)
    expect(Number(records.count)).toBe(0)
    expect(Number(logs.count)).toBe(0)
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

  it('SR-009: 删除待发货退货时若批次数量已下调必须拒绝，避免批次剩余量超过批次数量', async () => {
    const { materialId, supplierId, batchId } = seedSupplierReturnMaterialWithBatch(db, `delete-stale-cancel-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        supplierId,
        batchId,
        quantity: 4,
        reason: '待发货退货后撤销',
      })
    expect(createRes.status).toBe(200)
    db.prepare('UPDATE batches SET quantity = 6 WHERE id = ?').run(batchId)

    const deleteRes = await request(app)
      .delete(`/api/v1/supplier-returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(deleteRes.status).toBe(409)
    expect(deleteRes.body.error.code).toBe('BATCH_RESTORE_CONFLICT')

    const record = db.prepare('SELECT is_deleted FROM supplier_returns WHERE id = ?').get(createRes.body.data.id) as any
    const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batch = db.prepare('SELECT quantity, remaining FROM batches WHERE id = ?').get(batchId) as any
    const cancelLogs = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'supplier_return_cancel'
    `).get(createRes.body.data.id) as any

    expect(record.is_deleted).toBe(0)
    expect(Number(inv.stock)).toBe(6)
    expect(Number(batch.quantity)).toBe(6)
    expect(Number(batch.remaining)).toBe(6)
    expect(Number(cancelLogs.count)).toBe(0)
  })

  it('SR-010: 状态取消退货时若批次数量已下调必须拒绝，避免批次剩余量超过批次数量', async () => {
    const { materialId, supplierId, batchId } = seedSupplierReturnMaterialWithBatch(db, `status-stale-cancel-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        supplierId,
        batchId,
        quantity: 4,
        reason: '状态取消退货后撤销',
      })
    expect(createRes.status).toBe(200)

    const shippedRes = await request(app)
      .put(`/api/v1/supplier-returns/${createRes.body.data.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'shipped' })
    expect(shippedRes.status).toBe(200)
    db.prepare('UPDATE batches SET quantity = 6 WHERE id = ?').run(batchId)

    const cancelRes = await request(app)
      .put(`/api/v1/supplier-returns/${createRes.body.data.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'cancelled' })

    expect(cancelRes.status).toBe(409)
    expect(cancelRes.body.error.code).toBe('BATCH_RESTORE_CONFLICT')

    const record = db.prepare('SELECT status FROM supplier_returns WHERE id = ?').get(createRes.body.data.id) as any
    const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batch = db.prepare('SELECT quantity, remaining FROM batches WHERE id = ?').get(batchId) as any
    const cancelLogs = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'supplier_return_cancel'
    `).get(createRes.body.data.id) as any

    expect(record.status).toBe('shipped')
    expect(Number(inv.stock)).toBe(6)
    expect(Number(batch.quantity)).toBe(6)
    expect(Number(batch.remaining)).toBe(6)
    expect(Number(cancelLogs.count)).toBe(0)
  })

  it('SR-011: 删除待发货退货时若库存总账缺失必须拒绝，避免只恢复批次和库位', async () => {
    const { materialId, supplierId, batchId } = seedSupplierReturnMaterialWithBatch(db, `delete-missing-inv-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        supplierId,
        batchId,
        quantity: 4,
        reason: '库存总账缺失后删除退货',
      })
    expect(createRes.status).toBe(200)
    db.prepare('DELETE FROM inventory WHERE material_id = ?').run(materialId)

    const deleteRes = await request(app)
      .delete(`/api/v1/supplier-returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(deleteRes.status).toBe(404)
    expect(deleteRes.body.error.message).toContain('物料无库存记录')

    const record = db.prepare('SELECT is_deleted FROM supplier_returns WHERE id = ?').get(createRes.body.data.id) as any
    const batch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(batchId) as any
    const cancelLogs = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE related_id = ? AND related_type = 'supplier_return_cancel'
    `).get(createRes.body.data.id) as any

    expect(record.is_deleted).toBe(0)
    expect(Number(batch.remaining)).toBe(6)
    expect(Number(cancelLogs.count)).toBe(0)
  })

  it('SR-012: 总库存和批次足够但库位库存不足时拒绝供应商退货并回滚全部副作用', async () => {
    const suffix = `location-insufficient-${Date.now()}`
    const { materialId, supplierId, batchId, locationId } = seedSupplierReturnMaterialWithBatch(db, suffix)
    db.prepare(`
      INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock)
      VALUES (?, ?, ?, 1, 0)
    `).run(`invloc-sr-${suffix}`, materialId, locationId)

    const res = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        supplierId,
        batchId,
        quantity: 3,
        reason: '库位库存不足供应商退货',
      })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('STOCK_INSUFFICIENT')
    expect(res.body.error.message).toContain('库位库存不足')

    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const batch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(batchId) as any
    const locationStock = db.prepare(`
      SELECT stock
      FROM inventory_locations
      WHERE material_id = ? AND location_id = ?
    `).get(materialId, locationId) as any
    const records = db.prepare('SELECT COUNT(*) as count FROM supplier_returns WHERE material_id = ?')
      .get(materialId) as any
    const logs = db.prepare(`
      SELECT COUNT(*) as count
      FROM stock_logs
      WHERE material_id = ? AND related_type = 'supplier_return'
    `).get(materialId) as any

    expect(Number(inventory.stock)).toBe(10)
    expect(Number(batch.remaining)).toBe(10)
    expect(Number(locationStock.stock)).toBe(1)
    expect(Number(records.count)).toBe(0)
    expect(Number(logs.count)).toBe(0)
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

  it('SR-REF-002: 创建供应商退货必须拒绝不匹配的采购订单和入库记录引用', async () => {
    const returnSeed = seedSupplierReturnMaterialWithBatch(db, `ref-return-${Date.now()}`)
    const otherOrderSeed = seedSupplierReturnMaterialWithBatch(db, `ref-order-${Date.now()}`)
    const otherInboundSeed = seedSupplierReturnMaterialWithBatch(db, `ref-inbound-${Date.now()}`)
    const purchaseOrderId = `po-sr-ref-${Date.now()}`
    const inboundRecordId = `inbound-sr-ref-${Date.now()}`

    db.prepare(`
      INSERT INTO purchase_orders (
        id, order_no, material_id, material_name, supplier_id,
        ordered_qty, received_qty, unit, unit_price, total_amount, status
      ) VALUES (?, ?, ?, ?, ?, 10, 10, '瓶', 12, 120, 'completed')
    `).run(
      purchaseOrderId,
      `PO-SR-REF-${Date.now()}`,
      otherOrderSeed.materialId,
      '其他采购物料',
      otherOrderSeed.supplierId,
    )
    db.prepare(`
      INSERT INTO inbound_records (
        id, inbound_no, type, material_id, batch_no, quantity, unit, price,
        amount, supplier_id, location_id, operator, status, purchase_order_id
      ) VALUES (?, ?, 'purchase', ?, ?, 2, '瓶', 12, 24, ?, ?, 'admin', 'completed', ?)
    `).run(
      inboundRecordId,
      `IN-SR-REF-${Date.now()}`,
      otherInboundSeed.materialId,
      otherInboundSeed.batchNo,
      otherInboundSeed.supplierId,
      otherInboundSeed.locationId,
      purchaseOrderId,
    )

    const wrongOrderRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: returnSeed.materialId,
        supplierId: returnSeed.supplierId,
        batchId: returnSeed.batchId,
        purchaseOrderId,
        quantity: 1,
        reason: '伪造采购订单引用',
      })

    const wrongInboundRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: returnSeed.materialId,
        supplierId: returnSeed.supplierId,
        batchId: returnSeed.batchId,
        inboundRecordId,
        quantity: 1,
        reason: '伪造入库记录引用',
      })

    expect(wrongOrderRes.status).toBe(409)
    expect(wrongOrderRes.body.error?.code || wrongOrderRes.body.code).toBe('SUPPLIER_RETURN_REFERENCE_MISMATCH')
    expect(wrongInboundRes.status).toBe(409)
    expect(wrongInboundRes.body.error?.code || wrongInboundRes.body.code).toBe('SUPPLIER_RETURN_REFERENCE_MISMATCH')

    const batch = db.prepare('SELECT remaining FROM batches WHERE id = ?').get(returnSeed.batchId) as any
    const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(returnSeed.materialId) as any
    const records = db.prepare('SELECT COUNT(*) as count FROM supplier_returns WHERE material_id = ?')
      .get(returnSeed.materialId) as any

    expect(Number(batch.remaining)).toBe(10)
    expect(Number(inv.stock)).toBe(10)
    expect(Number(records.count)).toBe(0)
  })

  it('SR-REF-003: 关联入库记录创建供应商退货时不得静默清空入库供应商', async () => {
    const suffix = `ref-inbound-supplier-${Date.now()}`
    const seed = seedSupplierReturnMaterialWithBatch(db, suffix)
    const inboundRecordId = `inbound-sr-supplier-${suffix}`

    db.prepare(`
      INSERT INTO inbound_records (
        id, inbound_no, type, material_id, batch_no, quantity, unit, price,
        amount, supplier_id, location_id, operator, status, created_at
      ) VALUES (?, ?, 'purchase', ?, ?, 10, '瓶', 12, 120, ?, ?, 'admin', 'completed', '2034-02-10T09:00:00')
    `).run(
      inboundRecordId,
      `IN-SR-SUP-${suffix}`,
      seed.materialId,
      seed.batchNo,
      seed.supplierId,
      seed.locationId,
    )

    const createRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: seed.materialId,
        batchId: seed.batchId,
        inboundRecordId,
        quantity: 2,
        refundAmount: 50,
        reason: '按入库记录退货但省略供应商',
      })

    expect(createRes.status).toBe(200)
    const record = db.prepare('SELECT supplier_id, inbound_record_id FROM supplier_returns WHERE id = ?')
      .get(createRes.body.data.id) as any
    expect(record).toMatchObject({
      supplier_id: seed.supplierId,
      inbound_record_id: inboundRecordId,
    })

    const reportRes = await request(app)
      .get('/api/v1/reports/cost-by-supplier')
      .set('Authorization', `Bearer ${token}`)
    expect(reportRes.status).toBe(200)
    const supplierCost = reportRes.body.data.suppliers.find((row: any) => row.id === seed.supplierId)
    expect(supplierCost).toMatchObject({
      id: seed.supplierId,
      amount: 70,
      orderCount: 1,
    })
  })
})
