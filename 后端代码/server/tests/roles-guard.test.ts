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

  it('ROLE-AUTH-002: 停用角色后该角色用户不能继续登录', async () => {
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
