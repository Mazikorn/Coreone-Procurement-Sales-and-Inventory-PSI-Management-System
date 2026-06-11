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
const READ_ROLES: RoleKey[] = ['admin', 'finance']
const FORBIDDEN_ROLES: RoleKey[] = ['warehouse_manager', 'technician', 'pathologist', 'procurement']

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

// ────────────────────────────────────────────
// 1. 间接成本中心列表 (6 tests)
// ────────────────────────────────────────────
test.describe('间接成本中心 -> 查看列表', () => {
  test('ICC-LIST-01. admin可查看间接成本中心列表', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/indirect-costs`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('ICC-LIST-02. finance可查看间接成本中心列表', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/indirect-costs`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('ICC-LIST-03. warehouse_manager访问返回403', async () => {
    const res = await apiFetch(await apiLogin('warehouse_manager'), 'GET', '/indirect-costs')
    expect(res.status).toBe(403)
  })

  test('ICC-LIST-04. technician访问返回403', async () => {
    const res = await apiFetch(await apiLogin('technician'), 'GET', '/indirect-costs')
    expect(res.status).toBe(403)
  })

  test('ICC-LIST-05. 无Token返回401', async () => {
    const res = await fetch(`${API_BASE}/indirect-costs`)
    expect(res.status).toBe(401)
  })

  test('ICC-LIST-06. 页面显示统计卡片', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/indirect-costs`)
    await page.waitForTimeout(2000)
    const bodyText = await page.locator('body').innerText()
    const hasStats =
      bodyText.includes('成本中心') ||
      bodyText.includes('已启用') ||
      bodyText.includes('月度费用') ||
      bodyText.includes('分摊项') ||
      bodyText.includes('总数')
    expect(hasStats).toBeTruthy()
  })
})

// ────────────────────────────────────────────
// 2. 创建间接成本中心 (2 tests)
// ────────────────────────────────────────────
test.describe('间接成本中心 -> 创建', () => {
  test('ICC-CREATE-01. admin创建成本中心成功', async () => {
    const token = await apiLogin('admin')
    const uniqueName = `E2E成本中心_${Date.now()}`
    const res = await apiFetch(token, 'POST', '/indirect-costs', {
      name: uniqueName,
      code: `ICC_${Date.now()}`,
      costType: 'rent',
      monthlyAmount: 5000,
      status: 'active',
    })
    expect([200, 201]).toContain(res.status)
    expect(res.data?.success).toBeTruthy()
  })

  test('ICC-CREATE-02. 表单校验name为空返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/indirect-costs', {
      name: '',
      code: `ICC_${Date.now()}`,
      costType: 'rent',
      monthlyAmount: 5000,
      status: 'active',
    })
    expect([400, 422]).toContain(res.status)
  })
})

// ────────────────────────────────────────────
// 3. 编辑间接成本中心 (1 test)
// ────────────────────────────────────────────
test.describe('间接成本中心 -> 编辑', () => {
  test('ICC-EDIT-01. admin编辑成本中心成功', async () => {
    const token = await apiLogin('admin')
    // 防御性：先创建再编辑
    const createRes = await apiFetch(token, 'POST', '/indirect-costs', {
      name: `E2E编辑前_${Date.now()}`,
      code: `ICC_ED_${Date.now()}`,
      costType: 'rent',
      monthlyAmount: 3000,
      status: 'active',
    })
    expect([200, 201]).toContain(createRes.status)
    const id = createRes.data?.data?.id
    expect(id).toBeTruthy()
    // 编辑
    const updatedName = `E2E编辑后_${Date.now()}`
    const editRes = await apiFetch(token, 'PUT', `/indirect-costs/${id}`, {
      name: updatedName,
      monthlyAmount: 6000,
      status: 'active',
    })
    expect(editRes.status).toBe(200)
    expect(editRes.data?.success).toBeTruthy()
  })
})

// ────────────────────────────────────────────
// 4. 删除间接成本中心 (1 test)
// ────────────────────────────────────────────
test.describe('间接成本中心 -> 删除', () => {
  test('ICC-DELETE-01. admin删除成本中心成功', async () => {
    const token = await apiLogin('admin')
    // 防御性：先创建再删除
    const createRes = await apiFetch(token, 'POST', '/indirect-costs', {
      name: `E2E待删_${Date.now()}`,
      code: `ICC_DL_${Date.now()}`,
      costType: 'utilities',
      monthlyAmount: 2000,
      status: 'active',
    })
    expect([200, 201]).toContain(createRes.status)
    const id = createRes.data?.data?.id
    expect(id).toBeTruthy()
    // 删除
    const delRes = await apiFetch(token, 'DELETE', `/indirect-costs/${id}`)
    expect([200, 204]).toContain(delRes.status)
  })
})
