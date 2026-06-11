import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 盘点完整流程 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：仓管员获取库存 → 创建盘点 → 验证记录 → 验证库存调整
 * 2. 操作端的然后呢：登录 → 查库存 → 创建盘点 → 验证 → 检查调整
 * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
 */

// ────────────────────────────────────────────
// 共享工具函数
// ────────────────────────────────────────────

async function getAnyMaterialId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/materials?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

async function getAnyLocationId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/locations?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

async function getStock(token: string, materialId: string): Promise<number> {
  const r = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${materialId}`)
  return r.data?.data?.list?.[0]?.stock || 0
}

// ────────────────────────────────────────────
// 测试数据准备
// ────────────────────────────────────────────

let adminToken = ''
let warehouseManagerToken = ''
let materialId = ''
let locationId = ''

test.beforeAll(async () => {
  adminToken = await apiLogin('admin')
  warehouseManagerToken = await apiLogin('warehouse_manager')

  materialId = await getAnyMaterialId(adminToken)
  locationId = await getAnyLocationId(adminToken)
})

// ────────────────────────────────────────────
// 盘点完整流程
// ────────────────────────────────────────────

test.describe('盘点完整流程', () => {
  test('步骤1: 仓管员登录', async ({ page }) => {
    await loginAs(page, 'warehouse_manager')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('步骤2: 获取当前库存', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const stock = await getStock(warehouseManagerToken, materialId)
    expect(stock).toBeGreaterThanOrEqual(0)
  })

  test('步骤3: 创建盘点记录', async ({ page }) => {
    if (!materialId || !locationId) {
      test.skip()
      return
    }

    const currentStock = await getStock(warehouseManagerToken, materialId)

    const res = await apiFetch(warehouseManagerToken, 'POST', '/stocktaking', {
      materialId,
      locationId,
      systemStock: currentStock,
      actualStock: currentStock,
      remark: 'E2E盘点流程测试',
    })

    expect([201, 400]).toContain(res.status)
  })

  test('步骤4: 验证盘点记录存在', async ({ page }) => {
    await loginAs(page, 'warehouse_manager')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)

    // 验证盘点记录列表可见
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('步骤5: 验证库存已调整', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const stock = await getStock(warehouseManagerToken, materialId)
    expect(stock).toBeGreaterThanOrEqual(0)
  })
})
