import { test, expect, Page } from '@playwright/test'

const FE_BASE = 'http://localhost:8080'
const API_BASE = 'http://127.0.0.1:3001/api/v1'
const BASE_URL = '/abc/fee-comparison'

const ROLES = {
  admin: { username: 'admin', password: 'admin123' },
  finance: { username: 'sunli', password: 'CoreOne2026!' },
  pathologist: { username: 'liuyf', password: 'CoreOne2026!' },
  technician: { username: 'zhangwei', password: 'CoreOne2026!' },
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

test.describe('ABC 收费对照', () => {
  // ── 角色访问 ──────────────────────────────────────────

  test('ABC-FEE-01: admin 可访问收费对照页', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}${BASE_URL}`)
    await page.waitForTimeout(800)
    await expect(page).toHaveURL(new RegExp(BASE_URL))
  })

  test('ABC-FEE-02: finance 可访问收费对照页', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}${BASE_URL}`)
    await page.waitForTimeout(800)
    await expect(page).toHaveURL(new RegExp(BASE_URL))
  })

  test('ABC-FEE-03: pathologist 可访问收费对照页', async ({ page }) => {
    await loginAs(page, 'pathologist')
    await page.goto(`${FE_BASE}${BASE_URL}`)
    await page.waitForTimeout(800)
    await expect(page).toHaveURL(new RegExp(BASE_URL))
  })

  test('ABC-FEE-04: technician 访问收费对照页返回 403', async ({ page }) => {
    await loginAs(page, 'technician')
    const response = await page.goto(`${FE_BASE}${BASE_URL}`)
    await page.waitForTimeout(800)
    const status = response?.status() ?? 0
    const forbidden = status === 403 || status === 401
    const hasDenied = await page.locator('text=/无权限|禁止|403|不允许/').count() > 0
    expect(forbidden || hasDenied).toBeTruthy()
  })

  // ── UI 元素 ──────────────────────────────────────────

  test('ABC-FEE-05: 汇总卡片可见', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}${BASE_URL}`)
    await page.waitForTimeout(800)

    // 汇总卡片区域（通常包含总成本、总收费、利润率等指标）
    const summaryCards = page.locator(
      '[data-testid*="summary"], [data-testid*="card"], .stat-card, .summary-card'
    )
    await expect(summaryCards.first()).toBeVisible({ timeout: 10_000 })
    // 至少应有 2 张汇总卡片
    const cardCount = await summaryCards.count()
    expect(cardCount).toBeGreaterThanOrEqual(2)
  })

  test('ABC-FEE-06: 异常提醒栏可见', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}${BASE_URL}`)
    await page.waitForTimeout(800)

    // 异常提醒区域（成本异常、收费偏差等）
    const alertSection = page.locator(
      '[data-testid*="alert"], [data-testid*="anomaly"], [data-testid*="warning"], ' +
      '.alert, .anomaly-banner, [role="alert"]'
    ).first()
    await expect(alertSection).toBeVisible({ timeout: 10_000 })
  })

  test('ABC-FEE-07: 多条件筛选可操作', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}${BASE_URL}`)
    await page.waitForTimeout(800)

    // 找到筛选区域
    const filterArea = page.locator(
      '[data-testid*="filter"], .filter-bar, form:has(select), form:has(input[type="text"])'
    ).first()
    await expect(filterArea).toBeVisible()

    // 至少有 1 个可交互的筛选控件
    const filterControls = filterArea.locator('select, [role="combobox"], input[type="text"], input[type="date"]')
    const controlCount = await filterControls.count()
    expect(controlCount).toBeGreaterThanOrEqual(1)
  })

  test('ABC-FEE-08: 表格可见且有数据行', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}${BASE_URL}`)
    await page.waitForTimeout(800)

    // 表格存在
    const table = page.locator('table, [role="table"]').first()
    await expect(table).toBeVisible({ timeout: 10_000 })

    // 有数据行
    const rows = page.locator('table tbody tr, [role="row"]').first()
    await expect(rows).toBeVisible()
  })

  test('ABC-FEE-09: 分页可操作', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}${BASE_URL}`)
    await page.waitForTimeout(800)

    // 分页组件
    const pagination = page.locator(
      '[data-testid*="pagination"], nav[aria-label*="pagination"], .pagination, ' +
      'button:has-text("下一页"), button:has-text("Next")'
    ).first()
    await expect(pagination).toBeVisible({ timeout: 10_000 })

    // 下一页按钮可点击（非禁用）
    const nextBtn = page.locator(
      'button:has-text("下一页"), button:has-text("Next"), [aria-label="Next page"]'
    ).first()
    if (await nextBtn.isVisible()) {
      await expect(nextBtn).toBeEnabled()
    }
  })

  test('ABC-FEE-10: 导出按钮可见', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}${BASE_URL}`)
    await page.waitForTimeout(800)

    const exportBtn = page.locator(
      'button:has-text("导出"), button:has-text("Export"), [data-testid*="export"]'
    ).first()
    await expect(exportBtn).toBeVisible()
  })

  // ── 异常与防御 ────────────────────────────────────────

  test('ABC-FEE-11: 空数据不崩溃', async ({ page }) => {
    await loginAs(page, 'admin')

    // 拦截所有相关 API，返回空数据
    await page.route('**/api/**/fee-comparison**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { items: [], total: 0, summary: {} },
        }),
      })
    })

    await page.goto(`${FE_BASE}${BASE_URL}`)
    await page.waitForTimeout(800)

    // 页面不应白屏或报错
    await expect(page.locator('body')).toBeVisible()
    const errorOverlay = page.locator('[data-testid="error-boundary"], .error-boundary')
    await expect(errorOverlay).toHaveCount(0)
  })

  test('ABC-FEE-12: API 500 不崩溃', async ({ page }) => {
    await loginAs(page, 'admin')

    // 拦截所有相关 API，返回 500
    await page.route('**/api/**/fee-comparison**', (route) => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Internal Server Error' }),
      })
    })

    await page.goto(`${FE_BASE}${BASE_URL}`)
    await page.waitForTimeout(800)

    // 页面不应白屏，应展示错误提示
    await expect(page.locator('body')).toBeVisible()
    const errorOverlay = page.locator('[data-testid="error-boundary"], .error-boundary')
    await expect(errorOverlay).toHaveCount(0)
  })
})
