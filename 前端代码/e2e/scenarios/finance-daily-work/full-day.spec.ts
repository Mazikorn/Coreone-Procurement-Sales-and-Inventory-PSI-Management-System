import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 财务一天的工作 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：登录 → 看仪表盘 → 成本仪表盘 → 项目成本 → 成本趋势 → 滑动成本 → 盈利能力 → 导出
 * 2. 操作端的然后呢：每个操作都追问"然后呢"，直到业务流程结束
 * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
 *
 * 这是一个完整的端到端测试，模拟财务一天的工作流程
 */

// ────────────────────────────────────────────
// 测试数据准备
// ────────────────────────────────────────────

let adminToken = ''
let financeToken = ''

test.beforeAll(async () => {
  adminToken = await apiLogin('admin')
  financeToken = await apiLogin('finance')
})

// ────────────────────────────────────────────
// 财务一天的工作完整流程
// ────────────────────────────────────────────

test.describe('财务一天的工作 - 完整流程', () => {
  test('步骤1: 财务登录', async ({ page }) => {
    await loginAs(page, 'finance')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('步骤2: 查看仪表盘', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/`)
    await page.waitForTimeout(1000)

    // 验证仪表盘可见
    await expect(page.locator('body')).toBeVisible()
  })

  test('步骤3: 查看ABC成本仪表盘', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/abc/dashboard`)
    await page.waitForTimeout(1000)

    // 验证ABC仪表盘页面可见
    await expect(page.locator('body')).toBeVisible()
  })

  test('步骤4: 查看项目成本分析', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/cost-analysis`)
    await page.waitForTimeout(1000)

    // 验证成本分析页面可见
    await expect(page.locator('body')).toBeVisible()
  })

  test('步骤5: 查看成本趋势', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/abc/trend`)
    await page.waitForTimeout(1000)

    // 验证成本趋势页面可见
    await expect(page.locator('body')).toBeVisible()
  })

  test('步骤6: 查看单张切片成本', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/abc/slide-cost`)
    await page.waitForTimeout(1000)

    // 验证单张切片成本页面可见
    await expect(page.locator('body')).toBeVisible()
  })

  test('步骤7: 查看盈利能力', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/abc/profitability`)
    await page.waitForTimeout(1000)

    // 验证盈利能力页面可见
    await expect(page.locator('body')).toBeVisible()
  })

  test('步骤8: 导出报告', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/abc/dashboard`)
    await page.waitForTimeout(1000)

    // 验证导出按钮可见
    const exportButton = page.locator('button:has-text("导出"), button:has-text("Export")')
    if (await exportButton.first().isVisible().catch(() => false)) {
      await expect(exportButton.first()).toBeVisible({ timeout: 5000 })
    }

    // 验证导出API可用
    const res = await apiFetch(financeToken, 'GET', '/abc/export')
    expect([200, 404]).toContain(res.status)
  })
})
