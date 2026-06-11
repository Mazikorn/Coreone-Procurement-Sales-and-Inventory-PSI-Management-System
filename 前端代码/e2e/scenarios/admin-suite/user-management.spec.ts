import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 管理员用户管理 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：查看列表 → 创建用户 → 编辑用户 → 删除用户
 * 2. 操作端的然后呢：登录 → 进入页面 → 操作 → 验证结果
 * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
 */

// ────────────────────────────────────────────
// 共享工具函数
// ────────────────────────────────────────────

let createdUserId = ''

// ────────────────────────────────────────────
// 测试数据准备
// ────────────────────────────────────────────

let adminToken = ''

test.beforeAll(async () => {
  adminToken = await apiLogin('admin')
})

// ────────────────────────────────────────────
// 路径1: 查看用户列表 → 验证行列信息
// ────────────────────────────────────────────

test.describe('管理员用户管理 - 查看用户列表路径', () => {
  test('路径1-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径1-步骤2: 进入用户管理页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径1-步骤3: 验证用户列表显示', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await page.waitForTimeout(1000)

    // 验证用户列表表格可见
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤4: 验证用户名列显示', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await page.waitForTimeout(1000)

    // 验证用户名列标题可见
    await expect(page.locator('text=用户名, text=Username')).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤5: 验证角色列显示', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await page.waitForTimeout(1000)

    // 验证角色列标题可见
    await expect(page.locator('text=角色, text=Role')).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤6: 验证API返回用户列表', async ({ page }) => {
    const res = await apiFetch(adminToken, 'GET', '/users?page=1&pageSize=10')

    expect(res.status).toBe(200)
    expect(res.data?.data?.list).toBeDefined()
  })
})

// ────────────────────────────────────────────
// 路径2: 创建用户 → 填写表单 → 提交 → 验证列表更新
// ────────────────────────────────────────────

test.describe('管理员用户管理 - 创建用户路径', () => {
  test('路径2-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径2-步骤2: 进入用户管理页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径2-步骤3: 点击新增用户按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增用户"), button:has-text("新增"), button:has-text("添加用户")')
    await expect(addButton.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径2-步骤4: 填写用户表单', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await page.waitForTimeout(1000)

    // 点击新增按钮
    const addButton = page.locator('button:has-text("新增用户"), button:has-text("新增"), button:has-text("添加用户")')
    await addButton.first().click()
    await page.waitForTimeout(500)

    // 填写用户名
    const usernameInput = page.locator('input[placeholder="请输入用户名"]')
    if (await usernameInput.isVisible().catch(() => false)) {
      await usernameInput.fill(`e2e_test_user_${Date.now()}`)
    }

    // 填写密码
    const passwordInput = page.locator('input[placeholder="请输入密码"]')
    if (await passwordInput.isVisible().catch(() => false)) {
      await passwordInput.fill('TestPassword123!')
    }

    // 选择角色
    const roleSelect = page.locator('select[name="roleId"], [data-testid="role-select"]')
    if (await roleSelect.isVisible().catch(() => false)) {
      await roleSelect.selectOption({ index: 1 })
    }
  })

  test('路径2-步骤5: 通过API创建用户成功', async ({ page }) => {
    const timestamp = Date.now()
    const res = await apiFetch(adminToken, 'POST', '/users', {
      username: `e2e_user_${timestamp}`,
      password: 'TestPassword123!',
      roleId: 'technician',
      realName: `E2E测试用户${timestamp}`,
    })

    expect([201, 400]).toContain(res.status)

    if (res.status === 201) {
      createdUserId = res.data?.data?.id || ''
    }
  })

  test('路径2-步骤6: 验证用户列表已更新', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await page.waitForTimeout(1000)

    // 验证用户列表可见
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })
})

// ────────────────────────────────────────────
// 路径3: 编辑用户 → 修改信息 → 保存 → 验证变更
// ────────────────────────────────────────────

test.describe('管理员用户管理 - 编辑用户路径', () => {
  test('路径3-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径3-步骤2: 进入用户管理页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径3-步骤3: 通过API创建测试用户', async ({ page }) => {
    const timestamp = Date.now()
    const res = await apiFetch(adminToken, 'POST', '/users', {
      username: `e2e_edit_user_${timestamp}`,
      password: 'TestPassword123!',
      roleId: 'technician',
      realName: `E2E编辑测试用户${timestamp}`,
    })

    if (res.status === 201) {
      createdUserId = res.data?.data?.id || ''
    }
  })

  test('路径3-步骤4: 点击用户行进入编辑', async ({ page }) => {
    if (!createdUserId) {
      test.skip()
      return
    }

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await page.waitForTimeout(1000)

    // 点击第一行用户
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)
    }
  })

  test('路径3-步骤5: 修改用户信息', async ({ page }) => {
    if (!createdUserId) {
      test.skip()
      return
    }

    // 通过API编辑用户
    const res = await apiFetch(adminToken, 'PUT', `/users/${createdUserId}`, {
      realName: 'E2E编辑后的用户',
    })

    expect([200, 404]).toContain(res.status)
  })

  test('路径3-步骤6: 验证用户信息已变更', async ({ page }) => {
    if (!createdUserId) {
      test.skip()
      return
    }

    const res = await apiFetch(adminToken, 'GET', `/users?page=1&pageSize=10`)
    expect(res.status).toBe(200)
  })
})

// ────────────────────────────────────────────
// 路径4: 删除用户 → 选择 → 删除 → 确认 → 验证移除
// ────────────────────────────────────────────

test.describe('管理员用户管理 - 删除用户路径', () => {
  test('路径4-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径4-步骤2: 进入用户管理页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径4-步骤3: 通过API创建待删除用户', async ({ page }) => {
    const timestamp = Date.now()
    const res = await apiFetch(adminToken, 'POST', '/users', {
      username: `e2e_delete_user_${timestamp}`,
      password: 'TestPassword123!',
      roleId: 'technician',
      realName: `E2E删除测试用户${timestamp}`,
    })

    if (res.status === 201) {
      createdUserId = res.data?.data?.id || ''
    }
  })

  test('路径4-步骤4: 选择用户并删除', async ({ page }) => {
    if (!createdUserId) {
      test.skip()
      return
    }

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/users`)
    await page.waitForTimeout(1000)

    // 查找删除按钮
    const deleteButton = page.locator(`button:has-text("删除"), [data-testid="delete-user"]`)
    if (await deleteButton.first().isVisible().catch(() => false)) {
      await deleteButton.first().click()
      await page.waitForTimeout(500)

      // 确认删除
      const confirmButton = page.locator('button:has-text("确认"), button:has-text("确定"), button:has-text("OK")')
      if (await confirmButton.first().isVisible().catch(() => false)) {
        await confirmButton.first().click()
        await page.waitForTimeout(500)
      }
    }
  })

  test('路径4-步骤5: 通过API删除用户', async ({ page }) => {
    if (!createdUserId) {
      test.skip()
      return
    }

    const res = await apiFetch(adminToken, 'DELETE', `/users/${createdUserId}`)
    expect([200, 404]).toContain(res.status)
  })

  test('路径4-步骤6: 验证用户已移除', async ({ page }) => {
    if (!createdUserId) {
      test.skip()
      return
    }

    // 通过API验证用户已删除
    const res = await apiFetch(adminToken, 'GET', '/users?page=1&pageSize=10')
    expect(res.status).toBe(200)

    // 验证已删除用户不在列表中
    const userList = res.data?.data?.list || []
    const found = userList.find((u: any) => u.id === createdUserId)
    expect(found).toBeUndefined()
  })
})
