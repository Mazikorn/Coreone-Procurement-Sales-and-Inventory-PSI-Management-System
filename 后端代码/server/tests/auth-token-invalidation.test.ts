process.env.DATABASE_PATH = ':memory:'

import { describe, it, expect, beforeAll } from 'vitest'
import request from 'supertest'

const getApp = async () => {
  const { default: app } = await import('../src/app.js')
  const { getDatabase } = await import('../src/database/DatabaseManager.js')
  return { app, db: getDatabase() }
}

async function loginUser(app: any, username: string, password: string): Promise<string> {
  const res = await request(app).post('/api/v1/auth/login').send({ username, password })
  expect(res.status).toBe(200)
  return res.body.data.token
}

// P0-03：停用/软删账号或改角色后，已签发的 8h JWT 必须即时失效（authenticateToken 回查 users）。
describe('AUTH-TOKEN-INVALIDATION（P0-03）', () => {
  let app: any
  let db: any

  beforeAll(async () => {
    ;({ app, db } = await getApp())
  })

  it('停用账号后，旧 token 立即被拒（401 ACCOUNT_DISABLED）', async () => {
    const token = await loginUser(app, 'wangkq', 'CoreOne2026!')
    // 停用前：token 可用
    const before = await request(app).get('/api/v1/inventory').set('Authorization', `Bearer ${token}`)
    expect(before.status).toBe(200)

    db.prepare("UPDATE users SET status = 0 WHERE username = 'wangkq'").run()
    const after = await request(app).get('/api/v1/inventory').set('Authorization', `Bearer ${token}`)
    expect(after.status).toBe(401)
    expect(after.body?.error?.code).toBe('ACCOUNT_DISABLED')

    db.prepare("UPDATE users SET status = 1 WHERE username = 'wangkq'").run()
    const restored = await request(app).get('/api/v1/inventory').set('Authorization', `Bearer ${token}`)
    expect(restored.status).toBe(200)
  })

  it('软删账号后，旧 token 立即被拒（401 ACCOUNT_DISABLED）', async () => {
    const token = await loginUser(app, 'zhangwei', 'CoreOne2026!')
    db.prepare("UPDATE users SET is_deleted = 1 WHERE username = 'zhangwei'").run()
    const res = await request(app).get('/api/v1/inventory').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
    expect(res.body?.error?.code).toBe('ACCOUNT_DISABLED')
    db.prepare("UPDATE users SET is_deleted = 0 WHERE username = 'zhangwei'").run()
  })

  it('改角色后，持旧角色的 token 立即被拒（401 ROLE_CHANGED）', async () => {
    const token = await loginUser(app, 'sunli', 'CoreOne2026!') // finance
    db.prepare("UPDATE users SET role = 'manager' WHERE username = 'sunli'").run()
    const res = await request(app).get('/api/v1/inventory').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(401)
    expect(res.body?.error?.code).toBe('ROLE_CHANGED')
    db.prepare("UPDATE users SET role = 'finance' WHERE username = 'sunli'").run()
  })

  it('正常有效账号 token 不受影响', async () => {
    const token = await loginUser(app, 'wangkq', 'CoreOne2026!')
    const res = await request(app).get('/api/v1/inventory').set('Authorization', `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})
