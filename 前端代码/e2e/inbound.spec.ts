import { test, expect, Page } from '@playwright/test'

const FE_BASE = 'http://localhost:8080'
const API_BASE = 'http://127.0.0.1:3001/api/v1'

const ROLES = {
  admin: { username: 'admin', password: 'admin123' },
} as const

async function loginAs(page: Page, role: keyof typeof ROLES) {
  await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
  const cred = ROLES[role]
  await page.fill('input[type="text"]', cred.username)
  await page.fill('input[type="password"]', cred.password)
  await page.click('button[type="submit"]')
  await page.waitForURL(`${FE_BASE}/`, { timeout: 15000, waitUntil: 'domcontentloaded' })
}

async function apiLogin(): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ROLES.admin),
  })
  const data = (await res.json()) as any
  expect(res.status).toBe(200)
  return data.data?.token || data.token
}

async function apiFetch(token: string, method: string, path: string, body?: any) {
  const opts: any = { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
  if (body && method !== 'GET' && method !== 'HEAD') opts.body = JSON.stringify(body)
  const res = await fetch(`${API_BASE}${path}`, opts)
  return { status: res.status, data: (await res.json().catch(() => null)) as any }
}

async function getInboundRefs(token: string) {
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

async function getInventoryTotalStock(token: string, materialId: string): Promise<number> {
  const res = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=50&materialId=${materialId}`)
  expect(res.status).toBe(200)
  const row = res.data?.data?.list?.[0]
  return Number(row?.totalStock ?? row?.stock ?? 0)
}

test.describe('入库管理 -> 取消恢复主路径', () => {
  test('INBOUND-CANCEL-01. 浏览器取消采购入库后同步回退库存和采购订单', async ({ page }) => {
    const token = await apiLogin()
    const { material, supplier, location } = await getInboundRefs(token)
    expect(material?.id).toBeTruthy()
    expect(location?.id).toBeTruthy()

    const suffix = Date.now()
    const beforeStock = await getInventoryTotalStock(token, material.id)
    const purchaseOrder = await apiFetch(token, 'POST', '/purchase-orders', {
      materialId: material.id,
      materialName: material.name,
      supplierId: supplier?.id,
      orderedQty: 5,
      unit: material.unit || '个',
      unitPrice: Number(material.price || 1),
      remark: `E2E入库取消-${suffix}`,
    })
    expect(purchaseOrder.status).toBe(200)
    const purchaseOrderId = purchaseOrder.data?.data?.id

    const inbound = await apiFetch(token, 'POST', '/inbound', {
      type: 'purchase',
      materialId: material.id,
      batchNo: `E2E-IN-CANCEL-${suffix}`,
      quantity: 5,
      price: Number(material.price || 1),
      supplierId: supplier?.id,
      locationId: location.id,
      expiryDate: '2027-12-31',
      purchaseOrderId,
      remark: `E2E入库取消-${suffix}`,
    })
    expect(inbound.status).toBe(201)
    const inboundId = inbound.data?.data?.id
    const inboundNo = inbound.data?.data?.inboundNo
    expect(await getInventoryTotalStock(token, material.id)).toBe(beforeStock + 5)

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/inbound?keyword=${encodeURIComponent(inboundNo)}&status=completed`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('tbody tr', { hasText: inboundNo }).first()
    await expect(row).toBeVisible({ timeout: 30000 })
    await expect(row).toContainText('已完成')
    await row.locator('button[title="取消"]').click()
    await expect(page.getByRole('dialog', { name: '取消入库' })).toBeVisible({ timeout: 10000 })
    const cancelResponsePromise = page.waitForResponse(response =>
      response.url().includes(`/api/v1/inbound/${inboundId}/cancel`) &&
      response.request().method() === 'POST'
    )
    await page.getByRole('button', { name: '确认取消' }).click()
    const cancelResponse = await cancelResponsePromise
    expect(cancelResponse.status()).toBe(200)
    await expect(page.getByText('取消成功')).toBeVisible({ timeout: 15000 })

    const cancelledOrder = await apiFetch(token, 'GET', `/purchase-orders/${purchaseOrderId}`)
    expect(cancelledOrder.data?.data).toMatchObject({ status: 'pending', receivedQty: 0 })
    expect(await getInventoryTotalStock(token, material.id)).toBe(beforeStock)

    const cancelledInbound = await apiFetch(token, 'GET', `/inbound?keyword=${encodeURIComponent(inboundNo)}&status=cancelled`)
    expect(cancelledInbound.status).toBe(200)
    expect(cancelledInbound.data?.data?.list?.some((item: any) => item.id === inboundId && item.status === 'cancelled')).toBe(true)
  })

  test('INBOUND-RESTORE-01. 浏览器恢复已取消采购入库后同步恢复库存和采购订单', async ({ page }) => {
    const token = await apiLogin()
    const { material, supplier, location } = await getInboundRefs(token)
    expect(material?.id).toBeTruthy()
    expect(location?.id).toBeTruthy()

    const suffix = Date.now()
    const beforeStock = await getInventoryTotalStock(token, material.id)
    const purchaseOrder = await apiFetch(token, 'POST', '/purchase-orders', {
      materialId: material.id,
      materialName: material.name,
      supplierId: supplier?.id,
      orderedQty: 4,
      unit: material.unit || '个',
      unitPrice: Number(material.price || 1),
      remark: `E2E入库恢复-${suffix}`,
    })
    expect(purchaseOrder.status).toBe(200)
    const purchaseOrderId = purchaseOrder.data?.data?.id

    const inbound = await apiFetch(token, 'POST', '/inbound', {
      type: 'purchase',
      materialId: material.id,
      batchNo: `E2E-IN-RESTORE-${suffix}`,
      quantity: 4,
      price: Number(material.price || 1),
      supplierId: supplier?.id,
      locationId: location.id,
      expiryDate: '2027-12-31',
      purchaseOrderId,
      remark: `E2E入库恢复-${suffix}`,
    })
    expect(inbound.status).toBe(201)
    const inboundId = inbound.data?.data?.id
    const inboundNo = inbound.data?.data?.inboundNo

    const cancel = await apiFetch(token, 'POST', `/inbound/${inboundId}/cancel`, { reason: 'E2E 恢复前取消' })
    expect(cancel.status).toBe(200)

    const cancelledOrder = await apiFetch(token, 'GET', `/purchase-orders/${purchaseOrderId}`)
    expect(cancelledOrder.data?.data).toMatchObject({ status: 'pending', receivedQty: 0 })
    expect(await getInventoryTotalStock(token, material.id)).toBe(beforeStock)

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/inbound?keyword=${encodeURIComponent(inboundNo)}&status=cancelled`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('tbody tr', { hasText: inboundNo }).first()
    await expect(row).toBeVisible({ timeout: 30000 })
    await expect(row).toContainText('已取消')
    await row.locator('button[title="恢复"]').click()
    await expect(page.getByText('恢复此入库记录？')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: '确认恢复' }).click()
    await expect(page.getByText('恢复成功')).toBeVisible({ timeout: 15000 })

    const restoredOrder = await apiFetch(token, 'GET', `/purchase-orders/${purchaseOrderId}`)
    expect(restoredOrder.data?.data).toMatchObject({ status: 'completed', receivedQty: 4, remainingQty: 0 })
    expect(await getInventoryTotalStock(token, material.id)).toBe(beforeStock + 4)

    const restoredInbound = await apiFetch(token, 'GET', `/inbound?keyword=${encodeURIComponent(inboundNo)}&status=completed`)
    expect(restoredInbound.status).toBe(200)
    expect(restoredInbound.data?.data?.list?.some((item: any) => item.id === inboundId && item.status === 'completed')).toBe(true)
  })
})
