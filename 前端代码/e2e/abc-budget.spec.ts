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
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ROLES[role]),
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

test.beforeEach(async ({ page }) => {
  await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
})

// ───────────────────────────────────────────────
// 1. 角色访问权限
// ───────────────────────────────────────────────
test.describe('预算管理 -> 角色访问', () => {
  test('ABC-BUD-01. admin 可访问预算管理页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/abc/budgets`)
    await page.waitForTimeout(2500)
    await expect(page.locator('text=/预算/i').first()).toBeVisible({ timeout: 10000 })
  })

  test('ABC-BUD-02. finance 可访问预算管理页面', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/abc/budgets`)
    await page.waitForTimeout(2500)
    await expect(page.locator('text=/预算/i').first()).toBeVisible({ timeout: 10000 })
  })

  test('ABC-BUD-03. pathologist 可访问预算管理页面', async ({ page }) => {
    await loginAs(page, 'pathologist')
    await page.goto(`${FE_BASE}/abc/budgets`)
    await page.waitForTimeout(2500)
    await expect(page.locator('text=/预算/i').first()).toBeVisible({ timeout: 10000 })
  })

  test('ABC-BUD-04. warehouse_manager 访问返回 403', async ({ page }) => {
    await loginAs(page, 'warehouse_manager')
    await page.goto(`${FE_BASE}/abc/budgets`)
    await page.waitForTimeout(2000)
    const has403 = await page.locator('text=/无权访问|403|Forbidden|无权限/i').first().isVisible().catch(() => false)
    const redirected = page.url().includes('/login') || page.url() === `${FE_BASE}/`
    expect(has403 || redirected).toBeTruthy()
  })
})

// ───────────────────────────────────────────────
// 2. 页面内容
// ───────────────────────────────────────────────
test.describe('预算管理 -> 页面内容', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/abc/budgets`)
    await page.waitForTimeout(2500)
  })

  test('ABC-BUD-05. 月份筛选可操作', async ({ page }) => {
    const monthInput = page.locator('input[type="month"]').first()
    await expect(monthInput).toBeVisible({ timeout: 10000 })
    await monthInput.click()
    await expect(monthInput).toBeEnabled()
  })

  test('ABC-BUD-06. 表格可见且有数据行', async ({ page }) => {
    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 10000 })
    const rows = table.locator('tbody tr')
    const count = await rows.count()
    // 至少有 1 行数据行或"暂无数据"占位行
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('ABC-BUD-07. 表格列标题包含关键字段', async ({ page }) => {
    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 10000 })
    const headerText = await table.locator('thead').textContent()
    expect(headerText).toBeTruthy()
    for (const col of ['月份', '成本类型', '预算金额', '实际金额', '执行进度']) {
      expect(headerText!).toContain(col)
    }
  })

  test('ABC-BUD-08. 新增预算弹窗可打开', async ({ page }) => {
    const addBtn = page.locator('button:has-text("新增预算")')
    await expect(addBtn).toBeVisible({ timeout: 10000 })
    await addBtn.click()
    await page.waitForTimeout(500)
    const modal = page.locator('text=/新增预算|编辑预算/i').first()
    const isVisible = await modal.isVisible().catch(() => false)
    expect(isVisible).toBeTruthy()
  })
})

// ───────────────────────────────────────────────
// 3. 边界与异常
// ───────────────────────────────────────────────
test.describe('预算管理 -> 边界与异常', () => {
  test('ABC-BUD-09. 空数据不崩溃', async ({ page }) => {
    await page.route('**/api/v1/abc/budgets**', r =>
      r.fulfill({ status: 200, body: JSON.stringify({ data: { list: [], items: [] } }) })
    )
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/abc/budgets`)
    await page.waitForTimeout(2500)
    await page.unroute('**/api/v1/abc/budgets**')
    // 页面不应白屏
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
    const hasEmpty = await page.locator('text=/暂无/i').first().isVisible().catch(() => false)
    const hasTable = await page.locator('table').first().isVisible().catch(() => false)
    expect(hasEmpty || hasTable).toBeTruthy()
  })

  test('ABC-BUD-10. API 500 不崩溃', async ({ page }) => {
    await page.route('**/api/v1/abc/budgets**', r =>
      r.fulfill({ status: 500, body: JSON.stringify({ message: 'Internal Server Error' }) })
    )
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/abc/budgets`)
    await page.waitForTimeout(2500)
    await page.unroute('**/api/v1/abc/budgets**')
    // 页面不应白屏，应有错误提示或正常渲染
    await expect(page.locator('body')).toBeVisible({ timeout: 10000 })
  })
})
