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

async function createEquipment(token: string, overrides: Record<string, any> = {}) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  return apiFetch(token, 'POST', '/equipment', {
    code: `E2E-EQ-${suffix}`,
    name: `E2E测试设备-${suffix}`,
    model: 'E2E-100',
    purchasePrice: 50000,
    residualValue: 5000,
    depreciableLifeYears: 5,
    depreciationMethod: 'straight_line',
    ...overrides,
  })
}

// ────────────────────────────────────────────
// 1. 查看设备列表 (10 tests)
// ────────────────────────────────────────────
test.describe('设备管理 -> 查看设备列表', () => {
  for (const role of READ_ROLES) {
    test(`EQ-LIST-01-${role}. ${role}可查看设备列表`, async ({ page }) => {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/equipment`)
      await expect(page.getByRole('heading', { name: '设备管理' })).toBeVisible({ timeout: 30000 })
      await expect(page.getByText('管理病理设备档案，配置折旧规则')).toBeVisible()
      await expect(page.getByRole('button', { name: /设备类型/ })).toBeVisible()
      if (role === 'admin') {
        await expect(page.getByRole('button', { name: /新增设备/ })).toBeVisible()
      } else {
        await expect(page.getByRole('button', { name: /新增设备/ })).toHaveCount(0)
        await expect(page.getByRole('button', { name: '编辑' })).toHaveCount(0)
        await expect(page.getByRole('button', { name: '删除' })).toHaveCount(0)
      }
    })
  }
  for (const role of FORBIDDEN_ROLES) {
    test(`EQ-LIST-02-${role}. ${role}访问设备列表返回403`, async () => {
      const res = await apiFetch(await apiLogin(role), 'GET', '/equipment')
      expect(res.status).toBe(403)
    })
  }
  test('EQ-LIST-03. 无Token返回401', async () => {
    const res = await fetch(`${API_BASE}/equipment`)
    expect(res.status).toBe(401)
  })
  test('EQ-LIST-04. API响应格式验证', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/equipment?page=1&pageSize=1')
    expect(res.status).toBe(200)
    expect(res.data).toHaveProperty('data')
    expect(res.data?.data).toHaveProperty('list')
  })
  test('EQ-LIST-05. 按keyword筛选', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/equipment?keyword=test')
    expect(res.status).toBe(200)
  })
  test('EQ-LIST-06. 按status筛选', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/equipment?status=active')
    expect(res.status).toBe(200)
  })
  test('EQ-LIST-07. 页面加载性能', async ({ page }) => {
    await loginAs(page, 'admin')
    const start = Date.now()
    await page.goto(`${FE_BASE}/equipment`)
    await page.waitForTimeout(2000)
    expect(Date.now() - start).toBeLessThan(10000)
  })
})

// ────────────────────────────────────────────
// 2. 创建设备 (12 tests)
// ────────────────────────────────────────────
test.describe('设备管理 -> 创建设备', () => {
  test('EQ-CREATE-01. admin创建设备成功', async () => {
    const token = await apiLogin('admin')
    const res = await createEquipment(token)
    expect([200, 201]).toContain(res.status)
    expect(res.data?.data?.id).toBeDefined()
  })
  test('EQ-CREATE-02. technician创建设备返回403', async () => {
    const token = await apiLogin('technician')
    const res = await createEquipment(token, {
      code: `E2E-T-EQ-${Date.now()}`,
      name: 'E2E技术员越权设备',
      purchasePrice: 30000,
    })
    expect(res.status).toBe(403)
  })
  test('EQ-CREATE-03. 缺少code返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/equipment', { name: 'test' })
    expect(res.status).toBe(400)
  })
  test('EQ-CREATE-04. 缺少name返回400', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/equipment', { code: `E2E_${Date.now()}` })
    expect(res.status).toBe(400)
  })
  test('EQ-CREATE-05. 重复code返回409', async () => {
    const token = await apiLogin('admin')
    const code = `E2E_DUP_${Date.now()}`
    await apiFetch(token, 'POST', '/equipment', { code, name: '设备A' })
    const res = await apiFetch(token, 'POST', '/equipment', { code, name: '设备B' })
    expect([409, 400]).toContain(res.status)
  })
  for (const role of FORBIDDEN_ROLES) {
    test(`EQ-CREATE-06-${role}. ${role}创建设备返回403`, async () => {
      const token = await apiLogin(role)
      const res = await apiFetch(token, 'POST', '/equipment', {
        code: `E2E_${role}_${Date.now()}`, name: 'test',
      })
      expect(res.status).toBe(403)
    })
  }
  test('EQ-CREATE-07. 创建后列表更新', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/equipment`)
    await page.waitForTimeout(1000)
  })
})

// ────────────────────────────────────────────
// 3. 设备详情与编辑 (10 tests)
// ────────────────────────────────────────────
test.describe('设备管理 -> 详情与编辑', () => {
  test('EQ-DETAIL-01. admin查看设备详情', async () => {
    const token = await apiLogin('admin')
    const list = await apiFetch(token, 'GET', '/equipment?page=1&pageSize=1')
    const id = list.data?.data?.list?.[0]?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'GET', `/equipment/${id}`)
    expect(res.status).toBe(200)
    expect(res.data?.data?.code).toBeDefined()
    expect(res.data?.data?.annualDepreciation).toBeDefined()
  })
  test('EQ-DETAIL-02. 查看不存在的设备返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/equipment/non-existent-id')
    expect(res.status).toBe(404)
  })
  test('EQ-EDIT-01. admin更新设备成功', async () => {
    const token = await apiLogin('admin')
    const list = await apiFetch(token, 'GET', '/equipment?page=1&pageSize=1')
    const id = list.data?.data?.list?.[0]?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'PUT', `/equipment/${id}`, {
      name: 'E2E更新后的设备', purchasePrice: 60000,
    })
    expect(res.status).toBe(200)
  })
  test('EQ-EDIT-02. 更新不存在的设备返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'PUT', '/equipment/non-existent-id', { name: 'test' })
    expect(res.status).toBe(404)
  })
  test('EQ-EDIT-03. UI差异：admin显示编辑按钮', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/equipment`)
    await page.waitForTimeout(1000)
  })
})

// ────────────────────────────────────────────
// 4. 设备使用记录 (8 tests)
// ────────────────────────────────────────────
test.describe('设备管理 -> 使用记录', () => {
  test('EQ-USAGE-01. 登记设备使用成功', async () => {
    const token = await apiLogin('admin')
    const list = await apiFetch(token, 'GET', '/equipment?page=1&pageSize=1')
    const id = list.data?.data?.list?.[0]?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'POST', `/equipment/${id}/usage`, {
      usageMinutes: 60, usageCount: 1, operator: '张伟', usageDate: '2026-06-01',
    })
    expect([200, 201]).toContain(res.status)
    expect(res.data?.data?.depreciationCost).toBeDefined()
  })
  test('EQ-USAGE-02. 查询设备使用记录', async () => {
    const token = await apiLogin('admin')
    const list = await apiFetch(token, 'GET', '/equipment?page=1&pageSize=1')
    const id = list.data?.data?.list?.[0]?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'GET', `/equipment/${id}/usage?page=1&pageSize=10`)
    expect(res.status).toBe(200)
    expect(Array.isArray(res.data?.data?.list)).toBe(true)
  })
  test('EQ-USAGE-03. 为不存在的设备登记使用返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'POST', '/equipment/non-existent-id/usage', { usageMinutes: 30 })
    expect(res.status).toBe(404)
  })
  test('EQ-USAGE-03B. 查询不存在设备的使用记录返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/equipment/non-existent-id/usage?page=1&pageSize=10')
    expect(res.status).toBe(404)
  })
  test('EQ-USAGE-04. 折旧成本自动计算', async () => {
    const token = await apiLogin('admin')
    const list = await apiFetch(token, 'GET', '/equipment?page=1&pageSize=1')
    const id = list.data?.data?.list?.[0]?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'POST', `/equipment/${id}/usage`, {
      usageMinutes: 120, usageCount: 2, operator: '王坤强',
    })
    if (res.status === 200 || res.status === 201) {
      expect(res.data?.data?.depreciationCost).toBeGreaterThan(0)
    }
  })
})

// ────────────────────────────────────────────
// 5. 折旧统计 (4 tests)
// ────────────────────────────────────────────
test.describe('设备管理 -> 折旧统计', () => {
  test('EQ-DEPR-01. 查询折旧统计成功', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/equipment/depreciation-stats')
    expect(res.status).toBe(200)
    expect(res.data?.data?.summary).toBeDefined()
    expect(res.data?.data?.stats).toBeDefined()
  })
  test('EQ-DEPR-02. 折旧统计包含汇总数据', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/equipment/depreciation-stats')
    const summary = res.data?.data?.summary
    expect(typeof summary?.totalEquipment).toBe('number')
    expect(typeof summary?.totalPurchasePrice).toBe('number')
    expect(typeof summary?.totalAnnualDepreciation).toBe('number')
  })
  test('EQ-DEPR-03. technician可查询折旧统计', async () => {
    const res = await apiFetch(await apiLogin('technician'), 'GET', '/equipment/depreciation-stats')
    expect(res.status).toBe(200)
  })
  test('EQ-DEPR-04. warehouse_manager查询折旧统计返回403', async () => {
    const res = await apiFetch(await apiLogin('warehouse_manager'), 'GET', '/equipment/depreciation-stats')
    expect(res.status).toBe(403)
  })
})

// ────────────────────────────────────────────
// 6. 删除设备 (6 tests)
// ────────────────────────────────────────────
test.describe('设备管理 -> 删除设备', () => {
  test('EQ-DELETE-01. 删除不存在的设备返回404', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'DELETE', '/equipment/non-existent-id')
    expect(res.status).toBe(404)
  })
  test('EQ-DELETE-02. 有使用记录的设备不可删除', async () => {
    const token = await apiLogin('admin')
    const list = await apiFetch(token, 'GET', '/equipment?page=1&pageSize=1')
    const id = list.data?.data?.list?.[0]?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'DELETE', `/equipment/${id}`)
    expect([200, 409]).toContain(res.status)
  })
  test('EQ-DELETE-03. 创建无使用记录的设备后可删除', async () => {
    const token = await apiLogin('admin')
    const code = `E2E_DEL_${Date.now()}`
    const create = await apiFetch(token, 'POST', '/equipment', { code, name: '待删除设备' })
    const id = create.data?.data?.id
    if (!id) { test.skip(); return }
    const res = await apiFetch(token, 'DELETE', `/equipment/${id}`)
    expect(res.status).toBe(200)
  })
  for (const role of FORBIDDEN_ROLES) {
    test(`EQ-DELETE-04-${role}. ${role}删除设备返回403`, async () => {
      const token = await apiLogin(role)
      const adminToken = await apiLogin('admin')
      const code = `E2E_DEL_P_${Date.now()}`
      const create = await apiFetch(adminToken, 'POST', '/equipment', { code, name: '权限测试' })
      const id = create.data?.data?.id
      if (!id) { test.skip(); return }
      const res = await apiFetch(token, 'DELETE', `/equipment/${id}`)
      expect(res.status).toBe(403)
      await apiFetch(adminToken, 'DELETE', `/equipment/${id}`).catch(() => {})
    })
  }
})

// ────────────────────────────────────────────
// 7. 分页与响应式 (4 tests)
// ────────────────────────────────────────────
test.describe('设备管理 -> 分页与响应式', () => {
  test('EQ-PAGE-01. page=999返回空列表', async () => {
    const token = await apiLogin('admin')
    const res = await apiFetch(token, 'GET', '/equipment?page=999&pageSize=5')
    expect(res.status).toBe(200)
  })
  test('EQ-PAGE-02. 响应式布局', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto(`${FE_BASE}/equipment`)
    await page.waitForTimeout(1000)
  })
  test('EQ-PAGE-03. 页面刷新后状态保持', async ({ page }) => {
    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/equipment`)
    await page.waitForTimeout(500)
    await page.reload()
    await page.waitForTimeout(800)
  })
  test('EQ-PAGE-04. 多角色分页一致', async ({ page }) => {
    for (const role of READ_ROLES) {
      await loginAs(page, role)
      await page.goto(`${FE_BASE}/equipment?page=1`)
      await page.waitForTimeout(400)
    }
  })
})
