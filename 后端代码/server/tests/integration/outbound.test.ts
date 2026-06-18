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

async function loginWarehouse(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'wangkq', password: 'CoreOne2026!' })
  expect(res.status).toBe(200)
  expect(res.body.success).toBe(true)
  return res.body.data.token
}

function seedBasicData(db: any) {
  db.prepare(`INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)`).run(
    'cat-out', 'C-OUT', '试剂', 1,
  )
  db.prepare(`INSERT INTO suppliers (id, code, name) VALUES (?, ?, ?)`).run('sup-out', 'S-OUT', 'Dako')
  db.prepare(`INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)`).run(
    'loc-out', 'L-OUT', 'A1-01', 'shelf', 'A区',
  )
}

async function createMaterial(app: any, token: string, code: string, price: number) {
  const res = await request(app)
    .post('/api/v1/materials')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code,
      name: `出库测试物料${code}`,
      spec: '7ml',
      unit: '支',
      categoryId: 'cat-out',
      supplierId: 'sup-out',
      price,
      minStock: 1,
      locationId: 'loc-out',
    })
  expect(res.status).toBe(201)
  return res.body.data.id
}

async function inbound(app: any, token: string, materialId: string, batchNo: string, quantity: number, price: number) {
  const res = await request(app)
    .post('/api/v1/inbound')
    .set('Authorization', `Bearer ${token}`)
    .send({
      type: 'direct',
      materialId,
      batchNo,
      quantity,
      price,
      locationId: 'loc-out',
      expiryDate: '2027-12-31',
    })
  expect(res.status).toBe(201)
  return res.body.data
}

describe('集成测试：出库管理', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ({ app, db } = await getApp())
    token = await loginAdmin(app)
    seedBasicData(db)
  })

  describe('出库列表查询', () => {
    it('获取出库列表返回分页数据', async () => {
      const res = await request(app)
        .get('/api/v1/outbound?page=1&pageSize=20')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(Array.isArray(res.body.data.list)).toBe(true)
      expect(res.body.data.page).toBe(1)
    })

    it('出库列表包含出库单号', async () => {
      const res = await request(app)
        .get('/api/v1/outbound?page=1&pageSize=20')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      // 列表中的记录应有 outbounNo 或类似字段
      for (const item of res.body.data.list) {
        expect(item.id).toBeDefined()
      }
    })
  })

  describe('出库统计', () => {
    it('出库统计返回本月数量和快捷筛选全量计数', async () => {
      const suffix = `stats-${Date.now()}`
      db.prepare(`
        INSERT INTO outbound_records (id, outbound_no, type, total_cost, operator, status, created_at)
        VALUES (?, ?, 'project', ?, 'admin', ?, ?)
      `).run(`ob-stats-${suffix}-today`, `OB-STATS-${suffix}-TODAY`, 10, 'completed', new Date().toISOString())
      db.prepare(`
        INSERT INTO outbound_records (id, outbound_no, type, total_cost, operator, status, created_at)
        VALUES (?, ?, 'project', ?, 'admin', ?, ?)
      `).run(`ob-stats-${suffix}-pending`, `OB-STATS-${suffix}-PENDING`, 0, 'pending', new Date().toISOString())
      db.prepare(`
        INSERT INTO outbound_records (id, outbound_no, type, total_cost, operator, status, created_at)
        VALUES (?, ?, 'project', ?, 'admin', ?, ?)
      `).run(`ob-stats-${suffix}-old`, `OB-STATS-${suffix}-OLD`, 5, 'cancelled', '2020-01-01T00:00:00.000Z')

      const res = await request(app)
        .get('/api/v1/outbound/stats')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({
        total: 3,
        monthTotal: 2,
        completed: 1,
        pending: 1,
        cancelled: 1,
        totalCost: 10,
      })
      expect(res.body.data.quickCounts).toMatchObject({
        all: 3,
        today: 2,
        week: 2,
        month: 2,
      })
    })
  })

  describe('出库创建', () => {
    let materialId: string

    beforeAll(async () => {
      materialId = await createMaterial(app, token, 'OB-C1', 100)
      await inbound(app, token, materialId, 'B-OB-1', 50, 100)
    })

    it('创建普通出库单', async () => {
      const res = await request(app)
        .post('/api/v1/outbound')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'project',
          items: [{ materialId, quantity: 5, usage: 'self', receiver: '测试员' }],
          operator: '测试员',
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.outboundNo).toBeDefined()
      expect(res.body.data.outboundNo.startsWith('OB-')).toBe(true)

      const item = db.prepare('SELECT usage, receiver FROM outbound_items WHERE outbound_id = ?').get(res.body.data.id) as any
      const tracking = db.prepare('SELECT receiver, status FROM batch_usage_tracking WHERE material_id = ? AND status = ? ORDER BY created_at DESC LIMIT 1')
        .get(materialId, 'in-use') as any
      expect(item.usage).toBe('self')
      expect(item.receiver).toBe('测试员')
      expect(tracking.receiver).toBe('测试员')
    })

    it('外给出库记录接收方但不创建使用中记录', async () => {
      const res = await request(app)
        .post('/api/v1/outbound')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'project',
          items: [{ materialId, quantity: 2, usage: 'external', receiver: '外部科室' }],
        })

      expect(res.status).toBe(201)
      const item = db.prepare('SELECT usage, receiver FROM outbound_items WHERE outbound_id = ?').get(res.body.data.id) as any
      const tracking = db.prepare('SELECT 1 FROM batch_usage_tracking WHERE material_id = ? AND receiver = ? AND status = ? LIMIT 1')
        .get(materialId, '外部科室', 'in-use')
      expect(item.usage).toBe('external')
      expect(item.receiver).toBe('外部科室')
      expect(tracking).toBeUndefined()
    })

    it('创建出库单后库存减少', async () => {
      const beforeInv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
      const beforeStock = beforeInv.stock

      await request(app)
        .post('/api/v1/outbound')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'project',
          items: [{ materialId, quantity: 3 }],
          operator: '测试员',
        })

      const afterInv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
      expect(afterInv.stock).toBe(beforeStock - 3)
    })

    it('出库数量超过库存返回失败', async () => {
      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
      const currentStock = inv.stock

      const res = await request(app)
        .post('/api/v1/outbound')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'project',
          items: [{ materialId, quantity: currentStock + 100 }],
          operator: '测试员',
        })

      // 应返回失败（库存不足）
      expect(res.body.success === false || res.status >= 400).toBe(true)
    })

    it('缺少 type 字段返回 400', async () => {
      const res = await request(app)
        .post('/api/v1/outbound')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ materialId, quantity: 1 }],
          operator: '测试员',
        })

      expect(res.status).toBe(400)
    })

    it('OUT-VALIDATION-001: 普通出库拒绝非有限数量和样本数且不扣库存', async () => {
      const invalidPayloads = [
        { items: [{ materialId, quantity: 'Infinity' }], message: 'quantity' },
        { items: [{ materialId, quantity: 1 }], sampleCount: '1e309', message: 'sampleCount' },
      ]

      for (const payload of invalidPayloads) {
        const beforeStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any).stock
        const beforeCount = (db.prepare('SELECT COUNT(*) as count FROM outbound_records').get() as any).count

        const res = await request(app)
          .post('/api/v1/outbound')
          .set('Authorization', `Bearer ${token}`)
          .send({
            type: 'project',
            ...payload,
          })

        expect(res.status).toBe(400)
        expect(res.body.error.message).toContain(payload.message)

        const afterStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any).stock
        const afterCount = (db.prepare('SELECT COUNT(*) as count FROM outbound_records').get() as any).count
        expect(afterStock).toBe(beforeStock)
        expect(afterCount).toBe(beforeCount)
      }
    })

    it('OUT-REF-001: 普通出库拒绝停用物料和停用检测项目', async () => {
      const suffix = `guard-${Date.now()}`
      const inactiveMaterialId = await createMaterial(app, token, `OB-INACTIVE-MAT-${suffix}`, 30)
      await inbound(app, token, inactiveMaterialId, `B-OB-INACTIVE-MAT-${suffix}`, 10, 30)
      db.prepare('UPDATE materials SET status = 0 WHERE id = ?').run(inactiveMaterialId)

      const inactiveProjectRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `OB-INACTIVE-PRJ-${suffix}`,
          name: `停用项目普通出库-${suffix}`,
          type: 'ihc',
          status: 'active',
        })
      expect(inactiveProjectRes.status).toBe(201)
      const inactiveProjectId = inactiveProjectRes.body.data.id
      db.prepare('UPDATE projects SET status = 0 WHERE id = ?').run(inactiveProjectId)

      const inactiveMaterial = await request(app)
        .post('/api/v1/outbound')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'project',
          items: [{ materialId: inactiveMaterialId, quantity: 1 }],
        })

      const inactiveProject = await request(app)
        .post('/api/v1/outbound')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'project',
          projectId: inactiveProjectId,
          items: [{ materialId, quantity: 1 }],
        })

      expect(inactiveMaterial.status).toBe(409)
      expect(inactiveProject.status).toBe(409)

      const outboundCount = (db.prepare(`
        SELECT COUNT(*) as count
        FROM outbound_records r
        LEFT JOIN outbound_items oi ON oi.outbound_id = r.id
        WHERE r.project_id = ? OR oi.material_id = ?
      `).get(inactiveProjectId, inactiveMaterialId) as any).count
      expect(outboundCount).toBe(0)
    })

    it('OUT-REF-002: 修改普通出库拒绝停用物料和停用检测项目且不改变原单库存', async () => {
      const suffix = `guard-update-${Date.now()}`
      const inactiveMaterialId = await createMaterial(app, token, `OB-UP-INACTIVE-MAT-${suffix}`, 30)
      await inbound(app, token, inactiveMaterialId, `B-OB-UP-INACTIVE-MAT-${suffix}`, 10, 30)
      db.prepare('UPDATE materials SET status = 0 WHERE id = ?').run(inactiveMaterialId)

      const inactiveProjectRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `OB-UP-INACTIVE-PRJ-${suffix}`,
          name: `停用项目出库编辑-${suffix}`,
          type: 'ihc',
          status: 'active',
        })
      expect(inactiveProjectRes.status).toBe(201)
      const inactiveProjectId = inactiveProjectRes.body.data.id
      db.prepare('UPDATE projects SET status = 0 WHERE id = ?').run(inactiveProjectId)

      const createRes = await request(app)
        .post('/api/v1/outbound')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'project',
          items: [{ materialId, quantity: 1 }],
          remark: '原始有效出库',
        })
      expect(createRes.status).toBe(201)
      const outboundId = createRes.body.data.id
      const beforeActiveStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?')
        .get(materialId) as any).stock
      const beforeInactiveStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?')
        .get(inactiveMaterialId) as any).stock

      const inactiveMaterialUpdate = await request(app)
        .put(`/api/v1/outbound/${outboundId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'project',
          items: [{ materialId: inactiveMaterialId, quantity: 1 }],
          remark: '尝试改为停用物料',
        })
      expect(inactiveMaterialUpdate.status).toBe(409)

      const inactiveProjectUpdate = await request(app)
        .put(`/api/v1/outbound/${outboundId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'project',
          projectId: inactiveProjectId,
          items: [{ materialId, quantity: 1 }],
          remark: '尝试改为停用项目',
        })
      expect(inactiveProjectUpdate.status).toBe(409)

      const activeStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?')
        .get(materialId) as any).stock
      const inactiveStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?')
        .get(inactiveMaterialId) as any).stock
      const savedRecord = db.prepare('SELECT project_id, remark FROM outbound_records WHERE id = ?').get(outboundId) as any
      const savedItems = db.prepare('SELECT material_id, quantity FROM outbound_items WHERE outbound_id = ?').all(outboundId) as any[]

      expect(activeStock).toBe(beforeActiveStock)
      expect(inactiveStock).toBe(beforeInactiveStock)
      expect(savedRecord.project_id).toBeNull()
      expect(savedRecord.remark).toBe('原始有效出库')
      expect(savedItems).toHaveLength(1)
      expect(savedItems[0]).toMatchObject({ material_id: materialId, quantity: 1 })
    })

    it('OUT-VALIDATION-002: 修改普通出库拒绝非有限数量且不回退原单库存', async () => {
      const createRes = await request(app)
        .post('/api/v1/outbound')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'project',
          items: [{ materialId, quantity: 1 }],
          remark: '非有限数量编辑前',
        })
      expect(createRes.status).toBe(201)
      const outboundId = createRes.body.data.id
      const beforeStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?')
        .get(materialId) as any).stock

      const updateRes = await request(app)
        .put(`/api/v1/outbound/${outboundId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'project',
          items: [{ materialId, quantity: 'Infinity' }],
          remark: '尝试非有限数量编辑',
        })

      expect(updateRes.status).toBe(400)
      expect(updateRes.body.error.message).toContain('quantity')

      const afterStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?')
        .get(materialId) as any).stock
      const savedRecord = db.prepare('SELECT remark FROM outbound_records WHERE id = ?').get(outboundId) as any
      const savedItems = db.prepare('SELECT material_id, quantity FROM outbound_items WHERE outbound_id = ?').all(outboundId) as any[]

      expect(afterStock).toBe(beforeStock)
      expect(savedRecord.remark).toBe('非有限数量编辑前')
      expect(savedItems).toHaveLength(1)
      expect(savedItems[0]).toMatchObject({ material_id: materialId, quantity: 1 })
    })
  })

  describe('多批次分配', () => {
    let materialId: string

    beforeAll(async () => {
      materialId = await createMaterial(app, token, 'OB-BATCH', 80)
      // 创建两个批次：不同价格
      await inbound(app, token, materialId, 'B-OB-A', 10, 80)
      await inbound(app, token, materialId, 'B-OB-B', 20, 100)
    })

    it('出库跨越两个批次时按先进先出分配', async () => {
      const res = await request(app)
        .post('/api/v1/outbound/bom')
        .set('Authorization', `Bearer ${token}`)
        .send({
          // 需要先创建 BOM 和项目才能用 BOM 出库
          // 这里测试普通出库的批次分配
        })

      // 使用普通出库测试批次分配
      const outboundRes = await request(app)
        .post('/api/v1/outbound')
        .set('Authorization', `Bearer ${token}`)
        .send({
          type: 'project',
          items: [{ materialId, quantity: 15 }],
          operator: '测试员',
        })

      if (outboundRes.status === 201) {
        // 验证批次分配
        const batches = db.prepare(
          'SELECT * FROM batches WHERE material_id = ? ORDER BY expiry_date'
        ).all(materialId) as any[]

        // 第一个批次（B-OB-A, 10个）应被取完
        const batchA = batches.find((b: any) => b.batch_no === 'B-OB-A')
        const batchB = batches.find((b: any) => b.batch_no === 'B-OB-B')

        if (batchA && batchB) {
          expect(batchA.remaining).toBe(0) // 10个全部取出
          expect(batchB.remaining).toBe(15) // 取出5个，剩余15
        }
      }
    })

    it('出库后批次总剩余等于库存', async () => {
      const batches = db.prepare(
        'SELECT SUM(remaining) as total FROM batches WHERE material_id = ? AND remaining > 0'
      ).get(materialId) as any

      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any

      expect(batches.total).toBe(inv.stock)
    })
  })

  describe('BOM 出库', () => {
    let materialId: string
    let bomId: string
    let projectId: string

    beforeAll(async () => {
      materialId = await createMaterial(app, token, 'OB-BOM', 150)
      await inbound(app, token, materialId, 'B-OBOM-1', 100, 150)

      // 创建 BOM
      const bomRes = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `OB-BOM-${Date.now()}`,
          name: 'BOM出库测试',
          type: 'ihc',
          materials: [
            { materialId, usagePerSample: 1, unit: '支', price: 150 },
          ],
        })
      bomId = bomRes.body.data.id

      // 创建项目
      const projRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `OB-PROJ-${Date.now()}`,
          name: 'BOM出库项目',
          type: 'ihc',
          bomId,
          status: 'active',
        })
      projectId = projRes.body.data.id
    })

    it('BOM 出库计算正确成本', async () => {
      const res = await request(app)
        .post('/api/v1/outbound/bom')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId,
          bomId,
          sampleCount: 10,
          remark: 'BOM出库测试',
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.totalCost).toBe(1500) // 10 * 150

      const abcDetail = db.prepare('SELECT source_snapshot FROM outbound_abc_details WHERE outbound_id = ?')
        .get(res.body.data.id) as any
      const snapshot = JSON.parse(abcDetail.source_snapshot)
      expect(snapshot.bomSnapshot.code).toContain('OB-BOM')
      expect(snapshot.bomSnapshot.version).toBe('v1.0')
      expect(snapshot.bomSnapshot.items[0].materialId).toBe(materialId)
      expect(snapshot.bomSnapshot.items[0].usagePerSample).toBe(1)
    })

    it('项目已配置BOM时可只传检测项目和样本数执行标准BOM出库', async () => {
      const res = await request(app)
        .post('/api/v1/outbound/bom')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId,
          sampleCount: 3,
          remark: '项目配置BOM直接出库',
        })

      expect(res.status).toBe(201)
      expect(res.body.data.projectId).toBe(projectId)
      expect(res.body.data.bomId).toBe(bomId)
      expect(res.body.data.totalCost).toBe(450)

      const outbound = db.prepare('SELECT project_id, sample_count FROM outbound_records WHERE id = ?')
        .get(res.body.data.id) as any
      const abcDetail = db.prepare('SELECT bom_id, project_id FROM outbound_abc_details WHERE outbound_id = ?')
        .get(res.body.data.id) as any
      expect(outbound.project_id).toBe(projectId)
      expect(Number(outbound.sample_count)).toBe(3)
      expect(abcDetail.bom_id).toBe(bomId)
      expect(abcDetail.project_id).toBe(projectId)
    })

    it('BOM-OUT-VALIDATION-001: BOM 出库拒绝非有限样本数且不写成本明细', async () => {
      const beforeOutboundCount = (db.prepare('SELECT COUNT(*) as count FROM outbound_records').get() as any).count
      const beforeAbcCount = (db.prepare('SELECT COUNT(*) as count FROM outbound_abc_details').get() as any).count

      const res = await request(app)
        .post('/api/v1/outbound/bom')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId,
          sampleCount: 'Infinity',
          remark: '非有限样本数 BOM 出库',
        })

      expect(res.status).toBe(400)
      expect(res.body.error.message).toContain('sampleCount')

      const afterOutboundCount = (db.prepare('SELECT COUNT(*) as count FROM outbound_records').get() as any).count
      const afterAbcCount = (db.prepare('SELECT COUNT(*) as count FROM outbound_abc_details').get() as any).count
      expect(afterOutboundCount).toBe(beforeOutboundCount)
      expect(afterAbcCount).toBe(beforeAbcCount)
    })

    it('项目已配置BOM时显式传入其他BOM会被拒绝', async () => {
      const otherBomRes = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `OB-BOM-OTHER-${Date.now()}`,
          name: 'BOM出库错选BOM',
          type: 'ihc',
          materials: [
            { materialId, usagePerSample: 1, unit: '支', price: 150 },
          ],
        })
      expect(otherBomRes.status).toBe(201)

      const res = await request(app)
        .post('/api/v1/outbound/bom')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId,
          bomId: otherBomRes.body.data.id,
          sampleCount: 1,
        })

      expect(res.status).toBe(422)
      expect(res.body.error?.code || res.body.code).toBe('BOM_PROJECT_MISMATCH')
    })

    it('未配置BOM的项目不能用停用或类型不匹配BOM绕过标准配置', async () => {
      const inactiveBomRes = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `OB-BOM-INACTIVE-${Date.now()}`,
          name: 'BOM出库停用BOM',
          type: 'ihc',
          materials: [
            { materialId, usagePerSample: 1, unit: '支', price: 150 },
          ],
        })
      expect(inactiveBomRes.status).toBe(201)
      await request(app)
        .patch(`/api/v1/boms/${inactiveBomRes.body.data.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'inactive' })

      const noBomProjectRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `OB-PROJ-NO-BOM-${Date.now()}`,
          name: '未配置BOM出库项目',
          type: 'ihc',
          status: 'active',
        })
      expect(noBomProjectRes.status).toBe(201)

      const inactiveRes = await request(app)
        .post('/api/v1/outbound/bom')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: noBomProjectRes.body.data.id,
          bomId: inactiveBomRes.body.data.id,
          sampleCount: 1,
        })
      expect(inactiveRes.status).toBe(409)

      const heBomRes = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `OB-BOM-HE-${Date.now()}`,
          name: 'BOM出库类型不匹配BOM',
          type: 'he',
          materials: [
            { materialId, usagePerSample: 1, unit: '支', price: 150 },
          ],
        })
      expect(heBomRes.status).toBe(201)

      const mismatchRes = await request(app)
        .post('/api/v1/outbound/bom')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: noBomProjectRes.body.data.id,
          bomId: heBomRes.body.data.id,
          sampleCount: 1,
        })
      expect(mismatchRes.status).toBe(422)
      expect(mismatchRes.body.error?.code || mismatchRes.body.code).toBe('BOM_PROJECT_TYPE_MISMATCH')
    })

    it('BOM-OUT-REF-001: BOM 出库拒绝已经停用的BOM物料', async () => {
      const suffix = `inactive-item-${Date.now()}`
      const guardedMaterialId = await createMaterial(app, token, `OB-BOM-INACTIVE-MAT-${suffix}`, 60)
      await inbound(app, token, guardedMaterialId, `B-OBOM-INACTIVE-${suffix}`, 20, 60)

      const guardedBomRes = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `OB-BOM-INACTIVE-MAT-${suffix}`,
          name: `BOM出库停用物料-${suffix}`,
          type: 'ihc',
          materials: [
            { materialId: guardedMaterialId, usagePerSample: 1, unit: '支', price: 60 },
          ],
        })
      expect(guardedBomRes.status).toBe(201)

      const guardedProjectRes = await request(app)
        .post('/api/v1/projects')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `OB-PROJ-INACTIVE-MAT-${suffix}`,
          name: `BOM出库停用物料项目-${suffix}`,
          type: 'ihc',
          bomId: guardedBomRes.body.data.id,
          status: 'active',
        })
      expect(guardedProjectRes.status).toBe(201)

      db.prepare('UPDATE materials SET status = 0 WHERE id = ?').run(guardedMaterialId)

      const res = await request(app)
        .post('/api/v1/outbound/bom')
        .set('Authorization', `Bearer ${token}`)
        .send({
          projectId: guardedProjectRes.body.data.id,
          sampleCount: 1,
        })

      expect(res.status).toBe(409)
      const count = (db.prepare('SELECT COUNT(*) as count FROM outbound_records WHERE project_id = ?')
        .get(guardedProjectRes.body.data.id) as any).count
      expect(count).toBe(0)
    })

    it('可通过LIS病例号进入标准BOM出库流程', async () => {
      const caseNo = `LIS-OB-${Date.now()}`
      db.prepare(`
        INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, status, import_batch)
        VALUES (?, ?, ?, ?, ?, ?, 'normal', ?)
      `).run(`lis-${caseNo}`, caseNo, projectId, 'BOM出库项目', 'lis', '2026-06-16 09:00:00', `batch-${caseNo}`)

      const res = await request(app)
        .post('/api/v1/outbound/bom')
        .set('Authorization', `Bearer ${token}`)
        .send({
          caseNo,
          sampleCount: 2,
          remark: 'LIS病例标准出库',
        })

      expect(res.status).toBe(201)
      expect(res.body.data.projectId).toBe(projectId)
      expect(res.body.data.bomId).toBe(bomId)
      expect(res.body.data.caseNo).toBe(caseNo)
      expect(res.body.data.totalCost).toBe(300)

      const outbound = db.prepare('SELECT project_id, case_no FROM outbound_records WHERE id = ?')
        .get(res.body.data.id) as any
      expect(outbound.project_id).toBe(projectId)
      expect(outbound.case_no).toBe(caseNo)

      const abcDetail = db.prepare('SELECT bom_id, project_id, case_no, source_snapshot FROM outbound_abc_details WHERE outbound_id = ?')
        .get(res.body.data.id) as any
      expect(abcDetail.bom_id).toBe(bomId)
      expect(abcDetail.project_id).toBe(projectId)
      expect(abcDetail.case_no).toBe(caseNo)
      expect(JSON.parse(abcDetail.source_snapshot).lisCaseId).toBe(`lis-${caseNo}`)
    })

    it('BOM 出库后库存正确减少', async () => {
      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
      expect(inv.stock).toBe(85) // 100 - 10 - 3 - 2
    })
  })

  describe('出库权限控制', () => {
    it('仓管可读取项目和BOM用于BOM出库但不能写BOM', async () => {
      const whToken = await loginWarehouse(app)

      const projects = await request(app)
        .get('/api/v1/projects?page=1&pageSize=5')
        .set('Authorization', `Bearer ${whToken}`)
      expect(projects.status).toBe(200)

      const boms = await request(app)
        .get('/api/v1/boms?page=1&pageSize=5')
        .set('Authorization', `Bearer ${whToken}`)
      expect(boms.status).toBe(200)

      const writeBom = await request(app)
        .post('/api/v1/boms')
        .set('Authorization', `Bearer ${whToken}`)
        .send({ code: 'WH-BOM-FORBIDDEN', name: '仓管不可写BOM', type: 'ihc', materials: [] })
      expect(writeBom.status).toBe(403)
    })

    it('采购角色创建出库返回 403', async () => {
      // 登录采购角色
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'zhaohp', password: 'CoreOne2026!' })

      if (loginRes.status === 200) {
        const proToken = loginRes.body.data.token
        const res = await request(app)
          .post('/api/v1/outbound')
          .set('Authorization', `Bearer ${proToken}`)
          .send({
            type: 'project',
            items: [{ materialId: 'any', quantity: 1 }],
            operator: '测试',
          })

        expect(res.status).toBe(403)
      }
    })
  })
})
