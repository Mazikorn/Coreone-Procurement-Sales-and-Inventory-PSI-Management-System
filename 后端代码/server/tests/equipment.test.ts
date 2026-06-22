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

function latestOperationLog(db: any, operation: string, needle: string) {
  return db.prepare(`
    SELECT *
    FROM operation_logs
    WHERE operation = ?
      AND (request_data LIKE ? OR response_data LIKE ?)
    ORDER BY CASE WHEN request_data LIKE '%"businessId"%' THEN 0 ELSE 1 END, created_at DESC
    LIMIT 1
  `).get(operation, `%${needle}%`, `%${needle}%`) as any
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
        projectId: 'project-eq-usage-audit',
        outboundId: 'outbound-eq-usage-audit',
        operator: 'forged-user',
        usageDate: '2026-06-16',
      })

    expect(res.status).toBe(201)
    expect(res.body.success).toBe(true)
    const usage = db.prepare('SELECT operator, usage_minutes, usage_count, depreciation_cost, usage_date FROM equipment_usage WHERE id = ?').get(res.body.data.id) as any
    expect(usage.operator).toBe('admin')
    expect(usage.usage_minutes).toBe(60)
    expect(usage.usage_count).toBe(1)
    expect(usage.usage_date).toBe('2026-06-16')
    expect(Number(usage.depreciation_cost)).toBeCloseTo(res.body.data.depreciationCost, 6)

    const auditLog = latestOperationLog(db, 'POST /equipment/:id/usage', res.body.data.id)
    expect(auditLog).toBeTruthy()
    expect(auditLog.username).toBe('admin')
    expect(JSON.parse(auditLog.request_data)).toMatchObject({
      module: 'equipment',
      equipmentId,
      equipmentCode: expect.stringContaining('EQ-op-'),
      equipmentName: '设备使用审计测试设备',
      usageMinutes: 60,
      usageCount: 1,
      projectId: 'project-eq-usage-audit',
      outboundId: 'outbound-eq-usage-audit',
      usageDate: '2026-06-16',
    })
    expect(JSON.parse(auditLog.response_data)).toMatchObject({
      id: res.body.data.id,
      equipmentId,
      operator: 'admin',
      depreciationMethod: 'straight_line',
    })
    expect(JSON.parse(auditLog.response_data).depreciationCost).toBeCloseTo(res.body.data.depreciationCost, 6)
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

  it('EQ-AUDIT-001: 创建设备主档写入折旧口径操作审计', async () => {
    const suffix = `audit-create-${Date.now()}`

    const res = await request(app)
      .post('/api/v1/equipment')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQ-AUDIT-CREATE-${suffix}`,
        name: '审计创建设备',
        model: 'AuditModel',
        manufacturer: '审计厂商',
        purchasePrice: 88000,
        residualValue: 8000,
        depreciableLifeYears: 4,
        depreciationMethod: 'straight_line',
        capacityUnit: 'minutes',
      })

    expect(res.status).toBe(201)
    const auditLog = latestOperationLog(db, 'POST /equipment', res.body.data.id)
    expect(auditLog).toBeTruthy()
    expect(auditLog.username).toBe('admin')
    expect(JSON.parse(auditLog.request_data)).toMatchObject({
      module: 'equipment',
      businessId: res.body.data.id,
      code: `EQ-AUDIT-CREATE-${suffix}`,
      name: '审计创建设备',
    })
    expect(JSON.parse(auditLog.response_data)).toMatchObject({
      id: res.body.data.id,
      after: expect.objectContaining({
        code: `EQ-AUDIT-CREATE-${suffix}`,
        purchasePrice: 88000,
        residualValue: 8000,
        depreciableLifeYears: 4,
        depreciationMethod: 'straight_line',
      }),
    })
  })

  it('EQ-AUDIT-002: 更新设备折旧口径写入前后值操作审计', async () => {
    const suffix = `audit-update-${Date.now()}`
    const equipmentId = seedEquipment(db, suffix)

    const res = await request(app)
      .put(`/api/v1/equipment/${equipmentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQ-${suffix}`,
        name: '审计更新设备',
        purchasePrice: 120000,
        residualValue: 12000,
        depreciableLifeYears: 6,
        depreciationMethod: 'straight_line',
      })

    expect(res.status).toBe(200)
    const auditLog = latestOperationLog(db, 'PUT /equipment/:id', equipmentId)
    expect(auditLog).toBeTruthy()
    expect(auditLog.username).toBe('admin')
    expect(JSON.parse(auditLog.request_data)).toMatchObject({
      module: 'equipment',
      businessId: equipmentId,
      before: expect.objectContaining({
        code: `EQ-${suffix}`,
        name: '设备使用审计测试设备',
        purchasePrice: 100000,
        residualValue: 10000,
        depreciableLifeYears: 5,
      }),
      after: expect.objectContaining({
        code: `EQ-${suffix}`,
        name: '审计更新设备',
        purchasePrice: 120000,
        residualValue: 12000,
        depreciableLifeYears: 6,
      }),
    })
    expect(JSON.parse(auditLog.response_data)).toMatchObject({
      id: equipmentId,
      beforeStatus: 'active',
      afterStatus: 'active',
    })
  })

  it('EQ-AUDIT-003: 删除设备主档写入可回看审计链接', async () => {
    const suffix = `audit-delete-${Date.now()}`
    const equipmentId = seedEquipment(db, suffix)

    const res = await request(app)
      .delete(`/api/v1/equipment/${equipmentId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const auditLog = latestOperationLog(db, 'DELETE /equipment/:id', equipmentId)
    expect(auditLog).toBeTruthy()
    expect(auditLog.username).toBe('admin')
    expect(JSON.parse(auditLog.request_data)).toMatchObject({
      module: 'equipment',
      businessId: equipmentId,
      before: expect.objectContaining({
        code: `EQ-${suffix}`,
        purchasePrice: 100000,
        residualValue: 10000,
        depreciableLifeYears: 5,
      }),
    })
    expect(JSON.parse(auditLog.response_data)).toMatchObject({
      id: equipmentId,
      isDeleted: true,
    })

    const unified = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'operation', keyword: equipmentId, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(unified.status).toBe(200)
    expect(unified.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'DELETE /equipment/:id',
        module: 'equipment',
        businessId: equipmentId,
        businessUrl: `/equipment?keyword=${equipmentId}&includeDeleted=true`,
      }),
    ]))
  })

  it('EQ-AUDIT-004: 设备类型写动作沉淀默认折旧口径前后值', async () => {
    const suffix = `type-audit-${Date.now()}`

    const createRes = await request(app)
      .post('/api/v1/equipment-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQT-AUDIT-${suffix}`,
        name: '审计设备类型',
        description: '创建时的折旧默认口径',
        defaultPurchasePrice: 100000,
        defaultValue: 10000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'straight_line',
        defaultTotalCapacity: 0,
        defaultCapacityUnit: 'minutes',
      })

    expect(createRes.status).toBe(201)
    const typeId = createRes.body.data.id
    const createLog = latestOperationLog(db, 'POST /equipment-types', typeId)
    expect(createLog).toBeTruthy()
    expect(createLog.username).toBe('admin')
    expect(JSON.parse(createLog.request_data)).toMatchObject({
      module: 'equipment_types',
      businessId: typeId,
      code: `EQT-AUDIT-${suffix}`,
      name: '审计设备类型',
      after: expect.objectContaining({
        defaultPurchasePrice: 100000,
        defaultValue: 10000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'straight_line',
      }),
    })

    const updateRes = await request(app)
      .put(`/api/v1/equipment-types/${typeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQT-AUDIT-${suffix}`,
        name: '审计设备类型已更新',
        description: '更新后的折旧默认口径',
        status: 'inactive',
        defaultPurchasePrice: 160000,
        defaultValue: 20000,
        defaultDepreciableLifeYears: 8,
        defaultDepreciationMethod: 'units_of_production',
        defaultTotalCapacity: 40000,
        defaultCapacityUnit: 'slides',
      })

    expect(updateRes.status).toBe(200)
    const updateLog = latestOperationLog(db, 'PUT /equipment-types/:id', typeId)
    expect(updateLog).toBeTruthy()
    expect(JSON.parse(updateLog.request_data)).toMatchObject({
      module: 'equipment_types',
      businessId: typeId,
      before: expect.objectContaining({
        defaultPurchasePrice: 100000,
        defaultValue: 10000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'straight_line',
        status: 'active',
      }),
      after: expect.objectContaining({
        name: '审计设备类型已更新',
        defaultPurchasePrice: 160000,
        defaultValue: 20000,
        defaultDepreciableLifeYears: 8,
        defaultDepreciationMethod: 'units_of_production',
        defaultTotalCapacity: 40000,
        defaultCapacityUnit: 'slides',
        status: 'inactive',
      }),
    })

    const deleteRes = await request(app)
      .delete(`/api/v1/equipment-types/${typeId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(deleteRes.status).toBe(200)
    const deleteLog = latestOperationLog(db, 'DELETE /equipment-types/:id', typeId)
    expect(deleteLog).toBeTruthy()
    expect(JSON.parse(deleteLog.request_data)).toMatchObject({
      module: 'equipment_types',
      businessId: typeId,
      before: expect.objectContaining({
        code: `EQT-AUDIT-${suffix}`,
        name: '审计设备类型已更新',
        defaultPurchasePrice: 160000,
        defaultValue: 20000,
        defaultDepreciableLifeYears: 8,
        defaultDepreciationMethod: 'units_of_production',
        defaultTotalCapacity: 40000,
        defaultCapacityUnit: 'slides',
        status: 'inactive',
      }),
    })
    expect(JSON.parse(deleteLog.response_data)).toMatchObject({
      id: typeId,
      isDeleted: true,
    })

    const unified = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'operation', keyword: typeId, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    expect(unified.status).toBe(200)
    expect(unified.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        operation: 'DELETE /equipment-types/:id',
        module: 'equipment_types',
        businessId: typeId,
        businessUrl: `/equipment/types?keyword=${typeId}&includeDeleted=true`,
      }),
    ]))
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
    const deleted = db.prepare('SELECT is_deleted FROM equipment WHERE id = ?').get(technicianEquipmentId) as any
    expect(deleted).toMatchObject({ is_deleted: 1 })

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
