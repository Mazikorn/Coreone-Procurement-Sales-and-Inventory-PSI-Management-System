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

async function loginUser(app: any, username: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password: 'CoreOne2026!' })

  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedTrackingBatch(db: any, suffix: string) {
  const categoryId = `cat-depletion-${suffix}`
  const materialId = `mat-depletion-${suffix}`
  const locationId = `loc-depletion-${suffix}`
  const inboundId = `inbound-depletion-${suffix}`
  const batchNo = `BATCH-DPL-${suffix}`
  const trackingId = `tracking-depletion-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-DPL-${suffix}`, '耗尽测试分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-DPL-${suffix}`, '耗尽测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, price, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-DPL-${suffix}`, '耗尽测试物料', '1ml', 'ml', categoryId, 12, locationId)
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, inbound_id, inbound_price, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `).run(`batch-depletion-${suffix}`, materialId, batchNo, 10, 10, inboundId, 12)
  db.prepare(`
    INSERT INTO batch_usage_tracking
      (id, material_id, material_name, batch, spec, total_qty, remaining, unit, start_date, expected_days, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in-use')
  `).run(trackingId, materialId, '耗尽测试物料', batchNo, '1ml', 10, 3, 'ml', '2026-06-01', 10)

  return { trackingId, materialId, batchNo }
}

function latestOperationLog(db: any, operation: string, needle: string) {
  return db.prepare(`
    SELECT *
    FROM operation_logs
    WHERE operation = ?
      AND (request_data LIKE ? OR response_data LIKE ?)
    ORDER BY created_at DESC
    LIMIT 1
  `).get(operation, `%${needle}%`, `%${needle}%`) as any
}

describe('消耗记录', () => {
  let app: any
  let db: any
  let token: string
  let warehouseToken: string
  let financeToken: string
  let pathologistToken: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
    warehouseToken = await loginUser(app, 'wangkq')
    financeToken = await loginUser(app, 'sunli')
    pathologistToken = await loginUser(app, 'liuyf')
  })

  it('DP-001: 确认耗尽时忽略请求体伪造operator，使用登录用户并同步批次状态', async () => {
    const { trackingId, materialId, batchNo } = seedTrackingBatch(db, `${Date.now()}`)

    const res = await request(app)
      .post(`/api/v1/depletion/tracking/${trackingId}/deplete`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        remain_qty: 1,
        deplete_type: 'normal',
        deplete_reason: '测试耗尽',
        operator: 'forged-user',
      })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)

    const depletion = db.prepare('SELECT operator, remain_qty FROM batch_depletion WHERE id = ?').get(res.body.data.id) as any
    const tracking = db.prepare('SELECT status FROM batch_usage_tracking WHERE id = ?').get(trackingId) as any
    const batch = db.prepare('SELECT remaining, status FROM batches WHERE material_id = ? AND batch_no = ?').get(materialId, batchNo) as any

    expect(depletion.operator).toBe('admin')
    expect(depletion.remain_qty).toBe(1)
    expect(tracking.status).toBe('depleted')
    expect(batch.remaining).toBe(1)
    expect(batch.status).toBe(2)

    const auditLog = latestOperationLog(db, 'POST /depletion/tracking/:id/deplete', trackingId)
    expect(auditLog).toBeTruthy()
    expect(auditLog.username).toBe('admin')
    expect(JSON.parse(auditLog.request_data)).toMatchObject({
      module: 'depletion',
      trackingId,
      batchNo,
      remainQty: 1,
      depleteType: 'normal',
      depleteReason: '测试耗尽',
    })
    expect(JSON.parse(auditLog.response_data)).toMatchObject({
      id: res.body.data.id,
      trackingId,
      beforeStatus: 'in-use',
      afterStatus: 'depleted',
      beforeRemaining: 3,
      afterRemaining: 1,
    })
  })

  it('DP-002: 使用中列表使用 in-use 状态，剩余量调整接口真实更新记录', async () => {
    const suffix = `remain-${Date.now()}`
    const { trackingId } = seedTrackingBatch(db, suffix)

    const listRes = await request(app)
      .get('/api/v1/depletion/tracking?status=in-use')
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.list.some((item: any) => item.id === trackingId)).toBe(true)

    const updateRes = await request(app)
      .put(`/api/v1/depletion/tracking/${trackingId}/remain`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remaining: 2, reason: '盘点修正' })

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.success).toBe(true)

    const tracking = db.prepare('SELECT remaining, status FROM batch_usage_tracking WHERE id = ?').get(trackingId) as any
    expect(tracking.remaining).toBe(2)
    expect(tracking.status).toBe('in-use')

    const auditLog = latestOperationLog(db, 'PUT /depletion/tracking/:id/remain', trackingId)
    expect(auditLog).toBeTruthy()
    expect(auditLog.username).toBe('admin')
    expect(JSON.parse(auditLog.request_data)).toMatchObject({
      module: 'depletion',
      trackingId,
      reason: '盘点修正',
      remaining: 2,
    })
    expect(JSON.parse(auditLog.response_data)).toMatchObject({
      trackingId,
      beforeRemaining: 3,
      afterRemaining: 2,
      status: 'in-use',
    })
  })

  it('DP-007: 仓管可执行使用中批次调整和确认耗尽，财务/医生只读', async () => {
    const suffix = `role-boundary-${Date.now()}`
    const { trackingId, materialId, batchNo } = seedTrackingBatch(db, suffix)

    const warehouseList = await request(app)
      .get('/api/v1/depletion/tracking?status=in-use')
      .set('Authorization', `Bearer ${warehouseToken}`)
    expect(warehouseList.status).toBe(200)
    expect(warehouseList.body.data.list.some((item: any) => item.id === trackingId)).toBe(true)

    const financeList = await request(app)
      .get('/api/v1/depletion/tracking?status=in-use')
      .set('Authorization', `Bearer ${financeToken}`)
    expect(financeList.status).toBe(200)

    const pathologistList = await request(app)
      .get('/api/v1/depletion/tracking?status=in-use')
      .set('Authorization', `Bearer ${pathologistToken}`)
    expect(pathologistList.status).toBe(200)

    const financeWrite = await request(app)
      .put(`/api/v1/depletion/tracking/${trackingId}/remain`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ remaining: 2, reason: '财务不应直接调整批次余量' })
    expect(financeWrite.status).toBe(403)

    const pathologistWrite = await request(app)
      .post(`/api/v1/depletion/tracking/${trackingId}/deplete`)
      .set('Authorization', `Bearer ${pathologistToken}`)
      .send({ remain_qty: 1, deplete_type: 'normal', deplete_reason: '医生不应直接确认耗尽' })
    expect(pathologistWrite.status).toBe(403)

    const warehouseUpdate = await request(app)
      .put(`/api/v1/depletion/tracking/${trackingId}/remain`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ remaining: 2, reason: '仓管盘点修正' })
    expect(warehouseUpdate.status).toBe(200)

    const warehouseDeplete = await request(app)
      .post(`/api/v1/depletion/tracking/${trackingId}/deplete`)
      .set('Authorization', `Bearer ${warehouseToken}`)
      .send({ remain_qty: 1, deplete_type: 'normal', deplete_reason: '仓管确认正常用完' })
    expect(warehouseDeplete.status).toBe(200)

    const depletion = db.prepare('SELECT operator, remain_qty FROM batch_depletion WHERE id = ?').get(warehouseDeplete.body.data.id) as any
    const batch = db.prepare('SELECT remaining, status FROM batches WHERE material_id = ? AND batch_no = ?').get(materialId, batchNo) as any
    expect(depletion.operator).toBe('wangkq')
    expect(depletion.remain_qty).toBe(1)
    expect(batch.remaining).toBe(1)
    expect(batch.status).toBe(2)
  })

  it('DP-003: 创建使用中记录时剩余量不能超过领用总量', async () => {
    const suffix = `create-invalid-${Date.now()}`
    const categoryId = `cat-depletion-${suffix}`
    const materialId = `mat-depletion-${suffix}`
    const locationId = `loc-depletion-${suffix}`
    const batchNo = `BATCH-DPL-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
      .run(categoryId, `CAT-DPL-${suffix}`, '耗尽测试分类', 1)
    db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
      .run(locationId, `LOC-DPL-${suffix}`, '耗尽测试库位', 'shelf', 'A区')
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, location_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(materialId, `MAT-DPL-${suffix}`, '耗尽测试物料', '1ml', 'ml', categoryId, 12, locationId)

    const res = await request(app)
      .post('/api/v1/depletion/tracking')
      .set('Authorization', `Bearer ${token}`)
      .send({
        material_id: materialId,
        material_name: '耗尽测试物料',
        batch: batchNo,
        spec: '1ml',
        total_qty: 10,
        remaining: 11,
        unit: 'ml',
        start_date: '2026-06-01',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('不能大于领用总量')

    const created = db.prepare('SELECT id FROM batch_usage_tracking WHERE material_id = ? AND batch = ?').get(materialId, batchNo)
    expect(created).toBeUndefined()
  })

  it('DP-006: 创建使用中记录写入操作审计，仓管可回看领用批次来源', async () => {
    const suffix = `create-audit-${Date.now()}`
    const categoryId = `cat-depletion-${suffix}`
    const materialId = `mat-depletion-${suffix}`
    const locationId = `loc-depletion-${suffix}`
    const batchNo = `BATCH-DPL-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
      .run(categoryId, `CAT-DPL-${suffix}`, '耗尽审计分类', 1)
    db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
      .run(locationId, `LOC-DPL-${suffix}`, '耗尽审计库位', 'shelf', 'A区')
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, location_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(materialId, `MAT-DPL-${suffix}`, '耗尽审计物料', '1ml', 'ml', categoryId, 12, locationId)

    const res = await request(app)
      .post('/api/v1/depletion/tracking')
      .set('Authorization', `Bearer ${token}`)
      .send({
        material_id: materialId,
        material_name: '耗尽审计物料',
        batch: batchNo,
        spec: '1ml',
        total_qty: 10,
        remaining: 8,
        unit: 'ml',
        start_date: '2026-06-01',
        expected_days: 15,
        usage: '免疫组化日常领用',
        receiver: '张三',
      })

    expect(res.status).toBe(200)

    const auditLog = latestOperationLog(db, 'POST /depletion/tracking', res.body.data.id)
    expect(auditLog).toBeTruthy()
    expect(auditLog.username).toBe('admin')
    expect(JSON.parse(auditLog.request_data)).toMatchObject({
      module: 'depletion',
      materialId,
      materialName: '耗尽审计物料',
      batchNo,
      totalQty: 10,
      remaining: 8,
      usage: '免疫组化日常领用',
      receiver: '张三',
    })
    expect(JSON.parse(auditLog.response_data)).toMatchObject({
      id: res.body.data.id,
      status: 'in-use',
    })
  })

  it('DP-004: 剩余量调整必须有原因且不能超过领用总量', async () => {
    const suffix = `remain-invalid-${Date.now()}`
    const { trackingId } = seedTrackingBatch(db, suffix)

    const missingReason = await request(app)
      .put(`/api/v1/depletion/tracking/${trackingId}/remain`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remaining: 2 })
    expect(missingReason.status).toBe(400)
    expect(missingReason.body.error.message).toContain('调整原因必填')

    const tooLarge = await request(app)
      .put(`/api/v1/depletion/tracking/${trackingId}/remain`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remaining: 11, reason: '录入错误' })
    expect(tooLarge.status).toBe(400)
    expect(tooLarge.body.error.message).toContain('不能大于领用总量')

    const tracking = db.prepare('SELECT remaining FROM batch_usage_tracking WHERE id = ?').get(trackingId) as any
    expect(tracking.remaining).toBe(3)
  })

  it('DP-005: 确认耗尽时剩余量不能超过领用总量', async () => {
    const suffix = `deplete-invalid-${Date.now()}`
    const { trackingId, materialId, batchNo } = seedTrackingBatch(db, suffix)

    const res = await request(app)
      .post(`/api/v1/depletion/tracking/${trackingId}/deplete`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        remain_qty: 11,
        deplete_type: 'normal',
        deplete_reason: '异常剩余',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('不能大于领用总量')

    const tracking = db.prepare('SELECT status FROM batch_usage_tracking WHERE id = ?').get(trackingId) as any
    const batch = db.prepare('SELECT remaining, status FROM batches WHERE material_id = ? AND batch_no = ?').get(materialId, batchNo) as any
    expect(tracking.status).toBe('in-use')
    expect(batch.remaining).toBe(10)
    expect(batch.status).toBe(1)
  })
})
