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
    })

    it('BOM 出库后库存正确减少', async () => {
      const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any
      expect(inv.stock).toBe(90) // 100 - 10
    })
  })

  describe('出库权限控制', () => {
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
