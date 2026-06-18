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

describe('库存与主数据一致性扫描', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('INV-CONSISTENCY-000: 干净库不会误报库存与主数据一致性问题', async () => {
    const res = await request(app)
      .get('/api/v1/inventory/consistency-check')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({
      summary: {
        issueCount: 0,
        criticalCount: 0,
        warningCount: 0,
      },
      issues: [],
    })
  })

  it('INV-CONSISTENCY-001: 扫描历史主数据和库存脏状态，返回可治理清单', async () => {
    const suffix = `${Date.now()}`
    const categoryId = `cat-consistency-${suffix}`
    const inactiveMaterialId = `mat-consistency-inactive-${suffix}`
    const activeMaterialId = `mat-consistency-active-${suffix}`
    const inactiveBomId = `bom-consistency-inactive-${suffix}`
    const activeBomId = `bom-consistency-active-${suffix}`
    const activeProjectId = `prj-consistency-active-${suffix}`
    const inactiveLocationId = `loc-consistency-inactive-${suffix}`
    const deletedLocationId = `loc-consistency-deleted-${suffix}`
    const mismatchMaterialId = `mat-consistency-mismatch-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, 1)')
      .run(categoryId, `CAT-CONSISTENCY-${suffix}`, '一致性扫描分类')
    db.prepare('INSERT INTO materials (id, code, name, unit, category_id, status) VALUES (?, ?, ?, ?, ?, 0)')
      .run(inactiveMaterialId, `MAT-CONS-INACTIVE-${suffix}`, '停用但有库存物料', '瓶', categoryId)
    db.prepare('INSERT INTO materials (id, code, name, unit, category_id, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(activeMaterialId, `MAT-CONS-ACTIVE-${suffix}`, '可用物料', '瓶', categoryId)
    db.prepare('INSERT INTO materials (id, code, name, unit, category_id, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(mismatchMaterialId, `MAT-CONS-MISMATCH-${suffix}`, '库存汇总不一致物料', '瓶', categoryId)

    db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock) VALUES (?, ?, ?, 0)')
      .run(`inv-cons-inactive-${suffix}`, inactiveMaterialId, 5)
    db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock) VALUES (?, ?, ?, 0)')
      .run(`inv-cons-mismatch-${suffix}`, mismatchMaterialId, 10)
    db.prepare('INSERT INTO batches (id, material_id, batch_no, quantity, remaining, expiry_date, inbound_id, inbound_price, status) VALUES (?, ?, ?, 5, 4, ?, ?, 10, 1)')
      .run(`batch-cons-mismatch-${suffix}`, mismatchMaterialId, `BATCH-CONS-MISMATCH-${suffix}`, '2028-12-31', `inbound-cons-${suffix}`)

    db.prepare('INSERT INTO locations (id, code, name, type, zone, status, is_deleted) VALUES (?, ?, ?, ?, ?, 0, 0)')
      .run(inactiveLocationId, `LOC-CONS-INACTIVE-${suffix}`, '停用但有库存库位', 'shelf', 'A区')
    db.prepare('INSERT INTO locations (id, code, name, type, zone, status, is_deleted) VALUES (?, ?, ?, ?, ?, 1, 1)')
      .run(deletedLocationId, `LOC-CONS-DELETED-${suffix}`, '删除但有库存库位', 'shelf', 'A区')
    db.prepare('INSERT INTO inventory_locations (id, material_id, location_id, stock) VALUES (?, ?, ?, ?)')
      .run(`il-cons-inactive-${suffix}`, activeMaterialId, inactiveLocationId, 3)
    db.prepare('INSERT INTO inventory_locations (id, material_id, location_id, stock) VALUES (?, ?, ?, ?)')
      .run(`il-cons-deleted-${suffix}`, activeMaterialId, deletedLocationId, 2)
    db.prepare('INSERT INTO inventory_locations (id, material_id, location_id, stock) VALUES (?, ?, ?, ?)')
      .run(`il-cons-mismatch-${suffix}`, mismatchMaterialId, inactiveLocationId, 6)

    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(activeBomId, `BOM-CONS-ACTIVE-${suffix}`, '依赖不可用物料的启用BOM', 'v1.0', 'ihc')
    db.prepare('INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit) VALUES (?, ?, ?, 1, ?)')
      .run(`bi-cons-active-${suffix}`, activeBomId, inactiveMaterialId, '瓶')
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 0)')
      .run(inactiveBomId, `BOM-CONS-INACTIVE-${suffix}`, '停用BOM', 'v1.0', 'ihc')
    db.prepare('INSERT INTO projects (id, code, name, type, bom_id, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(activeProjectId, `PRJ-CONS-ACTIVE-${suffix}`, '绑定停用BOM的启用项目', 'ihc', inactiveBomId)

    const res = await request(app)
      .get('/api/v1/inventory/consistency-check')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.summary.issueCount).toBeGreaterThanOrEqual(6)
    const codes = res.body.data.issues.map((issue: any) => issue.code)
    expect(codes).toEqual(expect.arrayContaining([
      'INACTIVE_MATERIAL_WITH_STOCK',
      'ACTIVE_BOM_INVALID_MATERIAL',
      'ACTIVE_PROJECT_INVALID_BOM',
      'INACTIVE_LOCATION_WITH_STOCK',
      'DELETED_LOCATION_WITH_STOCK',
      'INVENTORY_BATCH_MISMATCH',
      'INVENTORY_LOCATION_MISMATCH',
    ]))
    const bomIssue = res.body.data.issues.find((issue: any) => issue.code === 'ACTIVE_BOM_INVALID_MATERIAL')
    expect(bomIssue).toMatchObject({
      entityType: 'bom',
      entityId: activeBomId,
      severity: 'critical',
    })
    const projectIssue = res.body.data.issues.find((issue: any) => issue.code === 'ACTIVE_PROJECT_INVALID_BOM')
    expect(projectIssue.impacts.bomId).toBe(inactiveBomId)
  })
})
