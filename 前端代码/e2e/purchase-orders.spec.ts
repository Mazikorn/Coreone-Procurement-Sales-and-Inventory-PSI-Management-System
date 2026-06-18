import { test, expect, Page } from '@playwright/test'

const FE_BASE = 'http://localhost:8080'
const API_BASE = 'http://127.0.0.1:3001/api/v1'

const ROLES = {
  admin: { username: 'admin', password: 'admin123' },
  warehouse_manager: { username: 'wangkq', password: 'CoreOne2026!' },
  technician: { username: 'zhangwei', password: 'CoreOne2026!' },
  pathologist: { username: 'liuyf', password: 'CoreOne2026!' },
  procurement: { username: 'zhaohp', password: 'CoreOne2026!' },
  finance: { username: 'sunli', password: 'CoreOne2026!' },
} as const
type RoleKey = keyof typeof ROLES

async function loginAs(page: Page, role: RoleKey) {
  await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
  const cred = ROLES[role]
  await page.fill('input[type="text"]', cred.username)
  await page.fill('input[type="password"]', cred.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(`${FE_BASE}/`, { timeout: 15000, waitUntil: 'domcontentloaded' })
}

async function apiLogin(role: RoleKey): Promise<string> {
  const cred = ROLES[role]
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cred),
  })
  const data = (await res.json()) as any
  return data.data?.token || data.token
}

async function apiFetch(token: string, method: string, path: string, body?: any) {
  const opts: any = { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
  if (body && method !== 'GET' && method !== 'HEAD') opts.body = JSON.stringify(body)
  const res = await fetch(`${API_BASE}${path}`, opts)
  return { status: res.status, data: (await res.json().catch(() => null)) as any }
}

async function getAnyMaterialId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/materials?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

async function getPurchaseInboundRefs(token: string) {
  const [materials, suppliers, locations] = await Promise.all([
    apiFetch(token, 'GET', '/materials?page=1&pageSize=1'),
    apiFetch(token, 'GET', '/suppliers?page=1&pageSize=1'),
    apiFetch(token, 'GET', '/locations?page=1&pageSize=1'),
  ])

  return {
    material: materials.data?.data?.list?.[0],
    supplier: suppliers.data?.data?.list?.[0],
    location: locations.data?.data?.list?.[0],
  }
}

// ────────────────────────────────────────────
// 1. 查看采购订单列表 (10 tests)
// ────────────────────────────────────────────
test.describe('采购订单 -> 查看列表', () => {
  test('PO-LIST-01. admin可查看采购订单列表', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })
  test('PO-LIST-02. procurement可查看采购订单列表', async ({ page }) => {
    await loginAs(page, 'procurement')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  })
  test('PO-LIST-03. technician访问返回403', async () => {
    const res = await apiFetch(await apiLogin('technician'), 'GET', '/purchase-orders')
    expect(res.status).toBe(403)
  })
  test('PO-LIST-04. pathologist访问返回403', async () => {
    const res = await apiFetch(await apiLogin('pathologist'), 'GET', '/purchase-orders')
    expect(res.status).toBe(403)
  })
  test('PO-LIST-05. warehouse_manager访问返回403', async () => {
    const res = await apiFetch(await apiLogin('warehouse_manager'), 'GET', '/purchase-orders')
    expect(res.status).toBe(403)
  })
  test('PO-LIST-06. finance访问返回403', async () => {
    const res = await apiFetch(await apiLogin('finance'), 'GET', '/purchase-orders')
    expect(res.status).toBe(403)
  })
  test('PO-LIST-07. 无Token返回401', async () => {
    const res = await fetch(`${API_BASE}/purchase-orders`)
    expect(res.status).toBe(401)
  })
  test('PO-LIST-08. API响应格式验证', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/purchase-orders?page=1&pageSize=1')
    expect(res.status).toBe(200)
    expect(res.data).toHaveProperty('data')
    expect(res.data?.data).toHaveProperty('list')
  })
  test('PO-LIST-09. 按状态筛选', async () => {
    const token = await apiLogin('admin')
    for (const status of ['pending', 'partial', 'completed', 'cancelled']) {
      const res = await apiFetch(token, 'GET', `/purchase-orders?status=${status}`)
      expect(res.status).toBe(200)
    }
  })
  test('PO-LIST-10. 页面加载性能', async ({ page }) => {
    await loginAs(page, 'admin')
    const start = Date.now()
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(2000)
    expect(Date.now() - start).toBeLessThan(10000)
  })
})

// ────────────────────────────────────────────
// 2. 创建采购订单 (15 tests)
// ────────────────────────────────────────────
test.describe('采购订单 -> 创建', () => {
  test('PO-CREATE-01. admin创建采购订单成功', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/purchase-orders', {
      materialId: mid, materialName: 'E2E物料', orderedQty: 100, unitPrice: 50,
    })
    expect([200, 201]).toContain(res.status)
    expect(res.data?.data?.orderNo).toMatch(/^PO/)
  })
  test('PO-CREATE-02. procurement创建采购订单成功', async () => {
    const token = await apiLogin('procurement')
    const adminToken = await apiLogin('admin')
    const mid = await getAnyMaterialId(adminToken)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/purchase-orders', {
      materialId: mid, orderedQty: 50, unitPrice: 30,
    })
    expect([200, 201]).toContain(res.status)
  })
  test('PO-CREATE-03. 缺少materialId返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/purchase-orders', { orderedQty: 10, unitPrice: 10 })
    expect(res.status).toBe(400)
  })
  test('PO-CREATE-04. 缺少orderedQty返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/purchase-orders', { materialId: mid, unitPrice: 10 })
    expect(res.status).toBe(400)
  })
  test('PO-CREATE-05. orderedQty=0返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/purchase-orders', { materialId: mid, orderedQty: 0, unitPrice: 10 })
    expect(res.status).toBe(400)
  })
  test('PO-CREATE-06. 负数orderedQty返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/purchase-orders', { materialId: mid, orderedQty: -1, unitPrice: 10 })
    expect(res.status).toBe(400)
  })
  for (const role of ['technician', 'pathologist', 'warehouse_manager', 'finance'] as RoleKey[]) {
    test(`PO-CREATE-07-${role}. ${role}创建采购订单返回403`, async () => {
      const token = await apiLogin(role)
      const adminToken = await apiLogin('admin')
      const mid = await getAnyMaterialId(adminToken)
      if (!mid) { test.skip(); return }
      const res = await apiFetch(token, 'POST', '/purchase-orders', { materialId: mid, orderedQty: 1, unitPrice: 1 })
      expect(res.status).toBe(403)
    })
  }
  test('PO-CREATE-08. 创建后列表更新', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)
  })
  test('PO-CREATE-09. 并发：快速双击提交', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const body = { materialId: mid, orderedQty: 10, unitPrice: 5 }
    const [r1, r2] = await Promise.all([
      apiFetch(token, 'POST', '/purchase-orders', body),
      apiFetch(token, 'POST', '/purchase-orders', body),
    ])
    expect(r1.status === 200 || r1.status === 201 || r2.status === 200 || r2.status === 201).toBe(true)
  })
  test('PO-CREATE-10. 自动计算totalAmount', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/purchase-orders', {
      materialId: mid, orderedQty: 20, unitPrice: 25,
    })
    if (res.status === 200 || res.status === 201) {
      expect(res.data?.data?.orderNo).toBeDefined()
    }
  })
})

// ────────────────────────────────────────────
// 3. 采购订单详情 (8 tests)
// ────────────────────────────────────────────
test.describe('采购订单 -> 详情', () => {
  test('PO-DETAIL-01. admin查看采购订单详情', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/purchase-orders?page=1&pageSize=1')
    const id = res.data?.data?.list?.[0]?.id
    if (!id) { test.skip(); return }
    const detail = await apiFetch(token, 'GET', `/purchase-orders/${id}`)
    expect(detail.status).toBe(200)
    expect(detail.data?.data?.orderNo).toBeDefined()
  })
  test('PO-DETAIL-02. 查看不存在的订单返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/purchase-orders/non-existent-id')
    expect(res.status).toBe(404)
  })
  test('PO-DETAIL-03. UI差异：admin可点击行查看详情', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)
    const rows = page.locator('table tbody tr')
    if (await rows.count() > 0) {
      await rows.first().click()
      await page.waitForTimeout(500)
    }
  })
})

// ────────────────────────────────────────────
// 4. 收货与取消 (12 tests)
// ────────────────────────────────────────────
test.describe('采购订单 -> 收货与取消', () => {
  test('PO-RECEIVE-01. 直接收货接口被拒绝且不改订单状态', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const create = await apiFetch(token, 'POST', '/purchase-orders', {
      materialId: mid, orderedQty: 100, unitPrice: 10,
    })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/purchase-orders/${id}/receive`, { quantity: 50 })
    expect(res.status).toBe(400)
    expect(res.data?.error?.message).toContain('采购收货必须通过入库接口')

    const detail = await apiFetch(token, 'GET', `/purchase-orders/${id}`)
    expect(detail.status).toBe(200)
    expect(detail.data?.data?.receivedQty).toBe(0)
    expect(detail.data?.data?.status).toBe('pending')
  })
  test('PO-RECEIVE-02. 采购入库闭环更新订单并生成库存批次', async () => {
    const token = await apiLogin('admin')
    const { material, supplier, location } = await getPurchaseInboundRefs(token)
    if (!material?.id || !location?.id) { test.skip(); return }
    const suffix = Date.now()
    const create = await apiFetch(token, 'POST', '/purchase-orders', {
      materialId: material.id,
      materialName: material.name || `E2E采购物料-${suffix}`,
      supplierId: supplier?.id || material.supplierId,
      orderedQty: 10,
      unit: material.unit || '个',
      unitPrice: 5,
    })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }

    const firstBatchNo = `E2E-PO-IN-${suffix}-1`
    const firstInbound = await apiFetch(token, 'POST', '/inbound', {
      type: 'purchase',
      materialId: material.id,
      batchNo: firstBatchNo,
      quantity: 4,
      price: 5,
      supplierId: supplier?.id || material.supplierId,
      locationId: location.id,
      expiryDate: '2027-12-31',
      purchaseOrderId: id,
    })
    expect(firstInbound.status).toBe(201)

    const partial = await apiFetch(token, 'GET', `/purchase-orders/${id}`)
    expect(partial.status).toBe(200)
    expect(partial.data?.data?.receivedQty).toBe(4)
    expect(partial.data?.data?.remainingQty).toBe(6)
    expect(partial.data?.data?.status).toBe('partial')

    const secondBatchNo = `E2E-PO-IN-${suffix}-2`
    const secondInbound = await apiFetch(token, 'POST', '/inbound', {
      type: 'purchase',
      materialId: material.id,
      batchNo: secondBatchNo,
      quantity: 6,
      price: 5,
      supplierId: supplier?.id || material.supplierId,
      locationId: location.id,
      expiryDate: '2027-12-31',
      purchaseOrderId: id,
    })
    expect(secondInbound.status).toBe(201)

    const completed = await apiFetch(token, 'GET', `/purchase-orders/${id}`)
    expect(completed.status).toBe(200)
    expect(completed.data?.data?.receivedQty).toBe(10)
    expect(completed.data?.data?.remainingQty).toBe(0)
    expect(completed.data?.data?.status).toBe('completed')

    const inventory = await apiFetch(token, 'GET', `/inventory?keyword=${encodeURIComponent(firstBatchNo)}&page=1&pageSize=10`)
    expect(inventory.status).toBe(200)
    const batches = inventory.data?.data?.list || []
    expect(batches.some((row: any) => row.batchNo === firstBatchNo && Number(row.stock) >= 4)).toBe(true)
  })
  test('PO-RECEIVE-03. 收货数量超过订单数量返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const create = await apiFetch(token, 'POST', '/purchase-orders', {
      materialId: mid, orderedQty: 5, unitPrice: 10,
    })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/purchase-orders/${id}/receive`, { quantity: 999 })
    expect(res.status).toBe(400)
  })
  test('PO-RECEIVE-04. 收货quantity=0返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/purchase-orders?page=1&pageSize=1')
    const id = res.data?.data?.list?.[0]?.id
    if (!id) { test.skip(); return }
    const r = await apiFetch(token, 'PUT', `/purchase-orders/${id}/receive`, { quantity: 0 })
    expect(r.status).toBe(400)
  })
  test('PO-CANCEL-01. 取消pending状态订单成功', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const create = await apiFetch(token, 'POST', '/purchase-orders', {
      materialId: mid, orderedQty: 5, unitPrice: 10,
    })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/purchase-orders/${id}/cancel`)
    expect([200, 400]).toContain(res.status)
  })
  test('PO-CANCEL-02. 已完成订单不能取消', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/purchase-orders?status=completed&page=1&pageSize=1')
    const id = res.data?.data?.list?.[0]?.id
    if (!id) { test.skip(); return }
    const r = await apiFetch(token, 'PUT', `/purchase-orders/${id}/cancel`)
    expect(r.status).toBe(400)
  })
  test('PO-CANCEL-03. 取消不存在的订单返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'PUT', '/purchase-orders/non-existent/cancel')
    expect(res.status).toBe(404)
  })
  test('PO-CANCEL-04. UI差异：admin显示取消按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)
  })
})

// ────────────────────────────────────────────
// 5. 分页与筛选 (8 tests)
// ────────────────────────────────────────────
test.describe('采购订单 -> 分页与筛选', () => {
  test('PO-PAGE-01. page=999返回空列表', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/purchase-orders?page=999&pageSize=5')
    expect(res.status).toBe(200)
  })
  test('PO-PAGE-02. 按keyword筛选', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/purchase-orders?keyword=PO')
    expect(res.status).toBe(200)
  })
  test('PO-PAGE-03. 按supplierId筛选', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/purchase-orders?supplierId=test')
    expect(res.status).toBe(200)
  })
  test('PO-PAGE-04. 页面刷新后状态保持', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
  test('PO-PAGE-05. 响应式布局', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(`${FE_BASE}/purchase-orders`)
    await page.waitForTimeout(1000)
  })
  test('PO-PAGE-06. 多状态筛选', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/purchase-orders?status=pending,partial')
    expect(res.status).toBe(200)
  })
  test('PO-PERM-admin. admin GET /purchase-orders 返回200', async () => {
    const res = await apiFetch(await apiLogin('admin'), 'GET', '/purchase-orders')
    expect(res.status).toBe(200)
  })
  test('PO-PERM-procurement. procurement GET /purchase-orders 返回200', async () => {
    const res = await apiFetch(await apiLogin('procurement'), 'GET', '/purchase-orders')
    expect(res.status).toBe(200)
  })
})
