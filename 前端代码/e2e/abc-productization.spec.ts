import { test, expect } from '@playwright/test'
import { apiFetch, apiLogin, loginAs, FE_BASE } from './scenarios/shared/auth'

type SeededAbcFlow = {
  outboundId: string
  outboundNo: string
  exceptionNo: string
  activityCenterName: string
  bomName: string
  bomId: string
  projectName: string
  projectId: string
  caseNo: string
}

function unwrapList(data: any): any[] {
  const payload = data?.data ?? data
  return payload?.list || payload?.items || payload || []
}

async function api(token: string, method: string, path: string, body?: any) {
  const res = await apiFetch(token, method, path, body)
  if (res.status >= 400 || res.data?.success === false) {
    throw new Error(`${method} ${path} failed: ${res.status} ${JSON.stringify(res.data)}`)
  }
  return res.data?.data ?? res.data
}

async function seedAbcExceptionFlow(): Promise<SeededAbcFlow> {
  const token = await apiLogin('admin')
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`

  const category = await api(token, 'POST', '/categories', {
    code: `E2EC${suffix}`,
    name: `E2E ABC分类 ${suffix}`,
    level: 1,
  })
  const location = await api(token, 'POST', '/locations', {
    name: `E2E ABC库位 ${suffix}`,
    type: 'shelf',
    zone: 'E2E',
    shelf: 'A',
    position: '01',
    capacity: 9999,
  })

  const coreMaterial = await api(token, 'POST', '/materials', {
    code: `E2EC-${suffix}`,
    name: `E2E ABC核心试剂 ${suffix}`,
    spec: '1支',
    unit: '支',
    categoryId: category.id,
    locationId: location.id,
    price: 12,
  })
  const skippedMaterial = await api(token, 'POST', '/materials', {
    code: `E2ES-${suffix}`,
    name: `E2E ABC缺货扩展试剂 ${suffix}`,
    spec: '1支',
    unit: '支',
    categoryId: category.id,
    locationId: location.id,
    price: 8,
  })
  const activityCenterName = `E2E成本池中心 ${suffix}`
  await api(token, 'POST', '/abc/activity-centers', {
    code: `E2EAC${suffix.replace(/[^a-zA-Z0-9]/g, '').slice(-12)}`,
    name: activityCenterName,
    description: 'E2E ABC 成本池归集验证',
    costDriverType: 'sample_count',
    sortOrder: -999,
  })

  await api(token, 'POST', '/inbound', {
    type: 'purchase',
    materialId: coreMaterial.id,
    batchNo: `E2E-B-${suffix}`,
    quantity: 20,
    price: 12,
    locationId: location.id,
    productionDate: new Date().toISOString().slice(0, 10),
    remark: 'E2E ABC 产品化造数',
  })

  const bomName = `E2E ABC核算BOM ${suffix}`
  const bom = await api(token, 'POST', '/boms', {
    code: `E2E-BOM-${suffix}`,
    name: bomName,
    type: 'ihc',
    materials: [
      { materialId: coreMaterial.id, usagePerSample: 1, unit: '支' },
    ],
    generalReagents: [
      { materialId: skippedMaterial.id, usagePerSample: 1, unit: '支', allocationType: 'per_slide' },
    ],
  })
  const project = await api(token, 'POST', '/projects', {
    code: `E2E-PRJ-${suffix}`,
    name: `E2E ABC项目 ${suffix}`,
    type: 'ihc',
    bomId: bom.id,
  })
  const caseNo = `E2E-CASE-${suffix}`
  const outbound = await api(token, 'POST', '/outbound/bom', {
    projectId: project.id,
    bomId: bom.id,
    sampleCount: 1,
    caseNo,
    remark: 'E2E ABC 产品化出库',
  })

  const exceptions = await api(token, 'GET', `/abc/exceptions?outboundId=${outbound.id}&status=open&pageSize=10`)
  const exception = unwrapList(exceptions)[0]
  if (!exception) {
    throw new Error(`No open cost exception generated for outbound ${outbound.id}`)
  }

  return {
    outboundId: outbound.id,
    outboundNo: outbound.outboundNo,
    exceptionNo: exception.exceptionNo,
    activityCenterName,
    bomName,
    bomId: bom.id,
    projectName: project.name || `E2E ABC项目 ${suffix}`,
    projectId: project.id,
    caseNo,
  }
}

test.describe.serial('ABC 成本核算产品化闭环', () => {
  let seeded: SeededAbcFlow

  test.beforeAll(async () => {
    seeded = await seedAbcExceptionFlow()
  })

  test('财务查看核算工作台', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/abc/dashboard`, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('h1')).toContainText('成本看板')
    await expect(page.getByText('成本期间')).toBeVisible()
    await expect(page.getByText('开放异常')).toBeVisible()
    await expect(page.getByRole('button', { name: /开始归集/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /执行重算/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /导出报表/ })).toBeVisible()
  })

  test('财务处理成本异常', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/abc/alerts?outboundId=${encodeURIComponent(seeded.outboundId)}`, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('h1')).toContainText('成本异常中心')
    await expect(page.getByText(seeded.exceptionNo)).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: /解决/ }).first().click()
    await page.locator('textarea').fill('E2E确认扩展耗材缺货，已登记成本异常处理说明')
    await page.getByRole('button', { name: '确认' }).click()
    await expect(page.locator('[data-sonner-toast]').first()).toContainText('异常已解决', { timeout: 15000 })
  })

  test('财务归集成本池并查看动因费率公式', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/abc/cost-pools`, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('h1')).toContainText('成本池')
    await expect(page.getByRole('button', { name: /自动归集/ })).toBeVisible()
    await page.getByRole('button', { name: /自动归集/ }).click()
    await expect(page.locator('[data-sonner-toast]').first()).toContainText('成本池已自动归集', { timeout: 15000 })
    await expect(page.getByRole('button', { name: /自动归集/ })).toBeEnabled({ timeout: 15000 })
    await page.getByLabel('来源').selectOption('auto_collect')
    await expect(page.getByLabel('来源')).toHaveValue('auto_collect')
    await page.getByRole('button', { name: '刷新' }).click()
    await expect(page.getByRole('columnheader', { name: '动因费率' })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: '计算公式' })).toBeVisible()
    await expect(page.getByText('自动归集').first()).toBeVisible({ timeout: 15000 })
    await expect(page.getByText(/总成本 \/ 动因量/).first()).toBeVisible()
  })

  test('财务配置BOM收费映射并触发完整性检查', async ({ page }) => {
    await loginAs(page, 'finance')
    await page.goto(`${FE_BASE}/abc/fee-mappings`, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('h1')).toContainText('收费映射配置')
    await expect(page.getByRole('button', { name: /完整性检查/ })).toBeVisible()
    await page.getByRole('button', { name: /完整性检查/ }).click()
    await expect(page.locator('[data-sonner-toast]').first()).toContainText('检查完成', { timeout: 15000 })

    await page.getByPlaceholder('BOM名称 / 编号').fill(seeded.bomName)
    await expect(page.getByText(seeded.bomName)).toBeVisible({ timeout: 15000 })
    await page.getByRole('button', { name: '配置' }).first().click()
    const dialog = page.locator('.fixed').filter({ hasText: '配置收费映射' }).last()
    await expect(dialog.locator('h2')).toContainText('配置收费映射')
    await dialog.locator('select').first().selectOption({ index: 1 })
    await dialog.getByRole('button', { name: /计算预览/ }).click()
    await expect(dialog.getByText('收费金额')).toBeVisible({ timeout: 15000 })
    await dialog.getByRole('button', { name: '保存映射' }).click()
    await expect(page.locator('[data-sonner-toast]').first()).toContainText('收费映射已保存', { timeout: 15000 })
    await expect(page.getByText('已配置').first()).toBeVisible({ timeout: 15000 })
  })

  test('仓管出库后查看成本状态', async ({ page }) => {
    await loginAs(page, 'warehouse_manager')
    await page.goto(`${FE_BASE}/outbound`, { waitUntil: 'domcontentloaded' })

    await page.getByPlaceholder('搜索出库单号/耗材名称/批号...').fill(seeded.outboundNo)
    await page.getByRole('button', { name: '查询' }).click()
    await expect(page.getByText(seeded.outboundNo)).toBeVisible({ timeout: 15000 })
    await expect(page.getByText('成本状态')).toBeVisible()
    await expect(page.getByText(/已核算|待核算|成本异常|已重算/).first()).toBeVisible()

    await page.getByRole('button', { name: '详情' }).first().click()
    const detailModal = page.locator('.fixed').filter({ hasText: '出库详情' }).last()
    await expect(detailModal.locator('h3')).toContainText('出库详情')
    await expect(detailModal.getByText('成本状态')).toBeVisible()
    await expect(detailModal.getByText('ABC总成本')).toBeVisible()
    await expect(detailModal.getByText('收费金额')).toBeVisible()
    await expect(detailModal.getByText('利润')).toBeVisible()
    await expect(detailModal.getByText('病例号')).toBeVisible()
    await expect(detailModal.getByText(seeded.caseNo)).toBeVisible()
  })

  test('仓管BOM出库时填写病例号并在详情回显', async ({ page }) => {
    const caseNo = `UI-CASE-${Date.now()}`
    await loginAs(page, 'warehouse_manager')
    await page.goto(`${FE_BASE}/outbound`, { waitUntil: 'domcontentloaded' })

    await page.getByRole('button', { name: '出库登记' }).click()
    const formModal = page.locator('.fixed').filter({ hasText: '出库登记' }).last()
    await expect(formModal.locator('h3')).toContainText('出库登记')

    await formModal.locator('[data-testid="project-select"]').click()
    await formModal.locator(`[data-testid="option-${seeded.projectId}"]`).click()
    await formModal.locator('[data-testid="bom-select"]').click()
    await formModal.locator(`[data-testid="option-${seeded.bomId}"]`).click()
    await formModal.locator('[data-testid="sample-count-input"]').fill('1')
    await formModal.locator('[data-testid="case-no-input"]').fill(caseNo)
    await formModal.locator('[data-testid="submit-btn"]').click()

    await expect(page.locator('[data-sonner-toast]').first()).toContainText('BOM出库登记成功', { timeout: 15000 })
    await page.getByRole('button', { name: '详情' }).first().click()
    const detailModal = page.locator('.fixed').filter({ hasText: '出库详情' }).last()
    await expect(detailModal.getByText('病例号')).toBeVisible()
    await expect(detailModal.getByText(caseNo)).toBeVisible()
  })

  test('主任查看可信成本看板', async ({ page }) => {
    await loginAs(page, 'pathologist')
    await page.goto(`${FE_BASE}/abc/dashboard`, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('h1')).toContainText('成本看板')
    await expect(page.getByText('总成本')).toBeVisible()
    await expect(page.getByText('平均利润率')).toBeVisible()
    await expect(page.getByRole('button', { name: /开始归集/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /执行重算/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /关账/ })).toHaveCount(0)
  })
})
