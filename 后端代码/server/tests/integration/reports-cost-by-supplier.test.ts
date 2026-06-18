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
  expect(res.body.success).toBe(true)
  return res.body.data.token
}

describe('集成测试：非ABC供应商成本报表', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('REPORT-SUPPLIER-001: 历史入库金额不因供应商后续软删除而从报表消失', async () => {
    const suffix = Date.now()
    const categoryId = `report-supplier-cat-${suffix}`
    const supplierId = `report-supplier-deleted-${suffix}`
    const locationId = `report-supplier-loc-${suffix}`
    const materialId = `report-supplier-mat-${suffix}`
    const inboundId = `report-supplier-in-${suffix}`

    db.prepare(`
      INSERT INTO material_categories (id, code, name, level)
      VALUES (?, ?, '供应商报表分类', 1)
    `).run(categoryId, `REPORT-SUP-CAT-${suffix}`)
    db.prepare(`
      INSERT INTO suppliers (id, code, name, is_deleted)
      VALUES (?, ?, '已删除但有入库历史供应商', 0)
    `).run(supplierId, `REPORT-SUP-${suffix}`)
    db.prepare(`
      INSERT INTO locations (id, code, name, zone)
      VALUES (?, ?, '供应商报表库位', 'A区')
    `).run(locationId, `REPORT-SUP-LOC-${suffix}`)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, supplier_id, price, location_id, status, is_deleted)
      VALUES (?, ?, '供应商报表物料', '1ml', '瓶', ?, ?, 12, ?, 1, 0)
    `).run(materialId, `REPORT-SUP-MAT-${suffix}`, categoryId, supplierId, locationId)
    db.prepare(`
      INSERT INTO inbound_records (
        id, inbound_no, type, material_id, quantity, unit, price, amount,
        supplier_id, location_id, operator, status, created_at, is_deleted
      )
      VALUES (?, ?, 'purchase', ?, 30, '瓶', 12, 360, ?, ?, 'admin', 'completed', '2026-06-15T09:00:00', 0)
    `).run(inboundId, `REPORT-SUP-IN-${suffix}`, materialId, supplierId, locationId)
    db.prepare('UPDATE suppliers SET is_deleted = 1 WHERE id = ?').run(supplierId)

    const res = await request(app)
      .get('/api/v1/reports/cost-by-supplier?startDate=2026-06-01&endDate=2026-06-30')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const item = res.body.data.suppliers.find((row: any) => row.id === supplierId)
    expect(item).toMatchObject({
      id: supplierId,
      name: '已删除但有入库历史供应商',
      amount: 360,
      orderCount: 1,
    })
  })
})
