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

async function loginWarehouseManager(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'wangkq', password: 'CoreOne2026!' })
  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedRefs(db: any, suffix: string) {
  const categoryId = `cat-mat-guard-${suffix}`
  const supplierId = `sup-mat-guard-${suffix}`
  const locationId = `loc-mat-guard-${suffix}`
  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-MAT-GUARD-${suffix}`, '物料保护测试分类', 1)
  db.prepare('INSERT INTO suppliers (id, code, name) VALUES (?, ?, ?)')
    .run(supplierId, `SUP-MAT-GUARD-${suffix}`, '物料保护测试供应商')
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-MAT-GUARD-${suffix}`, '物料保护测试库位', 'shelf', 'A区')
  return { categoryId, supplierId, locationId }
}

async function createMaterial(app: any, token: string, refs: any, suffix: string) {
  const res = await request(app)
    .post('/api/v1/materials')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code: `MAT-GUARD-${suffix}`,
      name: `物料保护-${suffix}`,
      spec: '1ml',
      unit: '瓶',
      categoryId: refs.categoryId,
      supplierId: refs.supplierId,
      locationId: refs.locationId,
    })
  expect(res.status).toBe(201)
  return res.body.data.id as string
}

describe('物料删除与批量状态保护', () => {
  let app: any
  let db: any
  let token: string
  let warehouseToken: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
    warehouseToken = await loginWarehouseManager(app)
  })

  it('MAT-GUARD-001: 物料当前库存为0但被BOM引用时不可删除', async () => {
    const suffix = `bom-${Date.now()}`
    const refs = seedRefs(db, suffix)
    const materialId = await createMaterial(app, token, refs, suffix)
    const bomId = `bom-mat-guard-${suffix}`
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(bomId, `BOM-MAT-GUARD-${suffix}`, '物料保护BOM', 'v1.0', 'ihc')
    db.prepare('INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit) VALUES (?, ?, ?, ?, ?)')
      .run(`bi-mat-guard-${suffix}`, bomId, materialId, 1, '瓶')

    const res = await request(app)
      .delete(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    const material = db.prepare('SELECT is_deleted FROM materials WHERE id = ?').get(materialId) as any
    expect(Number(material.is_deleted)).toBe(0)
  })

  it('MAT-DELETE-001: 物料删除前检查必须展示库存、BOM和流水影响', async () => {
    const suffix = `delete-check-${Date.now()}`
    const refs = seedRefs(db, suffix)
    const materialId = await createMaterial(app, token, refs, suffix)
    const bomId = `bom-mat-delete-${suffix}`
    db.prepare('UPDATE inventory SET stock = 3 WHERE material_id = ?').run(materialId)
    db.prepare('INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock) VALUES (?, ?, ?, 3, 0)')
      .run(`invloc-mat-delete-${suffix}`, materialId, refs.locationId)
    db.prepare('INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(`log-mat-delete-${suffix}`, 'inbound', materialId, 3, 0, 3, `inbound-mat-delete-${suffix}`, 'inbound', 'admin')
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(bomId, `BOM-MAT-DELETE-${suffix}`, '物料删除检查BOM', 'v1.0', 'ihc')
    db.prepare('INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit) VALUES (?, ?, ?, ?, ?)')
      .run(`bi-mat-delete-${suffix}`, bomId, materialId, 1, '瓶')

    const check = await request(app)
      .get(`/api/v1/materials/${materialId}/check-deletable`)
      .set('Authorization', `Bearer ${token}`)

    expect(check.status).toBe(200)
    expect(check.body.data).toMatchObject({
      deletable: false,
      impacts: {
        currentInventoryCount: 1,
        inventoryLocationCount: 1,
        bomCount: 1,
        stockLogCount: 1,
      },
    })
    expect(check.body.data.reasons).toEqual(expect.arrayContaining([
      '存在 1 条当前库存引用',
      '存在 1 条库位库存引用',
      '存在 1 条BOM明细引用',
      '存在 1 条库存流水引用',
    ]))

    const deleted = await request(app)
      .delete(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(deleted.status).toBe(409)
  })

  it('MAT-DELETE-004: 仓库管理员可执行物料删除影响检查', async () => {
    const suffix = `warehouse-delete-check-${Date.now()}`
    const refs = seedRefs(db, suffix)
    const materialId = await createMaterial(app, token, refs, suffix)

    const check = await request(app)
      .get(`/api/v1/materials/${materialId}/check-deletable`)
      .set('Authorization', `Bearer ${warehouseToken}`)

    expect(check.status).toBe(200)
    expect(check.body.data).toMatchObject({
      material: {
        id: materialId,
        code: `MAT-GUARD-${suffix}`,
      },
      deletable: true,
    })
  })

  it('MAT-GUARD-002: 批量状态遇到不存在物料时整批拒绝，不部分更新', async () => {
    const suffix = `status-${Date.now()}`
    const refs = seedRefs(db, suffix)
    const firstId = await createMaterial(app, token, refs, `${suffix}-1`)
    const secondId = await createMaterial(app, token, refs, `${suffix}-2`)

    const res = await request(app)
      .patch('/api/v1/materials/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId, `missing-${suffix}`], status: 'inactive' })

    expect(res.status).toBe(404)
    const rows = db.prepare('SELECT id, status FROM materials WHERE id IN (?, ?)')
      .all(firstId, secondId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.status) === 1)).toBe(true)
  })

  it('MAT-GUARD-003: 批量状态可成功停用和启用多个物料', async () => {
    const suffix = `status-ok-${Date.now()}`
    const refs = seedRefs(db, suffix)
    const firstId = await createMaterial(app, token, refs, `${suffix}-1`)
    const secondId = await createMaterial(app, token, refs, `${suffix}-2`)

    const inactiveRes = await request(app)
      .patch('/api/v1/materials/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId], status: 'inactive' })

    expect(inactiveRes.status).toBe(200)
    expect(inactiveRes.body.data.updatedCount).toBe(2)
    let rows = db.prepare('SELECT id, status FROM materials WHERE id IN (?, ?)')
      .all(firstId, secondId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.status) === 0)).toBe(true)

    const activeRes = await request(app)
      .patch('/api/v1/materials/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId], status: 'active' })

    expect(activeRes.status).toBe(200)
    expect(activeRes.body.data.updatedCount).toBe(2)
    rows = db.prepare('SELECT id, status FROM materials WHERE id IN (?, ?)')
      .all(firstId, secondId) as any[]
    expect(rows.every(row => Number(row.status) === 1)).toBe(true)
  })

  it('MAT-DELETE-002: 批量删除遇到被引用物料时整批拒绝，不部分删除', async () => {
    const suffix = `batch-delete-ref-${Date.now()}`
    const freeRefs = seedRefs(db, `${suffix}-free`)
    const blockedRefs = seedRefs(db, `${suffix}-blocked`)
    const freeId = await createMaterial(app, token, freeRefs, `${suffix}-free`)
    const blockedId = await createMaterial(app, token, blockedRefs, `${suffix}-blocked`)
    db.prepare('UPDATE inventory SET stock = 6 WHERE material_id = ?').run(blockedId)

    const res = await request(app)
      .delete('/api/v1/materials/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [freeId, blockedId] })

    expect(res.status).toBe(409)
    const rows = db.prepare('SELECT id, is_deleted FROM materials WHERE id IN (?, ?)')
      .all(freeId, blockedId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.is_deleted) === 0)).toBe(true)
  })

  it('MAT-DELETE-003: 批量删除无引用物料时一次删除所有选中物料', async () => {
    const suffix = `batch-delete-ok-${Date.now()}`
    const refs = seedRefs(db, suffix)
    const firstId = await createMaterial(app, token, refs, `${suffix}-1`)
    const secondId = await createMaterial(app, token, refs, `${suffix}-2`)

    const res = await request(app)
      .delete('/api/v1/materials/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId] })

    expect(res.status).toBe(200)
    expect(res.body.data.deletedCount).toBe(2)
    const rows = db.prepare('SELECT id, is_deleted FROM materials WHERE id IN (?, ?)')
      .all(firstId, secondId) as any[]
    expect(rows.every(row => Number(row.is_deleted) === 1)).toBe(true)
  })

  it('MAT-STATUS-001: 更新物料状态必须拒绝页面选项以外的状态', async () => {
    const suffix = `invalid-status-${Date.now()}`
    const refs = seedRefs(db, suffix)
    const materialId = await createMaterial(app, token, refs, suffix)

    const res = await request(app)
      .put(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'archived' })

    expect(res.status).toBe(400)
    const material = db.prepare('SELECT status FROM materials WHERE id = ?').get(materialId) as any
    expect(Number(material.status)).toBe(1)
  })

  it('MAT-STATUS-002: 有当前库存或启用BOM引用的物料不可停用', async () => {
    const suffix = `status-ref-${Date.now()}`
    const stockRefs = seedRefs(db, `${suffix}-stock`)
    const bomRefs = seedRefs(db, `${suffix}-bom`)
    const stockedMaterialId = await createMaterial(app, token, stockRefs, `${suffix}-stock`)
    const bomMaterialId = await createMaterial(app, token, bomRefs, `${suffix}-bom`)
    db.prepare('UPDATE inventory SET stock = 5 WHERE material_id = ?').run(stockedMaterialId)
    const bomId = `bom-mat-status-${suffix}`
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(bomId, `BOM-MAT-STATUS-${suffix}`, '物料停用保护BOM', 'v1.0', 'ihc')
    db.prepare('INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit) VALUES (?, ?, ?, ?, ?)')
      .run(`bi-mat-status-${suffix}`, bomId, bomMaterialId, 1, '瓶')

    const stockRes = await request(app)
      .put(`/api/v1/materials/${stockedMaterialId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' })
    const bomRes = await request(app)
      .put(`/api/v1/materials/${bomMaterialId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' })

    expect(stockRes.status).toBe(409)
    expect(bomRes.status).toBe(409)
    const rows = db.prepare('SELECT id, status FROM materials WHERE id IN (?, ?)')
      .all(stockedMaterialId, bomMaterialId) as any[]
    expect(rows.every(row => Number(row.status) === 1)).toBe(true)
    const stock = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(stockedMaterialId) as any
    expect(Number(stock.stock)).toBe(5)
  })

  it('MAT-STATUS-005: 物料停用前检查必须展示库存和启用BOM影响', async () => {
    const suffix = `status-check-${Date.now()}`
    const refs = seedRefs(db, suffix)
    const materialId = await createMaterial(app, token, refs, suffix)
    const bomId = `bom-mat-status-check-${suffix}`
    db.prepare('UPDATE inventory SET stock = 2 WHERE material_id = ?').run(materialId)
    db.prepare('INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock) VALUES (?, ?, ?, 2, 0)')
      .run(`invloc-mat-status-check-${suffix}`, materialId, refs.locationId)
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(bomId, `BOM-MAT-STATUS-CHECK-${suffix}`, '物料停用检查BOM', 'v1.0', 'ihc')
    db.prepare('INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit) VALUES (?, ?, ?, ?, ?)')
      .run(`bi-mat-status-check-${suffix}`, bomId, materialId, 1, '瓶')

    const check = await request(app)
      .get(`/api/v1/materials/${materialId}/check-status`)
      .query({ status: 'inactive' })
      .set('Authorization', `Bearer ${token}`)

    expect(check.status).toBe(200)
    expect(check.body.data).toMatchObject({
      canChange: false,
      targetStatus: 'inactive',
      impacts: {
        currentInventoryCount: 1,
        inventoryLocationCount: 1,
        activeBomCount: 1,
      },
    })
    expect(check.body.data.reasons).toEqual(expect.arrayContaining([
      '存在 1 条当前库存引用',
      '存在 1 条库位库存引用',
      '存在 1 条启用BOM明细引用',
    ]))

    const res = await request(app)
      .put(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' })

    expect(res.status).toBe(409)
  })

  it('MAT-STATUS-003: 批量停用遇到库存或BOM引用时整批拒绝', async () => {
    const suffix = `batch-inactive-${Date.now()}`
    const freeRefs = seedRefs(db, `${suffix}-free`)
    const blockedRefs = seedRefs(db, `${suffix}-blocked`)
    const freeId = await createMaterial(app, token, freeRefs, `${suffix}-free`)
    const blockedId = await createMaterial(app, token, blockedRefs, `${suffix}-blocked`)
    db.prepare('UPDATE inventory SET stock = 4 WHERE material_id = ?').run(blockedId)

    const res = await request(app)
      .patch('/api/v1/materials/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [freeId, blockedId], status: 'inactive' })

    expect(res.status).toBe(409)
    const rows = db.prepare('SELECT id, status FROM materials WHERE id IN (?, ?)')
      .all(freeId, blockedId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.status) === 1)).toBe(true)
  })

  it('MAT-STATUS-004: 批量启用必须重新校验分类、供应商和库位仍可用', async () => {
    const suffix = `batch-active-ref-${Date.now()}`
    const freeRefs = seedRefs(db, `${suffix}-free`)
    const blockedRefs = seedRefs(db, `${suffix}-blocked`)
    const freeId = await createMaterial(app, token, freeRefs, `${suffix}-free`)
    const blockedId = await createMaterial(app, token, blockedRefs, `${suffix}-blocked`)
    db.prepare('UPDATE materials SET status = 0 WHERE id IN (?, ?)').run(freeId, blockedId)
    db.prepare('UPDATE material_categories SET status = 0 WHERE id = ?').run(blockedRefs.categoryId)
    db.prepare('UPDATE suppliers SET status = 0 WHERE id = ?').run(blockedRefs.supplierId)
    db.prepare('UPDATE locations SET status = 0 WHERE id = ?').run(blockedRefs.locationId)

    const res = await request(app)
      .patch('/api/v1/materials/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [freeId, blockedId], status: 'active' })

    expect(res.status).toBe(409)
    const rows = db.prepare('SELECT id, status FROM materials WHERE id IN (?, ?)')
      .all(freeId, blockedId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.status) === 0)).toBe(true)
  })

  it('MAT-REF-001: 创建物料时拒绝停用分类、供应商或库位', async () => {
    const suffix = `ref-create-${Date.now()}`
    const activeRefs = seedRefs(db, `${suffix}-active`)
    const inactiveCategoryRefs = seedRefs(db, `${suffix}-inactive-cat`)
    const inactiveSupplierRefs = seedRefs(db, `${suffix}-inactive-sup`)
    const inactiveLocationRefs = seedRefs(db, `${suffix}-inactive-loc`)

    db.prepare('UPDATE material_categories SET status = 0 WHERE id = ?').run(inactiveCategoryRefs.categoryId)
    db.prepare('UPDATE suppliers SET status = 0 WHERE id = ?').run(inactiveSupplierRefs.supplierId)
    db.prepare('UPDATE locations SET status = 0 WHERE id = ?').run(inactiveLocationRefs.locationId)

    const nextCode = await request(app)
      .get('/api/v1/materials/next-code')
      .query({ categoryId: inactiveCategoryRefs.categoryId })
      .set('Authorization', `Bearer ${token}`)

    expect(nextCode.status).toBe(409)

    const cases = [
      {
        name: '停用分类',
        suffix: 'cat',
        refs: { ...activeRefs, categoryId: inactiveCategoryRefs.categoryId },
      },
      {
        name: '停用供应商',
        suffix: 'sup',
        refs: { ...activeRefs, supplierId: inactiveSupplierRefs.supplierId },
      },
      {
        name: '停用库位',
        suffix: 'loc',
        refs: { ...activeRefs, locationId: inactiveLocationRefs.locationId },
      },
    ]

    for (const item of cases) {
      const res = await request(app)
        .post('/api/v1/materials')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code: `MAT-REF-BAD-${suffix}-${item.suffix}`,
          name: `${item.name}物料`,
          spec: '1ml',
          unit: '瓶',
          categoryId: item.refs.categoryId,
          supplierId: item.refs.supplierId,
          locationId: item.refs.locationId,
        })

      expect(res.status).toBe(409)
    }

    const createdCount = (db.prepare('SELECT COUNT(*) as count FROM materials WHERE code LIKE ?')
      .get(`MAT-REF-BAD-${suffix}%`) as any)?.count || 0
    expect(createdCount).toBe(0)
  })

  it('MAT-REF-002: 编辑物料时拒绝切换到停用分类、供应商或库位', async () => {
    const suffix = `ref-update-${Date.now()}`
    const activeRefs = seedRefs(db, `${suffix}-active`)
    const inactiveCategoryRefs = seedRefs(db, `${suffix}-inactive-cat`)
    const inactiveSupplierRefs = seedRefs(db, `${suffix}-inactive-sup`)
    const inactiveLocationRefs = seedRefs(db, `${suffix}-inactive-loc`)
    const materialId = await createMaterial(app, token, activeRefs, suffix)

    db.prepare('UPDATE material_categories SET status = 0 WHERE id = ?').run(inactiveCategoryRefs.categoryId)
    db.prepare('UPDATE suppliers SET status = 0 WHERE id = ?').run(inactiveSupplierRefs.supplierId)
    db.prepare('UPDATE locations SET status = 0 WHERE id = ?').run(inactiveLocationRefs.locationId)

    const cases = [
      { payload: { categoryId: inactiveCategoryRefs.categoryId }, field: 'category_id' },
      { payload: { supplierId: inactiveSupplierRefs.supplierId }, field: 'supplier_id' },
      { payload: { locationId: inactiveLocationRefs.locationId }, field: 'location_id' },
    ]

    for (const item of cases) {
      const res = await request(app)
        .put(`/api/v1/materials/${materialId}`)
        .set('Authorization', `Bearer ${token}`)
        .send(item.payload)

      expect(res.status).toBe(409)
    }

    const material = db.prepare('SELECT category_id, supplier_id, location_id FROM materials WHERE id = ?').get(materialId) as any
    expect(material).toMatchObject({
      category_id: activeRefs.categoryId,
      supplier_id: activeRefs.supplierId,
      location_id: activeRefs.locationId,
    })
  })

  it('MAT-STATS-001: 低库存筛选使用后端分页总数，统计覆盖完整数据集', async () => {
    const suffix = `stats-${Date.now()}`
    const refs = seedRefs(db, suffix)
    const lowId = await createMaterial(app, token, refs, `${suffix}-low`)
    const normalId = await createMaterial(app, token, refs, `${suffix}-normal`)
    const inactiveId = await createMaterial(app, token, refs, `${suffix}-inactive`)

    db.prepare('UPDATE materials SET min_stock = 10 WHERE id IN (?, ?, ?)')
      .run(lowId, normalId, inactiveId)
    db.prepare('UPDATE materials SET status = 0 WHERE id = ?').run(inactiveId)
    db.prepare('UPDATE inventory SET stock = 5 WHERE material_id = ?').run(lowId)
    db.prepare('UPDATE inventory SET stock = 50 WHERE material_id = ?').run(normalId)
    db.prepare('UPDATE inventory SET stock = 0 WHERE material_id = ?').run(inactiveId)

    const listRes = await request(app)
      .get('/api/v1/materials')
      .query({ keyword: suffix, lowStock: true, page: 1, pageSize: 1 })
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.total).toBe(2)
    expect(listRes.body.data.pagination.total).toBe(2)
    expect(listRes.body.data.list).toHaveLength(1)
    expect(listRes.body.data.list[0].stock).toBeLessThanOrEqual(listRes.body.data.list[0].minStock)

    const statsRes = await request(app)
      .get('/api/v1/materials/stats')
      .query({ keyword: suffix })
      .set('Authorization', `Bearer ${token}`)

    expect(statsRes.status).toBe(200)
    expect(statsRes.body.data).toMatchObject({
      total: 3,
      active: 2,
      inactive: 1,
      lowStock: 2,
    })

    const allStatusList = await request(app)
      .get('/api/v1/materials')
      .query({ keyword: suffix, status: 'all', page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)

    expect(allStatusList.status).toBe(200)
    expect(allStatusList.body.data.total).toBe(3)
    expect(allStatusList.body.data.list.map((item: any) => item.status).sort()).toEqual([
      'active',
      'active',
      'inactive',
    ])

    const allStatusStats = await request(app)
      .get('/api/v1/materials/stats')
      .query({ keyword: suffix, status: 'all' })
      .set('Authorization', `Bearer ${token}`)

    expect(allStatusStats.status).toBe(200)
    expect(allStatusStats.body.data).toMatchObject({
      total: 3,
      active: 2,
      inactive: 1,
    })
  })

  it('MAT-LIST-001: 引用数据请求不会被截断到前200条，避免BOM等页面漏选物料', async () => {
    const suffix = `refs-${Date.now()}`
    const refs = seedRefs(db, suffix)
    const insert = db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, supplier_id, location_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `)

    for (let i = 1; i <= 205; i += 1) {
      const padded = String(i).padStart(3, '0')
      insert.run(
        `mat-refs-${suffix}-${padded}`,
        `MAT-REFS-${suffix}-${padded}`,
        `引用候选物料-${suffix}-${padded}`,
        '1ml',
        '瓶',
        refs.categoryId,
        refs.supplierId,
        refs.locationId,
      )
    }

    const res = await request(app)
      .get('/api/v1/materials')
      .query({ keyword: `引用候选物料-${suffix}`, page: 1, pageSize: 1000 })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(205)
    expect(res.body.data.pagination.pageSize).toBe(1000)
    expect(res.body.data.list).toHaveLength(205)
  })

  it('MAT-TEXT-001: 创建和更新物料时拦截危险文本并保存清理后的展示文本', async () => {
    const suffix = `text-${Date.now()}`
    const refs = seedRefs(db, suffix)

    const blockedCreate = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MAT-TEXT-BAD-${suffix}`,
        name: '<script>alert(1)</script>',
        unit: '瓶',
        categoryId: refs.categoryId,
      })

    expect(blockedCreate.status).toBe(400)
    expect(blockedCreate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const dirtyCount = (db.prepare('SELECT COUNT(*) as count FROM materials WHERE name = ?')
      .get('<script>alert(1)</script>') as any).count
    expect(dirtyCount).toBe(0)

    const created = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `  MAT-TEXT-${suffix}  `,
        barcode: `  BAR-${suffix}  `,
        name: `  B195 安全物料 ${suffix}  `,
        spec: '  1 ml  ',
        unit: '  瓶  ',
        specQty: 1,
        specUnit: '  盒  ',
        categoryId: refs.categoryId,
        supplierId: refs.supplierId,
        locationId: refs.locationId,
        remark: '  可用于 BOM  ',
      })

    expect(created.status).toBe(201)
    const safeRow = db.prepare('SELECT code, barcode, name, spec, unit, spec_unit, remark FROM materials WHERE id = ?')
      .get(created.body.data.id) as any
    expect(safeRow).toMatchObject({
      code: `MAT-TEXT-${suffix}`,
      barcode: `BAR-${suffix}`,
      name: `B195 安全物料 ${suffix}`,
      spec: '1 ml',
      unit: '瓶',
      spec_unit: '盒',
      remark: '可用于 BOM',
    })

    const blockedUpdate = await request(app)
      .put(`/api/v1/materials/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: "' OR '1'='1" })

    expect(blockedUpdate.status).toBe(400)
    expect(blockedUpdate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const unchanged = db.prepare('SELECT name FROM materials WHERE id = ?')
      .get(created.body.data.id) as any
    expect(unchanged.name).toBe(`B195 安全物料 ${suffix}`)
  })

  it('MAT-UNIQUE-001: 物料编码和条码必须唯一，避免扫码定位到错误物料', async () => {
    const suffix = `unique-${Date.now()}`
    const refs = seedRefs(db, suffix)

    const first = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MAT-UNIQUE-${suffix}-A`,
        barcode: `BAR-UNIQUE-${suffix}`,
        name: `唯一物料A-${suffix}`,
        unit: '瓶',
        categoryId: refs.categoryId,
        supplierId: refs.supplierId,
        locationId: refs.locationId,
      })
    expect(first.status).toBe(201)

    const duplicateBarcodeCreate = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MAT-UNIQUE-${suffix}-B`,
        barcode: `bar-unique-${suffix}`,
        name: `重复条码物料-${suffix}`,
        unit: '瓶',
        categoryId: refs.categoryId,
        supplierId: refs.supplierId,
        locationId: refs.locationId,
      })
    expect(duplicateBarcodeCreate.status).toBe(409)
    expect(duplicateBarcodeCreate.body.error.message).toContain('条码')

    const second = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MAT-UNIQUE-${suffix}-B`,
        barcode: `BAR-UNIQUE-${suffix}-B`,
        name: `唯一物料B-${suffix}`,
        unit: '瓶',
        categoryId: refs.categoryId,
        supplierId: refs.supplierId,
        locationId: refs.locationId,
      })
    expect(second.status).toBe(201)

    const duplicateCodeUpdate = await request(app)
      .put(`/api/v1/materials/${second.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `MAT-UNIQUE-${suffix}-A` })
    expect(duplicateCodeUpdate.status).toBe(409)
    expect(duplicateCodeUpdate.body.error.message).toContain('编码')

    const duplicateBarcodeUpdate = await request(app)
      .put(`/api/v1/materials/${second.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ barcode: `BAR-UNIQUE-${suffix}` })
    expect(duplicateBarcodeUpdate.status).toBe(409)
    expect(duplicateBarcodeUpdate.body.error.message).toContain('条码')

    const unchanged = db.prepare('SELECT code, barcode FROM materials WHERE id = ?')
      .get(second.body.data.id) as any
    expect(unchanged).toMatchObject({
      code: `MAT-UNIQUE-${suffix}-B`,
      barcode: `BAR-UNIQUE-${suffix}-B`,
    })
  })

  it('MAT-VALIDATION-001: 创建物料时拒绝非有限数值且不写入主数据和库存行', async () => {
    const suffix = `finite-create-${Date.now()}`
    const refs = seedRefs(db, suffix)

    const res = await request(app)
      .post('/api/v1/materials')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `MAT-FINITE-${suffix}`,
        name: `非有限物料-${suffix}`,
        unit: '瓶',
        categoryId: refs.categoryId,
        price: 'Infinity',
        minStock: 1,
        maxStock: 10,
        safetyStock: 2,
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('有限')
    const material = db.prepare('SELECT id FROM materials WHERE code = ?').get(`MAT-FINITE-${suffix}`)
    expect(material).toBeUndefined()
    const inventoryCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM inventory i
      JOIN materials m ON m.id = i.material_id
      WHERE m.code = ?
    `).get(`MAT-FINITE-${suffix}`) as any).count
    expect(inventoryCount).toBe(0)
  })

  it('MAT-VALIDATION-002: 更新物料时拒绝非有限库存阈值且保留原数值', async () => {
    const suffix = `finite-update-${Date.now()}`
    const refs = seedRefs(db, suffix)
    const materialId = await createMaterial(app, token, refs, suffix)
    db.prepare('UPDATE materials SET min_stock = 1, max_stock = 20, safety_stock = 3, price = 8 WHERE id = ?')
      .run(materialId)

    const res = await request(app)
      .put(`/api/v1/materials/${materialId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ minStock: 'Infinity' })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('有限')
    const row = db.prepare('SELECT min_stock, max_stock, safety_stock, price FROM materials WHERE id = ?')
      .get(materialId) as any
    expect(row).toMatchObject({
      min_stock: 1,
      max_stock: 20,
      safety_stock: 3,
      price: 8,
    })
  })
})
