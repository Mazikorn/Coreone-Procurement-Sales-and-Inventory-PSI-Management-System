/**
 * LIS 病例导入行数上限（防事件循环阻塞 DoS）。
 *
 * node:sqlite 是同步接口：导入逐行 INSERT（lis-cases /import 还包在单个 BEGIN IMMEDIATE
 * 事务里、每行额外做医院 upsert）。行数无上限时，一个几万行的数组即可让同步循环长时间
 * 霸占整个 Node 事件循环 —— 登录/库存等所有请求一起挂起。正常业务误传大文件即可触发，
 * 无需任何攻击技巧。两个写入入口（/api/v1/lis-cases/import、/api/v1/reconciliation/cases/import）
 * 与干跑 /preview 都必须有行数上限。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { buildTestApp, getDb } from './p0-harness.js'

const MAX_ROWS = 1000

let app: any
let token = ''

async function request() { return (await import('supertest')).default }

function makeCases(n: number) {
  return Array.from({ length: n }, (_, i) => ({ 病理号: `LMT-${i}`, 送检医院: '压测医院', 蜡块数: 1 }))
}
function makeItems(n: number) {
  return Array.from({ length: n }, (_, i) => ({ caseNo: `LMT-${i}`, projectName: '组织病理', operateTime: '2026-06-10' }))
}

beforeAll(async () => {
  await getDb()
  const authRoutes = (await import('../src/routes/auth.js')).default
  const lisRoutes = (await import('../src/routes/lis-cases-v1.1.js')).default
  const reconRoutes = (await import('../src/routes/reconciliation-v1.1.js')).default
  app = await buildTestApp([
    { path: '/api/v1/auth', router: authRoutes },
    { path: '/api/v1/lis-cases', router: lisRoutes },
    { path: '/api/v1/reconciliation', router: reconRoutes },
  ])
  const req = await request()
  token = (await req(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' })).body?.data?.token
})

describe('LIS 病例导入行数上限（防事件循环阻塞 DoS）', () => {
  it(`POST /lis-cases/import 超过 ${MAX_ROWS} 条被拒绝并提示分批（400）`, async () => {
    const req = await request()
    const res = await req(app).post('/api/v1/lis-cases/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ cases: makeCases(MAX_ROWS + 1) })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(String(res.body.error?.message || '')).toContain('分批')
  })

  it(`POST /lis-cases/import 恰好 ${MAX_ROWS} 条正常导入（200）`, async () => {
    const req = await request()
    const res = await req(app).post('/api/v1/lis-cases/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ cases: makeCases(MAX_ROWS) })

    expect(res.status).toBe(200)
    expect(res.body.success).toBe(true)
    expect(res.body.data.imported).toBe(MAX_ROWS)
  })

  it(`POST /lis-cases/preview 超过 ${MAX_ROWS} 条被拒绝并提示分批（400）`, async () => {
    const req = await request()
    const res = await req(app).post('/api/v1/lis-cases/preview')
      .set('Authorization', `Bearer ${token}`)
      .send({ cases: makeCases(MAX_ROWS + 1) })

    expect(res.status).toBe(400)
    expect(String(res.body.error?.message || '')).toContain('分批')
  })

  it(`POST /reconciliation/cases/import 超过 ${MAX_ROWS} 条被拒绝并提示分批（400）`, async () => {
    const req = await request()
    const res = await req(app).post('/api/v1/reconciliation/cases/import')
      .set('Authorization', `Bearer ${token}`)
      .send({ items: makeItems(MAX_ROWS + 1) })

    expect(res.status).toBe(400)
    expect(res.body.success).toBe(false)
    expect(String(res.body.error?.message || '')).toContain('分批')
  })
})
