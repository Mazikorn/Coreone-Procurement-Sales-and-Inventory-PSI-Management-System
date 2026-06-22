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

async function loginWarehouseManager(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'wangkq', password: 'CoreOne2026!' })

  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedPurchaseFixture(db: any, suffix: string) {
  const categoryId = `cat-po-in-${suffix}`
  const materialId = `mat-po-in-${suffix}`
  const supplierId = `sup-po-in-${suffix}`
  const locationId = `loc-po-in-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-POIN-${suffix}`, '采购入库分类', 1)
  db.prepare('INSERT INTO suppliers (id, code, name) VALUES (?, ?, ?)')
    .run(supplierId, `SUP-POIN-${suffix}`, '采购入库供应商')
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-POIN-${suffix}`, '采购入库库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, supplier_id, price, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-POIN-${suffix}`, '采购入库物料', '1ml', '瓶', categoryId, supplierId, 12, locationId)

  return { materialId, supplierId, locationId }
}

describe('采购订单入库联动', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('PO-PERM-001: 仓库主管可读取采购订单但不能创建', async () => {
    const warehouseToken = await loginWarehouseManager(app)
    const listRes = await request(app)
      .get('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${warehouseToken}`)

    expect(listRes.status).toBe(200)

    const createRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({
        materialId: 'mat-not-used',
        orderedQty: 1,
        unitPrice: 1,
      })

    expect(createRes.status).toBe(403)
  })

  it('PO-REF-001: 创建采购订单拒绝停用物料和停用供应商', async () => {
    const suffix = `inactive-ref-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)
    const inactiveMaterialId = `mat-po-inactive-${suffix}`
    const inactiveSupplierId = `sup-po-inactive-${suffix}`

    db.prepare('INSERT INTO suppliers (id, code, name, status) VALUES (?, ?, ?, 0)')
      .run(inactiveSupplierId, `SUP-POOFF-${suffix}`, '停用采购供应商')
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, supplier_id, price, location_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `).run(
      inactiveMaterialId,
      `MAT-POOFF-${suffix}`,
      '停用采购物料',
      '1ml',
      '瓶',
      `cat-po-in-${suffix}`,
      fixture.supplierId,
      12,
      fixture.locationId,
    )

    const inactiveMaterialRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: inactiveMaterialId,
        materialName: '停用采购物料',
        supplierId: fixture.supplierId,
        orderedQty: 5,
        unit: '瓶',
        unitPrice: 12,
      })

    expect(inactiveMaterialRes.status).toBe(409)
    expect(inactiveMaterialRes.body.error.message).toContain('物料已停用')

    const inactiveSupplierRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        materialName: '采购入库物料',
        supplierId: inactiveSupplierId,
        orderedQty: 5,
        unit: '瓶',
        unitPrice: 12,
      })

    expect(inactiveSupplierRes.status).toBe(409)
    expect(inactiveSupplierRes.body.error.message).toContain('供应商已停用')

    const blockedOrderCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM purchase_orders
      WHERE material_id = ? OR supplier_id = ?
    `).get(inactiveMaterialId, inactiveSupplierId) as any
    expect(blockedOrderCount.count).toBe(0)
  })

  it('PO-SNAPSHOT-001: 创建采购订单使用物料当前快照而不是客户端伪造字段', async () => {
    const suffix = `snapshot-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        materialName: '客户端伪造物料名',
        supplierId: fixture.supplierId,
        orderedQty: 3,
        unit: '客户端伪造单位',
        unitPrice: 8,
      })

    expect(poRes.status).toBe(200)
    const order = db.prepare(`
      SELECT material_name, unit, unit_price, total_amount
      FROM purchase_orders
      WHERE id = ?
    `).get(poRes.body.data.id) as any

    expect(order.material_name).toBe('采购入库物料')
    expect(order.unit).toBe('瓶')
    expect(order.unit_price).toBe(8)
    expect(order.total_amount).toBe(24)
  })

  it('PO-REF-002: 创建采购订单必须选择供应商并在列表返回供应商名称', async () => {
    const suffix = `supplier-required-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const missingSupplier = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        orderedQty: 3,
        unitPrice: 8,
      })

    expect(missingSupplier.status).toBe(400)
    expect(missingSupplier.body.error.message).toContain('供应商')

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        supplierId: fixture.supplierId,
        orderedQty: 3,
        unitPrice: 8,
      })

    expect(poRes.status).toBe(200)

    const listRes = await request(app)
      .get('/api/v1/purchase-orders')
      .query({ keyword: poRes.body.data.orderNo })
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.list[0]).toMatchObject({
      orderNo: poRes.body.data.orderNo,
      supplierId: fixture.supplierId,
      supplierName: '采购入库供应商',
    })
  })

  it('PO-AUDIT-001: 采购订单创建和取消写入操作日志，支撑仓管入库交接追踪', async () => {
    const suffix = `audit-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        supplierId: fixture.supplierId,
        orderedQty: 3,
        unitPrice: 8,
      })

    expect(poRes.status).toBe(200)

    const cancelRes = await request(app)
      .put(`/api/v1/purchase-orders/${poRes.body.data.id}/cancel`)
      .set('Authorization', `Bearer ${token}`)

    expect(cancelRes.status).toBe(200)

    const logs = db.prepare(`
      SELECT operation, request_data
      FROM operation_logs
      WHERE request_data LIKE ?
      ORDER BY rowid ASC
    `).all(`%"id":"${poRes.body.data.id}"%`) as any[]

    expect(logs.map(row => row.operation)).toEqual([
      'POST /purchase-orders',
      'PUT /purchase-orders/:id/cancel',
    ])
  })

  it('PO-EDIT-001: 未收货采购订单可更正数量单价并写入前后值审计', async () => {
    const suffix = `edit-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        supplierId: fixture.supplierId,
        orderedQty: 3,
        unitPrice: 8,
        expectedDate: '2026-07-01',
        remark: '录入时数量偏小',
      })

    expect(poRes.status).toBe(200)

    const updateRes = await request(app)
      .put(`/api/v1/purchase-orders/${poRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        supplierId: fixture.supplierId,
        orderedQty: 5,
        unitPrice: 9,
        expectedDate: '2026-07-03',
        remark: '更正采购数量和单价',
      })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data).toMatchObject({
      id: poRes.body.data.id,
      orderedQty: 5,
      receivedQty: 0,
      remainingQty: 5,
      unitPrice: 9,
      totalAmount: 45,
      expectedDate: '2026-07-03',
      remark: '更正采购数量和单价',
      status: 'pending',
    })

    const order = db.prepare(`
      SELECT ordered_qty, received_qty, unit_price, total_amount, expected_date, remark, status
      FROM purchase_orders
      WHERE id = ?
    `).get(poRes.body.data.id) as any
    expect(order).toMatchObject({
      ordered_qty: 5,
      received_qty: 0,
      unit_price: 9,
      total_amount: 45,
      expected_date: '2026-07-03',
      remark: '更正采购数量和单价',
      status: 'pending',
    })

    const auditLog = db.prepare(`
      SELECT operation, request_data, response_data
      FROM operation_logs
      WHERE operation = 'PUT /purchase-orders/:id'
        AND request_data LIKE ?
      ORDER BY rowid DESC
      LIMIT 1
    `).get(`%"id":"${poRes.body.data.id}"%`) as any
    expect(auditLog).toBeTruthy()
    expect(JSON.parse(auditLog.request_data)).toMatchObject({
      module: 'purchase_orders',
      id: poRes.body.data.id,
      before: {
        orderedQty: 3,
        unitPrice: 8,
        totalAmount: 24,
      },
      after: {
        orderedQty: 5,
        unitPrice: 9,
        totalAmount: 45,
      },
    })
    expect(JSON.parse(auditLog.response_data)).toMatchObject({
      id: poRes.body.data.id,
      status: 'pending',
      changedFields: expect.arrayContaining(['orderedQty', 'unitPrice', 'totalAmount', 'expectedDate', 'remark']),
    })
  })

  it('PO-EDIT-002: 已产生收货事实的采购订单不可编辑，避免采购事实和库存事实不一致', async () => {
    const suffix = `edit-received-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        supplierId: fixture.supplierId,
        orderedQty: 6,
        unitPrice: 12,
      })

    expect(poRes.status).toBe(200)

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: fixture.materialId,
        batchNo: `B-POEDIT-${suffix}`,
        quantity: 2,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId: poRes.body.data.id,
      })
    expect(inboundRes.status).toBe(201)

    const updateRes = await request(app)
      .put(`/api/v1/purchase-orders/${poRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        supplierId: fixture.supplierId,
        orderedQty: 8,
        unitPrice: 12,
      })

    expect(updateRes.status).toBe(409)
    expect(updateRes.body.error.code).toBe('PURCHASE_ORDER_ALREADY_RECEIVED')
    expect(updateRes.body.error.message).toContain('已收货')

    const order = db.prepare('SELECT ordered_qty, received_qty, status FROM purchase_orders WHERE id = ?')
      .get(poRes.body.data.id) as any
    expect(order).toMatchObject({ ordered_qty: 6, received_qty: 2, status: 'partial' })
  })

  it('PO-VALIDATION-001: 创建采购订单拒绝非有限数量和单价，避免订单金额污染', async () => {
    const suffix = `finite-number-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)
    const invalidPayloads = [
      { orderedQty: 'Infinity', unitPrice: 12, message: '采购数量' },
      { orderedQty: 5, unitPrice: '1e309', message: '采购单价' },
    ]

    for (const payload of invalidPayloads) {
      const res = await request(app)
        .post('/api/v1/purchase-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          materialId: fixture.materialId,
          supplierId: fixture.supplierId,
          orderedQty: payload.orderedQty,
          unitPrice: payload.unitPrice,
        })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain(payload.message)
    }

    const orderCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM purchase_orders
      WHERE material_id = ?
    `).get(fixture.materialId) as any
    expect(orderCount.count).toBe(0)
  })

  it('PO-IN-001: 采购入库只更新一次订单收货数量，并创建库存批次', async () => {
    const suffix = `once-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        materialName: '采购入库物料',
        supplierId: fixture.supplierId,
        orderedQty: 20,
        unit: '瓶',
        unitPrice: 12,
      })

    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: fixture.materialId,
        batchNo: `B-POIN-${suffix}`,
        quantity: 8,
        price: 12,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })

    expect(inboundRes.status).toBe(201)

    const order = db.prepare('SELECT received_qty, status FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as any
    const inboundTotal = db.prepare(`
      SELECT COALESCE(SUM(quantity), 0) as total
      FROM inbound_records
      WHERE purchase_order_id = ? AND status = 'completed' AND is_deleted = 0
    `).get(purchaseOrderId) as any
    const batch = db.prepare('SELECT remaining, inbound_price FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, `B-POIN-${suffix}`) as any

    expect(order.received_qty).toBe(8)
    expect(order.status).toBe('partial')
    expect(inboundTotal.total).toBe(8)
    expect(batch.remaining).toBe(8)
    expect(batch.inbound_price).toBe(12)
  })

  it('PO-IN-AUDIT-001: 采购入库创建和取消写入操作日志，支撑仓管责任追踪', async () => {
    const suffix = `inbound-audit-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        supplierId: fixture.supplierId,
        orderedQty: 8,
        unitPrice: 12,
      })

    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: fixture.materialId,
        batchNo: `B-POIN-${suffix}`,
        quantity: 3,
        price: 12,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })

    expect(inboundRes.status).toBe(201)
    const inboundId = inboundRes.body.data.id

    const cancelRes = await request(app)
      .post(`/api/v1/inbound/${inboundId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '审计回归取消' })

    expect(cancelRes.status).toBe(200)

    const logs = db.prepare(`
      SELECT operation, request_data
      FROM operation_logs
      WHERE request_data LIKE ?
      ORDER BY rowid ASC
    `).all(`%"id":"${inboundId}"%`) as any[]

    expect(logs.map(row => row.operation)).toEqual([
      'POST /inbound',
      'POST /inbound/:id/cancel',
    ])
    expect(logs.every(row => row.request_data.includes(purchaseOrderId))).toBe(true)
  })

  it('PO-IN-011: 采购订单入库未传单价时继承订单单价，避免批次成本被清零', async () => {
    const suffix = `inherit-price-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        supplierId: fixture.supplierId,
        orderedQty: 10,
        unitPrice: 15,
      })

    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: fixture.materialId,
        batchNo: `B-POIN-${suffix}`,
        quantity: 4,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })

    expect(inboundRes.status).toBe(201)

    const order = db.prepare('SELECT received_qty, status FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as any
    const record = db.prepare('SELECT quantity, price, amount FROM inbound_records WHERE id = ?')
      .get(inboundRes.body.data.id) as any
    const batch = db.prepare('SELECT remaining, inbound_price FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, `B-POIN-${suffix}`) as any

    expect(order.received_qty).toBe(4)
    expect(order.status).toBe('partial')
    expect(record).toMatchObject({ quantity: 4, price: 15, amount: 60 })
    expect(batch.remaining).toBe(4)
    expect(batch.inbound_price).toBe(15)
  })

  it('PO-IN-003: 直接收货接口被拒绝，避免订单与库存脱节', async () => {
    const suffix = `direct-receive-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        materialName: '直接收货拒绝测试物料',
        supplierId: fixture.supplierId,
        orderedQty: 6,
        unit: '瓶',
        unitPrice: 12,
      })

    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const receiveRes = await request(app)
      .put(`/api/v1/purchase-orders/${purchaseOrderId}/receive`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 3 })

    expect(receiveRes.status).toBe(400)
    expect(receiveRes.body.error.message).toContain('采购收货必须通过入库接口')

    const order = db.prepare('SELECT received_qty, status FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as any
    const inboundCount = db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE purchase_order_id = ?').get(purchaseOrderId) as any
    const batchCount = db.prepare('SELECT COUNT(*) as count FROM batches WHERE material_id = ? AND batch_no LIKE ?')
      .get(fixture.materialId, `B-POIN-${suffix}%`) as any

    expect(order.received_qty).toBe(0)
    expect(order.status).toBe('pending')
    expect(inboundCount.count).toBe(0)
    expect(batchCount.count).toBe(0)
  })

  it('PO-LIST-001: 采购订单筛选总数和引用数据请求使用同一过滤口径', async () => {
    const suffix = `refs-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)
    const insert = db.prepare(`
      INSERT INTO purchase_orders (
        id, order_no, material_id, material_name, supplier_id,
        ordered_qty, received_qty, unit, unit_price, total_amount, status
      ) VALUES (?, ?, ?, ?, ?, 10, 0, '瓶', 12, 120, ?)
    `)

    for (let i = 1; i <= 205; i += 1) {
      const padded = String(i).padStart(3, '0')
      insert.run(
        `po-refs-${suffix}-${padded}`,
        `PO-REFS-${suffix}-${padded}`,
        fixture.materialId,
        `引用候选采购单物料-${suffix}`,
        fixture.supplierId,
        'pending',
      )
    }
    insert.run(
      `po-refs-${suffix}-done`,
      `PO-REFS-${suffix}-DONE`,
      fixture.materialId,
      `引用候选采购单物料-${suffix}`,
      fixture.supplierId,
      'completed',
    )

    const res = await request(app)
      .get('/api/v1/purchase-orders')
      .query({ keyword: `引用候选采购单物料-${suffix}`, status: 'pending', page: 1, pageSize: 999 })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(205)
    expect(res.body.data.pagination.total).toBe(205)
    expect(res.body.data.pagination.pageSize).toBe(999)
    expect(res.body.data.list).toHaveLength(205)
    expect(res.body.data.list.every((item: any) => item.status === 'pending')).toBe(true)
    expect(res.body.data.list[0]).toMatchObject({
      orderNo: expect.stringContaining(`PO-REFS-${suffix}`),
      materialId: fixture.materialId,
      materialName: `引用候选采购单物料-${suffix}`,
      orderedQty: 10,
      receivedQty: 0,
      remainingQty: 10,
      supplierName: '采购入库供应商',
      unitPrice: 12,
      totalAmount: 120,
    })
    expect(res.body.data.list[0].order_no).toBeUndefined()
    expect(res.body.data.list[0].material_name).toBeUndefined()
  })

  it('PO-CANCEL-001: 已取消采购订单不能重复取消', async () => {
    const suffix = `cancel-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        materialName: '采购取消测试物料',
        supplierId: fixture.supplierId,
        orderedQty: 5,
        unit: '瓶',
        unitPrice: 12,
      })

    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const firstCancel = await request(app)
      .put(`/api/v1/purchase-orders/${purchaseOrderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)

    expect(firstCancel.status).toBe(200)

    const secondCancel = await request(app)
      .put(`/api/v1/purchase-orders/${purchaseOrderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)

    expect(secondCancel.status).toBe(400)
    expect(secondCancel.body.error.message).toContain('已取消的订单不能重复取消')

    const order = db.prepare('SELECT status, received_qty FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as any
    expect(order.status).toBe('cancelled')
    expect(order.received_qty).toBe(0)
  })

  it('PO-CANCEL-002: 已部分收货的采购订单不能取消', async () => {
    const suffix = `cancel-partial-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        materialName: '部分收货取消测试物料',
        supplierId: fixture.supplierId,
        orderedQty: 5,
        unit: '瓶',
        unitPrice: 12,
      })
    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: fixture.materialId,
        batchNo: `B-POIN-${suffix}`,
        quantity: 2,
        price: 12,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })
    expect(inboundRes.status).toBe(201)

    const cancelRes = await request(app)
      .put(`/api/v1/purchase-orders/${purchaseOrderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)

    expect(cancelRes.status).toBe(400)
    expect(cancelRes.body.error.message).toContain('已收货的订单不能取消')

    const order = db.prepare('SELECT status, received_qty FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as any
    expect(order.status).toBe('partial')
    expect(order.received_qty).toBe(2)
  })

  it('PO-IN-002: 已取消采购订单不能继续采购入库', async () => {
    const suffix = `cancelled-inbound-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        materialName: '已取消入库测试物料',
        supplierId: fixture.supplierId,
        orderedQty: 5,
        unit: '瓶',
        unitPrice: 12,
      })
    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const cancelRes = await request(app)
      .put(`/api/v1/purchase-orders/${purchaseOrderId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
    expect(cancelRes.status).toBe(200)

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: fixture.materialId,
        batchNo: `B-POIN-${suffix}`,
        quantity: 1,
        price: 12,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })

    expect(inboundRes.status).toBe(400)
    expect(inboundRes.body.error.message).toContain('已取消的采购订单不能入库')

    const order = db.prepare('SELECT status, received_qty FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as any
    const inboundCount = db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE purchase_order_id = ?').get(purchaseOrderId) as any
    expect(order.status).toBe('cancelled')
    expect(order.received_qty).toBe(0)
    expect(inboundCount.count).toBe(0)
  })

  it('PO-IN-004: 恢复已取消采购入库不能让采购订单超收', async () => {
    const suffix = `restore-over-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        materialName: '恢复超收测试物料',
        supplierId: fixture.supplierId,
        orderedQty: 10,
        unit: '瓶',
        unitPrice: 12,
      })
    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const firstInbound = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: fixture.materialId,
        batchNo: `B-POIN-${suffix}-A`,
        quantity: 6,
        price: 12,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })
    expect(firstInbound.status).toBe(201)
    const firstInboundId = firstInbound.body.data.id

    const cancelFirst = await request(app)
      .post(`/api/v1/inbound/${firstInboundId}/cancel`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '恢复超收测试先取消' })
    expect(cancelFirst.status).toBe(200)

    const secondInbound = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: fixture.materialId,
        batchNo: `B-POIN-${suffix}-B`,
        quantity: 10,
        price: 12,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })
    expect(secondInbound.status).toBe(201)

    const restoreFirst = await request(app)
      .put(`/api/v1/inbound/${firstInboundId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'completed' })

    expect(restoreFirst.status).toBe(400)
    expect(restoreFirst.body.error.message).toContain('恢复后采购订单收货数量将超过采购数量')

    const order = db.prepare('SELECT status, received_qty FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as any
    const firstRecord = db.prepare('SELECT status FROM inbound_records WHERE id = ?').get(firstInboundId) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any

    expect(order.status).toBe('completed')
    expect(order.received_qty).toBe(10)
    expect(firstRecord.status).toBe('cancelled')
    expect(inventory.stock).toBe(10)
  })

  it('PO-IN-005: 采购入库必须匹配采购订单物料，避免订单被错误物料冲抵', async () => {
    const suffix = `material-match-${Date.now()}`
    const orderFixture = seedPurchaseFixture(db, `${suffix}-order`)
    const wrongFixture = seedPurchaseFixture(db, `${suffix}-wrong`)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: orderFixture.materialId,
        supplierId: orderFixture.supplierId,
        orderedQty: 10,
        unitPrice: 12,
      })
    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: wrongFixture.materialId,
        batchNo: `B-POIN-${suffix}-WRONG-MAT`,
        quantity: 4,
        price: 12,
        supplierId: orderFixture.supplierId,
        locationId: wrongFixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })

    expect(inboundRes.status).toBe(400)
    expect(inboundRes.body.error.message).toContain('物料不一致')

    const order = db.prepare('SELECT received_qty, status FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as any
    const inboundCount = db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE purchase_order_id = ?').get(purchaseOrderId) as any
    const wrongInventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(wrongFixture.materialId) as any

    expect(order.received_qty).toBe(0)
    expect(order.status).toBe('pending')
    expect(inboundCount.count).toBe(0)
    expect(wrongInventory).toBeUndefined()
  })

  it('PO-IN-006: 采购入库必须匹配采购订单供应商，避免批次来源和订单来源断链', async () => {
    const suffix = `supplier-match-${Date.now()}`
    const orderFixture = seedPurchaseFixture(db, `${suffix}-order`)
    const wrongSupplierFixture = seedPurchaseFixture(db, `${suffix}-wrong-sup`)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: orderFixture.materialId,
        supplierId: orderFixture.supplierId,
        orderedQty: 10,
        unitPrice: 12,
      })
    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: orderFixture.materialId,
        batchNo: `B-POIN-${suffix}-WRONG-SUP`,
        quantity: 4,
        price: 12,
        supplierId: wrongSupplierFixture.supplierId,
        locationId: orderFixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })

    expect(inboundRes.status).toBe(400)
    expect(inboundRes.body.error.message).toContain('供应商不一致')

    const order = db.prepare('SELECT received_qty, status FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as any
    const inboundCount = db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE purchase_order_id = ?').get(purchaseOrderId) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(orderFixture.materialId) as any
    const batch = db.prepare('SELECT id FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(orderFixture.materialId, `B-POIN-${suffix}-WRONG-SUP`) as any

    expect(order.received_qty).toBe(0)
    expect(order.status).toBe('pending')
    expect(inboundCount.count).toBe(0)
    expect(inventory).toBeUndefined()
    expect(batch).toBeUndefined()
  })

  it('PO-IN-007: 关联采购订单时入库类型必须是采购入库，避免直接入库绕开订单口径', async () => {
    const suffix = `type-match-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        supplierId: fixture.supplierId,
        orderedQty: 10,
        unitPrice: 12,
      })
    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'direct',
        materialId: fixture.materialId,
        batchNo: `B-POIN-${suffix}-DIRECT`,
        quantity: 4,
        price: 12,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })

    expect(inboundRes.status).toBe(400)
    expect(inboundRes.body.error.message).toContain('采购入库')

    const order = db.prepare('SELECT received_qty, status FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as any
    const inboundCount = db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE purchase_order_id = ?').get(purchaseOrderId) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any

    expect(order.received_qty).toBe(0)
    expect(order.status).toBe('pending')
    expect(inboundCount.count).toBe(0)
    expect(inventory).toBeUndefined()
  })

  it('PO-IN-008: 修改已完成采购入库数量必须同步采购订单收货数量', async () => {
    const suffix = `edit-qty-sync-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        supplierId: fixture.supplierId,
        orderedQty: 10,
        unitPrice: 12,
      })
    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: fixture.materialId,
        batchNo: `B-POIN-${suffix}`,
        quantity: 4,
        price: 12,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })
    expect(inboundRes.status).toBe(201)
    const inboundId = inboundRes.body.data.id

    const updateRes = await request(app)
      .put(`/api/v1/inbound/${inboundId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 8, price: 13 })

    expect(updateRes.status).toBe(200)

    const order = db.prepare('SELECT received_qty, status FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as any
    const record = db.prepare('SELECT quantity, price, amount FROM inbound_records WHERE id = ?').get(inboundId) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any
    const batch = db.prepare('SELECT quantity, remaining, inbound_price FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, `B-POIN-${suffix}`) as any

    expect(order.received_qty).toBe(8)
    expect(order.status).toBe('partial')
    expect(record).toMatchObject({ quantity: 8, price: 13, amount: 104 })
    expect(inventory.stock).toBe(8)
    expect(batch.quantity).toBe(8)
    expect(batch.remaining).toBe(8)
    expect(batch.inbound_price).toBe(13)
  })

  it('PO-IN-009: 修改采购入库数量不能让采购订单超收且不能产生库存副作用', async () => {
    const suffix = `edit-over-${Date.now()}`
    const fixture = seedPurchaseFixture(db, suffix)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: fixture.materialId,
        supplierId: fixture.supplierId,
        orderedQty: 10,
        unitPrice: 12,
      })
    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: fixture.materialId,
        batchNo: `B-POIN-${suffix}`,
        quantity: 4,
        price: 12,
        supplierId: fixture.supplierId,
        locationId: fixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })
    expect(inboundRes.status).toBe(201)
    const inboundId = inboundRes.body.data.id

    const updateRes = await request(app)
      .put(`/api/v1/inbound/${inboundId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ quantity: 11 })

    expect(updateRes.status).toBe(400)
    expect(updateRes.body.error.message).toContain('超过采购数量')

    const order = db.prepare('SELECT received_qty, status FROM purchase_orders WHERE id = ?').get(purchaseOrderId) as any
    const record = db.prepare('SELECT quantity, amount FROM inbound_records WHERE id = ?').get(inboundId) as any
    const inventory = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(fixture.materialId) as any
    const batch = db.prepare('SELECT quantity, remaining FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(fixture.materialId, `B-POIN-${suffix}`) as any

    expect(order.received_qty).toBe(4)
    expect(order.status).toBe('partial')
    expect(record).toMatchObject({ quantity: 4, amount: 48 })
    expect(inventory.stock).toBe(4)
    expect(batch.quantity).toBe(4)
    expect(batch.remaining).toBe(4)
  })

  it('PO-IN-010: 已完成采购入库不能改成其他供应商，避免订单来源和批次来源断链', async () => {
    const suffix = `edit-supplier-${Date.now()}`
    const orderFixture = seedPurchaseFixture(db, `${suffix}-order`)
    const wrongSupplierFixture = seedPurchaseFixture(db, `${suffix}-wrong-sup`)

    const poRes = await request(app)
      .post('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: orderFixture.materialId,
        supplierId: orderFixture.supplierId,
        orderedQty: 10,
        unitPrice: 12,
      })
    expect(poRes.status).toBe(200)
    const purchaseOrderId = poRes.body.data.id

    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'purchase',
        materialId: orderFixture.materialId,
        batchNo: `B-POIN-${suffix}`,
        quantity: 4,
        price: 12,
        supplierId: orderFixture.supplierId,
        locationId: orderFixture.locationId,
        expiryDate: '2027-12-31',
        purchaseOrderId,
      })
    expect(inboundRes.status).toBe(201)
    const inboundId = inboundRes.body.data.id

    const updateRes = await request(app)
      .put(`/api/v1/inbound/${inboundId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ supplierId: wrongSupplierFixture.supplierId })

    expect(updateRes.status).toBe(400)
    expect(updateRes.body.error.message).toContain('供应商')

    const record = db.prepare('SELECT supplier_id FROM inbound_records WHERE id = ?').get(inboundId) as any
    const batch = db.prepare('SELECT supplier_id FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(orderFixture.materialId, `B-POIN-${suffix}`) as any

    expect(record.supplier_id).toBe(orderFixture.supplierId)
    expect(batch.supplier_id).toBe(orderFixture.supplierId)
  })
})
