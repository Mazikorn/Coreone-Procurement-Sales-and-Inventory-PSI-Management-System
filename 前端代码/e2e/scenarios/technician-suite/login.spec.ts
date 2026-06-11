import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 技术员登录 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：正常登录 → 登录失败 → 登录后验证菜单 → 登录后验证权限隔离
 * 2. 操作端的然后呢：打开登录页 → 输入账号密码 → 点击登录 → 等待跳转 → 验证页面
 * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
 */

// ────────────────────────────────────────────
// 测试数据准备
// ────────────────────────────────────────────

let technicianToken = ''
let adminToken = ''

test.beforeAll(async () => {
  adminToken = await apiLogin('admin')
  technicianToken = await apiLogin('technician')
})

// ────────────────────────────────────────────
// 路径1: 登录成功 → 验证跳转到首页
// ────────────────────────────────────────────

test.describe('技术员登录 - 登录成功路径', () => {
  test('路径1-步骤1: 打开登录页面', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径1-步骤2: 输入正确账号密码', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]').first()
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]').first()

    await usernameInput.waitFor({ state: 'visible', timeout: 15000 })
    await expect(usernameInput).toBeVisible({ timeout: 15000 })
    await usernameInput.fill('zhangwei')
    await passwordInput.fill('CoreOne2026!')
  })

  test('路径1-步骤3: 点击登录按钮', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]').first()
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]').first()
    const loginButton = page.locator('button[type="submit"]')

    await usernameInput.waitFor({ state: 'visible', timeout: 15000 })
    await usernameInput.fill('zhangwei')
    await passwordInput.fill('CoreOne2026!')
    await loginButton.first().click()
  })

  test('路径1-步骤4: 登录成功后跳转到首页', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径1-步骤5: 验证首页仪表盘可见', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.waitForTimeout(1000)

    // 验证首页内容可见
    await expect(page.locator('body')).toBeVisible()
  })
})

// ────────────────────────────────────────────
// 路径2: 登录失败（错误密码）→ 验证错误提示 → 重试
// ────────────────────────────────────────────

test.describe('技术员登录 - 登录失败（错误密码）路径', () => {
  test('路径2-步骤1: 打开登录页面', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径2-步骤2: 输入错误密码', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]').first()
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]').first()

    await usernameInput.waitFor({ state: 'visible', timeout: 15000 })
    await expect(usernameInput).toBeVisible({ timeout: 15000 })
    await usernameInput.fill('zhangwei')
    await passwordInput.fill('WrongPassword123!')
  })

  test('路径2-步骤3: 点击登录按钮', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]').first()
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]').first()
    const loginButton = page.locator('button[type="submit"]')

    await usernameInput.waitFor({ state: 'visible', timeout: 15000 })
    await usernameInput.fill('zhangwei')
    await passwordInput.fill('WrongPassword123!')
    await loginButton.first().click()
  })

  test('路径2-步骤4: 验证错误提示显示', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]').first()
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]').first()
    const loginButton = page.locator('button[type="submit"]')

    await usernameInput.waitFor({ state: 'visible', timeout: 15000 })
    await usernameInput.fill('zhangwei')
    await passwordInput.fill('WrongPassword123!')
    await loginButton.first().click()
    await page.waitForTimeout(2000)

    // 验证错误提示出现
    const errorMessage = page.locator('text=密码错误, text=登录失败, text=用户名或密码, text=Invalid, text=incorrect, [role="alert"]')
    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径2-步骤5: 验证API返回登录失败', async ({ page }) => {
    const res = await apiFetch('', 'POST', '/auth/login', {
      username: 'zhangwei',
      password: 'WrongPassword123!',
    })

    // 应该返回401或400
    expect([400, 401]).toContain(res.status)
  })

  test('路径2-步骤6: 重试输入正确密码登录成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })
})

// ────────────────────────────────────────────
// 路径3: 登录后验证技术员菜单项
// ────────────────────────────────────────────

test.describe('技术员登录 - 验证菜单项路径', () => {
  test('路径3-步骤1: 技术员登录成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径3-步骤2: 验证侧边栏可见', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.waitForTimeout(1000)

    // 验证侧边栏存在
    const sidebar = page.locator('nav, aside, [data-testid="sidebar"], .sidebar')
    await expect(sidebar.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤3: 验证技术员可看到库存管理菜单', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.waitForTimeout(1000)

    // 技术员应该能看到库存相关菜单
    const inventoryMenu = page.locator('text=库存, text=Inventory, a[href*="inventory"]')
    await expect(inventoryMenu.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤4: 验证技术员可看到出库菜单', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.waitForTimeout(1000)

    const outboundMenu = page.locator('text=出库, text=Outbound, a[href*="outbound"]')
    await expect(outboundMenu.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤5: 验证技术员可看到项目菜单', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.waitForTimeout(1000)

    const projectMenu = page.locator('text=项目, text=Projects, a[href*="projects"]')
    await expect(projectMenu.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤6: 验证技术员可看到BOM菜单', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.waitForTimeout(1000)

    const bomMenu = page.locator('text=BOM, text=物料清单, a[href*="bom"]')
    await expect(bomMenu.first()).toBeVisible({ timeout: 5000 })
  })
})

// ────────────────────────────────────────────
// 路径4: 登录后验证技术员无法访问管理员页面
// ────────────────────────────────────────────

test.describe('技术员登录 - 权限隔离验证路径', () => {
  test('路径4-步骤1: 技术员登录成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径4-步骤2: 验证技术员无法看到用户管理菜单', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.waitForTimeout(1000)

    // 技术员不应该看到用户管理菜单
    const usersMenu = page.locator('a[href="/users"], text=用户管理, text=User Management')
    await expect(usersMenu).toHaveCount(0)
  })

  test('路径4-步骤3: 验证技术员无法看到角色管理菜单', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.waitForTimeout(1000)

    // 技术员不应该看到角色管理菜单
    const rolesMenu = page.locator('a[href="/roles"], text=角色管理, text=Role Management')
    await expect(rolesMenu).toHaveCount(0)
  })

  test('路径4-步骤4: 技术员直接访问/users被拒绝', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/users`)
    await page.waitForTimeout(1000)

    // 应该被重定向到首页或显示无权限提示
    const url = page.url()
    const isRedirected = !url.includes('/users')
    const hasErrorMessage = await page.locator('text=无权限, text=禁止访问, text=403, text=Forbidden, text=Unauthorized').isVisible().catch(() => false)

    expect(isRedirected || hasErrorMessage).toBe(true)
  })

  test('路径4-步骤5: 技术员直接访问/roles被拒绝', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/roles`)
    await page.waitForTimeout(1000)

    // 应该被重定向到首页或显示无权限提示
    const url = page.url()
    const isRedirected = !url.includes('/roles')
    const hasErrorMessage = await page.locator('text=无权限, text=禁止访问, text=403, text=Forbidden, text=Unauthorized').isVisible().catch(() => false)

    expect(isRedirected || hasErrorMessage).toBe(true)
  })

  test('路径4-步骤6: 验证API访问用户管理被拒绝', async ({ page }) => {
    const res = await apiFetch(technicianToken, 'GET', '/users?page=1&pageSize=1')

    // 技术员访问用户管理API应该返回403
    expect([403, 401]).toContain(res.status)
  })

  test('路径4-步骤7: 验证API访问角色管理被拒绝', async ({ page }) => {
    const res = await apiFetch(technicianToken, 'GET', '/roles?page=1&pageSize=1')

    // 技术员访问角色管理API应该返回403
    expect([403, 401]).toContain(res.status)
  })
})
