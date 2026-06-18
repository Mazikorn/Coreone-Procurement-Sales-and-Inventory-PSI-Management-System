process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../../src/app.js')
  const { getDatabase } = await import('../../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function loginAdmin(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedSupplierReturnMaterial(db: any, suffix: string) {
  const categoryId = `cat-sr-${suffix}`
  const materialId = `mat-sr-${suffix}`
  const supplierId = `sup-sr-${suffix}`
  const locationId = `loc-sr-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-SR-${suffix}`, '供应商退货测试分类', 1)
  db.prepare('INSERT INTO suppliers (id, code, name) VALUES (?, ?, ?)')
    .run(supplierId, `SUP-SR-${suffix}`, '供应商退货测试供应商')
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-SR-${suffix}`, '供应商退货测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, supplier_id, price, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-SR-${suffix}`, '供应商退货测试物料', '1ml', '瓶', categoryId, supplierId, 12, locationId)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, ?, 0, ?)')
    .run(`inv-sr-${suffix}`, materialId, 10, locationId)

  return { materialId, supplierId }
}

describe('供应商退货审计可信性', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('SR-AUDIT-001: 创建和撤销供应商退货均使用登录用户作为operator', async () => {
    const { materialId, supplierId } = seedSupplierReturnMaterial(db, `op-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({
        materialId,
        supplierId,
        quantity: 1,
        reason: '测试退货给供应商',
        operator: 'forged-user',
      })
    expect(createRes.status).toBe(200)

    const record = db.prepare('SELECT operator FROM supplier_returns WHERE id = ?').get(createRes.body.data.id) as any
    const createLog = db.prepare('SELECT operator FROM stock_logs WHERE related_id = ? AND related_type = ?')
      .get(createRes.body.data.id, 'supplier_return') as any
    expect(record.operator).toBe('admin')
    expect(createLog.operator).toBe('admin')

    const deleteRes = await request(app)
      .delete(`/api/v1/supplier-returns/${createRes.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ operator: 'forged-user' })
    expect(deleteRes.status).toBe(200)

    const cancelLog = db.prepare('SELECT operator FROM stock_logs WHERE related_id = ? AND related_type = ?')
      .get(createRes.body.data.id, 'supplier_return_cancel') as any
    expect(cancelLog.operator).toBe('admin')
  })

  it('SR-AUDIT-002: 状态流转写入操作日志', async () => {
    const { materialId, supplierId } = seedSupplierReturnMaterial(db, `status-${Date.now()}`)
    const createRes = await request(app)
      .post('/api/v1/supplier-returns')
      .set('Authorization', `Bearer ${token}`)
      .send({ materialId, supplierId, quantity: 1, reason: '测试退货给供应商' })
    expect(createRes.status).toBe(200)

    const statusRes = await request(app)
      .put(`/api/v1/supplier-returns/${createRes.body.data.id}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'shipped' })
    expect(statusRes.status).toBe(200)

    const auditLog = db.prepare(`
      SELECT * FROM operation_logs
      WHERE operation = ? AND description LIKE ?
      ORDER BY created_at DESC LIMIT 1
    `).get('supplier_return_status_update', `%${createRes.body.data.id}%`) as any
    expect(auditLog.username).toBe('admin')
  })
})
