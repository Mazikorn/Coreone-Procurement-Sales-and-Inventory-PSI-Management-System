process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect } from 'vitest'
import request from 'supertest'

// 延迟导入 app，确保 DATABASE_PATH 已设置
const getApp = async () => {
  const { default: app } = await import('../../src/app.js')
  const { getDatabase } = await import('../../src/database/DatabaseManager.js')
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

describe('集成测试：出库流程与成本核算', () => {
  it('完整流程：多批次入库 → BOM/项目 → 跨批次出库 → 修改/删除 → 品牌池替代', async () => {
    const { app, db } = await getApp()
    const token = await loginAdmin(app)

    // ========== 准备基础数据 ==========
    db.prepare(`INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)`).run(
      'cat1', 'C001', '试剂', 1,
    )
    db.prepare(`INSERT INTO suppliers (id, code, name) VALUES (?, ?, ?)`).run('sup1', 'S001', 'Dako')
    db.prepare(`INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)`).run(
      'loc1', 'L001', 'A1-01', 'shelf', 'A区',
    )

    // ========== 流程1 + 场景A：多批次入库 → 建BOM → 建项目 → 跨批次出库 ==========

    // 1. 创建物料
    const materialRes = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'M001',
        name: 'Ki-67抗体',
        spec: '7ml',
        unit: '支',
        categoryId: 'cat1',
        supplierId: 'sup1',
        price: 100,
        minStock: 5,
        locationId: 'loc1',
      })
    expect(materialRes.status).toBe(201)
    const materialId = materialRes.body.data.id

    // 2. 入库：两个批次（场景A）
    const inboundA = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'direct',
        materialId,
        batchNo: 'B-A',
        quantity: 10,
        price: 100,
        locationId: 'loc1',
        expiryDate: '2026-06-01',
      })
    expect(inboundA.status).toBe(201)

    const inboundB = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'direct',
        materialId,
        batchNo: 'B-B',
        quantity: 20,
        price: 120,
        locationId: 'loc1',
        expiryDate: '2026-07-01',
      })
    expect(inboundB.status).toBe(201)

    // 验证库存
    const inventoryRes = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${token}`)
    expect(inventoryRes.status).toBe(200)
    const inventoryRows = inventoryRes.body.data.list.filter((i: any) => i.materialId === materialId)
    expect(inventoryRows).toHaveLength(2)
    expect(inventoryRows.reduce((sum: number, row: any) => sum + Number(row.stock || 0), 0)).toBe(30)

    // 3. 创建 BOM
    const bomRes = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'BOM001',
        name: 'Ki-67检测',
        version: 'v1',
        type: 'ihc',
        description: 'Ki-67 IHC检测',
        materials: [
          { materialId, usagePerSample: 1, unit: '支', price: 100 },
        ],
      })
    expect(bomRes.status).toBe(201)
    const bomId = bomRes.body.data.id

    // 4. 创建项目并关联 BOM
    const projectRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'P001',
        name: 'Ki-67项目',
        type: 'ihc',
        bomId,
        status: 'active',
      })
    expect(projectRes.status).toBe(201)
    const projectId = projectRes.body.data.id

    // 5. BOM 出库 25个（跨越两个批次）
    const outboundRes = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectId,
        bomId,
        sampleCount: 25,
        remark: '测试出库',
      })
    expect(outboundRes.status).toBe(201)
    const outboundId = outboundRes.body.data.id
    expect(outboundRes.body.data.totalCost).toBe(10 * 100 + 15 * 120) // 2800

    // 验证出库记录存在于列表中
    const outboundList = await request(app)
      .get('/api/v1/outbound')
      .set('Authorization', `Bearer ${token}`)
    expect(outboundList.status).toBe(200)
    const createdRecord = outboundList.body.data.list.find((r: any) => r.id === outboundId)
    expect(createdRecord).toBeDefined()

    // 验证批次库存：A批次=0，B批次=5
    const batchRows = db.prepare('SELECT * FROM batches WHERE material_id = ? ORDER BY expiry_date').all(materialId) as any[]
    expect(batchRows[0].remaining).toBe(0)
    expect(batchRows[1].remaining).toBe(5)

    // 验证库存总剩余
    const invAfter = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    expect(invAfter.stock).toBe(5)

    // 6. 查看成本报表
    const reportRes = await request(app)
      .get('/api/v1/reports/cost-by-project')
      .set('Authorization', `Bearer ${token}`)
    expect(reportRes.status).toBe(200)
    const projectCost = reportRes.body.data.projects.find((p: any) => p.id === projectId)
    expect(projectCost?.totalCost).toBe(2800)
    expect(projectCost?.sampleCount).toBe(25) // SUM(sample_count)，即实际样本数

    // ========== 场景C：BOM出库不可编辑；普通项目出库可编辑并重算 ==========

    const immutableUpdateRes = await request(app)
      .put(`/api/v1/outbound/${outboundId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'project',
        items: [{ materialId, quantity: 15 }],
        remark: '试图编辑BOM出库',
      })
    expect(immutableUpdateRes.status).toBe(409)
    expect(immutableUpdateRes.body.error.code).toBe('BOM_OUTBOUND_IMMUTABLE')

    const directOutboundRes = await request(app)
      .post('/api/v1/outbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'project',
        items: [{ materialId, quantity: 3 }],
        remark: '普通项目出库编辑基线',
      })
    expect(directOutboundRes.status).toBe(201)
    const directOutboundId = directOutboundRes.body.data.id

    const directUpdateRes = await request(app)
      .put(`/api/v1/outbound/${directOutboundId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [{ materialId, quantity: 2 }],
        remark: '普通项目出库修改数量',
      })
    expect(directUpdateRes.status).toBe(200)

    expect(directUpdateRes.body.data.totalCost).toBe(2 * 120)

    // 验证批次库存
    const batchAfterDirectUpdate = db.prepare('SELECT * FROM batches WHERE material_id = ? ORDER BY expiry_date').all(materialId) as any[]
    expect(batchAfterDirectUpdate[0].remaining).toBe(0)
    expect(batchAfterDirectUpdate[1].remaining).toBe(3)

    const deleteDirectRes = await request(app)
      .delete(`/api/v1/outbound/${directOutboundId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleteDirectRes.status).toBe(200)

    const batchAfterDirectDelete = db.prepare('SELECT * FROM batches WHERE material_id = ? ORDER BY expiry_date').all(materialId) as any[]
    expect(batchAfterDirectDelete[0].remaining).toBe(0)
    expect(batchAfterDirectDelete[1].remaining).toBe(5)

    // ========== 场景D：删除BOM出库 → 验证库存和成本恢复 ==========

    const batchAfterUpdate = db.prepare('SELECT * FROM batches WHERE material_id = ? ORDER BY expiry_date').all(materialId) as any[]
    expect(batchAfterUpdate[0].remaining).toBe(0)
    expect(batchAfterUpdate[1].remaining).toBe(5)

    // 删除出库单
    const deleteRes = await request(app)
      .delete(`/api/v1/outbound/${outboundId}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleteRes.status).toBe(200)

    // 验证批次库存恢复：A=10, B=20
    const batchAfterDelete = db.prepare('SELECT * FROM batches WHERE material_id = ? ORDER BY expiry_date').all(materialId) as any[]
    expect(batchAfterDelete[0].remaining).toBe(10)
    expect(batchAfterDelete[1].remaining).toBe(20)

    // 验证库存恢复
    const invAfterDelete = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
    expect(invAfterDelete.stock).toBe(30)

    // 验证成本报表扣除
    const reportAfterDelete = await request(app)
      .get('/api/v1/reports/cost-by-project')
      .set('Authorization', `Bearer ${token}`)
    expect(reportAfterDelete.status).toBe(200)
    const projectCostAfterDelete = reportAfterDelete.body.data.projects.find((p: any) => p.id === projectId)
    expect(projectCostAfterDelete?.totalCost || 0).toBe(0)

    // ========== 流程3：品牌池替代物料出库 ==========

    // 创建第二个物料（替代品牌）
    const mat2Res = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'M002',
        name: 'Ki-67迈新',
        spec: '7ml',
        unit: '支',
        categoryId: 'cat1',
        supplierId: 'sup1',
        price: 120,
        minStock: 5,
        locationId: 'loc1',
      })
    expect(mat2Res.status).toBe(201)
    const material2Id = mat2Res.body.data.id

    // 给第二个物料入库5个
    const inbound2 = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'direct',
        materialId: material2Id,
        batchNo: 'B-M2',
        quantity: 5,
        price: 120,
        locationId: 'loc1',
        expiryDate: '2026-07-01',
      })
    expect(inbound2.status).toBe(201)

    // 创建带品牌池的 BOM：同一分组有两个物料
    const bom2Res = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'BOM002',
        name: 'Ki-67品牌池检测',
        version: 'v1',
        type: 'ihc',
        materials: [
          { materialId, usagePerSample: 1, unit: '支', price: 100, groupName: 'Ki-67组' },
          { materialId: material2Id, usagePerSample: 1, unit: '支', price: 120, groupName: 'Ki-67组' },
        ],
      })
    expect(bom2Res.status).toBe(201)
    const bom2Id = bom2Res.body.data.id

    // 创建项目
    const project2Res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'P002',
        name: '品牌池项目',
        type: 'ihc',
        bomId: bom2Id,
        status: 'active',
      })
    expect(project2Res.status).toBe(201)
    const project2Id = project2Res.body.data.id

    // BOM出库10个：m1/A(2026-06-01)先取10个，成本=10*100=1000
    const outbound2Res = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectId: project2Id,
        bomId: bom2Id,
        sampleCount: 10,
        remark: '品牌池测试',
      })
    expect(outbound2Res.status).toBe(201)
    expect(outbound2Res.body.data.totalCost).toBe(1000)

    // ========== 场景B：Panel 检测总成本 = 各物料之和 ==========

    // 创建通用试剂物料
    const mat3Res = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'M003',
        name: '通用试剂',
        spec: '100ml',
        unit: '瓶',
        categoryId: 'cat1',
        supplierId: 'sup1',
        price: 50,
        minStock: 2,
        locationId: 'loc1',
      })
    expect(mat3Res.status).toBe(201)
    const material3Id = mat3Res.body.data.id

    // 入库通用试剂
    const inbound3 = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'direct',
        materialId: material3Id,
        batchNo: 'B-G1',
        quantity: 50,
        price: 50,
        locationId: 'loc1',
        expiryDate: '2026-12-31',
      })
    expect(inbound3.status).toBe(201)

    // 创建 Panel BOM：4个抗体 + 通用试剂
    const panelBomRes = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'BOM-MMR',
        name: 'MMR四联检',
        version: 'v1',
        type: 'ihc',
        materials: [
          { materialId, usagePerSample: 1, unit: '支', price: 100, groupName: 'MLH1' },
          { materialId: material2Id, usagePerSample: 1, unit: '支', price: 120, groupName: 'PMS2' },
          { materialId: material3Id, usagePerSample: 0.5, unit: '瓶', price: 50, groupName: '通用试剂' },
        ],
      })
    expect(panelBomRes.status).toBe(201)
    const panelBomId = panelBomRes.body.data.id

    // 创建 Panel 项目
    const panelProjectRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'P-MMR',
        name: 'MMR项目',
        type: 'ihc',
        bomId: panelBomId,
        status: 'active',
      })
    expect(panelProjectRes.status).toBe(201)
    const panelProjectId = panelProjectRes.body.data.id

    // Panel 出库 1 个样本
    const panelOutboundRes = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectId: panelProjectId,
        bomId: panelBomId,
        sampleCount: 1,
        remark: 'Panel测试',
      })
    expect(panelOutboundRes.status).toBe(201)

    // 总成本：M001的B-A已用完，取B-B@120；M002取B-M2@120；M003取B-G1@50
    // 1*120 + 1*120 + 0.5*50 = 265
    expect(panelOutboundRes.body.data.totalCost).toBe(265)
  })
})
