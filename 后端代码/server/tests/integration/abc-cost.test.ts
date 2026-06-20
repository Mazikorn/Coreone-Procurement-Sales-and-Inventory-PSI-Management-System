/**
 * ABC 作业成本法集成测试
 * 测试作业中心、成本动因、成本池、BOM作业关联、成本计算等功能
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import app from '../../src/app.js'
import { getDatabase } from '../../src/database/DatabaseManager.js'

// 辅助函数：从响应中提取列表数据
function getItems(res: any): any[] {
  const data = res.body?.data
  if (!data) return []
  if (Array.isArray(data)) return data
  if (data.list) return data.list
  if (data.items) return data.items
  return []
}

describe('ABC 作业成本法', () => {
  let token: string
  let db: any

  beforeAll(async () => {
    db = getDatabase()

    // 登录获取 token
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' })

    token = loginRes.body.data.token
  })

  afterAll(() => {
    // 清理
  })

  describe('作业中心管理', () => {
    let activityCenterId: string
    let activityCenterCode: string

    it('创建作业中心', async () => {
      activityCenterCode = `TEST_${Date.now()}`
      const res = await request(app)
        .post('/api/v1/abc/activity-centers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: activityCenterCode,
          name: '测试标本处理中心',
          description: '用于测试的标本处理中心',
          costDriverType: 'block_count',
          sortOrder: 1,
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
      expect(res.body.data.id).toBeDefined()
      activityCenterId = res.body.data.id
    })

    it('获取作业中心列表', async () => {
      const res = await request(app)
        .get('/api/v1/abc/activity-centers')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const items = getItems(res)
      expect(items.length).toBeGreaterThan(0)
    })

    it('获取作业中心详情', async () => {
      const res = await request(app)
        .get(`/api/v1/abc/activity-centers/${activityCenterId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      expect(res.body.data.code).toBe(activityCenterCode)
    })

    it('更新作业中心', async () => {
      const res = await request(app)
        .put(`/api/v1/abc/activity-centers/${activityCenterId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: '更新后的标本处理中心',
          description: '更新后的描述',
        })

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('删除作业中心', async () => {
      // 先创建一个新的用于删除
      const uniqueCode = `DELETE_${Date.now()}`
      const createRes = await request(app)
        .post('/api/v1/abc/activity-centers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode,
          name: '待删除的作业中心',
          costDriverType: 'slide_count',
        })

      const deleteId = createRes.body.data.id

      const res = await request(app)
        .delete(`/api/v1/abc/activity-centers/${deleteId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('作业中心必须引用启用成本动因，且已有成本池引用时不能删除', async () => {
      const suffix = Date.now()
      const invalidDriver = await request(app)
        .post('/api/v1/abc/activity-centers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `BAD_DRIVER_${suffix}`,
          name: '非法动因作业中心',
          costDriverType: `unknown_driver_${suffix}`,
        })

      expect(invalidDriver.status).toBe(400)
      expect(invalidDriver.body.error.message).toBe('成本动因类型不存在或已停用')

      const createRes = await request(app)
        .post('/api/v1/abc/activity-centers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `POOL_GUARD_${suffix}`,
          name: '成本池引用保护作业中心',
          costDriverType: 'slide_count',
        })
      expect(createRes.status).toBe(201)
      const guardedId = createRes.body.data.id
      db.prepare(`
        INSERT INTO abc_cost_pools (id, activity_center_id, year_month, direct_cost, total_cost, driver_quantity, driver_rate)
        VALUES (?, ?, '2099-01', 100, 100, 10, 10)
      `).run(`pool-${suffix}`, guardedId)

      const deleteGuarded = await request(app)
        .delete(`/api/v1/abc/activity-centers/${guardedId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(deleteGuarded.status).toBe(409)
      expect(deleteGuarded.body.error.message).toBe('作业中心已有成本池记录，不能删除')
    })
  })

  describe('成本动因管理', () => {
    it('创建成本动因', async () => {
      const uniqueCode = `test_slide_${Date.now()}`
      const res = await request(app)
        .post('/api/v1/abc/cost-drivers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: uniqueCode,
          name: '测试切片数',
          unit: '张',
          calculationMethod: 'linear',
          description: '用于测试的成本动因',
        })

      expect(res.status).toBe(201)
      expect(res.body.success).toBe(true)
    })

    it('获取成本动因列表', async () => {
      const res = await request(app)
        .get('/api/v1/abc/cost-drivers')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
      const items = getItems(res)
      expect(items.length).toBeGreaterThan(0)
    })

    it('成本动因被作业中心引用时不能删除', async () => {
      const suffix = Date.now()
      const driverCode = `guard_driver_${suffix}`
      const driverRes = await request(app)
        .post('/api/v1/abc/cost-drivers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: driverCode,
          name: '引用保护动因',
          unit: '次',
          calculationMethod: 'linear',
        })

      expect(driverRes.status).toBe(201)
      const driverId = driverRes.body.data.id

      const centerRes = await request(app)
        .post('/api/v1/abc/activity-centers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `DRIVER_GUARD_${suffix}`,
          name: '引用动因作业中心',
          costDriverType: driverCode,
        })
      expect(centerRes.status).toBe(201)

      const deleteDriver = await request(app)
        .delete(`/api/v1/abc/cost-drivers/${driverId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(deleteDriver.status).toBe(409)
      expect(deleteDriver.body.error.message).toBe('成本动因已被作业中心引用，不能删除')
    })
  })

  describe('成本池管理', () => {
    it('创建成本池', async () => {
      // 先获取一个作业中心
      const centersRes = await request(app)
        .get('/api/v1/abc/activity-centers')
        .set('Authorization', `Bearer ${token}`)

      const centers = getItems(centersRes)
      if (centers.length === 0) {
        return // 跳过测试
      }

      const centerId = centers[0].id

      const res = await request(app)
        .post('/api/v1/abc/cost-pools')
        .set('Authorization', `Bearer ${token}`)
        .send({
          activityCenterId: centerId,
          yearMonth: '2026-06',
          directCost: 10000,
          indirectCost: 5000,
          driverQuantity: 100,
        })

      // 接受 200（更新）或 201（创建）
      expect([200, 201]).toContain(res.status)
      expect(res.body.success).toBe(true)
    })

    it('获取成本池列表', async () => {
      const res = await request(app)
        .get('/api/v1/abc/cost-pools')
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(200)
      expect(res.body.success).toBe(true)
    })

    it('拒绝会污染期间费率的成本池输入', async () => {
      const suffix = Date.now()
      const centerRes = await request(app)
        .post('/api/v1/abc/activity-centers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `POOL_INPUT_${suffix}`,
          name: '成本池输入校验作业中心',
          costDriverType: 'slide_count',
        })
      expect(centerRes.status).toBe(201)
      const centerId = centerRes.body.data.id

      const negativeCost = await request(app)
        .post('/api/v1/abc/cost-pools')
        .set('Authorization', `Bearer ${token}`)
        .send({
          activityCenterId: centerId,
          yearMonth: '2099-02',
          directCost: -1,
          indirectCost: 0,
          driverQuantity: 10,
        })
      expect(negativeCost.status).toBe(400)
      expect(negativeCost.body.error.message).toBe('直接成本不能为负数')

      const zeroDriver = await request(app)
        .post('/api/v1/abc/cost-pools')
        .set('Authorization', `Bearer ${token}`)
        .send({
          activityCenterId: centerId,
          yearMonth: '2099-02',
          directCost: 100,
          indirectCost: 0,
          driverQuantity: 0,
        })
      expect(zeroDriver.status).toBe(400)
      expect(zeroDriver.body.error.message).toBe('动因数量必须大于0')

      await request(app)
        .put(`/api/v1/abc/activity-centers/${centerId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'inactive' })

      const inactiveCenter = await request(app)
        .post('/api/v1/abc/cost-pools')
        .set('Authorization', `Bearer ${token}`)
        .send({
          activityCenterId: centerId,
          yearMonth: '2099-02',
          directCost: 100,
          indirectCost: 0,
          driverQuantity: 10,
        })
      expect(inactiveCenter.status).toBe(400)
      expect(inactiveCenter.body.error.message).toBe('作业中心不存在或已停用')
    })

    it('已关账期间不能新增或更新成本池', async () => {
      const suffix = Date.now()
      const yearMonth = '2099-03'
      const centerRes = await request(app)
        .post('/api/v1/abc/activity-centers')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `POOL_CLOSED_${suffix}`,
          name: '成本池关账保护作业中心',
          costDriverType: 'slide_count',
        })
      expect(centerRes.status).toBe(201)
      const centerId = centerRes.body.data.id
      db.prepare(`
        INSERT OR REPLACE INTO abc_periods (id, year_month, status, closed_at, closed_by)
        VALUES (?, ?, 'closed', CURRENT_TIMESTAMP, 'test')
      `).run(`period-pool-closed-${suffix}`, yearMonth)

      const res = await request(app)
        .post('/api/v1/abc/cost-pools')
        .set('Authorization', `Bearer ${token}`)
        .send({
          activityCenterId: centerId,
          yearMonth,
          directCost: 100,
          indirectCost: 50,
          driverQuantity: 10,
        })

      expect(res.status).toBe(422)
      expect(res.body.error.code).toBe('PERIOD_CLOSED')
    })
  })

  describe('BOM作业关联', () => {
    it('获取BOM的作业关联', async () => {
      // 先获取一个BOM
      const bomsRes = await request(app)
        .get('/api/v1/boms')
        .set('Authorization', `Bearer ${token}`)

      const items = getItems(bomsRes)
      if (items.length > 0) {
        const bomId = items[0].id

        const res = await request(app)
          .get(`/api/v1/abc/bom-links/${bomId}`)
          .set('Authorization', `Bearer ${token}`)

        expect(res.status).toBe(200)
        expect(res.body.success).toBe(true)
      }
    })
  })

  describe('收费标准', () => {
    it('收费标准数据已导入', async () => {
      // 直接查询数据库验证
      const count = db.prepare('SELECT COUNT(*) as count FROM fee_standards').get()
      expect(count.count).toBeGreaterThan(0)
    })

    it('收费标准包含完整编码', async () => {
      // 验证关键编码存在
      const codes = [
        '012100000010000', // 病理诊断费
        '012100000030000', // 标本处理费（常规）
        '012100000120000', // IHC染色检查费
        '012100000150000', // FISH检测费
        '012100000170000', // 实时荧光PCR
        '012100000200000', // NGS
      ]

      for (const code of codes) {
        const row = db.prepare('SELECT * FROM fee_standards WHERE code = ?').get(code)
        expect(row).toBeDefined()
        expect(row.name).toBeDefined()
        expect(row.base_price).toBeGreaterThan(0)
      }
    })
  })

  describe('ABC种子数据', () => {
    it('作业中心数据已导入', async () => {
      const count = db.prepare('SELECT COUNT(*) as count FROM abc_activity_centers').get()
      expect(count.count).toBeGreaterThanOrEqual(8) // 至少8个作业中心
    })

    it('成本动因数据已导入', async () => {
      const count = db.prepare('SELECT COUNT(*) as count FROM abc_cost_drivers').get()
      expect(count.count).toBeGreaterThanOrEqual(7) // 至少7种成本动因
    })

    it('作业中心包含正确类型', async () => {
      const centers = db.prepare('SELECT * FROM abc_activity_centers ORDER BY sort_order').all()
      const codes = centers.map((c: any) => c.code)
      expect(codes).toContain('SPECIMEN')
      expect(codes).toContain('SECTION')
      expect(codes).toContain('HE_STAIN')
      expect(codes).toContain('IHC')
      expect(codes).toContain('SS')
      expect(codes).toContain('MP')
      expect(codes).toContain('DIAGNOSIS')
      expect(codes).toContain('CYTOLOGY')
    })
  })
})
