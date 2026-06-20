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

async function loginTechnician(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'zhangwei', password: 'CoreOne2026!' })
  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedBom(db: any, suffix: string) {
  const bomId = `bom-eq-guard-${suffix}`
  db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 1)')
    .run(bomId, `BOM-EQ-GUARD-${suffix}`, '设备保护BOM', 'v1.0', 'ihc')
  return bomId
}

function seedEquipment(db: any, suffix: string) {
  const equipmentId = `eq-guard-${suffix}`
  db.prepare(`
    INSERT INTO equipment (
      id, code, name, purchase_price, purchase_date, depreciable_life_years,
      residual_value, depreciation_method, total_capacity, capacity_unit, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(equipmentId, `EQ-GUARD-${suffix}`, '设备保护测试设备', 100000, '2026-01-01', 5, 10000, 'straight_line', 0, 'minutes', 1)
  return equipmentId
}

function seedEquipmentType(db: any, suffix: string) {
  const typeId = `eq-type-guard-${suffix}`
  db.prepare(`
    INSERT INTO equipment_types (
      id, code, name, default_purchase_price, default_depreciable_life_years,
      default_residual_value, default_depreciation_method, default_total_capacity,
      default_capacity_unit, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(typeId, `EQT-GUARD-${suffix}`, '设备类型保护测试', 100000, 5, 10000, 'straight_line', 0, 'minutes', 1)
  return typeId
}

describe('设备删除保护', () => {
  let app: any
  let db: any
  let token: string
  let technicianToken: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
    technicianToken = await loginTechnician(app)
  })

  it('EQ-TYPE-AUTH-001: 技术员拥有设备模块权限时可维护设备类型', async () => {
    const suffix = `type-auth-${Date.now()}`

    const created = await request(app)
      .post('/api/v1/equipment-types')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        code: `EQT-AUTH-${suffix}`,
        name: `技术员设备类型-${suffix}`,
        defaultPurchasePrice: 100000,
        defaultValue: 10000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'straight_line',
      })

    expect(created.status).toBe(201)
    const typeId = created.body.data.id

    const updated = await request(app)
      .put(`/api/v1/equipment-types/${typeId}`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        code: `EQT-AUTH-${suffix}`,
        name: `技术员设备类型-${suffix}-停用`,
        status: 'inactive',
        defaultPurchasePrice: 100000,
        defaultValue: 10000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'straight_line',
      })

    expect(updated.status).toBe(200)
    const row = db.prepare('SELECT name, status FROM equipment_types WHERE id = ?').get(typeId) as any
    expect(row).toMatchObject({ name: `技术员设备类型-${suffix}-停用`, status: 0 })

    const deleted = await request(app)
      .delete(`/api/v1/equipment-types/${typeId}`)
      .set('Authorization', `Bearer ${technicianToken}`)

    expect(deleted.status).toBe(200)
    const afterDelete = db.prepare('SELECT id FROM equipment_types WHERE id = ?').get(typeId) as any
    expect(afterDelete).toBeUndefined()
  })

  it('EQ-TYPE-CODE-001: 编辑设备类型时不允许修改类型编码', async () => {
    const suffix = `type-code-${Date.now()}`
    const typeId = seedEquipmentType(db, suffix)
    const original = db.prepare('SELECT code FROM equipment_types WHERE id = ?').get(typeId) as any

    const res = await request(app)
      .put(`/api/v1/equipment-types/${typeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQT-CHANGED-${suffix}`,
        name: '不应改编码设备类型',
        defaultPurchasePrice: 100000,
        defaultValue: 10000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'straight_line',
      })

    expect(res.status).toBe(400)
    expect(res.body.error?.message).toContain('设备类型编码创建后不允许修改')
    const after = db.prepare('SELECT code, name FROM equipment_types WHERE id = ?').get(typeId) as any
    expect(after.code).toBe(original.code)
    expect(after.name).toBe('设备类型保护测试')
  })

  it('EQ-GUARD-001: 被BOM设备模板引用的设备不可删除', async () => {
    const suffix = `device-${Date.now()}`
    const equipmentId = seedEquipment(db, suffix)
    const bomId = seedBom(db, suffix)
    db.prepare(`
      INSERT INTO bom_equipment_templates (id, bom_id, equipment_id, usage_minutes)
      VALUES (?, ?, ?, ?)
    `).run(`bet-eq-guard-${suffix}`, bomId, equipmentId, 30)

    const res = await request(app)
      .delete(`/api/v1/equipment/${equipmentId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    const equipment = db.prepare('SELECT id FROM equipment WHERE id = ?').get(equipmentId) as any
    expect(equipment?.id).toBe(equipmentId)
  })

  it('EQ-GUARD-002: 被BOM设备模板引用的设备类型不可删除', async () => {
    const suffix = `type-${Date.now()}`
    const typeId = seedEquipmentType(db, suffix)
    const bomId = seedBom(db, suffix)
    db.prepare(`
      INSERT INTO bom_equipment_templates (id, bom_id, equipment_type_id, usage_minutes)
      VALUES (?, ?, ?, ?)
    `).run(`bet-eqt-guard-${suffix}`, bomId, typeId, 30)

    const res = await request(app)
      .delete(`/api/v1/equipment-types/${typeId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    const type = db.prepare('SELECT id FROM equipment_types WHERE id = ?').get(typeId) as any
    expect(type?.id).toBe(typeId)
  })

  it('EQ-TYPE-STATS-001: 设备类型统计使用后端全量筛选口径', async () => {
    const suffix = `stats-${Date.now()}`
    const activeTypeId = seedEquipmentType(db, `${suffix}-active`)
    const secondActiveTypeId = seedEquipmentType(db, `${suffix}-active-2`)
    const inactiveTypeId = seedEquipmentType(db, `${suffix}-inactive`)
    db.prepare('UPDATE equipment_types SET status = 0 WHERE id = ?').run(inactiveTypeId)

    const activeEquipmentId = seedEquipment(db, `${suffix}-active`)
    const inactiveEquipmentId = seedEquipment(db, `${suffix}-inactive`)
    db.prepare('UPDATE equipment SET type_id = ? WHERE id = ?').run(activeTypeId, activeEquipmentId)
    db.prepare('UPDATE equipment SET type_id = ? WHERE id = ?').run(inactiveTypeId, inactiveEquipmentId)

    const listRes = await request(app)
      .get('/api/v1/equipment-types')
      .query({ keyword: suffix, page: 1, pageSize: 1 })
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.total).toBe(3)
    expect(listRes.body.data.list).toHaveLength(1)

    const statsRes = await request(app)
      .get('/api/v1/equipment-types/stats')
      .query({ keyword: suffix })
      .set('Authorization', `Bearer ${token}`)

    expect(statsRes.status).toBe(200)
    expect(statsRes.body.data).toMatchObject({
      total: 3,
      active: 2,
      equipmentCount: 2,
    })

    const activeStats = await request(app)
      .get('/api/v1/equipment-types/stats')
      .query({ keyword: suffix, status: 'active' })
      .set('Authorization', `Bearer ${token}`)

    expect(activeStats.status).toBe(200)
    expect(activeStats.body.data).toMatchObject({
      total: 2,
      active: 2,
      equipmentCount: 1,
    })
    expect(secondActiveTypeId).toBeTruthy()
  })

  it('EQ-TYPE-LIST-001: 设备表单候选类型请求不会被截断到前100条', async () => {
    const suffix = `refs-${Date.now()}`
    const insert = db.prepare(`
      INSERT INTO equipment_types (
        id, code, name, default_purchase_price, default_depreciable_life_years,
        default_residual_value, default_depreciation_method, default_total_capacity,
        default_capacity_unit, status
      ) VALUES (?, ?, ?, 100000, 5, 10000, 'straight_line', 0, 'minutes', 1)
    `)

    for (let i = 1; i <= 105; i += 1) {
      const padded = String(i).padStart(3, '0')
      insert.run(
        `eq-type-refs-${suffix}-${padded}`,
        `EQT-REFS-${suffix}-${padded}`,
        `引用候选设备类型-${suffix}-${padded}`,
      )
    }

    const res = await request(app)
      .get('/api/v1/equipment-types')
      .query({ keyword: `引用候选设备类型-${suffix}`, status: 'active', page: 1, pageSize: 999 })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(105)
    expect(res.body.data.pagination.pageSize).toBe(999)
    expect(res.body.data.list).toHaveLength(105)
  })

  it('EQ-COST-001: BOM只配置设备类型时使用类型默认值计算设备成本', async () => {
    const suffix = `cost-type-${Date.now()}`
    const typeId = seedEquipmentType(db, suffix)
    const bomId = seedBom(db, suffix)
    db.prepare(`
      INSERT INTO bom_equipment_templates (id, bom_id, equipment_type_id, usage_minutes)
      VALUES (?, ?, ?, ?)
    `).run(`bet-eqt-cost-${suffix}`, bomId, typeId, 60)

    const { calculateEquipmentCost, calculateEquipmentCostFromRows } = await import('../src/utils/cost-calculator.js')
    const directCost = calculateEquipmentCost(db, bomId, 1)
    const reportCost = calculateEquipmentCostFromRows([
      {
        usage_minutes: 60,
        default_purchase_price: 100000,
        default_residual_value: 10000,
        default_depreciable_life_years: 5,
        default_depreciation_method: 'straight_line',
        default_total_capacity: 0,
      },
    ], 1)

    expect(directCost).toBe(2.05)
    expect(reportCost).toBe(2.05)
  })

  it('EQ-TYPE-VALIDATION-001: 设备类型默认折旧字段必须保持可计算', async () => {
    const suffix = `type-validation-${Date.now()}`
    const createInvalidResidual = await request(app)
      .post('/api/v1/equipment-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQT-INVALID-${suffix}`,
        name: '非法默认残值类型',
        defaultPurchasePrice: 100,
        defaultValue: 200,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'straight_line',
      })

    expect(createInvalidResidual.status).toBe(400)

    const createInvalidCapacity = await request(app)
      .post('/api/v1/equipment-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQT-INVALID-CAP-${suffix}`,
        name: '非法默认工作量类型',
        defaultPurchasePrice: 100000,
        defaultValue: 10000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'units_of_production',
        defaultTotalCapacity: 0,
      })

    expect(createInvalidCapacity.status).toBe(400)

    const typeId = seedEquipmentType(db, suffix)
    const updateInvalid = await request(app)
      .put(`/api/v1/equipment-types/${typeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        defaultPurchasePrice: 100000,
        defaultValue: 10000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'invalid_method',
        defaultTotalCapacity: 0,
      })

    expect(updateInvalid.status).toBe(400)
    const persisted = db.prepare('SELECT default_depreciation_method FROM equipment_types WHERE id = ?').get(typeId) as any
    expect(persisted.default_depreciation_method).toBe('straight_line')
  })

  it('EQ-TYPE-STATUS-001: 设备类型更新保留状态且status=all不过滤为停用', async () => {
    const suffix = `type-status-${Date.now()}`
    const inactiveTypeId = seedEquipmentType(db, `${suffix}-inactive`)
    const activeTypeId = seedEquipmentType(db, `${suffix}-active`)
    db.prepare('UPDATE equipment_types SET status = 0 WHERE id = ?').run(inactiveTypeId)

    const updateRes = await request(app)
      .put(`/api/v1/equipment-types/${inactiveTypeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '编辑后仍停用的设备类型',
        defaultPurchasePrice: 100000,
        defaultValue: 10000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'straight_line',
        defaultTotalCapacity: 0,
      })

    expect(updateRes.status).toBe(200)
    const inactive = db.prepare('SELECT status FROM equipment_types WHERE id = ?').get(inactiveTypeId) as any
    expect(inactive.status).toBe(0)

    const listRes = await request(app)
      .get('/api/v1/equipment-types')
      .query({ keyword: suffix, status: 'all', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.total).toBe(2)
    expect(listRes.body.data.list.map((item: any) => item.id).sort()).toEqual([activeTypeId, inactiveTypeId].sort())
  })

  it('EQ-TYPE-TEXT-001: 创建设备类型时拦截危险文本并保存清理后的展示文本', async () => {
    const suffix = `type-text-${Date.now()}`

    const blockedCreate = await request(app)
      .post('/api/v1/equipment-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `EQT-TEXT-DIRTY-${suffix}`,
        name: '<script>alert(1)</script>',
        defaultPurchasePrice: 100000,
        defaultValue: 10000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'straight_line',
      })

    expect(blockedCreate.status).toBe(400)
    expect(blockedCreate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const dirtyCount = (db.prepare('SELECT COUNT(*) as count FROM equipment_types WHERE code = ?')
      .get(`EQT-TEXT-DIRTY-${suffix}`) as any)?.count || 0
    expect(Number(dirtyCount)).toBe(0)

    const safeCreate = await request(app)
      .post('/api/v1/equipment-types')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `  EQT-TEXT-SAFE-${suffix}  `,
        name: '  安全 设备 类型  ',
        description: '  常规 设备 分类  ',
        defaultPurchasePrice: 100000,
        defaultValue: 10000,
        defaultDepreciableLifeYears: 5,
        defaultDepreciationMethod: 'straight_line',
        defaultCapacityUnit: '  minutes  ',
      })

    expect(safeCreate.status).toBe(201)
    const typeId = safeCreate.body.data.id
    const persisted = db.prepare('SELECT code, name, description, default_capacity_unit FROM equipment_types WHERE id = ?')
      .get(typeId) as any
    expect(persisted).toMatchObject({
      code: `EQT-TEXT-SAFE-${suffix}`,
      name: '安全 设备 类型',
      description: '常规 设备 分类',
      default_capacity_unit: 'minutes',
    })

    const blockedUpdate = await request(app)
      .put(`/api/v1/equipment-types/${typeId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: "' OR '1'='1" })

    expect(blockedUpdate.status).toBe(400)
    expect(blockedUpdate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const unchanged = db.prepare('SELECT description FROM equipment_types WHERE id = ?').get(typeId) as any
    expect(unchanged.description).toBe('常规 设备 分类')
  })
})
