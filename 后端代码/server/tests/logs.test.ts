process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

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
    db.prepare('UPDATE operation_logs SET created_at = ? WHERE id = ?').run('2026-01-01 00:00:00', oldId)
    db.prepare('UPDATE operation_logs SET created_at = ? WHERE id = ?').run('2026-03-01 12:00:00', boundaryDayId)
    db.prepare('UPDATE operation_logs SET created_at = ? WHERE id = ?').run('2026-06-17T00:00:00', newId)

    const cleaned = await request(app)
      .delete('/api/v1/logs')
      .query({ beforeDate: '2026-03-01' })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(cleaned.status).toBe(200)
    expect(cleaned.body.data.deletedCount).toBe(1)

    const oldRow = db.prepare('SELECT 1 FROM operation_logs WHERE id = ?').get(oldId)
    const boundaryDayRow = db.prepare('SELECT 1 FROM operation_logs WHERE id = ?').get(boundaryDayId)
    const newRow = db.prepare('SELECT 1 FROM operation_logs WHERE id = ?').get(newId)
    expect(oldRow).toBeUndefined()
    expect(boundaryDayRow).toBeTruthy()
    expect(newRow).toBeTruthy()
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
})
