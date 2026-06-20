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
  expect(res.body.success).toBe(true)
  return res.body.data.token
}

describe('标准工时 API', () => {
  let app: any
  let db: any
  let adminToken: string
  let technicianToken: string
  let warehouseToken: string
  let financeToken: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    adminToken = await login(app, 'admin', 'admin123')
    technicianToken = await login(app, 'zhangwei', 'CoreOne2026!')
    warehouseToken = await login(app, 'wangkq', 'CoreOne2026!')
    financeToken = await login(app, 'sunli', 'CoreOne2026!')
  })

  it('LT-001: admin/finance/technician/pathologist 可查询，仓库角色不可查询', async () => {
    const adminRes = await request(app)
      .get('/api/v1/labor-times?page=1&pageSize=10')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(adminRes.status).toBe(200)
    expect(adminRes.body.success).toBe(true)
    expect(Array.isArray(adminRes.body.data.list)).toBe(true)

    const techRes = await request(app)
      .get('/api/v1/labor-times?page=1&pageSize=10')
      .set('Authorization', `Bearer ${technicianToken}`)
    expect(techRes.status).toBe(200)

    const financeRes = await request(app)
      .get('/api/v1/labor-times?page=1&pageSize=10')
      .set('Authorization', `Bearer ${financeToken}`)
    expect(financeRes.status).toBe(200)

    const forbiddenRes = await request(app)
      .get('/api/v1/labor-times?page=1&pageSize=10')
      .set('Authorization', `Bearer ${warehouseToken}`)
    expect(forbiddenRes.status).toBe(403)

    const noTokenRes = await request(app).get('/api/v1/labor-times?page=1&pageSize=10')
    expect(noTokenRes.status).toBe(401)
  })

  it('LT-002: 支持创建、筛选、详情、更新和删除工时定义', async () => {
    const suffix = Date.now()
    const stepCode = `STEP-${suffix}`

    const createRes = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stepCode,
        stepName: 'Vitest测试步骤',
        projectType: 'IHC',
        standardMinutes: 15,
        laborRatePerMinute: 2.5,
        referenceSource: 'system',
      })

    expect(createRes.status).toBe(201)
    expect(createRes.body.success).toBe(true)
    const id = createRes.body.data.id

    const listRes = await request(app)
      .get(`/api/v1/labor-times?page=1&pageSize=10&projectType=ihc&keyword=${stepCode}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(listRes.status).toBe(200)
    expect(listRes.body.data.list.some((row: any) => row.id === id)).toBe(true)

    const detailRes = await request(app)
      .get(`/api/v1/labor-times/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(detailRes.status).toBe(200)
    expect(detailRes.body.data.stepCode).toBe(stepCode)
    expect(detailRes.body.data.projectType).toBe('ihc')
    expect(detailRes.body.data.referenceSource).toBe('system')
    expect(detailRes.body.data.referenceSourceLabel).toBe('系统预设')

    const updateRes = await request(app)
      .put(`/api/v1/labor-times/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stepName: 'Vitest更新步骤', standardMinutes: 20 })

    expect(updateRes.status).toBe(200)
    const updated = db.prepare('SELECT step_name, standard_minutes FROM standard_labor_times WHERE id = ?').get(id) as any
    expect(updated.step_name).toBe('Vitest更新步骤')
    expect(updated.standard_minutes).toBe(20)

    const templateRes = await request(app)
      .get('/api/v1/labor-times/project-type/IHC')
      .set('Authorization', `Bearer ${adminToken}`)

    expect(templateRes.status).toBe(200)
    expect(Array.isArray(templateRes.body.data)).toBe(true)
    const templateRow = templateRes.body.data.find((row: any) => row.id === id)
    expect(templateRow?.referenceSource).toBe('system')
    expect(templateRow?.referenceSourceLabel).toBe('系统预设')

    const deleteRes = await request(app)
      .delete(`/api/v1/labor-times/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)

    expect(deleteRes.status).toBe(200)
    const removed = db.prepare('SELECT id FROM standard_labor_times WHERE id = ?').get(id)
    expect(removed).toBeUndefined()
  })

  it('LT-003: 必填校验和不存在资源返回明确错误', async () => {
    const missingRequiredRes = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stepName: '缺少编码', projectType: 'IHC', standardMinutes: 10 })

    expect(missingRequiredRes.status).toBe(400)

    const invalidMinutesRes = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stepCode: `INVALID-MINUTES-${Date.now()}`,
        stepName: '非法时长',
        projectType: 'ihc',
        standardMinutes: 0,
        laborRatePerMinute: 1,
      })
    expect(invalidMinutesRes.status).toBe(400)

    const invalidRateRes = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stepCode: `INVALID-RATE-${Date.now()}`,
        stepName: '非法费率',
        projectType: 'ihc',
        standardMinutes: 10,
        laborRatePerMinute: -1,
      })
    expect(invalidRateRes.status).toBe(400)

    const invalidProjectTypeRes = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stepCode: `INVALID-PROJECT-${Date.now()}`,
        stepName: '非法项目类型',
        projectType: 'unknown',
        standardMinutes: 10,
        laborRatePerMinute: 1,
      })
    expect(invalidProjectTypeRes.status).toBe(400)

    const invalidSourceRes = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stepCode: `INVALID-SOURCE-${Date.now()}`,
        stepName: '非法来源',
        projectType: 'ihc',
        standardMinutes: 10,
        laborRatePerMinute: 1,
        referenceSource: 'manual',
      })
    expect(invalidSourceRes.status).toBe(400)

    const detailRes = await request(app)
      .get('/api/v1/labor-times/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(detailRes.status).toBe(404)

    const updateRes = await request(app)
      .put('/api/v1/labor-times/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stepName: '不存在' })
    expect(updateRes.status).toBe(404)

    const deleteRes = await request(app)
      .delete('/api/v1/labor-times/non-existent-id')
      .set('Authorization', `Bearer ${adminToken}`)
    expect(deleteRes.status).toBe(404)
  })

  it('LT-004: 统计接口按筛选条件返回全量口径', async () => {
    const suffix = Date.now()
    await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stepCode: `STAT-IHC-${suffix}`,
        stepName: '统计免疫步骤',
        projectType: 'ihc',
        standardMinutes: 10,
        laborRatePerMinute: 2,
        isEquipmentStep: true,
        referenceSource: 'industry',
      })
    await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stepCode: `STAT-HE-${suffix}`,
        stepName: '统计HE步骤',
        projectType: 'he',
        standardMinutes: 30,
        laborRatePerMinute: 4,
        isEquipmentStep: false,
        referenceSource: 'industry',
      })

    const stats = await request(app)
      .get('/api/v1/labor-times/stats')
      .query({ keyword: `STAT-`, referenceSource: 'industry' })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(stats.status).toBe(200)
    expect(stats.body.data.total).toBeGreaterThanOrEqual(2)
    expect(stats.body.data.totalMinutes).toBeGreaterThanOrEqual(40)
    expect(stats.body.data.avgRate).toBeGreaterThanOrEqual(3)
    expect(stats.body.data.equipmentSteps).toBeGreaterThanOrEqual(1)

    const ihcStats = await request(app)
      .get('/api/v1/labor-times/stats')
      .query({ keyword: `STAT-IHC-${suffix}`, projectType: 'ihc' })
      .set('Authorization', `Bearer ${adminToken}`)

    expect(ihcStats.status).toBe(200)
    expect(ihcStats.body.data.total).toBe(1)
    expect(ihcStats.body.data.totalMinutes).toBe(10)
    expect(ihcStats.body.data.equipmentSteps).toBe(1)
  })

  it('LT-AUTH-001: 技术员只能查看标准工时，不能维护成本参数', async () => {
    const suffix = Date.now()

    const createByTechnician = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({
        stepCode: `TECH-LAB-${suffix}`,
        stepName: '技术员越权创建',
        projectType: 'ihc',
        standardMinutes: 12,
        laborRatePerMinute: 2,
      })
    expect(createByTechnician.status).toBe(403)

    const createByAdmin = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stepCode: `ADMIN-LAB-${suffix}`,
        stepName: '管理员创建',
        projectType: 'ihc',
        standardMinutes: 12,
        laborRatePerMinute: 2,
      })
    expect(createByAdmin.status).toBe(201)
    const id = createByAdmin.body.data.id

    const updateByTechnician = await request(app)
      .put(`/api/v1/labor-times/${id}`)
      .set('Authorization', `Bearer ${technicianToken}`)
      .send({ laborRatePerMinute: 99 })
    expect(updateByTechnician.status).toBe(403)

    const deleteByTechnician = await request(app)
      .delete(`/api/v1/labor-times/${id}`)
      .set('Authorization', `Bearer ${technicianToken}`)
    expect(deleteByTechnician.status).toBe(403)

    const unchanged = db.prepare('SELECT labor_rate_per_minute FROM standard_labor_times WHERE id = ?').get(id) as any
    expect(unchanged.labor_rate_per_minute).toBe(2)
  })

  it('LT-AUTH-002: 财务可维护标准工时成本参数', async () => {
    const suffix = Date.now()
    const stepCode = `FIN-LAB-${suffix}`

    const createByFinance = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        stepCode,
        stepName: '财务维护人工成本',
        projectType: 'ihc',
        standardMinutes: 18,
        laborRatePerMinute: 3,
        referenceSource: 'industry',
      })

    expect(createByFinance.status).toBe(201)
    const id = createByFinance.body.data.id

    const updateByFinance = await request(app)
      .put(`/api/v1/labor-times/${id}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ stepName: '财务更新人工成本', standardMinutes: 20, laborRatePerMinute: 3.5 })

    expect(updateByFinance.status).toBe(200)
    const updated = db.prepare('SELECT step_name, standard_minutes, labor_rate_per_minute FROM standard_labor_times WHERE id = ?').get(id) as any
    expect(updated.step_name).toBe('财务更新人工成本')
    expect(updated.standard_minutes).toBe(20)
    expect(updated.labor_rate_per_minute).toBe(3.5)

    const deleteByFinance = await request(app)
      .delete(`/api/v1/labor-times/${id}`)
      .set('Authorization', `Bearer ${financeToken}`)

    expect(deleteByFinance.status).toBe(200)
    const removed = db.prepare('SELECT id FROM standard_labor_times WHERE id = ?').get(id)
    expect(removed).toBeUndefined()
  })

  it('LT-CODE-001: 标准工时步骤编号和项目类型创建后不允许修改', async () => {
    const suffix = Date.now()
    const stepCode = `LOCK-LAB-${suffix}`

    const createRes = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${financeToken}`)
      .send({
        stepCode,
        stepName: '锁定身份字段',
        projectType: 'ihc',
        standardMinutes: 15,
        laborRatePerMinute: 2,
      })
    expect(createRes.status).toBe(201)
    const id = createRes.body.data.id

    const codeChange = await request(app)
      .put(`/api/v1/labor-times/${id}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ stepCode: `${stepCode}-CHANGED`, stepName: '尝试改编号' })
    expect(codeChange.status).toBe(400)
    expect(codeChange.body.error.message).toBe('步骤编号创建后不允许修改')

    const typeChange = await request(app)
      .put(`/api/v1/labor-times/${id}`)
      .set('Authorization', `Bearer ${financeToken}`)
      .send({ projectType: 'he', stepName: '尝试改类型' })
    expect(typeChange.status).toBe(400)
    expect(typeChange.body.error.message).toBe('项目类型创建后不允许修改')

    const unchanged = db.prepare('SELECT step_code, project_type, step_name FROM standard_labor_times WHERE id = ?').get(id) as any
    expect(unchanged.step_code).toBe(stepCode)
    expect(unchanged.project_type).toBe('ihc')
    expect(unchanged.step_name).toBe('锁定身份字段')
  })

  it('LT-TEXT-001: 创建和更新标准工时时拦截危险文本并保存清理后的展示文本', async () => {
    const suffix = Date.now()

    const blockedCreate = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stepCode: `LT-DIRTY-${suffix}`,
        stepName: '<script>alert(1)</script>',
        projectType: 'ihc',
        standardMinutes: 12,
        laborRatePerMinute: 2,
      })

    expect(blockedCreate.status).toBe(400)
    expect(blockedCreate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const dirtyCount = (db.prepare('SELECT COUNT(*) as count FROM standard_labor_times WHERE step_code = ?')
      .get(`LT-DIRTY-${suffix}`) as any)?.count || 0
    expect(Number(dirtyCount)).toBe(0)

    const safeCreate = await request(app)
      .post('/api/v1/labor-times')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stepCode: `  LT-SAFE-${suffix}  `,
        stepName: '  安全 工时 步骤  ',
        description: '  标准 操作 说明  ',
        projectType: 'IHC',
        standardMinutes: 12,
        laborRatePerMinute: 2,
        referenceSource: 'system',
      })

    expect(safeCreate.status).toBe(201)
    const id = safeCreate.body.data.id
    const persisted = db.prepare('SELECT step_code, step_name, description, project_type FROM standard_labor_times WHERE id = ?')
      .get(id) as any
    expect(persisted).toMatchObject({
      step_code: `LT-SAFE-${suffix}`,
      step_name: '安全 工时 步骤',
      description: '标准 操作 说明',
      project_type: 'ihc',
    })

    const blockedUpdate = await request(app)
      .put(`/api/v1/labor-times/${id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ description: "' OR '1'='1" })

    expect(blockedUpdate.status).toBe(400)
    expect(blockedUpdate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const unchanged = db.prepare('SELECT description FROM standard_labor_times WHERE id = ?').get(id) as any
    expect(unchanged.description).toBe('标准 操作 说明')
  })
})
