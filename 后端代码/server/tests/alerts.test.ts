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

async function loginRole(app: any, username: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username, password: 'CoreOne2026!' })
  expect(res.status).toBe(200)
  return res.body.data.token
}

function seedAlert(db: any, suffix: string, status = 'pending') {
  const id = `alert-${suffix}`
  db.prepare(`
    INSERT INTO alerts (id, type, level, material_id, material_name, current_stock, threshold, message, status)
    VALUES (?, 'low-stock', 'warning', ?, ?, 1, 5, ?, ?)
  `).run(id, `mat-alert-${suffix}`, `预警物料-${suffix}`, `库存不足-${suffix}`, status)
  return id
}

function latestOperationLog(db: any, operation: string, alertId?: string) {
  const rows = db.prepare(`
    SELECT operation, description, username, request_data, response_data
    FROM operation_logs
    WHERE operation = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(operation) as any[]
  if (!alertId) return rows[0]
  return rows.find(row => String(row.request_data || '').includes(alertId))
}

function seedLowStockMaterial(db: any, suffix: string) {
  const categoryId = `cat-alert-${suffix}`
  const materialId = `mat-alert-low-${suffix}`
  const locationId = `loc-alert-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-ALERT-${suffix}`, '预警测试分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-ALERT-${suffix}`, '预警测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, min_stock, safety_stock, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-ALERT-${suffix}`, `低库存预警物料-${suffix}`, '1ml', '瓶', categoryId, 5, 6, locationId)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, ?, 0, ?)')
    .run(`inv-alert-${suffix}`, materialId, 2, locationId)

  return { materialId }
}

function dateAfter(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString().split('T')[0]
}

function seedExpiringBatches(db: any, suffix: string) {
  const categoryId = `cat-alert-exp-${suffix}`
  const materialId = `mat-alert-exp-${suffix}`
  const locationId = `loc-alert-exp-${suffix}`
  const firstBatchId = `batch-alert-exp-a-${suffix}`
  const secondBatchId = `batch-alert-exp-b-${suffix}`
  const emptyBatchId = `batch-alert-exp-empty-${suffix}`

  db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
    .run(categoryId, `CAT-ALERT-EXP-${suffix}`, '有效期预警测试分类', 1)
  db.prepare('INSERT INTO locations (id, code, name, type, zone) VALUES (?, ?, ?, ?, ?)')
    .run(locationId, `LOC-ALERT-EXP-${suffix}`, '有效期预警测试库位', 'shelf', 'A区')
  db.prepare(`
    INSERT INTO materials (id, code, name, spec, unit, category_id, min_stock, safety_stock, location_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(materialId, `MAT-ALERT-EXP-${suffix}`, `临期预警物料-${suffix}`, '1ml', '瓶', categoryId, 0, 0, locationId)
  db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock, location_id) VALUES (?, ?, ?, 0, ?)')
    .run(`inv-alert-exp-${suffix}`, materialId, 20, locationId)

  db.prepare(`
    INSERT INTO batches (id, material_id, batch_no, quantity, remaining, expiry_date, inbound_id, status)
    VALUES
      (?, ?, ?, 10, 4, ?, ?, 1),
      (?, ?, ?, 8, 2, ?, ?, 1),
      (?, ?, ?, 6, 0, ?, ?, 1)
  `).run(
    firstBatchId, materialId, `B-EXP-A-${suffix}`, dateAfter(7), `inb-exp-a-${suffix}`,
    secondBatchId, materialId, `B-EXP-B-${suffix}`, dateAfter(10), `inb-exp-b-${suffix}`,
    emptyBatchId, materialId, `B-EXP-EMPTY-${suffix}`, dateAfter(5), `inb-exp-empty-${suffix}`,
  )

  return { materialId, batchNos: [`B-EXP-A-${suffix}`, `B-EXP-B-${suffix}`], emptyBatchNo: `B-EXP-EMPTY-${suffix}` }
}

describe('预警处理', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('ALERT-001: 前端 process 端点真实处理预警并记录处理人和意见', async () => {
    const alertId = seedAlert(db, `process-${Date.now()}`)

    const res = await request(app)
      .post(`/api/v1/alerts/${alertId}/process`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remark: '已补货' })

    expect(res.status).toBe(200)
    const alert = db.prepare('SELECT status, handled_by, remark, handled_at FROM alerts WHERE id = ?')
      .get(alertId) as any
    expect(alert.status).toBe('processed')
    expect(alert.handled_by).toBe('admin')
    expect(alert.remark).toBe('已补货')
    expect(alert.handled_at).toBeTruthy()
    const opLog = latestOperationLog(db, 'POST /alerts/:id/process', alertId)
    expect(opLog).toMatchObject({ username: 'admin', description: '处理预警' })
    expect(JSON.parse(opLog.request_data)).toMatchObject({ module: 'alerts', alertIds: [alertId], remark: '已补货' })
    expect(JSON.parse(opLog.response_data)).toMatchObject({ id: alertId, status: 'processed' })
  })

  it('ALERT-010: process 端点拒绝空处理意见且不更新状态', async () => {
    const alertId = seedAlert(db, `process-empty-remark-${Date.now()}`)

    const res = await request(app)
      .post(`/api/v1/alerts/${alertId}/process`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remark: '   ' })

    expect(res.status).toBe(400)
    const alert = db.prepare('SELECT status, handled_by, remark, handled_at FROM alerts WHERE id = ?')
      .get(alertId) as any
    expect(alert.status).toBe('pending')
    expect(alert.handled_by).toBeNull()
    expect(alert.remark).toBeNull()
    expect(alert.handled_at).toBeNull()
  })

  it('ALERT-011: 旧 handle 处理动作拒绝缺失意见且不更新状态', async () => {
    const alertId = seedAlert(db, `handle-missing-remark-${Date.now()}`)

    const res = await request(app)
      .post(`/api/v1/alerts/${alertId}/handle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'handled' })

    expect(res.status).toBe(400)
    const alert = db.prepare('SELECT status, handled_by, remark, handled_at FROM alerts WHERE id = ?')
      .get(alertId) as any
    expect(alert.status).toBe('pending')
    expect(alert.handled_by).toBeNull()
    expect(alert.remark).toBeNull()
    expect(alert.handled_at).toBeNull()
  })

  it('ALERT-012: 批量处理拒绝空意见且整批不更新', async () => {
    const firstId = seedAlert(db, `batch-empty-remark-a-${Date.now()}`)
    const secondId = seedAlert(db, `batch-empty-remark-b-${Date.now()}`)

    const res = await request(app)
      .post('/api/v1/alerts/batch/handle')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId], action: 'processed', remark: '' })

    expect(res.status).toBe(400)
    const rows = db.prepare(`SELECT status, handled_by, remark, handled_at FROM alerts WHERE id IN (?, ?)`)
      .all(firstId, secondId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.status === 'pending')).toBe(true)
    expect(rows.every(row => row.handled_by == null)).toBe(true)
    expect(rows.every(row => row.remark == null)).toBe(true)
    expect(rows.every(row => row.handled_at == null)).toBe(true)
  })

  it('ALERT-007: 列表返回已处理预警的处理人、处理意见和处理时间', async () => {
    const stamp = Date.now()
    const alertId = seedAlert(db, `audit-${stamp}`)

    const processRes = await request(app)
      .post(`/api/v1/alerts/${alertId}/process`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remark: '处理结论：采购跟进中\n处理意见：已通知采购补货' })
    expect(processRes.status).toBe(200)

    const listRes = await request(app)
      .get('/api/v1/alerts')
      .query({ keyword: `audit-${stamp}`, status: 'processed' })
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.list).toHaveLength(1)
    expect(listRes.body.data.list[0]).toMatchObject({
      id: alertId,
      status: 'processed',
      handledBy: 'admin',
      remark: '处理结论：采购跟进中\n处理意见：已通知采购补货',
    })
    expect(listRes.body.data.list[0].handledAt).toBeTruthy()
  })

  it('ALERT-002: 前端 ignore 端点真实忽略预警', async () => {
    const alertId = seedAlert(db, `ignore-${Date.now()}`)

    const res = await request(app)
      .post(`/api/v1/alerts/${alertId}/ignore`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remark: '无需处理' })

    expect(res.status).toBe(200)
    const alert = db.prepare('SELECT status, handled_by, remark FROM alerts WHERE id = ?').get(alertId) as any
    expect(alert.status).toBe('ignored')
    expect(alert.handled_by).toBe('admin')
    expect(alert.remark).toBe('无需处理')
    const opLog = latestOperationLog(db, 'POST /alerts/:id/ignore', alertId)
    expect(opLog).toMatchObject({ username: 'admin', description: '忽略预警' })
    expect(JSON.parse(opLog.request_data)).toMatchObject({ module: 'alerts', alertIds: [alertId], remark: '无需处理' })
  })

  it('ALERT-003: 批量处理遇到已处理预警时整批拒绝，不部分更新', async () => {
    const firstId = seedAlert(db, `batch-a-${Date.now()}`)
    const secondId = seedAlert(db, `batch-b-${Date.now()}`, 'processed')

    const res = await request(app)
      .post('/api/v1/alerts/batch/handle')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId], action: 'processed', remark: '批量处理' })

    expect(res.status).toBe(400)
    const first = db.prepare('SELECT status, remark FROM alerts WHERE id = ?').get(firstId) as any
    const second = db.prepare('SELECT status FROM alerts WHERE id = ?').get(secondId) as any
    expect(first.status).toBe('pending')
    expect(first.remark).toBeNull()
    expect(second.status).toBe('processed')
  })

  it('ALERT-004: 旧 handle 端点仍兼容处理预警', async () => {
    const alertId = seedAlert(db, `handle-${Date.now()}`)

    const res = await request(app)
      .post(`/api/v1/alerts/${alertId}/handle`)
      .set('Authorization', `Bearer ${token}`)
      .send({ action: 'ignored', remark: '旧端点兼容' })

    expect(res.status).toBe(200)
    const alert = db.prepare('SELECT status, handled_by, remark FROM alerts WHERE id = ?').get(alertId) as any
    expect(alert.status).toBe('ignored')
    expect(alert.handled_by).toBe('admin')
    expect(alert.remark).toBe('旧端点兼容')
    const opLog = latestOperationLog(db, 'POST /alerts/:id/handle', alertId)
    expect(opLog).toMatchObject({ username: 'admin', description: '忽略预警' })
    expect(JSON.parse(opLog.request_data)).toMatchObject({ module: 'alerts', alertIds: [alertId], action: 'ignored' })
  })

  it('ALERT-005: 历史查询返回已处理和已忽略预警，不混入待处理', async () => {
    const stamp = Date.now()
    const pendingId = seedAlert(db, `history-pending-${stamp}`)
    const processedId = seedAlert(db, `history-processed-${stamp}`, 'processed')
    const ignoredId = seedAlert(db, `history-ignored-${stamp}`, 'ignored')
    const autoResolvedId = seedAlert(db, `history-auto-${stamp}`, 'auto_resolved')
    const dismissedId = seedAlert(db, `history-dismissed-${stamp}`, 'dismissed')
    const handledId = seedAlert(db, `history-handled-${stamp}`, 'handled')

    const res = await request(app)
      .get('/api/v1/alerts')
      .query({ status: 'processed,ignored,auto_resolved,dismissed,handled', keyword: `history-` })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const ids = res.body.data.list.map((alert: any) => alert.id)
    expect(ids).toContain(processedId)
    expect(ids).toContain(ignoredId)
    expect(ids).toContain(autoResolvedId)
    expect(ids).toContain(dismissedId)
    expect(ids).toContain(handledId)
    expect(ids).not.toContain(pendingId)
  })

  it('ALERT-006: 统计接口按筛选条件返回全量状态口径', async () => {
    const stamp = Date.now()
    const keyword = String(stamp)
    seedAlert(db, `stats-pending-${stamp}`)
    seedAlert(db, `stats-processed-${stamp}`, 'processed')
    seedAlert(db, `stats-ignored-${stamp}`, 'ignored')
    seedAlert(db, `stats-auto-${stamp}`, 'auto_resolved')
    seedAlert(db, `stats-dismissed-${stamp}`, 'dismissed')

    const listRes = await request(app)
      .get('/api/v1/alerts')
      .query({ keyword, page: 1, pageSize: 1 })
      .set('Authorization', `Bearer ${token}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.total).toBeGreaterThanOrEqual(5)
    expect(listRes.body.data.list).toHaveLength(1)

    const statsRes = await request(app)
      .get('/api/v1/alerts/stats')
      .query({ keyword })
      .set('Authorization', `Bearer ${token}`)

    expect(statsRes.status).toBe(200)
    expect(statsRes.body.data.pending).toBeGreaterThanOrEqual(1)
    expect(statsRes.body.data.processed).toBeGreaterThanOrEqual(2)
    expect(statsRes.body.data.ignored).toBeGreaterThanOrEqual(2)
    expect(statsRes.body.data.today).toBeGreaterThanOrEqual(5)
    expect(statsRes.body.data.month).toBeGreaterThanOrEqual(5)

    const historyStats = await request(app)
      .get('/api/v1/alerts/stats')
      .query({ keyword, status: 'processed,ignored,auto_resolved,dismissed,handled' })
      .set('Authorization', `Bearer ${token}`)

    expect(historyStats.status).toBe(200)
    expect(historyStats.body.data.pending).toBe(0)
    expect(historyStats.body.data.processed).toBeGreaterThanOrEqual(2)
    expect(historyStats.body.data.ignored).toBeGreaterThanOrEqual(2)
  })

  it('ALERT-008: 低库存扫描生成待处理预警，处理后进入历史并保留处理信息', async () => {
    const stamp = Date.now()
    const { materialId } = seedLowStockMaterial(db, `generate-${stamp}`)

    const generate = await request(app)
      .post('/api/v1/alerts/generate')
      .set('Authorization', `Bearer ${token}`)

    expect(generate.status).toBe(200)
    expect(generate.body.data.generatedCount).toBeGreaterThanOrEqual(1)

    const pending = await request(app)
      .get('/api/v1/alerts')
      .query({ keyword: `generate-${stamp}`, status: 'pending' })
      .set('Authorization', `Bearer ${token}`)

    expect(pending.status).toBe(200)
    expect(pending.body.data.list).toHaveLength(1)
    expect(pending.body.data.list[0]).toMatchObject({
      type: 'low-stock',
      materialId,
      status: 'pending',
      currentStock: 2,
      threshold: 5, // P0-04：有效阈值优先取 min_stock(5)，非 safety_stock(6)
    })

    const alertId = pending.body.data.list[0].id
    const process = await request(app)
      .post(`/api/v1/alerts/${alertId}/process`)
      .set('Authorization', `Bearer ${token}`)
      .send({ remark: '处理结论：采购跟进中\n处理意见：已创建补货任务' })
    expect(process.status).toBe(200)

    const history = await request(app)
      .get('/api/v1/alerts')
      .query({ keyword: `generate-${stamp}`, status: 'processed,ignored,auto_resolved,dismissed,handled' })
      .set('Authorization', `Bearer ${token}`)

    expect(history.status).toBe(200)
    expect(history.body.data.list).toHaveLength(1)
    expect(history.body.data.list[0]).toMatchObject({
      id: alertId,
      status: 'processed',
      handledBy: 'admin',
      remark: '处理结论：采购跟进中\n处理意见：已创建补货任务',
    })
    expect(history.body.data.list[0].handledAt).toBeTruthy()
    const generateLog = latestOperationLog(db, 'POST /alerts/generate')
    expect(generateLog).toMatchObject({ username: 'admin', description: '手动生成预警' })
    expect(JSON.parse(generateLog.response_data).generatedCount).toBeGreaterThanOrEqual(1)
  })

  it('ALERT-LOWSTOCK-MINSTOCK（P0-04）: 仅设 min_stock（safety_stock=0）也必须触发低库存预警', async () => {
    // 这是双轨割裂的核心场景：用户在"安全库存"栏设阈值（落 min_stock），safety_stock 留默认 0。
    // 修复前引擎只读 safety_stock(0) → 永不触发（库存跌破却无告警）；修复后按有效阈值=min_stock 触发。
    const stamp = Date.now()
    const suffix = `minstock-${stamp}`
    const categoryId = `cat-alert-${suffix}`
    const materialId = `mat-alert-min-${suffix}`
    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
      .run(categoryId, `CAT-ALERT-${suffix}`, '低库存阈值测试分类', 1)
    db.prepare(`INSERT INTO materials (id, code, name, spec, unit, category_id, min_stock, safety_stock)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(materialId, `MAT-ALERT-${suffix}`, `仅min_stock预警物料-${suffix}`, '1ml', '瓶', categoryId, 10, 0)
    db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock) VALUES (?, ?, ?, 0)')
      .run(`inv-alert-${suffix}`, materialId, 3)

    const generate = await request(app)
      .post('/api/v1/alerts/generate')
      .set('Authorization', `Bearer ${token}`)
    expect(generate.status).toBe(200)

    const pending = await request(app)
      .get('/api/v1/alerts')
      .query({ keyword: suffix, status: 'pending' })
      .set('Authorization', `Bearer ${token}`)
    expect(pending.status).toBe(200)
    expect(pending.body.data.list).toHaveLength(1)
    expect(pending.body.data.list[0]).toMatchObject({
      type: 'low-stock',
      materialId,
      currentStock: 3,
      threshold: 10, // 有效阈值取 min_stock
    })
  })

  it('ALERT-STAGNANT-001（P1-09）: 有库存且超阈值天数无出库的物料生成呆滞预警（此前空壳）', async () => {
    const stamp = Date.now()
    const suffix = `stagnant-${stamp}`
    const categoryId = `cat-${suffix}`
    const materialId = `mat-${suffix}`
    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, ?)')
      .run(categoryId, `CAT-${suffix}`, '呆滞测试分类', 1)
    db.prepare('INSERT INTO materials (id, code, name, spec, unit, category_id, min_stock, safety_stock) VALUES (?, ?, ?, ?, ?, ?, 0, 0)')
      .run(materialId, `MAT-${suffix}`, `呆滞物料-${suffix}`, '1ml', '瓶', categoryId)
    db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock) VALUES (?, ?, ?, 0)')
      .run(`inv-${suffix}`, materialId, 20)
    // 在库批次到货于很久以前（>90 天），且该物料从无出库 → 呆滞
    db.prepare("INSERT INTO batches (id, material_id, batch_no, quantity, remaining, inbound_id, inbound_price, status, created_at) VALUES (?, ?, ?, 20, 20, ?, 10, 1, '2020-01-01 00:00:00')")
      .run(`batch-${suffix}`, materialId, `B-${suffix}`, `inb-${suffix}`)

    const generate = await request(app).post('/api/v1/alerts/generate').set('Authorization', `Bearer ${token}`)
    expect(generate.status).toBe(200)

    const pending = await request(app)
      .get('/api/v1/alerts')
      .query({ keyword: suffix, status: 'pending' })
      .set('Authorization', `Bearer ${token}`)
    expect(pending.status).toBe(200)
    const stagnant = pending.body.data.list.find((a: any) => a.type === 'stagnant' && a.materialId === materialId)
    expect(stagnant).toBeTruthy()
    expect(stagnant.currentStock).toBe(20)
  })

  it('ALERT-016: 有效期扫描按批次生成预警并返回来源事实', async () => {
    const stamp = Date.now()
    const { materialId, batchNos, emptyBatchNo } = seedExpiringBatches(db, `expiry-${stamp}`)

    const generate = await request(app)
      .post('/api/v1/alerts/generate')
      .set('Authorization', `Bearer ${token}`)

    expect(generate.status).toBe(200)
    expect(generate.body.data.generatedCount).toBeGreaterThanOrEqual(2)

    const pending = await request(app)
      .get('/api/v1/alerts')
      .query({ keyword: `临期预警物料-expiry-${stamp}`, type: 'expiry', status: 'pending', pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)

    expect(pending.status).toBe(200)
    expect(pending.body.data.list).toHaveLength(2)
    const rows = pending.body.data.list
    const returnedBatchNos = rows.map((row: any) => row.batchNo).sort()
    expect(returnedBatchNos).toEqual([...batchNos].sort())
    expect(returnedBatchNos).not.toContain(emptyBatchNo)
    for (const row of rows) {
      expect(row).toMatchObject({
        type: 'expiry',
        materialId,
        ruleId: 'RULE-002',
        status: 'pending',
      })
      expect(row.batchId).toBeTruthy()
      expect(row.triggerCondition).toContain(row.batchNo)
    }

    const secondGenerate = await request(app)
      .post('/api/v1/alerts/generate')
      .set('Authorization', `Bearer ${token}`)
    expect(secondGenerate.status).toBe(200)

    const afterSecondGenerate = await request(app)
      .get('/api/v1/alerts')
      .query({ keyword: `临期预警物料-expiry-${stamp}`, type: 'expiry', status: 'pending', pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)
    expect(afterSecondGenerate.status).toBe(200)
    expect(afterSecondGenerate.body.data.list).toHaveLength(2)
  })

  it('ALERT-AUDIT-001: 批量处理预警写入操作日志并保留处理对象', async () => {
    const stamp = Date.now()
    const firstId = seedAlert(db, `batch-audit-a-${stamp}`)
    const secondId = seedAlert(db, `batch-audit-b-${stamp}`)

    const res = await request(app)
      .post('/api/v1/alerts/batch/handle')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId], action: 'processed', remark: '批量补货完成' })

    expect(res.status).toBe(200)
    const opLog = latestOperationLog(db, 'POST /alerts/batch/handle', firstId)
    expect(opLog).toMatchObject({ username: 'admin', description: '批量处理预警' })
    expect(JSON.parse(opLog.request_data)).toMatchObject({
      module: 'alerts',
      alertIds: [firstId, secondId],
      action: 'processed',
      remark: '批量补货完成',
    })
    expect(JSON.parse(opLog.response_data)).toMatchObject({ handledCount: 2 })
  })

  it('ALERT-RULE-001: 预警规则拒绝非有限阈值且不更新原规则', async () => {
    const beforeLowStock = db.prepare('SELECT threshold, threshold_days FROM alert_rules WHERE id = ?')
      .get('RULE-001') as any
    const beforeExpiry = db.prepare('SELECT threshold, threshold_days FROM alert_rules WHERE id = ?')
      .get('RULE-002') as any

    const invalidThreshold = await request(app)
      .put('/api/v1/alerts/rules/RULE-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ threshold: 'Infinity' })

    const invalidThresholdDays = await request(app)
      .put('/api/v1/alerts/rules/RULE-002')
      .set('Authorization', `Bearer ${token}`)
      .send({ thresholdDays: '1e309' })

    expect(invalidThreshold.status).toBe(400)
    expect(invalidThreshold.body.error.message).toContain('threshold')
    expect(invalidThresholdDays.status).toBe(400)
    expect(invalidThresholdDays.body.error.message).toContain('thresholdDays')

    const afterLowStock = db.prepare('SELECT threshold, threshold_days FROM alert_rules WHERE id = ?')
      .get('RULE-001') as any
    const afterExpiry = db.prepare('SELECT threshold, threshold_days FROM alert_rules WHERE id = ?')
      .get('RULE-002') as any
    expect(afterLowStock).toMatchObject(beforeLowStock)
    expect(afterExpiry).toMatchObject(beforeExpiry)
  })

  it('ALERT-RULE-002: 更新预警规则写入操作日志', async () => {
    const res = await request(app)
      .put('/api/v1/alerts/rules/RULE-001')
      .set('Authorization', `Bearer ${token}`)
      .send({ threshold: 8, enabled: true })

    expect(res.status).toBe(200)
    const opLog = latestOperationLog(db, 'PUT /alerts/rules/:id')
    expect(opLog).toMatchObject({ username: 'admin', description: '更新预警规则' })
    expect(JSON.parse(opLog.request_data)).toMatchObject({
      module: 'alerts',
      ruleId: 'RULE-001',
      threshold: 8,
      enabled: true,
    })
  })

  it('ALERT-013: 列表支持按规范级别筛选 urgent 预警', async () => {
    const stamp = Date.now()
    const dangerId = `alert-level-danger-${stamp}`
    const warningId = `alert-level-warning-${stamp}`

    db.prepare(`
      INSERT INTO alerts (id, type, level, material_id, material_name, current_stock, threshold, message, status)
      VALUES
        (?, 'expiry', 'danger', ?, ?, 1, 5, ?, 'pending'),
        (?, 'low-stock', 'warning', ?, ?, 1, 5, ?, 'pending')
    `).run(
      dangerId, `mat-alert-danger-${stamp}`, `级别筛选紧急-${stamp}`, `紧急预警-${stamp}`,
      warningId, `mat-alert-warning-${stamp}`, `级别筛选重要-${stamp}`, `重要预警-${stamp}`,
    )

    const res = await request(app)
      .get('/api/v1/alerts')
      .query({ level: 'urgent', keyword: `级别筛选` })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const ids = res.body.data.list.map((alert: any) => alert.id)
    expect(ids).toContain(dangerId)
    expect(ids).not.toContain(warningId)
  })

  it('ALERT-014: 列表和统计拒绝非法状态、类型和级别筛选', async () => {
    const invalidListStatus = await request(app)
      .get('/api/v1/alerts')
      .query({ status: 'archived' })
      .set('Authorization', `Bearer ${token}`)

    const invalidListType = await request(app)
      .get('/api/v1/alerts')
      .query({ type: 'ghost' })
      .set('Authorization', `Bearer ${token}`)

    const invalidStatsLevel = await request(app)
      .get('/api/v1/alerts/stats')
      .query({ level: 'critical' })
      .set('Authorization', `Bearer ${token}`)

    expect(invalidListStatus.status).toBe(400)
    expect(invalidListStatus.body.error.code).toBe('INVALID_PARAMETER')
    expect(invalidListType.status).toBe(400)
    expect(invalidListType.body.error.code).toBe('INVALID_PARAMETER')
    expect(invalidStatsLevel.status).toBe(400)
    expect(invalidStatsLevel.body.error.code).toBe('INVALID_PARAMETER')
  })

  it('ALERT-015: 列表和统计拒绝非法日期范围筛选', async () => {
    const invalidStartDate = await request(app)
      .get('/api/v1/alerts')
      .query({ startDate: '2026-02-30' })
      .set('Authorization', `Bearer ${token}`)

    const invalidEndDate = await request(app)
      .get('/api/v1/alerts/stats')
      .query({ endDate: 'not-a-date' })
      .set('Authorization', `Bearer ${token}`)

    const reversedRange = await request(app)
      .get('/api/v1/alerts')
      .query({ startDate: '2026-06-30', endDate: '2026-06-01' })
      .set('Authorization', `Bearer ${token}`)

    expect(invalidStartDate.status).toBe(400)
    expect(invalidStartDate.body.error.code).toBe('INVALID_PARAMETER')
    expect(invalidEndDate.status).toBe(400)
    expect(invalidEndDate.body.error.code).toBe('INVALID_PARAMETER')
    expect(reversedRange.status).toBe(400)
    expect(reversedRange.body.error.code).toBe('INVALID_PARAMETER')
  })

  it('ALERT-009: 非处理角色不能处理、忽略、批量处理或手动扫描预警', async () => {
    const techToken = await loginRole(app, 'zhangwei')
    const firstId = seedAlert(db, `forbidden-a-${Date.now()}`)
    const secondId = seedAlert(db, `forbidden-b-${Date.now()}`)

    const process = await request(app)
      .post(`/api/v1/alerts/${firstId}/process`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ remark: '越权处理' })
    expect(process.status).toBe(403)

    const ignore = await request(app)
      .post(`/api/v1/alerts/${firstId}/ignore`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ remark: '越权忽略' })
    expect(ignore.status).toBe(403)

    const batch = await request(app)
      .post('/api/v1/alerts/batch/handle')
      .set('Authorization', `Bearer ${techToken}`)
      .send({ ids: [firstId, secondId], action: 'processed' })
    expect(batch.status).toBe(403)

    const generate = await request(app)
      .post('/api/v1/alerts/generate')
      .set('Authorization', `Bearer ${techToken}`)
    expect(generate.status).toBe(403)

    const rows = db.prepare(`SELECT id, status, handled_by FROM alerts WHERE id IN (?, ?) ORDER BY id`)
      .all(firstId, secondId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.status === 'pending')).toBe(true)
    expect(rows.every(row => row.handled_by == null)).toBe(true)
  })
})
