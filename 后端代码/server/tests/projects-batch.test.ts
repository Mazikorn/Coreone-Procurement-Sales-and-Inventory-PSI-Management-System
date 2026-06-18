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

async function createProject(app: any, token: string, suffix: string, extra: Record<string, unknown> = {}) {
  const res = await request(app)
    .post('/api/v1/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({
      code: `PRJ-BATCH-${suffix}`,
      name: `批量项目-${suffix}`,
      type: 'he',
      ...extra,
    })
  expect(res.status).toBe(201)
  return res.body.data.id as string
}

describe('检测项目批量操作', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('PRJ-BATCH-001: 批量状态遇到不存在项目时整批拒绝，不部分更新', async () => {
    const suffix = `missing-${Date.now()}`
    const firstId = await createProject(app, token, `${suffix}-1`)
    const secondId = await createProject(app, token, `${suffix}-2`)

    const res = await request(app)
      .patch('/api/v1/projects/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId, `missing-${suffix}`], status: 'inactive' })

    expect(res.status).toBe(404)
    const rows = db.prepare('SELECT id, status FROM projects WHERE id IN (?, ?)')
      .all(firstId, secondId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.status) === 1)).toBe(true)
  })

  it('PRJ-BATCH-002: 批量状态有效时一次更新所有选中项目', async () => {
    const suffix = `valid-${Date.now()}`
    const firstId = await createProject(app, token, `${suffix}-1`)
    const secondId = await createProject(app, token, `${suffix}-2`)

    const res = await request(app)
      .patch('/api/v1/projects/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [firstId, secondId], status: 'inactive' })

    expect(res.status).toBe(200)
    expect(res.body.data.updatedCount).toBe(2)
    const rows = db.prepare('SELECT id, status FROM projects WHERE id IN (?, ?)')
      .all(firstId, secondId) as any[]
    expect(rows.every(row => Number(row.status) === 0)).toBe(true)
  })

  it('PRJ-BATCH-003: 批量启用遇到绑定停用BOM的项目时整批拒绝', async () => {
    const suffix = `activate-inactive-bom-${Date.now()}`
    const bomId = `bom-prj-activate-inactive-${suffix}`
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 0)')
      .run(bomId, `BOM-PRJ-ACT-INACTIVE-${suffix}`, '批量启用停用BOM', 'v1.0', 'he')
    const freeProjectId = await createProject(app, token, `${suffix}-free`, { status: 'inactive' })
    const blockedProjectId = `prj-activate-inactive-bom-${suffix}`
    db.prepare(`
      INSERT INTO projects (id, code, name, type, status, bom_id)
      VALUES (?, ?, ?, ?, 0, ?)
    `).run(
      blockedProjectId,
      `PRJ-BATCH-${suffix}-blocked`,
      `批量启用停用BOM项目-${suffix}`,
      'he',
      bomId,
    )

    const res = await request(app)
      .patch('/api/v1/projects/batch-status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [freeProjectId, blockedProjectId], status: 'active' })

    expect(res.status).toBe(409)
    const rows = db.prepare('SELECT id, status, bom_id FROM projects WHERE id IN (?, ?)')
      .all(freeProjectId, blockedProjectId) as any[]
    expect(rows).toHaveLength(2)
    expect(rows.every(row => Number(row.status) === 0)).toBe(true)
    const blocked = rows.find(row => row.id === blockedProjectId)
    expect(blocked.bom_id).toBe(bomId)
  })

  it('PRJ-STATS-001: 项目统计和BOM配置筛选使用后端全量口径', async () => {
    const suffix = `stats-${Date.now()}`
    const bomId = `bom-prj-stats-${suffix}`
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(bomId, `BOM-PRJ-STATS-${suffix}`, '项目统计BOM', 'v1.0', 'he')

    await createProject(app, token, `${suffix}-active`, { manager: `负责人-${suffix}` })
    await createProject(app, token, `${suffix}-inactive`, { status: 'inactive', manager: `负责人-${suffix}` })
    await createProject(app, token, `${suffix}-bom`, { bomId, manager: `负责人-${suffix}` })

    const unconfiguredList = await request(app)
      .get('/api/v1/projects')
      .query({ keyword: suffix, bomFilter: 'unconfigured', page: 1, pageSize: 1 })
      .set('Authorization', `Bearer ${token}`)

    expect(unconfiguredList.status).toBe(200)
    expect(unconfiguredList.body.data.total).toBe(2)
    expect(unconfiguredList.body.data.pagination.total).toBe(2)
    expect(unconfiguredList.body.data.list).toHaveLength(1)
    expect(unconfiguredList.body.data.list[0].bomId).toBeFalsy()

    const configuredList = await request(app)
      .get('/api/v1/projects')
      .query({ keyword: suffix, bomFilter: 'configured', page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)

    expect(configuredList.status).toBe(200)
    expect(configuredList.body.data.total).toBe(1)
    expect(configuredList.body.data.list[0].bomId).toBe(bomId)
    expect(configuredList.body.data.list[0].bomName).toBe('项目统计BOM')
    expect(configuredList.body.data.list[0].bomVersion).toBe('v1.0')

    const statsRes = await request(app)
      .get('/api/v1/projects/stats')
      .query({ keyword: suffix })
      .set('Authorization', `Bearer ${token}`)

    expect(statsRes.status).toBe(200)
    expect(statsRes.body.data).toMatchObject({
      total: 3,
      active: 2,
      inactive: 1,
      noBom: 2,
    })

    const allStatusList = await request(app)
      .get('/api/v1/projects')
      .query({ keyword: suffix, status: 'all', page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)

    expect(allStatusList.status).toBe(200)
    expect(allStatusList.body.data.total).toBe(3)
    expect(allStatusList.body.data.list.map((item: any) => item.status).sort()).toEqual([
      'active',
      'active',
      'inactive',
    ])

    const allStatusStats = await request(app)
      .get('/api/v1/projects/stats')
      .query({ keyword: suffix, status: 'all' })
      .set('Authorization', `Bearer ${token}`)

    expect(allStatusStats.status).toBe(200)
    expect(allStatusStats.body.data).toMatchObject({
      total: 3,
      active: 2,
      inactive: 1,
      noBom: 2,
    })
  })

  it('PRJ-BOM-000: 检测项目详情返回关联BOM名称和版本，支撑页面配置判断', async () => {
    const suffix = `bom-name-${Date.now()}`
    const bomId = `bom-prj-name-${suffix}`
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(bomId, `BOM-PRJ-NAME-${suffix}`, '详情可见BOM', 'v2.1', 'he')
    const projectId = await createProject(app, token, `${suffix}-project`, { bomId })

    const detail = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(detail.status).toBe(200)
    expect(detail.body.data).toMatchObject({
      bomId,
      bomName: '详情可见BOM',
      bomVersion: 'v2.1',
    })
  })

  it('PRJ-BOM-003: 检测项目列表和详情按BOM用量与当前库存实时计算可支撑样本数', async () => {
    const suffix = `support-${Date.now()}`
    const categoryId = `cat-prj-support-${suffix}`
    const firstMaterialId = `mat-prj-support-a-${suffix}`
    const secondMaterialId = `mat-prj-support-b-${suffix}`
    const bomId = `bom-prj-support-${suffix}`

    db.prepare('INSERT INTO material_categories (id, code, name, level) VALUES (?, ?, ?, 1)')
      .run(categoryId, `CAT-PRJ-SUPPORT-${suffix}`, '项目支撑能力分类')
    db.prepare('INSERT INTO materials (id, code, name, unit, category_id, price) VALUES (?, ?, ?, ?, ?, ?)')
      .run(firstMaterialId, `MAT-PRJ-SUPPORT-A-${suffix}`, '项目支撑物料A', '瓶', categoryId, 10)
    db.prepare('INSERT INTO materials (id, code, name, unit, category_id, price) VALUES (?, ?, ?, ?, ?, ?)')
      .run(secondMaterialId, `MAT-PRJ-SUPPORT-B-${suffix}`, '项目支撑物料B', '瓶', categoryId, 20)
    db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock) VALUES (?, ?, ?, ?)')
      .run(`inv-prj-support-a-${suffix}`, firstMaterialId, 10, 0)
    db.prepare('INSERT INTO inventory (id, material_id, stock, locked_stock) VALUES (?, ?, ?, ?)')
      .run(`inv-prj-support-b-${suffix}`, secondMaterialId, 12, 0)
    db.prepare('INSERT INTO boms (id, code, name, version, type, supportable_samples, status) VALUES (?, ?, ?, ?, ?, ?, 1)')
      .run(bomId, `BOM-PRJ-SUPPORT-${suffix}`, '实时支撑能力BOM', 'v1.0', 'he', 999)
    db.prepare('INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit) VALUES (?, ?, ?, ?, ?)')
      .run(`bi-prj-support-a-${suffix}`, bomId, firstMaterialId, 2, '瓶')
    db.prepare('INSERT INTO bom_items (id, bom_id, material_id, usage_per_sample, unit) VALUES (?, ?, ?, ?, ?)')
      .run(`bi-prj-support-b-${suffix}`, bomId, secondMaterialId, 3, '瓶')

    const projectId = await createProject(app, token, `${suffix}-project`, {
      bomId,
      supportableSamples: 999,
    })

    const list = await request(app)
      .get('/api/v1/projects')
      .query({ keyword: suffix, page: 1, pageSize: 10 })
      .set('Authorization', `Bearer ${token}`)

    expect(list.status).toBe(200)
    expect(list.body.data.list[0]).toMatchObject({
      id: projectId,
      bomId,
      supportableSamples: 4,
    })

    const detail = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(detail.status).toBe(200)
    expect(detail.body.data.supportableSamples).toBe(4)
  })

  it('PRJ-DELETE-001: 删除检测项目前返回BOM、LIS和出库引用并阻断删除', async () => {
    const suffix = `delete-refs-${Date.now()}`
    const projectId = await createProject(app, token, `${suffix}-project`)
    const bomId = `bom-prj-delete-${suffix}`
    const outboundId = `out-prj-delete-${suffix}`
    const caseId = `case-prj-delete-${suffix}`

    db.prepare('INSERT INTO boms (id, code, name, version, type, service_id, status) VALUES (?, ?, ?, ?, ?, ?, 1)')
      .run(bomId, `BOM-PRJ-DELETE-${suffix}`, '删除引用BOM', 'v1.0', 'he', projectId)
    db.prepare('UPDATE projects SET bom_id = ? WHERE id = ?').run(bomId, projectId)
    db.prepare("INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, operator, status) VALUES (?, ?, 'project', ?, 10, 1, 'admin', 'completed')")
      .run(outboundId, `OUT-PRJ-DELETE-${suffix}`, projectId)
    db.prepare('INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(caseId, `CASE-PRJ-DELETE-${suffix}`, projectId, `删除引用项目-${suffix}`, 'admin', '2026-06-18 10:00:00', 'normal')

    const check = await request(app)
      .get(`/api/v1/projects/${projectId}/check-deletable`)
      .set('Authorization', `Bearer ${token}`)

    expect(check.status).toBe(200)
    expect(check.body.data).toMatchObject({
      deletable: false,
      impacts: {
        bomCount: 1,
        serviceBomCount: 1,
        outboundCount: 1,
        lisCaseCount: 1,
      },
    })
    expect(check.body.data.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('BOM'),
        expect.stringContaining('出库'),
        expect.stringContaining('LIS'),
      ]),
    )

    const deleted = await request(app)
      .delete(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)

    expect(deleted.status).toBe(409)
    expect(db.prepare('SELECT is_deleted FROM projects WHERE id = ?').get(projectId) as any)
      .toMatchObject({ is_deleted: 0 })
    expect(db.prepare('SELECT service_id FROM boms WHERE id = ?').get(bomId) as any)
      .toMatchObject({ service_id: projectId })
  })

  it('PRJ-LIST-001: 引用数据请求不会被截断到前100条', async () => {
    const suffix = `refs-${Date.now()}`
    const insert = db.prepare('INSERT INTO projects (id, code, name, type, status) VALUES (?, ?, ?, ?, 1)')

    for (let i = 1; i <= 105; i += 1) {
      const padded = String(i).padStart(3, '0')
      insert.run(
        `prj-refs-${suffix}-${padded}`,
        `PRJ-REFS-${suffix}-${padded}`,
        `引用候选项目-${suffix}-${padded}`,
        'he',
      )
    }

    const res = await request(app)
      .get('/api/v1/projects')
      .query({ keyword: `引用候选项目-${suffix}`, page: 1, pageSize: 999, status: 'active' })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.data.total).toBe(105)
    expect(res.body.data.pagination.pageSize).toBe(999)
    expect(res.body.data.list).toHaveLength(105)
  })

  it('PRJ-TYPE-001: 创建和更新检测项目时拒绝页面选项以外的服务类型', async () => {
    const suffix = `type-${Date.now()}`
    const invalidCreate = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `PRJ-TYPE-BAD-${suffix}`,
        name: `非法类型项目-${suffix}`,
        type: 'unknown-type',
      })

    expect(invalidCreate.status).toBe(400)

    const projectId = await createProject(app, token, `${suffix}-valid`, { type: 'ihc' })
    const invalidUpdate = await request(app)
      .put(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `PRJ-BATCH-${suffix}-valid`,
        name: `非法类型更新-${suffix}`,
        type: 'molecular',
      })

    expect(invalidUpdate.status).toBe(400)
    const row = db.prepare('SELECT type FROM projects WHERE id = ?').get(projectId) as any
    expect(row.type).toBe('ihc')
  })

  it('PRJ-BOM-001: 创建检测项目时拒绝关联类型不匹配的BOM', async () => {
    const suffix = `bom-type-${Date.now()}`
    const bomId = `bom-prj-type-${suffix}`
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(bomId, `BOM-PRJ-TYPE-${suffix}`, '类型不匹配BOM', 'v1.0', 'ihc')

    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `PRJ-BOM-TYPE-${suffix}`,
        name: `类型不匹配项目-${suffix}`,
        type: 'he',
        bomId,
      })

    expect(res.status).toBe(422)
    expect(res.body.error?.code || res.body.code).toBe('BOM_PROJECT_TYPE_MISMATCH')
  })

  it('PRJ-BOM-002: 创建检测项目时拒绝关联停用BOM', async () => {
    const suffix = `bom-inactive-${Date.now()}`
    const bomId = `bom-prj-inactive-${suffix}`
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 0)')
      .run(bomId, `BOM-PRJ-INACTIVE-${suffix}`, '停用BOM', 'v1.0', 'he')

    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `PRJ-BOM-INACTIVE-${suffix}`,
        name: `停用BOM项目-${suffix}`,
        type: 'he',
        bomId,
      })

    expect(res.status).toBe(409)
  })

  it('PRJ-BOM-004: 更新检测项目类型时必须重新校验已绑定BOM类型', async () => {
    const suffix = `bom-update-type-${Date.now()}`
    const bomId = `bom-prj-update-type-${suffix}`
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 1)')
      .run(bomId, `BOM-PRJ-UP-TYPE-${suffix}`, '更新类型绑定BOM', 'v1.0', 'he')
    const projectId = await createProject(app, token, `${suffix}-project`, { type: 'he', bomId })

    const res = await request(app)
      .put(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `PRJ-BATCH-${suffix}-project`,
        name: `类型更新项目-${suffix}`,
        type: 'ihc',
      })

    expect(res.status).toBe(422)
    expect(res.body.error?.code || res.body.code).toBe('BOM_PROJECT_TYPE_MISMATCH')
    const row = db.prepare('SELECT type, bom_id FROM projects WHERE id = ?').get(projectId) as any
    expect(row).toMatchObject({ type: 'he', bom_id: bomId })
  })

  it('PRJ-STATUS-001: 更新检测项目状态必须拒绝页面选项以外的状态', async () => {
    const suffix = `status-update-${Date.now()}`
    const projectId = await createProject(app, token, `${suffix}-project`, { status: 'active' })

    const res = await request(app)
      .put(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `PRJ-BATCH-${suffix}-project`,
        name: `状态更新项目-${suffix}`,
        type: 'he',
        status: 'archived',
      })

    expect(res.status).toBe(400)
    expect(res.body.error.message).toContain('status')
    const row = db.prepare('SELECT status FROM projects WHERE id = ?').get(projectId) as any
    expect(Number(row.status)).toBe(1)
  })

  it('PRJ-STATUS-002: 检测项目停用前检查展示BOM、出库和LIS影响但允许停用', async () => {
    const suffix = `status-check-inactive-${Date.now()}`
    const projectId = await createProject(app, token, `${suffix}-project`, { status: 'active' })
    const bomId = `bom-prj-status-${suffix}`
    const outboundId = `out-prj-status-${suffix}`
    const caseId = `case-prj-status-${suffix}`

    db.prepare('INSERT INTO boms (id, code, name, version, type, service_id, status) VALUES (?, ?, ?, ?, ?, ?, 1)')
      .run(bomId, `BOM-PRJ-STATUS-${suffix}`, '状态影响BOM', 'v1.0', 'he', projectId)
    db.prepare('UPDATE projects SET bom_id = ? WHERE id = ?').run(bomId, projectId)
    db.prepare("INSERT INTO outbound_records (id, outbound_no, type, project_id, total_cost, sample_count, operator, status) VALUES (?, ?, 'project', ?, 20, 2, 'admin', 'completed')")
      .run(outboundId, `OUT-PRJ-STATUS-${suffix}`, projectId)
    db.prepare('INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(caseId, `CASE-PRJ-STATUS-${suffix}`, projectId, `状态影响项目-${suffix}`, 'admin', '2026-06-18 11:00:00', 'normal')

    const check = await request(app)
      .get(`/api/v1/projects/${projectId}/check-status`)
      .query({ status: 'inactive' })
      .set('Authorization', `Bearer ${token}`)

    expect(check.status).toBe(200)
    expect(check.body.data).toMatchObject({
      canChange: true,
      targetStatus: 'inactive',
      impacts: {
        bomCount: 1,
        outboundCount: 1,
        lisCaseCount: 1,
        invalidBomCount: 0,
      },
    })
    expect(check.body.data.warnings).toEqual(expect.arrayContaining([
      '停用后该检测服务不能用于新出库',
      '已有历史出库记录会保留',
      '已有LIS检测记录会保留',
    ]))

    const res = await request(app)
      .put(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `PRJ-BATCH-${suffix}-project`,
        name: `状态影响项目-${suffix}`,
        type: 'he',
        status: 'inactive',
      })

    expect(res.status).toBe(200)
    const row = db.prepare('SELECT status, bom_id FROM projects WHERE id = ?').get(projectId) as any
    expect(Number(row.status)).toBe(0)
    expect(row.bom_id).toBe(bomId)
  })

  it('PRJ-STATUS-003: 检测项目启用前检查必须阻断停用BOM绑定', async () => {
    const suffix = `status-check-active-${Date.now()}`
    const bomId = `bom-prj-status-active-${suffix}`
    const projectId = `prj-status-active-${suffix}`
    db.prepare('INSERT INTO boms (id, code, name, version, type, status) VALUES (?, ?, ?, ?, ?, 0)')
      .run(bomId, `BOM-PRJ-STATUS-ACTIVE-${suffix}`, '启用检查停用BOM', 'v1.0', 'he')
    db.prepare('INSERT INTO projects (id, code, name, type, status, bom_id) VALUES (?, ?, ?, ?, 0, ?)')
      .run(projectId, `PRJ-STATUS-ACTIVE-${suffix}`, `启用检查项目-${suffix}`, 'he', bomId)

    const check = await request(app)
      .get(`/api/v1/projects/${projectId}/check-status`)
      .query({ status: 'active' })
      .set('Authorization', `Bearer ${token}`)

    expect(check.status).toBe(200)
    expect(check.body.data).toMatchObject({
      canChange: false,
      targetStatus: 'active',
      impacts: {
        bomCount: 1,
        invalidBomCount: 1,
      },
    })
    expect(check.body.data.reasons).toEqual(expect.arrayContaining([
      '停用BOM不能关联到检测服务',
    ]))

    const res = await request(app)
      .put(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `PRJ-STATUS-ACTIVE-${suffix}`,
        name: `启用检查项目-${suffix}`,
        type: 'he',
        status: 'active',
      })

    expect(res.status).toBe(409)
    const row = db.prepare('SELECT status, bom_id FROM projects WHERE id = ?').get(projectId) as any
    expect(Number(row.status)).toBe(0)
    expect(row.bom_id).toBe(bomId)
  })

  it('PRJ-TEXT-001: 创建和更新检测项目时拦截危险文本并保存清理后的展示文本', async () => {
    const suffix = `text-${Date.now()}`

    const blockedCreate = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `PRJ-TEXT-BAD-${suffix}`,
        name: "' OR '1'='1",
        type: 'he',
      })

    expect(blockedCreate.status).toBe(400)
    expect(blockedCreate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const dirtyCount = (db.prepare('SELECT COUNT(*) as count FROM projects WHERE name = ?')
      .get("' OR '1'='1") as any).count
    expect(dirtyCount).toBe(0)

    const created = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `  PRJ-TEXT-${suffix}  `,
        name: `  B194 安全项目 ${suffix}  `,
        type: 'he',
        manager: '  李 四  ',
        cycle: '  3 天  ',
      })

    expect(created.status).toBe(201)
    const safeRow = db.prepare('SELECT code, name, manager, cycle FROM projects WHERE id = ?')
      .get(created.body.data.id) as any
    expect(safeRow).toMatchObject({
      code: `PRJ-TEXT-${suffix}`,
      name: `B194 安全项目 ${suffix}`,
      manager: '李 四',
      cycle: '3 天',
    })

    const blockedUpdate = await request(app)
      .put(`/api/v1/projects/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `PRJ-TEXT-${suffix}`,
        name: '<script>alert(1)</script>',
        type: 'he',
      })

    expect(blockedUpdate.status).toBe(400)
    expect(blockedUpdate.body.error).toMatchObject({ code: 'INVALID_TEXT' })
    const unchanged = db.prepare('SELECT name FROM projects WHERE id = ?')
      .get(created.body.data.id) as any
    expect(unchanged.name).toBe(`B194 安全项目 ${suffix}`)
  })
})
