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

describe('集成测试：非ABC项目分组成本报表', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('REPORT-GROUP-001: 项目软删除后仍保留历史出库的BOM分组归属', async () => {
    const suffix = Date.now()
    const categoryId = `report-group-cat-${suffix}`
    const materialId = `report-group-mat-${suffix}`
    const bomId = `report-group-bom-${suffix}`
    const projectId = `report-group-project-${suffix}`
    const outboundId = `report-group-out-${suffix}`
    const itemId = `report-group-item-${suffix}`

    db.prepare(`
      INSERT INTO material_categories (id, code, name, level)
      VALUES (?, ?, '分组报表分类', 1)
    `).run(categoryId, `REPORT-GROUP-CAT-${suffix}`)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status, is_deleted)
      VALUES (?, ?, '分组报表物料', '1ml', '瓶', ?, 25, 1, 0)
    `).run(materialId, `REPORT-GROUP-MAT-${suffix}`, categoryId)
    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status, is_deleted)
      VALUES (?, ?, '分组报表BOM', 'v1', 'ihc', 1, 0)
    `).run(bomId, `REPORT-GROUP-BOM-${suffix}`)
    db.prepare(`
      INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit, group_name)
      VALUES (?, ?, ?, 1, '瓶', '特异性试剂')
    `).run(`report-group-bi-${suffix}`, bomId, materialId)
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, status, is_deleted)
      VALUES (?, ?, '已删除但有分组历史项目', 'ihc', ?, 1, 0)
    `).run(projectId, `REPORT-GROUP-PROJECT-${suffix}`, bomId)
    db.prepare(`
      INSERT INTO outbound_records (
        id, outbound_no, type, project_id, total_cost, sample_count,
        operator, status, created_at, is_deleted
      )
      VALUES (?, ?, 'bom', ?, 50, 1, 'admin', 'completed', '2032-04-10T09:00:00', 0)
    `).run(outboundId, `REPORT-GROUP-OUT-${suffix}`, projectId)
    db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, quantity, unit, unit_cost, total_cost)
      VALUES (?, ?, ?, 2, '瓶', 25, 50)
    `).run(itemId, outboundId, materialId)
    db.prepare('UPDATE projects SET is_deleted = 1 WHERE id = ?').run(projectId)

    const res = await request(app)
      .get(`/api/v1/reports/cost-by-project-group?projectId=${projectId}&startDate=2032-04-01&endDate=2032-04-30`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const project = res.body.data.projects.find((row: any) => row.projectId === projectId)
    expect(project).toBeDefined()
    expect(project.projectName).toBe('已删除但有分组历史项目')
    expect(project.groups).toEqual([
      expect.objectContaining({
        groupName: '特异性试剂',
        totalCost: 50,
        materials: [
          expect.objectContaining({
            materialId,
            materialName: '分组报表物料',
            totalCost: 50,
          }),
        ],
      }),
    ])
  })

  it('REPORT-GROUP-002: BOM软删除后仍保留历史出库的分组归属', async () => {
    const suffix = Date.now()
    const categoryId = `report-group-bom-cat-${suffix}`
    const materialId = `report-group-bom-mat-${suffix}`
    const bomId = `report-group-deleted-bom-${suffix}`
    const projectId = `report-group-bom-project-${suffix}`
    const outboundId = `report-group-bom-out-${suffix}`
    const itemId = `report-group-bom-item-${suffix}`

    db.prepare(`
      INSERT INTO material_categories (id, code, name, level)
      VALUES (?, ?, 'BOM分组报表分类', 1)
    `).run(categoryId, `REPORT-GROUP-BOM-CAT-${suffix}`)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status, is_deleted)
      VALUES (?, ?, 'BOM分组报表物料', '1ml', '瓶', ?, 30, 1, 0)
    `).run(materialId, `REPORT-GROUP-BOM-MAT-${suffix}`, categoryId)
    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status, is_deleted)
      VALUES (?, ?, '已删除但有分组历史BOM', 'v1', 'ihc', 1, 0)
    `).run(bomId, `REPORT-GROUP-DEL-BOM-${suffix}`)
    db.prepare(`
      INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit, group_name)
      VALUES (?, ?, ?, 1, '瓶', '特异性试剂')
    `).run(`report-group-del-bi-${suffix}`, bomId, materialId)
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, status, is_deleted)
      VALUES (?, ?, 'BOM软删除分组历史项目', 'ihc', ?, 1, 0)
    `).run(projectId, `REPORT-GROUP-BOM-PROJECT-${suffix}`, bomId)
    db.prepare(`
      INSERT INTO outbound_records (
        id, outbound_no, type, project_id, total_cost, sample_count,
        operator, status, created_at, is_deleted
      )
      VALUES (?, ?, 'bom', ?, 60, 1, 'admin', 'completed', '2032-05-10T09:00:00', 0)
    `).run(outboundId, `REPORT-GROUP-BOM-OUT-${suffix}`, projectId)
    db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, quantity, unit, unit_cost, total_cost)
      VALUES (?, ?, ?, 2, '瓶', 30, 60)
    `).run(itemId, outboundId, materialId)
    db.prepare('UPDATE boms SET is_deleted = 1 WHERE id = ?').run(bomId)

    const res = await request(app)
      .get(`/api/v1/reports/cost-by-project-group?projectId=${projectId}&startDate=2032-05-01&endDate=2032-05-31`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const project = res.body.data.projects.find((row: any) => row.projectId === projectId)
    expect(project).toBeDefined()
    expect(project.projectName).toBe('BOM软删除分组历史项目')
    expect(project.groups).toEqual([
      expect.objectContaining({
        groupName: '特异性试剂',
        totalCost: 60,
        materials: [
          expect.objectContaining({
            materialId,
            materialName: 'BOM分组报表物料',
            totalCost: 60,
          }),
        ],
      }),
    ])
  })

  it('REPORT-GROUP-003: 物料软删除后仍保留历史出库的分组明细', async () => {
    const suffix = Date.now()
    const categoryId = `report-group-mat-cat-${suffix}`
    const materialId = `report-group-deleted-mat-${suffix}`
    const bomId = `report-group-mat-bom-${suffix}`
    const projectId = `report-group-mat-project-${suffix}`
    const outboundId = `report-group-mat-out-${suffix}`
    const itemId = `report-group-mat-item-${suffix}`

    db.prepare(`
      INSERT INTO material_categories (id, code, name, level)
      VALUES (?, ?, '物料分组报表分类', 1)
    `).run(categoryId, `REPORT-GROUP-MAT-CAT-${suffix}`)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status, is_deleted)
      VALUES (?, ?, '已删除但有分组历史物料', '1ml', '瓶', ?, 35, 1, 0)
    `).run(materialId, `REPORT-GROUP-DEL-MAT-${suffix}`, categoryId)
    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status, is_deleted)
      VALUES (?, ?, '物料软删除分组BOM', 'v1', 'ihc', 1, 0)
    `).run(bomId, `REPORT-GROUP-MAT-BOM-${suffix}`)
    db.prepare(`
      INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit, group_name)
      VALUES (?, ?, ?, 1, '瓶', '特异性试剂')
    `).run(`report-group-mat-bi-${suffix}`, bomId, materialId)
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, status, is_deleted)
      VALUES (?, ?, '物料软删除分组历史项目', 'ihc', ?, 1, 0)
    `).run(projectId, `REPORT-GROUP-MAT-PROJECT-${suffix}`, bomId)
    db.prepare(`
      INSERT INTO outbound_records (
        id, outbound_no, type, project_id, total_cost, sample_count,
        operator, status, created_at, is_deleted
      )
      VALUES (?, ?, 'bom', ?, 70, 1, 'admin', 'completed', '2032-06-10T09:00:00', 0)
    `).run(outboundId, `REPORT-GROUP-MAT-OUT-${suffix}`, projectId)
    db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, quantity, unit, unit_cost, total_cost)
      VALUES (?, ?, ?, 2, '瓶', 35, 70)
    `).run(itemId, outboundId, materialId)
    db.prepare('UPDATE materials SET is_deleted = 1 WHERE id = ?').run(materialId)

    const res = await request(app)
      .get(`/api/v1/reports/cost-by-project-group?projectId=${projectId}&startDate=2032-06-01&endDate=2032-06-30`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const project = res.body.data.projects.find((row: any) => row.projectId === projectId)
    expect(project).toBeDefined()
    expect(project.projectName).toBe('物料软删除分组历史项目')
    expect(project.groups).toEqual([
      expect.objectContaining({
        groupName: '特异性试剂',
        totalCost: 70,
        materials: [
          expect.objectContaining({
            materialId,
            materialName: '已删除但有分组历史物料',
            totalCost: 70,
          }),
        ],
      }),
    ])
  })

  it('REPORT-GROUP-004: 项目分组成本报表按真实样本数汇总而不是按出库单数计数', async () => {
    const suffix = Date.now()
    const categoryId = `report-group-sample-cat-${suffix}`
    const materialId = `report-group-sample-mat-${suffix}`
    const bomId = `report-group-sample-bom-${suffix}`
    const projectId = `report-group-sample-project-${suffix}`
    const outboundIdA = `report-group-sample-out-a-${suffix}`
    const outboundIdB = `report-group-sample-out-b-${suffix}`

    db.prepare(`
      INSERT INTO material_categories (id, code, name, level)
      VALUES (?, ?, '样本数分组报表分类', 1)
    `).run(categoryId, `REPORT-GROUP-SAMPLE-CAT-${suffix}`)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status, is_deleted)
      VALUES (?, ?, '样本数分组报表物料', '1ml', '瓶', ?, 20, 1, 0)
    `).run(materialId, `REPORT-GROUP-SAMPLE-MAT-${suffix}`, categoryId)
    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status, is_deleted)
      VALUES (?, ?, '样本数分组报表BOM', 'v1', 'ihc', 1, 0)
    `).run(bomId, `REPORT-GROUP-SAMPLE-BOM-${suffix}`)
    db.prepare(`
      INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit, group_name)
      VALUES (?, ?, ?, 1, '瓶', '特异性试剂')
    `).run(`report-group-sample-bi-${suffix}`, bomId, materialId)
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, status, is_deleted)
      VALUES (?, ?, '分组样本数历史项目', 'ihc', ?, 1, 0)
    `).run(projectId, `REPORT-GROUP-SAMPLE-PROJECT-${suffix}`, bomId)
    db.prepare(`
      INSERT INTO outbound_records (
        id, outbound_no, type, project_id, total_cost, sample_count,
        operator, status, created_at, is_deleted
      )
      VALUES
        (?, ?, 'bom', ?, 100, 5, 'admin', 'completed', '2032-07-10T09:00:00', 0),
        (?, ?, 'bom', ?, 120, 5, 'admin', 'completed', '2032-07-11T09:00:00', 0)
    `).run(
      outboundIdA, `REPORT-GROUP-SAMPLE-OUT-A-${suffix}`, projectId,
      outboundIdB, `REPORT-GROUP-SAMPLE-OUT-B-${suffix}`, projectId,
    )
    db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, quantity, unit, unit_cost, total_cost)
      VALUES
        (?, ?, ?, 5, '瓶', 20, 100),
        (?, ?, ?, 6, '瓶', 20, 120)
    `).run(
      `report-group-sample-item-a-${suffix}`, outboundIdA, materialId,
      `report-group-sample-item-b-${suffix}`, outboundIdB, materialId,
    )

    const res = await request(app)
      .get(`/api/v1/reports/cost-by-project-group?projectId=${projectId}&startDate=2032-07-01&endDate=2032-07-31`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    const project = res.body.data.projects.find((row: any) => row.projectId === projectId)
    expect(project).toBeDefined()
    expect(project.sampleCount).toBe(10)
    expect(project.groups).toEqual([
      expect.objectContaining({
        groupName: '特异性试剂',
        sampleCount: 10,
        totalCost: 220,
      }),
    ])
  })
})
