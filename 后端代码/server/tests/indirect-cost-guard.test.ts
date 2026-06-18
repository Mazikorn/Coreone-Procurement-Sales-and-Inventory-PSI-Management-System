process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { v4 as uuidv4 } from 'uuid'

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

async function createCostCenter(app: any, token: string, suffix: string) {
  const res = await request(app)
    .post('/api/v1/indirect-costs')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code: `IDC-GUARD-${suffix}`,
      name: `间接成本保护-${suffix}`,
      costType: 'rent',
      monthlyAmount: 1000,
      allocationBase: 'sample_count',
    })
  expect(res.status).toBe(201)
  return res.body.data.id as string
}

describe('间接成本中心删除保护', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('IDC-GUARD-001: 已有分摊记录的成本中心不可删除', async () => {
    const costCenterId = await createCostCenter(app, token, `alloc-${Date.now()}`)
    const alloc = await request(app)
      .post(`/api/v1/indirect-costs/${costCenterId}/allocations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth: '2026-06', totalAmount: 1000, allocationBaseValue: 100 })
    expect(alloc.status).toBe(201)

    const res = await request(app)
      .delete(`/api/v1/indirect-costs/${costCenterId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    const center = db.prepare('SELECT id FROM indirect_cost_centers WHERE id = ?').get(costCenterId) as any
    const count = (db.prepare('SELECT COUNT(*) as count FROM indirect_cost_allocations WHERE cost_center_id = ?')
      .get(costCenterId) as any)?.count || 0
    expect(center?.id).toBe(costCenterId)
    expect(Number(count)).toBe(1)
  })

  it('IDC-GUARD-002: 无分摊记录的成本中心仍可删除', async () => {
    const costCenterId = await createCostCenter(app, token, `free-${Date.now()}`)

    const res = await request(app)
      .delete(`/api/v1/indirect-costs/${costCenterId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const center = db.prepare('SELECT id FROM indirect_cost_centers WHERE id = ?').get(costCenterId) as any
    expect(center).toBeUndefined()
  })

  it('IDC-STATS-001: 成本中心统计接口按筛选条件返回全量口径', async () => {
    const suffix = `stats-${Date.now()}`
    const activeId = await createCostCenter(app, token, `${suffix}-active`)
    const inactive = await request(app)
      .post('/api/v1/indirect-costs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `IDC-GUARD-${suffix}-inactive`,
        name: `间接成本保护-${suffix}-inactive`,
        costType: 'rent',
        monthlyAmount: 2000,
        allocationBase: 'sample_count',
        status: 'inactive',
      })
    expect(inactive.status).toBe(201)
    const inactiveId = inactive.body.data.id as string

    const activeAllocation = await request(app)
      .post(`/api/v1/indirect-costs/${activeId}/allocations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth: '2026-06', totalAmount: 1000, allocationBaseValue: 100 })
    expect(activeAllocation.status).toBe(201)
    db.prepare(`
      INSERT INTO indirect_cost_allocations (id, cost_center_id, year_month, total_amount, allocation_base_value, allocation_rate)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), inactiveId, '2026-06', 2000, 100, 20)

    const stats = await request(app)
      .get('/api/v1/indirect-costs/stats')
      .query({ keyword: suffix })
      .set('Authorization', `Bearer ${token}`)

    expect(stats.status).toBe(200)
    expect(stats.body.data.total).toBeGreaterThanOrEqual(2)
    expect(stats.body.data.active).toBeGreaterThanOrEqual(1)
    expect(stats.body.data.totalMonthly).toBeGreaterThanOrEqual(3000)
    expect(stats.body.data.allocationCount).toBeGreaterThanOrEqual(2)

    const inactiveStats = await request(app)
      .get('/api/v1/indirect-costs/stats')
      .query({ keyword: suffix, status: 'inactive' })
      .set('Authorization', `Bearer ${token}`)

    expect(inactiveStats.status).toBe(200)
    expect(inactiveStats.body.data.total).toBe(1)
    expect(inactiveStats.body.data.active).toBe(0)
    expect(inactiveStats.body.data.totalMonthly).toBe(2000)
    expect(inactiveStats.body.data.allocationCount).toBe(1)
  })

  it('IDC-VALIDATION-001: 成本中心和分摊金额必须保持非负且分摊基础必须大于0', async () => {
    const suffix = `validation-${Date.now()}`

    const negativeMonthly = await request(app)
      .post('/api/v1/indirect-costs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `IDC-GUARD-${suffix}-negative`,
        name: `间接成本保护-${suffix}-negative`,
        costType: 'rent',
        monthlyAmount: -1,
        allocationBase: 'sample_count',
      })
    expect(negativeMonthly.status).toBe(400)

    const costCenterId = await createCostCenter(app, token, suffix)

    const negativeAllocation = await request(app)
      .post(`/api/v1/indirect-costs/${costCenterId}/allocations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth: '2026-06', totalAmount: -100, allocationBaseValue: 100 })
    expect(negativeAllocation.status).toBe(400)

    const zeroBase = await request(app)
      .post(`/api/v1/indirect-costs/${costCenterId}/allocations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth: '2026-06', totalAmount: 1000, allocationBaseValue: 0 })
    expect(zeroBase.status).toBe(400)

    const invalidMonth = await request(app)
      .post(`/api/v1/indirect-costs/${costCenterId}/allocations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth: '2026-6', totalAmount: 1000, allocationBaseValue: 100 })
    expect(invalidMonth.status).toBe(400)

    const allocationCount = (db.prepare('SELECT COUNT(*) as count FROM indirect_cost_allocations WHERE cost_center_id = ?')
      .get(costCenterId) as any)?.count || 0
    expect(Number(allocationCount)).toBe(0)
  })

  it('IDC-ALLOC-404: 查询不存在成本中心的分摊记录返回404', async () => {
    const res = await request(app)
      .get('/api/v1/indirect-costs/non-existent-id/allocations?page=1&pageSize=10')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  it('IDC-ALLOC-STATUS-001: 停用成本中心不可新增或更新分摊记录', async () => {
    const suffix = `inactive-alloc-${Date.now()}`
    const inactive = await request(app)
      .post('/api/v1/indirect-costs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `IDC-GUARD-${suffix}`,
        name: `间接成本保护-${suffix}`,
        costType: 'rent',
        monthlyAmount: 2000,
        allocationBase: 'sample_count',
        status: 'inactive',
      })
    expect(inactive.status).toBe(201)
    const inactiveId = inactive.body.data.id as string

    const allocation = await request(app)
      .post(`/api/v1/indirect-costs/${inactiveId}/allocations`)
      .set('Authorization', `Bearer ${token}`)
      .send({ yearMonth: '2026-06', totalAmount: 2000, allocationBaseValue: 100 })

    expect(allocation.status).toBe(400)
    expect(allocation.body.error.message).toContain('停用')
    const count = (db.prepare('SELECT COUNT(*) as count FROM indirect_cost_allocations WHERE cost_center_id = ?')
      .get(inactiveId) as any)?.count || 0
    expect(Number(count)).toBe(0)
  })

  it('IDC-FILTER-001: status=all 不应被误过滤为停用状态', async () => {
    const suffix = `all-${Date.now()}`
    await createCostCenter(app, token, `${suffix}-active`)
    const inactive = await request(app)
      .post('/api/v1/indirect-costs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `IDC-GUARD-${suffix}-inactive`,
        name: `间接成本保护-${suffix}-inactive`,
        costType: 'rent',
        monthlyAmount: 2000,
        allocationBase: 'sample_count',
        status: 'inactive',
      })
    expect(inactive.status).toBe(201)

    const list = await request(app)
      .get('/api/v1/indirect-costs')
      .query({ keyword: suffix, status: 'all' })
      .set('Authorization', `Bearer ${token}`)
    expect(list.status).toBe(200)
    expect(list.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'active' }),
      expect.objectContaining({ status: 'inactive' }),
    ]))

    const stats = await request(app)
      .get('/api/v1/indirect-costs/stats')
      .query({ keyword: suffix, status: 'all' })
      .set('Authorization', `Bearer ${token}`)
    expect(stats.status).toBe(200)
    expect(stats.body.data.total).toBe(2)
    expect(stats.body.data.active).toBe(1)
  })

  it('IDC-TEXT-001: 创建和更新间接成本中心时拦截危险文本并保存清理后的展示文本', async () => {
    const suffix = `text-${Date.now()}`

    const blockedCreate = await request(app)
      .post('/api/v1/indirect-costs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `IDC-DIRTY-${suffix}`,
        name: '<script>alert(1)</script>',
        costType: 'rent',
        monthlyAmount: 1000,
        allocationBase: 'sample_count',
      })

    expect(blockedCreate.status).toBe(400)
    expect(blockedCreate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const dirtyCount = (db.prepare('SELECT COUNT(*) as count FROM indirect_cost_centers WHERE code = ?')
      .get(`IDC-DIRTY-${suffix}`) as any)?.count || 0
    expect(Number(dirtyCount)).toBe(0)

    const safeCreate = await request(app)
      .post('/api/v1/indirect-costs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `  IDC-SAFE-${suffix}  `,
        name: '  安全 间接 成本  ',
        description: '  月度 公摊 费用  ',
        costType: 'rent',
        monthlyAmount: 1000,
        allocationBase: 'sample_count',
      })

    expect(safeCreate.status).toBe(201)
    const costCenterId = safeCreate.body.data.id
    const persisted = db.prepare('SELECT code, name, description FROM indirect_cost_centers WHERE id = ?')
      .get(costCenterId) as any
    expect(persisted).toMatchObject({
      code: `IDC-SAFE-${suffix}`,
      name: '安全 间接 成本',
      description: '月度 公摊 费用',
    })

    const blockedUpdate = await request(app)
      .put(`/api/v1/indirect-costs/${costCenterId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: "' OR '1'='1" })

    expect(blockedUpdate.status).toBe(400)
    expect(blockedUpdate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const unchanged = db.prepare('SELECT description FROM indirect_cost_centers WHERE id = ?').get(costCenterId) as any
    expect(unchanged.description).toBe('月度 公摊 费用')
  })
})
