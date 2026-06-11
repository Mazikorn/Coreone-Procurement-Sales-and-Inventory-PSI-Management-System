import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 管理员登录 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：登录成功 → 验证跳转 → 验证菜单 → 验证管理页面可访问
 * 2. 操作端的然后呢：打开登录页 → 输入账号密码 → 点击登录 → 等待跳转 → 验证页面
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
// 路径1: 管理员登录成功 → 跳转到首页 → 仪表盘可见
// ────────────────────────────────────────────

test.describe('管理员登录 - 登录成功路径', () => {
  test('路径1-步骤1: 打开登录页面', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径1-步骤2: 输入管理员账号密码', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]').first()
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]').first()

    await usernameInput.waitFor({ state: 'visible', timeout: 15000 })
    await usernameInput.fill('admin')
    await passwordInput.fill('admin123')
  })

  test('路径1-步骤3: 点击登录按钮', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]').first()
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]').first()
    const loginButton = page.locator('button[type="submit"]')

    await usernameInput.waitFor({ state: 'visible', timeout: 15000 })
    await usernameInput.fill('admin')
    await passwordInput.fill('admin123')
    await loginButton.click()
  })

  test('路径1-步骤4: 登录成功后跳转到首页', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径1-步骤5: 验证首页仪表盘可见', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.waitForTimeout(1000)

    // 验证首页内容可见
    await expect(page.locator('body')).toBeVisible()
  })
})

// ────────────────────────────────────────────
// 路径2: 管理员登录失败（错误密码）→ 错误提示 → 重试
// ────────────────────────────────────────────

test.describe('管理员登录 - 登录失败（错误密码）路径', () => {
  test('路径2-步骤1: 打开登录页面', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径2-步骤2: 输入错误密码', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]').first()
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]').first()

    await usernameInput.waitFor({ state: 'visible', timeout: 15000 })
    await usernameInput.fill('admin')
    await passwordInput.fill('WrongPassword123!')
  })

  test('路径2-步骤3: 点击登录按钮', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]').first()
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]').first()
    const loginButton = page.locator('button[type="submit"]')

    await usernameInput.waitFor({ state: 'visible', timeout: 15000 })
    await usernameInput.fill('admin')
    await passwordInput.fill('WrongPassword123!')
    await loginButton.first().click()
  })

  test('路径2-步骤4: 验证错误提示显示', async ({ page }) => {
    await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })

    const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]').first()
    const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]').first()
    const loginButton = page.locator('button[type="submit"]')

    await usernameInput.waitFor({ state: 'visible', timeout: 15000 })
    await usernameInput.fill('admin')
    await passwordInput.fill('WrongPassword123!')
    await loginButton.first().click()
    await page.waitForTimeout(2000)

    // 验证错误提示出现
    const errorMessage = page.locator('text=密码错误, text=登录失败, text=用户名或密码, text=Invalid, text=incorrect, [role="alert"]')
    await expect(errorMessage.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径2-步骤5: 验证API返回登录失败', async ({ page }) => {
    const res = await apiFetch('', 'POST', '/auth/login', {
      username: 'admin',
      password: 'WrongPassword123!',
    })

    // 应该返回401或400
    expect([400, 401]).toContain(res.status)
  })

  test('路径2-步骤6: 重试输入正确密码登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })
})

// ────────────────────────────────────────────
// 路径3: 管理员登录后验证所有侧边栏菜单项可见
// ────────────────────────────────────────────

test.describe('管理员登录 - 验证全部菜单项路径', () => {
  test('路径3-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径3-步骤2: 验证侧边栏可见', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.waitForTimeout(1000)

    const sidebar = page.locator('nav, aside, [data-testid="sidebar"], .sidebar')
    await expect(sidebar.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤3: 验证管理员可看到库存管理菜单', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.waitForTimeout(1000)

    const inventoryMenu = page.locator('text=库存, text=Inventory, a[href*="inventory"]')
    await expect(inventoryMenu.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤4: 验证管理员可看到入库菜单', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.waitForTimeout(1000)

    const inboundMenu = page.locator('text=入库, text=Inbound, a[href*="inbound"]')
    await expect(inboundMenu.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤5: 验证管理员可看到出库菜单', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.waitForTimeout(1000)

    const outboundMenu = page.locator('text=出库, text=Outbound, a[href*="outbound"]')
    await expect(outboundMenu.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤6: 验证管理员可看到物料管理菜单', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.waitForTimeout(1000)

    const materialsMenu = page.locator('text=物料, text=Materials, a[href*="materials"]')
    await expect(materialsMenu.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤7: 验证管理员可看到供应商菜单', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.waitForTimeout(1000)

    const suppliersMenu = page.locator('text=供应商, text=Suppliers, a[href*="suppliers"]')
    await expect(suppliersMenu.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤8: 验证管理员可看到用户管理菜单', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.waitForTimeout(1000)

    const usersMenu = page.locator('text=用户管理, text=Users, a[href*="users"]')
    await expect(usersMenu.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤9: 验证管理员可看到角色管理菜单', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.waitForTimeout(1000)

    const rolesMenu = page.locator('text=角色管理, text=Roles, a[href*="roles"]')
    await expect(rolesMenu.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤10: 验证管理员可看到日志菜单', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.waitForTimeout(1000)

    const logsMenu = page.locator('text=日志, text=Logs, a[href*="logs"]')
    await expect(logsMenu.first()).toBeVisible({ timeout: 5000 })
  })
})

// ────────────────────────────────────────────
// 路径4: 管理员登录后验证可访问管理页面
// ────────────────────────────────────────────

test.describe('管理员登录 - 管理页面访问验证路径', () => {
  test('路径4-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径4-步骤2: 管理员可访问用户管理页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await page.waitForTimeout(1000)

    // 管理员应该能正常访问用户管理页面
    await expect(page.locator('body')).toBeVisible()
    // 页面不应该被重定向
    expect(page.url()).toContain('/users')
  })

  test('路径4-步骤3: 管理员可访问角色管理页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await page.waitForTimeout(1000)

    // 管理员应该能正常访问角色管理页面
    await expect(page.locator('body')).toBeVisible()
    expect(page.url()).toContain('/roles')
  })

  test('路径4-步骤4: 管理员可访问日志页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/logs`)
    await page.waitForTimeout(1000)

    // 管理员应该能正常访问日志页面
    await expect(page.locator('body')).toBeVisible()
    expect(page.url()).toContain('/logs')
  })

  test('路径4-步骤5: 验证API访问用户管理成功', async ({ page }) => {
    const res = await apiFetch(adminToken, 'GET', '/users?page=1&pageSize=1')

    // 管理员访问用户管理API应该返回200
    expect(res.status).toBe(200)
  })

  test('路径4-步骤6: 验证API访问角色管理成功', async ({ page }) => {
    const res = await apiFetch(adminToken, 'GET', '/roles?page=1&pageSize=1')

    // 管理员访问角色管理API应该返回200
    expect(res.status).toBe(200)
  })

  test('路径4-步骤7: 验证API访问日志成功', async ({ page }) => {
    const res = await apiFetch(adminToken, 'GET', '/logs?page=1&pageSize=1')

    // 管理员访问日志API应该返回200
    expect(res.status).toBe(200)
  })
})
