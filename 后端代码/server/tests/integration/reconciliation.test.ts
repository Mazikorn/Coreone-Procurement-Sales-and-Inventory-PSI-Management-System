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

async function loginUser(app: any, username: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password: 'CoreOne2026!' })
  expect(res.status).toBe(200)
  return res.body.data.token
}

describe('成本对账异常闭环', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('技术员作为入口主要用户必须能访问消耗对账接口', async () => {
    const technicianToken = await loginUser(app, 'jishuyuan1')

    const res = await request(app)
      .get('/api/v1/reconciliation/summary')
      .set('Authorization', `Bearer ${technicianToken}`)

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
  })

  it('项目物料对账差异审计写入成本异常，并在差异恢复后自动关闭', async () => {
    const suffix = Date.now()
    const materialId = `mat-recon-${suffix}`
    const bomId = `bom-recon-${suffix}`
    const projectId = `proj-recon-${suffix}`
    const outboundId = `out-recon-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
      .run(`cat-recon-${suffix}`, `RC${suffix}`, '对账试剂', 1)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(materialId, `M-RECON-${suffix}`, '对账物料', '1ml', '支', `cat-recon-${suffix}`, 10)
    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status)
      VALUES (?, ?, ?, 'v1.0', 'ihc', 1)
    `).run(bomId, `BOM-RECON-${suffix}`, '对账BOM')
    db.prepare(`
      INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit)
      VALUES (?, ?, ?, ?, ?)
    `).run(`bi-recon-${suffix}`, bomId, materialId, 1, '支')
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, status)
      VALUES (?, ?, ?, 'ihc', ?, 1)
    `).run(projectId, `P-RECON-${suffix}`, '对账项目', bomId)

    db.prepare(`
      INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, import_batch)
      VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `case-recon-${suffix}-1`, `CASE-RECON-${suffix}-1`, projectId, '对账项目', 'lis', '2026-06-10 09:00:00', `batch-${suffix}`,
      `case-recon-${suffix}-2`, `CASE-RECON-${suffix}-2`, projectId, '对账项目', 'lis', '2026-06-11 09:00:00', `batch-${suffix}`,
    )
    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, operator, status, created_at)
      VALUES (?, ?, 'bom', ?, ?, 'admin', 'completed', ?)
    `).run(outboundId, `OUT-RECON-${suffix}`, projectId, 40, '2026-06-12 10:00:00')
    db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, quantity, unit, unit_cost, total_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`oi-recon-${suffix}`, outboundId, materialId, 4, '支', 10, 40)

    const audit = await request(app)
      .post(`/api/v1/reconciliation/projects/${projectId}/materials/audit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startDate: '2026-06-01', endDate: '2026-06-30' })

    expect(audit.status).toBe(200)
    expect(audit.body.data.dangerCount).toBe(1)
    expect(audit.body.data.created).toBe(1)

    const openException = db.prepare(`
      SELECT * FROM cost_exceptions
      WHERE source_module = 'reconciliation'
        AND exception_type = 'reconciliation_variance'
        AND project_id = ?
    `).get(projectId) as any
    expect(openException.status).toBe('open')
    expect(openException.severity).toBe('error')
    expect(openException.year_month).toBe('2026-06')

    db.prepare('UPDATE outbound_items SET quantity = ?, total_cost = ? WHERE outbound_id = ? AND material_id = ?')
      .run(2, 20, outboundId, materialId)

    const resolveAudit = await request(app)
      .post(`/api/v1/reconciliation/projects/${projectId}/materials/audit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ startDate: '2026-06-01', endDate: '2026-06-30' })

    expect(resolveAudit.status).toBe(200)
    expect(resolveAudit.body.data.resolved).toBe(1)

    const resolvedException = db.prepare('SELECT status, resolved_by FROM cost_exceptions WHERE id = ?')
      .get(openException.id) as any
    expect(resolvedException.status).toBe('resolved')
    expect(resolvedException.resolved_by).toBe('admin')

    const exportRes = await request(app)
      .get('/api/v1/reconciliation/export?type=project&startDate=2026-06-01&endDate=2026-06-30')
      .set('Authorization', `Bearer ${token}`)

    expect(exportRes.status).toBe(200)
    expect(exportRes.body.data.filename).toContain('reconciliation-project')
    expect(exportRes.body.data.filename).toContain('2026-06-01_2026-06-30')
    expect(exportRes.body.data.rowCount).toBeGreaterThanOrEqual(1)
    expect(exportRes.body.data.content).toContain('项目编码')
    expect(exportRes.body.data.content).toContain('对账项目')
  })

  it('LIS 导入可按项目名称关联项目，编辑病例时同步项目名称', async () => {
    const suffix = Date.now()
    const sourceProjectId = `proj-import-source-${suffix}`
    const targetProjectId = `proj-import-target-${suffix}`
    const caseNo = `CASE-IMPORT-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status)
      VALUES (?, ?, ?, 'ihc', 1), (?, ?, ?, 'he', 1)
    `).run(
      sourceProjectId, `P-IMPORT-S-${suffix}`, '导入匹配项目',
      targetProjectId, `P-IMPORT-T-${suffix}`, '编辑后项目',
    )

    const importRes = await request(app)
      .post('/api/v1/reconciliation/cases/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { caseNo, projectName: '导入匹配项目', operateTime: '2026-06-13 09:00:00', operator: 'lis' },
          { caseNo: `CASE-IMPORT-UNMATCHED-${suffix}`, projectName: '不存在项目', operateTime: '2026-06-13 10:00:00', operator: 'lis' },
        ],
      })

    expect(importRes.status).toBe(200)
    expect(importRes.body.data.count).toBe(2)
    expect(importRes.body.data.unmatched).toBe(1)

    const imported = db.prepare('SELECT id, project_id, project_name FROM lis_cases WHERE case_no = ?').get(caseNo) as any
    expect(imported.project_id).toBe(sourceProjectId)
    expect(imported.project_name).toBe('导入匹配项目')

    const unmatchedImport = db.prepare('SELECT project_id, project_name, status FROM lis_cases WHERE case_no = ?')
      .get(`CASE-IMPORT-UNMATCHED-${suffix}`) as any
    expect(unmatchedImport.project_id).toBe('')
    expect(unmatchedImport.project_name).toBe('不存在项目')
    expect(unmatchedImport.status).toBe('unmatched')

    const updateRes = await request(app)
      .put(`/api/v1/reconciliation/cases/${imported.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: targetProjectId, status: 'modified' })

    expect(updateRes.status).toBe(200)
    const updated = db.prepare('SELECT project_id, project_name, status FROM lis_cases WHERE id = ?').get(imported.id) as any
    expect(updated.project_id).toBe(targetProjectId)
    expect(updated.project_name).toBe('编辑后项目')
    expect(updated.status).toBe('modified')
  })

  it('病例编辑、列表筛选和导出必须拒绝非法病例状态', async () => {
    const suffix = Date.now()
    const projectId = `proj-case-status-${suffix}`
    const caseId = `case-status-${suffix}`
    const caseNo = `CASE-STATUS-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status)
      VALUES (?, ?, ?, 'ihc', 1)
    `).run(projectId, `P-CASE-STATUS-${suffix}`, '状态校验项目')
    db.prepare(`
      INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, status, import_batch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(caseId, caseNo, projectId, '状态校验项目', 'lis', '2026-06-21 09:00:00', 'normal', `batch-status-${suffix}`)

    const updateRes = await request(app)
      .put(`/api/v1/reconciliation/cases/${caseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'archived' })

    expect(updateRes.status).toBe(400)
    expect(updateRes.body.success).toBe(false)
    expect(updateRes.body.error.code).toBe('INVALID_PARAMETER')
    const unchanged = db.prepare('SELECT status FROM lis_cases WHERE id = ?').get(caseId) as any
    expect(unchanged.status).toBe('normal')

    const listRes = await request(app)
      .get('/api/v1/reconciliation/cases')
      .query({ status: 'archived' })
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(400)
    expect(listRes.body.success).toBe(false)
    expect(listRes.body.error.code).toBe('INVALID_PARAMETER')

    const exportRes = await request(app)
      .post('/api/v1/reconciliation/export')
      .set('Authorization', `Bearer ${token}`)
      .send({ tab: 'case', filters: { status: 'archived' } })

    expect(exportRes.status).toBe(400)
    expect(exportRes.body.success).toBe(false)
    expect(exportRes.body.error.code).toBe('INVALID_PARAMETER')
  })

  it('LIS 重新导入未匹配项目时不得清空既有关联项目', async () => {
    const suffix = Date.now()
    const projectId = `proj-import-preserve-${suffix}`
    const caseNo = `CASE-IMPORT-PRESERVE-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status)
      VALUES (?, ?, ?, 'ihc', 1)
    `).run(projectId, `P-IMPORT-PRESERVE-${suffix}`, '已匹配项目')

    const firstImport = await request(app)
      .post('/api/v1/reconciliation/cases/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { caseNo, projectName: '已匹配项目', operateTime: '2026-06-13 09:00:00', operator: 'lis-a' },
        ],
      })

    expect(firstImport.status).toBe(200)
    expect(firstImport.body.data.count).toBe(1)

    const secondImport = await request(app)
      .post('/api/v1/reconciliation/cases/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { caseNo, projectName: '不存在项目', operateTime: '2026-06-14 10:30:00', operator: 'lis-b' },
        ],
      })

    expect(secondImport.status).toBe(200)
    expect(secondImport.body.data.count).toBe(1)
    expect(secondImport.body.data.unmatched).toBe(1)

    const imported = db.prepare(`
      SELECT project_id, project_name, operator, operate_time
      FROM lis_cases
      WHERE case_no = ?
    `).get(caseNo) as any

    expect(imported.project_id).toBe(projectId)
    expect(imported.project_name).toBe('已匹配项目')
    expect(imported.operator).toBe('lis-b')
    expect(imported.operate_time).toBe('2026-06-14 10:30:00')
  })

  it('LIS 导入、病例编辑和 BOM 修正必须拒绝停用检测项目作为新候选', async () => {
    const suffix = Date.now()
    const inactiveProjectId = `proj-inactive-candidate-${suffix}`
    const activeProjectId = `proj-active-candidate-${suffix}`
    const bomId = `bom-inactive-candidate-${suffix}`
    const materialId = `mat-inactive-candidate-${suffix}`
    const explicitCaseNo = `CASE-INACTIVE-EXPLICIT-${suffix}`
    const nameOnlyCaseNo = `CASE-INACTIVE-NAME-${suffix}`
    const editableCaseId = `case-inactive-edit-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
      .run(`cat-inactive-candidate-${suffix}`, `IC${suffix}`, '停用项目校验试剂', 1)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(materialId, `M-INACTIVE-CAND-${suffix}`, '停用项目校验物料', '1ml', '支', `cat-inactive-candidate-${suffix}`, 10)
    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status)
      VALUES (?, ?, ?, 'v1.0', 'ihc', 1)
    `).run(bomId, `BOM-INACTIVE-CAND-${suffix}`, '停用项目校验BOM')
    db.prepare(`
      INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit)
      VALUES (?, ?, ?, ?, ?)
    `).run(`bi-inactive-candidate-${suffix}`, bomId, materialId, 1, '支')
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, status)
      VALUES (?, ?, ?, 'ihc', ?, 0), (?, ?, ?, 'ihc', '', 1)
    `).run(
      inactiveProjectId, `P-INACTIVE-CAND-${suffix}`, '停用候选项目', bomId,
      activeProjectId, `P-ACTIVE-CAND-${suffix}`, '启用候选项目',
    )
    db.prepare(`
      INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, status, import_batch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(editableCaseId, `CASE-INACTIVE-EDIT-${suffix}`, activeProjectId, '启用候选项目', 'lis', '2026-06-22 09:00:00', 'normal', `batch-inactive-${suffix}`)

    const importRes = await request(app)
      .post('/api/v1/reconciliation/cases/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { caseNo: explicitCaseNo, projectId: inactiveProjectId, projectName: '停用候选项目', operateTime: '2026-06-22 10:00:00', operator: 'lis' },
          { caseNo: nameOnlyCaseNo, projectName: '停用候选项目', operateTime: '2026-06-22 11:00:00', operator: 'lis' },
        ],
      })

    expect(importRes.status).toBe(200)
    expect(importRes.body.data.count).toBe(1)
    expect(importRes.body.data.skipped).toBe(1)
    expect(importRes.body.data.unmatched).toBe(1)
    expect(importRes.body.data.errors).toEqual([
      expect.objectContaining({ row: 1, caseNo: explicitCaseNo, message: expect.stringContaining('指定检测项目不存在') }),
    ])
    expect(db.prepare('SELECT COUNT(*) as count FROM lis_cases WHERE case_no = ?').get(explicitCaseNo).count).toBe(0)
    const unmatched = db.prepare('SELECT project_id, project_name, status FROM lis_cases WHERE case_no = ?').get(nameOnlyCaseNo) as any
    expect(unmatched.project_id).toBe('')
    expect(unmatched.project_name).toBe('停用候选项目')
    expect(unmatched.status).toBe('unmatched')

    const editRes = await request(app)
      .put(`/api/v1/reconciliation/cases/${editableCaseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId: inactiveProjectId })

    expect(editRes.status).toBe(400)
    expect(editRes.body.success).toBe(false)
    expect(editRes.body.error.code).toBe('INVALID_PARAMETER')
    const unchangedCase = db.prepare('SELECT project_id, project_name FROM lis_cases WHERE id = ?').get(editableCaseId) as any
    expect(unchangedCase.project_id).toBe(activeProjectId)
    expect(unchangedCase.project_name).toBe('启用候选项目')

    const beforeLogCount = (db.prepare('SELECT COUNT(*) as count FROM reconciliation_logs').get() as any).count
    const fixRes = await request(app)
      .post('/api/v1/reconciliation/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'bom_fix',
        targetId: materialId,
        targetName: '停用项目校验物料',
        field: 'usage_per_sample,unit',
        oldValue: '1 支',
        newValue: '2 ml',
        reason: '停用项目不能修正',
        projectId: inactiveProjectId,
        materialId,
        newUsage: 2,
        newUnit: 'ml',
      })

    expect(fixRes.status).toBe(400)
    expect(fixRes.body.success).toBe(false)
    expect(fixRes.body.error.code).toBe('INVALID_PARAMETER')
    const item = db.prepare('SELECT usage_per_sample, unit FROM bom_items WHERE bom_id = ? AND material_id = ?')
      .get(bomId, materialId) as any
    expect(item.usage_per_sample).toBe(1)
    expect(item.unit).toBe('支')
    const afterLogCount = (db.prepare('SELECT COUNT(*) as count FROM reconciliation_logs').get() as any).count
    expect(afterLogCount).toBe(beforeLogCount)
  })

  it('未匹配病例绑定到已配置 BOM 的项目后必须自动转为已修改状态', async () => {
    const suffix = Date.now()
    const materialId = `mat-recon-link-${suffix}`
    const bomId = `bom-recon-link-${suffix}`
    const projectId = `proj-recon-link-${suffix}`
    const caseId = `case-recon-link-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
      .run(`cat-recon-link-${suffix}`, `RCL${suffix}`, '对账绑定试剂', 1)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(materialId, `M-RECON-LINK-${suffix}`, '对账绑定物料', '1ml', '支', `cat-recon-link-${suffix}`, 10)
    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status)
      VALUES (?, ?, ?, 'v1.0', 'ihc', 1)
    `).run(bomId, `BOM-RECON-LINK-${suffix}`, '对账绑定BOM')
    db.prepare(`
      INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit)
      VALUES (?, ?, ?, ?, ?)
    `).run(`bi-recon-link-${suffix}`, bomId, materialId, 1, '支')
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, status)
      VALUES (?, ?, ?, 'ihc', ?, 1)
    `).run(projectId, `P-RECON-LINK-${suffix}`, '对账绑定项目', bomId)
    db.prepare(`
      INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, status, import_batch)
      VALUES (?, ?, '', ?, 'lis', '2026-06-23 09:00:00', 'unmatched', ?)
    `).run(caseId, `CASE-RECON-LINK-${suffix}`, '未知项目', `batch-link-${suffix}`)

    const res = await request(app)
      .put(`/api/v1/reconciliation/cases/${caseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ projectId })

    expect(res.status).toBe(200)
    const updated = db.prepare('SELECT project_id, project_name, status FROM lis_cases WHERE id = ?').get(caseId) as any
    expect(updated).toMatchObject({
      project_id: projectId,
      project_name: '对账绑定项目',
      status: 'modified',
    })
  })

  it('LIS 导入跳过缺少关键字段的病例，整批无效时拒绝写入', async () => {
    const suffix = Date.now()
    const projectId = `proj-import-required-${suffix}`
    const validCaseNo = `CASE-IMPORT-VALID-${suffix}`
    const blankCaseNo = `CASE-IMPORT-BLANK-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status)
      VALUES (?, ?, ?, 'ihc', 1)
    `).run(projectId, `P-IMPORT-REQ-${suffix}`, '导入必填项目')

    const mixed = await request(app)
      .post('/api/v1/reconciliation/cases/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { caseNo: validCaseNo, projectName: '导入必填项目', operateTime: '2026-06-17 09:00:00', operator: 'lis' },
          { caseNo: '', projectName: '导入必填项目', operateTime: '2026-06-17 10:00:00', operator: 'lis' },
          { caseNo: `CASE-IMPORT-NO-PROJECT-${suffix}`, projectName: '', operateTime: '2026-06-17 11:00:00', operator: 'lis' },
          { caseNo: `CASE-IMPORT-NO-TIME-${suffix}`, projectName: '导入必填项目', operateTime: '', operator: 'lis' },
        ],
      })

    expect(mixed.status).toBe(200)
    expect(mixed.body.data.count).toBe(1)
    expect(mixed.body.data.skipped).toBe(3)
    expect(db.prepare('SELECT COUNT(*) as count FROM lis_cases WHERE case_no = ?').get(validCaseNo).count).toBe(1)
    expect(db.prepare('SELECT COUNT(*) as count FROM lis_cases WHERE case_no = ?').get(blankCaseNo).count).toBe(0)

    const invalidOnly = await request(app)
      .post('/api/v1/reconciliation/cases/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { caseNo: '', projectName: '导入必填项目', operateTime: '2026-06-17 12:00:00', operator: 'lis' },
          { caseNo: `CASE-IMPORT-BAD-${suffix}`, projectName: '', operateTime: '', operator: 'lis' },
        ],
      })

    expect(invalidOnly.status).toBe(400)
    expect(invalidOnly.body.error.message).toContain('未找到有效病例数据')
  })

  it('LIS 导入必须拒绝检测时间格式错误的病例并返回具体错误行', async () => {
    const suffix = Date.now()
    const projectId = `proj-import-time-${suffix}`
    const validCaseNo = `CASE-IMPORT-TIME-VALID-${suffix}`
    const invalidCaseNo = `CASE-IMPORT-TIME-BAD-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status)
      VALUES (?, ?, ?, 'ihc', 1)
    `).run(projectId, `P-IMPORT-TIME-${suffix}`, '导入时间校验项目')

    const mixed = await request(app)
      .post('/api/v1/reconciliation/cases/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { caseNo: validCaseNo, projectName: '导入时间校验项目', operateTime: '2026-06-17 09:00:00', operator: 'lis' },
          { caseNo: invalidCaseNo, projectName: '导入时间校验项目', operateTime: 'not-a-date', operator: 'lis' },
        ],
      })

    expect(mixed.status).toBe(200)
    expect(mixed.body.data.count).toBe(1)
    expect(mixed.body.data.skipped).toBe(1)
    expect(mixed.body.data.errors).toEqual([
      expect.objectContaining({ row: 2, caseNo: invalidCaseNo, message: expect.stringContaining('检测时间格式错误') }),
    ])
    expect(db.prepare('SELECT COUNT(*) as count FROM lis_cases WHERE case_no = ?').get(validCaseNo).count).toBe(1)
    expect(db.prepare('SELECT COUNT(*) as count FROM lis_cases WHERE case_no = ?').get(invalidCaseNo).count).toBe(0)

    const invalidOnly = await request(app)
      .post('/api/v1/reconciliation/cases/import')
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          { caseNo: `CASE-IMPORT-TIME-ONLY-BAD-${suffix}`, projectName: '导入时间校验项目', operateTime: '2026-02-30 09:00', operator: 'lis' },
        ],
      })

    expect(invalidOnly.status).toBe(400)
    expect(invalidOnly.body.error.message).toContain('未找到有效病例数据')
    expect(invalidOnly.body.error.details.errors[0].message).toContain('检测时间格式错误')
  })

  it('FormData LIS 文件导入必须解析真实文件并返回失败行', async () => {
    const suffix = Date.now()
    const projectId = `proj-import-file-${suffix}`
    const validCaseNo = `CASE-IMPORT-FILE-VALID-${suffix}`
    const invalidCaseNo = `CASE-IMPORT-FILE-BAD-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status)
      VALUES (?, ?, ?, 'ihc', 1)
    `).run(projectId, `P-IMPORT-FILE-${suffix}`, '文件导入项目')

    const csv = [
      '病理号,检测项目,操作时间,操作人',
      `${validCaseNo},文件导入项目,2026-06-20 09:00:00,lis`,
      `${invalidCaseNo},文件导入项目,not-a-date,lis`,
    ].join('\n')

    const importRes = await request(app)
      .post('/api/v1/reconciliation/import-lis')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv, 'utf8'), { filename: 'lis-import.csv', contentType: 'text/csv' })

    expect(importRes.status).toBe(200)
    expect(importRes.body.data.imported).toBe(1)
    expect(importRes.body.data.failed).toBe(1)
    expect(importRes.body.data.errors).toEqual([
      expect.objectContaining({ row: 2, caseNo: invalidCaseNo, message: expect.stringContaining('检测时间格式错误') }),
    ])
    const imported = db.prepare('SELECT project_id, project_name FROM lis_cases WHERE case_no = ?').get(validCaseNo) as any
    expect(imported.project_id).toBe(projectId)
    expect(imported.project_name).toBe('文件导入项目')
    expect(db.prepare('SELECT COUNT(*) as count FROM lis_cases WHERE case_no = ?').get(invalidCaseNo).count).toBe(0)
  })

  it('病例列表和病例导出必须使用同一套日期、项目、状态和搜索筛选', async () => {
    const suffix = Date.now()
    const keepProjectId = `proj-case-filter-keep-${suffix}`
    const dropProjectId = `proj-case-filter-drop-${suffix}`
    const keepCaseNo = `CASE-FILTER-KEEP-${suffix}`
    const outOfRangeCaseNo = `CASE-FILTER-OLD-${suffix}`
    const otherProjectCaseNo = `CASE-FILTER-OTHER-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status)
      VALUES (?, ?, ?, 'ihc', 1), (?, ?, ?, 'he', 1)
    `).run(
      keepProjectId, `P-CASE-KEEP-${suffix}`, '病例筛选项目',
      dropProjectId, `P-CASE-DROP-${suffix}`, '病例筛选其他项目',
    )

    db.prepare(`
      INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, status, import_batch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `case-filter-keep-${suffix}`, keepCaseNo, keepProjectId, '病例筛选项目', 'lis', '2026-06-18 09:00:00', 'modified', `batch-${suffix}`,
      `case-filter-old-${suffix}`, outOfRangeCaseNo, keepProjectId, '病例筛选项目', 'lis', '2026-05-18 09:00:00', 'modified', `batch-${suffix}`,
      `case-filter-other-${suffix}`, otherProjectCaseNo, dropProjectId, '病例筛选其他项目', 'lis', '2026-06-18 10:00:00', 'normal', `batch-${suffix}`,
    )

    const listRes = await request(app)
      .get('/api/v1/reconciliation/cases')
      .query({
        page: 1,
        pageSize: 50,
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        search: `CASE-FILTER`,
        projectId: keepProjectId,
        status: 'modified',
      })
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    const listedCaseNos = listRes.body.data.list.map((item: any) => item.caseNo)
    expect(listedCaseNos).toContain(keepCaseNo)
    expect(listedCaseNos).not.toContain(outOfRangeCaseNo)
    expect(listedCaseNos).not.toContain(otherProjectCaseNo)

    const exportRes = await request(app)
      .get('/api/v1/reconciliation/export')
      .query({
        type: 'case',
        startDate: '2026-06-01',
        endDate: '2026-06-30',
        search: `CASE-FILTER`,
        projectId: keepProjectId,
        status: 'modified',
      })
      .set('Authorization', `Bearer ${token}`)

    expect(exportRes.status).toBe(200)
    expect(exportRes.body.data.content).toContain(keepCaseNo)
    expect(exportRes.body.data.content).not.toContain(outOfRangeCaseNo)
    expect(exportRes.body.data.content).not.toContain(otherProjectCaseNo)
  })

  it('病例列表、GET 导出和 POST 导出必须拒绝不存在的项目筛选', async () => {
    const missingProjectId = `proj-case-filter-missing-${Date.now()}`

    const listRes = await request(app)
      .get('/api/v1/reconciliation/cases')
      .query({ projectId: missingProjectId })
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(400)
    expect(listRes.body.success).toBe(false)
    expect(listRes.body.error.code).toBe('INVALID_PARAMETER')

    const getExportRes = await request(app)
      .get('/api/v1/reconciliation/export')
      .query({ type: 'case', projectId: missingProjectId })
      .set('Authorization', `Bearer ${token}`)

    expect(getExportRes.status).toBe(400)
    expect(getExportRes.body.success).toBe(false)
    expect(getExportRes.body.error.code).toBe('INVALID_PARAMETER')

    const postExportRes = await request(app)
      .post('/api/v1/reconciliation/export')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tab: 'case',
        filters: { projectId: missingProjectId },
      })

    expect(postExportRes.status).toBe(400)
    expect(postExportRes.body.success).toBe(false)
    expect(postExportRes.body.error.code).toBe('INVALID_PARAMETER')
  })

  it('POST 对账导出必须返回附件文件流并保留筛选内容', async () => {
    const suffix = Date.now()
    const keepProjectId = `proj-post-export-keep-${suffix}`
    const dropProjectId = `proj-post-export-drop-${suffix}`
    const keepCaseNo = `CASE-POST-EXPORT-KEEP-${suffix}`
    const oldCaseNo = `CASE-POST-EXPORT-OLD-${suffix}`
    const otherProjectCaseNo = `CASE-POST-EXPORT-OTHER-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status)
      VALUES (?, ?, ?, 'ihc', 1), (?, ?, ?, 'he', 1)
    `).run(
      keepProjectId, `P-POST-KEEP-${suffix}`, 'POST导出项目',
      dropProjectId, `P-POST-DROP-${suffix}`, 'POST导出其他项目',
    )

    db.prepare(`
      INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, status, import_batch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `case-post-export-keep-${suffix}`, keepCaseNo, keepProjectId, 'POST导出项目', 'lis', '2026-06-19 09:00:00', 'modified', `batch-post-${suffix}`,
      `case-post-export-old-${suffix}`, oldCaseNo, keepProjectId, 'POST导出项目', 'lis', '2026-05-19 09:00:00', 'modified', `batch-post-${suffix}`,
      `case-post-export-other-${suffix}`, otherProjectCaseNo, dropProjectId, 'POST导出其他项目', 'lis', '2026-06-19 10:00:00', 'modified', `batch-post-${suffix}`,
    )

    const exportRes = await request(app)
      .post('/api/v1/reconciliation/export')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(Buffer.from(chunk)))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
      .send({
        tab: 'case',
        format: 'csv',
        filters: {
          startDate: '2026-06-01',
          endDate: '2026-06-30',
          search: 'CASE-POST-EXPORT',
          projectId: keepProjectId,
          status: 'modified',
        },
      })

    expect(exportRes.status).toBe(200)
    expect(exportRes.headers['content-type']).toContain('text/csv')
    expect(exportRes.headers['content-disposition']).toContain('attachment')
    expect(exportRes.headers['content-disposition']).toContain('reconciliation-case-2026-06-01_2026-06-30.csv')
    const csv = Buffer.isBuffer(exportRes.body) ? exportRes.body.toString('utf8') : String(exportRes.text || '')
    expect(csv).toContain('病理号')
    expect(csv).toContain(keepCaseNo)
    expect(csv).not.toContain(oldCaseNo)
    expect(csv).not.toContain(otherProjectCaseNo)
  })

  it('GET 和 POST 对账导出必须拒绝非法导出类型', async () => {
    const getRes = await request(app)
      .get('/api/v1/reconciliation/export?type=unknown')
      .set('Authorization', `Bearer ${token}`)

    expect(getRes.status).toBe(400)
    expect(getRes.body.success).toBe(false)
    expect(getRes.body.error.code).toBe('INVALID_PARAMETER')

    const postRes = await request(app)
      .post('/api/v1/reconciliation/export')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'unknown' })

    expect(postRes.status).toBe(400)
    expect(postRes.body.success).toBe(false)
    expect(postRes.body.error.code).toBe('INVALID_PARAMETER')
  })

  it('POST 对账导出必须按格式返回真实文件并拒绝非法格式', async () => {
    const suffix = Date.now()
    const projectId = `proj-export-format-${suffix}`
    const caseNo = `CASE-EXPORT-FORMAT-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status)
      VALUES (?, ?, ?, 'ihc', 1)
    `).run(projectId, `P-EXPORT-FORMAT-${suffix}`, '导出格式项目')
    db.prepare(`
      INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, status, import_batch)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `case-export-format-${suffix}`, caseNo, projectId, '导出格式项目', 'lis', '2026-06-20 09:00:00', 'modified', `batch-format-${suffix}`,
    )

    const xlsxRes = await request(app)
      .post('/api/v1/reconciliation/export')
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse((res, callback) => {
        const chunks: Buffer[] = []
        res.on('data', chunk => chunks.push(Buffer.from(chunk)))
        res.on('end', () => callback(null, Buffer.concat(chunks)))
      })
      .send({
        tab: 'case',
        format: 'xlsx',
        filters: {
          startDate: '2026-06-01',
          endDate: '2026-06-30',
          search: 'CASE-EXPORT-FORMAT',
          projectId,
          status: 'modified',
        },
      })

    expect(xlsxRes.status).toBe(200)
    expect(xlsxRes.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(xlsxRes.headers['content-disposition']).toContain('reconciliation-case-2026-06-01_2026-06-30.xlsx')
    const body = Buffer.isBuffer(xlsxRes.body) ? xlsxRes.body : Buffer.from(xlsxRes.text || '')
    expect(body.subarray(0, 2).toString('utf8')).toBe('PK')

    const invalidFormatRes = await request(app)
      .post('/api/v1/reconciliation/export')
      .set('Authorization', `Bearer ${token}`)
      .send({ tab: 'case', format: 'pdf' })

    expect(invalidFormatRes.status).toBe(400)
    expect(invalidFormatRes.body.success).toBe(false)
    expect(invalidFormatRes.body.error.code).toBe('INVALID_PARAMETER')
  })

  it('对账汇总、物料汇总、导出和审计必须拒绝非法日期范围', async () => {
    const summaryRes = await request(app)
      .get('/api/v1/reconciliation/summary')
      .query({ startDate: '2026-06-30', endDate: '2026-06-01' })
      .set('Authorization', `Bearer ${token}`)

    expect(summaryRes.status).toBe(400)

    const materialRes = await request(app)
      .get('/api/v1/reconciliation/materials')
      .query({ startDate: '2026-06-30', endDate: '2026-06-01' })
      .set('Authorization', `Bearer ${token}`)

    expect(materialRes.status).toBe(400)

    const exportRes = await request(app)
      .get('/api/v1/reconciliation/export')
      .query({ type: 'case', startDate: '2026-02-30', endDate: '2026-03-01' })
      .set('Authorization', `Bearer ${token}`)

    expect(exportRes.status).toBe(400)

    const auditRes = await request(app)
      .post('/api/v1/reconciliation/projects/project-missing/materials/audit')
      .set('Authorization', `Bearer ${token}`)
      .send({ startDate: '2026-06-30', endDate: '2026-06-01' })

    expect(auditRes.status).toBe(400)
  })

  it('病例列表和修正日志列表必须拒绝非法分页参数', async () => {
    const casesRes = await request(app)
      .get('/api/v1/reconciliation/cases?page=abc&pageSize=20')
      .set('Authorization', `Bearer ${token}`)

    expect(casesRes.status).toBe(400)
    expect(casesRes.body.success).toBe(false)
    expect(casesRes.body.error.code).toBe('INVALID_PARAMETER')

    const logsRes = await request(app)
      .get('/api/v1/reconciliation/logs?page=1&pageSize=0')
      .set('Authorization', `Bearer ${token}`)

    expect(logsRes.status).toBe(400)
    expect(logsRes.body.success).toBe(false)
    expect(logsRes.body.error.code).toBe('INVALID_PARAMETER')
  })

  it('对账汇总的关联出库数不应统计已取消出库', async () => {
    const suffix = Date.now()
    const projectId = `proj-summary-status-${suffix}`

    db.prepare(`
      INSERT INTO projects (id, code, name, type, status)
      VALUES (?, ?, ?, 'ihc', 1)
    `).run(projectId, `P-SUMMARY-STATUS-${suffix}`, '汇总状态项目')
    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, operator, status, created_at)
      VALUES
        (?, ?, 'project', ?, 100, 'admin', 'completed', '2033-04-18 09:00:00'),
        (?, ?, 'project', ?, 120, 'admin', 'cancelled', '2033-04-18 10:00:00'),
        (?, ?, 'direct', NULL, 80, 'admin', 'completed', '2033-04-18 11:00:00'),
        (?, ?, 'direct', NULL, 60, 'admin', 'cancelled', '2033-04-18 12:00:00')
    `).run(
      `out-summary-linked-ok-${suffix}`, `OUT-SUMMARY-LINKED-OK-${suffix}`, projectId,
      `out-summary-linked-cancel-${suffix}`, `OUT-SUMMARY-LINKED-CANCEL-${suffix}`, projectId,
      `out-summary-unlinked-ok-${suffix}`, `OUT-SUMMARY-UNLINKED-OK-${suffix}`,
      `out-summary-unlinked-cancel-${suffix}`, `OUT-SUMMARY-UNLINKED-CANCEL-${suffix}`,
    )

    const res = await request(app)
      .get('/api/v1/reconciliation/summary?startDate=2033-04-01&endDate=2033-04-30')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.linkedOutbounds).toBe(1)
    expect(res.body.data.unlinkedOutbounds).toBe(1)
  })

  it('BOM 修正日志必须真实更新用量和单位，未命中 BOM 物料时拒绝写日志', async () => {
    const suffix = Date.now()
    const materialId = `mat-fix-${suffix}`
    const bomId = `bom-fix-${suffix}`
    const projectId = `proj-fix-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
      .run(`cat-fix-${suffix}`, `FC${suffix}`, '修正试剂', 1)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(materialId, `M-FIX-${suffix}`, '修正物料', '1ml', '支', `cat-fix-${suffix}`, 10)
    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status)
      VALUES (?, ?, ?, 'v1.0', 'ihc', 1)
    `).run(bomId, `BOM-FIX-${suffix}`, '修正BOM')
    db.prepare(`
      INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit)
      VALUES (?, ?, ?, ?, ?)
    `).run(`bi-fix-${suffix}`, bomId, materialId, 1, '支')
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, status)
      VALUES (?, ?, ?, 'ihc', ?, 1)
    `).run(projectId, `P-FIX-${suffix}`, '修正项目', bomId)

    const fixRes = await request(app)
      .post('/api/v1/reconciliation/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'bom_fix',
        targetId: materialId,
        targetName: '修正物料',
        field: 'usage_per_sample,unit',
        oldValue: '1 支',
        newValue: '2 ml',
        reason: '回归测试修正',
        projectId,
        materialId,
        newUsage: 2,
        newUnit: 'ml',
      })

    expect(fixRes.status).toBe(200)
    const item = db.prepare('SELECT usage_per_sample, unit FROM bom_items WHERE bom_id = ? AND material_id = ?')
      .get(bomId, materialId) as any
    expect(item.usage_per_sample).toBe(2)
    expect(item.unit).toBe('ml')

    const beforeLogCount = (db.prepare('SELECT COUNT(*) as count FROM reconciliation_logs').get() as any).count
    const missingRes = await request(app)
      .post('/api/v1/reconciliation/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'bom_fix',
        targetId: 'missing-material',
        targetName: '不存在物料',
        field: 'usage_per_sample,unit',
        oldValue: '1 支',
        newValue: '2 ml',
        reason: '应失败',
        projectId,
        materialId: 'missing-material',
        newUsage: 2,
        newUnit: 'ml',
      })

    expect(missingRes.status).toBe(404)
    const afterLogCount = (db.prepare('SELECT COUNT(*) as count FROM reconciliation_logs').get() as any).count
    expect(afterLogCount).toBe(beforeLogCount)
  })

  it('BOM 修正日志必须拒绝非法类型和缺少修正原因且不改BOM', async () => {
    const suffix = Date.now()
    const materialId = `mat-fix-guard-${suffix}`
    const bomId = `bom-fix-guard-${suffix}`
    const projectId = `proj-fix-guard-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
      .run(`cat-fix-guard-${suffix}`, `FG${suffix}`, '修正校验试剂', 1)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(materialId, `M-FIX-GUARD-${suffix}`, '修正校验物料', '1ml', '支', `cat-fix-guard-${suffix}`, 10)
    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status)
      VALUES (?, ?, ?, 'v1.0', 'ihc', 1)
    `).run(bomId, `BOM-FIX-GUARD-${suffix}`, '修正校验BOM')
    db.prepare(`
      INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit)
      VALUES (?, ?, ?, ?, ?)
    `).run(`bi-fix-guard-${suffix}`, bomId, materialId, 1, '支')
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, status)
      VALUES (?, ?, ?, 'ihc', ?, 1)
    `).run(projectId, `P-FIX-GUARD-${suffix}`, '修正校验项目', bomId)

    const beforeLogCount = (db.prepare('SELECT COUNT(*) as count FROM reconciliation_logs').get() as any).count
    const invalidTypeRes = await request(app)
      .post('/api/v1/reconciliation/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'manual_note',
        targetId: materialId,
        targetName: '修正校验物料',
        field: 'usage_per_sample,unit',
        oldValue: '1 支',
        newValue: '2 ml',
        reason: '非法日志类型不应写入',
      })

    expect(invalidTypeRes.status).toBe(400)
    expect(invalidTypeRes.body.success).toBe(false)
    expect(invalidTypeRes.body.error.code).toBe('INVALID_PARAMETER')

    const missingReasonRes = await request(app)
      .post('/api/v1/reconciliation/logs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        type: 'bom_fix',
        targetId: materialId,
        targetName: '修正校验物料',
        field: 'usage_per_sample,unit',
        oldValue: '1 支',
        newValue: '2 ml',
        reason: '   ',
        projectId,
        materialId,
        newUsage: 2,
        newUnit: 'ml',
      })

    expect(missingReasonRes.status).toBe(400)
    expect(missingReasonRes.body.success).toBe(false)
    expect(missingReasonRes.body.error.code).toBe('INVALID_PARAMETER')
    const item = db.prepare('SELECT usage_per_sample, unit FROM bom_items WHERE bom_id = ? AND material_id = ?')
      .get(bomId, materialId) as any
    expect(item.usage_per_sample).toBe(1)
    expect(item.unit).toBe('支')
    const afterLogCount = (db.prepare('SELECT COUNT(*) as count FROM reconciliation_logs').get() as any).count
    expect(afterLogCount).toBe(beforeLogCount)
  })

  it('修正日志列表必须按创建时间范围过滤', async () => {
    const suffix = Date.now()
    const insideLogId = `log-range-inside-${suffix}`
    const outsideLogId = `log-range-outside-${suffix}`

    db.prepare(`
      INSERT INTO reconciliation_logs (id, type, target_id, target_name, field, old_value, new_value, reason, operator, created_at)
      VALUES
        (?, 'bom_fix', ?, '六月修正物料', 'usage_per_sample', '1', '2', '范围内原因', 'admin', '2042-06-15 10:00:00'),
        (?, 'bom_fix', ?, '五月修正物料', 'usage_per_sample', '1', '3', '范围外原因', 'admin', '2042-05-15 10:00:00')
    `).run(insideLogId, `target-inside-${suffix}`, outsideLogId, `target-outside-${suffix}`)

    const res = await request(app)
      .get('/api/v1/reconciliation/logs?startDate=2042-06-01&endDate=2042-06-30&pageSize=50')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.pagination.total).toBe(1)
    const ids = res.body.data.list.map((log: any) => log.id)
    expect(ids).toContain(insideLogId)
    expect(ids).not.toContain(outsideLogId)
  })

  it('物料汇总对账必须把实际少于理论的短缺差异标记为异常', async () => {
    const suffix = Date.now()
    const materialId = `mat-recon-short-${suffix}`
    const bomId = `bom-recon-short-${suffix}`
    const projectId = `proj-recon-short-${suffix}`
    const outboundId = `out-recon-short-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
      .run(`cat-recon-short-${suffix}`, `RCS${suffix}`, '对账短缺试剂', 1)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(materialId, `M-RECON-SHORT-${suffix}`, '对账短缺物料', '1ml', '支', `cat-recon-short-${suffix}`, 10)
    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status)
      VALUES (?, ?, ?, 'v1.0', 'ihc', 1)
    `).run(bomId, `BOM-RECON-SHORT-${suffix}`, '对账短缺BOM')
    db.prepare(`
      INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit)
      VALUES (?, ?, ?, ?, ?)
    `).run(`bi-recon-short-${suffix}`, bomId, materialId, 1, '支')
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, status)
      VALUES (?, ?, ?, 'ihc', ?, 1)
    `).run(projectId, `P-RECON-SHORT-${suffix}`, '对账短缺项目', bomId)

    for (let i = 0; i < 10; i += 1) {
      db.prepare(`
        INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, import_batch)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        `case-recon-short-${suffix}-${i}`,
        `CASE-RECON-SHORT-${suffix}-${i}`,
        projectId,
        '对账短缺项目',
        'lis',
        '2026-06-15 09:00:00',
        `batch-short-${suffix}`,
      )
    }
    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, operator, status, created_at)
      VALUES (?, ?, 'bom', ?, ?, 'admin', 'completed', ?)
    `).run(outboundId, `OUT-RECON-SHORT-${suffix}`, projectId, 50, '2026-06-15 10:00:00')
    db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, quantity, unit, unit_cost, total_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`oi-recon-short-${suffix}`, outboundId, materialId, 5, '支', 10, 50)

    const res = await request(app)
      .get('/api/v1/reconciliation/materials?startDate=2026-06-01&endDate=2026-06-30')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const row = res.body.data.list.find((item: any) => item.materialId === materialId)
    expect(row).toMatchObject({
      theoryTotal: 10,
      actualTotal: 5,
      diff: -5,
      status: 'warn',
    })
  })

  it('项目物料对账不应因物料后续软删除而丢失历史BOM明细', async () => {
    const suffix = Date.now()
    const materialId = `mat-recon-deleted-${suffix}`
    const bomId = `bom-recon-deleted-${suffix}`
    const projectId = `proj-recon-deleted-${suffix}`
    const outboundId = `out-recon-deleted-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
      .run(`cat-recon-deleted-${suffix}`, `RCD${suffix}`, '对账软删除试剂', 1)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)
    `).run(materialId, `M-RECON-DELETED-${suffix}`, '对账软删除物料', '1ml', '支', `cat-recon-deleted-${suffix}`, 10)
    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status)
      VALUES (?, ?, ?, 'v1.0', 'ihc', 1)
    `).run(bomId, `BOM-RECON-DELETED-${suffix}`, '对账软删除BOM')
    db.prepare(`
      INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit)
      VALUES (?, ?, ?, ?, ?)
    `).run(`bi-recon-deleted-${suffix}`, bomId, materialId, 1, '支')
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, status)
      VALUES (?, ?, ?, 'ihc', ?, 1)
    `).run(projectId, `P-RECON-DELETED-${suffix}`, '对账软删除项目', bomId)
    db.prepare(`
      INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, import_batch)
      VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `case-recon-deleted-${suffix}-1`, `CASE-RECON-DELETED-${suffix}-1`, projectId, '对账软删除项目', 'lis', '2026-06-20 09:00:00', `batch-deleted-${suffix}`,
      `case-recon-deleted-${suffix}-2`, `CASE-RECON-DELETED-${suffix}-2`, projectId, '对账软删除项目', 'lis', '2026-06-20 09:30:00', `batch-deleted-${suffix}`,
    )
    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, operator, status, created_at)
      VALUES (?, ?, 'bom', ?, ?, 'admin', 'completed', ?)
    `).run(outboundId, `OUT-RECON-DELETED-${suffix}`, projectId, 40, '2026-06-20 10:00:00')
    db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, quantity, unit, unit_cost, total_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`oi-recon-deleted-${suffix}`, outboundId, materialId, 4, '支', 10, 40)
    db.prepare('UPDATE materials SET is_deleted = 1 WHERE id = ?').run(materialId)

    const res = await request(app)
      .get(`/api/v1/reconciliation/projects/${projectId}/materials?startDate=2026-06-01&endDate=2026-06-30`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const row = res.body.data.list.find((item: any) => item.materialId === materialId)
    expect(row).toMatchObject({
      materialName: '对账软删除物料',
      theoryQty: 2,
      actualQty: 4,
      diff: 2,
      status: 'danger',
    })
  })

  it('物料汇总对账不应因物料后续软删除而丢失历史差异', async () => {
    const suffix = Date.now()
    const materialId = `mat-recon-summary-deleted-${suffix}`
    const bomId = `bom-recon-summary-deleted-${suffix}`
    const projectId = `proj-recon-summary-deleted-${suffix}`
    const outboundId = `out-recon-summary-deleted-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
      .run(`cat-recon-summary-deleted-${suffix}`, `RCSD${suffix}`, '汇总软删除试剂', 1)
    db.prepare(`
      INSERT INTO materials (id, code, name, spec, unit, category_id, price, status, is_deleted)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0)
    `).run(materialId, `M-RECON-SUMMARY-DELETED-${suffix}`, '汇总软删除物料', '1ml', '支', `cat-recon-summary-deleted-${suffix}`, 10)
    db.prepare(`
      INSERT INTO boms (id, code, name, version, type, status)
      VALUES (?, ?, ?, 'v1.0', 'ihc', 1)
    `).run(bomId, `BOM-RECON-SUMMARY-DELETED-${suffix}`, '汇总软删除BOM')
    db.prepare(`
      INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit)
      VALUES (?, ?, ?, ?, ?)
    `).run(`bi-recon-summary-deleted-${suffix}`, bomId, materialId, 1, '支')
    db.prepare(`
      INSERT INTO projects (id, code, name, type, bom_id, status)
      VALUES (?, ?, ?, 'ihc', ?, 1)
    `).run(projectId, `P-RECON-SUMMARY-DELETED-${suffix}`, '汇总软删除项目', bomId)
    db.prepare(`
      INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, import_batch)
      VALUES (?, ?, ?, ?, ?, ?, ?), (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `case-recon-summary-deleted-${suffix}-1`, `CASE-RECON-SUMMARY-DELETED-${suffix}-1`, projectId, '汇总软删除项目', 'lis', '2026-06-21 09:00:00', `batch-summary-deleted-${suffix}`,
      `case-recon-summary-deleted-${suffix}-2`, `CASE-RECON-SUMMARY-DELETED-${suffix}-2`, projectId, '汇总软删除项目', 'lis', '2026-06-21 09:30:00', `batch-summary-deleted-${suffix}`,
    )
    db.prepare(`
      INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, operator, status, created_at)
      VALUES (?, ?, 'bom', ?, ?, 'admin', 'completed', ?)
    `).run(outboundId, `OUT-RECON-SUMMARY-DELETED-${suffix}`, projectId, 40, '2026-06-21 10:00:00')
    db.prepare(`
      INSERT INTO outbound_items (id, outbound_id, material_id, quantity, unit, unit_cost, total_cost)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(`oi-recon-summary-deleted-${suffix}`, outboundId, materialId, 4, '支', 10, 40)
    db.prepare('UPDATE materials SET is_deleted = 1 WHERE id = ?').run(materialId)

    const res = await request(app)
      .get('/api/v1/reconciliation/materials?startDate=2026-06-01&endDate=2026-06-30')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const row = res.body.data.list.find((item: any) => item.materialId === materialId)
    expect(row).toMatchObject({
      materialName: '汇总软删除物料',
      theoryTotal: 2,
      actualTotal: 4,
      diff: 2,
      status: 'danger',
    })

    const exportRes = await request(app)
      .get('/api/v1/reconciliation/export?type=material&startDate=2026-06-01&endDate=2026-06-30')
      .set('Authorization', `Bearer ${token}`)

    expect(exportRes.status).toBe(200)
    expect(exportRes.body.data.content).toContain('汇总软删除物料')
    expect(exportRes.body.data.content).toContain('2,4,2,100.0%,danger')
  })
})
