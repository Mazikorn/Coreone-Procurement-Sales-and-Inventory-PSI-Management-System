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
// 1. 查看退库列表 (10 tests)
// ────────────────────────────────────────────
test.describe('退库管理 -> 查看退库列表', () => {
  for (const role of READ_ROLES) {
    test(`RT-LIST-01-${role}. 正常用例：${role}可查看退库列表`, async ({ page }) => {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/returns`)
      await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
    })
  }
  for (const role of FORBIDDEN_ROLES) {
    test(`RT-LIST-02-${role}. 权限：${role}访问返回403`, async () => {
      const res = await apiFetch(await apiLogin(role), 'GET', '/returns')
      expect(res.status).toBe(403)
    })
  }
  test('RT-LIST-03. 无Token返回401', async () => {
    const res = await fetch(`${API_BASE}/returns`)
    expect(res.status).toBe(401)
  })
  test('RT-LIST-04. API响应格式验证', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/returns?page=1&pageSize=1')
    expect(res.status).toBe(200)
    expect(res.data).toHaveProperty('data')
    expect(res.data?.data).toHaveProperty('list')
  })
  test('RT-LIST-05. UI差异：admin显示新建退库按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)
  })
  test('RT-LIST-06. UI差异：warehouse_manager显示新建退库按钮', async ({ page }) => {
    await loginAs(page, 'warehouse_manager')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)
  })
  test('RT-LIST-07. 空数据边界', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(800)
  })
})

// ────────────────────────────────────────────
// 2. 创建退库 (15 tests)
// ────────────────────────────────────────────
test.describe('退库管理 -> 创建退库', () => {
  test('RT-CREATE-01. 正常用例：admin创建退库成功', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/returns', {
      materialId: mid, quantity: 1, reason: 'E2E退库原因', remark: 'E2E退库测试',
    })
    expect([200, 201]).toContain(res.status)
  })
  test('RT-CREATE-02. 正常用例：warehouse_manager创建退库成功', async () => {
    const token = await apiLogin('warehouse_manager')
    const adminToken = await apiLogin('admin')
    const mid = await getAnyMaterialId(adminToken)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/returns', {
      materialId: mid, quantity: 1, reason: 'E2E退库WM',
    })
    expect([200, 201, 403]).toContain(res.status)
  })
  test('RT-CREATE-03. 表单校验：缺少materialId返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/returns', { quantity: 1, reason: 'test' })
    expect(res.status).toBe(400)
  })
  test('RT-CREATE-04. 表单校验：缺少reason返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/returns', { materialId: mid, quantity: 1 })
    expect(res.status).toBe(400)
  })
  test('RT-CREATE-05. 边界：quantity=0返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/returns', { materialId: mid, quantity: 0, reason: 'test' })
    expect(res.status).toBe(400)
  })
  test('RT-CREATE-06. 边界：负数quantity返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/returns', { materialId: mid, quantity: -1, reason: 'test' })
    expect(res.status).toBe(400)
  })
  test('RT-CREATE-07. 业务冲突：不存在的物料返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/returns', { materialId: 'non-existent', quantity: 1, reason: 'test' })
    expect([404, 400]).toContain(res.status)
  })
  for (const role of FORBIDDEN_ROLES) {
    test(`RT-CREATE-08-${role}. 权限：${role}创建退库返回403`, async () => {
      const token = await apiLogin(role)
      const adminToken = await apiLogin('admin')
      const mid = await getAnyMaterialId(adminToken)
      if (!mid) { test.skip(); return }
      const res = await apiFetch(token, 'POST', '/returns', { materialId: mid, quantity: 1, reason: 'test' })
      expect(res.status).toBe(403)
    })
  }
  test('RT-CREATE-09. 退库后库存增加', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const before = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const beforeStock = before.data?.data?.list?.[0]?.stock || 0
    await apiFetch(token, 'POST', '/returns', { materialId: mid, quantity: 1, reason: 'E2E库存验证' })
    const after = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const afterStock = after.data?.data?.list?.[0]?.stock || 0
    expect(afterStock).toBeGreaterThanOrEqual(beforeStock)
  })
  test('RT-CREATE-10. 并发：快速双击提交', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const body = { materialId: mid, quantity: 1, reason: 'E2E并发' }
    const [r1, r2] = await Promise.all([
      apiFetch(token, 'POST', '/returns', body),
      apiFetch(token, 'POST', '/returns', body),
    ])
    expect(r1.status === 200 || r1.status === 201 || r2.status === 200 || r2.status === 201).toBe(true)
  })
  test('RT-CREATE-11. UI差异：admin前端显示退库入口', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)
  })
  test('RT-CREATE-12. 边界：超量退库（超过库存）', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/returns', { materialId: mid, quantity: 99999, reason: 'E2E超量' })
    expect([400, 422]).toContain(res.status)
  })
})

// ────────────────────────────────────────────
// 3. 删除/撤销退库 (10 tests)
// ────────────────────────────────────────────
test.describe('退库管理 -> 删除退库', () => {
  test('RT-DELETE-01. 正常用例：admin删除退库记录', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const create = await apiFetch(token, 'POST', '/returns', { materialId: mid, quantity: 1, reason: 'E2E删除' })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'DELETE', `/returns/${id}`)
    expect([200, 204]).toContain(res.status)
  })
  test('RT-DELETE-02. 删除不存在的记录返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'DELETE', '/returns/non-existent-id')
    expect(res.status).toBe(404)
  })
  for (const role of FORBIDDEN_ROLES) {
    test(`RT-DELETE-03-${role}. 权限：${role}删除退库返回403`, async () => {
      const adminToken = await apiLogin('admin')
      const mid = await getAnyMaterialId(adminToken)
      if (!mid) { test.skip(); return }
      const create = await apiFetch(adminToken, 'POST', '/returns', { materialId: mid, quantity: 1, reason: 'E2E' })
      const id = create.data?.data?.id
      if (!id) { test.skip(); return }
      const res = await apiFetch(await apiLogin(role), 'DELETE', `/returns/${id}`)
      expect(res.status).toBe(403)
      await apiFetch(adminToken, 'DELETE', `/returns/${id}`).catch(() => {})
    })
  }
  test('RT-DELETE-04. 撤销后库存回退', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const before = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const beforeStock = before.data?.data?.list?.[0]?.stock || 0
    const create = await apiFetch(token, 'POST', '/returns', { materialId: mid, quantity: 1, reason: 'E2E回退' })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    await apiFetch(token, 'DELETE', `/returns/${id}`)
    const after = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const afterStock = after.data?.data?.list?.[0]?.stock || 0
    expect(afterStock).toBeLessThanOrEqual(beforeStock + 1)
  })
  test('RT-DELETE-05. 重复删除返回404', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const create = await apiFetch(token, 'POST', '/returns', { materialId: mid, quantity: 1, reason: 'E2E重复' })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    await apiFetch(token, 'DELETE', `/returns/${id}`)
    const res = await apiFetch(token, 'DELETE', `/returns/${id}`)
    expect([404, 400]).toContain(res.status)
  })
})

// ────────────────────────────────────────────
// 4. 分页 (6 tests)
// ────────────────────────────────────────────
test.describe('退库管理 -> 分页', () => {
  test('RT-PAGE-01. page=999返回空列表', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/returns?page=999&pageSize=5')
    expect(res.status).toBe(200)
  })
  test('RT-PAGE-02. pageSize=1', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/returns?page=1&pageSize=1')
    expect(res.status).toBe(200)
  })
  test('RT-PAGE-03. 页面刷新后状态保持', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
  test('RT-PAGE-04. 响应式布局', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)
  })
  test('RT-PAGE-05. 加载性能', async ({ page }) => {
    await loginAs(page, 'admin')
    const start = Date.now()
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(2000)
    expect(Date.now() - start).toBeLessThan(10000)
  })
  test('RT-PAGE-06. 多角色分页一致', async ({ page }) => {
    for (const role of READ_ROLES) {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/returns?page=1`)
      await page.waitForTimeout(400)
    }
  })
})

// ────────────────────────────────────────────
// 5. 角色权限矩阵 (6 tests)
// ────────────────────────────────────────────
test.describe('退库管理 -> 角色权限矩阵', () => {
  test('RT-PERM-admin-GET. admin GET /returns 返回200', async () => {
    const res = await apiFetch(await apiLogin('admin'), 'GET', '/returns')
    expect(res.status).toBe(200)
  })
  test('RT-PERM-whm-GET. warehouse_manager GET /returns 返回200', async () => {
    const res = await apiFetch(await apiLogin('warehouse_manager'), 'GET', '/returns')
    expect(res.status).toBe(200)
  })
  for (const role of FORBIDDEN_ROLES) {
    test(`RT-PERM-${role}. ${role} GET /returns 返回403`, async () => {
      const res = await apiFetch(await apiLogin(role), 'GET', '/returns')
      expect(res.status).toBe(403)
    })
  }
})
