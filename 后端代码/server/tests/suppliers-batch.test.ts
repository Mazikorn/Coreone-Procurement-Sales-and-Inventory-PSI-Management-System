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

function seedStandaloneMaterial(db: any, suffix: string) {
  const categoryId = `cat-sup-ref-${suffix}`
  const locationId = `loc-sup-ref-${suffix}`
  const materialId = `mat-sup-ref-${suffix}`
  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-SUP-REF-${suffix}`, '供应商引用测试分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-SUP-REF-${suffix}`, '供应商引用测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-SUP-REF-${suffix}`, '供应商引用测试物料', '1ml', '瓶', categoryId, locationId)
  return { materialId, locationId }
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

  it('SUP-DELETE-001: 被采购、入库、批次或退货引用的供应商不可删除', async () => {
    const suffix = `biz-ref-${Date.now()}`
    const refs = ['purchase-order', 'inbound', 'batch', 'supplier-return'] as const

    for (const ref of refs) {
      const supplierId = await createSupplier(app, token, `${suffix}-${ref}`)
      const { materialId, locationId } = seedStandaloneMaterial(db, `${suffix}-${ref}`)
      if (ref === 'purchase-order') {
        db.prepare(`
          INSERT INTO purchase_orders (
            id, order_no, material_id, material_name, supplier_id,
            ordered_qty, received_qty, unit, unit_price, total_amount,
            expected_date, status
          )
          VALUES (?, ?, ?, ?, ?, 10, 0, '瓶', 12, 120, '2027-12-31', 'pending')
        `).run(`po-sup-ref-${suffix}`, `PO-SUP-REF-${suffix}`, materialId, '供应商引用测试物料', supplierId)
      }
      if (ref === 'inbound') {
        db.prepare(`
          INSERT INTO inbound_records (
            id, inbound_no, type, material_id, batch_no, quantity, unit, price, amount,
            supplier_id, location_id, operator, status
          )
          VALUES (?, ?, 'purchase', ?, ?, 5, '瓶', 12, 60, ?, ?, 'tester', 'completed')
        `).run(`in-sup-ref-${suffix}`, `IN-SUP-REF-${suffix}`, materialId, `BATCH-${suffix}`, supplierId, locationId)
      }
      if (ref === 'batch') {
        db.prepare(`
          INSERT INTO batches (id, material_id, batch_no, quantity, remaining, inbound_id, supplier_id)
          VALUES (?, ?, ?, 5, 5, ?, ?)
        `).run(`batch-sup-ref-${suffix}`, materialId, `BATCH-SUP-REF-${suffix}`, `inbound-${suffix}`, supplierId)
      }
      if (ref === 'supplier-return') {
        db.prepare(`
          INSERT INTO supplier_returns (
            id, return_no, material_id, quantity, supplier_id, reason, operator, status
          )
          VALUES (?, ?, ?, 1, ?, 'quality_issue', 'tester', 'pending')
        `).run(`sr-sup-ref-${suffix}`, `SR-SUP-REF-${suffix}`, materialId, supplierId)
      }

      const res = await request(app)
        .delete(`/api/v1/suppliers/${supplierId}`)
        .set('Authorization', `Bearer ${token}`)

      expect(res.status).toBe(409)
      const supplier = db.prepare('SELECT is_deleted FROM suppliers WHERE id = ?').get(supplierId) as any
      expect(Number(supplier.is_deleted)).toBe(0)
    }
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

  it('SUP-FINANCE-001: 税号和银行信息必须随供应商主数据保存、回看和更新', async () => {
    const suffix = `finance-${Date.now()}`
    const created = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `财务字段供应商-${suffix}`,
        contact: '财务联系人',
        phone: '13800138000',
        email: `finance-${suffix}@example.com`,
        address: '财务地址',
        taxNo: `TAX-${suffix}`,
        bankName: '测试银行',
        bankAccount: `ACC-${suffix}`,
      })

    expect(created.status).toBe(201)
    const row = db.prepare('SELECT tax_no, bank_name, bank_account FROM suppliers WHERE id = ?')
      .get(created.body.data.id) as any
    expect(row).toMatchObject({
      tax_no: `TAX-${suffix}`,
      bank_name: '测试银行',
      bank_account: `ACC-${suffix}`,
    })

    const list = await request(app)
      .get('/api/v1/suppliers')
      .query({ keyword: suffix, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)

    expect(list.status).toBe(200)
    expect(list.body.data.list[0]).toMatchObject({
      taxNo: `TAX-${suffix}`,
      bankName: '测试银行',
      bankAccount: `ACC-${suffix}`,
    })

    const updated = await request(app)
      .put(`/api/v1/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        taxNo: `TAX-UPDATED-${suffix}`,
        bankName: '更新银行',
        bankAccount: `ACC-UPDATED-${suffix}`,
      })

    expect(updated.status).toBe(200)
    const updatedRow = db.prepare('SELECT tax_no, bank_name, bank_account FROM suppliers WHERE id = ?')
      .get(created.body.data.id) as any
    expect(updatedRow).toMatchObject({
      tax_no: `TAX-UPDATED-${suffix}`,
      bank_name: '更新银行',
      bank_account: `ACC-UPDATED-${suffix}`,
    })
  })

  it('SUP-CODE-001: 供应商编码是采购和成本审计身份，更新接口不可改写', async () => {
    const suffix = `code-${Date.now()}`
    const supplierId = await createSupplier(app, token, suffix)
    const before = db.prepare('SELECT code FROM suppliers WHERE id = ?').get(supplierId) as any

    const res = await request(app)
      .put(`/api/v1/suppliers/${supplierId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `SUP-MANUAL-${suffix}` })

    expect(res.status).toBe(400)
    const after = db.prepare('SELECT code FROM suppliers WHERE id = ?').get(supplierId) as any
    expect(after.code).toBe(before.code)
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

  it('SUP-AUDIT-001: 供应商维护写入操作日志，支撑采购到入库来源追踪', async () => {
    const suffix = `audit-${Date.now()}`
    const created = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `审计供应商-${suffix}`,
        contact: '审计联系人',
        phone: '13800138000',
      })

    expect(created.status).toBe(201)

    const updated = await request(app)
      .put(`/api/v1/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ contact: '更新审计联系人' })

    expect(updated.status).toBe(200)

    const deleted = await request(app)
      .delete(`/api/v1/suppliers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(deleted.status).toBe(200)

    const logs = db.prepare(`
      SELECT operation, request_data
      FROM operation_logs
      WHERE request_data LIKE ?
      ORDER BY rowid ASC
    `).all(`%"id":"${created.body.data.id}"%`) as any[]

    expect(logs.map(row => row.operation)).toEqual([
      'POST /suppliers',
      'PUT /suppliers/:id',
      'DELETE /suppliers/:id',
    ])
  })
})
