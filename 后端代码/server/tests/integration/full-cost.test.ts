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
  it('REPORT-STRUCTURE-001: 成本结构不因项目后续软删除而丢失历史材料成本', async () => {
    const { app, db } = await getApp()
    const token = await loginAdmin(app)
    const suffix = Date.now()
    const projectId = `structure-deleted-project-${suffix}`
    const outboundId = `structure-deleted-out-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, is_deleted)
      VALUES (?, ?, '已删除但有成本结构历史项目', 'ihc', 0)
    `).run(projectId, `STRUCT-PROJECT-${suffix}`)
    db.prepare(`
      INSERT INTO outbound_records (
        id, outbound_no, type, project_id, total_cost, sample_count,
        operator, status, created_at, is_deleted
      )
      VALUES (?, ?, 'project', ?, 220, 2, 'admin', 'completed', '2031-08-10T09:00:00', 0)
    `).run(outboundId, `STRUCT-OUT-${suffix}`, projectId)
    db.prepare('UPDATE projects SET is_deleted = 1 WHERE id = ?').run(projectId)

    const res = await request(app)
      .get('/api/v1/reports/cost-structure?startDate=2031-08-01&endDate=2031-08-31')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const material = res.body.data.structure.find((item: any) => item.costType === 'material')
    expect(material).toMatchObject({
      costType: 'material',
      amount: 220,
    })
    expect(res.body.data.totalCost).toBeGreaterThanOrEqual(220)

    db.prepare('UPDATE outbound_records SET is_deleted = 1 WHERE id = ?').run(outboundId)
    db.prepare('UPDATE projects SET is_deleted = 1 WHERE id = ?').run(projectId)
  })

  it('REPORT-STRUCTURE-002: 成本结构不因BOM后续软删除而丢失历史设备成本', async () => {
    const { app, db } = await getApp()
    const token = await loginAdmin(app)
    const suffix = Date.now()
    const bomId = `structure-deleted-bom-${suffix}`
    const projectId = `structure-bom-project-${suffix}`
    const outboundId = `structure-bom-out-${suffix}`

    db.prepare(`
      INSERT INTO boms (
        id, code, name, version, type, standard_equipment_cost, status, is_deleted
      )
      VALUES (?, ?, '已删除但有设备成本历史BOM', 'v1', 'ihc', 8, 1, 0)
    `).run(bomId, `STRUCT-BOM-${suffix}`)
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, is_deleted)
      VALUES (?, ?, 'BOM软删除成本结构历史项目', 'ihc', ?, 0)
    `).run(projectId, `STRUCT-BOM-PROJECT-${suffix}`, bomId)
    db.prepare(`
      INSERT INTO outbound_records (
        id, outbound_no, type, project_id, total_cost, sample_count,
        operator, status, created_at, is_deleted
      )
      VALUES (?, ?, 'bom', ?, 120, 3, 'admin', 'completed', '2031-09-10T09:00:00', 0)
    `).run(outboundId, `STRUCT-BOM-OUT-${suffix}`, projectId)
    db.prepare('UPDATE boms SET is_deleted = 1 WHERE id = ?').run(bomId)

    const res = await request(app)
      .get('/api/v1/reports/cost-structure?startDate=2031-09-01&endDate=2031-09-30')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const equipment = res.body.data.structure.find((item: any) => item.costType === 'equipment')
    expect(equipment).toMatchObject({
      costType: 'equipment',
      amount: 24,
    })

    db.prepare('UPDATE outbound_records SET is_deleted = 1 WHERE id = ?').run(outboundId)
    db.prepare('UPDATE boms SET is_deleted = 1 WHERE id = ?').run(bomId)
  })

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

    // 验证 BOM 标准材料成本可用于运营差异分析：直接材料 100 + 质控批次用量 300 = 400
    expect(projectCost.standardMaterialCost).toBe(400)
    expect(projectCost.standardLaborCost).toBe(56.5)
    expect(projectCost.standardEquipmentCost).toBeGreaterThan(5)
    expect(projectCost.standardTotalCost).toBeGreaterThan(projectCost.standardMaterialCost)

    // 验证汇总数据
    expect(summary.totalCost).toBe(expectedTotal)
    expect(summary.totalSamples).toBe(10)
    expect(summary.materialCost).toBe(projectCost.materialCost)
    expect(summary.laborCost).toBe(565)
    expect(summary.qcCost).toBe(300)
    expect(summary.indirectCost).toBe(1500)

    // 验证成本结构按出库记录所属项目类型和月份计算，而不是把所有工时类型/月份平均后套到总样本数。
    const structureRes = await request(app)
      .get('/api/v1/reports/cost-structure')
      .set('Authorization', `Bearer ${token}`)
    expect(structureRes.status).toBe(200)
    const structure = structureRes.body.data.structure
    expect(structure.find((item: any) => item.costType === 'material')?.amount).toBe(materialCost)
    expect(structure.find((item: any) => item.costType === 'labor')?.amount).toBe(565)
    expect(structure.find((item: any) => item.costType === 'indirect')?.amount).toBe(1500)

    // 验证成本差异分析按项目维度使用完整实际成本，而不是只拿材料成本和全标准成本比较。
    const projectVarianceRes = await request(app)
      .get('/api/v1/reports/cost-variance?compareType=project')
      .set('Authorization', `Bearer ${token}`)
    expect(projectVarianceRes.status).toBe(200)
    const projectVariance = projectVarianceRes.body.data.items.find((item: any) => item.projectId === projectId)
    expect(projectVariance).toBeDefined()
    expect(projectVariance.materialActual).toBe(materialCost)
    expect(projectVariance.laborActual).toBe(565)
    expect(projectVariance.qcActual).toBe(300)
    expect(projectVariance.indirectActual).toBe(1500)
    expect(projectVariance.totalActual).toBeCloseTo(expectedTotal, 2)
    expect(projectVariance.materialStandard).toBe(4000)
    expect(projectVariance.laborStandard).toBe(565)
    expect(projectVariance.totalStandard).toBeGreaterThan(projectVariance.totalActual)

    // 验证月份维度真正按月份聚合，而不是仍然按项目返回。
    const monthVarianceRes = await request(app)
      .get('/api/v1/reports/cost-variance?compareType=month')
      .set('Authorization', `Bearer ${token}`)
    expect(monthVarianceRes.status).toBe(200)
    const monthVariance = monthVarianceRes.body.data.items.find((item: any) => item.projectId === yearMonth)
    expect(monthVariance).toBeDefined()
    expect(monthVariance.projectName).toBe(`${yearMonth} 月`)
    expect(monthVariance.month).toBe(yearMonth)
    expect(monthVariance.sampleCount).toBe(10)
    expect(monthVariance.totalActual).toBeCloseTo(expectedTotal, 2)

    // 验证物料维度按出库明细聚合实际与标准耗材成本。
    const materialVarianceRes = await request(app)
      .get('/api/v1/reports/cost-variance?compareType=material')
      .set('Authorization', `Bearer ${token}`)
    expect(materialVarianceRes.status).toBe(200)
    const materialVariance = materialVarianceRes.body.data.items.find((item: any) => item.projectId === materialId)
    expect(materialVariance).toBeDefined()
    expect(materialVariance.projectName).toBe('Ki-67抗体')
    expect(materialVariance.unit).toBe('支')
    expect(materialVariance.sampleCount).toBe(10)
    expect(materialVariance.materialActual).toBe(1000)
    expect(materialVariance.materialStandard).toBe(1000)
    expect(materialVariance.totalVariance).toBe(0)
  })
})
