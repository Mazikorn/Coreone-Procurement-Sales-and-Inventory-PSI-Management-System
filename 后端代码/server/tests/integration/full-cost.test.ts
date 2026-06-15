process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect } from 'vitest'
import request from 'supertest'

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

describe('集成测试：全成本计算端到端', () => {
  it('完整流程：BOM扩展配额 → 设备/工时/间接成本 → 出库 → 全成本报表验证', async () => {
    const { app, db } = await getApp()
    const token = await loginAdmin(app)

    // ========== 1. 准备基础数据 ==========
    db.prepare(`INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)`).run(
      'cat1', 'C001', '试剂', 1,
    )
    db.prepare(`INSERT INTO suppliers (id, code, name) VALUES (?, ?, ?)`).run('sup1', 'S001', 'Dako')
    db.prepare(`INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)`).run(
      'loc1', 'L001', 'A1-01', 'shelf', 'A区',
    )

    // ========== 2. 创建设备 ==========
    const equipmentRes = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'EQ001',
        name: '免疫组化染色机',
        model: 'AutoStainer X1',
        manufacturer: 'Leica',
        purchasePrice: 150000,
        purchaseDate: '2024-01-01',
        depreciableLifeYears: 5,
        residualValue: 5000,
        depreciationMethod: 'straight_line',
        status: 'active',
      })
    expect(equipmentRes.status).toBe(201)
    const equipmentId = equipmentRes.body.data.id

    // 注：标准工时已由数据库初始化预置，无需创建

    // ========== 3. 创建物料（特异性试剂 + 质控品） ==========
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

    const qcMaterialRes = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'M002',
        name: '阳性对照片',
        spec: '10片',
        unit: '片',
        categoryId: 'cat1',
        supplierId: 'sup1',
        price: 300,
        minStock: 2,
        locationId: 'loc1',
      })
    expect(qcMaterialRes.status).toBe(201)
    const qcMaterialId = qcMaterialRes.body.data.id

    // ========== 5. 入库 ==========
    const inboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'direct',
        materialId,
        batchNo: 'B001',
        quantity: 50,
        price: 100,
        locationId: 'loc1',
        expiryDate: '2026-12-31',
      })
    expect(inboundRes.status).toBe(201)

    // 入库QC物料
    const qcInboundRes = await request(app)
      .post('/api/v1/inbound')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'direct',
        materialId: qcMaterialId,
        batchNo: 'B-QC-001',
        quantity: 30,
        price: 300,
        locationId: 'loc1',
        expiryDate: '2026-12-31',
      })
    expect(qcInboundRes.status).toBe(201)

    // ========== 6. 创建BOM（含扩展配额） ==========
    const bomRes = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'BOM001',
        name: 'Ki-67检测',
        version: 'v1',
        type: 'ihc',
        description: 'Ki-67 IHC检测含全成本',
        materials: [
          { materialId, usagePerSample: 1, unit: '支', price: 100 },
        ],
        generalReagents: [],
        generalConsumables: [],
        qualityControls: [
          { materialId: qcMaterialId, usagePerBatch: 1, unit: '片', coversSamples: 10, allocationType: 'per_batch' },
        ],
        equipmentTemplates: [
          { equipmentId, usageMinutes: 120 },
        ],
      })
    expect(bomRes.status).toBe(201)
    const bomId = bomRes.body.data.id

    // ========== 7. 创建项目 ==========
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

    // ========== 8. BOM出库 ==========
    const outboundRes = await request(app)
      .post('/api/v1/outbound/bom')
      .set('Authorization', `Bearer ${token}`)
      .send({
        projectId,
        bomId,
        sampleCount: 10,
        remark: '全成本测试',
      })
    expect(outboundRes.status).toBe(201)
    const materialCost = outboundRes.body.data.totalCost

    // ========== 9. 创建间接成本中心和分摊记录 ==========
    const costCenterRes = await request(app)
      .post('/api/v1/indirect-costs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: 'CC001',
        name: '房租',
        costType: 'rent',
        monthlyAmount: 15000,
        allocationBase: 'sample_count',
        status: 'active',
      })
    expect(costCenterRes.status).toBe(201)
    const costCenterId = costCenterRes.body.data.id

    // 获取当前年月
    const now = new Date()
    const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

    const allocationRes = await request(app)
      .post(`/api/v1/indirect-costs/${costCenterId}/allocations`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        yearMonth,
        totalAmount: 15000,
        allocationBaseValue: 100,
      })
    expect(allocationRes.status).toBe(201)

    // ========== 10. 验证全成本报表 ==========
    const reportRes = await request(app)
      .get('/api/v1/reports/full-cost-by-project')
      .set('Authorization', `Bearer ${token}`)
    expect(reportRes.status).toBe(200)
    expect(reportRes.body.success).toBe(true)

    const materialCostRes = await request(app)
      .get('/api/v1/reports/cost-by-material')
      .set('Authorization', `Bearer ${token}`)
    expect(materialCostRes.status).toBe(200)
    expect(materialCostRes.body.success).toBe(true)

    const inboundStatsRes = await request(app)
      .get('/api/v1/inbound/stats')
      .set('Authorization', `Bearer ${token}`)
    expect(inboundStatsRes.status).toBe(200)
    expect(inboundStatsRes.body.success).toBe(true)

    const purchaseOrdersRes = await request(app)
      .get('/api/v1/purchase-orders')
      .set('Authorization', `Bearer ${token}`)
    expect(purchaseOrdersRes.status).toBe(200)
    expect(purchaseOrdersRes.body.success).toBe(true)

    const summary = reportRes.body.data.summary
    const projects = reportRes.body.data.projects

    // 验证项目存在
    const projectCost = projects.find((p: any) => p.id === projectId)
    expect(projectCost).toBeDefined()

    // 验证材料成本
    expect(projectCost.materialCost).toBe(materialCost)

    // 验证人工成本：预置标准工时求和
    // all类型：1.5+6+1.5+40=49; ihc类型：7.5; 合计每样本56.5; 10样本=565
    expect(projectCost.laborCost).toBe(565)

    // 验证设备折旧：直线法 (150000-5000)/(5*365*24*60) × 120分钟 × 10 ≈ 66.21
    expect(projectCost.equipmentCost).toBeGreaterThan(50)
    expect(projectCost.equipmentCost).toBeLessThan(100)

    // 验证质控成本：300 / 10 × 10 = 300
    expect(projectCost.qcCost).toBe(300)

    // 验证间接成本：15000 / 100 × 10 = 1500
    expect(projectCost.indirectCost).toBe(1500)

    // 验证总成本 = 五项之和
    const expectedTotal =
      projectCost.materialCost +
      projectCost.laborCost +
      projectCost.equipmentCost +
      projectCost.qcCost +
      projectCost.indirectCost
    expect(projectCost.totalCost).toBeCloseTo(expectedTotal, 2)

    // 验证单样本成本 = 总成本 / 样本数
    expect(projectCost.unitCost).toBeCloseTo(expectedTotal / 10, 2)

    // 验证汇总数据
    expect(summary.totalCost).toBe(expectedTotal)
    expect(summary.totalSamples).toBe(10)
    expect(summary.materialCost).toBe(projectCost.materialCost)
    expect(summary.laborCost).toBe(565)
    expect(summary.qcCost).toBe(300)
    expect(summary.indirectCost).toBe(1500)
  })
})
