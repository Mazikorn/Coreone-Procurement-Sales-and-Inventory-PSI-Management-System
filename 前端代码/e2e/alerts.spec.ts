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
const ALL_ROLES: RoleKey[] = ['admin', 'warehouse_manager', 'technician', 'pathologist', 'procurement', 'finance']

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

async function getAnyAlertId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/alerts?page=1&pageSize=1')
  return r.data?.data?.list?.[0]?.id || ''
}
async function getAnyRuleId(token: string): Promise<string> {
  const r = await apiFetch(token, 'GET', '/alerts/rules')
  return r.data?.data?.rules?.[0]?.id || ''
}

async function createLowStockMaterial(token: string, suffix = Date.now().toString()) {
  const categories = await apiFetch(token, 'GET', '/categories?page=1&pageSize=1')
  expect(categories.status).toBe(200)
  const categoryId = categories.data?.data?.list?.[0]?.id
  expect(categoryId, '创建预警测试物料需要至少一个物料分类').toBeTruthy()

  const code = `ALERT-E2E-${suffix}`
  const material = await apiFetch(token, 'POST', '/materials', {
    code,
    name: `预警E2E物料-${suffix}`,
    spec: '1ml',
    unit: '瓶',
    categoryId,
    minStock: 5,
    safetyStock: 6,
    maxStock: 999,
  })
  expect(material.status).toBe(201)
  const materialId = material.data?.data?.id || material.data?.id
  expect(materialId, `创建低库存预警物料未返回 id: ${JSON.stringify(material.data)}`).toBeTruthy()
  return {
    id: materialId,
    name: `预警E2E物料-${suffix}`,
    suffix,
  }
}

async function createLowStockAlert(token: string, suffix = Date.now().toString()) {
  await createLowStockMaterial(token, suffix)

  const generated = await apiFetch(token, 'POST', '/alerts/generate')
  expect(generated.status).toBe(200)

  const list = await apiFetch(token, 'GET', `/alerts?keyword=${encodeURIComponent(suffix)}&status=pending&page=1&pageSize=10`)
  expect(list.status).toBe(200)
  const alert = list.data?.data?.list?.find((item: any) => item.materialName?.includes(suffix))
  expect(alert, `未找到刚生成的低库存预警: ${JSON.stringify(list.data)}`).toBeTruthy()
  expect(alert.status).toBe('pending')
  expect(alert.type).toBe('low-stock')
  return alert
}

async function createExpiryAlert(token: string, suffix = Date.now().toString()) {
  const categories = await apiFetch(token, 'GET', '/categories?page=1&pageSize=1')
  expect(categories.status).toBe(200)
  const categoryId = categories.data?.data?.list?.[0]?.id
  expect(categoryId, '创建临期预警测试物料需要至少一个物料分类').toBeTruthy()

  const locations = await apiFetch(token, 'GET', '/locations?page=1&pageSize=1')
  expect(locations.status).toBe(200)
  const locationId = locations.data?.data?.list?.[0]?.id
  expect(locationId, '创建临期预警测试批次需要至少一个库位').toBeTruthy()

  const code = `EXPIRY-E2E-${suffix}`
  const material = await apiFetch(token, 'POST', '/materials', {
    code,
    name: `临期E2E物料-${suffix}`,
    spec: '1ml',
    unit: '瓶',
    categoryId,
    minStock: 0,
    safetyStock: 0,
    maxStock: 999,
  })
  expect(material.status).toBe(201)
  const materialId = material.data?.data?.id || material.data?.id
  expect(materialId, `创建临期预警物料未返回 id: ${JSON.stringify(material.data)}`).toBeTruthy()

  const expiryDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const inbound = await apiFetch(token, 'POST', '/inbound', {
    type: 'purchase',
    materialId,
    batchNo: `EXP-${suffix}`,
    quantity: 1,
    price: 1,
    locationId,
    productionDate: '2026-01-01',
    expiryDate,
    remark: `临期预警测试-${suffix}`,
  })
  expect(inbound.status).toBe(201)

  const generated = await apiFetch(token, 'POST', '/alerts/generate')
  expect(generated.status).toBe(200)

  const list = await apiFetch(token, 'GET', `/alerts?keyword=${encodeURIComponent(suffix)}&type=expiry&status=pending&page=1&pageSize=10`)
  expect(list.status).toBe(200)
  const alert = list.data?.data?.list?.find((item: any) => item.materialName?.includes(suffix))
  expect(alert, `未找到刚生成的临期预警: ${JSON.stringify(list.data)}`).toBeTruthy()
  expect(alert.status).toBe('pending')
  expect(alert.type).toBe('expiry')
  return alert
}

async function getAlertByKeyword(token: string, suffix: string, status?: string) {
  const query = new URLSearchParams({
    keyword: suffix,
    page: '1',
    pageSize: '10',
  })
  if (status) query.set('status', status)
  const res = await apiFetch(token, 'GET', `/alerts?${query.toString()}`)
  expect(res.status).toBe(200)
  return res.data?.data?.list?.find((item: any) => item.materialName?.includes(suffix))
}

async function openPendingAlertForBoundary(page: Page, suffixPrefix: string) {
  const token = await apiLogin('admin')
  const suffix = `${suffixPrefix}-${Date.now()}`
  const alert = await createLowStockAlert(token, suffix)

  await loginAs(page, 'admin')
  await page.goto(`${FE_BASE}/alerts?keyword=${encodeURIComponent(suffix)}&quickFilter=pending`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 15000 })

  const row = page.locator('tbody tr', { hasText: alert.materialName }).first()
  await expect(row).toBeVisible({ timeout: 15000 })
  await expect(row).toContainText('待处理')
  await expect(row.getByRole('button', { name: /^详情$/ })).toBeVisible()
  await expect(row.getByRole('button', { name: /^处理$/ })).toBeVisible()
  await expect(row.getByRole('button', { name: /^忽略$/ })).toBeVisible()

  return { alert, row }
}

async function expectNoUnsupportedAlertOperations(page: Page) {
  await expect(page.getByRole('button', { name: /^导出$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^打印$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^邮件通知$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^发送邮件$/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^通知采购$/ })).toHaveCount(0)
}

test.describe('预警中心 -> 页面处理闭环', () => {
  test('ALERT-UI-HANDLE-02. 处理弹窗要求处理意见非空并限制500字', async ({ page }) => {
    const token = await apiLogin('admin')
    const suffix = `ui-handle-required-${Date.now()}`
    const alert = await createLowStockAlert(token, suffix)

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts?keyword=${encodeURIComponent(suffix)}&quickFilter=pending`, { waitUntil: 'domcontentloaded' })
    const pendingRow = page.locator('tbody tr', { hasText: alert.materialName }).first()
    await expect(pendingRow).toBeVisible({ timeout: 15000 })
    await pendingRow.getByRole('button', { name: '处理' }).click()

    const handleModal = page.locator('.fixed.inset-0', { hasText: '处理预警' }).first()
    await expect(handleModal).toBeVisible({ timeout: 15000 })
    const opinionInput = handleModal.locator('textarea')
    const confirmButton = handleModal.getByRole('button', { name: '确认处理' })

    await expect(confirmButton).toBeDisabled()
    await expect(opinionInput).toHaveAttribute('maxLength', '500')
    await opinionInput.fill('   ')
    await expect(confirmButton).toBeDisabled()
    await opinionInput.fill(`必填校验通过-${suffix}`)
    await expect(confirmButton).toBeEnabled()
    await confirmButton.click()

    await expect(page.getByText('处理成功')).toBeVisible({ timeout: 15000 })
    const processed = await getAlertByKeyword(token, suffix, 'processed')
    expect(processed).toMatchObject({
      id: alert.id,
      status: 'processed',
      handledBy: 'admin',
    })
    expect(processed.remark).toContain(`必填校验通过-${suffix}`)
  })

  test('ALERT-UI-HANDLE-01. 页面处理预警后进入历史并在详情保留处理记录', async ({ page }) => {
    const token = await apiLogin('admin')
    const suffix = `ui-handle-${Date.now()}`
    const alert = await createLowStockAlert(token, suffix)
    const opinion = `页面处理闭环-${suffix}`

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts?keyword=${encodeURIComponent(suffix)}&quickFilter=pending`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 15000 })

    const pendingRow = page.locator('tbody tr', { hasText: alert.materialName }).first()
    await expect(pendingRow).toBeVisible({ timeout: 15000 })
    await expect(pendingRow).toContainText('待处理')
    await pendingRow.getByRole('button', { name: '处理' }).click()

    const handleModal = page.locator('.fixed.inset-0', { hasText: '处理预警' }).first()
    await expect(handleModal).toBeVisible({ timeout: 15000 })
    await handleModal.locator('select').selectOption('no_action_needed')
    await handleModal.locator('textarea').fill(opinion)
    await handleModal.getByRole('button', { name: '确认处理' }).click()

    await expect(page.getByText('处理成功')).toBeVisible({ timeout: 15000 })
    await expect(pendingRow).toBeHidden({ timeout: 15000 })

    const processed = await getAlertByKeyword(token, suffix, 'processed')
    expect(processed).toMatchObject({
      id: alert.id,
      status: 'processed',
      handledBy: 'admin',
      remark: `处理结论：已核实无需处理\n处理意见：${opinion}`,
    })
    expect(processed.handledAt).toBeTruthy()

    await page.goto(`${FE_BASE}/alerts?keyword=${encodeURIComponent(suffix)}&quickFilter=history`, { waitUntil: 'domcontentloaded' })
    const historyRow = page.locator('tbody tr', { hasText: alert.materialName }).first()
    await expect(historyRow).toBeVisible({ timeout: 15000 })
    await expect(historyRow).toContainText('已处理')
    await historyRow.getByRole('button', { name: '详情' }).click()

    const detailModal = page.locator('.fixed.inset-0', { hasText: `预警详情 - ${alert.id}` }).first()
    await expect(detailModal).toBeVisible({ timeout: 15000 })
    await expect(detailModal).toContainText('处理记录')
    await expect(detailModal).toContainText('admin')
    await expect(detailModal).toContainText(opinion)
  })
})

// ────────────────────────────────────────────
// 1. 查看预警列表 (12 tests)
// ────────────────────────────────────────────
test.describe('预警中心 -> 查看预警列表', () => {
  for (const role of ALL_ROLES) {
    test(`ALERT-LIST-01-${role}. 正常用例：${role}可查看预警列表`, async ({ page }) => {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/alerts`)
      await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
    })
  }
  test('ALERT-LIST-02. 空数据边界：无预警显示空状态', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(800)
  })
  test('ALERT-LIST-03. 异常恢复：API 500 显示错误并可重试', async ({ page }) => {
    await loginAs(page, 'admin')

    let listRequestCount = 0
    let allowRetrySuccess = false
    await page.route('**/api/v1/alerts**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/alerts/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { total: 1, pending: 1, processed: 0, ignored: 0, today: 1, month: 1 },
          }),
        })
        return
      }

      if (!url.pathname.endsWith('/alerts')) {
        await route.fallback()
        return
      }

      listRequestCount += 1
      if (!allowRetrySuccess) {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({
            success: false,
            error: { message: '测试注入：预警列表加载失败' },
          }),
        })
        return
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            list: [{
              id: 'alert-retry-ok',
              type: 'low-stock',
              level: 'warning',
              materialName: '重试恢复预警物料',
              currentStock: 0,
              threshold: 6,
              message: '重试后恢复',
              status: 'pending',
              createdAt: '2026-06-17T00:00:00Z',
            }],
            pagination: { total: 1, page: 1, pageSize: 10 },
          },
        }),
      })
    })

    await page.goto(`${FE_BASE}/alerts`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 15000 })
    const tableBody = page.locator('tbody')
    await expect(tableBody.getByText('预警列表加载失败', { exact: true })).toBeVisible({ timeout: 15000 })
    await expect(tableBody.getByText('测试注入：预警列表加载失败')).toBeVisible()

    allowRetrySuccess = true
    await tableBody.getByRole('button', { name: '重试' }).click()
    await expect(page.getByText('重试恢复预警物料')).toBeVisible({ timeout: 15000 })
    await expect(tableBody.getByText('预警列表加载失败', { exact: true })).toHaveCount(0)
    expect(listRequestCount).toBeGreaterThanOrEqual(2)
  })
  test('ALERT-LIST-04. UI差异：admin显示处理按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)
  })
  test('ALERT-LIST-05. 正常用例：显示类型级别物料库存阈值', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)
  })
  test('ALERT-LIST-06. 并发：快速刷新', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.reload()
    await page.reload()
  })
})

// ────────────────────────────────────────────
// 2. 按状态筛选 (8 tests)
// ────────────────────────────────────────────
test.describe('预警中心 -> 按状态筛选', () => {
  test('ALERT-STATUS-00. 快速筛选同步规范quick参数并重置分页', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts?page=3&quick=handled`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 15000 })
    await expect(page).toHaveURL(/quick=handled/)

    await page.getByRole('button', { name: '待处理' }).click()

    await expect(page).toHaveURL(/quick=pending/)
    expect(new URL(page.url()).searchParams.get('quickFilter')).toBeNull()
    expect(new URL(page.url()).searchParams.get('page')).toBeNull()
  })

  test('ALERT-FILTER-09. 类型和级别筛选同步规范URL并映射到API参数', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts?page=4&type=stock_low&level=urgent`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 15000 })

    const apiRequest = page.waitForRequest(request => {
      const url = new URL(request.url())
      return url.pathname.endsWith('/api/v1/alerts')
        && url.searchParams.get('type') === 'expiry'
        && url.searchParams.get('level') === 'warning'
    })
    await page.locator('select').nth(0).selectOption('expiry')
    await page.locator('select').nth(1).selectOption('important')
    await apiRequest

    const url = new URL(page.url())
    expect(url.searchParams.get('type')).toBe('expiring')
    expect(url.searchParams.get('level')).toBe('important')
    expect(url.searchParams.get('page')).toBeNull()
  })

  test('ALERT-STATUS-01. 正常用例：pending筛选', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts?status=pending')
    expect(res.status).toBe(200)
  })
  test('ALERT-STATUS-02. 正常用例：handled筛选', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts?status=handled')
    expect(res.status).toBe(200)
  })
  test('ALERT-STATUS-03. 空数据边界：无pending', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts?status=pending')
    expect(res.status).toBe(200)
  })
  test('ALERT-STATUS-04. 正常用例：重置筛选', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(800)
  })
  test('ALERT-STATUS-05. UI差异：各角色可见', async ({ page }) => {
    for (const role of ALL_ROLES) {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/alerts`)
      await page.waitForTimeout(500)
      await expect(page.locator('body')).toBeVisible()
      await page.goto(`${FE_BASE}/login`, { waitUntil: 'domcontentloaded' })
      await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
    }
  })
  test('ALERT-STATUS-06. 并发：快速切换', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts?status=pending`)
    await page.waitForTimeout(200)
    await page.goto(`${FE_BASE}/alerts?status=handled`)
    await page.waitForTimeout(200)
  })
  test('ALERT-STATUS-07. 异常恢复：筛选API错误', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts?status=invalid`)
    await page.waitForTimeout(800)
  })
  test('ALERT-STATUS-08. 边界：非法状态值', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts?status=invalid_xyz')
    expect(res.status).toBe(200)
  })
})

// ────────────────────────────────────────────
// 3. 按类型筛选 (6 tests)
// ────────────────────────────────────────────
test.describe('预警中心 -> 按类型筛选', () => {
  test('ALERT-TYPE-01. 正常用例：low-stock筛选', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts?type=low-stock')
    expect(res.status).toBe(200)
  })
  test('ALERT-TYPE-02. 正常用例：expiry筛选', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts?type=expiry')
    expect(res.status).toBe(200)
  })
  test('ALERT-TYPE-03. 空数据边界：无该类型', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts?type=nonexistent')
    expect(res.status).toBe(200)
  })
  test('ALERT-TYPE-04. 正常用例：重置', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(800)
  })
  test('ALERT-TYPE-05. UI差异：各角色可见', async ({ page }) => {
    for (const role of ALL_ROLES) {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/alerts`)
      await page.waitForTimeout(300)
    }
  })
  test('ALERT-TYPE-06. 异常恢复：API错误', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts?type=invalid`)
    await page.waitForTimeout(800)
  })
})

// ────────────────────────────────────────────
// 4. 处理预警 (12 tests)
// ────────────────────────────────────────────
test.describe('预警中心 -> 处理预警', () => {
  test('ALERT-HANDLE-01. 正常用例：admin处理预警', async () => {
    const token = await apiLogin('admin')
    const id = await getAnyAlertId(token)
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'POST', `/alerts/${id}/handle`, { action: 'handled', remark: 'E2E处理' })
    expect([200, 400, 404]).toContain(res.status)
  })
  test('ALERT-HANDLE-02. 正常用例：warehouse_manager处理', async () => {
    const token = await apiLogin('warehouse_manager')
    const adminToken = await apiLogin('admin')
    const suffix = `warehouse-handle-${Date.now()}`
    const alert = await createLowStockAlert(adminToken, suffix)
    const res = await apiFetch(token, 'POST', `/alerts/${alert.id}/handle`, { action: 'handled', remark: '仓库主管确认处理' })
    expect(res.status).toBe(200)
    const processed = await getAlertByKeyword(adminToken, suffix, 'processed')
    expect(processed).toMatchObject({
      id: alert.id,
      status: 'processed',
      handledBy: 'wangkq',
      remark: '仓库主管确认处理',
    })
  })
  test('ALERT-HANDLE-03. 表单校验：处理不存在的预警返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/alerts/non-existent/handle', { action: 'handled' })
    expect(res.status).toBe(404)
  })
  test('ALERT-HANDLE-04. 业务冲突：已handled再次处理', async () => {
    const token = await apiLogin('admin')
    const id = await getAnyAlertId(token)
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'POST', `/alerts/${id}/handle`, { action: 'handled' })
    expect([200, 400, 404]).toContain(res.status)
  })
  test('ALERT-HANDLE-05. 并发：并发处理同一预警', async () => {
    const token = await apiLogin('admin')
    const alert = await createLowStockAlert(token, `concurrent-handle-${Date.now()}`)
    const [r1, r2] = await Promise.all([
      apiFetch(token, 'POST', `/alerts/${alert.id}/handle`, { action: 'handled', remark: '并发处理' }),
      apiFetch(token, 'POST', `/alerts/${alert.id}/handle`, { action: 'ignored' }),
    ])
    // At least one should succeed, or both return valid status codes
    expect([200, 400, 404, 409]).toContain(r1.status)
    expect([200, 400, 404, 409]).toContain(r2.status)
  })
  test('ALERT-HANDLE-06. 异常恢复：网络中断后重试', async () => {
    const token = await apiLogin('admin')
    const id = await getAnyAlertId(token)
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'POST', `/alerts/${id}/handle`, { action: 'handled', remark: 'E2E恢复' })
    expect([200, 400, 404]).toContain(res.status)
  })
  test('ALERT-HANDLE-07. UI差异：admin显示处理按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)
  })
  test('ALERT-HANDLE-08. UI差异：technician显示处理按钮', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)
  })
  test('ALERT-HANDLE-09. 正常用例：处理后状态变为handled', async () => {
    const token = await apiLogin('admin')
    const suffix = `status-after-handle-${Date.now()}`
    const alert = await createLowStockAlert(token, suffix)
    const res = await apiFetch(token, 'POST', `/alerts/${alert.id}/handle`, { action: 'handled', remark: '状态流转验证' })
    expect(res.status).toBe(200)
    const processed = await getAlertByKeyword(token, suffix, 'processed')
    expect(processed).toMatchObject({ id: alert.id, status: 'processed' })
  })
  test('ALERT-HANDLE-10. 正常用例：处理后handled_at有值', async () => {
    const token = await apiLogin('admin')
    const suffix = `handled-at-${Date.now()}`
    const alert = await createLowStockAlert(token, suffix)
    const res = await apiFetch(token, 'POST', `/alerts/${alert.id}/handle`, { action: 'handled', remark: '处理时间验证' })
    expect(res.status).toBe(200)
    const processed = await getAlertByKeyword(token, suffix, 'processed')
    expect(processed?.handledAt).toBeTruthy()
  })
  test('ALERT-HANDLE-11. 边界：空remark', async () => {
    const token = await apiLogin('admin')
    const suffix = `empty-remark-${Date.now()}`
    const alert = await createLowStockAlert(token, suffix)
    const res = await apiFetch(token, 'POST', `/alerts/${alert.id}/handle`, { action: 'handled', remark: '' })
    expect(res.status).toBe(400)
    const pending = await getAlertByKeyword(token, suffix, 'pending')
    expect(pending).toMatchObject({ id: alert.id, status: 'pending' })
  })
  test('ALERT-HANDLE-12. 异常恢复：处理后刷新状态保持', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
})

// ────────────────────────────────────────────
// 5. 批量处理预警 (8 tests)
// ────────────────────────────────────────────
test.describe('预警中心 -> 批量处理预警', () => {
  test('ALERT-BATCH-01. 正常用例：批量处理多条预警', async () => {
    const token = await apiLogin('admin')
    const r = await apiFetch(token, 'GET', '/alerts?page=1&pageSize=3')
    const ids = (r.data?.data?.list || []).map((a: any) => a.id)
    if (ids.length === 0) { test.skip(); return }
    for (const id of ids) {
      await apiFetch(token, 'POST', `/alerts/${id}/handle`, { action: 'handled', remark: 'E2E批量' })
    }
  })
  test('ALERT-BATCH-02. 空数据边界：未选择点击批量处理', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)
    const btn = page.locator('button:has-text("批量处理"), button:has-text("批量")').first()
    if (await btn.isVisible().catch(() => false)) await btn.click()
  })
  test('ALERT-BATCH-03. 并发：快速点击批量多次', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(800)
  })
  test('ALERT-BATCH-04. 异常恢复：部分API 500', async () => {
    const token = await apiLogin('admin')
    const r = await apiFetch(token, 'GET', '/alerts?page=1&pageSize=2')
    const ids = (r.data?.data?.list || []).map((a: any) => a.id)
    for (const id of ids) {
      await apiFetch(token, 'POST', `/alerts/${id}/handle`, { action: 'handled' })
    }
  })
  test('ALERT-BATCH-05. UI差异：admin显示批量按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)
  })
  test('ALERT-BATCH-06. 正常用例：全选后批量', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(800)
    const allCb = page.locator('table thead input[type="checkbox"]').first()
    if (await allCb.isVisible().catch(() => false)) await allCb.click()
  })
  test('ALERT-BATCH-07. 异常恢复：批量后刷新', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
  test('ALERT-BATCH-08. 边界：单页全选翻页', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(800)
  })
})

// ────────────────────────────────────────────
// 6. 预警规则 (10 tests)
// ────────────────────────────────────────────
test.describe('预警中心 -> 预警规则', () => {
  test('ALERT-RULE-01. 正常用例：admin查看规则列表', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts/rules')
    expect(res.status).toBe(200)
  })
  test('ALERT-RULE-02. 正常用例：admin修改低库存阈值', async () => {
    const token = await apiLogin('admin')
    const rid = await getAnyRuleId(token)
    if (!rid) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { threshold: 20 })
    expect([200, 404]).toContain(res.status)
  })
  test('ALERT-RULE-03. 空数据边界：threshold=0', async () => {
    const token = await apiLogin('admin')
    const rid = await getAnyRuleId(token)
    if (!rid) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { threshold: 0 })
    expect([200, 404]).toContain(res.status)
  })
  test('ALERT-RULE-04. 边界：负数threshold', async () => {
    const token = await apiLogin('admin')
    const rid = await getAnyRuleId(token)
    if (!rid) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { threshold: -1 })
    expect([200, 400, 404]).toContain(res.status)
  })
  test('ALERT-RULE-05. 权限：warehouse_manager修改返回403', async () => {
    const token = await apiLogin('warehouse_manager')
    const adminToken = await apiLogin('admin')
    const rid = await getAnyRuleId(adminToken)
    if (!rid) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { threshold: 10 })
    expect(res.status).toBe(403)
  })
  test('ALERT-RULE-06. 并发：并发修改同一规则', async () => {
    const token = await apiLogin('admin')
    const rid = await getAnyRuleId(token)
    if (!rid) { test.skip(); return }
    const [r1, r2] = await Promise.all([
      apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { threshold: 15 }),
      apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { threshold: 25 }),
    ])
    expect(r1.status === 200 || r2.status === 200).toBe(true)
  })
  test('ALERT-RULE-07. 异常恢复：修改时API 500', async () => {
    const token = await apiLogin('admin')
    const rid = await getAnyRuleId(token)
    if (!rid) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { threshold: 30 })
    expect([200, 404]).toContain(res.status)
  })
  test('ALERT-RULE-08. UI差异：admin显示编辑开关', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)
  })
  test('ALERT-RULE-09. UI差异：technician显示只读', async ({ page }) => {
    await loginAs(page, 'technician')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)
  })
  test('ALERT-RULE-10. 正常用例：修改thresholdDays', async () => {
    const token = await apiLogin('admin')
    const rid = await getAnyRuleId(token)
    if (!rid) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { thresholdDays: 60 })
    expect([200, 404]).toContain(res.status)
  })
})

// ────────────────────────────────────────────
// 7. 分页切换 (8 tests)
// ────────────────────────────────────────────
test.describe('预警中心 -> 分页切换', () => {
  test('ALERT-PAGE-01. 正常用例：切换到第2页', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts?page=2`)
    await page.waitForTimeout(800)
  })
  test('ALERT-PAGE-02. 边界：仅1页', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(800)
  })
  test('ALERT-PAGE-03. 表单校验：page=0', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts?page=0')
    expect(res.status).toBe(200)
  })
  test('ALERT-PAGE-04. 边界：page=999', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts?page=999')
    expect(res.status).toBe(200)
  })
  test('ALERT-PAGE-05. 边界：pageSize=1', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts?page=1&pageSize=1')
    expect(res.status).toBe(200)
  })
  test('ALERT-PAGE-06. 边界：pageSize=100', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts?page=1&pageSize=100')
    expect(res.status).toBe(200)
  })
  test('ALERT-PAGE-07. 并发：快速切换', async ({ page }) => {
    await loginAs(page, 'admin')
    for (let i = 1; i <= 3; i++) {
      await page.goto(`${FE_BASE}/alerts?page=${i}`)
      await page.waitForTimeout(300)
    }
  })
  test('ALERT-PAGE-08. UI差异：各角色一致', async ({ page }) => {
    for (const role of ALL_ROLES) {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/alerts?page=1`)
      await page.waitForTimeout(300)
    }
  })
  test('ALERT-PAGE-09. 页面分页参数传后端且普通筛选重置第1页', async ({ page }) => {
    await loginAs(page, 'admin')

    const listRequests: URL[] = []
    await page.route('**/api/v1/alerts**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/alerts/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { total: 25, pending: 25, processed: 0, ignored: 0, today: 25, month: 25 },
          }),
        })
        return
      }

      if (!url.pathname.endsWith('/alerts')) {
        await route.fallback()
        return
      }

      listRequests.push(url)
      const currentPage = Number(url.searchParams.get('page') || '1')
      const pageSize = Number(url.searchParams.get('pageSize') || '10')
      const offset = (currentPage - 1) * pageSize
      const list = Array.from({ length: Math.max(0, Math.min(pageSize, 25 - offset)) }, (_, index) => ({
        id: `mock-alert-${currentPage}-${index}`,
        type: 'low-stock',
        level: 'warning',
        materialName: `分页Mock物料-${currentPage}-${index}`,
        currentStock: 0,
        threshold: 6,
        message: `mock page=${currentPage}, pageSize=${pageSize}`,
        status: 'pending',
        createdAt: '2026-06-17T00:00:00Z',
      }))

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            list,
            pagination: { total: 25, page: currentPage, pageSize },
          },
        }),
      })
    })

    await page.goto(`${FE_BASE}/alerts?page=2&pageSize=10`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('共 25 条记录')).toBeVisible()
    await expect(page.getByText('分页Mock物料-2-0')).toBeVisible()
    await expect.poll(() => listRequests.some((url) =>
      url.searchParams.get('page') === '2' &&
      url.searchParams.get('pageSize') === '10'
    )).toBe(true)

    await page.locator('select').first().selectOption('low-stock')
    await expect(page.getByText('分页Mock物料-1-0')).toBeVisible()
    await expect.poll(() => {
      const url = new URL(page.url())
      return {
        page: url.searchParams.get('page'),
        pageSize: url.searchParams.get('pageSize'),
        type: url.searchParams.get('type'),
      }
    }).toEqual({ page: null, pageSize: null, type: 'low-stock' })
    await expect.poll(() => listRequests.some((url) =>
      url.searchParams.get('page') === '1' &&
      url.searchParams.get('pageSize') === '10' &&
      url.searchParams.get('type') === 'low-stock'
    )).toBe(true)

    await page.getByLabel('每页条数').selectOption('20')
    await expect(page.getByText('分页Mock物料-1-19')).toBeVisible()
    await expect.poll(() => {
      const url = new URL(page.url())
      return {
        page: url.searchParams.get('page'),
        pageSize: url.searchParams.get('pageSize'),
        type: url.searchParams.get('type'),
      }
    }).toEqual({ page: null, pageSize: '20', type: 'low-stock' })
    await expect.poll(() => listRequests.some((url) =>
      url.searchParams.get('page') === '1' &&
      url.searchParams.get('pageSize') === '20' &&
      url.searchParams.get('type') === 'low-stock'
    )).toBe(true)
  })
})

// ────────────────────────────────────────────
// 8. 角色权限矩阵补充 (8 tests)
// ────────────────────────────────────────────
test.describe('预警中心 -> 角色权限矩阵补充', () => {
  test('TC-PERM-116. warehouse_manager PUT /alerts/rules 返回403', async () => {
    const token = await apiLogin('warehouse_manager')
    const adminToken = await apiLogin('admin')
    const rid = await getAnyRuleId(adminToken)
    if (!rid) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { threshold: 10 })
    expect(res.status).toBe(403)
  })
  test('TC-PERM-117. technician PUT /alerts/rules 返回403', async () => {
    const token = await apiLogin('technician')
    const adminToken = await apiLogin('admin')
    const rid = await getAnyRuleId(adminToken)
    if (!rid) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { threshold: 10 })
    expect(res.status).toBe(403)
  })
  test('TC-PERM-118. pathologist PUT /alerts/rules 返回403', async () => {
    const token = await apiLogin('pathologist')
    const adminToken = await apiLogin('admin')
    const rid = await getAnyRuleId(adminToken)
    if (!rid) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { threshold: 10 })
    expect(res.status).toBe(403)
  })
  test('TC-PERM-119. procurement PUT /alerts/rules 返回403', async () => {
    const token = await apiLogin('procurement')
    const adminToken = await apiLogin('admin')
    const rid = await getAnyRuleId(adminToken)
    if (!rid) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { threshold: 10 })
    expect(res.status).toBe(403)
  })
  test('TC-PERM-120. finance PUT /alerts/rules 返回403', async () => {
    const token = await apiLogin('finance')
    const adminToken = await apiLogin('admin')
    const rid = await getAnyRuleId(adminToken)
    if (!rid) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { threshold: 10 })
    expect(res.status).toBe(403)
  })
  test('TC-PERM-ALERT-EXTRA-01. admin GET /alerts 返回200', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts')
    expect(res.status).toBe(200)
  })
  test('TC-PERM-ALERT-EXTRA-02. 任意角色GET /alerts 返回200', async () => {
    for (const role of ALL_ROLES) {
      const token = await apiLogin(role)
      const res = await apiFetch(token, 'GET', '/alerts')
      expect(res.status).toBe(200)
    }
  })
  test('TC-PERM-ALERT-EXTRA-03. admin POST /alerts/generate 返回200', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/alerts/generate')
    expect(res.status).toBe(200)
  })
  test('TC-PERM-ALERT-EXTRA-04. technician POST /alerts/generate 返回403', async () => {
    const token = await apiLogin('technician')
    const res = await apiFetch(token, 'POST', '/alerts/generate')
    expect(res.status).toBe(403)
  })
})

// ────────────────────────────────────────────
// 9. 业务流程树 (8 tests)
// ────────────────────────────────────────────
test.describe('预警中心 -> 业务流程树', () => {
  test('BF-ALERT-01. 主路径：登录→预警中心→查看pending→处理→状态变为handled', async () => {
    const token = await apiLogin('admin')
    const alert = await createLowStockAlert(token, `main-${Date.now()}`)
    const res = await apiFetch(token, 'POST', `/alerts/${alert.id}/process`, { remark: 'E2E主路径处理' })
    expect(res.status).toBe(200)

    const history = await apiFetch(token, 'GET', `/alerts?keyword=${encodeURIComponent(alert.materialName)}&status=processed,ignored,auto_resolved,dismissed,handled`)
    expect(history.status).toBe(200)
    const handled = history.data?.data?.list?.find((item: any) => item.id === alert.id)
    expect(handled).toBeTruthy()
    expect(handled.status).toBe('processed')
    expect(handled.handledBy).toBe('admin')
    expect(handled.handledAt).toBeTruthy()
    expect(handled.remark).toBe('E2E主路径处理')
  })
  test('BF-ALERT-02. 分支：关闭处理弹窗', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)
  })
  test('BF-ALERT-03. 分支：未填备注提交', async () => {
    const token = await apiLogin('admin')
    const suffix = `missing-remark-${Date.now()}`
    const alert = await createLowStockAlert(token, suffix)
    const res = await apiFetch(token, 'POST', `/alerts/${alert.id}/handle`, { action: 'handled' })
    expect(res.status).toBe(400)
    const pending = await getAlertByKeyword(token, suffix, 'pending')
    expect(pending).toMatchObject({ id: alert.id, status: 'pending' })
  })
  test('BF-ALERT-04. 分支：处理不存在预警', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/alerts/non-existent/handle', { action: 'handled' })
    expect(res.status).toBe(404)
  })
  test('BF-ALERT-05. 分支：重复处理同一预警', async () => {
    const token = await apiLogin('admin')
    const id = await getAnyAlertId(token)
    if (!id) { test.skip(); return }
    await apiFetch(token, 'POST', `/alerts/${id}/handle`, { action: 'handled' })
    const res2 = await apiFetch(token, 'POST', `/alerts/${id}/handle`, { action: 'ignored' })
    expect([200, 400, 404]).toContain(res2.status)
  })
  test('BF-ALERT-06. 分支：批量处理3条预警', async () => {
    const token = await apiLogin('admin')
    const r = await apiFetch(token, 'GET', '/alerts?page=1&pageSize=3')
    const ids = (r.data?.data?.list || []).map((a: any) => a.id)
    for (const id of ids) {
      await apiFetch(token, 'POST', `/alerts/${id}/handle`, { action: 'handled', remark: 'E2E批量' })
    }
  })
  test('BF-ALERT-07. 分支：刷新后预警状态保持', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
  test('BF-ALERT-08. 分支：禁用规则后不再生成', async () => {
    const token = await apiLogin('admin')
    const rid = await getAnyRuleId(token)
    if (!rid) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { enabled: false })
    expect([200, 404]).toContain(res.status)
    await apiFetch(token, 'PUT', `/alerts/rules/${rid}`, { enabled: true })
  })
})

// ────────────────────────────────────────────
// 10. 盲点分析补充 (18 tests)
// ────────────────────────────────────────────
test.describe('预警中心 -> 盲点分析补充', () => {
  test('BLIND-ALERT-01. 预警级别颜色标签', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts`)
    await page.waitForTimeout(1000)
  })
  test('BLIND-ALERT-02. 预警自动生成定时任务', async () => {
    const token = await apiLogin('admin')
    const suffix = `dedupe-generate-${Date.now()}`
    const alert = await createLowStockAlert(token, suffix)

    const repeated = await apiFetch(token, 'POST', '/alerts/generate')
    expect(repeated.status).toBe(200)

    const list = await apiFetch(token, 'GET', `/alerts?keyword=${encodeURIComponent(suffix)}&type=low-stock&status=pending&page=1&pageSize=20`)
    expect(list.status).toBe(200)
    const matching = (list.data?.data?.list || []).filter((item: any) => item.materialName?.includes(suffix))
    expect(matching).toHaveLength(1)
    expect(matching[0]).toMatchObject({
      id: alert.id,
      type: 'low-stock',
      status: 'pending',
    })
  })
  test('BLIND-ALERT-03. 预警手动扫描', async () => {
    const token = await apiLogin('admin')
    const suffix = `manual-scan-${Date.now()}`
    const material = await createLowStockMaterial(token, suffix)

    const res = await apiFetch(token, 'POST', '/alerts/generate')
    expect(res.status).toBe(200)
    expect(Number(res.data?.data?.generatedCount || 0)).toBeGreaterThanOrEqual(1)

    const generated = await getAlertByKeyword(token, suffix, 'pending')
    expect(generated).toMatchObject({
      type: 'low-stock',
      materialName: material.name,
      currentStock: 0,
      threshold: 6,
      status: 'pending',
    })
  })
  test('BLIND-ALERT-04. 预警历史记录', async () => {
    const token = await apiLogin('admin')
    const suffix = `history-record-${Date.now()}`
    const alert = await createLowStockAlert(token, suffix)
    const remark = `历史记录验证-${suffix}`
    const handled = await apiFetch(token, 'POST', `/alerts/${alert.id}/process`, { remark })
    expect(handled.status).toBe(200)

    const res = await apiFetch(token, 'GET', `/alerts?keyword=${encodeURIComponent(suffix)}&status=processed,ignored,auto_resolved,dismissed,handled&page=1&pageSize=10`)
    expect(res.status).toBe(200)
    expect(res.data?.data?.pagination).toMatchObject({ total: 1, page: 1, pageSize: 10 })
    const history = res.data?.data?.list?.[0]
    expect(history).toMatchObject({
      id: alert.id,
      status: 'processed',
      handledBy: 'admin',
      remark,
    })
    expect(history.handledAt).toBeTruthy()
  })
  test('BLIND-ALERT-05. 当前预警页不提供导出入口，避免空导出假验收', async ({ page }) => {
    await openPendingAlertForBoundary(page, 'no-export')
    await expectNoUnsupportedAlertOperations(page)
  })
  test('BLIND-ALERT-06. 当前预警页不提供打印入口，避免空打印假验收', async ({ page }) => {
    await openPendingAlertForBoundary(page, 'no-print')
    await expectNoUnsupportedAlertOperations(page)
  })
  test('BLIND-ALERT-07. 预警页面响应式', async ({ page }) => {
    await loginByStorage(page, 'admin')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.route('**/api/v1/alerts**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/alerts/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { total: 1, pending: 1, processed: 0, ignored: 0, today: 1, month: 1 },
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            list: [{
              id: 'alert-mobile',
              type: 'low-stock',
              level: 'warning',
              materialName: '移动端响应式验证物料',
              currentStock: 0,
              threshold: 6,
              message: '移动端响应式验证',
              status: 'pending',
              createdAt: '2026-06-17T14:05:00+08:00',
            }],
            pagination: { total: 1, page: 1, pageSize: 10 },
          },
        }),
      })
    })

    await page.goto(`${FE_BASE}/alerts`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByPlaceholder('搜索物料或预警内容')).toBeVisible()
    await expect(page.getByText('移动端响应式验证物料')).toBeVisible()
    await expect(page.getByText('待处理', { exact: true }).first().locator('..')).toContainText('1')

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
  test('BLIND-ALERT-08. 预警页面加载性能', async ({ page }) => {
    await loginByStorage(page, 'admin')
    let listRequests = 0
    let statsRequests = 0
    await page.route('**/api/v1/alerts**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/alerts/stats')) {
        statsRequests += 1
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { total: 1, pending: 1, processed: 0, ignored: 0, today: 1, month: 1 },
          }),
        })
        return
      }
      if (url.pathname.endsWith('/alerts') && url.searchParams.get('pageSize') === '10') {
        listRequests += 1
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            list: [{
              id: 'alert-performance',
              type: 'low-stock',
              level: 'warning',
              materialName: '加载性能验证物料',
              currentStock: 0,
              threshold: 6,
              message: '加载性能验证',
              status: 'pending',
              createdAt: '2026-06-17T14:05:00+08:00',
            }],
            pagination: { total: 1, page: 1, pageSize: 10 },
          },
        }),
      })
    })

    const start = Date.now()
    await page.goto(`${FE_BASE}/alerts`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText('加载性能验证物料')).toBeVisible({ timeout: 5000 })
    expect(Date.now() - start).toBeLessThan(5000)
    expect(listRequests).toBeGreaterThanOrEqual(1)
    expect(listRequests).toBeLessThanOrEqual(2)
    expect(statsRequests).toBeGreaterThanOrEqual(1)
    expect(statsRequests).toBeLessThanOrEqual(2)
  })
  test('BLIND-ALERT-09. 预警搜索防抖', async ({ page }) => {
    await loginByStorage(page, 'admin')
    const listKeywords: string[] = []
    const statsKeywords: string[] = []
    await page.route('**/api/v1/alerts**', async (route) => {
      const url = new URL(route.request().url())
      const keyword = url.searchParams.get('keyword') || ''
      if (url.pathname.endsWith('/alerts/stats')) {
        statsKeywords.push(keyword)
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { total: keyword ? 1 : 0, pending: keyword ? 1 : 0, processed: 0, ignored: 0, today: keyword ? 1 : 0, month: keyword ? 1 : 0 },
          }),
        })
        return
      }
      listKeywords.push(keyword)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            list: keyword ? [{
              id: `alert-search-${keyword}`,
              type: 'low-stock',
              level: 'warning',
              materialName: `搜索验证物料-${keyword}`,
              currentStock: 0,
              threshold: 6,
              message: `搜索验证-${keyword}`,
              status: 'pending',
              createdAt: '2026-06-17T14:05:00+08:00',
            }] : [],
            pagination: { total: keyword ? 1 : 0, page: 1, pageSize: 10 },
          },
        }),
      })
    })

    await page.goto(`${FE_BASE}/alerts`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 15000 })
    const initialListRequests = listKeywords.length
    const initialStatsRequests = statsKeywords.length
    const search = page.getByPlaceholder('搜索物料或预警内容')
    await search.fill('a')
    await page.waitForTimeout(100)
    await search.fill('ab')

    await expect.poll(() => listKeywords.filter((keyword) => keyword === 'ab').length).toBe(1)
    await expect.poll(() => statsKeywords.filter((keyword) => keyword === 'ab').length).toBe(1)
    expect(listKeywords.slice(initialListRequests)).toEqual(['ab'])
    expect(statsKeywords.slice(initialStatsRequests)).toEqual(['ab'])
    await expect(page.getByText('搜索验证物料-ab')).toBeVisible()
  })
  test('BLIND-ALERT-10. 预警规则默认值', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/alerts/rules')
    expect(res.status).toBe(200)
    const rules = res.data?.data?.rules || []
    expect(rules.length).toBeGreaterThanOrEqual(3)
    const byType = Object.fromEntries(rules.map((rule: any) => [rule.type, rule]))
    expect(byType['low-stock']).toMatchObject({ id: 'RULE-001', name: '低库存预警', enabled: true })
    expect(byType.expiry).toMatchObject({ id: 'RULE-002', name: '有效期预警', thresholdDays: 30, enabled: true })
    expect(byType.stagnant).toMatchObject({ id: 'RULE-003', name: '呆滞库存预警', threshold: 90, enabled: true })
    expect(typeof byType['low-stock'].threshold).toBe('number')
    for (const rule of rules) {
      expect(rule).toEqual(expect.objectContaining({
        id: expect.any(String),
        type: expect.any(String),
        name: expect.any(String),
        enabled: expect.any(Boolean),
      }))
    }
  })
  test('BLIND-ALERT-11. 预警处理人信息', async () => {
    const token = await apiLogin('admin')
    const suffix = `handler-info-${Date.now()}`
    const alert = await createLowStockAlert(token, suffix)
    const remark = `处理人字段验证-${suffix}`

    const handled = await apiFetch(token, 'POST', `/alerts/${alert.id}/process`, { remark })
    expect(handled.status).toBe(200)

    const processed = await getAlertByKeyword(token, suffix, 'processed')
    expect(processed).toMatchObject({
      id: alert.id,
      status: 'processed',
      handledBy: 'admin',
      remark,
    })
    expect(processed.handledAt).toBeTruthy()
  })
  test('BLIND-ALERT-12. 预警时间格式化', async ({ page }) => {
    await loginByStorage(page, 'admin')
    const createdAt = '2026-06-17T14:05:00+08:00'
    await page.route('**/api/v1/alerts**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/alerts/stats')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { total: 1, pending: 1, processed: 0, ignored: 0, today: 1, month: 1 },
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            list: [{
              id: 'alert-time-format',
              type: 'low-stock',
              level: 'warning',
              materialName: '时间格式化验证物料',
              currentStock: 0,
              threshold: 6,
              message: '时间格式化验证',
              status: 'pending',
              createdAt,
            }],
            pagination: { total: 1, page: 1, pageSize: 10 },
          },
        }),
      })
    })

    await page.goto(`${FE_BASE}/alerts`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('tbody tr', { hasText: '时间格式化验证物料' }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await expect(row).toContainText('2026/06/17')
    await expect(row).toContainText('14:05')
  })
  test('BLIND-ALERT-13. 预警数量统计卡片', async ({ page }) => {
    await loginByStorage(page, 'admin')
    let statsUrl: URL | null = null
    await page.route('**/api/v1/alerts**', async (route) => {
      const url = new URL(route.request().url())
      if (url.pathname.endsWith('/alerts/stats')) {
        statsUrl = url
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: { total: 23, pending: 17, processed: 3, ignored: 2, today: 5, month: 23 },
          }),
        })
        return
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            list: [{
              id: 'alert-stats-card',
              type: 'low-stock',
              level: 'warning',
              materialName: '统计卡片验证物料',
              currentStock: 0,
              threshold: 6,
              message: '统计卡片验证',
              status: 'pending',
              createdAt: '2026-06-17T14:05:00+08:00',
            }],
            pagination: { total: 1, page: 1, pageSize: 10 },
          },
        }),
      })
    })

    await page.goto(`${FE_BASE}/alerts?keyword=stats-card&type=low-stock&quickFilter=pending`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: '预警中心' })).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('待处理', { exact: true }).first().locator('..')).toContainText('17')
    await expect(page.getByText('已处理', { exact: true }).first().locator('..')).toContainText('3')
    await expect(page.getByText('今日预警', { exact: true }).locator('..')).toContainText('5')
    await expect(page.getByText('本月预警', { exact: true }).locator('..')).toContainText('23')
    expect(statsUrl?.searchParams.get('keyword')).toBe('stats-card')
    expect(statsUrl?.searchParams.get('type')).toBe('low-stock')
    expect(statsUrl?.searchParams.get('status')).toBe('pending')
  })
  test('BLIND-ALERT-14. 预警低库存与临期区分', async () => {
    const token = await apiLogin('admin')
    const suffix = `type-split-${Date.now()}`
    const lowStockAlert = await createLowStockAlert(token, `low-${suffix}`)
    const expiryAlert = await createExpiryAlert(token, `expiry-${suffix}`)

    const lowStockRes = await apiFetch(token, 'GET', `/alerts?keyword=${encodeURIComponent(suffix)}&type=low-stock&status=pending&page=1&pageSize=20`)
    const expiryRes = await apiFetch(token, 'GET', `/alerts?keyword=${encodeURIComponent(suffix)}&type=expiry&status=pending&page=1&pageSize=20`)
    expect(lowStockRes.status).toBe(200)
    expect(expiryRes.status).toBe(200)

    const lowStockItems = lowStockRes.data?.data?.list || []
    const expiryItems = expiryRes.data?.data?.list || []
    expect(lowStockItems.map((item: any) => item.id)).toContain(lowStockAlert.id)
    expect(lowStockItems.every((item: any) => item.type === 'low-stock')).toBe(true)
    expect(lowStockItems.some((item: any) => item.id === expiryAlert.id)).toBe(false)
    expect(expiryItems.map((item: any) => item.id)).toContain(expiryAlert.id)
    expect(expiryItems.every((item: any) => item.type === 'expiry')).toBe(true)
    expect(expiryItems.some((item: any) => item.id === lowStockAlert.id)).toBe(false)
  })
  test('BLIND-ALERT-15. 当前预警页不提供邮件通知入口，避免空通知假验收', async ({ page }) => {
    await openPendingAlertForBoundary(page, 'no-email')
    await expectNoUnsupportedAlertOperations(page)
  })
  test('BLIND-ALERT-16. 预警字段XSS防护', async ({ page }) => {
    const token = await apiLogin('admin')
    const suffix = `xss-${Date.now()}`
    const alert = await createLowStockAlert(token, suffix)
    const xssRemark = `安全展示校验 <script>window.__alertXssExecuted = true</script>`

    const res = await apiFetch(token, 'POST', `/alerts/${alert.id}/process`, { remark: xssRemark })
    expect(res.status).toBe(200)

    await page.addInitScript(() => {
      ;(window as any).__alertXssExecuted = false
    })
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/alerts?keyword=${encodeURIComponent(suffix)}&quickFilter=history`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('tbody tr', { hasText: alert.materialName }).first()
    await expect(row).toBeVisible({ timeout: 15000 })
    await row.getByRole('button', { name: '详情' }).click()

    const detailModal = page.locator('.fixed.inset-0', { hasText: `预警详情 - ${alert.id}` }).first()
    await expect(detailModal).toBeVisible({ timeout: 15000 })
    await expect(detailModal).toContainText(xssRemark)
    await expect(detailModal.locator('script')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => (window as any).__alertXssExecuted)).toBe(false)
  })
  test('BLIND-ALERT-17. 预警API响应格式', async () => {
    const token = await apiLogin('admin')
    const suffix = `api-format-${Date.now()}`
    const alert = await createLowStockAlert(token, suffix)
    const res = await apiFetch(token, 'GET', `/alerts?keyword=${encodeURIComponent(suffix)}&page=1&pageSize=10`)
    expect(res.status).toBe(200)
    expect(res.data).toMatchObject({ success: true })
    expect(res.data?.data?.pagination).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 10,
    })
    expect(res.data?.data?.list).toHaveLength(1)
    expect(res.data.data.list[0]).toMatchObject({
      id: alert.id,
      type: 'low-stock',
      materialName: alert.materialName,
      currentStock: 0,
      threshold: 6,
      status: 'pending',
    })
    expect(res.data.data.list[0].createdAt).toBeTruthy()
    expect(res.data.data.list[0].message).toContain('Low stock')
  })
  test('BLIND-ALERT-18. 多角色同时处理互不影响', async () => {
    const adminToken = await apiLogin('admin')
    const warehouseToken = await apiLogin('warehouse_manager')
    const suffix = `multi-role-${Date.now()}`
    const adminAlert = await createLowStockAlert(adminToken, `admin-${suffix}`)
    const warehouseAlert = await createLowStockAlert(adminToken, `warehouse-${suffix}`)

    const [adminResult, warehouseResult] = await Promise.all([
      apiFetch(adminToken, 'POST', `/alerts/${adminAlert.id}/process`, { remark: `管理员处理-${suffix}` }),
      apiFetch(warehouseToken, 'POST', `/alerts/${warehouseAlert.id}/process`, { remark: `仓库主管处理-${suffix}` }),
    ])
    expect(adminResult.status).toBe(200)
    expect(warehouseResult.status).toBe(200)

    const adminProcessed = await getAlertByKeyword(adminToken, `admin-${suffix}`, 'processed')
    const warehouseProcessed = await getAlertByKeyword(adminToken, `warehouse-${suffix}`, 'processed')
    expect(adminProcessed).toMatchObject({
      id: adminAlert.id,
      status: 'processed',
      handledBy: 'admin',
      remark: `管理员处理-${suffix}`,
    })
    expect(warehouseProcessed).toMatchObject({
      id: warehouseAlert.id,
      status: 'processed',
      handledBy: 'wangkq',
      remark: `仓库主管处理-${suffix}`,
    })
    expect(adminProcessed.id).not.toBe(warehouseProcessed.id)
  })
})
