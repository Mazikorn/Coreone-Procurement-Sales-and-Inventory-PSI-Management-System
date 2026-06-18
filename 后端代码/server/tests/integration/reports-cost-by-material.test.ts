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

describe('集成测试：非ABC物料成本报表', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('REPORT-MATERIAL-001: 历史出库成本不因物料后续软删除而从报表消失', async () => {
    const suffix = Date.now()
    const categoryId = `report-material-category-${suffix}`
    const materialId = `report-material-deleted-${suffix}`
    const outboundId = `report-material-outbound-${suffix}`
    const outboundItemId = `report-material-item-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, 1)')
      .run(categoryId, `REPORT-MAT-CAT-${suffix}`, '报表历史物料分类')
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status, is_deleted)
      VALUES (?, ?, '已删除但有历史出库物料', '10ml', '瓶', ?, 60, 1, 0)
    `).run(materialId, `REPORT-MAT-${suffix}`, categoryId)
    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, total_cost, sample_count, operator, status, created_at, is_deleted)
      VALUES (?, ?, 'normal', 300, 1, 'admin', 'completed', '2026-06-12T09:00:00', 0)
    `).run(outboundId, `REPORT-MAT-OUT-${suffix}`)
    db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, quantity, unit, unit_cost, total_cost)
      VALUES (?, ?, ?, 5, '瓶', 60, 300)
    `).run(outboundItemId, outboundId, materialId)
    db.prepare('UPDATE materials SET is_deleted = 1 WHERE id = ?').run(materialId)

    const res = await request(app)
      .get('/api/v1/reports/cost-by-material?startDate=2026-06-01&endDate=2026-06-30')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const materialCost = res.body.data.materials.find((row: any) => row.id === materialId)
    expect(materialCost).toMatchObject({
      id: materialId,
      name: '已删除但有历史出库物料',
      spec: '10ml',
      consumption: 5,
      consumptionUnit: '瓶',
      totalCost: 300,
    })
  })

  it('REPORT-MATERIAL-002: 成本差异按物料维度保留软删除物料的历史名称和单位', async () => {
    const suffix = Date.now()
    const categoryId = `report-variance-category-${suffix}`
    const materialId = `report-variance-material-${suffix}`
    const outboundId = `report-variance-outbound-${suffix}`
    const outboundItemId = `report-variance-item-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, 1)')
      .run(categoryId, `REPORT-VAR-CAT-${suffix}`, '差异历史物料分类')
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status, is_deleted)
      VALUES (?, ?, '已删除但有成本差异物料', '20ml', '盒', ?, 45, 1, 0)
    `).run(materialId, `REPORT-VAR-MAT-${suffix}`, categoryId)
    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, total_cost, sample_count, operator, status, created_at, is_deleted)
      VALUES (?, ?, 'normal', 180, 1, 'admin', 'completed', '2026-06-13T09:00:00', 0)
    `).run(outboundId, `REPORT-VAR-OUT-${suffix}`)
    db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, quantity, unit, unit_cost, total_cost)
      VALUES (?, ?, ?, 4, '盒', 45, 180)
    `).run(outboundItemId, outboundId, materialId)
    db.prepare('UPDATE materials SET is_deleted = 1 WHERE id = ?').run(materialId)

    const res = await request(app)
      .get('/api/v1/reports/cost-variance?compareType=material&startDate=2026-06-01&endDate=2026-06-30')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const item = res.body.data.items.find((row: any) => row.projectId === materialId)
    expect(item).toMatchObject({
      projectId: materialId,
      projectName: '已删除但有成本差异物料',
      groupType: 'material',
      unit: '盒',
      materialActual: 180,
      materialStandard: 180,
      sampleCount: 4,
    })
  })
})
