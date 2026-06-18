process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
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

/** 准备基础数据：分类、供应商、库位、物料 */
function seedBasicData(db: any) {
  db.prepare(`INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)`).run(
    'cat-seed', 'C-SEED', '试剂', 1,
  )
  db.prepare(`INSERT INTO suppliers (id, code, name) VALUES (?, ?, ?)`).run('sup-seed', 'S-SEED', 'Dako')
  db.prepare(`INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)`).run(
    'loc-seed', 'L-SEED', 'A1-01', 'shelf', 'A区',
  )
}

/** 创建测试物料并入库 */
async function createMaterialWithStock(app: any, token: string, db: any, code: string, price: number, stock: number) {
  const matRes = await request(app)
    .post('/api/v1/materials')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code,
      name: `测试物料${code}`,
      spec: '7ml',
      unit: '支',
      categoryId: 'cat-seed',
      supplierId: 'sup-seed',
      price,
      minStock: 1,
      locationId: 'loc-seed',
    })
  expect(matRes.status).toBe(201)
  const materialId = matRes.body.data.id

  // 入库
  const inboundRes = await request(app)
    .post('/api/v1/inbound')
    .set('Authorization', `Bearer ${token}`)
    .send({
      type: 'direct',
      materialId,
      batchNo: `B-${code}`,
      quantity: stock,
      price,
      locationId: 'loc-seed',
      expiryDate: '2027-12-31',
    })
  expect(inboundRes.status).toBe(201)

  return materialId
}

describe('集成测试：BOM 管理', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ({ app, db } = await getApp())
    token = await loginAdmin(app)
    seedBasicData(db)
  })

  describe('BOM CRUD 操作', () => {
    let bomId: string
    let materialId: string

    it('创建 BOM（含物料列表）', async () => {
      materialId = await createMaterialWithStock(app, token, db, 'BOM-M1', 100, 50)

      const res = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `BOM-${Date.now()}`,
          name: 'Ki-67检测',
          version: 'v1',
          type: 'ihc',
          description: 'Ki-67 IHC 检测',
          materials: [
            { materialId, usagePerSample: 1, unit: '支', price: 100 },
          ],
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBeDefined()
      bomId = res.body.data.id
    })

    it('获取 BOM 列表', async () => {
      const res = await request(app)
        .get('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data.list)).toBe(true)
      expect(res.body.data.list.length).toBeGreaterThan(0)
    })

    it('启停 BOM 只更新状态且支持状态筛选', async () => {
      const before = await request(app)
        .get(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)
      expect(before.status).toBe(200)

      const patch = await request(app)
        .patch(`/api/v1/boms/${bomId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'inactive' })

      expect(patch.status).toBe(200)
      expect(patch.body.success).toBe(true)
      expect(patch.body.data.status).toBe('inactive')

      const detail = await request(app)
        .get(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)
      expect(detail.body.data.status).toBe('inactive')
      expect(detail.body.data.version).toBe(before.body.data.version)

      const filtered = await request(app)
        .get('/api/v1/boms?status=inactive')
        .set('Authorization', `Bearer ${token}`)
      expect(filtered.status).toBe(200)
      expect(filtered.body.data.list.some((item: any) => item.id === bomId)).toBe(true)

      await request(app)
        .patch(`/api/v1/boms/${bomId}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'active' })
        .expect(200)
    })

    it('获取 BOM 详情（含物料明细）', async () => {
      const res = await request(app)
        .get(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBe(bomId)
      expect(res.body.data.name).toBe('Ki-67检测')
      expect(Array.isArray(res.body.data.materials)).toBe(true)
      expect(res.body.data.materials.length).toBe(1)
      expect(res.body.data.materials[0].id).toBe(materialId)
    })

    it('更新 BOM（名称 + 物料用量）', async () => {
      const res = await request(app)
        .put(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Ki-67检测-v2',
          materials: [
            { materialId, usagePerSample: 2, unit: '支', price: 100 },
          ],
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.version).toBe('v1.1') // 版本自增

      // 验证更新后的详情
      const detail = await request(app)
        .get(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)
      expect(detail.body.data.name).toBe('Ki-67检测-v2')
      expect(detail.body.data.materials[0].usagePerSample).toBe(2)
    })

    it('BOM 详情返回真实版本快照和变更摘要', async () => {
      const detail = await request(app)
        .get(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(detail.status).toBe(200)
      expect(detail.body.data.versionHistory.length).toBeGreaterThanOrEqual(2)

      const [latest, initial] = detail.body.data.versionHistory
      expect(latest.version).toBe('v1.1')
      expect(latest.isCurrent).toBe(true)
      expect(latest.changeLog).toContain('名称')
      expect(latest.changeLog).toContain('物料用量')
      expect(latest.snapshot.materials[0].usagePerSample).toBe(2)
      expect(latest.diff.changedMaterials[0].materialId).toBe(materialId)
      expect(latest.diff.changedMaterials[0].before.usagePerSample).toBe(1)
      expect(latest.diff.changedMaterials[0].after.usagePerSample).toBe(2)

      expect(initial.version).toBe('v1.0')
      expect(initial.changeLog).toBe('初始版本')
      expect(initial.snapshot.materials[0].usagePerSample).toBe(1)

      const versionRows = db.prepare('SELECT * FROM bom_versions WHERE bom_id = ? ORDER BY created_at ASC')
        .all(bomId) as any[]
      expect(versionRows.length).toBeGreaterThanOrEqual(2)
    })

    it('追溯更新 BOM 时返回历史出库影响范围并写入版本历史', async () => {
      const projectRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `BOM-IMPACT-${Date.now()}`,
          name: 'BOM影响范围项目',
          type: 'ihc',
          bomId,
          status: 'active',
        })
      expect(projectRes.status).toBe(201)

      const outbound = await request(app)
        .post('/api/v1/outbound/bom')
        .set('Authorization', `Bearer ${token}`)
        .send({ projectId: projectRes.body.data.id, bomId, sampleCount: 1 })
      expect(outbound.status).toBe(201)

      const update = await request(app)
        .put(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Ki-67检测-v3',
          effectiveScope: 'retroactive',
          materials: [
            { materialId, usagePerSample: 3, unit: '支', price: 100 },
          ],
        })
      expect(update.status).toBe(200)
      expect(update.body.data.effectiveScope).toBe('retroactive')
      expect(update.body.data.impactSummary.totalOutboundCount).toBeGreaterThanOrEqual(1)
      expect(update.body.data.impactSummary.months[0].yearMonth).toMatch(/^\d{4}-\d{2}$/)
      expect(update.body.data.retroactiveRuns.length).toBeGreaterThanOrEqual(1)
      expect(update.body.data.retroactiveRuns[0].status).toBe('completed')
      expect(update.body.data.retroactiveRuns[0].runType).toBe('bom_retroactive_recalculate')
      expect(update.body.data.requiresRecalculation).toBe(false)

      const abcDetail = db.prepare(`
        SELECT cost_status, cost_run_id, source_snapshot
        FROM outbound_abc_details
        WHERE outbound_id = ?
      `).get(outbound.body.data.id) as any
      expect(abcDetail.cost_status).toBe('recalculated')
      expect(abcDetail.cost_run_id).toBe(update.body.data.retroactiveRuns[0].id)
      expect(JSON.parse(abcDetail.source_snapshot).bomSnapshot.version).toBe('v1.2')

      const runRecord = db.prepare('SELECT run_type, status FROM cost_runs WHERE id = ?')
        .get(update.body.data.retroactiveRuns[0].id) as any
      expect(runRecord.run_type).toBe('bom_retroactive_recalculate')
      expect(runRecord.status).toBe('completed')

      const detail = await request(app)
        .get(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)
      expect(detail.body.data.versionHistory[0].version).toBe('v1.2')
      expect(detail.body.data.versionHistory[0].effectiveScope).toBe('retroactive')
      expect(detail.body.data.versionHistory[0].impactSummary.totalOutboundCount).toBeGreaterThanOrEqual(1)
      expect(detail.body.data.versionHistory[0].snapshot.materials[0].usagePerSample).toBe(3)
    })

    it('删除不存在的 BOM 返回 404', async () => {
      const res = await request(app)
        .delete('/api/v1/boms/non-existent-id')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)
    })

    it('创建 BOM 缺少必填字段返回 400', async () => {
      const res = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: '缺少code和type' })

      expect(res.status).toBe(400)
    })
  })

  describe('BOM 标准成本计算', () => {
    let bomId: string
    let materialId: string

    it('创建 BOM 后自动计算标准成本', async () => {
      materialId = await createMaterialWithStock(app, token, db, 'COST-M1', 200, 30)

      const res = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `COST-BOM-${Date.now()}`,
          name: '成本测试BOM',
          type: 'ihc',
          materials: [
            { materialId, usagePerSample: 1, unit: '支', price: 200 },
          ],
        })

      expect(res.status).toBe(201)
      bomId = res.body.data.id

      // 查询数据库验证标准成本已写入
      const bom = db.prepare('SELECT * FROM boms WHERE id = ?').get(bomId) as any
      expect(bom).toBeDefined()
      // standard_total_cost 应大于 0（包含材料 + 人工 + 设备等）
      expect(bom.standard_total_cost).toBeGreaterThan(0)
    })

    it('更新 BOM 后重新计算标准成本', async () => {
      const oldBom = db.prepare('SELECT standard_total_cost FROM boms WHERE id = ?').get(bomId) as any
      const oldCost = oldBom.standard_total_cost

      // 更新物料用量翻倍
      await request(app)
        .put(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: '成本测试BOM-v2',
          materials: [
            { materialId, usagePerSample: 2, unit: '支', price: 200 },
          ],
        })

      const newBom = db.prepare('SELECT standard_total_cost FROM boms WHERE id = ?').get(bomId) as any
      // 标准成本应增加（材料用量翻倍）
      expect(newBom.standard_total_cost).toBeGreaterThan(oldCost)
    })
  })

  describe('BOM 事务完整性', () => {
    it('创建 BOM 时物料不存在应回滚整个事务', async () => {
      const res = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `TXN-${Date.now()}`,
          name: '事务测试BOM',
          type: 'ihc',
          materials: [
            { materialId: 'non-existent-material', usagePerSample: 1, unit: '支', price: 100 },
          ],
        })

      expect(res.status).toBe(404)
      expect(res.body.success).toBe(false)

      // 验证 BOM 主记录也未创建
      const count = db.prepare("SELECT COUNT(*) as cnt FROM boms WHERE name = '事务测试BOM'").get() as any
      expect(count.cnt).toBe(0)
    })

    it('更新 BOM 时物料不存在应回滚', async () => {
      // 先创建一个有效 BOM
      const materialId = await createMaterialWithStock(app, token, db, 'TXN-M1', 100, 10)
      const createRes = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `TXN-UPD-${Date.now()}`,
          name: '事务更新测试',
          type: 'ihc',
          materials: [
            { materialId, usagePerSample: 1, unit: '支', price: 100 },
          ],
        })
      const bomId = createRes.body.data.id

      // 尝试用不存在的物料更新
      const updateRes = await request(app)
        .put(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          materials: [
            { materialId: 'fake-material-id', usagePerSample: 1, unit: '支', price: 100 },
          ],
        })

      expect(updateRes.status).toBe(404)

      // 验证原物料未被删除
      const detail = await request(app)
        .get(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)
      expect(detail.body.data.materials.length).toBe(1)
      expect(detail.body.data.materials[0].id).toBe(materialId)
    })
  })

  describe('BOM 软删除', () => {
    it('删除 BOM 后列表不可见但数据库仍存在', async () => {
      const materialId = await createMaterialWithStock(app, token, db, 'DEL-M1', 100, 10)

      const createRes = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `DEL-${Date.now()}`,
          name: '待删除BOM',
          type: 'ihc',
          materials: [
            { materialId, usagePerSample: 1, unit: '支', price: 100 },
          ],
        })
      const bomId = createRes.body.data.id

      // 删除
      const deleteRes = await request(app)
        .delete(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)
      expect(deleteRes.status).toBe(200)

      // 列表不可见
      const listRes = await request(app)
        .get('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
      const found = listRes.body.data.list.find((b: any) => b.id === bomId)
      expect(found).toBeUndefined()

      // 数据库仍存在（软删除）
      const row = db.prepare('SELECT * FROM boms WHERE id = ?').get(bomId) as any
      expect(row).toBeDefined()
      expect(row.is_deleted).toBe(1)
    })
  })

  describe('BOM 品牌池（groupName）', () => {
    it('创建含品牌池分组的 BOM', async () => {
      const m1 = await createMaterialWithStock(app, token, db, 'GP-M1', 100, 20)
      const m2 = await createMaterialWithStock(app, token, db, 'GP-M2', 120, 20)

      const res = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `GRP-${Date.now()}`,
          name: '品牌池BOM',
          type: 'ihc',
          materials: [
            { materialId: m1, usagePerSample: 1, unit: '支', price: 100, groupName: 'Ki-67组' },
            { materialId: m2, usagePerSample: 1, unit: '支', price: 120, groupName: 'Ki-67组' },
          ],
        })

      expect(res.status).toBe(201)
      const bomId = res.body.data.id

      const detail = await request(app)
        .get(`/api/v1/boms/${bomId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(detail.body.data.materials.length).toBe(2)
      expect(detail.body.data.materials[0].groupName).toBe('Ki-67组')
      expect(detail.body.data.materials[1].groupName).toBe('Ki-67组')
    })
  })
})
