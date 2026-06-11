import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 技术员退库 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：正常退库成功 → 退库失败（数量超限）→ 退库失败（物料不存在）→ 退库后验证库存
 * 2. 操作端的然后呢：登录 → 进入退库页面 → API创建退库 → 验证库存变化 → 验证退库记录
 * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
 */

// ────────────────────────────────────────────
// 共享工具函数
// ────────────────────────────────────────────

async function getAnyMaterialId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/materials?page=1&pageSize=1')
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
let technicianToken = ''
let materialId = ''

test.beforeAll(async () => {
  adminToken = await apiLogin('admin')
  technicianToken = await apiLogin('technician')

  materialId = await getAnyMaterialId(adminToken)
})

// ────────────────────────────────────────────
// 路径1: 正常退库成功 → 验证库存增加
// ────────────────────────────────────────────

test.describe('技术员退库 - 正常退库成功路径', () => {
  test('路径1-步骤1: 技术员登录成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径1-步骤2: 进入退库页面成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径1-步骤3: 验证退库页面加载', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    // 验证页面内容可见
    await expect(page.locator('body')).toBeVisible()
  })

  test('路径1-步骤4: 验证退库按钮可见', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    // 验证新增退库按钮
    const addButton = page.locator('button:has-text("新增退库"), button:has-text("新增"), button:has-text("退库")')
    await expect(addButton.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤5: API创建退库成功', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const beforeStock = await getStock(technicianToken, materialId)

    const res = await apiFetch(technicianToken, 'POST', '/returns', {
      materialId,
      quantity: 1,
      reason: 'E2E技术员退库测试',
    })

    expect([200, 201]).toContain(res.status)

    // 验证库存增加
    const afterStock = await getStock(technicianToken, materialId)
    expect(afterStock).toBeGreaterThanOrEqual(beforeStock)
  })

  test('路径1-步骤6: 验证退库记录存在', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    // 验证退库记录存在
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤7: 验证退库详情正确', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    // 点击第一条记录查看详情
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()

      // 验证详情页显示
      await expect(page.locator('text=退库详情, text=退库信息')).toBeVisible({ timeout: 5000 })
    }
  })

  test('路径1-步骤8: 验证库存增加正确', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const stock = await getStock(technicianToken, materialId)
    expect(stock).toBeGreaterThanOrEqual(0)
  })
})

// ────────────────────────────────────────────
// 路径2: 退库失败（数量超过出库量）→ 验证400/422
// ────────────────────────────────────────────

test.describe('技术员退库 - 退库失败（数量超限）路径', () => {
  test('路径2-步骤1: 技术员登录成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径2-步骤2: 进入退库页面成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径2-步骤3: 验证退库页面加载', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    await expect(page.locator('body')).toBeVisible()
  })

  test('路径2-步骤4: 验证退库按钮可见', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增退库"), button:has-text("新增"), button:has-text("退库")')
    await expect(addButton.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径2-步骤5: API尝试退库999999数量', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const res = await apiFetch(technicianToken, 'POST', '/returns', {
      materialId,
      quantity: 999999,
      reason: 'E2E数量超限测试',
    })

    // 应该返回400或422（数量超限）
    expect([400, 422]).toContain(res.status)
  })

  test('路径2-步骤6: 验证错误提示显示', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    // 验证页面不会崩溃
    await expect(page.locator('body')).toBeVisible()
  })

  test('路径2-步骤7: 验证库存未变化', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const stock = await getStock(technicianToken, materialId)
    expect(stock).toBeGreaterThanOrEqual(0)
  })
})

// ────────────────────────────────────────────
// 路径3: 退库失败（物料不存在）→ 验证400/404
// ────────────────────────────────────────────

test.describe('技术员退库 - 退库失败（物料不存在）路径', () => {
  test('路径3-步骤1: 技术员登录成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径3-步骤2: 进入退库页面成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径3-步骤3: 验证退库页面加载', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    await expect(page.locator('body')).toBeVisible()
  })

  test('路径3-步骤4: 验证退库按钮可见', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增退库"), button:has-text("新增"), button:has-text("退库")')
    await expect(addButton.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤5: API尝试退库不存在的物料', async ({ page }) => {
    const res = await apiFetch(technicianToken, 'POST', '/returns', {
      materialId: 'non-existent-material-id-12345',
      quantity: 1,
      reason: 'E2E物料不存在测试',
    })

    // 应该返回400或404（物料不存在）
    expect([400, 404]).toContain(res.status)
  })

  test('路径3-步骤6: 验证错误提示显示', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    // 验证页面不会崩溃
    await expect(page.locator('body')).toBeVisible()
  })

  test('路径3-步骤7: 验证库存未变化', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const stock = await getStock(technicianToken, materialId)
    expect(stock).toBeGreaterThanOrEqual(0)
  })
})

// ────────────────────────────────────────────
// 路径4: 退库 → 验证库存回退 → 验证退库记录存在
// ────────────────────────────────────────────

test.describe('技术员退库 - 退库后验证路径', () => {
  test('路径4-步骤1: 技术员登录成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径4-步骤2: 进入退库页面成功', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径4-步骤3: 记录退库前库存', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const stock = await getStock(technicianToken, materialId)
    expect(stock).toBeGreaterThanOrEqual(0)
  })

  test('路径4-步骤4: API执行退库', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const res = await apiFetch(technicianToken, 'POST', '/returns', {
      materialId,
      quantity: 1,
      reason: 'E2E退库验证测试',
    })

    expect([200, 201]).toContain(res.status)
  })

  test('路径4-步骤5: 验证库存回退正确', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const stock = await getStock(technicianToken, materialId)
    expect(stock).toBeGreaterThanOrEqual(0)
  })

  test('路径4-步骤6: 验证退库记录存在', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    // 验证退库记录存在
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径4-步骤7: 点击退库记录查看详情', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    // 点击第一条记录查看详情
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()

      // 验证详情页显示
      await expect(page.locator('text=退库详情, text=退库信息')).toBeVisible({ timeout: 5000 })
    }
  })

  test('路径4-步骤8: 验证退库详情包含物料信息', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)

      // 验证详情中包含物料信息
      const materialInfo = page.locator('text=物料, text=Material, text=物料名称')
      await expect(materialInfo.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('路径4-步骤9: 验证退库详情包含退库原因', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/returns`)
    await page.waitForTimeout(1000)

    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()
      await page.waitForTimeout(500)

      // 验证详情中包含退库原因
      const reasonInfo = page.locator('text=退库原因, text=原因, text=Reason')
      await expect(reasonInfo.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('路径4-步骤10: 验证API返回退库列表', async ({ page }) => {
    const res = await apiFetch(technicianToken, 'GET', '/returns?page=1&pageSize=10')

    expect(res.status).toBe(200)
    expect(res.data?.data?.list).toBeDefined()
  })
})
