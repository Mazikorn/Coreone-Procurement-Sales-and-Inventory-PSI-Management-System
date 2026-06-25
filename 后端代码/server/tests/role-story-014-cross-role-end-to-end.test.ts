process.env.DATABASE_PATH = ':memory:'

import request from 'supertest'
import { beforeAll, describe, expect, it } from 'vitest'

let app: any
let db: any
let adminToken: string
let procurementToken: string
let warehouseToken: string
let technicianToken: string
let financeToken: string

async function login(username: string, password = 'CoreOne2026!') {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password })
  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedAdminFoundation(suffix: string) {
  const categoryId = `rs014-cat-${suffix}`
  const locationId = `rs014-loc-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, 1)')
    .run(categoryId, `814${suffix.slice(-6)}`, '014端到端分类')
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `RS014-LOC-${suffix}`, '014端到端库位', 'shelf', 'A区')

  return { categoryId, locationId }
}

async function createSupplier(suffix: string) {
  const res = await request(app)
    .post('/api/v1/suppliers')
    .set('Authorization', `Bearer ${procurementToken}`)
    .send({
      name: `014链路供应商-${suffix}`,
      contact: '采购联系人',
      phone: '13800000000',
    })

  expect(res.status).toBe(201)
  return res.body.data.id
}

async function createMaterial(suffix: string, categoryId: string, supplierId: string, locationId: string) {
  const res = await request(app)
    .post('/api/v1/materials')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      code: `RS014-MAT-${suffix}`,
      name: `014链路物料-${suffix}`,
      spec: '1ml',
      unit: '支',
      categoryId,
      supplierId,
      locationId,
      price: 42,
      minStock: 2,
    })

  expect(res.status).toBe(201)
  return res.body.data.id
}

async function createPurchaseOrder(materialId: string, supplierId: string) {
  const res = await request(app)
    .post('/api/v1/purchase-orders')
    .set('Authorization', `Bearer ${procurementToken}`)
    .send({
      materialId,
      supplierId,
      orderedQty: 12,
      unitPrice: 42,
      expectedDate: '2026-06-30',
      remark: '014链路采购',
    })

  expect(res.status).toBe(200)
  return res.body.data
}

async function createInbound(materialId: string, supplierId: string, locationId: string, purchaseOrderId: string, batchNo: string) {
  const res = await request(app)
    .post('/api/v1/inbound')
    .set('Authorization', `Bearer ${warehouseToken}`)
    .send({
      type: 'purchase',
      materialId,
      supplierId,
      locationId,
      purchaseOrderId,
      batchNo,
      quantity: 12,
      price: 42,
      expiryDate: '2028-12-31',
      operator: '仓管014',
      remark: '014链路采购入库',
    })

  expect(res.status).toBe(201)
  return res.body.data
}

async function createBomAndProject(suffix: string, materialId: string) {
  const bomRes = await request(app)
    .post('/api/v1/boms')
    .set('Authorization', `Bearer ${technicianToken}`)
    .send({
      code: `RS014-BOM-${suffix}`,
      name: `014链路BOM-${suffix}`,
      type: 'ihc',
      materials: [
        { materialId, usagePerSample: 2, unit: '支', price: 42 },
      ],
    })
  expect(bomRes.status).toBe(201)

  const projectRes = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${technicianToken}`)
    .send({
      code: `RS014-PROJ-${suffix}`,
      name: `014链路项目-${suffix}`,
      type: 'ihc',
      bomId: bomRes.body.data.id,
      status: 'active',
    })
  expect(projectRes.status).toBe(201)

  return { bomId: bomRes.body.data.id, projectId: projectRes.body.data.id }
}

async function mapFeeStandard(suffix: string, bomId: string) {
  const feeStandardId = `rs014-fee-${suffix}`
  db.prepare(`
    INSERT INTO fee_standards (
      id, code, name, category, project_type, fee_per_slide, base_price, status
    )
    VALUES (?, ?, ?, 'ihc', 'ihc', 150, 150, 1)
  `).run(feeStandardId, `RS014-FEE-${suffix}`, `014链路收费-${suffix}`)

  const res = await request(app)
    .put(`/api/v1/abc/bom-fee-mappings/${bomId}`)
    .set('Authorization', `Bearer ${financeToken}`)
    .send({
      mappings: [{
        feeStandardId,
        quantityMultiplier: 1,
        aggregationScope: 'outbound',
      }],
    })

  expect(res.status).toBe(200)
  return feeStandardId
}

async function createBomOutbound(projectId: string, caseNo: string) {
  const res = await request(app)
    .post('/api/v1/outbound/bom')
    .set('Authorization', `Bearer ${warehouseToken}`)
    .send({
      projectId,
      caseNo,
      sampleCount: 3,
      operator: '仓管014',
      remark: '014链路BOM出库',
    })

  expect(res.status).toBe(201)
  return res.body.data
}

describe('role story 014 cross-role end-to-end fact chain', () => {
  beforeAll(async () => {
    const imported = await import('../src/app.js')
    const database = await import('../src/database/DatabaseManager.js')
    app = imported.default
    db = database.getDatabase()

    adminToken = await login('admin', 'admin123')
    procurementToken = await login('caigou')
    warehouseToken = await login('wangkq')
    technicianToken = await login('zhangwei')
    financeToken = await login('sunli')
  })

  it('connects supplier purchase, inbound batch, BOM outbound, ABC cost result, and audit logs across roles', async () => {
    const suffix = `${Date.now()}`
    const batchNo = `RS014-BATCH-${suffix}`
    const caseNo = `RS014-CASE-${suffix}`
    const foundation = seedAdminFoundation(suffix)

    const supplierId = await createSupplier(suffix)
    const materialId = await createMaterial(suffix, foundation.categoryId, supplierId, foundation.locationId)
    const purchaseOrder = await createPurchaseOrder(materialId, supplierId)
    const inbound = await createInbound(materialId, supplierId, foundation.locationId, purchaseOrder.id, batchNo)
    const { bomId, projectId } = await createBomAndProject(suffix, materialId)
    const feeStandardId = await mapFeeStandard(suffix, bomId)
    const outbound = await createBomOutbound(projectId, caseNo)

    const order = db.prepare('SELECT status, received_qty FROM purchase_orders WHERE id = ?').get(purchaseOrder.id) as any
    expect(order).toMatchObject({ status: 'completed' })
    expect(Number(order.received_qty)).toBe(12)

    const batch = db.prepare('SELECT id, remaining, inbound_price, supplier_id, inbound_id FROM batches WHERE material_id = ? AND batch_no = ?')
      .get(materialId, batchNo) as any
    expect(batch).toMatchObject({
      inbound_price: 42,
      supplier_id: supplierId,
      inbound_id: inbound.id,
    })
    expect(Number(batch.remaining)).toBe(6)

    const inventory = db.prepare('SELECT stock, last_inbound_id, last_outbound_id FROM inventory WHERE material_id = ?')
      .get(materialId) as any
    expect(Number(inventory.stock)).toBe(6)
    expect(inventory.last_inbound_id).toBe(inbound.id)
    expect(inventory.last_outbound_id).toBe(outbound.id)

    const outboundRecord = db.prepare('SELECT project_id, case_no, sample_count, total_cost, abc_total_cost, fee_amount, profit, cost_status FROM outbound_records WHERE id = ?')
      .get(outbound.id) as any
    expect(outboundRecord).toMatchObject({
      project_id: projectId,
      case_no: caseNo,
      cost_status: 'costed',
    })
    expect(Number(outboundRecord.sample_count)).toBe(3)
    expect(Number(outboundRecord.total_cost)).toBe(252)
    expect(Number(outboundRecord.abc_total_cost)).toBeGreaterThanOrEqual(252)
    expect(Number(outboundRecord.fee_amount)).toBe(450)

    const abcDetail = db.prepare(`
      SELECT bom_id, project_id, case_no, fee_standard_id, fee_amount, total_cost, profit, cost_status, source_snapshot
      FROM outbound_abc_details
      WHERE outbound_id = ?
    `).get(outbound.id) as any
    expect(abcDetail).toMatchObject({
      bom_id: bomId,
      project_id: projectId,
      case_no: caseNo,
      fee_standard_id: feeStandardId,
      cost_status: 'costed',
    })
    expect(Number(abcDetail.fee_amount)).toBe(450)
    expect(JSON.parse(abcDetail.source_snapshot)).toMatchObject({
      outboundId: outbound.id,
      bomSnapshot: { id: bomId },
    })

    const costRun = await request(app)
      .post('/api/v1/abc/cost-runs')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ yearMonth: new Date().toISOString().slice(0, 7), runType: 'recalculate' })
    expect(costRun.status).toBe(201)
    expect(costRun.body.data.summary.succeeded).toBeGreaterThanOrEqual(1)
    const costRunLog = db.prepare(`
      SELECT operation, description, request_data, response_data
      FROM operation_logs
      WHERE operation = 'POST /abc/cost-runs'
        AND (request_data LIKE ? OR response_data LIKE ?)
      ORDER BY created_at DESC, rowid DESC
      LIMIT 1
    `).get(`%${costRun.body.data.id}%`, `%${costRun.body.data.id}%`) as any
    expect(costRunLog).toBeTruthy()
    expect(costRunLog.description).toBe('执行ABC成本核算任务')
    expect(JSON.parse(costRunLog.request_data)).toMatchObject({ runType: 'recalculate' })
    expect(JSON.parse(costRunLog.response_data)).toMatchObject({
      id: costRun.body.data.id,
      runType: 'recalculate',
    })

    const dashboard = await request(app)
      .get('/api/v1/abc/dashboard')
      .set('Authorization', `Bearer ${financeToken}`)
    expect(dashboard.status).toBe(200)
    expect(dashboard.body.data.summary.totalCost).toBeGreaterThanOrEqual(Number(abcDetail.total_cost))

    const trend = await request(app)
      .get('/api/v1/abc/slide-cost-trend')
      .set('Authorization', `Bearer ${financeToken}`)
    expect(trend.status).toBe(200)
    // slide-cost-trend 返回 { trend: [...], insightQuality }（与前端 CostTrend res?.trend 契约一致），非裸数组
    expect(trend.body.data.trend.some((row: any) => Number(row.totalCost) >= Number(abcDetail.total_cost))).toBe(true)

    const batchTrace = await request(app)
      .get(`/api/v1/abc/batch-trace/${batch.id}`)
      .set('Authorization', `Bearer ${financeToken}`)
    expect(batchTrace.status).toBe(200)
    expect(batchTrace.body.data.usage.some((item: any) => item.outboundId === outbound.id)).toBe(true)
    expect(batchTrace.body.data.summary.consumedQuantity).toBeGreaterThanOrEqual(6)

    const logs = db.prepare(`
      SELECT operation, request_data, response_data
      FROM operation_logs
      WHERE request_data LIKE ? OR response_data LIKE ?
         OR request_data LIKE ? OR response_data LIKE ?
         OR request_data LIKE ? OR response_data LIKE ?
         OR request_data LIKE ? OR response_data LIKE ?
      ORDER BY created_at ASC
    `).all(
      `%${suffix}%`,
      `%${suffix}%`,
      `%${purchaseOrder.id}%`,
      `%${purchaseOrder.id}%`,
      `%${inbound.id}%`,
      `%${inbound.id}%`,
      `%${outbound.id}%`,
      `%${outbound.id}%`,
    ) as any[]
    const operations = logs.map(row => row.operation)
    expect(operations).toEqual(expect.arrayContaining([
      'POST /suppliers',
      'POST /purchase-orders',
      'POST /inbound',
      'POST /outbound/bom',
    ]))
    expect(logs.some(row => String(row.request_data).includes(purchaseOrder.id))).toBe(true)
    expect(logs.some(row => String(row.response_data).includes(outbound.id))).toBe(true)
  })
})
