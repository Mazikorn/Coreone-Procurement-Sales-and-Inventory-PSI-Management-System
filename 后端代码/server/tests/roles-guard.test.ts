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

async function createRole(app: any, token: string, suffix: string) {
  const code = `role_guard_${suffix}`
  const res = await request(app)
    .post('/api/v1/roles')
    .set('Authorization', `Bearer ${token}`)
    .send({ code, name: `角色保护-${suffix}`, permissions: ['inventory:view'], status: 'active' })
  expect(res.status).toBe(200)
  return { id: res.body.data.id as string, code }
}

async function createUser(app: any, token: string, roleCode: string, suffix: string) {
  const res = await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${token}`)
    .send({
      username: `role-user-${suffix}`,
      realName: '角色引用用户',
      role: roleCode,
      department: '病理科',
    })
  expect(res.status).toBe(201)
  return res.body.data.id as string
}

async function createLoginUser(app: any, token: string, roleCode: string, suffix: string) {
  const password = 'RoleAuth@123456'
  const username = `role-login-${suffix}`
  const res = await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${token}`)
    .send({
      username,
      password,
      realName: '角色登录用户',
      role: roleCode,
      department: '病理科',
    })
  expect(res.status).toBe(201)
  return { username, password }
}

describe('角色引用保护', () => {
  let app: any
  let db: any
  let token: string

  beforeAll(async () => {
    ;({ app, db } = await getApp())
    token = await loginAdmin(app)
  })

  it('ROLE-GUARD-001: 已分配给用户的角色不可删除', async () => {
    const suffix = `delete-${Date.now()}`
    const role = await createRole(app, token, suffix)
    await createUser(app, token, role.code, suffix)

    const res = await request(app)
      .delete(`/api/v1/roles/${role.id}`)
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(409)
    const row = db.prepare('SELECT is_deleted FROM roles WHERE id = ?').get(role.id) as any
    expect(Number(row.is_deleted)).toBe(0)
  })

  it('ROLE-GUARD-002: 已分配给用户的角色不可修改编码', async () => {
    const suffix = `update-${Date.now()}`
    const role = await createRole(app, token, suffix)
    await createUser(app, token, role.code, suffix)

    const res = await request(app)
      .put(`/api/v1/roles/${role.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ code: `${role.code}_new`, name: '角色保护更新' })

    expect(res.status).toBe(409)
    const row = db.prepare('SELECT code FROM roles WHERE id = ?').get(role.id) as any
    expect(row.code).toBe(role.code)
  })

  it('ROLE-GUARD-003: 角色列表返回真实用户数量', async () => {
    const suffix = `list-${Date.now()}`
    const role = await createRole(app, token, suffix)
    await createUser(app, token, role.code, suffix)

    const res = await request(app)
      .get('/api/v1/roles?page=1&pageSize=100')
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const listed = res.body.data.list.find((item: any) => item.id === role.id)
    expect(listed.userCount).toBe(1)
  })

  it('ROLE-GUARD-004: 角色列表返回关联用户摘要', async () => {
    const suffix = `users-${Date.now()}`
    const role = await createRole(app, token, suffix)
    await createUser(app, token, role.code, suffix)

    const res = await request(app)
      .get('/api/v1/roles')
      .query({ keyword: suffix, page: 1, pageSize: 100 })
      .set('Authorization', `Bearer ${token}`)

    expect(res.status).toBe(200)
    const listed = res.body.data.list.find((item: any) => item.id === role.id)
    expect(listed).toMatchObject({
      id: role.id,
      code: role.code,
      status: 'active',
      userCount: 1,
      associatedUsers: [
        {
          username: `role-user-${suffix}`,
          realName: '角色引用用户',
          status: 'active',
        },
      ],
    })
    expect(listed.createdAt).toEqual(expect.any(String))
  })

  it('ROLE-AUTH-001: 自定义角色权限参与登录返回和接口鉴权', async () => {
    const suffix = `auth-${Date.now()}`
    const role = await createRole(app, token, suffix)
    const user = await createLoginUser(app, token, role.code, suffix)

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: user.username, password: user.password })

    expect(login.status).toBe(200)
    expect(login.body.data.user).toMatchObject({
      username: user.username,
      role: role.code,
      permissions: ['inventory:view'],
    })

    const inventory = await request(app)
      .get('/api/v1/inventory')
      .set('Authorization', `Bearer ${login.body.data.token}`)

    expect(inventory.status).toBe(200)
  })

  it('ROLE-AUTH-002: 自定义成本只读角色不能读取财务配置工作台接口', async () => {
    const suffix = `cost-view-${Date.now()}`
    const roleCode = `role_cost_view_${suffix}`
    const create = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: roleCode,
        name: '成本只读观察者',
        permissions: ['cost_analysis:view'],
        status: 'active',
      })
    expect(create.status).toBe(200)
    const user = await createLoginUser(app, token, roleCode, suffix)

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: user.username, password: user.password })

    expect(login.status).toBe(200)
    const customCostToken = login.body.data.token

    const dashboard = await request(app)
      .get('/api/v1/abc/dashboard')
      .set('Authorization', `Bearer ${customCostToken}`)
    expect(dashboard.status).toBe(200)

    for (const path of [
      '/api/v1/indirect-costs',
      '/api/v1/abc/activity-centers',
      '/api/v1/abc/cost-drivers',
      '/api/v1/abc/cost-pools',
      '/api/v1/abc/bom-fee-mappings/audit',
      '/api/v1/abc/fee-standards',
    ]) {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${customCostToken}`)

      expect(res.status).toBe(403)
    }
  })

  it('ROLE-AUTH-003: 自定义成本模块角色可以承接财务成本工作台读写', async () => {
    const suffix = `cost-worker-${Date.now()}`
    const roleCode = `role_cost_worker_${suffix}`
    const create = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: roleCode,
        name: '自定义财务成本人员',
        permissions: ['cost_analysis'],
        status: 'active',
      })
    expect(create.status).toBe(200)
    const user = await createLoginUser(app, token, roleCode, suffix)

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: user.username, password: user.password })

    expect(login.status).toBe(200)
    const customFinanceToken = login.body.data.token

    for (const path of [
      '/api/v1/abc/dashboard',
      '/api/v1/indirect-costs',
      '/api/v1/abc/activity-centers',
      '/api/v1/abc/cost-drivers',
      '/api/v1/abc/cost-pools',
      '/api/v1/abc/bom-fee-mappings/audit',
      '/api/v1/abc/fee-standards',
      '/api/v1/cost-adjustments',
    ]) {
      const res = await request(app)
        .get(path)
        .set('Authorization', `Bearer ${customFinanceToken}`)

      expect(res.status).toBe(200)
    }

    const createCenter = await request(app)
      .post('/api/v1/abc/activity-centers')
      .set('Authorization', `Bearer ${customFinanceToken}`)
      .send({
        code: `CUSTOM_COST_AC_${suffix}`,
        name: '自定义财务成本角色作业中心',
        costDriverType: 'slide_count',
      })

    expect(createCenter.status).toBe(201)
    expect(createCenter.body.success).toBe(true)
  })

  it('ROLE-SCOPE-001: 角色数据权限范围会被创建、返回和编辑保存', async () => {
    const suffix = `scope-${Date.now()}`
    const code = `role_scope_${suffix}`
    const create = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code,
        name: '数据范围角色',
        permissions: ['inventory:view'],
        status: 'active',
        dataScope: 'self',
      })
    expect(create.status).toBe(200)

    const listed = await request(app)
      .get('/api/v1/roles')
      .query({ keyword: code, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)

    expect(listed.status).toBe(200)
    expect(listed.body.data.list[0]).toMatchObject({
      code,
      dataScope: 'self',
    })

    const update = await request(app)
      .put(`/api/v1/roles/${create.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dataScope: 'all' })
    expect(update.status).toBe(200)

    const afterUpdate = await request(app)
      .get('/api/v1/roles')
      .query({ keyword: code, page: 1, pageSize: 20 })
      .set('Authorization', `Bearer ${token}`)

    expect(afterUpdate.status).toBe(200)
    expect(afterUpdate.body.data.list[0].dataScope).toBe('all')
  })

  it('ROLE-FILTER-001: 角色列表和统计支持关键字与系统/自定义筛选', async () => {
    const suffix = `filter-${Date.now()}`
    const role = await createRole(app, token, suffix)
    await createUser(app, token, role.code, suffix)

    const filtered = await request(app)
      .get('/api/v1/roles')
      .query({ keyword: suffix, type: 'custom', page: 1, pageSize: 100 })
      .set('Authorization', `Bearer ${token}`)

    expect(filtered.status).toBe(200)
    const ids = filtered.body.data.list.map((item: any) => item.id)
    expect(ids).toContain(role.id)
    expect(filtered.body.data.list.every((item: any) => item.code !== 'admin')).toBe(true)

    const stats = await request(app)
      .get('/api/v1/roles/stats')
      .query({ keyword: suffix, type: 'custom' })
      .set('Authorization', `Bearer ${token}`)

    expect(stats.status).toBe(200)
    expect(stats.body.data.totalRoles).toBe(1)
    expect(stats.body.data.customRoles).toBe(1)
    expect(stats.body.data.systemRoles).toBe(0)
    expect(stats.body.data.assignedUsers).toBe(1)
  })

  it('ROLE-SYSTEM-001: 内置岗位属于系统角色且不可编辑或删除', async () => {
    const listed = await request(app)
      .get('/api/v1/roles')
      .query({ type: 'system', page: 1, pageSize: 100 })
      .set('Authorization', `Bearer ${token}`)

    expect(listed.status).toBe(200)
    const codes = listed.body.data.list.map((item: any) => item.code)
    expect(codes).toEqual(expect.arrayContaining([
      'admin',
      'warehouse_manager',
      'technician',
      'pathologist',
      'procurement',
      'finance',
    ]))
    expect(listed.body.data.list.every((item: any) => item.isSystem === true)).toBe(true)

    const warehouseRole = listed.body.data.list.find((item: any) => item.code === 'warehouse_manager')
    const update = await request(app)
      .put(`/api/v1/roles/${warehouseRole.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: '被误改的仓库管理员' })
    expect(update.status).toBe(403)

    const deleteRole = await request(app)
      .delete(`/api/v1/roles/${warehouseRole.id}`)
      .set('Authorization', `Bearer ${token}`)
    expect(deleteRole.status).toBe(403)

    const row = db.prepare('SELECT name, is_deleted FROM roles WHERE code = ?').get('warehouse_manager') as any
    expect(row.name).toBe('仓库管理员')
    expect(Number(row.is_deleted)).toBe(0)
  })

  it('ROLE-VALIDATION-001: 角色权限与数据范围拒绝未知值', async () => {
    const suffix = `validation-${Date.now()}`
    const invalidPermission = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `role_invalid_perm_${suffix}`,
        name: '非法权限角色',
        permissions: ['inventory:approve'],
        status: 'active',
      })
    expect(invalidPermission.status).toBe(400)

    const globalPermission = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `role_global_perm_${suffix}`,
        name: '全局权限角色',
        permissions: ['*'],
        status: 'active',
      })
    expect(globalPermission.status).toBe(400)

    const invalidScope = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: `role_invalid_scope_${suffix}`,
        name: '非法数据范围角色',
        permissions: ['inventory:view'],
        status: 'active',
        dataScope: 'global',
      })
    expect(invalidScope.status).toBe(400)

    const validRole = await createRole(app, token, suffix)
    const invalidUpdate = await request(app)
      .put(`/api/v1/roles/${validRole.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ permissions: ['unknown:view'] })
    expect(invalidUpdate.status).toBe(400)

    const stored = db.prepare('SELECT permissions FROM roles WHERE id = ?').get(validRole.id) as any
    expect(JSON.parse(stored.permissions)).toEqual(['inventory:view'])
  })

  it('ROLE-AUTH-004: 停用角色后该角色用户不能继续登录', async () => {
    const suffix = `inactive-auth-${Date.now()}`
    const role = await createRole(app, token, suffix)
    const user = await createLoginUser(app, token, role.code, suffix)

    const beforeDisable = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: user.username, password: user.password })
    expect(beforeDisable.status).toBe(200)
    const refreshToken = beforeDisable.body.data.refreshToken

    const disable = await request(app)
      .put(`/api/v1/roles/${role.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'inactive' })
    expect(disable.status).toBe(200)

    const afterDisable = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: user.username, password: user.password })

    expect(afterDisable.status).toBe(401)
    expect(afterDisable.body.error.message).toContain('角色已停用')

    const refreshAfterDisable = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken })

    expect(refreshAfterDisable.status).toBe(401)
    expect(refreshAfterDisable.body.error.code).toBe('ROLE_DISABLED')
  })
})
