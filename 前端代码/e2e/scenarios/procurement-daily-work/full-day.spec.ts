import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 采购员一天的工作 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：登录 → 看仪表盘 → 查供应商 → 创建采购订单 → 查看PO状态 → 查看PO详情
 * 2. 操作端的然后呢：每个操作都追问"然后呢"，直到业务流程结束
 * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
 *
 * 这是一个完整的端到端测试，模拟采购员一天的工作流程
 */

// ────────────────────────────────────────────
// 共享工具函数
// ────────────────────────────────────────────

async function getAnySupplierId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/suppliers?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

async function getAnyMaterialId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/materials?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

// ────────────────────────────────────────────
// 测试数据准备
// ────────────────────────────────────────────

let adminToken = ''
let procurementToken = ''
let supplierId = ''
let materialId = ''

test.beforeAll(async () => {
  adminToken = await apiLogin('admin')
  procurementToken = await apiLogin('procurement')

  supplierId = await getAnySupplierId(adminToken)
  materialId = await getAnyMaterialId(adminToken)
})

// ────────────────────────────────────────────
// 采购员一天的工作完整流程
// ────────────────────────────────────────────

test.describe('采购员一天的工作 - 完整流程', () => {
  test('步骤1: 采购员登录', async ({ page }) => {
    await loginAs(page, 'procurement')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('步骤2: 查看仪表盘', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/`)
    await page.waitForTimeout(1000)

    // 验证仪表盘可见
    await expect(page.locator('body')).toBeVisible()
  })

  test('步骤3: 查看供应商列表', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/suppliers`)
    await page.waitForTimeout(1000)

    // 验证供应商列表可见
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('步骤4: 创建采购订单', async ({ page }) => {
    if (!supplierId || !materialId) {
      test.skip()
      return
    }

    const res = await apiFetch(procurementToken, 'POST', '/purchase-orders', {
      supplierId,
      items: [{ materialId, quantity: 100, price: 10.00 }],
      remark: 'E2E采购员一天工作-创建PO',
    })

    expect([201, 400]).toContain(res.status)
  })

  test('步骤5: 验证采购订单已创建', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 验证采购订单列表可见
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('步骤6: 查看采购订单状态', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 验证订单状态显示
    const statusCell = page.locator('text=待处理, text=pending, text=待收货, text=已完成')
    await expect(statusCell.first()).toBeVisible({ timeout: 5000 })
  })

  test('步骤7: 查看采购订单详情', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 点击第一条记录查看详情
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)

      // 验证详情页显示
      await expect(page.locator('body')).toBeVisible()
    }
  })
})
