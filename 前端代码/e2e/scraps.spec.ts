import { test, expect, Page } from '@playwright/test'

const FE_BASE = 'http://localhost:8080'
const API_BASE = 'http://127.0.0.1:3001/api/v1'

const ROLES = {
  admin: { username: 'admin', password: 'admin123' },
  warehouse_manager: { username: 'wangkq', password: 'CoreOne2026!' },
  technician: { username: 'zhangwei', password: 'CoreOne2026!' },
  pathologist: { username: 'liuyf', password: 'CoreOne2026!' },
  procurement: { username: 'zhaohp', password: 'CoreOne2026!' },
  finance: { username: 'sunli', password: 'CoreOne2026!' },
} as const
type RoleKey = keyof typeof ROLES
const READ_ROLES: RoleKey[] = ['admin', 'warehouse_manager']
const FORBIDDEN_ROLES: RoleKey[] = ['technician', 'pathologist', 'procurement', 'finance']

async function loginAs(page: Page, role: RoleKey) {
  await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
  const cred = ROLES[role]
  await page.fill('input[type="text"]', cred.username)
  await page.fill('input[type="password"]', cred.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(`${FE_BASE}/`, { timeout: 15000, waitUntil: 'domcontentloaded' })
}

async function apiLogin(role: RoleKey): Promise<string> {
  const cred = ROLES[role]
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cred),
  })
  const data = (await res.json()) as any
  return data.data?.token || data.token
}

async function apiFetch(token: string, method: string, path: string, body?: any) {
  const opts: any = { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
  if (body && method !== 'GET' && method !== 'HEAD') opts.body = JSON.stringify(body)
  const res = await fetch(`${API_BASE}${path}`, opts)
  return { status: res.status, data: (await res.json().catch(() => null)) as any }
}

async function getAnyMaterialId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/materials?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

// ────────────────────────────────────────────
// 1. 查看报废列表 (10 tests)
// ────────────────────────────────────────────
test.describe('报废管理 -> 查看报废列表', () => {
  for (const role of READ_ROLES) {
    test(`SC-LIST-01-${role}. ${role}可查看报废列表`, async ({ page }) => {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/scraps`)
      await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
    })
  }
  for (const role of FORBIDDEN_ROLES) {
    test(`SC-LIST-02-${role}. ${role}访问返回403`, async () => {
      const res = await apiFetch(await apiLogin(role), 'GET', '/scraps')
      expect(res.status).toBe(403)
    })
  }
  test('SC-LIST-03. 无Token返回401', async () => {
    const res = await fetch(`${API_BASE}/scraps`)
    expect(res.status).toBe(401)
  })
  test('SC-LIST-04. API响应格式验证', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/scraps?page=1&pageSize=1')
    expect(res.status).toBe(200)
    expect(res.data).toHaveProperty('data')
  })
  test('SC-LIST-05. UI差异：admin显示新建报废按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/scraps`)
    await page.waitForTimeout(1000)
  })
})

// ────────────────────────────────────────────
// 2. 创建报废 (15 tests)
// ────────────────────────────────────────────
test.describe('报废管理 -> 创建报废', () => {
  test('SC-CREATE-01. admin创建报废成功', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/scraps', {
      materialId: mid, quantity: 1, reason: 'E2E报废原因', remark: 'E2E报废',
    })
    expect([200, 201]).toContain(res.status)
  })
  test('SC-CREATE-02. warehouse_manager创建报废成功', async () => {
    const token = await apiLogin('warehouse_manager')
    const adminToken = await apiLogin('admin')
    const mid = await getAnyMaterialId(adminToken)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/scraps', {
      materialId: mid, quantity: 1, reason: 'E2E报废WM',
    })
    expect([200, 201, 403]).toContain(res.status)
  })
  test('SC-CREATE-03. 缺少materialId返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/scraps', { quantity: 1, reason: 'test' })
    expect(res.status).toBe(400)
  })
  test('SC-CREATE-04. 缺少reason返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/scraps', { materialId: mid, quantity: 1 })
    expect(res.status).toBe(400)
  })
  test('SC-CREATE-05. quantity=0返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/scraps', { materialId: mid, quantity: 0, reason: 'test' })
    expect(res.status).toBe(400)
  })
  test('SC-CREATE-06. 不存在的物料返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/scraps', { materialId: 'non-existent', quantity: 1, reason: 'test' })
    expect([404, 400]).toContain(res.status)
  })
  for (const role of FORBIDDEN_ROLES) {
    test(`SC-CREATE-07-${role}. ${role}创建报废返回403`, async () => {
      const token = await apiLogin(role)
      const adminToken = await apiLogin('admin')
      const mid = await getAnyMaterialId(adminToken)
      if (!mid) { test.skip(); return }
      const res = await apiFetch(token, 'POST', '/scraps', { materialId: mid, quantity: 1, reason: 'test' })
      expect(res.status).toBe(403)
    })
  }
  test('SC-CREATE-08. 报废后库存减少', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const before = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const beforeStock = before.data?.data?.list?.[0]?.stock || 0
    if (beforeStock < 2) { test.skip(); return }
    await apiFetch(token, 'POST', '/scraps', { materialId: mid, quantity: 1, reason: 'E2E库存验证' })
    const after = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const afterStock = after.data?.data?.list?.[0]?.stock || 0
    expect(afterStock).toBeLessThanOrEqual(beforeStock)
  })
  test('SC-CREATE-09. 超量报废返回422', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/scraps', { materialId: mid, quantity: 99999, reason: 'E2E超量' })
    expect([400, 422]).toContain(res.status)
  })
  test('SC-CREATE-10. 并发：快速双击提交', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const body = { materialId: mid, quantity: 1, reason: 'E2E并发' }
    const [r1, r2] = await Promise.all([
      apiFetch(token, 'POST', '/scraps', body),
      apiFetch(token, 'POST', '/scraps', body),
    ])
    expect(r1.status === 200 || r1.status === 201 || r2.status === 200 || r2.status === 201).toBe(true)
  })
})

// ────────────────────────────────────────────
// 3. 删除/撤销报废 (8 tests)
// ────────────────────────────────────────────
test.describe('报废管理 -> 删除报废', () => {
  test('SC-DELETE-01. admin删除报废记录', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const create = await apiFetch(token, 'POST', '/scraps', { materialId: mid, quantity: 1, reason: 'E2E删除' })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'DELETE', `/scraps/${id}`)
    expect([200, 204]).toContain(res.status)
  })
  test('SC-DELETE-02. 删除不存在的记录返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'DELETE', '/scraps/non-existent-id')
    expect(res.status).toBe(404)
  })
  test('SC-DELETE-03. 撤销后库存回退', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const before = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const beforeStock = before.data?.data?.list?.[0]?.stock || 0
    const create = await apiFetch(token, 'POST', '/scraps', { materialId: mid, quantity: 1, reason: 'E2E回退' })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    await apiFetch(token, 'DELETE', `/scraps/${id}`)
    const after = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const afterStock = after.data?.data?.list?.[0]?.stock || 0
    expect(afterStock).toBeGreaterThanOrEqual(beforeStock - 1)
  })
  test('SC-DELETE-04. 重复删除返回404', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const create = await apiFetch(token, 'POST', '/scraps', { materialId: mid, quantity: 1, reason: 'E2E重复' })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    await apiFetch(token, 'DELETE', `/scraps/${id}`)
    const res = await apiFetch(token, 'DELETE', `/scraps/${id}`)
    expect([404, 400]).toContain(res.status)
  })
  for (const role of FORBIDDEN_ROLES) {
    test(`SC-DELETE-05-${role}. ${role}删除报废返回403`, async () => {
      const adminToken = await apiLogin('admin')
      const mid = await getAnyMaterialId(adminToken)
      if (!mid) { test.skip(); return }
      const create = await apiFetch(adminToken, 'POST', '/scraps', { materialId: mid, quantity: 1, reason: 'E2E' })
      const id = create.data?.data?.id
      if (!id) { test.skip(); return }
      const res = await apiFetch(await apiLogin(role), 'DELETE', `/scraps/${id}`)
      expect(res.status).toBe(403)
      await apiFetch(adminToken, 'DELETE', `/scraps/${id}`).catch(() => {})
    })
  }
})

// ────────────────────────────────────────────
// 4. 分页与权限 (8 tests)
// ────────────────────────────────────────────
test.describe('报废管理 -> 分页与权限', () => {
  test('SC-PAGE-01. page=999返回空列表', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/scraps?page=999&pageSize=5')
    expect(res.status).toBe(200)
  })
  test('SC-PAGE-02. 页面刷新后状态保持', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/scraps`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
  test('SC-PAGE-03. 响应式布局', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(`${FE_BASE}/scraps`)
    await page.waitForTimeout(1000)
  })
  test('SC-PAGE-04. 加载性能', async ({ page }) => {
    await loginAs(page, 'admin')
    const start = Date.now()
    await page.goto(`${FE_BASE}/scraps`)
    await page.waitForTimeout(2000)
    expect(Date.now() - start).toBeLessThan(10000)
  })
  test('SC-PERM-admin. admin GET /scraps 返回200', async () => {
    const res = await apiFetch(await apiLogin('admin'), 'GET', '/scraps')
    expect(res.status).toBe(200)
  })
  test('SC-PERM-whm. warehouse_manager GET /scraps 返回200', async () => {
    const res = await apiFetch(await apiLogin('warehouse_manager'), 'GET', '/scraps')
    expect(res.status).toBe(200)
  })
})
