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

async function loginUser(app: any, username: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password: 'CoreOne2026!' })
  expect(res.status).toBe(200)
  return res.body.data.token
}

async function createLocation(app: any, token: string, suffix: string) {
  const res = await request(app)
    .post('/api/v1/locations')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `库位保护-${suffix}`,
      zone: 'A区',
      type: 'shelf',
    })
  expect(res.status).toBe(201)
  return res.body.data.id as string
}

function bindLocationToMaterial(db: any, locationId: string, suffix: string) {
  const categoryId = `cat-loc-guard-${suffix}`
  const materialId = `mat-loc-guard-${suffix}`
  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-LOC-GUARD-${suffix}`, '库位保护测试分类', 1)
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-LOC-GUARD-${suffix}`, '库位保护测试物料', '1ml', '瓶', categoryId, locationId)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, 0, 0, ?)')
    .run(`inv-loc-guard-${suffix}`, materialId, locationId)
}

function seedInventoryLocationStock(db: any, locationId: string, suffix: string) {
  const categoryId = `cat-loc-invloc-${suffix}`
  const materialId = `mat-loc-invloc-${suffix}`
  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-LOC-INVLOC-${suffix}`, '库位明细库存测试分类', 1)
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-LOC-INVLOC-${suffix}`, '库位明细库存测试物料', '1ml', '瓶', categoryId)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, 5, 0, NULL)')
    .run(`inv-loc-invloc-${suffix}`, materialId)
  db.prepare('INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock) VALUES (?, ?, ?, 5, 0)')
    .run(`invloc-loc-guard-${suffix}`, materialId, locationId)
}

describe('库位删除保护', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('LOC-GUARD-001: 被物料默认库位引用时不可删除', async () => {
    const suffix = `mat-${Date.now()}`
    const locationId = await createLocation(app, token, suffix)
    bindLocationToMaterial(db, locationId, suffix)

    const res = await request(app)
      .delete(`/api/v1/locations/${locationId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    const location = db.prepare('SELECT is_deleted FROM locations WHERE id = ?').get(locationId) as any
    expect(Number(location.is_deleted)).toBe(0)
  })

  it('LOC-GUARD-002: 无引用库位仍可删除', async () => {
    const locationId = await createLocation(app, token, `free-${Date.now()}`)

    const res = await request(app)
      .delete(`/api/v1/locations/${locationId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const location = db.prepare('SELECT is_deleted FROM locations WHERE id = ?').get(locationId) as any
    expect(Number(location.is_deleted)).toBe(1)
  })

  it('LOC-DELETE-001: 库位删除前检查必须覆盖多库位库存明细', async () => {
    const suffix = `invloc-${Date.now()}`
    const locationId = await createLocation(app, token, suffix)
    seedInventoryLocationStock(db, locationId, suffix)

    const check = await request(app)
      .get(`/api/v1/locations/${locationId}/check-deletable`)
      .set('Authorization', `Bearer ${token}`)

    expect(check.status).toBe(200)
    expect(check.body.data).toMatchObject({
      deletable: false,
      impacts: {
        inventoryLocationCount: 1,
      },
    })
    expect(check.body.data.reasons).toEqual(expect.arrayContaining([
      '存在 1 条多库位库存明细引用',
    ]))

    const deleted = await request(app)
      .delete(`/api/v1/locations/${locationId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(deleted.status).toBe(409)
    const location = db.prepare('SELECT is_deleted FROM locations WHERE id = ?').get(locationId) as any
    const stock = db.prepare('SELECT stock FROM inventory_locations WHERE location_id = ?').get(locationId) as any
    expect(Number(location.is_deleted)).toBe(0)
    expect(Number(stock.stock)).toBe(5)
  })

  it('LOC-STATUS-001: 更新库位状态必须拒绝页面选项以外的状态', async () => {
    const suffix = `status-invalid-${Date.now()}`
    const locationId = await createLocation(app, token, suffix)

    const res = await request(app)
      .put(`/api/v1/locations/${locationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'archived' })

    expect(res.status).toBe(400)
    const location = db.prepare('SELECT status FROM locations WHERE id = ?').get(locationId) as any
    expect(Number(location.status)).toBe(1)
  })

  it('LOC-STATUS-002: 有活跃子库位、默认物料或当前库存的库位不可停用', async () => {
    const suffix = `status-ref-${Date.now()}`
    const parentId = await createLocation(app, token, `${suffix}-parent`)
    await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `子库位-${suffix}`,
        zone: 'A区',
        type: 'shelf',
        parentId,
      })
      .expect(201)
    bindLocationToMaterial(db, parentId, suffix)
    db.prepare('UPDATE inventory SET stock = 3 WHERE location_id = ?').run(parentId)

    const res = await request(app)
      .put(`/api/v1/locations/${parentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' })

    expect(res.status).toBe(409)
    const location = db.prepare('SELECT status FROM locations WHERE id = ?').get(parentId) as any
    const material = db.prepare('SELECT location_id FROM materials WHERE code = ?').get(`MAT-LOC-GUARD-${suffix}`) as any
    const inventory = db.prepare('SELECT stock, location_id FROM inventory WHERE location_id = ?').get(parentId) as any
    expect(Number(location.status)).toBe(1)
    expect(material.location_id).toBe(parentId)
    expect(Number(inventory.stock)).toBe(3)
  })

  it('LOC-STATUS-003: 库位停用前检查必须覆盖多库位库存明细', async () => {
    const suffix = `status-invloc-${Date.now()}`
    const locationId = await createLocation(app, token, suffix)
    seedInventoryLocationStock(db, locationId, suffix)

    const check = await request(app)
      .get(`/api/v1/locations/${locationId}/check-status`)
      .query({ status: 'inactive' })
      .set('Authorization', `Bearer ${token}`)

    expect(check.status).toBe(200)
    expect(check.body.data).toMatchObject({
      canChange: false,
      targetStatus: 'inactive',
      impacts: {
        inventoryLocationCount: 1,
      },
    })
    expect(check.body.data.reasons).toEqual(expect.arrayContaining([
      '存在 1 条多库位库存明细引用',
    ]))

    const res = await request(app)
      .put(`/api/v1/locations/${locationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' })

    expect(res.status).toBe(409)
    const location = db.prepare('SELECT status FROM locations WHERE id = ?').get(locationId) as any
    const stock = db.prepare('SELECT stock FROM inventory_locations WHERE location_id = ?').get(locationId) as any
    expect(Number(location.status)).toBe(1)
    expect(Number(stock.stock)).toBe(5)
  })

  it('LOC-PARENT-001: 库位父级必须存在且启用，更新时不可选择自己或子级', async () => {
    const suffix = `parent-${Date.now()}`
    const inactiveParentId = `loc-inactive-parent-${suffix}`
    db.prepare(`
      INSERT INTO locations (id, code, name, type, zone, status)
      VALUES (?, ?, ?, 'shelf', 'A区', 0)
    `).run(inactiveParentId, `LOC-INACTIVE-PARENT-${suffix}`, `停用父库位-${suffix}`)

    const inactiveParentCreate = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `停用父级子库位-${suffix}`,
        zone: 'A区',
        type: 'shelf',
        parentId: inactiveParentId,
      })

    expect(inactiveParentCreate.status).toBe(409)

    const parentId = await createLocation(app, token, `${suffix}-parent`)
    const childRes = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `合法子库位-${suffix}`,
        zone: 'A区',
        type: 'shelf',
        parentId,
      })
    expect(childRes.status).toBe(201)
    const childId = childRes.body.data.id

    const selfParent = await request(app)
      .put(`/api/v1/locations/${parentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentId })
    expect(selfParent.status).toBe(400)

    const childParent = await request(app)
      .put(`/api/v1/locations/${parentId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ parentId: childId })
    expect(childParent.status).toBe(400)

    const parent = db.prepare('SELECT parent_id FROM locations WHERE id = ?').get(parentId) as any
    const child = db.prepare('SELECT parent_id FROM locations WHERE id = ?').get(childId) as any
    expect(parent.parent_id).toBeFalsy()
    expect(child.parent_id).toBe(parentId)
  })

  it('LOC-TREE-001: 库位树必须返回关系、状态和容量字段用于页面关系判断', async () => {
    const suffix = `tree-${Date.now()}`
    const parentId = await createLocation(app, token, `${suffix}-parent`)
    const childRes = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `树子库位-${suffix}`,
        zone: 'A区',
        shelf: '01架',
        capacity: 0,
        type: 'shelf',
        parentId,
      })
    expect(childRes.status).toBe(201)

    const tree = await request(app)
      .get('/api/v1/locations/tree')
      .set('Authorization', `Bearer ${token}`)

    expect(tree.status).toBe(200)
    const findNode = (nodes: any[], id: string): any | null => {
      for (const node of nodes) {
        if (node.id === id) return node
        const found = findNode(node.children || [], id)
        if (found) return found
      }
      return null
    }
    const child = findNode(tree.body.data, childRes.body.data.id)
    expect(child).toMatchObject({
      id: childRes.body.data.id,
      parentId,
      status: 'active',
      capacity: 0,
      used: 0,
      depth: 2,
      fullPath: expect.stringContaining(`树子库位-${suffix}`),
    })
  })

  it('LOC-CAPACITY-001: 容量必须按用户输入保存且拒绝负数', async () => {
    const suffix = `capacity-${Date.now()}`
    const zeroCapacity = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `零容量库位-${suffix}`,
        zone: 'A区',
        type: 'shelf',
        capacity: 0,
      })
    expect(zeroCapacity.status).toBe(201)
    const zeroRow = db.prepare('SELECT capacity FROM locations WHERE id = ?')
      .get(zeroCapacity.body.data.id) as any
    expect(Number(zeroRow.capacity)).toBe(0)

    const negativeCreate = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `负容量库位-${suffix}`,
        zone: 'A区',
        type: 'shelf',
        capacity: -1,
      })
    expect(negativeCreate.status).toBe(400)

    const negativeUpdate = await request(app)
      .put(`/api/v1/locations/${zeroCapacity.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ capacity: -5 })
    expect(negativeUpdate.status).toBe(400)
    const unchanged = db.prepare('SELECT capacity FROM locations WHERE id = ?')
      .get(zeroCapacity.body.data.id) as any
    expect(Number(unchanged.capacity)).toBe(0)
  })

  it('LOC-CODE-001: 库位编码是审计身份，更新接口不可改写', async () => {
    const suffix = `code-${Date.now()}`
    const locationId = await createLocation(app, token, suffix)
    const before = db.prepare('SELECT code FROM locations WHERE id = ?').get(locationId) as any

    const res = await request(app)
      .put(`/api/v1/locations/${locationId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `LOC-MANUAL-${suffix}` })

    expect(res.status).toBe(400)
    const after = db.prepare('SELECT code FROM locations WHERE id = ?').get(locationId) as any
    expect(after.code).toBe(before.code)
  })

  it('LOC-STATS-001: 库位关键字筛选和统计使用后端全量口径', async () => {
    const suffix = `stats-${Date.now()}`
    const rows = [
      [`loc-${suffix}-1`, `LOC-${suffix}-1`, `统计库位-${suffix}-1`, 1, 100, 25],
      [`loc-${suffix}-2`, `LOC-${suffix}-2`, `统计库位-${suffix}-2`, 1, 100, 50],
      [`loc-${suffix}-3`, `LOC-${suffix}-3`, `统计库位-${suffix}-3`, 0, 100, 100],
    ]
    for (const row of rows) {
      db.prepare(`
        INSERT INTO locations (id, code, name, type, zone, capacity, used, status)
        VALUES (?, ?, ?, 'shelf', ?, ?, ?, ?)
      `).run(row[0], row[1], row[2], `统计区-${suffix}`, row[4], row[5], row[3])
      // P1-06：利用率派生自实际分库位库存 Σinventory_locations.stock，故按目标占用量 seed 该表（不再依赖 locations.used 物化列）
      db.prepare('INSERT INTO inventory_locations (id, material_id, location_id, stock, locked_stock) VALUES (?, ?, ?, ?, 0)')
        .run(`il-${row[0]}`, `mat-${row[0]}`, row[0], row[5])
    }

    const listRes = await request(app)
      .get('/api/v1/locations')
      .query({ keyword: suffix, page: 1, pageSize: 1 })
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.total).toBe(3)
    expect(listRes.body.data.list).toHaveLength(1)

    const statsRes = await request(app)
      .get('/api/v1/locations/stats')
      .query({ keyword: suffix })
      .set('Authorization', `Bearer ${token}`)

    expect(statsRes.status).toBe(200)
    expect(statsRes.body.data).toMatchObject({
      total: 3,
      active: 2,
      inactive: 1,
      avgUtilization: 58,
    })

    const inactiveStats = await request(app)
      .get('/api/v1/locations/stats')
      .query({ keyword: suffix, status: 'inactive' })
      .set('Authorization', `Bearer ${token}`)

    expect(inactiveStats.status).toBe(200)
    expect(inactiveStats.body.data).toMatchObject({
      total: 1,
      active: 0,
      inactive: 1,
      avgUtilization: 100,
    })

    const allStatusList = await request(app)
      .get('/api/v1/locations')
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
      .get('/api/v1/locations/stats')
      .query({ keyword: suffix, status: 'all' })
      .set('Authorization', `Bearer ${token}`)

    expect(allStatusStats.status).toBe(200)
    expect(allStatusStats.body.data).toMatchObject({
      total: 3,
      active: 2,
      inactive: 1,
      avgUtilization: 58,
    })
  })

  it('LOC-RBAC-001（P1-12）: 仓管可创建/更新库位（对齐权限矩阵 admin+warehouse_manager）', async () => {
    const wmToken = await loginUser(app, 'wangkq')
    const create = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${wmToken}`)
      .send({ name: `仓管库位-${Date.now()}`, zone: 'A区', type: 'shelf' })
    expect(create.status).toBe(201)
    const update = await request(app)
      .put(`/api/v1/locations/${create.body.data.id}`)
      .set('Authorization', `Bearer ${wmToken}`)
      .send({ name: `仓管库位改名-${Date.now()}` })
    expect(update.status).toBe(200)
  })

  it('LOC-USED-001（P1-06）: 库位占用量/利用率派生自实际分库位库存，而非恒0的物化 used 列', async () => {
    const suffix = `used-${Date.now()}`
    const locationId = await createLocation(app, token, suffix)
    // seedInventoryLocationStock 为该库位写 inventory_locations.stock=5
    seedInventoryLocationStock(db, locationId, suffix)
    const listRes = await request(app)
      .get('/api/v1/locations')
      .query({ keyword: suffix, page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)
    expect(listRes.status).toBe(200)
    const row = listRes.body.data.list.find((r: any) => r.id === locationId)
    expect(row).toBeTruthy()
    // 修复前 used 恒 0；修复后 = Σinventory_locations.stock = 5
    expect(row.used).toBe(5)
  })

  it('LOC-TEXT-001: 创建和更新库位时拦截危险文本并保存清理后的展示文本', async () => {
    const suffix = `text-${Date.now()}`

    const blockedCreate = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: "' OR '1'='1",
        zone: 'A区',
        type: 'shelf',
      })

    expect(blockedCreate.status).toBe(400)
    expect(blockedCreate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const dirtyCount = (db.prepare('SELECT COUNT(*) as count FROM locations WHERE name = ?')
      .get("' OR '1'='1") as any).count
    expect(dirtyCount).toBe(0)

    const created = await request(app)
      .post('/api/v1/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `  B194 安全库位 ${suffix}  `,
        zone: '  B区  ',
        shelf: '  01 架  ',
        position: '  02 位  ',
        type: 'shelf',
      })

    expect(created.status).toBe(201)
    const safeRow = db.prepare('SELECT name, zone, shelf, position FROM locations WHERE id = ?')
      .get(created.body.data.id) as any
    expect(safeRow).toMatchObject({
      name: `B194 安全库位 ${suffix}`,
      zone: 'B区',
      shelf: '01 架',
      position: '02 位',
    })

    const blockedUpdate = await request(app)
      .put(`/api/v1/locations/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '<script>alert(1)</script>' })

    expect(blockedUpdate.status).toBe(400)
    expect(blockedUpdate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const unchanged = db.prepare('SELECT name FROM locations WHERE id = ?')
      .get(created.body.data.id) as any
    expect(unchanged.name).toBe(`B194 安全库位 ${suffix}`)
  })
})
