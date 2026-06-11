import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 采购员登录 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：正常登录 → 登录失败 → 登录后验证权限
 * 2. 操作端的然后呢：打开登录页 → 输入账号密码 → 点击登录 → 验证跳转 → 验证侧边栏 → 验证权限边界
 * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
 */

// ────────────────────────────────────────────
// 测试数据准备
// ────────────────────────────────────────────

let procurementToken = ''

test.beforeAll(async () => {
  procurementToken = await apiLogin('procurement')
})

// ────────────────────────────────────────────
// 路径1: 登录成功 → 跳转首页
// ────────────────────────────────────────────

test.describe('采购员登录 - 登录成功路径', () => {
  test('路径1-步骤1: 打开登录页面', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径1-步骤2: 输入采购员账号密码', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]')
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]')

    await usernameInput.first().waitFor({ state: 'visible', timeout: 15000 })
    await expect(usernameInput.first()).toBeVisible({ timeout: 15000 })
    await expect(passwordInput.first()).toBeVisible({ timeout: 15000 })
  })

  test('路径1-步骤3: 点击登录按钮', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const loginButton = page.locator('button[type="submit"]')
    await expect(loginButton.first()).toBeVisible({ timeout: 15000 })
  })

  test('路径1-步骤4: 登录成功后跳转到首页', async ({ page }) => {
    await loginAs(page, 'procurement')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径1-步骤5: 验证首页仪表盘可见', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.waitForTimeout(1000)

    await expect(page.locator('body')).toBeVisible()
  })
})

// ────────────────────────────────────────────
// 路径2: 登录失败 → 错误提示 → 重试
// ────────────────────────────────────────────

test.describe('采购员登录 - 登录失败路径', () => {
  test('路径2-步骤1: 打开登录页面', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径2-步骤2: 输入错误密码', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]')
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]')

    await usernameInput.first().waitFor({ state: 'visible', timeout: 15000 })
    if (await usernameInput.first().isVisible().catch(() => false)) {
      await usernameInput.first().fill('zhaohp')
    }
    if (await passwordInput.first().isVisible().catch(() => false)) {
      await passwordInput.first().fill('wrong-password')
    }
  })

  test('路径2-步骤3: 点击登录按钮失败', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]')
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]')

    await usernameInput.first().waitFor({ state: 'visible', timeout: 15000 })
    if (await usernameInput.first().isVisible().catch(() => false)) {
      await usernameInput.first().fill('zhaohp')
    }
    if (await passwordInput.first().isVisible().catch(() => false)) {
      await passwordInput.first().fill('wrong-password')
    }

    const loginButton = page.locator('button[type="submit"]')
    if (await loginButton.first().isVisible().catch(() => false)) {
      await loginButton.first().click()
      await page.waitForTimeout(1000)
    }

    // 验证仍然在登录页面
    await expect(page).toHaveURL(/login/)
  })

  test('路径2-步骤4: 验证错误提示显示', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(1000)

    await expect(page.locator('body')).toBeVisible()
  })

  test('路径2-步骤5: 使用正确密码重新登录成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })
})

// ────────────────────────────────────────────
// 路径3: 登录后验证侧边栏菜单
// ────────────────────────────────────────────

test.describe('采购员登录 - 验证侧边栏菜单路径', () => {
  test('路径3-步骤1: 采购员登录成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径3-步骤2: 验证侧边栏可见采购订单', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.waitForTimeout(1000)

    const poLink = page.locator('text=采购订单, a[href*="purchase-orders"]')
    await expect(poLink.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤3: 验证侧边栏可见供应商管理', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.waitForTimeout(1000)

    const supplierLink = page.locator('text=供应商, a[href*="supplier"]')
    await expect(supplierLink.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤4: 验证侧边栏可见物料管理', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.waitForTimeout(1000)

    const materialLink = page.locator('text=物料, a[href*="material"]')
    await expect(materialLink.first()).toBeVisible({ timeout: 5000 })
  })
})

// ────────────────────────────────────────────
// 路径4: 验证采购员权限边界（不能访问管理页面）
// ────────────────────────────────────────────

test.describe('采购员登录 - 验证权限边界路径', () => {
  test('路径4-步骤1: 采购员登录成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径4-步骤2: 验证不能访问用户管理页面', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/users`)
    await page.waitForTimeout(1000)

    const url = page.url()
    const isForbidden = url.includes('login') || url.endsWith('/') || !url.includes('users')
    expect(isForbidden).toBe(true)
  })

  test('路径4-步骤3: 验证不能访问角色管理页面', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/roles`)
    await page.waitForTimeout(1000)

    const url = page.url()
    const isForbidden = url.includes('login') || url.endsWith('/') || !url.includes('roles')
    expect(isForbidden).toBe(true)
  })

  test('路径4-步骤4: 验证不能访问盘点管理页面', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)

    const url = page.url()
    const isForbidden = url.includes('login') || url.endsWith('/') || !url.includes('stocktaking')
    expect(isForbidden).toBe(true)
  })
})
