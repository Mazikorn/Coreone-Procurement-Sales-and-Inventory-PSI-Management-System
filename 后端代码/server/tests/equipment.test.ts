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

async function login(app: any, username: string, password: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password })
  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedEquipment(db: any, suffix: string) {
  const equipmentId = `eq-${suffix}`
  db.prepare(`
    INSERT INTO equipment (
      id, code, name, purchase_price, purchase_date, depreciable_life_years,
      residual_value, depreciation_method, total_capacity, capacity_unit, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(equipmentId, `EQ-${suffix}`, '设备使用审计测试设备', 100000, '2026-01-01', 5, 10000, 'straight_line', 0, 'minutes', 1)
  return equipmentId
}

describe('设备使用', () => {
  let app: any
  let db: any
  let token: string
  let technicianToken: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
    technicianToken = await login(app, 'zhangwei', 'CoreOne2026!')
  })

  it('EQ-001: 登记设备使用时忽略请求体伪造operator，使用登录用户', async () => {
    const equipmentId = seedEquipment(db, `op-${Date.now()}`)

    const res = await request(app)
      .post(`/api/v1/equipment/${equipmentId}/usage`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        usageMinutes: 60,
        usageCount: 1,
        operator: 'forged-user',
        usageDate: '2026-06-16',
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    const usage = db.prepare('SELECT operator FROM equipment_usage WHERE id = ?').get(res.body.data.id) as any
    expect(usage.operator).toBe('admin')
  })

  it('EQ-003: 设备使用必须为正数且设备需处于启用状态', async () => {
    const equipmentId = seedEquipment(db, `usage-guard-${Date.now()}`)

    const invalidMinutes = await request(app)
      .post(`/api/v1/equipment/${equipmentId}/usage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ usageMinutes: -1, usageCount: 1, usageDate: '2026-06-16' })
    expect(invalidMinutes.status).toBe(400)

    db.prepare('UPDATE equipment SET status = 0 WHERE id = ?').run(equipmentId)
    const inactiveUsage = await request(app)
      .post(`/api/v1/equipment/${equipmentId}/usage`)
      .set('Authorization', `Bearer ${token}`)
      .send({ usageMinutes: 30, usageCount: 1, usageDate: '2026-06-16' })
    expect(inactiveUsage.status).toBe(400)

    const count = (db.prepare('SELECT COUNT(*) as count FROM equipment_usage WHERE equipment_id = ?').get(equipmentId) as any)?.count
    expect(Number(count)).toBe(0)
  })

  it('EQ-USAGE-404: 查询不存在设备的使用记录返回404', async () => {
    const res = await request(app)
      .get('/api/v1/equipment/non-existent-id/usage?page=1&pageSize=10')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  it('EQ-004: 设备折旧字段写入前校验，避免负资产和错误折旧输入', async () => {
    const suffix = Date.now()
    const negativePrice = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQ-INVALID-PRICE-${suffix}`,
        name: '非法购置价设备',
        purchasePrice: -1,
      })
    expect(negativePrice.status).toBe(400)

    const residualTooHigh = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQ-INVALID-RESIDUAL-${suffix}`,
        name: '非法残值设备',
        purchasePrice: 100,
        residualValue: 101,
      })
    expect(residualTooHigh.status).toBe(400)

    const missingCapacity = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQ-INVALID-CAPACITY-${suffix}`,
        name: '非法工作量设备',
        purchasePrice: 100,
        residualValue: 10,
        depreciationMethod: 'units_of_production',
        totalCapacity: 0,
      })
    expect(missingCapacity.status).toBe(400)
  })

  it('EQ-002: 设备统计接口按筛选条件返回全量口径', async () => {
    const suffix = Date.now()
    const activeId = seedEquipment(db, `stat-active-${suffix}`)
    const inactiveId = `eq-stat-inactive-${suffix}`
    db.prepare(`
      INSERT INTO equipment (
        id, code, name, purchase_price, purchase_date, depreciable_life_years,
        residual_value, depreciation_method, total_capacity, capacity_unit, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(inactiveId, `EQ-STAT-INACTIVE-${suffix}`, '设备统计停用设备', 50000, '2026-01-01', 5, 5000, 'straight_line', 0, 'minutes', 0)

    const stats = await request(app)
      .get('/api/v1/equipment/stats')
      .query({ keyword: '设备统计' })
      .set('Authorization', `Bearer ${token}`)

    expect(stats.status).toBe(200)
    expect(stats.body.data.total).toBeGreaterThanOrEqual(1)
    expect(stats.body.data.inactive).toBeGreaterThanOrEqual(1)
    expect(stats.body.data.totalValue).toBeGreaterThanOrEqual(50000)

    const activeStats = await request(app)
      .get('/api/v1/equipment/stats')
      .query({ keyword: `EQ-stat-active-${suffix}`, status: 'active' })
      .set('Authorization', `Bearer ${token}`)

    expect(activeStats.status).toBe(200)
    expect(activeStats.body.data.total).toBe(1)
    expect(activeStats.body.data.active).toBe(1)
    expect(activeStats.body.data.totalValue).toBe(100000)

    const listed = await request(app)
      .get('/api/v1/equipment')
      .query({ keyword: `EQ-stat-active-${suffix}`, page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)
    expect(listed.body.data.list.some((item: any) => item.id === activeId)).toBe(true)

    const allStatusList = await request(app)
      .get('/api/v1/equipment')
      .query({ keyword: 'stat', status: 'all', page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)
    expect(allStatusList.status).toBe(200)
    expect(allStatusList.body.data.total).toBeGreaterThanOrEqual(2)
  })

  it('EQ-DEPR-001: 折旧统计必须包含未分类设备', async () => {
    seedEquipment(db, `depr-unclassified-${Date.now()}`)

    const res = await request(app)
      .get('/api/v1/equipment/depreciation-stats')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const unclassified = res.body.data.stats.find((item: any) => item.typeId === 'unclassified')
    expect(unclassified).toBeDefined()
    expect(unclassified.typeName).toBe('未分类')
    expect(unclassified.equipmentCount).toBeGreaterThanOrEqual(1)
    expect(unclassified.totalPurchasePrice).toBeGreaterThanOrEqual(100000)
    expect(unclassified.totalAnnualDepreciation).toBeGreaterThanOrEqual(18000)
    expect(res.body.data.summary.totalEquipment).toBeGreaterThanOrEqual(unclassified.equipmentCount)
  })

  it('EQ-AUTH-001: 技术员拥有设备模块权限时可维护设备资产主档并登记使用', async () => {
    const suffix = Date.now()
    const createByTechnician = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        code: `EQ-TECH-${suffix}`,
        name: '技术员创建设备',
        purchasePrice: 100000,
        residualValue: 10000,
        depreciableLifeYears: 5,
        depreciationMethod: 'straight_line',
      })
    expect(createByTechnician.status).toBe(201)
    const technicianEquipmentId = createByTechnician.body.data.id

    const updateByTechnician = await request(app)
      .put(`/api/v1/equipment/${technicianEquipmentId}`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ code: `EQ-TECH-${suffix}`, name: '技术员更新设备', purchasePrice: 120000, residualValue: 10000 })
    expect(updateByTechnician.status).toBe(200)

    const deleteByTechnician = await request(app)
      .delete(`/api/v1/equipment/${technicianEquipmentId}`)
      .set('Authorization', `Bearer ${technicianToken}`)
    expect(deleteByTechnician.status).toBe(200)
    const deleted = db.prepare('SELECT id FROM equipment WHERE id = ?').get(technicianEquipmentId) as any
    expect(deleted).toBeUndefined()

    const equipmentId = seedEquipment(db, `auth-${suffix}`)

    const usageByTechnician = await request(app)
      .post(`/api/v1/equipment/${equipmentId}/usage`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ usageMinutes: 30, usageCount: 1, usageDate: '2026-06-17' })
    expect(usageByTechnician.status).toBe(201)

    const usage = db.prepare('SELECT operator FROM equipment_usage WHERE equipment_id = ?').get(equipmentId) as any
    expect(usage.operator).toBe('zhangwei')
  })

  it('EQ-CODE-001: 编辑设备时不允许修改设备编号', async () => {
    const suffix = Date.now()
    const equipmentId = seedEquipment(db, `code-${suffix}`)
    const original = db.prepare('SELECT code FROM equipment WHERE id = ?').get(equipmentId) as any

    const res = await request(app)
      .put(`/api/v1/equipment/${equipmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQ-CHANGED-${suffix}`,
        name: '不应改编号设备',
      })

    expect(res.status).toBe(400)
    expect(res.body.error?.message).toContain('设备编号创建后不允许修改')
    const after = db.prepare('SELECT code, name FROM equipment WHERE id = ?').get(equipmentId) as any
    expect(after.code).toBe(original.code)
    expect(after.name).toBe('设备使用审计测试设备')
  })

  it('EQ-TEXT-001: 创建设备时拦截危险文本并保存清理后的展示文本', async () => {
    const suffix = `text-${Date.now()}`

    const blockedCreate = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQ-DIRTY-${suffix}`,
        name: '<script>alert(1)</script>',
        purchasePrice: 100000,
        residualValue: 10000,
        depreciableLifeYears: 5,
        depreciationMethod: 'straight_line',
      })

    expect(blockedCreate.status).toBe(400)
    expect(blockedCreate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const dirtyCount = (db.prepare('SELECT COUNT(*) as count FROM equipment WHERE code = ?')
      .get(`EQ-DIRTY-${suffix}`) as any)?.count || 0
    expect(Number(dirtyCount)).toBe(0)

    const safeCreate = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `  EQ-SAFE-${suffix}  `,
        name: '  安全 设备  ',
        model: '  Model  A  ',
        manufacturer: '  安全 厂商  ',
        capacityUnit: '  minutes  ',
        purchasePrice: 100000,
        residualValue: 10000,
        depreciableLifeYears: 5,
        depreciationMethod: 'straight_line',
      })

    expect(safeCreate.status).toBe(201)
    const equipmentId = safeCreate.body.data.id
    const persisted = db.prepare('SELECT code, name, model, manufacturer, capacity_unit FROM equipment WHERE id = ?')
      .get(equipmentId) as any
    expect(persisted).toMatchObject({
      code: `EQ-SAFE-${suffix}`,
      name: '安全 设备',
      model: 'Model A',
      manufacturer: '安全 厂商',
      capacity_unit: 'minutes',
    })

    const blockedUpdate = await request(app)
      .put(`/api/v1/equipment/${equipmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ manufacturer: "' OR '1'='1" })

    expect(blockedUpdate.status).toBe(400)
    expect(blockedUpdate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const unchanged = db.prepare('SELECT manufacturer FROM equipment WHERE id = ?').get(equipmentId) as any
    expect(unchanged.manufacturer).toBe('安全 厂商')
  })
})
