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

async function createMaterial(app: any, token: string, suffix: string) {
  const res = await request(app)
    .post('/api/v1/materials')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code: `MAT-BOM-BATCH-${suffix}`,
      name: `BOM批量物料-${suffix}`,
      unit: '瓶',
      categoryId: 'cat-bom-batch',
      price: 10,
    })
  expect(res.status).toBe(201)
  return res.body.data.id as string
}

async function createBom(app: any, token: string, suffix: string) {
  const materialId = await createMaterial(app, token, suffix)
  const res = await request(app)
    .post('/api/v1/boms')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code: `BOM-BATCH-${suffix}`,
      name: `批量BOM-${suffix}`,
      type: 'ihc',
      materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
    })
  expect(res.status).toBe(201)
  return res.body.data.id as string
}

async function createMaterialForBom(app: any, token: string, suffix: string) {
  return createMaterial(app, token, `equip-${suffix}`)
}

function seedEquipment(db: any, suffix: string, status = 1) {
  const equipmentId = `eq-bom-${suffix}`
  db.prepare(`
    INSERT INTO equipment (
      id, code, name, purchase_price, purchase_date,
      depreciable_life_years, residual_value, depreciation_method,
      total_capacity, capacity_unit, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    equipmentId,
    `EQ-BOM-${suffix}`,
    `BOM设备-${suffix}`,
    120000,
    '2026-01-01',
    5,
    0,
    'straight_line',
    0,
    'minutes',
    status,
  )
  return equipmentId
}

function seedEquipmentType(db: any, suffix: string, status = 1) {
  const equipmentTypeId = `eq-type-bom-${suffix}`
  db.prepare(`
    INSERT INTO equipment_types (
      id, code, name, default_purchase_price,
      default_depreciable_life_years, default_residual_value,
      default_depreciation_method, default_total_capacity, default_capacity_unit,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    equipmentTypeId,
    `EQT-BOM-${suffix}`,
    `BOM设备类型-${suffix}`,
    60000,
    5,
    0,
    'straight_line',
    0,
    'minutes',
    status,
  )
  return equipmentTypeId
}

function seedOutboundAbcDetail(db: any, suffix: string, bomId: string) {
  const id = `abc-detail-bom-${suffix}`
  db.prepare(`
    INSERT INTO outbound_abc_details (
      id, outbound_id, bom_id, project_id, sample_count, slide_count,
      material_cost, activity_cost, total_cost, cost_status, cost_month
    )
    VALUES (?, ?, ?, NULL, 1, 1, 10, 5, 15, 'costed', '2026-06')
  `).run(id, `outbound-bom-${suffix}`, bomId)
  return id
}

async function createProjectWithBom(app: any, token: string, suffix: string, bomId: string) {
  const res = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code: `PRJ-BOM-BATCH-${suffix}`,
      name: `引用BOM项目-${suffix}`,
      type: 'ihc',
      bomId,
    })
  expect(res.status).toBe(201)
  return res.body.data.id as string
}

async function createProject(app: any, token: string, suffix: string, extra: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code: `PRJ-BOM-SVC-${suffix}`,
      name: `BOM服务关联-${suffix}`,
      type: 'ihc',
      ...extra,
    })
  expect(res.status).toBe(201)
  return res.body.data.id as string
}

describe('BOM 批量操作', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
    db.prepare(`
      INSERT OR IGNORE INTO material_categories (id, code, name, level)
      VALUES (?, ?, ?, ?)
    `).run('cat-bom-batch', 'CBOM', 'BOM测试分类', 1)
  })

  it('BOM-AUTH-001: 技术员拥有BOM模块权限时可创建BOM', async () => {
    const technicianToken = await loginTechnician(app)
    const suffix = `tech-auth-${Date.now()}`
    const materialId = await createMaterial(app, token, suffix)

    const res = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        code: `BOM-AUTH-${suffix}`,
        name: `技术员BOM-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
      })

    expect(res.status).toBe(201)
    const bom = db.prepare('SELECT code, name FROM boms WHERE id = ?').get(res.body.data.id) as any
    expect(bom).toMatchObject({
      code: `BOM-AUTH-${suffix}`,
      name: `技术员BOM-${suffix}`,
    })
  })

  it('BOM-CODE-001: 编辑BOM时不允许修改BOM编号', async () => {
    const suffix = `code-immutable-${Date.now()}`
    const bomId = await createBom(app, token, suffix)
    const original = db.prepare('SELECT code FROM boms WHERE id = ?').get(bomId) as any

    const res = await request(app)
      .put(`/api/v1/boms/${bomId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-CODE-CHANGED-${suffix}`,
        name: `试图改编号BOM-${suffix}`,
      })

    expect(res.status).toBe(400)
    expect(res.body.error?.message).toContain('BOM编号创建后不允许修改')
    const after = db.prepare('SELECT code, name FROM boms WHERE id = ?').get(bomId) as any
    expect(after.code).toBe(original.code)
    expect(after.name).toBe(`批量BOM-${suffix}`)
  })

  it('BOM-BATCH-001: 被检测项目引用的BOM不可删除', async () => {
    const suffix = `ref-${Date.now()}`
    const bomId = await createBom(app, token, suffix)
    await createProjectWithBom(app, token, suffix, bomId)

    const res = await request(app)
      .delete(`/api/v1/boms/${bomId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    const bom = db.prepare('SELECT is_deleted FROM boms WHERE id = ?').get(bomId) as any
    expect(Number(bom.is_deleted)).toBe(0)
  })

  it('BOM-BATCH-002: 批量删除遇到引用时整批拒绝，不部分删除', async () => {
    const suffix = `delete-${Date.now()}`
    const freeBomId = await createBom(app, token, `${suffix}-free`)
    const referencedBomId = await createBom(app, token, `${suffix}-ref`)
    await createProjectWithBom(app, token, suffix, referencedBomId)

    const res = await request(app)
      .delete('/api/v1/boms/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [freeBomId, referencedBomId] })

    expect(res.status).toBe(409)
    const rows = db.prepare('SELECT id, is_deleted FROM boms WHERE id IN (?, ?)')
      .all(freeBomId, referencedBomId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.is_deleted) === 0)).toBe(true)
  })

  it('BOM-DELETE-001: 删除前检查返回项目和ABC成本明细引用，删除时不破坏ABC追溯链', async () => {
    const suffix = `check-${Date.now()}`
    const bomId = await createBom(app, token, suffix)
    await createProjectWithBom(app, token, suffix, bomId)
    seedOutboundAbcDetail(db, suffix, bomId)

    const check = await request(app)
      .get(`/api/v1/boms/${bomId}/check-deletable`)
      .set('Authorization', `Bearer ${token}`)

    expect(check.status).toBe(200)
    expect(check.body.data).toMatchObject({
      deletable: false,
      impacts: {
        projectCount: 1,
        outboundDetailCount: 1,
      },
    })
    expect(check.body.data.reasons).toEqual(expect.arrayContaining([
      '存在 1 个检测项目引用',
      '存在 1 条出库成本明细引用',
    ]))

    const deleted = await request(app)
      .delete(`/api/v1/boms/${bomId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(deleted.status).toBe(409)
    const row = db.prepare('SELECT is_deleted FROM boms WHERE id = ?').get(bomId) as any
    expect(Number(row.is_deleted)).toBe(0)
    const detailCount = db.prepare('SELECT COUNT(*) as count FROM outbound_abc_details WHERE bom_id = ?')
      .get(bomId) as any
    expect(detailCount.count).toBe(1)
  })

  it('BOM-BATCH-003: 批量状态遇到不存在BOM时整批拒绝，不部分更新', async () => {
    const suffix = `status-${Date.now()}`
    const firstId = await createBom(app, token, `${suffix}-1`)
    const secondId = await createBom(app, token, `${suffix}-2`)

    const res = await request(app)
      .patch('/api/v1/boms/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId, `missing-${suffix}`], status: 'inactive' })

    expect(res.status).toBe(404)
    const rows = db.prepare('SELECT id, status FROM boms WHERE id IN (?, ?)')
      .all(firstId, secondId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.status) === 1)).toBe(true)
  })

  it('BOM-BATCH-004: 批量状态有效时一次更新所有选中BOM', async () => {
    const suffix = `valid-${Date.now()}`
    const firstId = await createBom(app, token, `${suffix}-1`)
    const secondId = await createBom(app, token, `${suffix}-2`)

    const res = await request(app)
      .patch('/api/v1/boms/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId], status: 'inactive' })

    expect(res.status).toBe(200)
    expect(res.body.data.updatedCount).toBe(2)
    const rows = db.prepare('SELECT id, status FROM boms WHERE id IN (?, ?)')
      .all(firstId, secondId) as any[]
    expect(rows.every(row => Number(row.status) === 0)).toBe(true)
  })

  it('BOM-STATUS-001: 被启用检测项目引用的BOM不可停用', async () => {
    const suffix = `status-ref-${Date.now()}`
    const bomId = await createBom(app, token, suffix)
    const projectId = await createProjectWithBom(app, token, suffix, bomId)

    const res = await request(app)
      .patch(`/api/v1/boms/${bomId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' })

    expect(res.status).toBe(409)
    const bom = db.prepare('SELECT status FROM boms WHERE id = ?').get(bomId) as any
    const project = db.prepare('SELECT bom_id, status FROM projects WHERE id = ?').get(projectId) as any
    expect(Number(bom.status)).toBe(1)
    expect(project.bom_id).toBe(bomId)
    expect(Number(project.status)).toBe(1)
  })

  it('BOM-STATUS-003: BOM停用前检查展示启用检测项目引用影响', async () => {
    const suffix = `status-check-${Date.now()}`
    const bomId = await createBom(app, token, suffix)
    await createProjectWithBom(app, token, suffix, bomId)

    const res = await request(app)
      .get(`/api/v1/boms/${bomId}/check-status?status=inactive`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      targetStatus: 'inactive',
      canChange: false,
      impacts: {
        activeProjectCount: 1,
      },
    })
    expect(res.body.data.reasons).toEqual(expect.arrayContaining([
      '存在 1 个启用检测项目引用',
    ]))
  })

  it('BOM-STATUS-004: BOM启用前检查阻断停用物料依赖，状态更新不落库', async () => {
    const suffix = `activate-material-${Date.now()}`
    const bomId = await createBom(app, token, suffix)
    const material = db.prepare(`
      SELECT bi.material_id
      FROM bom_items bi
      WHERE bi.bom_id = ?
      LIMIT 1
    `).get(bomId) as any
    db.prepare('UPDATE boms SET status = 0 WHERE id = ?').run(bomId)
    db.prepare('UPDATE materials SET status = 0 WHERE id = ?').run(material.material_id)

    const check = await request(app)
      .get(`/api/v1/boms/${bomId}/check-status?status=active`)
      .set('Authorization', `Bearer ${token}`)

    expect(check.status).toBe(200)
    expect(check.body.data).toMatchObject({
      targetStatus: 'active',
      canChange: false,
      impacts: {
        inactiveMaterialCount: 1,
      },
    })
    expect(check.body.data.reasons).toEqual(expect.arrayContaining([
      '存在 1 个停用或已删除物料依赖',
    ]))

    const activated = await request(app)
      .patch(`/api/v1/boms/${bomId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' })

    expect(activated.status).toBe(409)
    const bom = db.prepare('SELECT status FROM boms WHERE id = ?').get(bomId) as any
    expect(Number(bom.status)).toBe(0)
  })

  it('BOM-STATUS-006: 历史无核心物料BOM不可重新启用', async () => {
    const suffix = `activate-empty-${Date.now()}`
    const bomId = `bom-empty-activate-${suffix}`
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 0)')
      .run(bomId, `BOM-EMPTY-ACT-${suffix}`, `历史空BOM-${suffix}`, 'v1.0', 'ihc')

    const check = await request(app)
      .get(`/api/v1/boms/${bomId}/check-status?status=active`)
      .set('Authorization', `Bearer ${token}`)

    expect(check.status).toBe(200)
    expect(check.body.data).toMatchObject({
      targetStatus: 'active',
      canChange: false,
      impacts: {
        coreMaterialCount: 0,
      },
    })
    expect(check.body.data.reasons).toEqual(expect.arrayContaining([
      '缺少核心物料明细',
    ]))

    const activated = await request(app)
      .patch(`/api/v1/boms/${bomId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'active' })

    expect(activated.status).toBe(409)
    const bom = db.prepare('SELECT status FROM boms WHERE id = ?').get(bomId) as any
    expect(Number(bom.status)).toBe(0)
  })

  it('BOM-STATUS-002: 批量停用遇到被项目引用BOM时整批拒绝', async () => {
    const suffix = `batch-status-ref-${Date.now()}`
    const freeBomId = await createBom(app, token, `${suffix}-free`)
    const referencedBomId = await createBom(app, token, `${suffix}-ref`)
    const projectId = await createProjectWithBom(app, token, suffix, referencedBomId)

    const res = await request(app)
      .patch('/api/v1/boms/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [freeBomId, referencedBomId], status: 'inactive' })

    expect(res.status).toBe(409)
    const rows = db.prepare('SELECT id, status FROM boms WHERE id IN (?, ?)')
      .all(freeBomId, referencedBomId) as any[]
    const project = db.prepare('SELECT bom_id, status FROM projects WHERE id = ?').get(projectId) as any
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.status) === 1)).toBe(true)
    expect(project.bom_id).toBe(referencedBomId)
    expect(Number(project.status)).toBe(1)
  })

  it('BOM-STATUS-005: 批量启用遇到停用设备类型依赖时整批拒绝，不部分启用', async () => {
    const suffix = `batch-activate-eq-type-${Date.now()}`
    const freeBomId = await createBom(app, token, `${suffix}-free`)
    const blockedBomId = await createBom(app, token, `${suffix}-blocked`)
    const equipmentTypeId = seedEquipmentType(db, suffix, 1)
    db.prepare(`
      INSERT INTO bom_equipment_templates (id, bom_id, equipment_type_id, usage_minutes)
      VALUES (?, ?, ?, ?)
    `).run(`bet-${suffix}`, blockedBomId, equipmentTypeId, 12)
    db.prepare('UPDATE boms SET status = 0 WHERE id IN (?, ?)').run(freeBomId, blockedBomId)
    db.prepare('UPDATE equipment_types SET status = 0 WHERE id = ?').run(equipmentTypeId)

    const check = await request(app)
      .get(`/api/v1/boms/${blockedBomId}/check-status?status=active`)
      .set('Authorization', `Bearer ${token}`)

    expect(check.status).toBe(200)
    expect(check.body.data).toMatchObject({
      targetStatus: 'active',
      canChange: false,
      impacts: {
        inactiveEquipmentTypeCount: 1,
      },
    })

    const res = await request(app)
      .patch('/api/v1/boms/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [freeBomId, blockedBomId], status: 'active' })

    expect(res.status).toBe(409)
    const rows = db.prepare('SELECT id, status FROM boms WHERE id IN (?, ?)')
      .all(freeBomId, blockedBomId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.status) === 0)).toBe(true)
  })

  it('BOM-STATUS-007: 批量启用遇到历史无核心物料BOM时整批拒绝', async () => {
    const suffix = `batch-activate-empty-${Date.now()}`
    const validBomId = await createBom(app, token, `${suffix}-valid`)
    const emptyBomId = `bom-empty-batch-${suffix}`
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 0)')
      .run(emptyBomId, `BOM-EMPTY-BATCH-${suffix}`, `批量历史空BOM-${suffix}`, 'v1.0', 'ihc')
    db.prepare('UPDATE boms SET status = 0 WHERE id = ?').run(validBomId)

    const res = await request(app)
      .patch('/api/v1/boms/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [validBomId, emptyBomId], status: 'active' })

    expect(res.status).toBe(409)
    expect(res.body.error?.code).toBe('BOM_DEPENDENCY_INACTIVE')
    const rows = db.prepare('SELECT id, status FROM boms WHERE id IN (?, ?)')
      .all(validBomId, emptyBomId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.status) === 0)).toBe(true)
  })

  it('BOM-EQUIP-001: 设备模板必须选择启用设备且使用分钟数大于0', async () => {
    const suffix = `equip-invalid-${Date.now()}`
    const materialId = await createMaterialForBom(app, token, suffix)
    const inactiveEquipmentId = seedEquipment(db, `${suffix}-inactive`, 0)

    const zeroUsage = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-EQUIP-ZERO-${suffix}`,
        name: `设备模板零分钟-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
        equipmentTemplates: [{ equipmentId: inactiveEquipmentId, usageMinutes: 0 }],
      })

    expect(zeroUsage.status).toBe(400)
    expect(db.prepare('SELECT COUNT(*) as count FROM bom_equipment_templates WHERE equipment_id = ?')
      .get(inactiveEquipmentId) as any).toMatchObject({ count: 0 })

    const inactive = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-EQUIP-INACTIVE-${suffix}`,
        name: `设备模板停用设备-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
        equipmentTemplates: [{ equipmentId: inactiveEquipmentId, usageMinutes: 30 }],
      })

    expect(inactive.status).toBe(409)
    expect(db.prepare('SELECT COUNT(*) as count FROM boms WHERE code IN (?, ?)')
      .get(`BOM-EQUIP-ZERO-${suffix}`, `BOM-EQUIP-INACTIVE-${suffix}`) as any).toMatchObject({ count: 0 })
  })

  it('BOM-EQUIP-002: 设备模板必须选择启用设备类型且不能同时选择设备和类型', async () => {
    const suffix = `equip-type-${Date.now()}`
    const materialId = await createMaterialForBom(app, token, suffix)
    const equipmentId = seedEquipment(db, `${suffix}-active`, 1)
    const inactiveTypeId = seedEquipmentType(db, `${suffix}-inactive`, 0)

    const bothSelected = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-EQUIP-BOTH-${suffix}`,
        name: `设备模板双选-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
        equipmentTemplates: [{ equipmentId, equipmentTypeId: inactiveTypeId, usageMinutes: 30 }],
      })

    expect(bothSelected.status).toBe(400)

    const inactiveType = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-EQUIP-TYPE-INACTIVE-${suffix}`,
        name: `设备模板停用类型-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
        equipmentTemplates: [{ equipmentTypeId: inactiveTypeId, usageMinutes: 30 }],
      })

    expect(inactiveType.status).toBe(409)
  })

  it('BOM-EQUIP-003: 启用设备类型模板可写入并参与标准设备成本', async () => {
    const suffix = `equip-ok-${Date.now()}`
    const materialId = await createMaterialForBom(app, token, suffix)
    const equipmentTypeId = seedEquipmentType(db, suffix, 1)

    const res = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-EQUIP-OK-${suffix}`,
        name: `设备模板有效-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
        equipmentTemplates: [{ equipmentTypeId, usageMinutes: 45 }],
      })

    expect(res.status).toBe(201)
    const bom = db.prepare('SELECT id, standard_equipment_cost FROM boms WHERE id = ?').get(res.body.data.id) as any
    expect(Number(bom.standard_equipment_cost)).toBeGreaterThan(0)
    const template = db.prepare('SELECT equipment_type_id, usage_minutes FROM bom_equipment_templates WHERE bom_id = ?').get(bom.id) as any
    expect(template).toMatchObject({ equipment_type_id: equipmentTypeId, usage_minutes: 45 })
  })

  it('BOM-MATERIAL-001: 创建BOM时同一物料不能跨核心/通用/质控分组重复配置', async () => {
    const suffix = `mat-dup-create-${Date.now()}`
    const materialId = await createMaterial(app, token, `dup-${suffix}`)

    const res = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-MAT-DUP-${suffix}`,
        name: `重复物料BOM-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
        generalReagents: [{ materialId, usagePerSample: 0.5, unit: 'ml' }],
      })

    expect(res.status).toBe(409)
    expect(res.body.error?.message).toContain('重复物料')
    expect(db.prepare('SELECT COUNT(*) as count FROM boms WHERE code = ?')
      .get(`BOM-MAT-DUP-${suffix}`) as any).toMatchObject({ count: 0 })
  })

  it('BOM-MATERIAL-002: 编辑BOM时同一物料跨分组重复配置会整单拒绝且不覆盖原明细', async () => {
    const suffix = `mat-dup-update-${Date.now()}`
    const firstMaterialId = await createMaterial(app, token, `dup-first-${suffix}`)
    const secondMaterialId = await createMaterial(app, token, `dup-second-${suffix}`)
    const bomId = await createBom(app, token, suffix)

    const res = await request(app)
      .put(`/api/v1/boms/${bomId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `重复物料编辑BOM-${suffix}`,
        materials: [{ materialId: firstMaterialId, usagePerSample: 1, unit: '瓶' }],
        qualityControls: [{ materialId: firstMaterialId, usagePerBatch: 1, coversSamples: 10, unit: '片' }],
        generalConsumables: [{ materialId: secondMaterialId, usagePerSample: 1, unit: '个' }],
      })

    expect(res.status).toBe(409)
    expect(res.body.error?.message).toContain('重复物料')
    const coreRows = db.prepare('SELECT material_id FROM bom_items WHERE bom_id = ?').all(bomId) as any[]
    const qcRows = db.prepare('SELECT material_id FROM bom_quality_controls WHERE bom_id = ?').all(bomId) as any[]
    expect(coreRows).toHaveLength(1)
    expect(coreRows[0].material_id).not.toBe(firstMaterialId)
    expect(qcRows).toHaveLength(0)
  })

  it('BOM-SERVICE-001: 创建BOM关联启用检测服务时同步项目BOM并返回服务名称', async () => {
    const suffix = `service-ok-${Date.now()}`
    const materialId = await createMaterial(app, token, `svc-${suffix}`)
    const serviceId = await createProject(app, token, suffix)

    const created = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-SERVICE-OK-${suffix}`,
        name: `服务关联BOM-${suffix}`,
        type: 'ihc',
        serviceId,
        materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
      })

    expect(created.status).toBe(201)
    const bomId = created.body.data.id
    const project = db.prepare('SELECT bom_id FROM projects WHERE id = ?').get(serviceId) as any
    expect(project.bom_id).toBe(bomId)

    const detail = await request(app)
      .get(`/api/v1/boms/${bomId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(detail.status).toBe(200)
    expect(detail.body.data).toMatchObject({
      serviceId,
      serviceName: `BOM服务关联-${suffix}`,
    })

    const list = await request(app)
      .get('/api/v1/boms')
      .query({ keyword: suffix, page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)

    expect(list.status).toBe(200)
    expect(list.body.data.list[0]).toMatchObject({
      id: bomId,
      serviceId,
      serviceName: `BOM服务关联-${suffix}`,
    })
  })

  it('BOM-SUPPORT-001: BOM列表和详情按当前库存实时计算可支撑样本数', async () => {
    const suffix = `support-${Date.now()}`
    const firstMaterialId = await createMaterial(app, token, `support-a-${suffix}`)
    const secondMaterialId = await createMaterial(app, token, `support-b-${suffix}`)

    db.prepare('UPDATE inventory SET stock = ?, locked_stock = ? WHERE material_id = ?')
      .run(18, 0, firstMaterialId)
    db.prepare('UPDATE inventory SET stock = ?, locked_stock = ? WHERE material_id = ?')
      .run(8, 2, secondMaterialId)

    const created = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-SUPPORT-${suffix}`,
        name: `实时支撑能力BOM-${suffix}`,
        type: 'ihc',
        supportableSamples: 999,
        materials: [
          { materialId: firstMaterialId, usagePerSample: 3, unit: '瓶' },
          { materialId: secondMaterialId, usagePerSample: 2, unit: '瓶' },
        ],
      })

    expect(created.status).toBe(201)
    const bomId = created.body.data.id

    const list = await request(app)
      .get('/api/v1/boms')
      .query({ keyword: suffix, page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)

    expect(list.status).toBe(200)
    expect(list.body.data.list[0]).toMatchObject({
      id: bomId,
      supportableSamples: 3,
    })

    const detail = await request(app)
      .get(`/api/v1/boms/${bomId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(detail.status).toBe(200)
    expect(detail.body.data.supportableSamples).toBe(3)

    db.prepare('UPDATE materials SET is_deleted = 1 WHERE id = ?')
      .run(secondMaterialId)

    const detailAfterMaterialDelete = await request(app)
      .get(`/api/v1/boms/${bomId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(detailAfterMaterialDelete.status).toBe(200)
    expect(detailAfterMaterialDelete.body.data.supportableSamples).toBe(0)
  })

  it('BOM-SERVICE-002: BOM拒绝关联停用或类型不匹配的检测服务', async () => {
    const suffix = `service-invalid-${Date.now()}`
    const materialId = await createMaterial(app, token, `svc-invalid-${suffix}`)
    const inactiveServiceId = await createProject(app, token, `${suffix}-inactive`, { status: 'inactive' })
    const mismatchServiceId = await createProject(app, token, `${suffix}-mismatch`, { type: 'he' })

    const inactive = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-SERVICE-INACTIVE-${suffix}`,
        name: `停用服务BOM-${suffix}`,
        type: 'ihc',
        serviceId: inactiveServiceId,
        materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
      })

    expect(inactive.status).toBe(409)

    const mismatch = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-SERVICE-MISMATCH-${suffix}`,
        name: `类型不匹配服务BOM-${suffix}`,
        type: 'ihc',
        serviceId: mismatchServiceId,
        materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
      })

    expect(mismatch.status).toBe(422)
    expect(db.prepare('SELECT COUNT(*) as count FROM boms WHERE code IN (?, ?)')
      .get(`BOM-SERVICE-INACTIVE-${suffix}`, `BOM-SERVICE-MISMATCH-${suffix}`) as any).toMatchObject({ count: 0 })
  })

  it('BOM-SERVICE-003: 编辑BOM更换检测服务时清旧关联并同步新关联', async () => {
    const suffix = `service-edit-${Date.now()}`
    const materialId = await createMaterial(app, token, `svc-edit-${suffix}`)
    const firstServiceId = await createProject(app, token, `${suffix}-first`)
    const secondServiceId = await createProject(app, token, `${suffix}-second`)

    const created = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-SERVICE-EDIT-${suffix}`,
        name: `服务编辑BOM-${suffix}`,
        type: 'ihc',
        serviceId: firstServiceId,
        materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
      })
    expect(created.status).toBe(201)
    const bomId = created.body.data.id

    const updated = await request(app)
      .put(`/api/v1/boms/${bomId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `服务编辑BOM-${suffix}-更新`,
        serviceId: secondServiceId,
      })

    expect(updated.status).toBe(200)
    const rows = db.prepare('SELECT id, bom_id FROM projects WHERE id IN (?, ?)')
      .all(firstServiceId, secondServiceId) as any[]
    const byId = new Map(rows.map(row => [row.id, row.bom_id]))
    expect(byId.get(firstServiceId)).toBeNull()
    expect(byId.get(secondServiceId)).toBe(bomId)
  })

  it('BOM-TEXT-001: 创建和更新BOM时拦截危险文本并保存清理后的本体和明细文本', async () => {
    const suffix = `text-${Date.now()}`
    const materialId = await createMaterial(app, token, `text-${suffix}`)

    const blockedCreate = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-TEXT-BAD-${suffix}`,
        name: '<script>alert(1)</script>',
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
      })

    expect(blockedCreate.status).toBe(400)
    expect(blockedCreate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    expect(db.prepare('SELECT COUNT(*) as count FROM boms WHERE code = ?')
      .get(`BOM-TEXT-BAD-${suffix}`) as any).toMatchObject({ count: 0 })

    const blockedItemText = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `BOM-TEXT-ITEM-BAD-${suffix}`,
        name: `明细危险BOM-${suffix}`,
        type: 'ihc',
        materials: [{ materialId, usagePerSample: 1, unit: '瓶', groupName: "' OR '1'='1" }],
      })

    expect(blockedItemText.status).toBe(400)
    expect(blockedItemText.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    expect(db.prepare('SELECT COUNT(*) as count FROM boms WHERE code = ?')
      .get(`BOM-TEXT-ITEM-BAD-${suffix}`) as any).toMatchObject({ count: 0 })

    const created = await request(app)
      .post('/api/v1/boms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `  BOM-TEXT-${suffix}  `,
        name: `  B195 安全BOM ${suffix}  `,
        type: 'ihc',
        description: '  标准免疫组化流程  ',
        feeCategory: '  免疫组化  ',
        materials: [{ materialId, usagePerSample: 1, unit: '  瓶  ', groupName: '  主染组  ' }],
      })

    expect(created.status).toBe(201)
    const bom = db.prepare('SELECT code, name, description, fee_category FROM boms WHERE id = ?')
      .get(created.body.data.id) as any
    expect(bom).toMatchObject({
      code: `BOM-TEXT-${suffix}`,
      name: `B195 安全BOM ${suffix}`,
      description: '标准免疫组化流程',
      fee_category: '免疫组化',
    })
    const item = db.prepare('SELECT unit, group_name FROM bom_items WHERE bom_id = ?')
      .get(created.body.data.id) as any
    expect(item).toMatchObject({ unit: '瓶', group_name: '主染组' })

    const blockedUpdate = await request(app)
      .put(`/api/v1/boms/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: '<script>alert(1)</script>' })

    expect(blockedUpdate.status).toBe(400)
    expect(blockedUpdate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const unchanged = db.prepare('SELECT description FROM boms WHERE id = ?')
      .get(created.body.data.id) as any
    expect(unchanged.description).toBe('标准免疫组化流程')
  })
})
