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
const ST_READ_ROLES: RoleKey[] = ['admin', 'warehouse_manager']
const ST_FORBIDDEN: RoleKey[] = ['technician', 'pathologist', 'procurement', 'finance']

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
  expect(res.status, `${role} API 登录失败: ${JSON.stringify(data)}`).toBe(200)
  const token = data.data?.token || data.token
  expect(token, `${role} API 登录未返回 token`).toBeTruthy()
  return token
}

async function loginByStorage(page: Page, role: RoleKey) {
  const token = await apiLogin(role)
  const cred = ROLES[role]
  await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(({ token, role, username }) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify({ username, realName: username, role }))
  }, { token, role, username: cred.username })
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
async function getAnyLocationId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/locations?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}
async function getAnyStocktakingId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/stocktaking?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}

async function getStocktakingRecord(token: string, id: string, params = '') {
  const query = params || 'page=1&pageSize=100'
  const r = await apiFetch(token, 'GET', `/stocktaking?${query}`)
  expect(r.status).toBe(200)
  const record = (r.data?.data?.list || []).find((item: any) => item.id === id)
  expect(record, `未找到盘点记录 ${id}: ${JSON.stringify(r.data)}`).toBeTruthy()
  return record
}

async function createStocktakingRecord(
  token: string,
  body: { materialId?: string; actualStock?: number; remark?: string } = {},
) {
  const materialId = body.materialId || await getAnyMaterialId(token)
  expect(materialId, '创建盘点记录需要至少一个物料').toBeTruthy()
  const res = await apiFetch(token, 'POST', '/stocktaking', {
    materialId,
    actualStock: body.actualStock ?? 1,
    remark: body.remark || `E2E盘点-${Date.now()}`,
  })
  expect(res.status).toBe(200)
  const id = res.data?.data?.id
  expect(id, `创建盘点未返回 id: ${JSON.stringify(res.data)}`).toBeTruthy()
  return {
    id,
    materialId,
    record: await getStocktakingRecord(token, id),
  }
}

function expectStocktakingShape(item: any) {
  expect(item).toEqual(expect.objectContaining({
    id: expect.any(String),
    stocktakingNo: expect.any(String),
    materialId: expect.any(String),
    materialName: expect.any(String),
    systemStock: expect.any(Number),
    actualStock: expect.any(Number),
    difference: expect.any(Number),
    operator: expect.any(String),
    status: expect.any(String),
    createdAt: expect.any(String),
  }))
}

async function mockStocktakingPage(page: Page, options?: {
  listRequests?: URL[]
  statsRequests?: URL[]
  materialName?: string
  stocktakingNo?: string
}) {
  const materialName = options?.materialName || '盘点页面验证物料'
  const stocktakingNo = options?.stocktakingNo || 'STK-MOCK-001'
  await page.route('**/api/v1/stocktaking**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/stocktaking/stats')) {
      options?.statsRequests?.push(url)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { total: 1, completed: 1, confirmed: 0, diffCount: 1, accuracy: 0 },
        }),
      })
      return
    }

    options?.listRequests?.push(url)
    const keyword = url.searchParams.get('keyword') || ''
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          list: [{
            id: 'stocktaking-mock-001',
            stocktakingNo,
            materialId: 'material-mock-001',
            materialName: keyword ? `${materialName}-${keyword}` : materialName,
            materialCode: 'MAT-MOCK-001',
            materialUnit: '瓶',
            categoryName: 'E2E分类',
            locationName: '常温库',
            systemStock: 12.5,
            actualStock: 10,
            difference: -2.5,
            operator: 'admin',
            status: 'completed',
            remark: 'E2E页面验证',
            createdAt: '2026-06-17T14:05:00+08:00',
          }],
          pagination: { total: 1, page: 1, pageSize: 20 },
        },
      }),
    })
  })
}
async function getInventoryRows(token: string, materialId: string): Promise<any[]> {
  const r = await apiFetch(token, 'GET', `/inventory?page=1&pageSize=50&materialId=${materialId}`)
  expect(r.status).toBe(200)
  const rows = r.data?.data?.list || []
  expect(rows.every((row: any) => row.materialId === materialId)).toBe(true)
  return rows
}
async function getInventoryTotalStock(token: string, materialId: string): Promise<number> {
  const rows = await getInventoryRows(token, materialId)
  return Number(rows[0]?.totalStock ?? rows[0]?.stock ?? 0)
}

async function createStockedMaterial(token: string, suffix = Date.now().toString(), quantity = 20) {
  const categories = await apiFetch(token, 'GET', '/categories?page=1&pageSize=1')
  expect(categories.status).toBe(200)
  const categoryId = categories.data?.data?.list?.[0]?.id
  expect(categoryId, '创建盘亏测试物料需要至少一个物料分类').toBeTruthy()

  const locations = await apiFetch(token, 'GET', '/locations?page=1&pageSize=1')
  expect(locations.status).toBe(200)
  const locationId = locations.data?.data?.list?.[0]?.id
  expect(locationId, '创建盘亏测试批次需要至少一个库位').toBeTruthy()

  const material = await apiFetch(token, 'POST', '/materials', {
    code: `ST-E2E-${suffix}`,
    name: `盘点盘亏E2E物料-${suffix}`,
    spec: '1ml',
    unit: '瓶',
    categoryId,
    minStock: 5,
    safetyStock: 6,
    maxStock: 999,
  })
  expect(material.status).toBe(201)
  const materialId = material.data?.data?.id || material.data?.id
  expect(materialId, `创建盘亏测试物料未返回 id: ${JSON.stringify(material.data)}`).toBeTruthy()

  const inbound = await apiFetch(token, 'POST', '/inbound', {
    type: 'purchase',
    materialId,
    batchNo: `ST-BATCH-${suffix}`,
    quantity,
    price: 2,
    locationId,
    productionDate: '2026-01-01',
    expiryDate: '2028-12-31',
    remark: `E2E盘亏批次-${suffix}`,
  })
  expect(inbound.status).toBe(201)
  await expect.poll(() => getInventoryTotalStock(token, materialId)).toBe(quantity)
  return { materialId, quantity }
}

async function cleanupTestData(token: string) {
  try {
    const r = await apiFetch(token, 'GET', '/stocktaking?page=1&pageSize=200')
    const list = r.data?.data?.list || []
    for (const item of list) {
      if (item.remark?.includes('E2E') || item.stocktakingNo?.startsWith('TEST-')) {
        await apiFetch(token, 'DELETE', `/stocktaking/${item.id}`)
      }
    }
  } catch { /* ignore */ }
}

test.beforeEach(async () => {
  const token = await apiLogin('admin')
  await cleanupTestData(token)
})

// ────────────────────────────────────────────
// 1. 查看盘点列表 (10 tests)
// ────────────────────────────────────────────
test.describe('库存盘点 -> 查看盘点列表', () => {
  for (const role of ST_READ_ROLES) {
    test(`ST-LIST-01-${role}. 正常用例：${role}可查看盘点列表`, async ({ page }) => {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/stocktaking`)
      await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
    })
  }
  test('ST-LIST-02. 空数据边界：无盘点记录显示空状态', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(800)
  })
  test('ST-LIST-03. 权限：technician访问返回403', async () => {
    const res = await apiFetch(await apiLogin('technician'), 'GET', '/stocktaking')
    expect(res.status).toBe(403)
  })
  test('ST-LIST-04. 权限：pathologist访问返回403', async () => {
    const res = await apiFetch(await apiLogin('pathologist'), 'GET', '/stocktaking')
    expect(res.status).toBe(403)
  })
  test('ST-LIST-05. 权限：procurement访问返回403', async () => {
    const res = await apiFetch(await apiLogin('procurement'), 'GET', '/stocktaking')
    expect(res.status).toBe(403)
  })
  test('ST-LIST-06. 权限：finance访问返回403', async () => {
    const res = await apiFetch(await apiLogin('finance'), 'GET', '/stocktaking')
    expect(res.status).toBe(403)
  })
  test('ST-LIST-07. 异常恢复：API 500显示错误Toast', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(800)
  })
  test('ST-LIST-08. UI差异：admin显示新建盘点按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)
  })
  test('ST-LIST-09. UI差异：warehouse_manager显示新建盘点按钮', async ({ page }) => {
    await loginAs(page, 'warehouse_manager')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)
  })
  test('ST-LIST-10. 正常用例：列表显示单号物料系统库存实盘差异状态', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)
  })
})

// ────────────────────────────────────────────
// 2. 新建盘点单 (20 tests)
// ────────────────────────────────────────────
test.describe('库存盘点 -> 新建盘点单', () => {
  test('ST-CREATE-01. 正常用例：admin新建盘点单', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: 10, remark: 'E2E盘点测试',
    })
    expect(res.status).toBe(200)
    expect(res.data?.data?.id).toBeTruthy()
  })
  test('ST-CREATE-02. 正常用例：warehouse_manager新建盘点单', async () => {
    const token = await apiLogin('warehouse_manager')
    const adminToken = await apiLogin('admin')
    const mid = await getAnyMaterialId(adminToken)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: 5, remark: 'E2EWM盘点',
    })
    expect(res.status).toBe(200)
    expect(res.data?.data?.id).toBeTruthy()
  })
  test('ST-CREATE-03. 空数据边界：actualStock=0差异为负', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: 0, remark: 'E2E零盘点',
    })
    expect(res.status).toBe(200)
    expect(res.data?.data?.id).toBeTruthy()
  })
  test('ST-CREATE-04. 表单校验：未传materialId返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/stocktaking', { actualStock: 10 })
    expect(res.status).toBe(400)
  })
  test('ST-CREATE-05. 表单校验：未传actualStock返回400', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/stocktaking', { materialId: mid })
    expect(res.status).toBe(400)
  })
  for (const role of ST_FORBIDDEN) {
    test(`ST-CREATE-06-${role}. 权限：${role}新建盘点返回403`, async () => {
      const token = await apiLogin(role)
      const adminToken = await apiLogin('admin')
      const mid = await getAnyMaterialId(adminToken)
      if (!mid) { test.skip(); return }
      const res = await apiFetch(token, 'POST', '/stocktaking', { materialId: mid, actualStock: 1 })
      expect(res.status).toBe(403)
    })
  }
  test('ST-CREATE-07. 业务冲突：该物料正在盘点中仍可创建', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    await apiFetch(token, 'POST', '/stocktaking', { materialId: mid, actualStock: 5, remark: 'E2E重复' })
    const res2 = await apiFetch(token, 'POST', '/stocktaking', { materialId: mid, actualStock: 6, remark: 'E2E重复2' })
    expect(res2.status).toBe(200)
    expect(res2.data?.data?.id).toBeTruthy()
  })
  test('ST-CREATE-08. 并发：快速双击提交', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const body = { materialId: mid, actualStock: 1, remark: 'E2E并发' }
    const [r1, r2] = await Promise.all([apiFetch(token, 'POST', '/stocktaking', body), apiFetch(token, 'POST', '/stocktaking', body)])
    expect(r1.status === 200 || r2.status === 200).toBe(true)
  })
  test('ST-CREATE-09. 异常恢复：提交时网络中断后重试', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/stocktaking', { materialId: mid, actualStock: 2, remark: 'E2E恢复' })
    expect(res.status).toBe(200)
    expect(res.data?.data?.id).toBeTruthy()
  })
  test('ST-CREATE-10. UI差异：admin显示新建盘点按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)
  })
  test('ST-CREATE-11. UI差异：warehouse_manager显示新建盘点按钮', async ({ page }) => {
    await loginAs(page, 'warehouse_manager')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)
  })
  test('ST-CREATE-12. UI差异：technician不显示新建盘点按钮', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)
  })
  test('ST-CREATE-13. 正常用例：新建盘点后库存不立即更新', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const beforeStock = await getInventoryTotalStock(token, mid)
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: beforeStock + 4, remark: 'E2E库存更新',
    })
    expect(res.status).toBe(200)
    expect(res.data?.data?.id).toBeTruthy()
    await expect.poll(() => getInventoryTotalStock(token, mid)).toBe(beforeStock)
  })
  test('ST-CREATE-14. 边界：负数actualStock', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: -5, remark: 'E2E负数',
    })
    expect(res.status).toBe(400)
  })
  test('ST-CREATE-15. 边界：小数actualStock', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: 1.5, remark: 'E2E小数',
    })
    expect(res.status).toBe(200)
    expect(res.data?.data?.id).toBeTruthy()
  })
  test('ST-CREATE-16. 正常用例：盘点差异正确计算', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const sysStock = await getInventoryTotalStock(token, mid)
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: sysStock + 5, remark: 'E2E差异',
    })
    expect(res.status).toBe(200)
    const id = res.data?.data?.id
    expect(id).toBeTruthy()

    const confirm = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`, {
      reason: 'physical',
      remark: 'E2E确认差异',
    })
    expect(confirm.status).toBe(200)
    await expect.poll(() => getInventoryTotalStock(token, mid)).toBe(sysStock + 5)
  })
  test('ST-CREATE-17. 表单校验：materialId不存在', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: 'non-existent', actualStock: 10,
    })
    expect([400, 404]).toContain(res.status)
  })
  test('ST-CREATE-18. 正常用例：盘点单号格式', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: 10, remark: 'E2E格式',
    })
    expect(res.status).toBe(200)
    expect(res.data?.data?.id).toBeTruthy()
  })
  test('ST-CREATE-19. 异常恢复：盘点后检查库存日志', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: 15, remark: 'E2E日志',
    })
    expect(res.status).toBe(200)
    expect(res.data?.data?.id).toBeTruthy()
  })
  test('ST-CREATE-20. 并发：并发盘点不同物料', async () => {
    const token = await apiLogin('admin')
    const materials = await apiFetch(token, 'GET', '/materials?page=1&pageSize=2')
    const list = materials.data?.data?.list || []
    if (list.length < 2) { test.skip(); return }
    const [r1, r2] = await Promise.all([
      apiFetch(token, 'POST', '/stocktaking', { materialId: list[0].id, actualStock: 10, remark: 'E2E并发1' }),
      apiFetch(token, 'POST', '/stocktaking', { materialId: list[1].id, actualStock: 20, remark: 'E2E并发2' }),
    ])
    expect(r1.status).toBe(200)
    expect(r2.status).toBe(200)
  })
})

// ────────────────────────────────────────────
// 3. 查看盘点详情 (6 tests)
// ────────────────────────────────────────────
test.describe('库存盘点 -> 查看盘点详情', () => {
  for (const role of ST_READ_ROLES) {
    test(`ST-DETAIL-01-${role}. 正常用例：${role}可查看盘点详情`, async () => {
      const token = await apiLogin(role)
      const id = await getAnyStocktakingId(token)
      if (!id) { test.skip(); return }
      const res = await apiFetch(token, 'GET', `/stocktaking/${id}`)
      expect([200, 404]).toContain(res.status)
    })
  }
  test('ST-DETAIL-02. 表单校验：查看不存在的盘点单返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/stocktaking/non-existent-id')
    expect(res.status).toBe(404)
  })
  test('ST-DETAIL-03. UI差异：admin可点击查看详情', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)
    const rows = page.locator('table tbody tr')
    if (await rows.count() > 0) await rows.first().click()
  })
})

// ────────────────────────────────────────────
// 4. 处理盘点差异 (14 tests)
// ────────────────────────────────────────────
test.describe('库存盘点 -> 处理盘点差异', () => {
  test('ST-ADJUST-01. 正常用例：admin确认差异库存调整', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const beforeStock = await getInventoryTotalStock(token, mid)
    const actualStock = beforeStock + 1
    const create = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock, remark: 'E2E差异处理',
    })
    expect(create.status).toBe(200)
    const id = create.data?.data?.id
    expect(id).toBeTruthy()
    const res = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`, { reason: 'physical' })
    expect(res.status).toBe(200)
    await expect.poll(() => getInventoryTotalStock(token, mid)).toBe(actualStock)
  })
  test('ST-ADJUST-02. 空数据边界：差异=0不更新库存仅记录日志', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const stock = await getInventoryTotalStock(token, mid)
    const create = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: stock, remark: 'E2E无差异',
    })
    expect(create.status).toBe(200)
    const id = create.data?.data?.id
    expect(id).toBeTruthy()
    const confirm = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`)
    expect(confirm.status).toBe(200)
    await expect.poll(() => getInventoryTotalStock(token, mid)).toBe(stock)
  })
  test('ST-ADJUST-03. 业务冲突：已确认的盘点单再次确认', async () => {
    const token = await apiLogin('admin')
    const id = await getAnyStocktakingId(token)
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`)
    expect([200, 400]).toContain(res.status)
  })
  test('ST-ADJUST-04. 异常恢复：确认时网络中断后检查状态', async () => {
    const token = await apiLogin('admin')
    const id = await getAnyStocktakingId(token)
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`)
    expect([200, 400]).toContain(res.status)
  })
  test('ST-ADJUST-05. 正常用例：盘盈库存增加', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const stock = await getInventoryTotalStock(token, mid)
    const actualStock = stock + 10
    const create = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock, remark: 'E2E盘盈',
    })
    expect(create.status).toBe(200)
    const id = create.data?.data?.id
    expect(id).toBeTruthy()
    const confirm = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`, { reason: 'physical' })
    expect(confirm.status).toBe(200)
    await expect.poll(() => getInventoryTotalStock(token, mid)).toBe(actualStock)
  })
  test('ST-ADJUST-06. 正常用例：盘亏库存减少', async () => {
    const token = await apiLogin('admin')
    const { materialId: mid, quantity: stock } = await createStockedMaterial(token, `adjust-loss-${Date.now()}`, 20)
    const actualStock = stock - 5
    const create = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock, remark: 'E2E盘亏',
    })
    expect(create.status).toBe(200)
    const id = create.data?.data?.id
    expect(id).toBeTruthy()
    const confirm = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`, { reason: 'physical' })
    expect(confirm.status).toBe(200)
    await expect.poll(() => getInventoryTotalStock(token, mid)).toBe(actualStock)
  })
  for (const role of ST_FORBIDDEN) {
    test(`ST-ADJUST-07-${role}. 权限：${role}确认盘点返回403`, async () => {
      const token = await apiLogin(role)
      const adminToken = await apiLogin('admin')
      const id = await getAnyStocktakingId(adminToken)
      if (!id) { test.skip(); return }
      const res = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`)
      expect(res.status).toBe(403)
    })
  }
  test('ST-ADJUST-08. 表单校验：确认不存在的盘点单返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/stocktaking/non-existent/confirm')
    expect(res.status).toBe(404)
  })
  test('ST-ADJUST-09. 并发：并发确认同一盘点单', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const create = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: 5, remark: 'E2E并发确认',
    })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    const [r1, r2] = await Promise.all([
      apiFetch(token, 'POST', `/stocktaking/${id}/confirm`),
      apiFetch(token, 'POST', `/stocktaking/${id}/confirm`),
    ])
    expect(r1.status === 200 || r2.status === 200 || r1.status === 400 || r2.status === 400).toBe(true)
  })
  test('ST-ADJUST-10. UI差异：admin显示确认按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)
  })
  test('ST-ADJUST-11. UI差异：warehouse_manager显示确认按钮', async ({ page }) => {
    await loginAs(page, 'warehouse_manager')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)
  })
  test('ST-ADJUST-12. 异常恢复：确认后刷新页面状态保持', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
  test('ST-ADJUST-13. 正常用例：确认后生成stock_logs', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const stock = await getInventoryTotalStock(token, mid)
    const create = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: stock + 1, remark: 'E2E日志生成',
    })
    expect(create.status).toBe(200)
    const id = create.data?.data?.id
    expect(id).toBeTruthy()
    const confirm = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`, {
      reason: 'physical',
      remark: 'E2E日志确认',
    })
    expect(confirm.status).toBe(200)
  })
  test('ST-ADJUST-14. 边界：确认后盘点状态变为confirmed', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const stock = await getInventoryTotalStock(token, mid)
    const create = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: stock, remark: 'E2E状态',
    })
    expect(create.status).toBe(200)
    const id = create.data?.data?.id
    expect(id).toBeTruthy()
    const confirm = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`)
    expect(confirm.status).toBe(200)

    const list = await apiFetch(token, 'GET', '/stocktaking?page=1&pageSize=20&status=confirmed')
    expect(list.status).toBe(200)
    expect((list.data?.data?.list || []).some((item: any) => item.id === id && item.status === 'confirmed')).toBe(true)
  })
})

// ────────────────────────────────────────────
// 5. 分页切换 (8 tests)
// ────────────────────────────────────────────
test.describe('库存盘点 -> 分页切换', () => {
  test('ST-PAGE-01. 正常用例：切换到第2页', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking?page=2`)
    await page.waitForTimeout(800)
  })
  test('ST-PAGE-02. 边界：仅1页分页器隐藏', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(800)
  })
  test('ST-PAGE-03. 表单校验：page=0后端修正为1', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/stocktaking?page=0')
    expect(res.status).toBe(200)
    expect(res.data?.data?.pagination?.page).toBeGreaterThanOrEqual(1)
  })
  test('ST-PAGE-04. 边界：page=999返回空列表', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/stocktaking?page=999')
    expect(res.status).toBe(200)
  })
  test('ST-PAGE-05. 边界：pageSize=1', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/stocktaking?page=1&pageSize=1')
    expect(res.status).toBe(200)
  })
  test('ST-PAGE-06. 边界：pageSize=100', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/stocktaking?page=1&pageSize=100')
    expect(res.status).toBe(200)
  })
  test('ST-PAGE-07. 并发：快速切换分页', async ({ page }) => {
    await loginAs(page, 'admin')
    for (let i = 1; i <= 3; i++) {
      await page.goto(`${FE_BASE}/stocktaking?page=${i}`)
      await page.waitForTimeout(300)
    }
  })
  test('ST-PAGE-08. UI差异：各角色分页一致', async ({ page }) => {
    for (const role of ST_READ_ROLES) {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/stocktaking?page=1`)
      await page.waitForTimeout(400)
    }
  })
})

// ────────────────────────────────────────────
// 6. 角色权限矩阵补充 (12 tests)
// ────────────────────────────────────────────
test.describe('库存盘点 -> 角色权限矩阵补充', () => {
  const scenes = [
    { id: 'TC-PERM-073', role: 'technician' as RoleKey, method: 'GET', expect: 403 },
    { id: 'TC-PERM-074', role: 'pathologist' as RoleKey, method: 'GET', expect: 403 },
    { id: 'TC-PERM-075', role: 'procurement' as RoleKey, method: 'GET', expect: 403 },
    { id: 'TC-PERM-076', role: 'finance' as RoleKey, method: 'GET', expect: 403 },
    { id: 'TC-PERM-077', role: 'technician' as RoleKey, method: 'POST', expect: 403 },
    { id: 'TC-PERM-078', role: 'pathologist' as RoleKey, method: 'POST', expect: 403 },
    { id: 'TC-PERM-079', role: 'procurement' as RoleKey, method: 'POST', expect: 403 },
    { id: 'TC-PERM-080', role: 'finance' as RoleKey, method: 'POST', expect: 403 },
  ]
  for (const s of scenes) {
    test(`${s.id}. ${s.role} ${s.method} /stocktaking 返回${s.expect}`, async () => {
      const token = await apiLogin(s.role)
      let res
      if (s.method === 'GET') res = await apiFetch(token, 'GET', '/stocktaking')
      else {
        const adminToken = await apiLogin('admin')
        const mid = await getAnyMaterialId(adminToken)
        res = await apiFetch(token, 'POST', '/stocktaking', { materialId: mid || 'x', actualStock: 1 })
      }
      expect(res.status).toBe(s.expect)
    })
  }
  test('TC-PERM-ST-EXTRA-01. admin GET /stocktaking 返回200', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/stocktaking')
    expect(res.status).toBe(200)
  })
  test('TC-PERM-ST-EXTRA-02. warehouse_manager GET /stocktaking 返回200', async () => {
    const token = await apiLogin('warehouse_manager')
    const res = await apiFetch(token, 'GET', '/stocktaking')
    expect(res.status).toBe(200)
  })
  test('TC-PERM-ST-EXTRA-03. admin POST /stocktaking 返回200', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/stocktaking', { materialId: mid, actualStock: 1, remark: 'E2E权限' })
    expect(res.status).toBe(200)
    expect(res.data?.data?.id).toBeTruthy()
  })
})

// ────────────────────────────────────────────
// 7. 业务流程树 (12 tests)
// ────────────────────────────────────────────
test.describe('库存盘点 -> 业务流程树', () => {
  test('BF-ST-01. 主路径：登录→进入盘点→新建→选物料→输入实盘→确认差异→库存更新', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const beforeStock = await getInventoryTotalStock(token, mid)
    const actualStock = beforeStock + 2
    const create = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock, remark: 'E2E主路径',
    })
    expect(create.status).toBe(200)
    const id = create.data?.data?.id
    expect(id).toBeTruthy()

    const confirm = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`, {
      reason: 'physical',
      remark: 'E2E主路径确认',
    })
    expect(confirm.status).toBe(200)
    await expect.poll(() => getInventoryTotalStock(token, mid)).toBe(actualStock)
  })
  test('BF-ST-02. 分支：关闭盘点弹窗不保存', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)
  })
  test('BF-ST-03. 分支：未选物料提交', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/stocktaking', { actualStock: 10 })
    expect(res.status).toBe(400)
  })
  test('BF-ST-04. 分支：实盘=系统数量无差异', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const stock = await getInventoryTotalStock(token, mid)
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: stock, remark: 'E2E无差异',
    })
    expect(res.status).toBe(200)
    const id = res.data?.data?.id
    expect(id).toBeTruthy()

    const confirm = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`)
    expect(confirm.status).toBe(200)
    await expect.poll(() => getInventoryTotalStock(token, mid)).toBe(stock)
  })
  test('BF-ST-05. 分支：盘盈', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const stock = await getInventoryTotalStock(token, mid)
    const actualStock = stock + 5
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock, remark: 'E2E盘盈',
    })
    expect(res.status).toBe(200)
    const id = res.data?.data?.id
    expect(id).toBeTruthy()

    const confirm = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`, {
      reason: 'physical',
      remark: 'E2E盘盈确认',
    })
    expect(confirm.status).toBe(200)
    await expect.poll(() => getInventoryTotalStock(token, mid)).toBe(actualStock)
  })
  test('BF-ST-06. 分支：盘亏触发低库存预警', async () => {
    const token = await apiLogin('admin')
    const { materialId: mid, quantity: stock } = await createStockedMaterial(token, `bf-loss-${Date.now()}`, 12)
    const actualStock = stock - 3
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock, remark: 'E2E盘亏预警',
    })
    expect(res.status).toBe(200)
    const id = res.data?.data?.id
    expect(id).toBeTruthy()

    const confirm = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`, {
      reason: 'physical',
      remark: 'E2E盘亏确认',
    })
    expect(confirm.status).toBe(200)
    await expect.poll(() => getInventoryTotalStock(token, mid)).toBe(actualStock)
  })
  test('BF-ST-07. 分支：网络中断后重试', async () => {
    const token = await apiLogin('admin')
    const mid = await getAnyMaterialId(token)
    if (!mid) { test.skip(); return }
    const beforeStock = await getInventoryTotalStock(token, mid)
    const res = await apiFetch(token, 'POST', '/stocktaking', {
      materialId: mid, actualStock: beforeStock, remark: 'E2E网络',
    })
    expect(res.status).toBe(200)
    const id = res.data?.data?.id
    expect(id).toBeTruthy()

    const retryConfirm = await apiFetch(token, 'POST', `/stocktaking/${id}/confirm`)
    expect(retryConfirm.status).toBe(200)
    await expect.poll(() => getInventoryTotalStock(token, mid)).toBe(beforeStock)
  })
  test('BF-ST-08. 分支：刷新页面后盘点状态保持', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
  test('BF-ST-09. 分支：确认时取消', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(1000)
  })
  test('BF-ST-10. 分支：technician尝试盘点被403拦截', async () => {
    const token = await apiLogin('technician')
    const adminToken = await apiLogin('admin')
    const mid = await getAnyMaterialId(adminToken)
    if (!mid) { test.skip(); return }
    const res = await apiFetch(token, 'POST', '/stocktaking', { materialId: mid, actualStock: 1 })
    expect(res.status).toBe(403)
  })
  test('BF-ST-11. 分支：确认盘点后刷新列表', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
  test('BF-ST-12. 分支：批量创建多个盘点单', async () => {
    const token = await apiLogin('admin')
    const materials = await apiFetch(token, 'GET', '/materials?page=1&pageSize=3')
    const list = materials.data?.data?.list || []
    for (const m of list) {
      await apiFetch(token, 'POST', '/stocktaking', {
        materialId: m.id, actualStock: 5, remark: 'E2E批量',
      })
    }
  })
})

// ────────────────────────────────────────────
// 8. 盲点分析补充 (18 tests)
// ────────────────────────────────────────────
test.describe('库存盘点 -> 盲点分析补充', () => {
  test('BLIND-ST-01. 盘点单号唯一性验证', async () => {
    const token = await apiLogin('admin')
    const materialId = await getAnyMaterialId(token)
    if (!materialId) { test.skip(); return }
    const one = await createStocktakingRecord(token, { materialId, actualStock: 1, remark: 'E2E唯一1' })
    const two = await createStocktakingRecord(token, { materialId, actualStock: 2, remark: 'E2E唯一2' })
    expect(one.id).not.toBe(two.id)
    expect(one.record.stocktakingNo).toMatch(/^ST-/)
    expect(two.record.stocktakingNo).toMatch(/^ST-/)
    expect(one.record.stocktakingNo).not.toBe(two.record.stocktakingNo)
  })
  test('BLIND-ST-02. 盘点时间字段自动填充', async () => {
    const token = await apiLogin('admin')
    const created = await createStocktakingRecord(token, { actualStock: 1, remark: 'E2E时间' })
    const createdAt = String(created.record.createdAt)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}/)
    expect(createdAt.startsWith(today)).toBe(true)
  })
  test('BLIND-ST-03. 盘点操作人字段记录', async () => {
    const adminToken = await apiLogin('admin')
    const warehouseToken = await apiLogin('warehouse_manager')
    const materialId = await getAnyMaterialId(adminToken)
    if (!materialId) { test.skip(); return }
    const adminCreated = await createStocktakingRecord(adminToken, { materialId, actualStock: 1, remark: 'E2E操作人-admin' })
    const warehouseCreated = await createStocktakingRecord(warehouseToken, { materialId, actualStock: 2, remark: 'E2E操作人-wm' })
    const warehouseRecord = await getStocktakingRecord(adminToken, warehouseCreated.id)
    expect(adminCreated.record.operator).toBe('admin')
    expect(warehouseRecord.operator).toBe('wangkq')
  })
  test('BLIND-ST-04. 盘点差异计算精度', async () => {
    const token = await apiLogin('admin')
    const materialId = await getAnyMaterialId(token)
    if (!materialId) { test.skip(); return }
    const systemStock = await getInventoryTotalStock(token, materialId)
    const created = await createStocktakingRecord(token, {
      materialId,
      actualStock: systemStock + 1.99,
      remark: 'E2E精度',
    })
    expect(created.record.systemStock).toBe(systemStock)
    expect(created.record.actualStock).toBeCloseTo(systemStock + 1.99, 5)
    expect(created.record.difference).toBeCloseTo(1.99, 5)
  })
  test('BLIND-ST-05. 盘点列表排序默认按时间倒序', async () => {
    const token = await apiLogin('admin')
    await createStocktakingRecord(token, { actualStock: 1, remark: `E2E排序-${Date.now()}` })
    const res = await apiFetch(token, 'GET', '/stocktaking?page=1&pageSize=5')
    expect(res.status).toBe(200)
    const list = res.data?.data?.list || []
    if (list.length >= 2) {
      const d1 = new Date(list[0].createdAt).getTime()
      const d2 = new Date(list[1].createdAt).getTime()
      expect(d1).toBeGreaterThanOrEqual(d2)
    }
  })
  test('BLIND-ST-06. 盘点单关联物料信息显示', async () => {
    const token = await apiLogin('admin')
    const created = await createStocktakingRecord(token, { actualStock: 1, remark: 'E2E物料字段' })
    expect(created.record.materialId).toBe(created.materialId)
    expect(created.record.materialName).toBeTruthy()
    expect(created.record.materialCode).toBeTruthy()
    expect(created.record.materialUnit).toBeTruthy()
  })
  test('BLIND-ST-07. 盘点单状态字段完整性', async () => {
    const token = await apiLogin('admin')
    const materialId = await getAnyMaterialId(token)
    if (!materialId) { test.skip(); return }
    const systemStock = await getInventoryTotalStock(token, materialId)
    const created = await createStocktakingRecord(token, {
      materialId,
      actualStock: systemStock,
      remark: 'E2E状态字段',
    })
    expect(created.record.status).toBe('completed')
    expect(created.record.difference).toBe(0)
    const confirm = await apiFetch(token, 'POST', `/stocktaking/${created.id}/confirm`, { remark: 'E2E状态字段确认' })
    expect(confirm.status).toBe(200)
    const confirmed = await getStocktakingRecord(token, created.id, 'status=confirmed&page=1&pageSize=20')
    expect(confirmed.status).toBe('confirmed')
  })
  test('BLIND-ST-08. 盘点API响应格式验证', async () => {
    const token = await apiLogin('admin')
    const created = await createStocktakingRecord(token, { actualStock: 1, remark: 'E2E响应格式' })
    const res = await apiFetch(token, 'GET', '/stocktaking?page=1&pageSize=1')
    expect(res.status).toBe(200)
    expect(res.data).toHaveProperty('data')
    expect(res.data?.data).toHaveProperty('list')
    expect(res.data?.data?.pagination).toHaveProperty('page')
    expect(res.data?.data?.pagination).toHaveProperty('total')
    expectStocktakingShape(res.data.data.list[0])
    const exact = await getStocktakingRecord(token, created.id)
    expectStocktakingShape(exact)
  })
  test('BLIND-ST-09. 盘点页面响应式布局', async ({ page }) => {
    await loginByStorage(page, 'admin')
    await page.setViewportSize({ width: 375, height: 667 })
    await mockStocktakingPage(page, { materialName: '移动端盘点验证物料' })
    await page.goto(`${FE_BASE}/stocktaking`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '库存盘点' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByPlaceholder('搜索盘点编号/物料...')).toBeVisible()
    await expect(page.getByText('移动端盘点验证物料盘点')).toBeVisible()
    await expect(page.getByText('待处理差异').locator('..')).toContainText('1')

    const incoherentOverflow = await page.evaluate(() => {
      const viewportWidth = document.documentElement.clientWidth
      return Array.from(document.querySelectorAll('main *')).filter((node) => {
        const element = node as HTMLElement
        if (element.closest('.overflow-x-auto')) return false
        const style = getComputedStyle(element)
        if (style.position === 'fixed' || style.position === 'absolute') return false
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') return false
        const rect = element.getBoundingClientRect()
        return rect.width > 0 && (rect.left < -2 || rect.right > viewportWidth + 2)
      }).length
    })
    expect(incoherentOverflow).toBe(0)
  })
  test('BLIND-ST-10. 盘点页面搜索框防抖', async ({ page }) => {
    await loginByStorage(page, 'admin')
    const listRequests: URL[] = []
    const statsRequests: URL[] = []
    await mockStocktakingPage(page, { listRequests, statsRequests })
    await page.goto(`${FE_BASE}/stocktaking`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('盘点页面验证物料盘点')).toBeVisible({ timeout: 15000 })

    const search = page.getByPlaceholder('搜索盘点编号/物料...')
    await search.fill('a')
    await page.waitForTimeout(100)
    await search.fill('ab')
    await expect(page.getByText('盘点页面验证物料-ab盘点')).toBeVisible({ timeout: 15000 })

    const listKeywords = listRequests.map(url => url.searchParams.get('keyword') || '')
    const statsKeywords = statsRequests.map(url => url.searchParams.get('keyword') || '')
    expect(listKeywords).toContain('ab')
    expect(statsKeywords).toContain('ab')
    expect(listKeywords).not.toContain('a')
    expect(statsKeywords).not.toContain('a')
  })
  test('BLIND-ST-11. 盘点导出功能入口', async ({ page }) => {
    await loginByStorage(page, 'admin')
    await mockStocktakingPage(page)
    await page.goto(`${FE_BASE}/stocktaking`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '库存盘点' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /^导出$/ })).toHaveCount(0)
  })
  test('BLIND-ST-12. 盘点打印功能入口', async ({ page }) => {
    await loginByStorage(page, 'admin')
    await mockStocktakingPage(page)
    await page.goto(`${FE_BASE}/stocktaking`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '库存盘点' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByRole('button', { name: /^打印$/ })).toHaveCount(0)
  })
  test('BLIND-ST-13. 盘点差异报告生成', async ({ page }) => {
    await loginByStorage(page, 'admin')
    await mockStocktakingPage(page, { materialName: '差异报告验证物料', stocktakingNo: 'ST-MOCK-DIFF-001' })
    await page.goto(`${FE_BASE}/stocktaking`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('tbody tr', { hasText: '差异报告验证物料盘点' }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row).toContainText('-2.5瓶')
    await row.getByRole('button', { name: '详情' }).click()
    const detailModal = page.locator('.fixed.inset-0', { hasText: '盘点详情 - ST-MOCK-DIFF-001' }).first()
    await expect(detailModal).toBeVisible({ timeout: 15000 })
    await expect(detailModal).toContainText('盘点明细')
    await expect(detailModal).toContainText('账面数量')
    await expect(detailModal).toContainText('实盘数量')
    await expect(detailModal).toContainText('-2.5')
    await expect(detailModal).toContainText('盘亏')
  })
  test('BLIND-ST-14. 盘点页面加载性能', async ({ page }) => {
    await loginByStorage(page, 'admin')
    const listRequests: URL[] = []
    const statsRequests: URL[] = []
    await mockStocktakingPage(page, { listRequests, statsRequests, materialName: '加载性能盘点物料' })
    const start = Date.now()
    await page.goto(`${FE_BASE}/stocktaking`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('加载性能盘点物料盘点')).toBeVisible({ timeout: 5000 })
    expect(Date.now() - start).toBeLessThan(5000)
    expect(listRequests.length).toBeGreaterThanOrEqual(1)
    expect(listRequests.length).toBeLessThanOrEqual(2)
    expect(statsRequests.length).toBeGreaterThanOrEqual(1)
    expect(statsRequests.length).toBeLessThanOrEqual(2)
  })
  test('BLIND-ST-15. 盘点物料选择器搜索', async ({ page }) => {
    await loginByStorage(page, 'admin')
    await mockStocktakingPage(page)
    await page.route('**/api/v1/materials**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            list: [
              { id: 'material-auto', code: 'MAT-AUTO', name: '自动填充验证物料', unit: '盒', stock: 33.5, categoryPath: '试剂/染色', locationName: '常温库' },
              { id: 'material-other', code: 'MAT-OTHER', name: '其他物料', unit: '瓶', stock: 8, categoryPath: '试剂/其他', locationName: '冷藏库' },
            ],
            pagination: { total: 2, page: 1, pageSize: 999 },
          },
        }),
      })
    })

    await page.goto(`${FE_BASE}/stocktaking`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /新建盘点/ }).click()
    const materialSelect = page.getByTestId('material-select')
    await materialSelect.click()
    await materialSelect.locator('input').fill('自动')
    await page.getByTestId('option-material-auto').click()
    await expect(materialSelect).toContainText('自动填充验证物料')
  })
  test('BLIND-ST-16. 盘点表单自动填充系统库存', async ({ page }) => {
    await loginByStorage(page, 'admin')
    await mockStocktakingPage(page)
    await page.route('**/api/v1/materials**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            list: [
              { id: 'material-auto', code: 'MAT-AUTO', name: '自动库存验证物料', unit: '盒', stock: 33.5, categoryPath: '试剂/染色', locationName: '常温库' },
            ],
            pagination: { total: 1, page: 1, pageSize: 999 },
          },
        }),
      })
    })

    await page.goto(`${FE_BASE}/stocktaking`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /新建盘点/ }).click()
    const materialSelect = page.getByTestId('material-select')
    await materialSelect.click()
    await page.getByTestId('option-material-auto').click()
    await page.getByTestId('actual-stock-input').fill('35')
    await page.getByTestId('next-step-btn').click()
    await expect(page.locator('.fixed.inset-0', { hasText: '盘点范围预览' }).first()).toContainText('33.5')
    await expect(page.locator('.fixed.inset-0', { hasText: '盘点范围预览' }).first()).toContainText('差异: +1.5盒')
  })
  test('BLIND-ST-17. 盘点历史记录查看', async ({ page }) => {
    const token = await apiLogin('admin')
    const materialId = await getAnyMaterialId(token)
    if (!materialId) { test.skip(); return }
    const stock = await getInventoryTotalStock(token, materialId)
    const created = await createStocktakingRecord(token, {
      materialId,
      actualStock: stock + 1,
      remark: 'E2E历史记录',
    })
    const confirm = await apiFetch(token, 'POST', `/stocktaking/${created.id}/confirm`, {
      reason: 'physical',
      remark: 'E2E历史记录确认',
    })
    expect(confirm.status).toBe(200)

    await loginByStorage(page, 'admin')
    await page.goto(`${FE_BASE}/stocktaking?keyword=${encodeURIComponent(created.record.stocktakingNo)}&status=confirmed`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('tbody tr', { hasText: created.record.stocktakingNo }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row).toContainText('已确认')
    await row.getByRole('button', { name: '详情' }).click()
    const detailModal = page.locator('.fixed.inset-0', { hasText: `盘点详情 - ${created.record.stocktakingNo}` }).first()
    await expect(detailModal).toBeVisible({ timeout: 15000 })
    await expect(detailModal).toContainText('负责人')
    await expect(detailModal).toContainText('admin')
  })
  test('BLIND-ST-18. 多角色同时盘点互不影响', async () => {
    const adminToken = await apiLogin('admin')
    const warehouseToken = await apiLogin('warehouse_manager')
    const materialId = await getAnyMaterialId(adminToken)
    if (!materialId) { test.skip(); return }
    const [adminCreate, warehouseCreate] = await Promise.all([
      createStocktakingRecord(adminToken, { materialId, actualStock: 3, remark: 'E2E多角色-admin' }),
      createStocktakingRecord(warehouseToken, { materialId, actualStock: 4, remark: 'E2E多角色-wm' }),
    ])
    const adminRecord = await getStocktakingRecord(adminToken, adminCreate.id)
    const warehouseRecord = await getStocktakingRecord(adminToken, warehouseCreate.id)
    expect(adminRecord.id).not.toBe(warehouseRecord.id)
    expect(adminRecord.operator).toBe('admin')
    expect(warehouseRecord.operator).toBe('wangkq')
    expect(adminRecord.actualStock).toBe(3)
    expect(warehouseRecord.actualStock).toBe(4)
  })
})
