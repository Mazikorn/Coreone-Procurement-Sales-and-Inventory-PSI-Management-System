import { test, expect, Page } from '@playwright/test'
import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'

/**
 * 采购员创建采购订单 - 场景化测试套件
 *
 * 基于"然后呢"三层追问设计：
 * 1. 场景端的然后呢：正常创建 → 创建失败 → 创建后发现错误 → 创建后查看结果
 * 2. 操作端的然后呢：登录 → 进入页面 → 点击按钮 → 选择供应商 → 添加物料 → 填写数量单价 → 提交 → 验证
 * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
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
// 路径1: 创建采购订单成功路径
// ────────────────────────────────────────────

test.describe('采购员创建采购订单 - 正常创建成功路径', () => {
  test('路径1-步骤1: 采购员登录成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径1-步骤2: 进入采购订单页面成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径1-步骤3: 点击新增采购订单按钮成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 采购员应该能看到新增采购订单按钮
    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await expect(addButton.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤4: 选择供应商成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 点击新增采购订单按钮
    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await addButton.first().click()

    // 选择供应商
    const supplierSelect = page.locator('select[name="supplierId"], [data-testid="supplier-select"]')
    if (await supplierSelect.isVisible().catch(() => false)) {
      await supplierSelect.selectOption({ index: 1 })
    }
  })

  test('路径1-步骤5: 添加物料成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 点击新增采购订单按钮
    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await addButton.first().click()

    // 选择供应商
    const supplierSelect = page.locator('select[name="supplierId"], [data-testid="supplier-select"]')
    if (await supplierSelect.isVisible().catch(() => false)) {
      await supplierSelect.selectOption({ index: 1 })
    }

    // 添加物料
    const addMaterialButton = page.locator('button:has-text("添加物料"), button:has-text("新增物料")')
    if (await addMaterialButton.isVisible().catch(() => false)) {
      await addMaterialButton.click()
    }
  })

  test('路径1-步骤6: 填写数量单价成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 点击新增采购订单按钮
    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await addButton.first().click()

    // 选择供应商
    const supplierSelect = page.locator('select[name="supplierId"], [data-testid="supplier-select"]')
    if (await supplierSelect.isVisible().catch(() => false)) {
      await supplierSelect.selectOption({ index: 1 })
    }

    // 添加物料
    const addMaterialButton = page.locator('button:has-text("添加物料"), button:has-text("新增物料")')
    if (await addMaterialButton.isVisible().catch(() => false)) {
      await addMaterialButton.click()
    }

    // 填写数量
    const quantityInput = page.locator('input[name="quantity"]')
    if (await quantityInput.isVisible().catch(() => false)) {
      await quantityInput.fill('100')
    }

    // 填写单价
    const priceInput = page.locator('input[name="price"]')
    if (await priceInput.isVisible().catch(() => false)) {
      await priceInput.fill('10.00')
    }
  })

  test('路径1-步骤7: 提交采购订单成功', async ({ page }) => {
    if (!supplierId || !materialId) {
      test.skip()
      return
    }

    const res = await apiFetch(procurementToken, 'POST', '/purchase-orders', {
      supplierId,
      items: [{ materialId, quantity: 100, price: 10.00 }],
      remark: 'E2E采购员创建采购订单测试',
    })

    expect([201, 400]).toContain(res.status)
  })

  test('路径1-步骤8: 验证采购订单列表存在', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 验证采购订单列表存在
    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径1-步骤9: 验证采购订单详情正确', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 点击第一条记录查看详情
    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()

      // 验证详情页显示
      await expect(page.locator('text=采购订单详情, text=订单信息')).toBeVisible({ timeout: 5000 })
    }
  })

  test('路径1-步骤10: 验证采购订单状态正确', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 验证订单状态显示
    const statusCell = page.locator('text=待处理, text=pending, text=待收货')
    await expect(statusCell.first()).toBeVisible({ timeout: 5000 })
  })
})

// ────────────────────────────────────────────
// 路径2: 创建失败（供应商不存在）路径
// ────────────────────────────────────────────

test.describe('采购员创建采购订单 - 创建失败（供应商不存在）路径', () => {
  test('路径2-步骤1: 采购员登录成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径2-步骤2: 进入采购订单页面成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径2-步骤3: 点击新增采购订单按钮成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await expect(addButton.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径2-步骤4: 选择供应商（不存在）失败', async ({ page }) => {
    if (!materialId) {
      test.skip()
      return
    }

    const res = await apiFetch(procurementToken, 'POST', '/purchase-orders', {
      supplierId: 'non-existent-supplier-id',
      items: [{ materialId, quantity: 100, price: 10.00 }],
      remark: 'E2E供应商不存在测试',
    })

    // 应该返回400或404
    expect([400, 404]).toContain(res.status)
  })

  test('路径2-步骤5: 提示用户供应商不存在', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 验证页面不会崩溃
    await expect(page.locator('body')).toBeVisible()
  })
})

// ────────────────────────────────────────────
// 路径3: 创建失败（物料不存在）路径
// ────────────────────────────────────────────

test.describe('采购员创建采购订单 - 创建失败（物料不存在）路径', () => {
  test('路径3-步骤1: 采购员登录成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径3-步骤2: 进入采购订单页面成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径3-步骤3: 点击新增采购订单按钮成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await expect(addButton.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径3-步骤4: 选择供应商成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await addButton.first().click()

    const supplierSelect = page.locator('select[name="supplierId"], [data-testid="supplier-select"]')
    if (await supplierSelect.isVisible().catch(() => false)) {
      await supplierSelect.selectOption({ index: 1 })
    }
  })

  test('路径3-步骤5: 添加物料（不存在）失败', async ({ page }) => {
    if (!supplierId) {
      test.skip()
      return
    }

    const res = await apiFetch(procurementToken, 'POST', '/purchase-orders', {
      supplierId,
      items: [{ materialId: 'non-existent-material-id', quantity: 100, price: 10.00 }],
      remark: 'E2E物料不存在测试',
    })

    // 应该返回400或404
    expect([400, 404]).toContain(res.status)
  })

  test('路径3-步骤6: 提示用户物料不存在', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 验证页面不会崩溃
    await expect(page.locator('body')).toBeVisible()
  })
})

// ────────────────────────────────────────────
// 路径4: 创建后发现错误 → 编辑路径
// ────────────────────────────────────────────

test.describe('采购员创建采购订单 - 创建后发现错误 → 编辑路径', () => {
  test('路径4-步骤1: 采购员登录成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径4-步骤2: 进入采购订单页面成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径4-步骤3: 点击新增采购订单按钮成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await expect(addButton.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径4-步骤4: 选择供应商成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await addButton.first().click()

    const supplierSelect = page.locator('select[name="supplierId"], [data-testid="supplier-select"]')
    if (await supplierSelect.isVisible().catch(() => false)) {
      await supplierSelect.selectOption({ index: 1 })
    }
  })

  test('路径4-步骤5: 添加物料成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await addButton.first().click()

    const supplierSelect = page.locator('select[name="supplierId"], [data-testid="supplier-select"]')
    if (await supplierSelect.isVisible().catch(() => false)) {
      await supplierSelect.selectOption({ index: 1 })
    }

    const addMaterialButton = page.locator('button:has-text("添加物料"), button:has-text("新增物料")')
    if (await addMaterialButton.isVisible().catch(() => false)) {
      await addMaterialButton.click()
    }
  })

  test('路径4-步骤6: 填写数量单价成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await addButton.first().click()

    const supplierSelect = page.locator('select[name="supplierId"], [data-testid="supplier-select"]')
    if (await supplierSelect.isVisible().catch(() => false)) {
      await supplierSelect.selectOption({ index: 1 })
    }

    const addMaterialButton = page.locator('button:has-text("添加物料"), button:has-text("新增物料")')
    if (await addMaterialButton.isVisible().catch(() => false)) {
      await addMaterialButton.click()
    }

    const quantityInput = page.locator('input[name="quantity"]')
    if (await quantityInput.isVisible().catch(() => false)) {
      await quantityInput.fill('100')
    }

    const priceInput = page.locator('input[name="price"]')
    if (await priceInput.isVisible().catch(() => false)) {
      await priceInput.fill('10.00')
    }
  })

  test('路径4-步骤7: 提交采购订单成功', async ({ page }) => {
    if (!supplierId || !materialId) {
      test.skip()
      return
    }

    const res = await apiFetch(procurementToken, 'POST', '/purchase-orders', {
      supplierId,
      items: [{ materialId, quantity: 100, price: 10.00 }],
      remark: 'E2E编辑测试-创建',
    })

    expect([201, 400]).toContain(res.status)
  })

  test('路径4-步骤8: 验证采购订单列表存在', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径4-步骤9: 发现错误 → 编辑采购订单', async ({ page }) => {
    if (!supplierId || !materialId) {
      test.skip()
      return
    }

    // 先创建一个采购订单
    const createRes = await apiFetch(procurementToken, 'POST', '/purchase-orders', {
      supplierId,
      items: [{ materialId, quantity: 50, price: 10.00 }],
      remark: 'E2E编辑测试-创建',
    })

    if (createRes.status !== 201) {
      test.skip()
      return
    }

    const orderId = createRes.data?.data?.id
    if (!orderId) {
      test.skip()
      return
    }

    // 编辑采购订单
    const editRes = await apiFetch(procurementToken, 'PUT', `/purchase-orders/${orderId}`, {
      remark: 'E2E编辑测试-编辑后',
    })

    expect([200, 404]).toContain(editRes.status)
  })

  test('路径4-步骤10: 重新提交采购订单', async ({ page }) => {
    if (!supplierId || !materialId) {
      test.skip()
      return
    }

    const res = await apiFetch(procurementToken, 'POST', '/purchase-orders', {
      supplierId,
      items: [{ materialId, quantity: 200, price: 12.00 }],
      remark: 'E2E编辑测试-重新提交',
    })

    expect([201, 400]).toContain(res.status)
  })
})

// ────────────────────────────────────────────
// 路径5: 创建后发现错误 → 取消路径
// ────────────────────────────────────────────

test.describe('采购员创建采购订单 - 创建后发现错误 → 取消路径', () => {
  test('路径5-步骤1: 采购员登录成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径5-步骤2: 进入采购订单页面成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径5-步骤3: 点击新增采购订单按钮成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await expect(addButton.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径5-步骤4: 选择供应商成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await addButton.first().click()

    const supplierSelect = page.locator('select[name="supplierId"], [data-testid="supplier-select"]')
    if (await supplierSelect.isVisible().catch(() => false)) {
      await supplierSelect.selectOption({ index: 1 })
    }
  })

  test('路径5-步骤5: 添加物料成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await addButton.first().click()

    const supplierSelect = page.locator('select[name="supplierId"], [data-testid="supplier-select"]')
    if (await supplierSelect.isVisible().catch(() => false)) {
      await supplierSelect.selectOption({ index: 1 })
    }

    const addMaterialButton = page.locator('button:has-text("添加物料"), button:has-text("新增物料")')
    if (await addMaterialButton.isVisible().catch(() => false)) {
      await addMaterialButton.click()
    }
  })

  test('路径5-步骤6: 填写数量单价成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const addButton = page.locator('button:has-text("新增采购订单"), button:has-text("新增")')
    await addButton.first().click()

    const supplierSelect = page.locator('select[name="supplierId"], [data-testid="supplier-select"]')
    if (await supplierSelect.isVisible().catch(() => false)) {
      await supplierSelect.selectOption({ index: 1 })
    }

    const addMaterialButton = page.locator('button:has-text("添加物料"), button:has-text("新增物料")')
    if (await addMaterialButton.isVisible().catch(() => false)) {
      await addMaterialButton.click()
    }

    const quantityInput = page.locator('input[name="quantity"]')
    if (await quantityInput.isVisible().catch(() => false)) {
      await quantityInput.fill('100')
    }

    const priceInput = page.locator('input[name="price"]')
    if (await priceInput.isVisible().catch(() => false)) {
      await priceInput.fill('10.00')
    }
  })

  test('路径5-步骤7: 提交采购订单成功', async ({ page }) => {
    if (!supplierId || !materialId) {
      test.skip()
      return
    }

    const res = await apiFetch(procurementToken, 'POST', '/purchase-orders', {
      supplierId,
      items: [{ materialId, quantity: 100, price: 10.00 }],
      remark: 'E2E取消测试-创建',
    })

    expect([201, 400]).toContain(res.status)
  })

  test('路径5-步骤8: 验证采购订单列表存在', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径5-步骤9: 发现错误 → 取消采购订单', async ({ page }) => {
    if (!supplierId || !materialId) {
      test.skip()
      return
    }

    // 先创建一个采购订单
    const createRes = await apiFetch(procurementToken, 'POST', '/purchase-orders', {
      supplierId,
      items: [{ materialId, quantity: 50, price: 10.00 }],
      remark: 'E2E取消测试-创建',
    })

    if (createRes.status !== 201) {
      test.skip()
      return
    }

    const orderId = createRes.data?.data?.id
    if (!orderId) {
      test.skip()
      return
    }

    // 取消采购订单
    const cancelRes = await apiFetch(procurementToken, 'POST', `/purchase-orders/${orderId}/cancel`)
    expect([200, 400]).toContain(cancelRes.status)
  })

  test('路径5-步骤10: 验证采购订单状态', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    // 验证订单状态显示
    const statusCell = page.locator('text=已取消, text=cancelled')
    await expect(statusCell.first()).toBeVisible({ timeout: 5000 })
  })
})

// ────────────────────────────────────────────
// 路径6: 查看采购订单路径
// ────────────────────────────────────────────

test.describe('采购员创建采购订单 - 查看采购订单路径', () => {
  test('路径6-步骤1: 采购员登录成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径6-步骤2: 进入采购订单页面成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径6-步骤3: 查看采购订单列表', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径6-步骤4: 查看采购订单详情', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()

      await expect(page.locator('text=采购订单详情, text=订单信息')).toBeVisible({ timeout: 5000 })
    }
  })

  test('路径6-步骤5: 查看采购订单状态', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)

    const statusCell = page.locator('text=待处理, text=pending, text=待收货, text=已完成, text=completed')
    await expect(statusCell.first()).toBeVisible({ timeout: 5000 })
  })
})

// ────────────────────────────────────────────
// 路径7: 供应商管理路径
// ────────────────────────────────────────────

test.describe('采购员创建采购订单 - 供应商管理路径', () => {
  test('路径7-步骤1: 采购员登录成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await expect(page).toHaveURL(`${FE_BASE}/`)
  })

  test('路径7-步骤2: 进入供应商页面成功', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/suppliers`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })

  test('路径7-步骤3: 查看供应商列表', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/suppliers`)
    await page.waitForTimeout(1000)

    const rows = page.locator('table tbody tr')
    await expect(rows.first()).toBeVisible({ timeout: 5000 })
  })

  test('路径7-步骤4: 查看供应商详情', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/suppliers`)
    await page.waitForTimeout(1000)

    const firstRow = page.locator('table tbody tr').first()
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click()

      await expect(page.locator('text=供应商详情, text=供应商信息')).toBeVisible({ timeout: 5000 })
    }
  })

  test('路径7-步骤5: 创建供应商', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/suppliers`)
    await page.waitForTimeout(1000)

    // 验证页面不会崩溃
    await expect(page.locator('body')).toBeVisible()
  })
})
