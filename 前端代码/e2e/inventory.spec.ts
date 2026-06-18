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

async function getInventoryRefs(token: string) {
  const [categories, locations] = await Promise.all([
    apiFetch(token, 'GET', '/categories?page=1&pageSize=1'),
    apiFetch(token, 'GET', '/locations?page=1&pageSize=1'),
  ])
  return {
    category: categories.data?.data?.list?.[0],
    location: locations.data?.data?.list?.[0],
  }
}

async function createTestMaterial(token: string, suffix: number, categoryId: string, locationId: string) {
  const name = `库存E2E物料-${suffix}`
  const price = 12
  const res = await apiFetch(token, 'POST', '/materials', {
    code: `E2E-INV-MAT-${suffix}`,
    name,
    spec: '1ml',
    unit: '瓶',
    categoryId,
    locationId,
    price,
    minStock: 0,
    maxStock: 1000,
    safetyStock: 0,
    remark: `E2E库存测试物料-${suffix}`,
  })
  expect(res.status).toBe(201)
  return { id: res.data?.data?.id, name, spec: '1ml', unit: '瓶', price }
}

async function getFirstReceiverName(token: string): Promise<string> {
  const users = await apiFetch(token, 'GET', '/users?page=1&pageSize=20')
  const list = users.data?.data?.list || []
  const user = list.find((item: any) => item.status === 'active') || list[0]
  return user?.realName || user?.real_name || user?.name || user?.username || '管理员'
}

function toRowId(seed: unknown) {
  const text = String(seed ?? Date.now())
  return Math.abs(text.split('').reduce((sum, char) => ((sum << 5) - sum) + char.charCodeAt(0), 0))
}

async function expandMaterialGroup(page: Page, materialName: string) {
  const groupRow = page.locator('tbody tr', { hasText: materialName }).first()
  await expect(groupRow).toBeVisible({ timeout: 30000 })
  await expect(groupRow).toContainText('批次')
  await groupRow.locator('td').nth(2).click()
}

test.describe('库存列表 -> 入库批次跨页面可见性', () => {
  test('INV-VIS-01. 入库后库存列表按物料直达并显示对应批次和数量', async ({ page }) => {
    const token = await apiLogin()
    const suffix = Date.now()
    const { category, location } = await getInventoryRefs(token)
    expect(category?.id).toBeTruthy()
    expect(location?.id).toBeTruthy()

    const material = await createTestMaterial(token, suffix, category.id, location.id)
    expect(material?.id).toBeTruthy()
    const batchNo = `E2E-INV-VIS-${suffix}`
    const inbound = await apiFetch(token, 'POST', '/inbound', {
      type: 'direct',
      materialId: material.id,
      batchNo,
      quantity: 7,
      price: Number(material.price || 1),
      locationId: location.id,
      expiryDate: '2028-12-31',
      remark: `E2E库存可见-${suffix}`,
    })
    expect(inbound.status).toBe(201)

    const inventory = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=50&materialId=${material.id}`)
    expect(inventory.status).toBe(200)
    const apiRows = inventory.data?.data?.list || []
    expect(apiRows.every((row: any) => row.materialId === material.id)).toBe(true)
    expect(apiRows.some((row: any) => row.batchNo === batchNo && Number(row.stock) === 7)).toBe(true)

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/inventory?materialId=${encodeURIComponent(material.id)}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '库存列表' })).toBeVisible({ timeout: 15000 })

    await expandMaterialGroup(page, material.name)

    const batchRow = page.locator('tbody tr', { hasText: batchNo }).first()
    await expect(batchRow).toBeVisible({ timeout: 15000 })
    await expect(batchRow).toContainText(material.name)
    await expect(batchRow).toContainText('7')
    await expect(batchRow).toContainText('2028-12-31')
  })

  test('INV-OUT-01. 从库存具体批次出库只扣减用户选择的批次', async ({ page }) => {
    const token = await apiLogin()
    const suffix = Date.now()
    const { category, location } = await getInventoryRefs(token)
    expect(category?.id).toBeTruthy()
    expect(location?.id).toBeTruthy()

    const material = await createTestMaterial(token, suffix, category.id, location.id)
    expect(material?.id).toBeTruthy()
    const batchA = `E2E-INV-OUT-A-${suffix}`
    const batchB = `E2E-INV-OUT-B-${suffix}`
    const receiverName = await getFirstReceiverName(token)

    for (const [batchNo, quantity] of [[batchA, 9], [batchB, 8]] as const) {
      const inbound = await apiFetch(token, 'POST', '/inbound', {
        type: 'direct',
        materialId: material.id,
        batchNo,
        quantity,
        price: Number(material.price || 1),
        locationId: location.id,
        expiryDate: '2028-12-31',
        remark: `E2E库存批次出库-${suffix}`,
      })
      expect(inbound.status).toBe(201)
    }

    const inventoryBefore = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=100&materialId=${material.id}`)
    expect(inventoryBefore.status).toBe(200)
    const beforeRows = inventoryBefore.data?.data?.list || []
    const rowA = beforeRows.find((row: any) => row.batchNo === batchA)
    const rowB = beforeRows.find((row: any) => row.batchNo === batchB)
    expect(rowA?.batchId).toBeTruthy()
    expect(rowB?.batchId).toBeTruthy()
    expect(Number(rowA.stock)).toBe(9)
    expect(Number(rowB.stock)).toBe(8)
    const rowAId = toRowId(rowA.id)

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/inventory?materialId=${encodeURIComponent(material.id)}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '库存列表' })).toBeVisible({ timeout: 15000 })

    await expandMaterialGroup(page, material.name)

    const batchRowA = page.locator('tbody tr', { hasText: batchA }).first()
    await expect(batchRowA).toBeVisible({ timeout: 15000 })
    await batchRowA.getByRole('button', { name: '出库' }).click()

    const modal = page.getByTestId('outbound-modal')
    await expect(modal).toBeVisible({ timeout: 10000 })
    await expect(modal).toContainText(batchA)
    await expect(modal).toContainText('9')

    await page.getByTestId(`outbound-quantity-${rowAId}`).fill('3')
    const receiverSelect = page.getByTestId(`outbound-user-${rowAId}`)
    await receiverSelect.click()
    await receiverSelect.locator('li', { hasText: receiverName }).first().click()
    await page.getByTestId('outbound-confirm-btn').click()
    await expect(page.getByText('出库登记成功')).toBeVisible({ timeout: 15000 })
    await expect(modal).toBeHidden({ timeout: 15000 })

    const inventoryAfter = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=100&materialId=${material.id}`)
    expect(inventoryAfter.status).toBe(200)
    const afterRows = inventoryAfter.data?.data?.list || []
    const afterA = afterRows.find((row: any) => row.batchNo === batchA)
    const afterB = afterRows.find((row: any) => row.batchNo === batchB)
    expect(Number(afterA.stock)).toBe(6)
    expect(Number(afterB.stock)).toBe(8)

    const outboundList = await apiFetch(token, 'GET', '/outbound?page=1&pageSize=100')
    expect(outboundList.status).toBe(200)
    const created = (outboundList.data?.data?.list || []).find((row: any) =>
      row.items?.some((item: any) => item.batchNo === batchA)
    )
    const matchingItem = created?.items?.find((item: any) => item.batchNo === batchA)
    expect(matchingItem?.batchId).toBe(rowA.batchId)
    expect(Number(matchingItem?.quantity)).toBe(3)
  })

  test('INV-SCRAP-01. 从库存勾选具体批次报废只扣减用户选择的批次', async ({ page }) => {
    const token = await apiLogin()
    const suffix = Date.now()
    const { category, location } = await getInventoryRefs(token)
    expect(category?.id).toBeTruthy()
    expect(location?.id).toBeTruthy()

    const material = await createTestMaterial(token, suffix, category.id, location.id)
    expect(material?.id).toBeTruthy()
    const batchA = `E2E-INV-SCRAP-A-${suffix}`
    const batchB = `E2E-INV-SCRAP-B-${suffix}`

    for (const [batchNo, quantity] of [[batchA, 9], [batchB, 8]] as const) {
      const inbound = await apiFetch(token, 'POST', '/inbound', {
        type: 'direct',
        materialId: material.id,
        batchNo,
        quantity,
        price: Number(material.price || 1),
        locationId: location.id,
        expiryDate: '2028-12-31',
        remark: `E2E库存批次报废-${suffix}`,
      })
      expect(inbound.status).toBe(201)
    }

    const inventoryBefore = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=100&materialId=${material.id}`)
    expect(inventoryBefore.status).toBe(200)
    const beforeRows = inventoryBefore.data?.data?.list || []
    const rowA = beforeRows.find((row: any) => row.batchNo === batchA)
    const rowB = beforeRows.find((row: any) => row.batchNo === batchB)
    expect(rowA?.batchId).toBeTruthy()
    expect(rowB?.batchId).toBeTruthy()
    expect(Number(rowA.stock)).toBe(9)
    expect(Number(rowB.stock)).toBe(8)

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/inventory?materialId=${encodeURIComponent(material.id)}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '库存列表' })).toBeVisible({ timeout: 15000 })

    await expandMaterialGroup(page, material.name)

    const batchRowA = page.locator('tbody tr', { hasText: batchA }).first()
    await expect(batchRowA).toBeVisible({ timeout: 15000 })
    await batchRowA.locator('input[type="checkbox"]').check()

    await page.getByRole('button', { name: '批量报废' }).click()
    const modal = page.getByTestId('batch-scrap-modal')
    await expect(modal).toBeVisible({ timeout: 10000 })
    await expect(modal).toContainText(material.name)
    await expect(modal).toContainText(batchA)
    await expect(modal).toContainText('9')

    await page.getByTestId('batch-scrap-reason').click()
    await page.getByTestId('option-expired').click()
    await page.getByTestId('batch-scrap-confirm-btn').click()
    await expect(page.getByText('报废登记成功')).toBeVisible({ timeout: 15000 })
    await expect(modal).toBeHidden({ timeout: 15000 })

    const inventoryAfter = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=100&materialId=${material.id}`)
    expect(inventoryAfter.status).toBe(200)
    const afterRows = inventoryAfter.data?.data?.list || []
    const afterA = afterRows.find((row: any) => row.batchNo === batchA)
    const afterB = afterRows.find((row: any) => row.batchNo === batchB)
    expect(afterA).toBeUndefined()
    expect(Number(afterB.stock)).toBe(8)

    const scrapList = await apiFetch(token, 'GET', '/scraps?page=1&pageSize=100')
    expect(scrapList.status).toBe(200)
    const created = (scrapList.data?.data?.list || []).find((row: any) => row.batchNo === batchA)
    expect(created?.batchId).toBe(rowA.batchId)
    expect(Number(created?.quantity)).toBe(9)
  })
})
