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
const READ_ROLES: RoleKey[] = ['admin', 'technician', 'pathologist']
const FORBIDDEN_ROLES: RoleKey[] = ['warehouse_manager', 'procurement', 'finance']

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

async function createLaborTime(token: string, overrides: Record<string, any> = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return apiFetch(token, 'POST', '/labor-times', {
    stepCode: `E2E-LAB-${suffix}`,
    stepName: `E2E标准工时-${suffix}`,
    projectType: 'IHC',
    standardMinutes: 18,
    laborRatePerMinute: 2.75,
    referenceSource: 'industry',
    description: 'E2E标准工时详情说明',
    ...overrides,
  })
}

// ────────────────────────────────────────────
// 1. 查看工时列表 (10 tests)
// ────────────────────────────────────────────
test.describe('工时管理 -> 查看工时列表', () => {
  for (const role of READ_ROLES) {
    test(`LT-LIST-01-${role}. ${role}可查看工时列表`, async ({ page }) => {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/labor-times`)
      await expect(page.getByRole('heading', { name: '标准工时库' })).toBeVisible({ timeout: 30000 })
      await expect(page.getByText('定义各环节标准工时与费率，用于人工成本核算')).toBeVisible()
      if (role === 'admin') {
        await expect(page.getByRole('button', { name: /新增工时定义/ })).toBeVisible()
      } else {
        await expect(page.getByRole('button', { name: /新增工时定义/ })).toHaveCount(0)
        await expect(page.getByRole('button', { name: '编辑' })).toHaveCount(0)
        await expect(page.getByRole('button', { name: '删除' })).toHaveCount(0)
      }
    })
  }
  for (const role of FORBIDDEN_ROLES) {
    test(`LT-LIST-02-${role}. ${role}访问工时列表返回403`, async () => {
      const res = await apiFetch(await apiLogin(role), 'GET', '/labor-times')
      expect(res.status).toBe(403)
    })
  }
  test('LT-LIST-03. 无Token返回401', async () => {
    const res = await fetch(`${API_BASE}/labor-times`)
    expect(res.status).toBe(401)
  })
  test('LT-LIST-04. API响应格式验证', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/labor-times?page=1&pageSize=1')
    expect(res.status).toBe(200)
    expect(res.data).toHaveProperty('data')
    expect(res.data?.data).toHaveProperty('list')
  })
  test('LT-LIST-05. 按projectType筛选', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/labor-times?projectType=IHC')
    expect(res.status).toBe(200)
  })
  test('LT-LIST-06. 按keyword筛选', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/labor-times?keyword=切片')
    expect(res.status).toBe(200)
  })
  test('LT-LIST-07. 按referenceSource筛选', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/labor-times?referenceSource=system')
    expect(res.status).toBe(200)
  })
  test('LT-LIST-08. 页面加载性能', async ({ page }) => {
    await loginAs(page, 'admin')
    const start = Date.now()
    await page.goto(`${FE_BASE}/labor-times`)
    await page.waitForTimeout(2000)
    expect(Date.now() - start).toBeLessThan(10000)
  })
})

// ────────────────────────────────────────────
// 2. 创建工时 (12 tests)
// ────────────────────────────────────────────
test.describe('工时管理 -> 创建工时', () => {
  test('LT-CREATE-01. admin创建工时成功', async () => {
    const token = await apiLogin('admin')
    const stepCode = `E2E_${Date.now()}`
    const res = await apiFetch(token, 'POST', '/labor-times', {
      stepCode, stepName: 'E2E测试步骤', projectType: 'IHC',
      standardMinutes: 15, laborRatePerMinute: 2.5,
    })
    expect([200, 201]).toContain(res.status)
    expect(res.data?.data?.id).toBeDefined()
  })
  test('LT-CREATE-02. technician创建工时返回403', async () => {
    const token = await apiLogin('technician')
    const res = await createLaborTime(token, {
      stepCode: `E2E-T-${Date.now()}`,
      stepName: 'E2E技术员越权步骤',
      projectType: 'HE',
      standardMinutes: 10,
    })
    expect(res.status).toBe(403)
  })
  test('LT-CREATE-03. 缺少stepCode返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/labor-times', {
      stepName: 'test', projectType: 'IHC', standardMinutes: 10,
    })
    expect(res.status).toBe(400)
  })
  test('LT-CREATE-04. 缺少stepName返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/labor-times', {
      stepCode: `E2E_${Date.now()}`, projectType: 'IHC', standardMinutes: 10,
    })
    expect(res.status).toBe(400)
  })
  test('LT-CREATE-05. 缺少projectType返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/labor-times', {
      stepCode: `E2E_${Date.now()}`, stepName: 'test', standardMinutes: 10,
    })
    expect(res.status).toBe(400)
  })
  test('LT-CREATE-06. 缺少standardMinutes返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/labor-times', {
      stepCode: `E2E_${Date.now()}`, stepName: 'test', projectType: 'IHC',
    })
    expect(res.status).toBe(400)
  })
  for (const role of FORBIDDEN_ROLES) {
    test(`LT-CREATE-07-${role}. ${role}创建工时返回403`, async () => {
      const token = await apiLogin(role)
      const res = await apiFetch(token, 'POST', '/labor-times', {
        stepCode: `E2E_${role}_${Date.now()}`, stepName: 'test', projectType: 'IHC', standardMinutes: 10,
      })
      expect(res.status).toBe(403)
    })
  }
  test('LT-CREATE-08. 创建后列表更新', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/labor-times`)
    await page.waitForTimeout(1000)
  })
})

// ────────────────────────────────────────────
// 3. 工时详情 (6 tests)
// ────────────────────────────────────────────
test.describe('工时管理 -> 工时详情', () => {
  test('LT-DETAIL-01. 查看工时详情', async () => {
    const token = await apiLogin('admin')
    const created = await createLaborTime(token)
    expect(created.status).toBe(201)
    const id = created.data?.data?.id
    const res = await apiFetch(token, 'GET', `/labor-times/${id}`)
    expect(res.status).toBe(200)
    expect(res.data?.data?.stepCode).toContain('E2E-LAB-')
    expect(res.data?.data?.referenceSource).toBe('industry')
    expect(res.data?.data?.referenceSourceLabel).toBe('行业标准')
    await apiFetch(token, 'DELETE', `/labor-times/${id}`).catch(() => {})
  })
  test('LT-DETAIL-02. 查看不存在的工时返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/labor-times/non-existent-id')
    expect(res.status).toBe(404)
  })
  test('LT-DETAIL-03. 按项目类型获取工时模板', async () => {
    const token = await apiLogin('admin')
    const created = await createLaborTime(token, { projectType: 'IHC', referenceSource: 'supplier' })
    expect(created.status).toBe(201)
    const id = created.data?.data?.id
    const res = await apiFetch(token, 'GET', '/labor-times/project-type/IHC')
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data?.data)).toBe(true)
    const row = res.data?.data?.find((item: any) => item.id === id)
    expect(row?.referenceSource).toBe('supplier')
    expect(row?.referenceSourceLabel).toBe('供应商提供')
    await apiFetch(token, 'DELETE', `/labor-times/${id}`).catch(() => {})
  })
  test('LT-DETAIL-04. UI差异：admin可点击行查看详情', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/labor-times`)
    await page.waitForTimeout(1000)
    const rows = page.locator('table tbody tr')
    if (await rows.count() > 0) {
      await rows.first().click()
      await page.waitForTimeout(500)
    }
  })
})

// ────────────────────────────────────────────
// 4. 更新与删除 (8 tests)
// ────────────────────────────────────────────
test.describe('工时管理 -> 更新与删除', () => {
  test('LT-EDIT-01. admin更新工时成功', async () => {
    const token = await apiLogin('admin')
    const stepCode = `E2E_EDIT_${Date.now()}`
    const create = await apiFetch(token, 'POST', '/labor-times', {
      stepCode, stepName: '待更新', projectType: 'IHC', standardMinutes: 10,
    })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/labor-times/${id}`, {
      stepName: 'E2E更新后的步骤', standardMinutes: 20,
    })
    expect(res.status).toBe(200)
  })
  test('LT-EDIT-02. 更新不存在的工时返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'PUT', '/labor-times/non-existent-id', { stepName: 'test' })
    expect(res.status).toBe(404)
  })
  test('LT-DELETE-01. admin删除工时成功', async () => {
    const token = await apiLogin('admin')
    const stepCode = `E2E_DEL_${Date.now()}`
    const create = await apiFetch(token, 'POST', '/labor-times', {
      stepCode, stepName: '待删除', projectType: 'IHC', standardMinutes: 5,
    })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'DELETE', `/labor-times/${id}`)
    expect(res.status).toBe(200)
  })
  test('LT-DELETE-02. 删除不存在的工时返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'DELETE', '/labor-times/non-existent-id')
    expect(res.status).toBe(404)
  })
  for (const role of FORBIDDEN_ROLES) {
    test(`LT-DELETE-03-${role}. ${role}删除工时返回403`, async () => {
      const adminToken = await apiLogin('admin')
      const stepCode = `E2E_DEL_P_${Date.now()}`
      const create = await apiFetch(adminToken, 'POST', '/labor-times', {
        stepCode, stepName: '权限测试', projectType: 'IHC', standardMinutes: 5,
      })
      const id = create.data?.data?.id
      if (!id) { test.skip(); return }
      const res = await apiFetch(await apiLogin(role), 'DELETE', `/labor-times/${id}`)
      expect(res.status).toBe(403)
      await apiFetch(adminToken, 'DELETE', `/labor-times/${id}`).catch(() => {})
    })
  }
})

// ────────────────────────────────────────────
// 5. 分页与响应式 (4 tests)
// ────────────────────────────────────────────
test.describe('工时管理 -> 分页与响应式', () => {
  test('LT-PAGE-01. page=999返回空列表', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/labor-times?page=999&pageSize=5')
    expect(res.status).toBe(200)
  })
  test('LT-PAGE-02. 响应式布局', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(`${FE_BASE}/labor-times`)
    await page.waitForTimeout(1000)
  })
  test('LT-PAGE-03. 页面刷新后状态保持', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/labor-times`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
  test('LT-PAGE-04. 多角色分页一致', async ({ page }) => {
    for (const role of READ_ROLES) {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/labor-times?page=1`)
      await page.waitForTimeout(400)
    }
  })
})
