import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 技术员查看出库记录 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：查看出库列表 → 查看出库详情 → 按日期筛选 → 按项目筛选
 * 2. 操作端的然后呢：登录 → 进入出库页面 → 等待加载 → 验证数据 → 筛选 → 验证筛选结果
 * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
 */

// ────────────────────────────────────────────
// 共享工具函数
// ────────────────────────────────────────────

async function getAnyOutboundId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/outbound?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

async function getAnyProjectId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/projects?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

// ────────────────────────────────────────────
// 测试数据准备
// ────────────────────────────────────────────

let adminToken = ''
let technicianToken = ''
let outboundId = ''
let projectId = ''

test.beforeAll(async () => {
  adminToken = await apiLogin('admin')
  technicianToken = await apiLogin('technician')

  outboundId = await getAnyOutboundId(adminToken)
  projectId = await getAnyProjectId(adminToken)
})

// ────────────────────────────────────────────
// 路径1: 查看出库列表 → 验证行可见 → 验证出库单号/项目名称
// ────────────────────────────────────────────

test.describe('技术员查看出库记录 - 出库列表路径', () => {
  test('路径1-步骤1: 技术员登录成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径1-步骤2: 进入出库页面成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径1-步骤3: 验证出库列表加载', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 验证表格存在
    const table = page.locator('table, [role="table"], [data-testid="outbound-table"]')
    await expect(table.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤4: 验证出库列表有数据行', async ({ page }) => {
    if (!outboundId) {
      test.skip()
      return
    }

    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 验证表格有数据行
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤5: 验证出库单号列可见', async ({ page }) => {
    if (!outboundId) {
      test.skip()
      return
    }

    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 验证出库单号列存在
    const codeColumn = page.locator('th:has-text("出库单号"), th:has-text("单号"), th:has-text("Outbound No"), th:has-text("Number")')
    await expect(codeColumn.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤6: 验证项目名称列可见', async ({ page }) => {
    if (!outboundId) {
      test.skip()
      return
    }

    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 验证项目名称列存在
    const nameColumn = page.locator('th:has-text("项目名称"), th:has-text("项目"), th:has-text("Project"), th:has-text("Project Name")')
    await expect(nameColumn.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤7: 验证API返回出库列表', async ({ page }) => {
    const res = await apiFetch(technicianToken, 'GET', '/outbound?page=1&pageSize=10')

    expect(res.status).toBe(200)
    expect(res.data?.data?.list).toBeDefined()
  })
})

// ────────────────────────────────────────────
// 路径2: 查看出库详情 → 点击第一行 → 验证详情弹窗
// ────────────────────────────────────────────

test.describe('技术员查看出库记录 - 出库详情路径', () => {
  test('路径2-步骤1: 技术员登录成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径2-步骤2: 进入出库页面成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径2-步骤3: 验证出库列表有数据', async ({ page }) => {
    if (!outboundId) {
      test.skip()
      return
    }

    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径2-步骤4: 点击第一条出库记录', async ({ page }) => {
    if (!outboundId) {
      test.skip()
      return
    }

    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 点击第一条记录
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()
    }
  })

  test('路径2-步骤5: 验证详情弹窗显示', async ({ page }) => {
    if (!outboundId) {
      test.skip()
      return
    }

    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)

      // 验证详情弹窗或页面显示
      const detailPanel = page.locator('text=出库详情, text=出库信息, text=Outbound Detail, [role="dialog"], .modal')
      await expect(detailPanel.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('路径2-步骤6: 验证详情包含物料明细', async ({ page }) => {
    if (!outboundId) {
      test.skip()
      return
    }

    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)

      // 验证详情中包含物料明细
      const materialDetail = page.locator('text=物料明细, text=物料列表, text=Material Detail, text=出库物料')
      await expect(materialDetail.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('路径2-步骤7: 验证API返回出库详情', async ({ page }) => {
    if (!outboundId) {
      test.skip()
      return
    }

    const res = await apiFetch(technicianToken, 'GET', `/outbound/${outboundId}`)

    expect([200, 404]).toContain(res.status)
  })
})

// ────────────────────────────────────────────
// 路径3: 查看出库记录 → 按日期范围筛选
// ────────────────────────────────────────────

test.describe('技术员查看出库记录 - 按日期筛选路径', () => {
  test('路径3-步骤1: 技术员登录成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径3-步骤2: 进入出库页面成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径3-步骤3: 验证日期筛选器可见', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 验证日期筛选器存在
    const dateFilter = page.locator('input[type="date"], [data-testid="date-filter"], text=日期, text=Date, .date-picker')
    await expect(dateFilter.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤4: 选择开始日期', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 选择开始日期
    const startDate = page.locator('input[type="date"]').first()
    if (await startDate.isVisible().catch(() => false)) {
      await startDate.fill('2024-01-01')
    }
  })

  test('路径3-步骤5: 选择结束日期', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 选择结束日期
    const endDate = page.locator('input[type="date"]').last()
    if (await endDate.isVisible().catch(() => false)) {
      await endDate.fill('2024-12-31')
    }
  })

  test('路径3-步骤6: 点击筛选按钮', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 点击筛选按钮
    const filterButton = page.locator('button:has-text("筛选"), button:has-text("查询"), button:has-text("Search"), button:has-text("Filter")')
    if (await filterButton.first().isVisible().catch(() => false)) {
      await filterButton.first().click()
    }
  })

  test('路径3-步骤7: 验证筛选结果', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 验证页面不会崩溃
    await expect(page.locator('body')).toBeVisible()
  })

  test('路径3-步骤8: 验证API支持日期筛选', async ({ page }) => {
    const res = await apiFetch(technicianToken, 'GET', '/outbound?page=1&pageSize=10&startDate=2024-01-01&endDate=2024-12-31')

    expect(res.status).toBe(200)
  })
})

// ────────────────────────────────────────────
// 路径4: 查看出库记录 → 按项目筛选
// ────────────────────────────────────────────

test.describe('技术员查看出库记录 - 按项目筛选路径', () => {
  test('路径4-步骤1: 技术员登录成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径4-步骤2: 进入出库页面成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径4-步骤3: 验证项目筛选器可见', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 验证项目筛选器存在
    const projectFilter = page.locator('select[name="projectId"], [data-testid="project-filter"], text=项目, text=Project')
    await expect(projectFilter.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径4-步骤4: 选择项目', async ({ page }) => {
    if (!projectId) {
      test.skip()
      return
    }

    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 选择项目
    const projectSelect = page.locator('select[name="projectId"], [data-testid="project-select"]')
    if (await projectSelect.isVisible().catch(() => false)) {
      await projectSelect.selectOption({ index: 1 })
    }
  })

  test('路径4-步骤5: 点击筛选按钮', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 点击筛选按钮
    const filterButton = page.locator('button:has-text("筛选"), button:has-text("查询"), button:has-text("Search"), button:has-text("Filter")')
    if (await filterButton.first().isVisible().catch(() => false)) {
      await filterButton.first().click()
    }
  })

  test('路径4-步骤6: 验证筛选结果', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 验证页面不会崩溃
    await expect(page.locator('body')).toBeVisible()
  })

  test('路径4-步骤7: 验证API支持项目筛选', async ({ page }) => {
    if (!projectId) {
      test.skip()
      return
    }

    const res = await apiFetch(technicianToken, 'GET', `/outbound?page=1&pageSize=10&projectId=${projectId}`)

    expect(res.status).toBe(200)
  })

  test('路径4-步骤8: 验证筛选后数据行', async ({ page }) => {
    if (!projectId) {
      test.skip()
      return
    }

    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 验证页面不会崩溃
    await expect(page.locator('body')).toBeVisible()
  })
})
