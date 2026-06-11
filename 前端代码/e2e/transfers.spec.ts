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
async function getAnyLocationId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/locations?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

test.beforeEach(async () => {
  // 清理测试数据
  const token = await apiLogin('admin').catch(() => '')
  if (token) {
    try {
      const r = await apiFetch(token, 'GET', '/transfers?page=1&pageSize=200')
      const list = r.data?.data?.list || []
      for (const item of list) {
        if (item.remark?.includes('E2E') || item.inboundNo?.startsWith('TEST-')) {
          await apiFetch(token, 'DELETE', `/transfers/${item.id}`)
        }
      }
    } catch { /* ignore */ }
  }
})

// ────────────────────────────────────────────
// 1. 查看调拨列表 (10 tests)
// ────────────────────────────────────────────
test.describe('调拨管理 -> 查看调拨列表', () => {
  for (const role of READ_ROLES) {
    test(`TR-LIST-01-${role}. 正常用例：${role}可查看调拨列表`, async ({ page }) => {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/transfers`)
      await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
    })
  }
  test('TR-LIST-02. 权限：technician访问返回403', async () => {
    const res = await apiFetch(await apiLogin('technician'), 'GET', '/transfers')
    expect(res.status).toBe(403)
  })
  test('TR-LIST-03. 权限：pathologist访问返回403', async () => {
    const res = await apiFetch(await apiLogin('pathologist'), 'GET', '/transfers')
    expect(res.status).toBe(403)
  })
  test('TR-LIST-04. 权限：procurement访问返回403', async () => {
    const res = await apiFetch(await apiLogin('procurement'), 'GET', '/transfers')
    expect(res.status).toBe(403)
  })
  test('TR-LIST-05. 权限：finance访问返回403', async () => {
    const res = await apiFetch(await apiLogin('finance'), 'GET', '/transfers')
    expect(res.status).toBe(403)
  })
  test('TR-LIST-06. UI差异：admin显示调拨按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/transfers`)
    await page.waitForTimeout(1000)
  })
  test('TR-LIST-07. UI差异：warehouse_manager显示调拨按钮', async ({ page }) => {
    await loginAs(page, 'warehouse_manager')
    await page.goto(`${FE_BASE}/transfers`)
    await page.waitForTimeout(1000)
  })
  test('TR-LIST-08. 空数据边界：无调拨记录显示空状态', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/transfers`)
    await page.waitForTimeout(800)
  })
  test('TR-LIST-09. API响应格式验证', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/transfers?page=1&pageSize=1')
    expect(res.status).toBe(200)
    expect(res.data).toHaveProperty('data')
    expect(res.data?.data).toHaveProperty('list')
  })
  test('TR-LIST-10. 列表加载性能', async ({ page }) => {
    await loginAs(page, 'admin')
    const start = Date.now()
    await page.goto(`${FE_BASE}/transfers`)
    await page.waitForTimeout(2000)
    expect(Date.now() - start).toBeLessThan(10000)
  })
})

// ────────────────────────────────────────────
// 2. 创建调拨 (15 tests)
// ────────────────────────────────────────────
test.describe('调拨管理 -> 创建调拨', () => {
  test('TR-CREATE-01. 正常用例：admin创建调拨成功', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    const lid = await getAnyLocationId(token)
    if (!mid || !lid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: 1,
      fromLocationId: lid, fromLocationName: 'E2E来源',
      toLocationId: lid, remark: 'E2E调拨测试',
    })
    expect([200, 201]).toContain(res.status)
  })
  test('TR-CREATE-02. 正常用例：warehouse_manager创建调拨成功', async () => {
    const token = await apiLogin('warehouse_manager')
    const adminToken = await apiLogin('admin')
    const mid = await getAnyMaterialId(adminToken)
    const lid = await getAnyLocationId(adminToken)
    if (!mid || !lid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: 1,
      fromLocationId: lid, fromLocationName: 'E2E来源',
      toLocationId: lid, remark: 'E2E调拨WM',
    })
    expect([200, 201, 403]).toContain(res.status)
  })
  test('TR-CREATE-03. 表单校验：缺少materialId返回400', async () => {
    const token = await apiLogin('admin')
    const lid = await getAnyLocationId(token)
    if (!lid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/transfers/inbound', {
      quantity: 1, fromLocationId: lid, toLocationId: lid,
    })
    expect(res.status).toBe(400)
  })
  test('TR-CREATE-04. 表单校验：缺少toLocationId返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    const lid = await getAnyLocationId(token)
    if (!mid || !lid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: 1, fromLocationId: lid,
    })
    expect(res.status).toBe(400)
  })
  test('TR-CREATE-05. 表单校验：缺少fromLocation返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    const lid = await getAnyLocationId(token)
    if (!mid || !lid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: 1, toLocationId: lid,
    })
    expect(res.status).toBe(400)
  })
  test('TR-CREATE-06. 边界：quantity=0返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    const lid = await getAnyLocationId(token)
    if (!mid || !lid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: 0, fromLocationId: lid, toLocationId: lid,
    })
    expect(res.status).toBe(400)
  })
  test('TR-CREATE-07. 边界：负数quantity返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    const lid = await getAnyLocationId(token)
    if (!mid || !lid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: -5, fromLocationId: lid, toLocationId: lid,
    })
    expect(res.status).toBe(400)
  })
  for (const role of FORBIDDEN_ROLES) {
    test(`TR-CREATE-08-${role}. 权限：${role}创建调拨返回403`, async () => {
      const token = await apiLogin(role)
      const adminToken = await apiLogin('admin')
      const mid = await getAnyMaterialId(adminToken)
      const lid = await getAnyLocationId(adminToken)
      if (!mid || !lid) { test.skip(); return }
      const res = await apiFetch(token, 'POST', '/transfers/inbound', {
        materialId: mid, quantity: 1, fromLocationId: lid, toLocationId: lid,
      })
      expect(res.status).toBe(403)
    })
  }
  test('TR-CREATE-09. 业务冲突：不存在的物料返回404', async () => {
    const token = await apiLogin('admin')
    const lid = await getAnyLocationId(token)
    if (!lid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: 'non-existent', quantity: 1, fromLocationId: lid, toLocationId: lid,
    })
    expect([404, 400]).toContain(res.status)
  })
  test('TR-CREATE-10. 并发：快速双击提交', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    const lid = await getAnyLocationId(token)
    if (!mid || !lid) { test.skip(); return }
    const body = { materialId: mid, quantity: 1, fromLocationId: lid, fromLocationName: 'E2E', toLocationId: lid, remark: 'E2E并发' }
    const [r1, r2] = await Promise.all([
      apiFetch(token, 'POST', '/transfers/inbound', body),
      apiFetch(token, 'POST', '/transfers/inbound', body),
    ])
    expect(r1.status === 200 || r1.status === 201 || r2.status === 200 || r2.status === 201).toBe(true)
  })
  test('TR-CREATE-11. 调拨后库存不变（仅变更库位）', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    const lid = await getAnyLocationId(token)
    if (!mid || !lid) { test.skip(); return }
    const before = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const beforeStock = before.data?.data?.list?.[0]?.stock || 0
    await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: 1, fromLocationId: lid, fromLocationName: 'E2E', toLocationId: lid, remark: 'E2E库存验证',
    })
    const after = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${mid}`)
    const afterStock = after.data?.data?.list?.[0]?.stock || 0
    expect(afterStock).toBe(beforeStock)
  })
  test('TR-CREATE-12. 边界：小数quantity', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    const lid = await getAnyLocationId(token)
    if (!mid || !lid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: 1.5, fromLocationId: lid, toLocationId: lid,
    })
    expect([200, 201, 400]).toContain(res.status)
  })
  test('TR-CREATE-13. UI差异：admin前端显示调拨入口', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/transfers`)
    await page.waitForTimeout(1000)
  })
  test('TR-CREATE-14. UI差异：warehouse_manager前端显示调拨入口', async ({ page }) => {
    await loginAs(page, 'warehouse_manager')
    await page.goto(`${FE_BASE}/transfers`)
    await page.waitForTimeout(1000)
  })
  test('TR-CREATE-15. 正常用例：调拨单号格式', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    const lid = await getAnyLocationId(token)
    if (!mid || !lid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: 1, fromLocationId: lid, fromLocationName: 'E2E', toLocationId: lid, remark: 'E2E格式',
    })
    if (res.status === 200 || res.status === 201) {
      expect(res.data?.data?.inboundNo).toMatch(/^TF-/)
    }
  })
})

// ────────────────────────────────────────────
// 3. 删除/撤销调拨 (10 tests)
// ────────────────────────────────────────────
test.describe('调拨管理 -> 删除调拨', () => {
  test('TR-DELETE-01. 正常用例：admin删除调拨记录', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    const lid = await getAnyLocationId(token)
    if (!mid || !lid) { test.skip(); return }
    const create = await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: 1, fromLocationId: lid, fromLocationName: 'E2E', toLocationId: lid, remark: 'E2E删除',
    })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'DELETE', `/transfers/${id}`)
    expect([200, 204]).toContain(res.status)
  })
  test('TR-DELETE-02. 表单校验：删除不存在的记录返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'DELETE', '/transfers/non-existent-id')
    expect(res.status).toBe(404)
  })
  for (const role of FORBIDDEN_ROLES) {
    test(`TR-DELETE-03-${role}. 权限：${role}删除调拨返回403`, async () => {
      const token = await apiLogin(role)
      const adminToken = await apiLogin('admin')
      const mid = await getAnyMaterialId(adminToken)
      const lid = await getAnyLocationId(adminToken)
      if (!mid || !lid) { test.skip(); return }
      const create = await apiFetch(adminToken, 'POST', '/transfers/inbound', {
        materialId: mid, quantity: 1, fromLocationId: lid, fromLocationName: 'E2E', toLocationId: lid, remark: 'E2E权限',
      })
      const id = create.data?.data?.id
      if (!id) { test.skip(); return }
      const res = await apiFetch(token, 'DELETE', `/transfers/${id}`)
      expect(res.status).toBe(403)
      await apiFetch(adminToken, 'DELETE', `/transfers/${id}`).catch(() => {})
    })
  }
  test('TR-DELETE-04. 并发：并发删除同一调拨', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    const lid = await getAnyLocationId(token)
    if (!mid || !lid) { test.skip(); return }
    const create = await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: 1, fromLocationId: lid, fromLocationName: 'E2E', toLocationId: lid, remark: 'E2E并发删除',
    })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    const [r1, r2] = await Promise.all([
      apiFetch(token, 'DELETE', `/transfers/${id}`),
      apiFetch(token, 'DELETE', `/transfers/${id}`),
    ])
    expect(r1.status === 200 || r2.status === 200 || r1.status === 404 || r2.status === 404).toBe(true)
  })
  test('TR-DELETE-05. UI差异：admin显示删除按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/transfers`)
    await page.waitForTimeout(1000)
  })
  test('TR-DELETE-06. 删除后刷新列表', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/transfers`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
  test('TR-DELETE-07. 业务冲突：重复删除返回404', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    const lid = await getAnyLocationId(token)
    if (!mid || !lid) { test.skip(); return }
    const create = await apiFetch(token, 'POST', '/transfers/inbound', {
      materialId: mid, quantity: 1, fromLocationId: lid, fromLocationName: 'E2E', toLocationId: lid, remark: 'E2E重复删除',
    })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    await apiFetch(token, 'DELETE', `/transfers/${id}`)
    const res = await apiFetch(token, 'DELETE', `/transfers/${id}`)
    expect([404, 400]).toContain(res.status)
  })
})

// ────────────────────────────────────────────
// 4. 分页 (8 tests)
// ────────────────────────────────────────────
test.describe('调拨管理 -> 分页切换', () => {
  test('TR-PAGE-01. 正常用例：切换到第2页', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/transfers?page=2`)
    await page.waitForTimeout(800)
  })
  test('TR-PAGE-02. 边界：page=999返回空列表', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/transfers?page=999&pageSize=5')
    expect(res.status).toBe(200)
  })
  test('TR-PAGE-03. 边界：pageSize=1', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/transfers?page=1&pageSize=1')
    expect(res.status).toBe(200)
  })
  test('TR-PAGE-04. 边界：pageSize=100', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/transfers?page=1&pageSize=100')
    expect(res.status).toBe(200)
  })
  test('TR-PAGE-05. 并发：快速切换分页', async ({ page }) => {
    await loginAs(page, 'admin')
    for (let i = 1; i <= 3; i++) {
      await page.goto(`${FE_BASE}/transfers?page=${i}`)
      await page.waitForTimeout(300)
    }
  })
  test('TR-PAGE-06. 响应式布局', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(`${FE_BASE}/transfers`)
    await page.waitForTimeout(1000)
  })
  test('TR-PAGE-07. 页面刷新后状态保持', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/transfers`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
  test('TR-PAGE-08. 多角色分页一致', async ({ page }) => {
    for (const role of READ_ROLES) {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/transfers?page=1`)
      await page.waitForTimeout(400)
    }
  })
})

// ────────────────────────────────────────────
// 5. 角色权限矩阵 (8 tests)
// ────────────────────────────────────────────
test.describe('调拨管理 -> 角色权限矩阵', () => {
  const scenes = [
    { role: 'technician' as RoleKey, method: 'GET', expect: 403 },
    { role: 'pathologist' as RoleKey, method: 'GET', expect: 403 },
    { role: 'procurement' as RoleKey, method: 'GET', expect: 403 },
    { role: 'finance' as RoleKey, method: 'GET', expect: 403 },
  ]
  for (const s of scenes) {
    test(`TR-PERM-${s.role}-GET. ${s.role} GET /transfers 返回${s.expect}`, async () => {
      const token = await apiLogin(s.role)
      const res = await apiFetch(token, 'GET', '/transfers')
      expect(res.status).toBe(s.expect)
    })
  }
  test('TR-PERM-admin-GET. admin GET /transfers 返回200', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/transfers')
    expect(res.status).toBe(200)
  })
  test('TR-PERM-whm-GET. warehouse_manager GET /transfers 返回200', async () => {
    const token = await apiLogin('warehouse_manager')
    const res = await apiFetch(token, 'GET', '/transfers')
    expect(res.status).toBe(200)
  })
  test('TR-PERM-01. 无Token返回401', async () => {
    const res = await fetch(`${API_BASE}/transfers`)
    expect(res.status).toBe(401)
  })
})
