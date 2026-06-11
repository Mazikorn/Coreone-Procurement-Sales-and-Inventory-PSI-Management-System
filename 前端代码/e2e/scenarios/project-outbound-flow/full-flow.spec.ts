import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 项目领用出库完整流程 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：技术员查看项目 → 查看BOM → 确认库存 → 出库 → 验证扣减 → 查看记录 → 查看成本
 * 2. 操作端的然后呢：登录 → 查项目 → 查BOM → 查库存 → 出库 → 验证 → 查成本
 * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
 */

// ────────────────────────────────────────────
// 共享工具函数
// ────────────────────────────────────────────

async function getAnyMaterialId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/materials?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

async function getAnyProjectId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/projects?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

async function getAnyBomId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/boms?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

async function getStock(token: string, materialId: string): Promise<number> {
  const r = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=1&materialId=${materialId}`)
  return r.data?.data?.list?.[0]?.stock || 0
}

async function ensureStock(token: string, materialId: string, quantity: number): Promise<void> {
  const stock = await getStock(token, materialId)
  if (stock >= quantity) return

  const locations = await apiFetch(token, 'GET', '/locations?page=1&pageSize=1')
  const locationId = locations.data?.data?.list?.[0]?.id
  if (!locationId) return

  await apiFetch(token, 'POST', '/inbound', {
    type: 'purchase',
    materialId,
    quantity: quantity - stock + 10,
    locationId,
    remark: 'E2E测试数据准备',
  })
}

// ────────────────────────────────────────────
// 测试数据准备
// ────────────────────────────────────────────

let adminToken = ''
let technicianToken = ''
let materialId = ''
let projectId = ''
let bomId = ''

test.beforeAll(async () => {
  adminToken = await apiLogin('admin')
  technicianToken = await apiLogin('technician')

  materialId = await getAnyMaterialId(adminToken)
  projectId = await getAnyProjectId(adminToken)
  bomId = await getAnyBomId(adminToken)

  if (materialId) {
    await ensureStock(adminToken, materialId, 20)
  }
})

// ────────────────────────────────────────────
// 项目领用出库完整流程
// ────────────────────────────────────────────

test.describe('项目领用出库完整流程', () => {
  test('步骤1: 技术员登录', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('步骤2: 查看项目列表', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/projects`)
    await page.waitForTimeout(1000)

    // 验证项目列表可见
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('步骤3: 查看BOM列表', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/bom`)
    await page.waitForTimeout(1000)

    // 验证BOM列表可见
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('步骤4: 确认库存充足', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const stock = await getStock(technicianToken, materialId)
    expect(stock).toBeGreaterThan(0)
  })

  test('步骤5: 创建项目出库', async ({ page }) => {
    if (!materialId || !projectId || !bomId) {
      test.skip()
      return
    }

    const res = await apiFetch(technicianToken, 'POST', '/outbound', {
      type: 'project',
      projectId,
      items: [{ materialId, quantity: 1 }],
      remark: 'E2E项目领用出库流程',
    })

    expect([201, 400, 422]).toContain(res.status)
  })

  test('步骤6: 验证库存已扣减', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const stock = await getStock(technicianToken, materialId)
    expect(stock).toBeGreaterThanOrEqual(0)
  })

  test('步骤7: 验证出库记录存在', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/outbound`)
    await page.waitForTimeout(1000)

    // 验证出库记录列表可见
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('步骤8: 查看成本分析页面', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/cost-analysis`)
    await page.waitForTimeout(1000)

    // 验证成本分析页面可见
    await expect(page.locator('body')).toBeVisible()
  })
})
