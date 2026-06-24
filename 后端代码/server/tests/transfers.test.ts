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

function seedTransferMaterial(db: any, suffix: string) {
  const categoryId = `cat-transfer-${suffix}`
  const materialId = `mat-transfer-${suffix}`
  const fromLocationId = `loc-transfer-from-${suffix}`
  const toLocationId = `loc-transfer-to-${suffix}`
  const batchNo = `BATCH-TF-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-TF-${suffix}`, '调拨测试分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(fromLocationId, `LOC-TF-F-${suffix}`, '调拨来源库位', 'shelf', 'A区')
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(toLocationId, `LOC-TF-T-${suffix}`, '调拨目标库位', 'shelf', 'B区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, price, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-TF-${suffix}`, '调拨测试物料', '1ml', '瓶', categoryId, 12, fromLocationId)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, ?, 0, ?)')
    .run(`inv-transfer-${suffix}`, materialId, 10, fromLocationId)
  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, inbound_id, inbound_price, status)
    VALUES (?, ?, ?, 10, 10, ?, 12, 1)
  `).run(`batch-transfer-${suffix}`, materialId, batchNo, `inbound-transfer-${suffix}`)

  return { materialId, fromLocationId, toLocationId, batchNo }
}

function seedTransferProject(db: any, suffix: string) {
  const projectId = `project-transfer-${suffix}`
  db.prepare('INSERT INTO projects (id, code, name, type, status) VALUES (?, ?, ?, ?, 1)')
    .run(projectId, `PRJ-TF-${suffix}`, '调拨出库测试项目', 'ihc')
  return projectId
}

describe('调拨管理', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('TR-001: 撤销调拨时恢复原库位并保持库存数量不变', async () => {
    const { materialId, fromLocationId, toLocationId, batchNo } = seedTransferMaterial(db, `restore-${Date.now()}`)

    const createRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        batchNo,
        quantity: 10,
        fromLocationId,
        toLocationId,
        remark: '测试调拨',
      })
    expect(createRes.status).toBe(200)

    const afterTransfer = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?').get(materialId) as any
    expect(afterTransfer.stock).toBe(10)
    expect(afterTransfer.location_id).toBe(toLocationId)

    const listRes = await request(app)
      .get('/api/v1/transfers')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 1000 })
    expect(listRes.status).toBe(200)
    const listedRecord = listRes.body.data.list.find((row: any) => row.id === createRes.body.data.id)
    expect(listedRecord).toMatchObject({
      fromLocationId,
      fromLocationName: '调拨来源库位',
      toLocationId,
      toLocationName: '调拨目标库位',
    })

    const deleteRes = await request(app)
      .delete(`/api/v1/transfers/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleteRes.status).toBe(200)

    const afterCancel = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?').get(materialId) as any
    expect(afterCancel.stock).toBe(10)
    expect(afterCancel.location_id).toBe(fromLocationId)
  })

  it('TR-FILTER-001: 调拨列表支持按审计链接 keyword 定位到具体调拨事实', async () => {
    const suffix = `keyword-${Date.now()}`
    const matched = seedTransferMaterial(db, `${suffix}-matched`)
    const other = seedTransferMaterial(db, `${suffix}-other`)

    db.prepare('UPDATE materials SET name = ?, code = ? WHERE id = ?')
      .run('审计深链调拨物料', `MAT-TF-DEEP-${suffix}`, matched.materialId)
    db.prepare('UPDATE materials SET name = ?, code = ? WHERE id = ?')
      .run('其他调拨物料', `MAT-TF-OTHER-${suffix}`, other.materialId)

    const matchedRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: matched.materialId,
        batchNo: matched.batchNo,
        quantity: 2,
        fromLocationId: matched.fromLocationId,
        toLocationId: matched.toLocationId,
        remark: 'TF-DEEP-FACT-001',
      })
    expect(matchedRes.status).toBe(200)

    const otherRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: other.materialId,
        batchNo: other.batchNo,
        quantity: 2,
        fromLocationId: other.fromLocationId,
        toLocationId: other.toLocationId,
        remark: 'TF-DEEP-FACT-OTHER',
      })
    expect(otherRes.status).toBe(200)

    const matchedRecord = db.prepare('SELECT inbound_no FROM inbound_records WHERE id = ?')
      .get(matchedRes.body.data.id) as any

    const byTransferNo = await request(app)
      .get('/api/v1/transfers')
      .query({ page: 1, pageSize: 20, keyword: matchedRecord.inbound_no })
      .set('Authorization', `Bearer ${token}`)

    expect(byTransferNo.status).toBe(200)
    expect(byTransferNo.body.data.list.map((row: any) => row.id)).toEqual([matchedRes.body.data.id])
    expect(byTransferNo.body.data.pagination.total).toBe(1)

    const byBatchNo = await request(app)
      .get('/api/v1/transfers')
      .query({ page: 1, pageSize: 20, keyword: matched.batchNo })
      .set('Authorization', `Bearer ${token}`)

    expect(byBatchNo.status).toBe(200)
    expect(byBatchNo.body.data.list.map((row: any) => row.id)).toEqual([matchedRes.body.data.id])
  })

  it('TR-AUDIT-001: 创建和撤销调拨写入操作日志，支撑库存位置变更审计', async () => {
    const { materialId, fromLocationId, toLocationId, batchNo } = seedTransferMaterial(db, `audit-${Date.now()}`)

    const createRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        batchNo,
        quantity: 3,
        fromLocationId,
        toLocationId,
        remark: '调拨审计测试',
      })
    expect(createRes.status).toBe(200)

    const deleteRes = await request(app)
      .delete(`/api/v1/transfers/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleteRes.status).toBe(200)

    const logs = db.prepare(`
      SELECT username, operation, request_data
      FROM operation_logs
      WHERE request_data LIKE ?
      ORDER BY rowid ASC
    `).all(`%${createRes.body.data.id}%`) as any[]

    expect(logs.map(log => log.operation)).toEqual([
      'POST /transfers/inbound',
      'DELETE /transfers/:id',
    ])
    expect(logs.every(log => log.username === 'admin')).toBe(true)
    expect(JSON.parse(logs[0].request_data)).toMatchObject({
      module: 'transfers',
      id: createRes.body.data.id,
      materialId,
      fromLocationId,
      toLocationId,
      quantity: 3,
    })
  })

  it('TR-002: 拒绝来源库位和目标库位相同的无效调拨', async () => {
    const { materialId, fromLocationId } = seedTransferMaterial(db, `same-${Date.now()}`)

    const res = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        quantity: 1,
        fromLocationId,
        toLocationId: fromLocationId,
        remark: '同库位调拨',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('来源库位和目标库位不能相同')

    const afterRejected = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?').get(materialId) as any
    expect(afterRejected.stock).toBe(10)
    expect(afterRejected.location_id).toBe(fromLocationId)
  })

  it('TR-VALIDATION-001: 调拨拒绝非有限数量，避免异常数量进入库存流转', async () => {
    const { materialId, fromLocationId, toLocationId } = seedTransferMaterial(db, `finite-number-${Date.now()}`)

    const res = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        quantity: 'Infinity',
        fromLocationId,
        toLocationId,
        remark: '非有限数量调拨',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('数量')

    const aggregate = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?').get(materialId) as any
    const targetStock = db.prepare('SELECT stock FROM inventory_locations WHERE material_id = ? AND location_id = ?')
      .get(materialId, toLocationId) as any
    const transferCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM inbound_records
      WHERE type = 'transfer' AND material_id = ? AND is_deleted = 0
    `).get(materialId) as any

    expect(aggregate).toMatchObject({ stock: 10, location_id: fromLocationId })
    expect(targetStock).toBeUndefined()
    expect(transferCount.count).toBe(0)
  })

  it('TR-003: 调拨后物料列表返回库存当前库位而不是旧默认库位', async () => {
    const suffix = `material-location-${Date.now()}`
    const { materialId, fromLocationId, toLocationId, batchNo } = seedTransferMaterial(db, suffix)

    const createRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        batchNo,
        quantity: 10,
        fromLocationId,
        toLocationId,
        remark: '物料当前库位联动测试',
      })
    expect(createRes.status).toBe(200)

    const materialRes = await request(app)
      .get('/api/v1/materials')
      .query({ keyword: `MAT-TF-${suffix}`, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)

    expect(materialRes.status).toBe(200)
    const row = materialRes.body.data.list.find((item: any) => item.id === materialId)
    expect(row).toMatchObject({
      locationId: toLocationId,
      locationName: '调拨目标库位',
    })
  })

  it('TR-004: 部分调拨拆分来源和目标库位库存且撤销后还原', async () => {
    const { materialId, fromLocationId, toLocationId, batchNo } = seedTransferMaterial(db, `partial-${Date.now()}`)

    const res = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        batchNo,
        quantity: 2,
        fromLocationId,
        toLocationId,
        remark: '部分调拨不应整库位迁移',
      })

    expect(res.status).toBe(200)

    const aggregateAfterTransfer = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?').get(materialId) as any
    expect(aggregateAfterTransfer.stock).toBe(10)
    expect(aggregateAfterTransfer.location_id).toBe(fromLocationId)

    const sourceList = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 20, locationId: fromLocationId })
    expect(sourceList.status).toBe(200)
    const sourceRow = sourceList.body.data.list.find((row: any) => row.materialId === materialId)
    expect(sourceRow).toMatchObject({ locationId: fromLocationId, stock: 8, totalStock: 10 })

    const targetList = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 20, locationId: toLocationId })
    expect(targetList.status).toBe(200)
    const targetRow = targetList.body.data.list.find((row: any) => row.materialId === materialId)
    expect(targetRow).toMatchObject({ locationId: toLocationId, stock: 2, totalStock: 10 })
    const batchAfterTransfer = db.prepare(`
      SELECT location_id, remaining
      FROM batch_location_balances
      WHERE material_id = ?
      ORDER BY location_id
    `).all(materialId) as any[]
    expect(batchAfterTransfer).toEqual(expect.arrayContaining([
      expect.objectContaining({ location_id: fromLocationId, remaining: 8 }),
      expect.objectContaining({ location_id: toLocationId, remaining: 2 }),
    ]))

    const deleteRes = await request(app)
      .delete(`/api/v1/transfers/${res.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleteRes.status).toBe(200)

    const sourceAfterCancel = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 20, locationId: fromLocationId })
    expect(sourceAfterCancel.status).toBe(200)
    const restoredSourceRow = sourceAfterCancel.body.data.list.find((row: any) => row.materialId === materialId)
    expect(restoredSourceRow).toMatchObject({ locationId: fromLocationId, stock: 10, totalStock: 10 })

    const targetAfterCancel = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 20, locationId: toLocationId })
    expect(targetAfterCancel.status).toBe(200)
    expect(targetAfterCancel.body.data.list.some((row: any) => row.materialId === materialId)).toBe(false)
    const batchAfterCancel = db.prepare(`
      SELECT location_id, remaining
      FROM batch_location_balances
      WHERE material_id = ?
    `).all(materialId) as any[]
    expect(batchAfterCancel).toEqual([
      expect.objectContaining({ location_id: fromLocationId, remaining: 10 }),
    ])
  })

  it('TR-005: 拒绝缺少来源库位ID的调拨请求', async () => {
    const { materialId, fromLocationId, toLocationId } = seedTransferMaterial(db, `missing-source-id-${Date.now()}`)

    const res = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        quantity: 2,
        fromLocationName: '来源库位文本',
        toLocationId,
        remark: '缺少来源库位ID',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('来源库位')

    const afterRejected = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?').get(materialId) as any
    expect(afterRejected.stock).toBe(10)
    expect(afterRejected.location_id).toBe(fromLocationId)
  })

  it('TR-009: 物料存在可用批次时必须选择调拨批次，避免调拨记录丢失批次事实', async () => {
    const { materialId, fromLocationId, toLocationId } = seedTransferMaterial(db, `missing-batch-${Date.now()}`)

    const res = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        quantity: 2,
        fromLocationId,
        toLocationId,
        remark: '漏选批次调拨',
      })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('BATCH_REQUIRED')

    const aggregate = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?').get(materialId) as any
    const targetStock = db.prepare('SELECT stock FROM inventory_locations WHERE material_id = ? AND location_id = ?')
      .get(materialId, toLocationId) as any
    const transferCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM inbound_records
      WHERE type = 'transfer' AND material_id = ? AND is_deleted = 0
    `).get(materialId) as any

    expect(Number(aggregate.stock)).toBe(10)
    expect(aggregate.location_id).toBe(fromLocationId)
    expect(targetStock).toBeUndefined()
    expect(Number(transferCount.count)).toBe(0)
  })

  it('TR-006: 部分调拨后报废同步扣减库位明细库存', async () => {
    const { materialId, fromLocationId, toLocationId, batchNo } = seedTransferMaterial(db, `scrap-after-partial-${Date.now()}`)

    const transferRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        batchNo,
        quantity: 2,
        fromLocationId,
        toLocationId,
        remark: '部分调拨后报废',
      })
    expect(transferRes.status).toBe(200)

    const scrapRes = await request(app)
      .post('/api/v1/scraps')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        quantity: 3,
        reason: 'damaged',
      })
    expect(scrapRes.status).toBe(200)

    const aggregate = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    expect(aggregate.stock).toBe(7)

    const sourceList = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 20, locationId: fromLocationId })
    expect(sourceList.status).toBe(200)
    const sourceRow = sourceList.body.data.list.find((row: any) => row.materialId === materialId)
    expect(sourceRow).toMatchObject({ locationId: fromLocationId, stock: 5, totalStock: 7 })

    const targetList = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 20, locationId: toLocationId })
    expect(targetList.status).toBe(200)
    const targetRow = targetList.body.data.list.find((row: any) => row.materialId === materialId)
    expect(targetRow).toMatchObject({ locationId: toLocationId, stock: 2, totalStock: 7 })
  })

  it('TR-007: 部分调拨后出库撤销按原扣减库位恢复明细库存', async () => {
    const { materialId, fromLocationId, toLocationId, batchNo } = seedTransferMaterial(db, `outbound-cancel-${Date.now()}`)
    const projectId = seedTransferProject(db, `outbound-cancel-${Date.now()}`)

    const transferRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        batchNo,
        quantity: 2,
        fromLocationId,
        toLocationId,
        remark: '部分调拨后出库撤销',
      })
    expect(transferRes.status).toBe(200)

    const outboundRes = await request(app)
      .post('/api/v1/outbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'project',
        projectId,
        items: [{ materialId, quantity: 9, usage: 'self' }],
        remark: '出库撤销库位恢复测试',
      })
    expect(outboundRes.status).toBe(201)

    const sourceAfterOutbound = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 20, locationId: fromLocationId })
    expect(sourceAfterOutbound.status).toBe(200)
    expect(sourceAfterOutbound.body.data.list.some((row: any) => row.materialId === materialId)).toBe(false)

    const targetAfterOutbound = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 20, locationId: toLocationId })
    expect(targetAfterOutbound.status).toBe(200)
    const remainingTargetRow = targetAfterOutbound.body.data.list.find((row: any) => row.materialId === materialId)
    expect(remainingTargetRow).toMatchObject({ locationId: toLocationId, stock: 1, totalStock: 1 })
    const batchAfterOutbound = db.prepare(`
      SELECT location_id, remaining
      FROM batch_location_balances
      WHERE material_id = ?
      ORDER BY location_id
    `).all(materialId) as any[]
    expect(batchAfterOutbound).toEqual([
      expect.objectContaining({ location_id: toLocationId, remaining: 1 }),
    ])

    const deleteRes = await request(app)
      .delete(`/api/v1/outbound/${outboundRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: '撤销出库测试' })
    expect(deleteRes.status).toBe(200)

    const sourceAfterCancel = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 20, locationId: fromLocationId })
    expect(sourceAfterCancel.status).toBe(200)
    const restoredSourceRow = sourceAfterCancel.body.data.list.find((row: any) => row.materialId === materialId)
    expect(restoredSourceRow).toMatchObject({ locationId: fromLocationId, stock: 8, totalStock: 10 })

    const targetAfterCancel = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
      .query({ page: 1, pageSize: 20, locationId: toLocationId })
    expect(targetAfterCancel.status).toBe(200)
    const restoredTargetRow = targetAfterCancel.body.data.list.find((row: any) => row.materialId === materialId)
    expect(restoredTargetRow).toMatchObject({ locationId: toLocationId, stock: 2, totalStock: 10 })
    const batchAfterOutboundCancel = db.prepare(`
      SELECT location_id, remaining
      FROM batch_location_balances
      WHERE material_id = ?
      ORDER BY location_id
    `).all(materialId) as any[]
    expect(batchAfterOutboundCancel).toEqual(expect.arrayContaining([
      expect.objectContaining({ location_id: fromLocationId, remaining: 8 }),
      expect.objectContaining({ location_id: toLocationId, remaining: 2 }),
    ]))
  })

  it('TR-REF-001: 创建调拨拒绝停用物料、来源库位和目标库位', async () => {
    const inactiveMaterialSeed = seedTransferMaterial(db, `inactive-material-${Date.now()}`)
    const inactiveSourceSeed = seedTransferMaterial(db, `inactive-source-${Date.now()}`)
    const inactiveTargetSeed = seedTransferMaterial(db, `inactive-target-${Date.now()}`)
    db.prepare('UPDATE materials SET status = 0 WHERE id = ?').run(inactiveMaterialSeed.materialId)
    db.prepare('UPDATE locations SET status = 0 WHERE id = ?').run(inactiveSourceSeed.fromLocationId)
    db.prepare('UPDATE locations SET status = 0 WHERE id = ?').run(inactiveTargetSeed.toLocationId)

    const inactiveMaterialRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: inactiveMaterialSeed.materialId,
        batchNo: inactiveMaterialSeed.batchNo,
        quantity: 2,
        fromLocationId: inactiveMaterialSeed.fromLocationId,
        toLocationId: inactiveMaterialSeed.toLocationId,
        remark: '停用物料调拨',
      })

    expect(inactiveMaterialRes.status).toBe(409)
    expect(inactiveMaterialRes.body.error.message).toContain('物料已停用')

    const inactiveSourceRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: inactiveSourceSeed.materialId,
        batchNo: inactiveSourceSeed.batchNo,
        quantity: 2,
        fromLocationId: inactiveSourceSeed.fromLocationId,
        toLocationId: inactiveSourceSeed.toLocationId,
        remark: '停用来源库位调拨',
      })

    expect(inactiveSourceRes.status).toBe(409)
    expect(inactiveSourceRes.body.error.message).toContain('来源库位已停用')

    const inactiveTargetRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: inactiveTargetSeed.materialId,
        batchNo: inactiveTargetSeed.batchNo,
        quantity: 2,
        fromLocationId: inactiveTargetSeed.fromLocationId,
        toLocationId: inactiveTargetSeed.toLocationId,
        remark: '停用目标库位调拨',
      })

    expect(inactiveTargetRes.status).toBe(409)
    expect(inactiveTargetRes.body.error.message).toContain('目标库位已停用')

    const records = db.prepare(`
      SELECT COUNT(*) as count
      FROM inbound_records
      WHERE type = 'transfer' AND material_id IN (?, ?, ?)
    `).get(inactiveMaterialSeed.materialId, inactiveSourceSeed.materialId, inactiveTargetSeed.materialId) as any

    expect(records.count).toBe(0)
  })

  it('TR-BATCH-001: 创建调拨拒绝不存在或不属于该物料的批号并保持库位库存不变', async () => {
    const suffix = `batch-identity-${Date.now()}`
    const { materialId, fromLocationId, toLocationId, batchNo } = seedTransferMaterial(db, suffix)
    const otherSeed = seedTransferMaterial(db, `foreign-batch-${Date.now()}`)
    const insufficientSeed = seedTransferMaterial(db, `insufficient-batch-${Date.now()}`)
    db.prepare('UPDATE batches SET remaining = 1 WHERE material_id = ? AND batch_no = ?')
      .run(insufficientSeed.materialId, insufficientSeed.batchNo)

    const rejectMissingBatchRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        batchNo: `BATCH-TF-MISSING-${suffix}`,
        quantity: 2,
        fromLocationId,
        toLocationId,
        remark: '不存在批号调拨',
      })

    expect(rejectMissingBatchRes.status).toBe(404)
    expect(rejectMissingBatchRes.body.error.message).toContain('调拨批次不存在或不属于该物料')

    const rejectForeignBatchRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        batchNo: otherSeed.batchNo,
        quantity: 2,
        fromLocationId,
        toLocationId,
        remark: '其他物料批号调拨',
      })

    expect(rejectForeignBatchRes.status).toBe(404)
    expect(rejectForeignBatchRes.body.error.message).toContain('调拨批次不存在或不属于该物料')

    const rejectInsufficientBatchRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId: insufficientSeed.materialId,
        batchNo: insufficientSeed.batchNo,
        quantity: 2,
        fromLocationId: insufficientSeed.fromLocationId,
        toLocationId: insufficientSeed.toLocationId,
        remark: '批次余量不足调拨',
      })

    expect(rejectInsufficientBatchRes.status).toBe(422)
    expect(rejectInsufficientBatchRes.body.error.message).toContain('调拨批次库存不足')

    const sourceStock = db.prepare(`
      SELECT stock
      FROM inventory_locations
      WHERE material_id = ? AND location_id = ?
    `).get(materialId, fromLocationId) as any
    const targetStock = db.prepare(`
      SELECT stock
      FROM inventory_locations
      WHERE material_id = ? AND location_id = ?
    `).get(materialId, toLocationId) as any
    const aggregate = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?').get(materialId) as any
    const records = db.prepare(`
      SELECT COUNT(*) as count
      FROM inbound_records
      WHERE type = 'transfer' AND material_id = ? AND is_deleted = 0
    `).get(materialId) as any

    expect(sourceStock).toBeUndefined()
    expect(targetStock).toBeUndefined()
    expect(Number(aggregate.stock)).toBe(10)
    expect(aggregate.location_id).toBe(fromLocationId)
    expect(Number(records.count)).toBe(0)

    const insufficientAggregate = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?')
      .get(insufficientSeed.materialId) as any
    const insufficientTargetStock = db.prepare(`
      SELECT stock
      FROM inventory_locations
      WHERE material_id = ? AND location_id = ?
    `).get(insufficientSeed.materialId, insufficientSeed.toLocationId) as any
    const insufficientRecords = db.prepare(`
      SELECT COUNT(*) as count
      FROM inbound_records
      WHERE type = 'transfer' AND material_id = ? AND is_deleted = 0
    `).get(insufficientSeed.materialId) as any

    expect(Number(insufficientAggregate.stock)).toBe(10)
    expect(insufficientAggregate.location_id).toBe(insufficientSeed.fromLocationId)
    expect(insufficientTargetStock).toBeUndefined()
    expect(Number(insufficientRecords.count)).toBe(0)
  })

  it('TR-008: 总库存足够但来源库位库存不足时拒绝调拨并保持库位明细不变', async () => {
    const suffix = `source-insufficient-${Date.now()}`
    const { materialId, fromLocationId, toLocationId, batchNo } = seedTransferMaterial(db, suffix)
    const extraLocationId = `loc-transfer-extra-${suffix}`
    db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
      .run(extraLocationId, `LOC-TF-X-${suffix}`, '调拨额外目标库位', 'shelf', 'C区')

    const firstTransferRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        batchNo,
        quantity: 8,
        fromLocationId,
        toLocationId,
        remark: '先拆分来源库位库存',
      })
    expect(firstTransferRes.status).toBe(200)

    const rejectRes = await request(app)
      .post('/api/v1/transfers/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        batchNo,
        quantity: 3,
        fromLocationId,
        toLocationId: extraLocationId,
        remark: '来源库位不足但总库存足够',
      })

    expect(rejectRes.status).toBe(422)
    expect(rejectRes.body.error.message).toContain('库存不足')

    const sourceStock = db.prepare(`
      SELECT stock
      FROM inventory_locations
      WHERE material_id = ? AND location_id = ?
    `).get(materialId, fromLocationId) as any
    const targetStock = db.prepare(`
      SELECT stock
      FROM inventory_locations
      WHERE material_id = ? AND location_id = ?
    `).get(materialId, toLocationId) as any
    const extraStock = db.prepare(`
      SELECT stock
      FROM inventory_locations
      WHERE material_id = ? AND location_id = ?
    `).get(materialId, extraLocationId) as any
    const aggregate = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    const records = db.prepare(`
      SELECT COUNT(*) as count
      FROM inbound_records
      WHERE type = 'transfer' AND material_id = ? AND is_deleted = 0
    `).get(materialId) as any

    expect(Number(sourceStock.stock)).toBe(2)
    expect(Number(targetStock.stock)).toBe(8)
    expect(extraStock).toBeUndefined()
    expect(Number(aggregate.stock)).toBe(10)
    expect(Number(records.count)).toBe(1)
  })
})
