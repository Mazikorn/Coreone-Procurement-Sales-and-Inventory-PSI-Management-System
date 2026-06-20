process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../src/app.js')
  return { app }
}

async function loginAdmin(app: any): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ username: 'admin', password: 'admin123' })
  expect(res.status).toBe(200)
  return res.body.data.token
}

describe('用户创建与密码重置', () => {
  let app: any
  let token: string

  beforeAll(async () => {
    ;({ app } = await getApp())
    token = await loginAdmin(app)
  })

  it('USER-RESET-001: 创建用户未传密码时生成临时初始密码且可登录', async () => {
    const username = `user-default-${Date.now()}`
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username,
        realName: '默认密码用户',
        role: 'technician',
      })

    expect(create.status).toBe(201)
    expect(create.body.data.initialPassword).toMatch(/^Core@[A-Za-z0-9_-]{8,}$/)
    expect(create.body.data.initialPassword).not.toBe('Abc@123456')

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ username, password: create.body.data.initialPassword })
    expect(login.status).toBe(200)
  })

  it('USER-RESET-002: 重置密码端点生成一次性临时密码且新密码可登录', async () => {
    const username = `user-reset-${Date.now()}`
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username,
        password: 'Old@123456',
        realName: '重置密码用户',
        role: 'technician',
      })
    expect(create.status).toBe(201)

    const reset = await request(app)
      .post(`/api/v1/users/${create.body.data.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`)

    expect(reset.status).toBe(200)
    expect(reset.body.data.temporaryPassword).toMatch(/^Core@[A-Za-z0-9_-]{8,}$/)
    expect(reset.body.data.temporaryPassword).not.toBe('Abc@123456')

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username, password: 'Old@123456' })
    expect(oldLogin.status).toBe(401)

    const newLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username, password: reset.body.data.temporaryPassword })
    expect(newLogin.status).toBe(200)
  })

  it('USER-RESET-003: 连续重置密码不会复用同一个临时密码', async () => {
    const username = `user-reset-repeat-${Date.now()}`
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username,
        password: 'Old@123456',
        realName: '连续重置用户',
        role: 'technician',
      })
    expect(create.status).toBe(201)

    const firstReset = await request(app)
      .post(`/api/v1/users/${create.body.data.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`)
    const secondReset = await request(app)
      .post(`/api/v1/users/${create.body.data.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`)

    expect(firstReset.status).toBe(200)
    expect(secondReset.status).toBe(200)
    expect(firstReset.body.data.temporaryPassword).not.toBe(secondReset.body.data.temporaryPassword)
  })

  it('USER-FILTER-001: 用户列表和统计支持角色、状态和关键字过滤', async () => {
    const suffix = Date.now()
    const activeName = `user-filter-active-${suffix}`
    const inactiveName = `user-filter-inactive-${suffix}`
    await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: activeName,
        realName: '筛选启用用户',
        role: 'finance',
        department: '财务测试组',
        status: 'active',
      })
    await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: inactiveName,
        realName: '筛选停用用户',
        role: 'technician',
        department: '财务测试组',
        status: 'inactive',
      })

    const filtered = await request(app)
      .get('/api/v1/users')
      .query({ keyword: '财务测试组', role: 'finance', status: 'active' })
      .set('Authorization', `Bearer ${token}`)
    expect(filtered.status).toBe(200)
    const ids = filtered.body.data.list.map((row: any) => row.username)
    expect(ids).toContain(activeName)
    expect(ids).not.toContain(inactiveName)

    const stats = await request(app)
      .get('/api/v1/users/stats')
      .query({ keyword: '财务测试组' })
      .set('Authorization', `Bearer ${token}`)
    expect(stats.status).toBe(200)
    expect(stats.body.data.totalUsers).toBeGreaterThanOrEqual(2)
    expect(stats.body.data.activeUsers).toBeGreaterThanOrEqual(1)
    expect(stats.body.data.inactiveUsers).toBeGreaterThanOrEqual(1)
  })

  it('USER-AUDIT-001: 成功登录后用户列表返回最后登录时间', async () => {
    const username = `user-last-login-${Date.now()}`
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username,
        password: 'Login@123456',
        realName: '最后登录用户',
        role: 'technician',
      })
    expect(create.status).toBe(201)

    const beforeLogin = await request(app)
      .get('/api/v1/users')
      .query({ keyword: username })
      .set('Authorization', `Bearer ${token}`)
    expect(beforeLogin.status).toBe(200)
    expect(beforeLogin.body.data.list[0].lastLogin).toBeNull()

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ username, password: 'Login@123456' })
    expect(login.status).toBe(200)

    const afterLogin = await request(app)
      .get('/api/v1/users')
      .query({ keyword: username })
      .set('Authorization', `Bearer ${token}`)

    expect(afterLogin.status).toBe(200)
    expect(afterLogin.body.data.list[0]).toMatchObject({
      username,
      lastLogin: expect.any(String),
    })
  })

  it('USER-PERM-001: 用户列表返回其角色对应的真实权限列表', async () => {
    const suffix = Date.now()
    const roleCode = `user_perm_${suffix}`
    const role = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: roleCode,
        name: '用户权限展示角色',
        permissions: ['inventory:view', 'inbound:add'],
        status: 'active',
      })
    expect(role.status).toBe(200)

    const username = `user-perm-${suffix}`
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username,
        realName: '权限展示用户',
        role: roleCode,
      })
    expect(create.status).toBe(201)

    const listed = await request(app)
      .get('/api/v1/users')
      .query({ keyword: username })
      .set('Authorization', `Bearer ${token}`)

    expect(listed.status).toBe(200)
    expect(listed.body.data.list[0]).toMatchObject({
      username,
      role: roleCode,
      permissions: ['inventory:view', 'inbound:add'],
    })
  })

  it('USER-SCOPE-001: 用户列表返回其角色对应的数据权限范围', async () => {
    const suffix = Date.now()
    const roleCode = `user_scope_${suffix}`
    const role = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({
        code: roleCode,
        name: '用户数据范围角色',
        permissions: ['inventory:view'],
        status: 'active',
        dataScope: 'self',
      })
    expect(role.status).toBe(200)

    const username = `user-scope-${suffix}`
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username,
        realName: '数据范围用户',
        role: roleCode,
      })
    expect(create.status).toBe(201)

    const listed = await request(app)
      .get('/api/v1/users')
      .query({ keyword: username })
      .set('Authorization', `Bearer ${token}`)

    expect(listed.status).toBe(200)
    expect(listed.body.data.list[0]).toMatchObject({
      username,
      role: roleCode,
      dataScope: 'self',
    })
  })

  it('USER-PERM-002: 默认系统角色用户返回默认权限', async () => {
    const listed = await request(app)
      .get('/api/v1/users')
      .query({ keyword: 'admin' })
      .set('Authorization', `Bearer ${token}`)

    expect(listed.status).toBe(200)
    expect(listed.body.data.list[0]).toMatchObject({
      username: 'admin',
      role: 'admin',
      permissions: ['*'],
    })
  })

  it('USER-ROLE-001: 创建用户必须传入已启用的真实角色', async () => {
    const missingRole = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: `user-missing-role-${Date.now()}`,
        realName: '缺少角色用户',
      })

    expect(missingRole.status).toBe(400)
    expect(missingRole.body.error.message).toContain('Role required')

    const invalidRole = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: `user-invalid-role-${Date.now()}`,
        realName: '无效角色用户',
        role: 'operator',
      })

    expect(invalidRole.status).toBe(400)
    expect(invalidRole.body.error.message).toContain('Invalid role')
  })

  it('USER-ROLE-002: 编辑用户时不能写入不存在的角色', async () => {
    const username = `user-role-update-${Date.now()}`
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username,
        realName: '角色编辑用户',
        role: 'technician',
      })

    expect(create.status).toBe(201)

    const update = await request(app)
      .put(`/api/v1/users/${create.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ role: 'viewer' })

    expect(update.status).toBe(400)
    expect(update.body.error.message).toContain('Invalid role')
  })

  it('USER-BATCH-001: 批量删除包含管理员时整批失败且不部分删除', async () => {
    const username = `user-batch-delete-${Date.now()}`
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username,
        realName: '批量删除用户',
        role: 'technician',
      })
    expect(create.status).toBe(201)

    const batchDelete = await request(app)
      .delete('/api/v1/users/batch')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [create.body.data.id, 'USER-001'] })

    expect(batchDelete.status).toBe(409)
    expect(batchDelete.body.error.message).toContain('Cannot delete admin account')

    const listed = await request(app)
      .get('/api/v1/users')
      .query({ keyword: username })
      .set('Authorization', `Bearer ${token}`)

    expect(listed.status).toBe(200)
    expect(listed.body.data.list[0]).toMatchObject({
      id: create.body.data.id,
      username,
    })
  })

  it('USER-BATCH-002: 批量停用包含管理员时整批失败且不部分停用', async () => {
    const username = `user-batch-status-${Date.now()}`
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username,
        realName: '批量状态用户',
        role: 'technician',
        status: 'active',
      })
    expect(create.status).toBe(201)

    const batchStatus = await request(app)
      .put('/api/v1/users/batch/status')
      .set('Authorization', `Bearer ${token}`)
      .send({ ids: [create.body.data.id, 'USER-001'], status: 'inactive' })

    expect(batchStatus.status).toBe(409)
    expect(batchStatus.body.error.message).toContain('Cannot disable admin account')

    const listed = await request(app)
      .get('/api/v1/users')
      .query({ keyword: username })
      .set('Authorization', `Bearer ${token}`)

    expect(listed.status).toBe(200)
    expect(listed.body.data.list[0]).toMatchObject({
      id: create.body.data.id,
      username,
      status: 'active',
    })
  })

  it('USER-INPUT-001: 创建用户会修剪身份字段并拒绝非法状态或弱密码', async () => {
    const suffix = Date.now()
    const username = `user-trim-${suffix}`
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: `  ${username}  `,
        password: 'Trim@123456',
        realName: '  修剪用户  ',
        role: ' technician ',
        department: ' 病理科 ',
        phone: ' 13800000000 ',
        email: ' trim@example.com ',
        status: 'active',
      })
    expect(create.status).toBe(201)

    const listed = await request(app)
      .get('/api/v1/users')
      .query({ keyword: username })
      .set('Authorization', `Bearer ${token}`)
    expect(listed.status).toBe(200)
    expect(listed.body.data.list[0]).toMatchObject({
      username,
      realName: '修剪用户',
      role: 'technician',
      department: '病理科',
      phone: '13800000000',
      email: 'trim@example.com',
    })

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ username, password: 'Trim@123456' })
    expect(login.status).toBe(200)

    const invalidStatus = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: `user-invalid-status-${suffix}`,
        realName: '非法状态用户',
        role: 'technician',
        status: 'disabled',
      })
    expect(invalidStatus.status).toBe(400)

    const weakPassword = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: `user-weak-password-${suffix}`,
        realName: '弱密码用户',
        role: 'technician',
        password: '123',
      })
    expect(weakPassword.status).toBe(400)

    const blankName = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username: `user-blank-name-${suffix}`,
        realName: '   ',
        role: 'technician',
      })
    expect(blankName.status).toBe(400)
  })

  it('USER-INPUT-002: 编辑与重置密码拒绝非法字段且不改写原密码', async () => {
    const suffix = Date.now()
    const username = `user-update-validate-${suffix}`
    const create = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${token}`)
      .send({
        username,
        password: 'Update@123456',
        realName: '编辑校验用户',
        role: 'technician',
      })
    expect(create.status).toBe(201)

    const blankName = await request(app)
      .put(`/api/v1/users/${create.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ realName: '   ' })
    expect(blankName.status).toBe(400)

    const invalidStatus = await request(app)
      .put(`/api/v1/users/${create.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'disabled' })
    expect(invalidStatus.status).toBe(400)

    const weakReset = await request(app)
      .post(`/api/v1/users/${create.body.data.id}/reset-password`)
      .set('Authorization', `Bearer ${token}`)
      .send({ password: '123' })
    expect(weakReset.status).toBe(400)

    const oldLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ username, password: 'Update@123456' })
    expect(oldLogin.status).toBe(200)

    const update = await request(app)
      .put(`/api/v1/users/${create.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        realName: '  编辑后用户  ',
        role: ' finance ',
        department: ' 财务科 ',
      })
    expect(update.status).toBe(200)

    const listed = await request(app)
      .get('/api/v1/users')
      .query({ keyword: username })
      .set('Authorization', `Bearer ${token}`)
    expect(listed.status).toBe(200)
    expect(listed.body.data.list[0]).toMatchObject({
      realName: '编辑后用户',
      role: 'finance',
      department: '财务科',
    })
  })
})
