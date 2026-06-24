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

  it('REPORT-SUPPLIER-002: 供应商成本报表只扣减同期间已退款供应商退货金额', async () => {
    const suffix = Date.now()
    const categoryId = `report-supplier-net-cat-${suffix}`
    const supplierId = `report-supplier-net-${suffix}`
    const locationId = `report-supplier-net-loc-${suffix}`
    const materialId = `report-supplier-net-mat-${suffix}`
    const inboundId = `report-supplier-net-in-${suffix}`

    db.prepare(`
      INSERT INTO material_categories (id, code, name, level)
      VALUES (?, ?, '供应商净额报表分类', 1)
    `).run(categoryId, `REPORT-SUP-NET-CAT-${suffix}`)
    db.prepare(`
      INSERT INTO suppliers (id, code, name, is_deleted)
      VALUES (?, ?, '供应商净额测试', 0)
    `).run(supplierId, `REPORT-SUP-NET-${suffix}`)
    db.prepare(`
      INSERT INTO locations (id, code, name, zone)
      VALUES (?, ?, '供应商净额报表库位', 'A区')
    `).run(locationId, `REPORT-SUP-NET-LOC-${suffix}`)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, supplier_id, price, location_id, status, is_deleted)
      VALUES (?, ?, '供应商净额报表物料', '1ml', '瓶', ?, ?, 10, ?, 1, 0)
    `).run(materialId, `REPORT-SUP-NET-MAT-${suffix}`, categoryId, supplierId, locationId)
    db.prepare(`
      INSERT INTO inbound_records (
        id, inbound_no, type, material_id, quantity, unit, price, amount,
        supplier_id, location_id, operator, status, created_at, is_deleted
      )
      VALUES (?, ?, 'purchase', ?, 50, '瓶', 10, 500, ?, ?, 'admin', 'completed', '2033-01-10T09:00:00', 0)
    `).run(inboundId, `REPORT-SUP-NET-IN-${suffix}`, materialId, supplierId, locationId)
    db.prepare(`
      INSERT INTO supplier_returns (
        id, return_no, material_id, quantity, supplier_id, reason, refund_amount,
        status, operator, created_at, updated_at, is_deleted
      )
      VALUES
        (?, ?, ?, 12, ?, '质量问题', 120, 'refunded', 'admin', '2033-01-12T09:00:00', '2033-01-12T09:00:00', 0),
        (?, ?, ?, 9, ?, '待发货预计退款', 90, 'pending', 'admin', '2033-01-12T10:00:00', '2033-01-12T10:00:00', 0),
        (?, ?, ?, 8, ?, '已发货预计退款', 80, 'shipped', 'admin', '2033-01-12T11:00:00', '2033-01-12T11:00:00', 0),
        (?, ?, ?, 7, ?, '已收货待退款', 70, 'received', 'admin', '2033-01-12T12:00:00', '2033-01-12T12:00:00', 0),
        (?, ?, ?, 5, ?, '取消退货', 50, 'cancelled', 'admin', '2033-01-13T09:00:00', '2033-01-13T09:00:00', 0),
        (?, ?, ?, 3, ?, '已删除退货', 30, 'refunded', 'admin', '2033-01-14T09:00:00', '2033-01-14T09:00:00', 1)
    `).run(
      `report-sup-return-net-${suffix}`, `REPORT-SUP-RET-NET-${suffix}`, materialId, supplierId,
      `report-sup-return-pending-${suffix}`, `REPORT-SUP-RET-PENDING-${suffix}`, materialId, supplierId,
      `report-sup-return-shipped-${suffix}`, `REPORT-SUP-RET-SHIPPED-${suffix}`, materialId, supplierId,
      `report-sup-return-received-${suffix}`, `REPORT-SUP-RET-RECEIVED-${suffix}`, materialId, supplierId,
      `report-sup-return-cancel-${suffix}`, `REPORT-SUP-RET-CANCEL-${suffix}`, materialId, supplierId,
      `report-sup-return-deleted-${suffix}`, `REPORT-SUP-RET-DELETED-${suffix}`, materialId, supplierId,
    )

    const res = await request(app)
      .get('/api/v1/reports/cost-by-supplier?startDate=2033-01-01&endDate=2033-01-31')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const item = res.body.data.suppliers.find((row: any) => row.id === supplierId)
    expect(item).toMatchObject({
      id: supplierId,
      name: '供应商净额测试',
      amount: 380,
      grossAmount: 500,
      refundedAmount: 120,
      refundedReturnCount: 1,
      supplierReturnUrl: `/supplier-returns?supplierId=${supplierId}&status=refunded&startDate=2033-01-01&endDate=2033-01-31`,
      orderCount: 1,
    })
  })
})
