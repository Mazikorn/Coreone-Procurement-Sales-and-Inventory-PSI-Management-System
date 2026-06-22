process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'
import { createHash, createHmac } from 'crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const getApp = async () => {
  const { default: app } = await import('../src/app.js')
  const { getDatabase } = await import('../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function login(app: any, username: string, password: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password })
  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedLog(db: any, row: {
  id: string
  username: string
  userId?: string
  operation: string
  description: string
  requestData?: any
}) {
  db.prepare(`
    INSERT INTO operation_logs (id, user_id, username, operation, description, request_data, response_data, ip, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.userId || row.username,
    row.username,
    row.operation,
    row.description,
    row.requestData ? JSON.stringify(row.requestData) : null,
    JSON.stringify({ ok: true }),
    '127.0.0.1',
    'vitest',
  )
}

function seedStockLog(db: any, row: {
  id: string
  type: string
  materialId: string
  quantity: number
  beforeStock: number
  afterStock: number
  relatedId?: string
  relatedType?: string
  operator: string
  remark?: string
}) {
  db.prepare(`
    INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.type,
    row.materialId,
    row.quantity,
    row.beforeStock,
    row.afterStock,
    row.relatedId || null,
    row.relatedType || null,
    row.operator,
    row.remark || null,
  )
}

function seedAbcAuditLog(db: any, row: {
  id: string
  module: string
  action: string
  targetId: string
  detail: any
  operator: string
}) {
  db.prepare(`
    INSERT INTO abc_audit_logs (id, module, action, target_id, detail, operator)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.module,
    row.action,
    row.targetId,
    JSON.stringify(row.detail),
    row.operator,
  )
}

function seedReconciliationLog(db: any, row: {
  id: string
  type: string
  targetId: string
  targetName: string
  field: string
  oldValue: string
  newValue: string
  reason: string
  operator: string
}) {
  db.prepare(`
    INSERT INTO reconciliation_logs (id, type, target_id, target_name, field, old_value, new_value, reason, operator)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.type,
    row.targetId,
    row.targetName,
    row.field,
    row.oldValue,
    row.newValue,
    row.reason,
    row.operator,
  )
}

function seedBatchLocationAdjustment(db: any, row: {
  id: string
  relatedType: string
  relatedId: string
  batchId: string
  materialId: string
  locationId: string
  quantityDelta: number
}) {
  db.prepare(`
    INSERT INTO batch_location_adjustments (id, related_type, related_id, batch_id, material_id, location_id, quantity_delta)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    row.id,
    row.relatedType,
    row.relatedId,
    row.batchId,
    row.materialId,
    row.locationId,
    row.quantityDelta,
  )
}

function dateOnlyDaysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

describe('操作日志 API', () => {
  let app: any
  let db: any
  let adminToken: string
  let financeToken: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    adminToken = await login(app, 'admin', 'admin123')
    financeToken = await login(app, 'sunli', 'CoreOne2026!')
  })

  it('LOG-001: admin 和 finance 可查看日志，列表返回解析后的模块和请求数据', async () => {
    const suffix = Date.now()
    const id = `log-view-${suffix}`
    seedLog(db, {
      id,
      username: 'admin',
      operation: 'supplier_return_status_update',
      description: '供应商退货状态变更',
      requestData: { module: 'supplier_returns', id: 'SR-001' },
    })

    const adminRes = await request(app)
      .get('/api/v1/logs')
      .query({ keyword: '供应商退货状态变更' })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(adminRes.status).toBe(200)
    expect(adminRes.body.data.list[0]).toMatchObject({
      id,
      username: 'admin',
      module: 'supplier_returns',
      operationType: 'update',
    })
    expect(adminRes.body.data.list[0].requestData).toMatchObject({ id: 'SR-001' })

    const financeRes = await request(app)
      .get('/api/v1/logs')
      .query({ keyword: '供应商退货状态变更' })
      .set('Authorization', `Bearer ${financeToken}`)
    expect(financeRes.status).toBe(200)
    expect(financeRes.body.data.list.some((row: any) => row.id === id)).toBe(true)
  })

  it('LOG-002: 支持用户名、类型、模块和关键字组合过滤', async () => {
    const suffix = Date.now()
    const keepId = `log-filter-keep-${suffix}`
    const dropId = `log-filter-drop-${suffix}`
    seedLog(db, {
      id: keepId,
      username: 'admin',
      operation: 'supplier_return_status_update',
      description: '筛选测试-供应商退货',
      requestData: { module: 'supplier_returns' },
    })
    seedLog(db, {
      id: dropId,
      username: 'sunli',
      operation: 'login',
      description: '筛选测试-登录',
      requestData: { module: 'system' },
    })

    const res = await request(app)
      .get('/api/v1/logs')
      .query({
        username: 'admin',
        type: 'update',
        module: 'supplier_returns',
        keyword: '筛选测试',
      })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const ids = res.body.data.list.map((row: any) => row.id)
    expect(ids).toContain(keepId)
    expect(ids).not.toContain(dropId)
  })

  it('LOG-003: 供应商管理筛选不混入供应商退货日志', async () => {
    const suffix = Date.now()
    const supplierId = `log-supplier-${suffix}`
    const returnId = `log-supplier-return-${suffix}`
    seedLog(db, {
      id: supplierId,
      username: 'admin',
      operation: 'supplier_update',
      description: '供应商资料更新',
      requestData: { module: 'suppliers' },
    })
    seedLog(db, {
      id: returnId,
      username: 'admin',
      operation: 'supplier_return_status_update',
      description: '供应商退货状态变更',
      requestData: { module: 'supplier_returns' },
    })

    const res = await request(app)
      .get('/api/v1/logs')
      .query({ module: 'suppliers', keyword: '供应商' })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const ids = res.body.data.list.map((row: any) => row.id)
    expect(ids).toContain(supplierId)
    expect(ids).not.toContain(returnId)
  })

  it('LOG-004: 统计和导出接口返回真实日志数据', async () => {
    const suffix = Date.now()
    const exportId = `log-export-${suffix}`
    seedLog(db, {
      id: exportId,
      username: 'admin',
      operation: 'export_report',
      description: '导出测试-成本报表',
      requestData: { module: 'cost' },
    })

    const stats = await request(app)
      .get('/api/v1/logs/stats')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(stats.status).toBe(200)
    expect(stats.body.data.loginCount).toBeGreaterThanOrEqual(1)
    expect(stats.body.data.activeUsers).toBeGreaterThanOrEqual(1)

    const exported = await request(app)
      .get('/api/v1/logs/export')
      .query({ keyword: '导出测试-成本报表', module: 'cost' })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(exported.status).toBe(200)
    expect(exported.headers['content-type']).toContain('text/csv')
    expect(exported.text).toContain('导出测试-成本报表')
    expect(exported.text).toContain('cost')
  })

  it('LOG-007: POST 导出接口按当前筛选条件返回真实 CSV 文件流', async () => {
    const suffix = Date.now()
    const keepId = `log-post-export-keep-${suffix}`
    const dropId = `log-post-export-drop-${suffix}`
    seedLog(db, {
      id: keepId,
      username: 'admin',
      operation: 'POST /inbound',
      description: 'POST导出测试-入库',
      requestData: { module: 'inbound' },
    })
    seedLog(db, {
      id: dropId,
      username: 'sunli',
      operation: 'POST /outbound',
      description: 'POST导出测试-出库',
      requestData: { module: 'outbound' },
    })

    const exported = await request(app)
      .post('/api/v1/logs/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        keyword: 'POST导出测试',
        module: 'inbound',
        username: 'admin',
      })

    expect(exported.status).toBe(200)
    expect(exported.headers['content-type']).toContain('text/csv')
    expect(exported.headers['content-disposition']).toMatch(/filename="logs_\d{8}_\d{6}\.csv"/)
    expect(exported.text).toContain('POST导出测试-入库')
    expect(exported.text).not.toContain('POST导出测试-出库')
  })

  it('LOG-005: 库存细分模块日志可按盘点和报废准确识别与筛选', async () => {
    const suffix = Date.now()
    const stocktakingId = `log-stocktaking-${suffix}`
    const scrapId = `log-scrap-${suffix}`
    seedLog(db, {
      id: stocktakingId,
      username: 'admin',
      operation: 'POST /stocktaking',
      description: '创建库存盘点记录',
      requestData: {},
    })
    seedLog(db, {
      id: scrapId,
      username: 'admin',
      operation: 'POST /scraps',
      description: '创建报废记录',
      requestData: {},
    })

    const stocktakingRes = await request(app)
      .get('/api/v1/logs')
      .query({ module: 'stocktaking', keyword: '记录' })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(stocktakingRes.status).toBe(200)
    const stocktakingRows = stocktakingRes.body.data.list
    expect(stocktakingRows.some((row: any) => row.id === stocktakingId && row.module === 'stocktaking' && row.operationType === 'create')).toBe(true)
    expect(stocktakingRows.some((row: any) => row.id === scrapId)).toBe(false)

    const scrapRes = await request(app)
      .get('/api/v1/logs')
      .query({ module: 'scraps', keyword: '记录' })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(scrapRes.status).toBe(200)
    const scrapRows = scrapRes.body.data.list
    expect(scrapRows.some((row: any) => row.id === scrapId && row.module === 'scraps')).toBe(true)
    expect(scrapRows.some((row: any) => row.id === stocktakingId)).toBe(false)
  })

  it('LOG-006: HTTP 方法日志可按操作类型识别和筛选', async () => {
    const suffix = Date.now()
    const createId = `log-http-create-${suffix}`
    const updateId = `log-http-update-${suffix}`
    const deleteId = `log-http-delete-${suffix}`
    seedLog(db, {
      id: createId,
      username: 'admin',
      operation: 'POST /equipment',
      description: '创建设备记录',
      requestData: {},
    })
    seedLog(db, {
      id: updateId,
      username: 'admin',
      operation: 'PATCH /equipment/EQ-001',
      description: '更新设备记录',
      requestData: {},
    })
    seedLog(db, {
      id: deleteId,
      username: 'admin',
      operation: 'DELETE /equipment/EQ-001',
      description: '删除设备记录',
      requestData: {},
    })

    const createRes = await request(app)
      .get('/api/v1/logs')
      .query({ type: 'create', module: 'equipment', keyword: '设备记录' })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(createRes.status).toBe(200)
    expect(createRes.body.data.list.some((row: any) => row.id === createId && row.operationType === 'create')).toBe(true)
    expect(createRes.body.data.list.some((row: any) => row.id === updateId || row.id === deleteId)).toBe(false)

    const updateRes = await request(app)
      .get('/api/v1/logs')
      .query({ type: 'update', module: 'equipment', keyword: '设备记录' })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(updateRes.status).toBe(200)
    expect(updateRes.body.data.list.some((row: any) => row.id === updateId && row.operationType === 'update')).toBe(true)
    expect(updateRes.body.data.list.some((row: any) => row.id === createId || row.id === deleteId)).toBe(false)

    const deleteRes = await request(app)
      .get('/api/v1/logs')
      .query({ type: 'delete', module: 'equipment', keyword: '设备记录' })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(deleteRes.status).toBe(200)
    expect(deleteRes.body.data.list.some((row: any) => row.id === deleteId && row.operationType === 'delete')).toBe(true)
    expect(deleteRes.body.data.list.some((row: any) => row.id === createId || row.id === updateId)).toBe(false)
  })

  it('LOG-008: 管理员可按日期清理历史日志且保留较新的日志', async () => {
    const suffix = Date.now()
    const oldId = `log-clean-old-${suffix}`
    const boundaryDayId = `log-clean-boundary-day-${suffix}`
    const newId = `log-clean-new-${suffix}`
    const protectedStockId = `log-clean-stock-protected-${suffix}`
    const protectedBatchLocationId = `log-clean-batch-location-protected-${suffix}`
    const protectedAbcId = `log-clean-abc-protected-${suffix}`
    const protectedReconciliationId = `log-clean-recon-protected-${suffix}`
    const oldDate = dateOnlyDaysAgo(220)
    const beforeDate = dateOnlyDaysAgo(200)
    const newDate = dateOnlyDaysAgo(10)
    seedLog(db, {
      id: oldId,
      username: 'admin',
      operation: 'old_cleanup_target',
      description: '清理测试-旧日志',
      requestData: { module: 'system' },
    })
    seedLog(db, {
      id: boundaryDayId,
      username: 'admin',
      operation: 'boundary_day_cleanup_keep',
      description: '清理测试-边界日当天日志',
      requestData: { module: 'system' },
    })
    seedLog(db, {
      id: newId,
      username: 'admin',
      operation: 'new_cleanup_keep',
      description: '清理测试-新日志',
      requestData: { module: 'system' },
    })
    db.prepare('UPDATE operation_logs SET created_at = ? WHERE id = ?').run(`${oldDate} 00:00:00`, oldId)
    db.prepare('UPDATE operation_logs SET created_at = ? WHERE id = ?').run(`${beforeDate} 12:00:00`, boundaryDayId)
    db.prepare('UPDATE operation_logs SET created_at = ? WHERE id = ?').run(`${newDate}T00:00:00`, newId)
    seedStockLog(db, {
      id: protectedStockId,
      type: 'outbound',
      materialId: 'mat-clean-protected',
      quantity: -1,
      beforeStock: 2,
      afterStock: 1,
      relatedId: 'OUT-CLEAN-PROTECTED',
      relatedType: 'outbound',
      operator: 'warehouse',
      remark: '清理测试-库存事实不可清理',
    })
    seedBatchLocationAdjustment(db, {
      id: protectedBatchLocationId,
      relatedType: 'outbound',
      relatedId: 'OUT-CLEAN-PROTECTED',
      batchId: 'batch-clean-protected',
      materialId: 'mat-clean-protected',
      locationId: 'loc-clean-protected',
      quantityDelta: -1,
    })
    seedAbcAuditLog(db, {
      id: protectedAbcId,
      module: 'cost_run',
      action: 'recalculate',
      targetId: 'RUN-CLEAN-PROTECTED',
      detail: { yearMonth: '2026-01', reason: '清理测试-成本事实不可清理' },
      operator: 'finance',
    })
    seedReconciliationLog(db, {
      id: protectedReconciliationId,
      type: 'adjust_bom',
      targetId: 'CASE-CLEAN-PROTECTED',
      targetName: '清理测试对账病例',
      field: 'bom',
      oldValue: 'old',
      newValue: 'new',
      reason: '清理测试-对账事实不可清理',
      operator: 'technician',
    })
    db.prepare('UPDATE stock_logs SET created_at = ? WHERE id = ?').run(`${oldDate} 00:00:00`, protectedStockId)
    db.prepare('UPDATE batch_location_adjustments SET created_at = ? WHERE id = ?').run(`${oldDate} 00:00:00`, protectedBatchLocationId)
    db.prepare('UPDATE abc_audit_logs SET created_at = ? WHERE id = ?').run(`${oldDate} 00:00:00`, protectedAbcId)
    db.prepare('UPDATE reconciliation_logs SET created_at = ? WHERE id = ?').run(`${oldDate} 00:00:00`, protectedReconciliationId)

    const cleaned = await request(app)
      .delete('/api/v1/logs')
      .query({ beforeDate })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(cleaned.status).toBe(200)
    expect(cleaned.body.data.deletedCount).toBe(1)
    expect(cleaned.body.data.archiveId).toBeTruthy()
    expect(cleaned.body.data.archiveHash).toMatch(/^[a-f0-9]{64}$/)
    expect(cleaned.body.data.archiveChainHash).toMatch(/^[a-f0-9]{64}$/)
    expect(cleaned.body.data.protectedFactCounts).toMatchObject({
      stock: 1,
      batchLocation: 1,
      abc: 1,
      reconciliation: 1,
    })

    const oldRow = db.prepare('SELECT 1 FROM operation_logs WHERE id = ?').get(oldId)
    const boundaryDayRow = db.prepare('SELECT 1 FROM operation_logs WHERE id = ?').get(boundaryDayId)
    const newRow = db.prepare('SELECT 1 FROM operation_logs WHERE id = ?').get(newId)
    expect(oldRow).toBeUndefined()
    expect(boundaryDayRow).toBeTruthy()
    expect(newRow).toBeTruthy()
    expect(db.prepare('SELECT 1 FROM stock_logs WHERE id = ?').get(protectedStockId)).toBeTruthy()
    expect(db.prepare('SELECT 1 FROM batch_location_adjustments WHERE id = ?').get(protectedBatchLocationId)).toBeTruthy()
    expect(db.prepare('SELECT 1 FROM abc_audit_logs WHERE id = ?').get(protectedAbcId)).toBeTruthy()
    expect(db.prepare('SELECT 1 FROM reconciliation_logs WHERE id = ?').get(protectedReconciliationId)).toBeTruthy()

    const archive = db.prepare('SELECT * FROM audit_log_archives WHERE id = ?').get(cleaned.body.data.archiveId) as any
    expect(archive).toMatchObject({
      source_type: 'operation',
      before_date: beforeDate,
      row_count: 1,
      content_sha256: cleaned.body.data.archiveHash,
      previous_chain_hash: null,
      chain_hash: cleaned.body.data.archiveChainHash,
      created_by: 'admin',
    })
    expect(archive.content_json).toContain(oldId)
    expect(archive.content_json).not.toContain(boundaryDayId)
    expect(archive.protected_counts).toContain('"stock":1')

    const secondOldId = `log-clean-old-second-${suffix}`
    seedLog(db, {
      id: secondOldId,
      username: 'admin',
      operation: 'second_cleanup_target',
      description: '清理测试-第二次归档',
      requestData: { module: 'system' },
    })
    db.prepare('UPDATE operation_logs SET created_at = ? WHERE id = ?').run(`${oldDate} 00:00:00`, secondOldId)

    const secondCleaned = await request(app)
      .delete('/api/v1/logs')
      .query({ beforeDate })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(secondCleaned.status).toBe(200)
    expect(secondCleaned.body.data.deletedCount).toBe(1)
    expect(secondCleaned.body.data.archiveChainHash).toMatch(/^[a-f0-9]{64}$/)
    expect(secondCleaned.body.data.archiveChainHash).not.toBe(cleaned.body.data.archiveChainHash)
    const secondArchive = db.prepare('SELECT * FROM audit_log_archives WHERE id = ?').get(secondCleaned.body.data.archiveId) as any
    expect(secondArchive).toMatchObject({
      previous_chain_hash: cleaned.body.data.archiveChainHash,
      chain_hash: secondCleaned.body.data.archiveChainHash,
      row_count: 1,
    })
    expect(secondArchive.content_json).toContain(secondOldId)

    const archives = await request(app)
      .get('/api/v1/logs/archives')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(archives.status).toBe(200)
    expect(archives.body.data.list[0]).toMatchObject({
      id: secondCleaned.body.data.archiveId,
      archiveNo: secondArchive.archive_no,
      sourceType: 'operation',
      beforeDate,
      retentionDays: 180,
      rowCount: 1,
      contentHash: secondArchive.content_sha256,
      previousChainHash: cleaned.body.data.archiveChainHash,
      chainHash: secondCleaned.body.data.archiveChainHash,
      createdBy: 'admin',
      protectedFactCounts: {
        stock: 1,
        batchLocation: 1,
        abc: 1,
        reconciliation: 1,
      },
    })
    expect(archives.body.data.list[0].contentPreview).toMatchObject({
      sourceType: 'operation',
      rowCount: 1,
    })
    expect(archives.body.data.reportSignature).toMatchObject({
      status: 'unsigned',
      algorithm: 'HMAC-SHA256',
      keyId: 'not-configured',
      signedPayload: 'reportHash',
      missingReason: 'COREONE_ARCHIVE_REPORT_SIGNING_SECRET_NOT_CONFIGURED',
      keyGovernance: {
        status: 'not_configured',
        missingReason: 'COREONE_ARCHIVE_REPORT_SIGNING_KEY_GOVERNANCE_NOT_CONFIGURED',
      },
    })

    const verifyOk = await request(app)
      .post('/api/v1/logs/archives/verify')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(verifyOk.status).toBe(200)
    expect(verifyOk.body.data).toMatchObject({
      valid: true,
      checkedCount: 2,
      latestArchiveNo: secondArchive.archive_no,
      latestChainHash: secondCleaned.body.data.archiveChainHash,
    })

    const verificationReport = await request(app)
      .get('/api/v1/logs/archives/verification-report')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(verificationReport.status).toBe(200)
    expect(verificationReport.headers['content-type']).toContain('application/json')
    expect(verificationReport.headers['content-disposition']).toContain('archive_chain_verification')
    const report = JSON.parse(verificationReport.text)
    expect(report).toMatchObject({
      reportType: 'operation_log_archive_chain_verification',
      generatedBy: 'admin',
      verification: {
        valid: true,
        checkedCount: 2,
        latestArchiveNo: secondArchive.archive_no,
        latestChainHash: secondCleaned.body.data.archiveChainHash,
      },
    })
    expect(report.reportHash).toMatch(/^[a-f0-9]{64}$/)
    expect(report.verificationInstructions).toMatchObject({
      chainVerification: 'Recompute each archive contentHash, previousChainHash, and chainHash in ascending archive order before trusting this report.',
      reportHashPayload: 'JSON.stringify({ reportType, generatedAt, generatedBy, retentionPolicy, verification, archives })',
      signaturePayload: 'reportHash',
      signatureAlgorithm: 'HMAC-SHA256',
      signatureCheck: 'When signature.status is signed, compute HMAC-SHA256(reportHash, shared signing secret) and compare it with signature.value.',
      unsignedBehavior: 'When signature.status is unsigned, treat the report as hash-verifiable only, not externally signed.',
    })
    expect(report.retentionPolicy).toMatchObject({
      sourceTable: 'operation_logs',
      sourceType: 'operation',
      minRetentionDays: 180,
      cleanupBoundary: 'Only operation_logs rows older than beforeDate are deleted after the archive credential is recorded.',
      protectedFactTables: [
        { sourceType: 'stock', table: 'stock_logs' },
        { sourceType: 'batchLocation', table: 'batch_location_adjustments' },
        { sourceType: 'abc', table: 'abc_audit_logs' },
        { sourceType: 'reconciliation', table: 'reconciliation_logs' },
      ],
    })
    expect(report.signature).toMatchObject({
      status: 'unsigned',
      algorithm: 'HMAC-SHA256',
      keyId: 'not-configured',
      signedPayload: 'reportHash',
      value: null,
      missingReason: 'COREONE_ARCHIVE_REPORT_SIGNING_SECRET_NOT_CONFIGURED',
      keyGovernance: {
        status: 'not_configured',
        missingReason: 'COREONE_ARCHIVE_REPORT_SIGNING_KEY_GOVERNANCE_NOT_CONFIGURED',
      },
    })
    expect(report.archives).toHaveLength(2)
    expect(report.archives[0]).toMatchObject({
      archiveNo: archive.archive_no,
      contentHash: archive.content_sha256,
      chainHash: cleaned.body.data.archiveChainHash,
    })
    expect(report.archives[1]).toMatchObject({
      archiveNo: secondArchive.archive_no,
      previousChainHash: cleaned.body.data.archiveChainHash,
      chainHash: secondCleaned.body.data.archiveChainHash,
    })

    const originalSigningSecret = process.env.COREONE_ARCHIVE_REPORT_SIGNING_SECRET
    const originalSigningKeyId = process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_ID
    const originalSigningKeyCreatedAt = process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_CREATED_AT
    const originalSigningKeyRotationDays = process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_ROTATION_DAYS
    try {
      process.env.COREONE_ARCHIVE_REPORT_SIGNING_SECRET = 'unit-report-signing-secret'
      process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_ID = 'unit-key-2026-06'
      process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_CREATED_AT = '2099-01-01'
      process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_ROTATION_DAYS = '90'

      const signedArchives = await request(app)
        .get('/api/v1/logs/archives')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(signedArchives.status).toBe(200)
      expect(signedArchives.body.data.reportSignature).toMatchObject({
        status: 'signed',
        algorithm: 'HMAC-SHA256',
        keyId: 'unit-key-2026-06',
        signedPayload: 'reportHash',
      })
      expect(signedArchives.body.data.reportSignature.keyGovernance).toMatchObject({
        status: 'active',
        keyCreatedAt: '2099-01-01',
        rotationDays: 90,
        rotationDueAt: '2099-04-01',
      })
      expect(signedArchives.body.data.reportSignature.value).toBeUndefined()

      const signedVerificationReport = await request(app)
        .get('/api/v1/logs/archives/verification-report')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(signedVerificationReport.status).toBe(200)
      const signedReport = JSON.parse(signedVerificationReport.text)
      expect(signedReport.reportHash).toMatch(/^[a-f0-9]{64}$/)
      expect(signedReport.verificationInstructions).toMatchObject({
        signaturePayload: 'reportHash',
        signatureAlgorithm: 'HMAC-SHA256',
        signatureCheck: 'When signature.status is signed, compute HMAC-SHA256(reportHash, shared signing secret) and compare it with signature.value.',
      })
      expect(signedReport.verificationInstructions.reportHashPayload).toBe('JSON.stringify({ reportType, generatedAt, generatedBy, retentionPolicy, verification, archives })')
      expect(signedReport.retentionPolicy.protectedFactTables.map((item: any) => item.table)).toEqual([
        'stock_logs',
        'batch_location_adjustments',
        'abc_audit_logs',
        'reconciliation_logs',
      ])
      expect(signedReport.signature).toMatchObject({
        status: 'signed',
        algorithm: 'HMAC-SHA256',
        keyId: 'unit-key-2026-06',
        signedPayload: 'reportHash',
      })
      expect(signedReport.signature.keyGovernance).toMatchObject({
        status: 'active',
        keyCreatedAt: '2099-01-01',
        rotationDays: 90,
        rotationDueAt: '2099-04-01',
      })
      expect(signedReport.signature.value).toBe(
        createHmac('sha256', 'unit-report-signing-secret')
          .update(signedReport.reportHash)
          .digest('hex'),
      )

      process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_CREATED_AT = '2020-01-01'
      process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_ROTATION_DAYS = '1'
      const rotationDueArchives = await request(app)
        .get('/api/v1/logs/archives')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(rotationDueArchives.status).toBe(200)
      expect(rotationDueArchives.body.data.reportSignature.keyGovernance).toMatchObject({
        status: 'rotation_due',
        keyCreatedAt: '2020-01-01',
        rotationDays: 1,
        rotationDueAt: '2020-01-02',
      })
    } finally {
      if (originalSigningSecret === undefined) {
        delete process.env.COREONE_ARCHIVE_REPORT_SIGNING_SECRET
      } else {
        process.env.COREONE_ARCHIVE_REPORT_SIGNING_SECRET = originalSigningSecret
      }
      if (originalSigningKeyId === undefined) {
        delete process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_ID
      } else {
        process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_ID = originalSigningKeyId
      }
      if (originalSigningKeyCreatedAt === undefined) {
        delete process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_CREATED_AT
      } else {
        process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_CREATED_AT = originalSigningKeyCreatedAt
      }
      if (originalSigningKeyRotationDays === undefined) {
        delete process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_ROTATION_DAYS
      } else {
        process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_ROTATION_DAYS = originalSigningKeyRotationDays
      }
    }

    db.prepare('UPDATE audit_log_archives SET content_json = ? WHERE id = ?')
      .run(secondArchive.content_json.replace(secondOldId, `${secondOldId}-tampered`), secondArchive.id)

    const verifyTampered = await request(app)
      .post('/api/v1/logs/archives/verify')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(verifyTampered.status).toBe(200)
    expect(verifyTampered.body.data).toMatchObject({
      valid: false,
      checkedCount: 2,
      brokenArchiveNo: secondArchive.archive_no,
      brokenReason: 'CONTENT_HASH_MISMATCH',
    })
  })

  it('LOG-008B: 日志清理拒绝清空全部或清理保留期内日志', async () => {
    const recentId = `log-clean-retain-${Date.now()}`
    seedLog(db, {
      id: recentId,
      username: 'admin',
      operation: 'retain_cleanup_guard',
      description: '清理测试-保留期内日志',
      requestData: { module: 'logs' },
    })
    db.prepare('UPDATE operation_logs SET created_at = ? WHERE id = ?').run(`${dateOnlyDaysAgo(5)} 00:00:00`, recentId)

    const clearAll = await request(app)
      .delete('/api/v1/logs')
      .query({ beforeDate: '9999-12-31' })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(clearAll.status).toBe(400)
    expect(clearAll.body.error.code).toBe('INVALID_PARAMETER')

    const tooRecent = await request(app)
      .delete('/api/v1/logs')
      .query({ beforeDate: dateOnlyDaysAgo(30) })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(tooRecent.status).toBe(400)
    expect(tooRecent.body.error.code).toBe('INVALID_PARAMETER')

    const recentRow = db.prepare('SELECT 1 FROM operation_logs WHERE id = ?').get(recentId)
    expect(recentRow).toBeTruthy()
  })

  it('LOG-008C: 日志清理可生成外部归档包并在验证报告中引用文件哈希', async () => {
    const originalExportDir = process.env.COREONE_ARCHIVE_EXPORT_DIR
    const originalStorageMode = process.env.COREONE_ARCHIVE_STORAGE_GOVERNANCE_MODE
    const originalRetentionUntil = process.env.COREONE_ARCHIVE_STORAGE_RETENTION_UNTIL
    const originalEvidenceUri = process.env.COREONE_ARCHIVE_STORAGE_EVIDENCE_URI
    const exportDir = mkdtempSync(join(tmpdir(), 'coreone-archive-export-'))
    const suffix = Date.now()
    const oldId = `log-clean-external-${suffix}`
    const oldDate = dateOnlyDaysAgo(220)
    const beforeDate = dateOnlyDaysAgo(200)

    try {
      db.prepare('DELETE FROM audit_log_archives').run()
      process.env.COREONE_ARCHIVE_EXPORT_DIR = exportDir
      seedLog(db, {
        id: oldId,
        username: 'admin',
        operation: 'external_cleanup_target',
        description: '清理测试-外部归档包',
        requestData: { module: 'logs', documentNo: 'LOG-EXT-UNIT' },
      })
      db.prepare('UPDATE operation_logs SET created_at = ? WHERE id = ?').run(`${oldDate} 00:00:00`, oldId)

      const cleaned = await request(app)
        .delete('/api/v1/logs')
        .query({ beforeDate })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(cleaned.status).toBe(200)
      expect(cleaned.body.data.externalArchive).toMatchObject({
        status: 'exported',
        storageType: 'filesystem',
        packageHashAlgorithm: 'SHA-256',
        storageGovernance: {
          status: 'not_configured',
          missingReason: 'COREONE_ARCHIVE_STORAGE_GOVERNANCE_NOT_CONFIGURED',
        },
      })
      expect(cleaned.body.data.externalArchive.packageHash).toMatch(/^[a-f0-9]{64}$/)
      const packagePath = cleaned.body.data.externalArchive.uri
      expect(packagePath.startsWith(exportDir)).toBe(true)
      expect(existsSync(packagePath)).toBe(true)

      const packageText = readFileSync(packagePath, 'utf8')
      const packageHash = createHash('sha256').update(packageText).digest('hex')
      expect(packageHash).toBe(cleaned.body.data.externalArchive.packageHash)
      const packageJson = JSON.parse(packageText)
      expect(packageJson).toMatchObject({
        packageType: 'operation_log_archive_external_package',
        packageVersion: 1,
        archiveNo: cleaned.body.data.archiveNo,
        contentHash: cleaned.body.data.archiveHash,
        chainHash: cleaned.body.data.archiveChainHash,
        storageGovernance: {
          status: 'not_configured',
          missingReason: 'COREONE_ARCHIVE_STORAGE_GOVERNANCE_NOT_CONFIGURED',
        },
      })
      expect(packageJson.content.rows.map((row: any) => row.id)).toContain(oldId)

      const archive = db.prepare('SELECT * FROM audit_log_archives WHERE id = ?').get(cleaned.body.data.archiveId) as any
      const storedExternalArchive = JSON.parse(archive.external_archive_json)
      expect(storedExternalArchive).toMatchObject({
        status: 'exported',
        uri: packagePath,
        packageHash,
        storageGovernance: {
          status: 'not_configured',
        },
      })

      const archives = await request(app)
        .get('/api/v1/logs/archives')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(archives.status).toBe(200)
      const listedArchive = archives.body.data.list.find((item: any) => item.archiveNo === cleaned.body.data.archiveNo)
      expect(listedArchive.externalArchive).toMatchObject({
        status: 'exported',
        uri: packagePath,
        packageHash,
        storageGovernance: {
          status: 'not_configured',
        },
      })

      const verificationReport = await request(app)
        .get('/api/v1/logs/archives/verification-report')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(verificationReport.status).toBe(200)
      const report = JSON.parse(verificationReport.text)
      const reportArchive = report.archives.find((item: any) => item.archiveNo === cleaned.body.data.archiveNo)
      expect(reportArchive.externalArchive).toMatchObject({
        status: 'exported',
        uri: packagePath,
        packageHash,
        storageGovernance: {
          status: 'not_configured',
        },
      })
      expect(report.verificationInstructions.externalArchiveCheck).toContain('externalArchive.packageHash')

      const verifyOk = await request(app)
        .post('/api/v1/logs/archives/verify')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(verifyOk.status).toBe(200)
      expect(verifyOk.body.data).toMatchObject({
        valid: true,
        externalArchiveCheckedCount: 1,
      })

      writeFileSync(packagePath, `${packageText}\n{"tampered":true}\n`, 'utf8')

      const verifyTamperedPackage = await request(app)
        .post('/api/v1/logs/archives/verify')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(verifyTamperedPackage.status).toBe(200)
      expect(verifyTamperedPackage.body.data).toMatchObject({
        valid: false,
        brokenArchiveNo: cleaned.body.data.archiveNo,
        brokenReason: 'EXTERNAL_ARCHIVE_HASH_MISMATCH',
        externalArchiveCheckedCount: 1,
      })
    } finally {
      if (originalExportDir === undefined) {
        delete process.env.COREONE_ARCHIVE_EXPORT_DIR
      } else {
        process.env.COREONE_ARCHIVE_EXPORT_DIR = originalExportDir
      }
      if (originalStorageMode === undefined) {
        delete process.env.COREONE_ARCHIVE_STORAGE_GOVERNANCE_MODE
      } else {
        process.env.COREONE_ARCHIVE_STORAGE_GOVERNANCE_MODE = originalStorageMode
      }
      if (originalRetentionUntil === undefined) {
        delete process.env.COREONE_ARCHIVE_STORAGE_RETENTION_UNTIL
      } else {
        process.env.COREONE_ARCHIVE_STORAGE_RETENTION_UNTIL = originalRetentionUntil
      }
      if (originalEvidenceUri === undefined) {
        delete process.env.COREONE_ARCHIVE_STORAGE_EVIDENCE_URI
      } else {
        process.env.COREONE_ARCHIVE_STORAGE_EVIDENCE_URI = originalEvidenceUri
      }
      rmSync(exportDir, { recursive: true, force: true })
    }
  })

  it('LOG-008D: 外部归档包记录外部存储留存锁声明但不伪装成本地强制', async () => {
    const originalExportDir = process.env.COREONE_ARCHIVE_EXPORT_DIR
    const originalStorageMode = process.env.COREONE_ARCHIVE_STORAGE_GOVERNANCE_MODE
    const originalRetentionUntil = process.env.COREONE_ARCHIVE_STORAGE_RETENTION_UNTIL
    const originalEvidenceUri = process.env.COREONE_ARCHIVE_STORAGE_EVIDENCE_URI
    const exportDir = mkdtempSync(join(tmpdir(), 'coreone-archive-governance-'))
    const suffix = Date.now()
    const oldId = `log-clean-storage-governance-${suffix}`
    const oldDate = dateOnlyDaysAgo(220)
    const beforeDate = dateOnlyDaysAgo(200)

    try {
      db.prepare('DELETE FROM audit_log_archives').run()
      process.env.COREONE_ARCHIVE_EXPORT_DIR = exportDir
      process.env.COREONE_ARCHIVE_STORAGE_GOVERNANCE_MODE = 'retention_lock'
      process.env.COREONE_ARCHIVE_STORAGE_RETENTION_UNTIL = '2099-12-31'
      process.env.COREONE_ARCHIVE_STORAGE_EVIDENCE_URI = 's3://coreone-audit-archives/object-lock/unit'
      seedLog(db, {
        id: oldId,
        username: 'admin',
        operation: 'external_storage_governance_target',
        description: '清理测试-外部存储治理声明',
        requestData: { module: 'logs', documentNo: 'LOG-WORM-UNIT' },
      })
      db.prepare('UPDATE operation_logs SET created_at = ? WHERE id = ?').run(`${oldDate} 00:00:00`, oldId)

      const cleaned = await request(app)
        .delete('/api/v1/logs')
        .query({ beforeDate })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(cleaned.status).toBe(200)
      expect(cleaned.body.data.externalArchive.storageGovernance).toMatchObject({
        status: 'declared',
        mode: 'retention_lock',
        retentionUntil: '2099-12-31',
        evidenceUri: 's3://coreone-audit-archives/object-lock/unit',
        enforcement: 'external_storage',
      })
      expect(cleaned.body.data.externalArchive.storageGovernance.warning).toContain('COREONE records this declaration')

      const packageText = readFileSync(cleaned.body.data.externalArchive.uri, 'utf8')
      const packageJson = JSON.parse(packageText)
      expect(packageJson.storageGovernance).toMatchObject({
        status: 'declared',
        mode: 'retention_lock',
        retentionUntil: '2099-12-31',
        evidenceUri: 's3://coreone-audit-archives/object-lock/unit',
      })

      const archives = await request(app)
        .get('/api/v1/logs/archives')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(archives.status).toBe(200)
      expect(archives.body.data.list[0].externalArchive.storageGovernance).toMatchObject({
        status: 'declared',
        mode: 'retention_lock',
      })

      const verificationReport = await request(app)
        .get('/api/v1/logs/archives/verification-report')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(verificationReport.status).toBe(200)
      const report = JSON.parse(verificationReport.text)
      expect(report.archives[0].externalArchive.storageGovernance).toMatchObject({
        status: 'declared',
        mode: 'retention_lock',
        retentionUntil: '2099-12-31',
      })
      expect(report.verificationInstructions.externalStorageGovernance).toContain('retention lock or WORM status is an external storage declaration')
    } finally {
      if (originalExportDir === undefined) {
        delete process.env.COREONE_ARCHIVE_EXPORT_DIR
      } else {
        process.env.COREONE_ARCHIVE_EXPORT_DIR = originalExportDir
      }
      if (originalStorageMode === undefined) {
        delete process.env.COREONE_ARCHIVE_STORAGE_GOVERNANCE_MODE
      } else {
        process.env.COREONE_ARCHIVE_STORAGE_GOVERNANCE_MODE = originalStorageMode
      }
      if (originalRetentionUntil === undefined) {
        delete process.env.COREONE_ARCHIVE_STORAGE_RETENTION_UNTIL
      } else {
        process.env.COREONE_ARCHIVE_STORAGE_RETENTION_UNTIL = originalRetentionUntil
      }
      if (originalEvidenceUri === undefined) {
        delete process.env.COREONE_ARCHIVE_STORAGE_EVIDENCE_URI
      } else {
        process.env.COREONE_ARCHIVE_STORAGE_EVIDENCE_URI = originalEvidenceUri
      }
      rmSync(exportDir, { recursive: true, force: true })
    }
  })

  it('LOG-008E: 外部归档留存锁声明已过期时不能标记为可审计声明', async () => {
    const originalExportDir = process.env.COREONE_ARCHIVE_EXPORT_DIR
    const originalStorageMode = process.env.COREONE_ARCHIVE_STORAGE_GOVERNANCE_MODE
    const originalRetentionUntil = process.env.COREONE_ARCHIVE_STORAGE_RETENTION_UNTIL
    const originalEvidenceUri = process.env.COREONE_ARCHIVE_STORAGE_EVIDENCE_URI
    const exportDir = mkdtempSync(join(tmpdir(), 'coreone-archive-insufficient-retention-'))
    const suffix = Date.now()
    const oldId = `log-clean-storage-expired-${suffix}`
    const oldDate = dateOnlyDaysAgo(220)
    const beforeDate = dateOnlyDaysAgo(200)

    try {
      db.prepare('DELETE FROM audit_log_archives').run()
      process.env.COREONE_ARCHIVE_EXPORT_DIR = exportDir
      process.env.COREONE_ARCHIVE_STORAGE_GOVERNANCE_MODE = 'retention_lock'
      process.env.COREONE_ARCHIVE_STORAGE_RETENTION_UNTIL = '2000-01-01'
      process.env.COREONE_ARCHIVE_STORAGE_EVIDENCE_URI = 's3://coreone-audit-archives/object-lock/expired'
      seedLog(db, {
        id: oldId,
        username: 'admin',
        operation: 'external_storage_expired_governance_target',
        description: '清理测试-外部存储留存锁过期',
        requestData: { module: 'logs', documentNo: 'LOG-WORM-EXPIRED' },
      })
      db.prepare('UPDATE operation_logs SET created_at = ? WHERE id = ?').run(`${oldDate} 00:00:00`, oldId)

      const cleaned = await request(app)
        .delete('/api/v1/logs')
        .query({ beforeDate })
        .set('Authorization', `Bearer ${adminToken}`)

      expect(cleaned.status).toBe(200)
      expect(cleaned.body.data.externalArchive.storageGovernance).toMatchObject({
        status: 'insufficient_retention',
        mode: 'retention_lock',
        retentionUntil: '2000-01-01',
        evidenceUri: 's3://coreone-audit-archives/object-lock/expired',
        enforcement: 'external_storage',
        missingReason: 'COREONE_ARCHIVE_STORAGE_RETENTION_INSUFFICIENT',
      })
      expect(cleaned.body.data.externalArchive.storageGovernance.requiredRetentionUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(cleaned.body.data.externalArchive.storageGovernance.warning).toContain('does not cover')

      const packageText = readFileSync(cleaned.body.data.externalArchive.uri, 'utf8')
      const packageJson = JSON.parse(packageText)
      expect(packageJson.storageGovernance).toMatchObject({
        status: 'insufficient_retention',
        retentionUntil: '2000-01-01',
        missingReason: 'COREONE_ARCHIVE_STORAGE_RETENTION_INSUFFICIENT',
      })

      const verificationReport = await request(app)
        .get('/api/v1/logs/archives/verification-report')
        .set('Authorization', `Bearer ${adminToken}`)

      expect(verificationReport.status).toBe(200)
      const report = JSON.parse(verificationReport.text)
      expect(report.archives[0].externalArchive.storageGovernance).toMatchObject({
        status: 'insufficient_retention',
        retentionUntil: '2000-01-01',
      })
      expect(report.verificationInstructions.externalStorageGovernance).toContain('declared only when retentionUntil is not expired')
    } finally {
      if (originalExportDir === undefined) {
        delete process.env.COREONE_ARCHIVE_EXPORT_DIR
      } else {
        process.env.COREONE_ARCHIVE_EXPORT_DIR = originalExportDir
      }
      if (originalStorageMode === undefined) {
        delete process.env.COREONE_ARCHIVE_STORAGE_GOVERNANCE_MODE
      } else {
        process.env.COREONE_ARCHIVE_STORAGE_GOVERNANCE_MODE = originalStorageMode
      }
      if (originalRetentionUntil === undefined) {
        delete process.env.COREONE_ARCHIVE_STORAGE_RETENTION_UNTIL
      } else {
        process.env.COREONE_ARCHIVE_STORAGE_RETENTION_UNTIL = originalRetentionUntil
      }
      if (originalEvidenceUri === undefined) {
        delete process.env.COREONE_ARCHIVE_STORAGE_EVIDENCE_URI
      } else {
        process.env.COREONE_ARCHIVE_STORAGE_EVIDENCE_URI = originalEvidenceUri
      }
      rmSync(exportDir, { recursive: true, force: true })
    }
  })

  it('LOG-009: 非管理员不能清理日志', async () => {
    const cleaned = await request(app)
      .delete('/api/v1/logs')
      .query({ beforeDate: '2026-03-01' })
      .set('Authorization', `Bearer ${financeToken}`)

    expect(cleaned.status).toBe(403)
  })

  it('LOG-010: 日志查询、导出和清理拒绝非法日期范围', async () => {
    const reversedList = await request(app)
      .get('/api/v1/logs')
      .query({ startDate: '2026-06-30', endDate: '2026-06-01' })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(reversedList.status).toBe(400)

    const invalidExportDate = await request(app)
      .post('/api/v1/logs/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ startDate: '2026-02-30', endDate: '2026-03-01' })
    expect(invalidExportDate.status).toBe(400)

    const invalidCleanDate = await request(app)
      .delete('/api/v1/logs')
      .query({ beforeDate: '2026-13-01' })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(invalidCleanDate.status).toBe(400)
  })

  it('LOG-011: 日志列表和导出拒绝非法操作类型与模块筛选', async () => {
    const invalidTypeList = await request(app)
      .get('/api/v1/logs')
      .query({ type: 'archive' })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(invalidTypeList.status).toBe(400)
    expect(invalidTypeList.body.error.code).toBe('INVALID_PARAMETER')

    const invalidModuleList = await request(app)
      .get('/api/v1/logs')
      .query({ module: 'ghost_inventory' })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(invalidModuleList.status).toBe(400)
    expect(invalidModuleList.body.error.code).toBe('INVALID_PARAMETER')

    const invalidGetExport = await request(app)
      .get('/api/v1/logs/export')
      .query({ type: 'archive' })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(invalidGetExport.status).toBe(400)
    expect(invalidGetExport.body.error.code).toBe('INVALID_PARAMETER')

    const invalidPostExport = await request(app)
      .post('/api/v1/logs/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ module: 'ghost_inventory' })
    expect(invalidPostExport.status).toBe(400)
    expect(invalidPostExport.body.error.code).toBe('INVALID_PARAMETER')
  })

  it('LOG-012: 日志列表拒绝不可解释的分页参数', async () => {
    const invalidCases = [
      { page: '0', pageSize: '20' },
      { page: 'abc', pageSize: '20' },
      { page: '1.5', pageSize: '20' },
      { page: '1', pageSize: '0' },
      { page: '1', pageSize: 'abc' },
      { page: '1', pageSize: '10001' },
    ]

    for (const query of invalidCases) {
      const res = await request(app)
        .get('/api/v1/logs')
        .query(query)
        .set('Authorization', `Bearer ${adminToken}`)

      expect(res.status, JSON.stringify(query)).toBe(400)
      expect(res.body.error.code, JSON.stringify(query)).toBe('INVALID_PARAMETER')
    }
  })

  it('LOG-013: 登录、用户、角色和日志导出动作进入操作日志', async () => {
    const suffix = Date.now()
    const username = `log-user-${suffix}`
    const roleCode = `log_role_${suffix}`

    const loginAgain = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' })
    expect(loginAgain.status).toBe(200)

    const createUser = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username,
        realName: '日志用户',
        role: 'technician',
        department: '病理科',
      })
    expect(createUser.status).toBe(201)

    const createRole = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code: roleCode,
        name: '日志角色',
        permissions: ['logs:view'],
        status: 'active',
      })
    expect(createRole.status).toBe(200)

    const exported = await request(app)
      .post('/api/v1/logs/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ module: 'user', keyword: username, includeBasic: true, includeDetail: true })
    expect(exported.status).toBe(200)

    const loginLogs = await request(app)
      .get('/api/v1/logs')
      .query({ username: 'admin', type: 'login', module: 'system', pageSize: 100 })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(loginLogs.status).toBe(200)
    expect(loginLogs.body.data.list.some((row: any) => row.operationType === 'login')).toBe(true)

    const userLogs = await request(app)
      .get('/api/v1/logs')
      .query({ module: 'user', type: 'create', keyword: username, pageSize: 100 })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(userLogs.status).toBe(200)
    expect(userLogs.body.data.list[0]).toMatchObject({
      username: 'admin',
      module: 'user',
      operationType: 'create',
    })
    expect(userLogs.body.data.list[0].requestData).toMatchObject({ username, module: 'user' })
    expect(JSON.stringify(userLogs.body.data.list[0].requestData)).not.toContain('password')

    const roleLogs = await request(app)
      .get('/api/v1/logs')
      .query({ module: 'role', type: 'create', keyword: roleCode, pageSize: 100 })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(roleLogs.status).toBe(200)
    expect(roleLogs.body.data.list[0]).toMatchObject({
      module: 'role',
      operationType: 'create',
    })

    const exportLogs = await request(app)
      .get('/api/v1/logs')
      .query({ module: 'logs', type: 'export', pageSize: 100 })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(exportLogs.status).toBe(200)
    expect(exportLogs.body.data.list[0]).toMatchObject({
      module: 'logs',
      operationType: 'export',
    })
  })

  it('LOG-014: 统一审计视图合并操作、库存、ABC 和对账事实', async () => {
    const suffix = Date.now()
    const operationId = `unified-operation-${suffix}`
    const stockId = `unified-stock-${suffix}`
    const abcId = `unified-abc-${suffix}`
    const reconciliationId = `unified-reconciliation-${suffix}`
    const batchLocationId = `unified-batch-location-${suffix}`

    seedLog(db, {
      id: operationId,
      username: 'admin',
      operation: 'POST /inbound',
      description: '统一审计-创建入库单',
      requestData: { module: 'inbound', documentNo: 'IN-UNIT' },
    })
    seedStockLog(db, {
      id: stockId,
      type: 'inbound',
      materialId: 'mat-unified',
      quantity: 5,
      beforeStock: 10,
      afterStock: 15,
      relatedId: 'IN-UNIT',
      relatedType: 'inbound',
      operator: 'warehouse',
      remark: '统一审计-批次入库',
    })
    seedAbcAuditLog(db, {
      id: abcId,
      module: 'cost',
      action: 'update_cost_run',
      targetId: 'COST-UNIT',
      detail: { reason: '统一审计-成本重算', amount: 128 },
      operator: 'finance',
    })
    seedReconciliationLog(db, {
      id: reconciliationId,
      type: 'adjust_cost',
      targetId: 'REC-UNIT',
      targetName: '统一审计-对账修正',
      field: 'amount',
      oldValue: '120',
      newValue: '128',
      reason: '统一审计-补齐发票差异',
      operator: 'finance',
    })
    seedBatchLocationAdjustment(db, {
      id: batchLocationId,
      relatedType: 'stocktaking',
      relatedId: 'ST-UNIT',
      batchId: 'batch-unified',
      materialId: 'mat-unified',
      locationId: 'loc-unified',
      quantityDelta: -2,
    })

    const res = await request(app)
      .get('/api/v1/logs/unified')
      .query({ keyword: 'UNIT', pageSize: 100 })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const rows = res.body.data.list
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: operationId,
        sourceType: 'operation',
        sourceLabel: '操作日志',
        module: 'inbound',
        businessId: 'IN-UNIT',
        auditEvent: expect.objectContaining({
          eventCode: 'operation.inbound.create',
          action: 'create',
          subjectType: 'inbound',
          subjectId: 'IN-UNIT',
          businessId: 'IN-UNIT',
          businessUrl: '/inbound?keyword=IN-UNIT',
          actor: 'admin',
          evidenceSource: 'operation_logs',
        }),
      }),
      expect.objectContaining({
        id: stockId,
        sourceType: 'stock',
        sourceLabel: '库存流水',
        module: 'inbound',
        username: 'warehouse',
        businessId: 'IN-UNIT',
        requestData: expect.objectContaining({ materialId: 'mat-unified', afterStock: 15 }),
        auditEvent: expect.objectContaining({
          eventCode: 'stock.inbound.create',
          action: 'create',
          subjectType: 'inbound',
          subjectId: 'IN-UNIT',
          businessId: 'IN-UNIT',
          actor: 'warehouse',
          evidenceSource: 'stock_logs',
        }),
      }),
      expect.objectContaining({
        id: abcId,
        sourceType: 'abc',
        sourceLabel: '成本审计',
        module: 'cost',
        username: 'finance',
        businessId: 'COST-UNIT',
        requestData: expect.objectContaining({ reason: '统一审计-成本重算' }),
        auditEvent: expect.objectContaining({
          eventCode: 'abc.cost.update',
          action: 'update',
          subjectType: 'cost',
          subjectId: 'COST-UNIT',
          businessId: 'COST-UNIT',
          actor: 'finance',
          evidenceSource: 'abc_audit_logs',
        }),
      }),
      expect.objectContaining({
        id: reconciliationId,
        sourceType: 'reconciliation',
        sourceLabel: '对账修正',
        module: 'reconciliation',
        username: 'finance',
        businessId: 'REC-UNIT',
        requestData: expect.objectContaining({ oldValue: '120', newValue: '128' }),
        auditEvent: expect.objectContaining({
          eventCode: 'reconciliation.reconciliation.update',
          action: 'update',
          subjectType: 'reconciliation',
          subjectId: 'REC-UNIT',
          businessId: 'REC-UNIT',
          actor: 'finance',
          evidenceSource: 'reconciliation_logs',
        }),
      }),
      expect.objectContaining({
        id: batchLocationId,
        sourceType: 'batch_location',
        sourceLabel: '批次库位流水',
        module: 'stocktaking',
        businessId: 'ST-UNIT',
        requestData: expect.objectContaining({
          batchId: 'batch-unified',
          materialId: 'mat-unified',
          locationId: 'loc-unified',
          quantityDelta: -2,
        }),
        auditEvent: expect.objectContaining({
          eventCode: 'batch_location.stocktaking.update',
          action: 'update',
          subjectType: 'stocktaking',
          subjectId: 'ST-UNIT',
          businessId: 'ST-UNIT',
          evidenceSource: 'batch_location_adjustments',
        }),
      }),
    ]))
  })

  it('LOG-015: 统一审计视图支持来源、模块、用户和类型筛选', async () => {
    const suffix = Date.now()
    const keepId = `unified-filter-keep-${suffix}`
    const dropId = `unified-filter-drop-${suffix}`
    seedStockLog(db, {
      id: keepId,
      type: 'stock_update',
      materialId: 'mat-filter',
      quantity: -2,
      beforeStock: 20,
      afterStock: 18,
      relatedId: 'SCRAP-UNIT',
      relatedType: 'scraps',
      operator: 'warehouse',
      remark: '统一筛选-报废扣减',
    })
    seedAbcAuditLog(db, {
      id: dropId,
      module: 'cost',
      action: 'update_cost_run',
      targetId: 'COST-DROP',
      detail: { reason: '统一筛选-成本重算' },
      operator: 'finance',
    })

    const res = await request(app)
      .get('/api/v1/logs/unified')
      .query({
        sourceType: 'stock',
        module: 'scraps',
        username: 'warehouse',
        type: 'update',
        keyword: '统一筛选',
        pageSize: 100,
      })
      .set('Authorization', `Bearer ${financeToken}`)

    expect(res.status).toBe(200)
    const ids = res.body.data.list.map((row: any) => row.id)
    expect(ids).toContain(keepId)
    expect(ids).not.toContain(dropId)

    const invalidSource = await request(app)
      .get('/api/v1/logs/unified')
      .query({ sourceType: 'ghost' })
      .set('Authorization', `Bearer ${adminToken}`)
    expect(invalidSource.status).toBe(400)
    expect(invalidSource.body.error.code).toBe('INVALID_PARAMETER')
  })

  it('LOG-016: 统一审计视图可按批次库位流水来源筛选', async () => {
    const suffix = Date.now()
    const keepId = `unified-batch-location-keep-${suffix}`
    const dropId = `unified-batch-location-drop-${suffix}`
    seedBatchLocationAdjustment(db, {
      id: keepId,
      relatedType: 'outbound',
      relatedId: 'OUT-BLA-UNIT',
      batchId: 'batch-bla-keep',
      materialId: 'mat-bla-keep',
      locationId: 'loc-bla-keep',
      quantityDelta: -4,
    })
    seedStockLog(db, {
      id: dropId,
      type: 'outbound',
      materialId: 'mat-bla-keep',
      quantity: -4,
      beforeStock: 9,
      afterStock: 5,
      relatedId: 'OUT-BLA-UNIT',
      relatedType: 'outbound',
      operator: 'warehouse',
      remark: '批次库位筛选-库存流水',
    })

    const res = await request(app)
      .get('/api/v1/logs/unified')
      .query({
        sourceType: 'batch_location',
        module: 'outbound',
        keyword: 'OUT-BLA-UNIT',
        pageSize: 100,
      })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    const ids = res.body.data.list.map((row: any) => row.id)
    expect(ids).toContain(keepId)
    expect(ids).not.toContain(dropId)
    expect(res.body.data.list.find((row: any) => row.id === keepId)).toMatchObject({
      sourceType: 'batch_location',
      sourceLabel: '批次库位流水',
      module: 'outbound',
      businessId: 'OUT-BLA-UNIT',
      operationType: 'update',
    })
  })

  it('LOG-018: 批次库位流水可从业务单据回看责任人并支持按责任人筛选', async () => {
    const suffix = Date.now()
    const inboundId = `inbound-bla-op-${suffix}`
    const inboundNo = `IN-BLA-OP-${suffix}`
    const batchLocationId = `unified-batch-location-operator-${suffix}`
    db.prepare(`
      INSERT INTO inbound_records (id, inbound_no, type, material_id, batch_no, quantity, unit, location_id, operator, status)
      VALUES (?, ?, 'purchase', 'mat-bla-operator', 'BATCH-BLA-OP', 3, '瓶', 'loc-bla-operator', '李仓管', 'completed')
    `).run(inboundId, inboundNo)
    seedBatchLocationAdjustment(db, {
      id: batchLocationId,
      relatedType: 'inbound',
      relatedId: inboundId,
      batchId: 'batch-bla-operator',
      materialId: 'mat-bla-operator',
      locationId: 'loc-bla-operator',
      quantityDelta: 3,
    })

    const res = await request(app)
      .get('/api/v1/logs/unified')
      .query({
        sourceType: 'batch_location',
        username: '李仓管',
        keyword: inboundNo,
        pageSize: 100,
      })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(res.status).toBe(200)
    expect(res.body.data.list).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: batchLocationId,
        sourceType: 'batch_location',
        sourceLabel: '批次库位流水',
        module: 'inbound',
        username: '李仓管',
        businessId: inboundNo,
        businessUrl: `/inbound?keyword=${encodeURIComponent(inboundNo)}`,
        requestData: expect.objectContaining({ relatedId: inboundId }),
      }),
    ]))
  })

  it('LOG-017: 统一审计导出可导出跨来源事实并按批次库位流水来源筛选', async () => {
    const suffix = Date.now()
    const operationId = `unified-export-operation-${suffix}`
    const costPoolOperationId = `unified-export-cost-pool-operation-${suffix}`
    const batchLocationId = `unified-export-batch-location-${suffix}`
    const stockId = `unified-export-stock-${suffix}`
    const abcId = `unified-export-abc-${suffix}`
    const costPoolAuditId = `unified-export-cost-pool-abc-${suffix}`
    const activityCenterAuditId = `unified-export-activity-center-abc-${suffix}`
    const costDriverAuditId = `unified-export-cost-driver-abc-${suffix}`
    const feeMappingAuditId = `unified-export-fee-mapping-abc-${suffix}`
    const exceptionAuditId = `unified-export-exception-abc-${suffix}`
    const costAdjustmentAuditId = `unified-export-cost-adjustment-abc-${suffix}`
    const costRunAuditId = `unified-export-cost-run-abc-${suffix}`
    const periodAuditId = `unified-export-period-abc-${suffix}`

    seedLog(db, {
      id: operationId,
      username: 'admin',
      operation: 'POST /inbound',
      description: '统一导出-创建入库单',
      requestData: { module: 'inbound', documentNo: 'EXPORT-OP-UNIT' },
    })
    seedLog(db, {
      id: costPoolOperationId,
      username: 'sunli',
      operation: 'POST /abc/cost-pools',
      description: '统一导出-创建手工成本池',
      requestData: { module: 'abc_cost_pools', id: 'EXPORT-POOL-OP-UNIT' },
    })
    seedBatchLocationAdjustment(db, {
      id: batchLocationId,
      relatedType: 'stocktaking',
      relatedId: 'EXPORT-BLA-UNIT',
      batchId: 'batch-export',
      materialId: 'mat-export',
      locationId: 'loc-export',
      quantityDelta: -6,
    })
    seedStockLog(db, {
      id: stockId,
      type: 'stocktaking',
      materialId: 'mat-export',
      quantity: -6,
      beforeStock: 20,
      afterStock: 14,
      relatedId: 'EXPORT-BLA-UNIT',
      relatedType: 'stocktaking',
      operator: 'warehouse',
      remark: '统一导出-库存流水对照',
    })
    seedAbcAuditLog(db, {
      id: abcId,
      module: 'cost',
      action: 'update_cost_run',
      targetId: 'EXPORT-ABC-UNIT',
      detail: { reason: '统一导出-成本重算' },
      operator: 'finance',
    })
    seedAbcAuditLog(db, {
      id: costPoolAuditId,
      module: 'cost_pool',
      action: 'create',
      targetId: 'EXPORT-POOL-ABC-UNIT',
      detail: { reason: '统一导出-成本池审计' },
      operator: 'finance',
    })
    seedAbcAuditLog(db, {
      id: activityCenterAuditId,
      module: 'activity_center',
      action: 'create',
      targetId: 'EXPORT-ACTIVITY-CENTER-ABC-UNIT',
      detail: { reason: '统一导出-作业中心审计' },
      operator: 'finance',
    })
    seedAbcAuditLog(db, {
      id: costDriverAuditId,
      module: 'cost_driver',
      action: 'create',
      targetId: 'EXPORT-COST-DRIVER-ABC-UNIT',
      detail: { reason: '统一导出-成本动因审计' },
      operator: 'finance',
    })
    seedAbcAuditLog(db, {
      id: feeMappingAuditId,
      module: 'bom_fee_mapping',
      action: 'update',
      targetId: 'EXPORT-FEE-MAPPING-ABC-UNIT',
      detail: { reason: '统一导出-BOM收费映射审计' },
      operator: 'finance',
    })
    seedAbcAuditLog(db, {
      id: exceptionAuditId,
      module: 'exception',
      action: 'resolve',
      targetId: 'EXPORT-EXCEPTION-ID-UNIT',
      detail: { reason: '统一导出-成本异常审计', exceptionNo: 'CE-EXPORT-EXCEPTION-UNIT' },
      operator: 'finance',
    })
    seedAbcAuditLog(db, {
      id: costAdjustmentAuditId,
      module: 'cost_adjustment',
      action: 'approve',
      targetId: 'EXPORT-ADJUSTMENT-ID-UNIT',
      detail: {
        reason: '统一导出-关账后调整审计',
        adjustmentNo: 'ADJ-EXPORT-UNIT',
        yearMonth: '2099-03',
      },
      operator: 'finance',
    })
    seedAbcAuditLog(db, {
      id: costRunAuditId,
      module: 'cost_run',
      action: 'recalculate',
      targetId: 'EXPORT-COST-RUN-UNIT',
      detail: {
        reason: '统一导出-成本任务审计',
        yearMonth: '2099-04',
        processed: 12,
        succeeded: 11,
        failed: 1,
      },
      operator: 'finance',
    })
    seedAbcAuditLog(db, {
      id: periodAuditId,
      module: 'period',
      action: 'close',
      targetId: 'EXPORT-PERIOD-ID-UNIT',
      detail: {
        reason: '统一导出-成本期间关账审计',
        yearMonth: '2099-05',
        status: 'closed',
      },
      operator: 'finance',
    })

    const unifiedExport = await request(app)
      .post('/api/v1/logs/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sourceType: 'all',
        keyword: 'EXPORT-',
        includeBasic: true,
        includeDetail: true,
        includeDiff: true,
      })

    expect(unifiedExport.status).toBe(200)
    expect(unifiedExport.headers['content-type']).toContain('text/csv')
    expect(unifiedExport.text).toContain('审计来源')
    expect(unifiedExport.text).toContain('业务单据')
    expect(unifiedExport.text).toContain('业务链接')
    expect(unifiedExport.text).toContain('标准事件')
    expect(unifiedExport.text).toContain('事件对象')
    expect(unifiedExport.text).toContain('责任人')
    expect(unifiedExport.text).toContain('证据来源')
    expect(unifiedExport.text).toContain('操作日志')
    expect(unifiedExport.text).toContain('批次库位流水')
    expect(unifiedExport.text).toContain('成本审计')
    expect(unifiedExport.text).toContain('operation.inbound.create')
    expect(unifiedExport.text).toContain('stock.stocktaking.update')
    expect(unifiedExport.text).toContain('batch_location.stocktaking.update')
    expect(unifiedExport.text).toContain('abc.cost.update')
    expect(unifiedExport.text).toContain('EXPORT-OP-UNIT')
    expect(unifiedExport.text).toContain('EXPORT-POOL-OP-UNIT')
    expect(unifiedExport.text).toContain('EXPORT-BLA-UNIT')
    expect(unifiedExport.text).toContain('EXPORT-ABC-UNIT')
    expect(unifiedExport.text).toContain('EXPORT-POOL-ABC-UNIT')
    expect(unifiedExport.text).toContain('EXPORT-ACTIVITY-CENTER-ABC-UNIT')
    expect(unifiedExport.text).toContain('EXPORT-COST-DRIVER-ABC-UNIT')
    expect(unifiedExport.text).toContain('EXPORT-FEE-MAPPING-ABC-UNIT')
    expect(unifiedExport.text).toContain('CE-EXPORT-EXCEPTION-UNIT')
    expect(unifiedExport.text).toContain('ADJ-EXPORT-UNIT')
    expect(unifiedExport.text).toContain('EXPORT-COST-RUN-UNIT')
    expect(unifiedExport.text).toContain('2099-05')
    expect(unifiedExport.text).toContain('/inbound?keyword=EXPORT-OP-UNIT')
    expect(unifiedExport.text).toContain('/abc/cost-pools?keyword=EXPORT-POOL-OP-UNIT')
    expect(unifiedExport.text).toContain('/stocktaking?keyword=EXPORT-BLA-UNIT')
    expect(unifiedExport.text).toContain('/abc/audit?keyword=EXPORT-ABC-UNIT')
    expect(unifiedExport.text).toContain('/abc/cost-pools?keyword=EXPORT-POOL-ABC-UNIT')
    expect(unifiedExport.text).toContain('/abc/activity-centers?keyword=EXPORT-ACTIVITY-CENTER-ABC-UNIT')
    expect(unifiedExport.text).toContain('/abc/cost-drivers?keyword=EXPORT-COST-DRIVER-ABC-UNIT')
    expect(unifiedExport.text).toContain('/abc/fee-mappings?keyword=EXPORT-FEE-MAPPING-ABC-UNIT')
    expect(unifiedExport.text).toContain('/abc/alerts?keyword=CE-EXPORT-EXCEPTION-UNIT')
    expect(unifiedExport.text).toContain('/abc/dashboard?month=2099-03&keyword=ADJ-EXPORT-UNIT')
    expect(unifiedExport.text).toContain('/abc/dashboard?month=2099-04&keyword=EXPORT-COST-RUN-UNIT')
    expect(unifiedExport.text).toContain('/abc/dashboard?month=2099-05')
    expect(unifiedExport.text).toContain('quantityDelta')
    expect(unifiedExport.text).toContain('-6')

    const batchLocationExport = await request(app)
      .post('/api/v1/logs/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        sourceType: 'batch_location',
        keyword: 'EXPORT-BLA-UNIT',
        includeBasic: true,
        includeDetail: true,
      })

    expect(batchLocationExport.status).toBe(200)
    expect(batchLocationExport.text).toContain('批次库位流水')
    expect(batchLocationExport.text).toContain('EXPORT-BLA-UNIT')
    expect(batchLocationExport.text).toContain('/stocktaking?keyword=EXPORT-BLA-UNIT')
    expect(batchLocationExport.text).not.toContain('库存流水')
    expect(batchLocationExport.text).not.toContain('统一导出-库存流水对照')
  })
})
