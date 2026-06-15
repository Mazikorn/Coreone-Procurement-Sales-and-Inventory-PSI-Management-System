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
