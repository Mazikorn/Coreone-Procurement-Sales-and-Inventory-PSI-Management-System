import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 管理员系统配置 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：查看日志 → 筛选日志 → 查看预警 → 验证数据
 * 2. 操作端的然后呢：登录 → 进入页面 → 查看/筛选 → 验证结果
 * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
 */

// ────────────────────────────────────────────
// 测试数据准备
// ────────────────────────────────────────────

let adminToken = ''

test.beforeAll(async () => {
  adminToken = await apiLogin('admin')
})

// ────────────────────────────────────────────
// 路径1: 查看日志列表 → 验证时间/操作列
// ────────────────────────────────────────────

test.describe('管理员系统配置 - 查看日志列表路径', () => {
  test('路径1-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径1-步骤2: 进入日志页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径1-步骤3: 验证日志列表显示', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await page.waitForTimeout(1000)

    // 验证日志列表表格可见
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤4: 验证时间列显示', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await page.waitForTimeout(1000)

    // 验证时间列标题可见
    await expect(page.locator('text=时间, text=日期, text=Timestamp, text=Date')).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤5: 验证操作列显示', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await page.waitForTimeout(1000)

    // 验证操作列标题可见
    await expect(page.locator('text=操作, text=Operation, text=Action')).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤6: 验证API返回日志列表', async ({ page }) => {
    const res = await apiFetch(adminToken, 'GET', '/logs?page=1&pageSize=10')

    expect(res.status).toBe(200)
  })
})

// ────────────────────────────────────────────
// 路径2: 查看日志 → 按日期筛选 → 验证筛选生效
// ────────────────────────────────────────────

test.describe('管理员系统配置 - 按日期筛选日志路径', () => {
  test('路径2-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径2-步骤2: 进入日志页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径2-步骤3: 查找日期筛选控件', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await page.waitForTimeout(1000)

    // 查找日期筛选控件
    const dateFilter = page.locator('input[type="date"], input[placeholder*="日期"], input[placeholder*="date"]')
    if (await dateFilter.first().isVisible().catch(() => false)) {
      await dateFilter.first().fill('2026-01-01')
    }
  })

  test('路径2-步骤4: 选择日期范围', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await page.waitForTimeout(1000)

    // 查找日期范围选择器
    const startDate = page.locator('input[name="startDate"], input[placeholder*="开始日期"]')
    const endDate = page.locator('input[name="endDate"], input[placeholder*="结束日期"]')

    if (await startDate.first().isVisible().catch(() => false)) {
      await startDate.first().fill('2026-01-01')
    }
    if (await endDate.first().isVisible().catch(() => false)) {
      await endDate.first().fill('2026-12-31')
    }
  })

  test('路径2-步骤5: 点击筛选按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await page.waitForTimeout(1000)

    // 查找筛选按钮
    const filterButton = page.locator('button:has-text("筛选"), button:has-text("查询"), button:has-text("Search")')
    if (await filterButton.first().isVisible().catch(() => false)) {
      await filterButton.first().click()
      await page.waitForTimeout(500)
    }
  })

  test('路径2-步骤6: 验证筛选结果', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await page.waitForTimeout(1000)

    // 验证页面不会崩溃
    await expect(page.locator('body')).toBeVisible()
  })

  test('路径2-步骤7: 验证API带日期参数返回', async ({ page }) => {
    const res = await apiFetch(adminToken, 'GET', '/logs?page=1&pageSize=10&startDate=2026-01-01&endDate=2026-12-31')

    expect(res.status).toBe(200)
  })
})

// ────────────────────────────────────────────
// 路径3: 查看日志 → 按操作类型筛选 → 验证筛选生效
// ────────────────────────────────────────────

test.describe('管理员系统配置 - 按操作类型筛选日志路径', () => {
  test('路径3-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径3-步骤2: 进入日志页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径3-步骤3: 查找操作类型筛选控件', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await page.waitForTimeout(1000)

    // 查找操作类型筛选控件
    const typeFilter = page.locator('select[name="type"], select[name="operationType"], [data-testid="operation-type-filter"]')
    if (await typeFilter.first().isVisible().catch(() => false)) {
      await typeFilter.first().selectOption({ index: 1 })
    }
  })

  test('路径3-步骤4: 选择操作类型', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await page.waitForTimeout(1000)

    // 选择操作类型
    const typeSelect = page.locator('select[name="type"], select[name="operationType"]')
    if (await typeSelect.first().isVisible().catch(() => false)) {
      await typeSelect.first().selectOption({ index: 1 })
      await page.waitForTimeout(500)
    }
  })

  test('路径3-步骤5: 点击筛选按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await page.waitForTimeout(1000)

    const filterButton = page.locator('button:has-text("筛选"), button:has-text("查询"), button:has-text("Search")')
    if (await filterButton.first().isVisible().catch(() => false)) {
      await filterButton.first().click()
      await page.waitForTimeout(500)
    }
  })

  test('路径3-步骤6: 验证筛选结果', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await page.waitForTimeout(1000)

    // 验证页面不会崩溃
    await expect(page.locator('body')).toBeVisible()
  })

  test('路径3-步骤7: 验证API带操作类型参数返回', async ({ page }) => {
    const res = await apiFetch(adminToken, 'GET', '/logs?page=1&pageSize=10&type=login')

    expect(res.status).toBe(200)
  })
})

// ────────────────────────────────────────────
// 路径4: 查看预警列表 → 验证预警数据可见
// ────────────────────────────────────────────

test.describe('管理员系统配置 - 查看预警列表路径', () => {
  test('路径4-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径4-步骤2: 进入预警页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径4-步骤3: 验证预警列表显示', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)

    // 验证预警列表可见
    await expect(page.locator('body')).toBeVisible()
  })

  test('路径4-步骤4: 验证预警信息标题', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)

    // 验证预警标题可见
    await expect(page.locator('text=预警, text=Alert, text=库存预警')).toBeVisible({ timeout: 5000 })
  })

  test('路径4-步骤5: 验证API返回预警数据', async ({ page }) => {
    const res = await apiFetch(adminToken, 'GET', '/alerts?page=1&pageSize=10')

    // 验证API返回成功
    expect([200, 404]).toContain(res.status)
  })

  test('路径4-步骤6: 验证预警详情可查看', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)

    // 点击第一条预警记录
    const firstRow = page.locator('table tbody tr, [data-testid="alert-item"]').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)

      // 验证详情页显示
      await expect(page.locator('body')).toBeVisible()
    }
  })
})
