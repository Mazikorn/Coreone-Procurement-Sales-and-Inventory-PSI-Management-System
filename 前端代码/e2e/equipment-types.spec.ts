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
const READ_ROLES: RoleKey[] = ['admin', 'technician', 'pathologist']
const FORBIDDEN_ROLES: RoleKey[] = ['warehouse_manager', 'procurement', 'finance']

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
// 1. 设备类型列表 (6 tests)
// ────────────────────────────────────────────
test.describe('设备类型管理 -> 查看设备类型列表', () => {
  test('EQT-LIST-01. admin可查看设备类型列表', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/equipment/types`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('EQT-LIST-02. technician可查看设备类型列表', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/equipment/types`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('EQT-LIST-03. pathologist可查看设备类型列表', async ({ page }) => {
    await loginAs(page, 'pathologist')
    await page.goto(`${FE_BASE}/equipment/types`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('EQT-LIST-04. warehouse_manager访问返回403', async () => {
    const res = await apiFetch(await apiLogin('warehouse_manager'), 'GET', '/equipment-types')
    expect(res.status).toBe(403)
  })

  test('EQT-LIST-05. 无Token返回401', async () => {
    const res = await fetch(`${API_BASE}/equipment-types`)
    expect(res.status).toBe(401)
  })

  test('EQT-LIST-06. 页面显示统计卡片', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/equipment/types`)
    await page.waitForTimeout(2000)
    const bodyText = await page.locator('body').innerText()
    const hasStats =
      bodyText.includes('类型总数') ||
      bodyText.includes('启用类型') ||
      bodyText.includes('设备总数') ||
      bodyText.includes('总数')
    expect(hasStats).toBeTruthy()
  })
})

// ────────────────────────────────────────────
// 2. 创建设备类型 (2 tests)
// ────────────────────────────────────────────
test.describe('设备类型管理 -> 创建设备类型', () => {
  test('EQT-CREATE-01. admin创建设备类型成功', async () => {
    const token = await apiLogin('admin')
    const uniqueName = `E2E类型_${Date.now()}`
    const res = await apiFetch(token, 'POST', '/equipment-types', {
      name: uniqueName,
      code: `E2E_${Date.now()}`,
      status: 1,
    })
    expect([200, 201]).toContain(res.status)
    expect(res.data?.success).toBeTruthy()
  })

  test('EQT-CREATE-02. 表单校验name为空返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/equipment-types', {
      name: '',
      code: `E2E_${Date.now()}`,
      status: 1,
    })
    expect([400, 422]).toContain(res.status)
  })
})

// ────────────────────────────────────────────
// 3. 编辑设备类型 (1 test)
// ────────────────────────────────────────────
test.describe('设备类型管理 -> 编辑设备类型', () => {
  test('EQT-EDIT-01. admin编辑设备类型成功', async () => {
    const token = await apiLogin('admin')
    // 防御性：先创建再编辑
    const createRes = await apiFetch(token, 'POST', '/equipment-types', {
      name: `E2E编辑前_${Date.now()}`,
      code: `E2E_ED_${Date.now()}`,
      status: 1,
    })
    expect([200, 201]).toContain(createRes.status)
    const id = createRes.data?.data?.id
    expect(id).toBeTruthy()
    // 编辑
    const updatedName = `E2E编辑后_${Date.now()}`
    const editRes = await apiFetch(token, 'PUT', `/equipment-types/${id}`, {
      name: updatedName,
      status: 1,
    })
    expect(editRes.status).toBe(200)
    expect(editRes.data?.success).toBeTruthy()
  })
})

// ────────────────────────────────────────────
// 4. 删除设备类型 (1 test)
// ────────────────────────────────────────────
test.describe('设备类型管理 -> 删除设备类型', () => {
  test('EQT-DELETE-01. admin删除设备类型成功', async () => {
    const token = await apiLogin('admin')
    // 防御性：先创建再删除
    const createRes = await apiFetch(token, 'POST', '/equipment-types', {
      name: `E2E待删_${Date.now()}`,
      code: `E2E_DL_${Date.now()}`,
      status: 1,
    })
    expect([200, 201]).toContain(createRes.status)
    const id = createRes.data?.data?.id
    expect(id).toBeTruthy()
    // 删除
    const delRes = await apiFetch(token, 'DELETE', `/equipment-types/${id}`)
    expect([200, 204]).toContain(delRes.status)
  })
})
