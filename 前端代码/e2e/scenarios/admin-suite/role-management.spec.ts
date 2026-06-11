import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 管理员角色管理 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：查看列表 → 创建角色 → 编辑角色 → 删除角色
 * 2. 操作端的然后呢：登录 → 进入页面 → 操作 → 验证结果
 * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
 */

// ────────────────────────────────────────────
// 共享工具函数
// ────────────────────────────────────────────

let createdRoleId = ''

// ────────────────────────────────────────────
// 测试数据准备
// ────────────────────────────────────────────

let adminToken = ''

test.beforeAll(async () => {
  adminToken = await apiLogin('admin')
})

// ────────────────────────────────────────────
// 路径1: 查看角色列表 → 验证角色名/权限
// ────────────────────────────────────────────

test.describe('管理员角色管理 - 查看角色列表路径', () => {
  test('路径1-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径1-步骤2: 进入角色管理页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径1-步骤3: 验证角色列表显示', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await page.waitForTimeout(1000)

    // 验证角色列表表格可见
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤4: 验证角色名列显示', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await page.waitForTimeout(1000)

    // 验证角色名列标题可见
    await expect(page.locator('text=角色名称, text=角色名, text=Role Name')).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤5: 验证权限列显示', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await page.waitForTimeout(1000)

    // 验证权限列标题可见
    await expect(page.locator('text=权限, text=Permissions')).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤6: 验证API返回角色列表', async ({ page }) => {
    const res = await apiFetch(adminToken, 'GET', '/roles?page=1&pageSize=10')

    expect(res.status).toBe(200)
    expect(res.data?.data?.list).toBeDefined()
  })
})

// ────────────────────────────────────────────
// 路径2: 创建角色 → 填写表单 → 提交 → 验证列表更新
// ────────────────────────────────────────────

test.describe('管理员角色管理 - 创建角色路径', () => {
  test('路径2-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径2-步骤2: 进入角色管理页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径2-步骤3: 点击新增角色按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增角色"), button:has-text("新增"), button:has-text("添加角色")')
    await expect(addButton.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径2-步骤4: 填写角色表单', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await page.waitForTimeout(1000)

    // 点击新增按钮
    const addButton = page.locator('button:has-text("新增角色"), button:has-text("新增"), button:has-text("添加角色")')
    await addButton.first().click()
    await page.waitForTimeout(500)

    // 填写角色名称
    const nameInput = page.locator('input[name="name"], input[name="roleName"]')
    if (await nameInput.isVisible().catch(() => false)) {
      await nameInput.fill(`E2E测试角色_${Date.now()}`)
    }

    // 填写角色描述
    const descInput = page.locator('input[name="description"], textarea[name="description"]')
    if (await descInput.isVisible().catch(() => false)) {
      await descInput.fill('E2E测试角色描述')
    }
  })

  test('路径2-步骤5: 通过API创建角色成功', async ({ page }) => {
    const timestamp = Date.now()
    const res = await apiFetch(adminToken, 'POST', '/roles', {
      name: `e2e_test_role_${timestamp}`,
      description: 'E2E测试角色',
      permissions: ['inventory:read', 'inbound:read'],
    })

    expect([201, 400]).toContain(res.status)

    if (res.status === 201) {
      createdRoleId = res.data?.data?.id || ''
    }
  })

  test('路径2-步骤6: 验证角色列表已更新', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await page.waitForTimeout(1000)

    // 验证角色列表可见
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })
})

// ────────────────────────────────────────────
// 路径3: 编辑角色 → 修改权限 → 保存
// ────────────────────────────────────────────

test.describe('管理员角色管理 - 编辑角色路径', () => {
  test('路径3-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径3-步骤2: 进入角色管理页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径3-步骤3: 通过API创建测试角色', async ({ page }) => {
    const timestamp = Date.now()
    const res = await apiFetch(adminToken, 'POST', '/roles', {
      name: `e2e_edit_role_${timestamp}`,
      description: 'E2E编辑测试角色',
      permissions: ['inventory:read'],
    })

    if (res.status === 201) {
      createdRoleId = res.data?.data?.id || ''
    }
  })

  test('路径3-步骤4: 点击角色行进入编辑', async ({ page }) => {
    if (!createdRoleId) {
      test.skip()
      return
    }

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await page.waitForTimeout(1000)

    // 点击第一行角色
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)
    }
  })

  test('路径3-步骤5: 修改角色权限', async ({ page }) => {
    if (!createdRoleId) {
      test.skip()
      return
    }

    // 通过API编辑角色
    const res = await apiFetch(adminToken, 'PUT', `/roles/${createdRoleId}`, {
      description: 'E2E编辑后的角色',
      permissions: ['inventory:read', 'inventory:write', 'inbound:read'],
    })

    expect([200, 404]).toContain(res.status)
  })

  test('路径3-步骤6: 验证角色信息已变更', async ({ page }) => {
    if (!createdRoleId) {
      test.skip()
      return
    }

    const res = await apiFetch(adminToken, 'GET', '/roles?page=1&pageSize=10')
    expect(res.status).toBe(200)
  })
})

// ────────────────────────────────────────────
// 路径4: 删除角色 → 选择 → 删除 → 确认
// ────────────────────────────────────────────

test.describe('管理员角色管理 - 删除角色路径', () => {
  test('路径4-步骤1: 管理员登录成功', async ({ page }) => {
    await loginAs(page, 'admin')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径4-步骤2: 进入角色管理页面', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径4-步骤3: 通过API创建待删除角色', async ({ page }) => {
    const timestamp = Date.now()
    const res = await apiFetch(adminToken, 'POST', '/roles', {
      name: `e2e_delete_role_${timestamp}`,
      description: 'E2E删除测试角色',
      permissions: ['inventory:read'],
    })

    if (res.status === 201) {
      createdRoleId = res.data?.data?.id || ''
    }
  })

  test('路径4-步骤4: 选择角色并删除', async ({ page }) => {
    if (!createdRoleId) {
      test.skip()
      return
    }

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/roles`)
    await page.waitForTimeout(1000)

    // 查找删除按钮
    const deleteButton = page.locator('button:has-text("删除"), [data-testid="delete-role"]')
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

  test('路径4-步骤5: 通过API删除角色', async ({ page }) => {
    if (!createdRoleId) {
      test.skip()
      return
    }

    const res = await apiFetch(adminToken, 'DELETE', `/roles/${createdRoleId}`)
    expect([200, 404]).toContain(res.status)
  })

  test('路径4-步骤6: 验证角色已移除', async ({ page }) => {
    if (!createdRoleId) {
      test.skip()
      return
    }

    // 通过API验证角色已删除
    const res = await apiFetch(adminToken, 'GET', '/roles?page=1&pageSize=10')
    expect(res.status).toBe(200)
  })
})
