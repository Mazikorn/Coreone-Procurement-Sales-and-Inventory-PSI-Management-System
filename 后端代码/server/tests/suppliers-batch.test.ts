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

async function createSupplier(app: any, token: string, suffix: string) {
  const res = await request(app)
    .post('/api/v1/suppliers')
    .set('Authorization', `Bearer ${token}`)
    .send({
      name: `批量供应商-${suffix}`,
      contact: '测试联系人',
      phone: '13800138000',
    })
  expect(res.status).toBe(201)
  return res.body.data.id as string
}

function bindSupplierToMaterial(db: any, supplierId: string, suffix: string) {
  const categoryId = `cat-sup-batch-${suffix}`
  const locationId = `loc-sup-batch-${suffix}`
  const materialId = `mat-sup-batch-${suffix}`
  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-SUP-BATCH-${suffix}`, '供应商批量测试分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-SUP-BATCH-${suffix}`, '供应商批量测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, supplier_id, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-SUP-BATCH-${suffix}`, '供应商批量测试物料', '1ml', '瓶', categoryId, supplierId, locationId)
}

describe('供应商批量操作', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('SUP-BATCH-001: 被物料引用的供应商不可删除', async () => {
    const suffix = `ref-${Date.now()}`
    const supplierId = await createSupplier(app, token, suffix)
    bindSupplierToMaterial(db, supplierId, suffix)

    const res = await request(app)
      .delete(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    const supplier = db.prepare('SELECT is_deleted FROM suppliers WHERE id = ?').get(supplierId) as any
    expect(Number(supplier.is_deleted)).toBe(0)
  })

  it('SUP-BATCH-002: 批量删除遇到引用时整批拒绝，不部分删除', async () => {
    const suffix = `delete-${Date.now()}`
    const freeSupplierId = await createSupplier(app, token, `${suffix}-free`)
    const referencedSupplierId = await createSupplier(app, token, `${suffix}-ref`)
    bindSupplierToMaterial(db, referencedSupplierId, suffix)

    const res = await request(app)
      .delete('/api/v1/suppliers/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [freeSupplierId, referencedSupplierId] })

    expect(res.status).toBe(409)
    const rows = db.prepare('SELECT id, is_deleted FROM suppliers WHERE id IN (?, ?)')
      .all(freeSupplierId, referencedSupplierId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.is_deleted) === 0)).toBe(true)
  })

  it('SUP-BATCH-003: 批量状态遇到不存在供应商时整批拒绝，不部分更新', async () => {
    const suffix = `status-${Date.now()}`
    const firstId = await createSupplier(app, token, `${suffix}-1`)
    const secondId = await createSupplier(app, token, `${suffix}-2`)

    const res = await request(app)
      .patch('/api/v1/suppliers/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId, `missing-${suffix}`], status: 'inactive' })

    expect(res.status).toBe(404)
    const rows = db.prepare('SELECT id, status FROM suppliers WHERE id IN (?, ?)')
      .all(firstId, secondId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.status) === 1)).toBe(true)
  })

  it('SUP-BATCH-004: 批量状态有效时一次更新所有选中供应商', async () => {
    const suffix = `valid-${Date.now()}`
    const firstId = await createSupplier(app, token, `${suffix}-1`)
    const secondId = await createSupplier(app, token, `${suffix}-2`)

    const res = await request(app)
      .patch('/api/v1/suppliers/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId], status: 'inactive' })

    expect(res.status).toBe(200)
    expect(res.body.data.updatedCount).toBe(2)
    const rows = db.prepare('SELECT id, status FROM suppliers WHERE id IN (?, ?)')
      .all(firstId, secondId) as any[]
    expect(rows.every(row => Number(row.status) === 0)).toBe(true)
  })

  it('SUP-STATUS-001: 更新供应商状态必须拒绝页面选项以外的状态', async () => {
    const suffix = `status-invalid-${Date.now()}`
    const supplierId = await createSupplier(app, token, suffix)

    const res = await request(app)
      .put(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'archived' })

    expect(res.status).toBe(400)
    const supplier = db.prepare('SELECT status FROM suppliers WHERE id = ?').get(supplierId) as any
    expect(Number(supplier.status)).toBe(1)
  })

  it('SUP-STATUS-002: 有启用物料或待收采购订单的供应商不可停用', async () => {
    const suffix = `status-ref-${Date.now()}`
    const materialSupplierId = await createSupplier(app, token, `${suffix}-material`)
    const orderSupplierId = await createSupplier(app, token, `${suffix}-order`)
    bindSupplierToMaterial(db, materialSupplierId, `${suffix}-material`)
    db.prepare(`
      INSERT INTO purchase_orders (
        id, order_no, material_id, material_name, supplier_id,
        ordered_qty, received_qty, unit, unit_price, total_amount,
        expected_date, status
      )
      VALUES (?, ?, ?, ?, ?, 10, 0, '瓶', 12, 120, '2027-12-31', 'pending')
    `).run(
      `po-sup-status-${suffix}`,
      `PO-SUP-STATUS-${suffix}`,
      `mat-sup-batch-${suffix}-material`,
      '供应商状态测试物料',
      orderSupplierId,
    )

    const materialRes = await request(app)
      .put(`/api/v1/suppliers/${materialSupplierId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' })
    const orderRes = await request(app)
      .put(`/api/v1/suppliers/${orderSupplierId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' })

    expect(materialRes.status).toBe(409)
    expect(orderRes.status).toBe(409)
    const rows = db.prepare('SELECT id, status FROM suppliers WHERE id IN (?, ?)')
      .all(materialSupplierId, orderSupplierId) as any[]
    expect(rows.every(row => Number(row.status) === 1)).toBe(true)
  })

  it('SUP-STATUS-003: 批量停用遇到启用物料引用时整批拒绝', async () => {
    const suffix = `batch-status-ref-${Date.now()}`
    const freeSupplierId = await createSupplier(app, token, `${suffix}-free`)
    const referencedSupplierId = await createSupplier(app, token, `${suffix}-ref`)
    bindSupplierToMaterial(db, referencedSupplierId, suffix)

    const res = await request(app)
      .patch('/api/v1/suppliers/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [freeSupplierId, referencedSupplierId], status: 'inactive' })

    expect(res.status).toBe(409)
    const rows = db.prepare('SELECT id, status FROM suppliers WHERE id IN (?, ?)')
      .all(freeSupplierId, referencedSupplierId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.status) === 1)).toBe(true)
  })

  it('SUP-STATS-001: 供应商统计接口按筛选条件返回全量口径', async () => {
    const suffix = `stats-${Date.now()}`
    const activeId = await createSupplier(app, token, `${suffix}-active`)
    const inactiveId = await createSupplier(app, token, `${suffix}-inactive`)

    const update = await request(app)
      .put(`/api/v1/suppliers/${inactiveId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' })
    expect(update.status).toBe(200)

    const stats = await request(app)
      .get('/api/v1/suppliers/stats')
      .query({ keyword: suffix })
      .set('Authorization', `Bearer ${token}`)

    expect(stats.status).toBe(200)
    expect(stats.body.data.total).toBeGreaterThanOrEqual(2)
    expect(stats.body.data.active).toBeGreaterThanOrEqual(1)
    expect(stats.body.data.inactive).toBeGreaterThanOrEqual(1)
    expect(stats.body.data.newThisMonth).toBeGreaterThanOrEqual(2)

    const inactiveStats = await request(app)
      .get('/api/v1/suppliers/stats')
      .query({ keyword: suffix, status: 'inactive' })
      .set('Authorization', `Bearer ${token}`)

    expect(inactiveStats.status).toBe(200)
    expect(inactiveStats.body.data.total).toBe(1)
    expect(inactiveStats.body.data.active).toBe(0)
    expect(inactiveStats.body.data.inactive).toBe(1)

    const listed = await request(app)
      .get('/api/v1/suppliers')
      .query({ keyword: suffix, status: 'active', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)
    const ids = listed.body.data.list.map((item: any) => item.id)
    expect(ids).toContain(activeId)
    expect(ids).not.toContain(inactiveId)

    const allStatusList = await request(app)
      .get('/api/v1/suppliers')
      .query({ keyword: suffix, status: 'all', page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)

    expect(allStatusList.status).toBe(200)
    expect(allStatusList.body.data.total).toBe(2)
    expect(allStatusList.body.data.list.map((item: any) => item.status).sort()).toEqual([
      'active',
      'inactive',
    ])

    const allStatusStats = await request(app)
      .get('/api/v1/suppliers/stats')
      .query({ keyword: suffix, status: 'all' })
      .set('Authorization', `Bearer ${token}`)

    expect(allStatusStats.status).toBe(200)
    expect(allStatusStats.body.data).toMatchObject({
      total: 2,
      active: 1,
      inactive: 1,
    })
  })

  it('SUP-LIST-001: 引用数据请求不会被截断到前100条', async () => {
    const suffix = `refs-${Date.now()}`
    const insert = db.prepare('INSERT INTO suppliers (id, code, name, status) VALUES (?, ?, ?, 1)')

    for (let i = 1; i <= 105; i += 1) {
      const padded = String(i).padStart(3, '0')
      insert.run(
        `sup-refs-${suffix}-${padded}`,
        `SUP-REFS-${suffix}-${padded}`,
        `引用候选供应商-${suffix}-${padded}`,
      )
    }

    const res = await request(app)
      .get('/api/v1/suppliers')
      .query({ keyword: `引用候选供应商-${suffix}`, page: 1, pageSize: 999, status: 'active' })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(105)
    expect(res.body.data.pagination.pageSize).toBe(999)
    expect(res.body.data.list).toHaveLength(105)
  })

  it('SUP-TEXT-001: 创建和更新供应商时拦截危险文本并保存清理后的展示文本', async () => {
    const suffix = `text-${Date.now()}`

    const blockedCreate = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: '<script>alert(1)</script>',
        contact: '测试联系人',
        phone: '13800138000',
      })

    expect(blockedCreate.status).toBe(400)
    expect(blockedCreate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    expect(blockedCreate.body.error.message).toContain('危险字符')
    const dirtyCount = (db.prepare('SELECT COUNT(*) as count FROM suppliers WHERE name = ?')
      .get('<script>alert(1)</script>') as any).count
    expect(dirtyCount).toBe(0)

    const created = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `  B194 安全供应商 ${suffix}  `,
        contact: '  张 三  ',
        phone: ' 13800138000 ',
      })

    expect(created.status).toBe(201)
    const safeRow = db.prepare('SELECT name, contact, phone FROM suppliers WHERE id = ?')
      .get(created.body.data.id) as any
    expect(safeRow).toMatchObject({
      name: `B194 安全供应商 ${suffix}`,
      contact: '张 三',
      phone: '13800138000',
    })

    const blockedUpdate = await request(app)
      .put(`/api/v1/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: "' OR '1'='1" })

    expect(blockedUpdate.status).toBe(400)
    expect(blockedUpdate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const unchanged = db.prepare('SELECT name FROM suppliers WHERE id = ?')
      .get(created.body.data.id) as any
    expect(unchanged.name).toBe(`B194 安全供应商 ${suffix}`)
  })
})
