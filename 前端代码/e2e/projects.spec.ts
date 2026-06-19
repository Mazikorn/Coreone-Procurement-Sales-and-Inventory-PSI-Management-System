import { test, expect } from '@playwright/test'
import { apiFetch, apiLogin, FE_BASE, loginAs } from './scenarios/shared/auth'

test.describe('检测服务状态影响检查', () => {
  let token = ''
  let projectId = ''
  let copiedProjectId = ''
  let bomId = ''
  let materialId = ''
  let inboundId = ''
  let outboundId = ''

  test.beforeEach(async () => {
    token = await apiLogin('admin')
  })

  test.afterEach(async () => {
    if (outboundId) {
      await apiFetch(token, 'DELETE', `/outbound/${outboundId}`)
      outboundId = ''
    }
    if (copiedProjectId) {
      await apiFetch(token, 'DELETE', `/projects/${copiedProjectId}`)
      copiedProjectId = ''
    }
    if (projectId) {
      await apiFetch(token, 'DELETE', `/projects/${projectId}`)
      projectId = ''
    }
    if (bomId) {
      await apiFetch(token, 'DELETE', `/boms/${bomId}`)
      bomId = ''
    }
    if (inboundId) {
      await apiFetch(token, 'DELETE', `/inbound/${inboundId}`)
      inboundId = ''
    }
    if (materialId) {
      await apiFetch(token, 'DELETE', `/materials/${materialId}`)
      materialId = ''
    }
  })

  async function createProjectBom(suffix: string) {
    const categories = await apiFetch(token, 'GET', '/categories?page=1&pageSize=1')
    const categoryId = categories.data?.data?.list?.[0]?.id
    expect(categoryId, '复制检测服务需要至少一个物料分类').toBeTruthy()

    const material = await apiFetch(token, 'POST', '/materials', {
      code: `E2E-PRJ-COPY-MAT-${suffix}`,
      name: `E2E项目复制物料-${suffix}`,
      unit: '瓶',
      categoryId,
      price: 9.5,
    })
    expect(material.status, `创建项目复制物料失败: ${JSON.stringify(material.data)}`).toBe(201)
    materialId = material.data?.data?.id

    const bom = await apiFetch(token, 'POST', '/boms', {
      code: `E2E-PRJ-COPY-BOM-${suffix}`,
      name: `E2E项目复制BOM-${suffix}`,
      type: 'ihc',
      materials: [{ materialId, usagePerSample: 1, unit: '瓶' }],
    })
    expect(bom.status, `创建项目复制BOM失败: ${JSON.stringify(bom.data)}`).toBe(201)
    bomId = bom.data?.data?.id
    expect(bomId).toBeTruthy()
  }

  async function createProjectOutboundHistory(suffix: string) {
    const categories = await apiFetch(token, 'GET', '/categories?page=1&pageSize=1')
    const categoryId = categories.data?.data?.list?.[0]?.id
    expect(categoryId, '历史项目测试需要至少一个物料分类').toBeTruthy()
    const locations = await apiFetch(token, 'GET', '/locations?page=1&pageSize=1')
    const locationId = locations.data?.data?.list?.[0]?.id
    expect(locationId, '历史项目测试需要至少一个库位').toBeTruthy()

    const material = await apiFetch(token, 'POST', '/materials', {
      code: `E2E-PRJ-HIS-MAT-${suffix}`,
      name: `E2E项目历史物料-${suffix}`,
      unit: '瓶',
      categoryId,
      price: 8,
    })
    expect(material.status, `创建项目历史物料失败: ${JSON.stringify(material.data)}`).toBe(201)
    materialId = material.data?.data?.id
    expect(materialId).toBeTruthy()

    const inbound = await apiFetch(token, 'POST', '/inbound', {
      type: 'purchase',
      materialId,
      batchNo: `E2E-PRJ-HIS-BATCH-${suffix}`,
      quantity: 5,
      locationId,
      remark: `E2E项目历史入库-${suffix}`,
    })
    expect(inbound.status, `创建项目历史入库失败: ${JSON.stringify(inbound.data)}`).toBe(201)
    inboundId = inbound.data?.data?.id
    expect(inboundId).toBeTruthy()
    const batches = await apiFetch(token, 'GET', `/depletion/batches/${materialId}`)
    const batchId = batches.data?.data?.list?.find((batch: any) => batch.batch_no === `E2E-PRJ-HIS-BATCH-${suffix}`)?.id
    expect(batchId, `未找到项目历史测试批次: ${JSON.stringify(batches.data)}`).toBeTruthy()

    const outbound = await apiFetch(token, 'POST', '/outbound', {
      type: 'project',
      projectId,
      items: [{ materialId, batchId, quantity: 1 }],
      remark: `E2E项目历史出库-${suffix}`,
    })
    expect(outbound.status, `创建项目历史出库失败: ${JSON.stringify(outbound.data)}`).toBe(201)
    outboundId = outbound.data?.data?.id
    expect(outboundId).toBeTruthy()
  }

  test('PROJECT-EDIT-STATUS-01. 编辑弹窗变更状态必须先展示影响检查并确认后更新', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const code = `E2E-PRJ-STATUS-${suffix}`
    const created = await apiFetch(token, 'POST', '/projects', {
      code,
      name: `E2E状态检查项目-${suffix}`,
      type: 'he',
      cycle: '1天',
      manager: 'E2E',
      status: 'active',
    })
    expect(created.status, `创建检测服务失败: ${JSON.stringify(created.data)}`).toBe(201)
    projectId = created.data?.data?.id
    expect(projectId).toBeTruthy()

    const putBodies: string[] = []
    await page.route(`**/api/v1/projects/${projectId}`, async route => {
      if (route.request().method() === 'PUT') {
        putBodies.push(route.request().postData() || '')
      }
      await route.continue()
    })

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/projects?keyword=${encodeURIComponent(code)}`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('tbody tr').filter({ hasText: code }).first()
    await expect(row).toBeVisible({ timeout: 15000 })

    await row.getByRole('button', { name: '编辑' }).click()
    await expect(page.getByText('编辑检测服务')).toBeVisible({ timeout: 10000 })
    await page.getByRole('radio', { name: '已停用' }).check()

    const checkResponse = page.waitForResponse(res =>
      res.url().includes(`/api/v1/projects/${projectId}/check-status`) &&
      res.request().method() === 'GET'
    )
    await page.getByRole('button', { name: '保存' }).click()
    await expect((await checkResponse).status()).toBe(200)

    const impactDialog = page.getByRole('dialog', { name: '停用检测服务' })
    await expect(impactDialog).toBeVisible({ timeout: 10000 })
    await expect(impactDialog.getByText('停用后该检测服务不能用于新出库')).toBeVisible()
    expect(putBodies).toHaveLength(0)

    const updateResponse = page.waitForResponse(res =>
      res.url().endsWith(`/api/v1/projects/${projectId}`) &&
      res.request().method() === 'PUT'
    )
    await impactDialog.getByRole('button', { name: '确认停用' }).click()
    await expect((await updateResponse).status()).toBe(200)

    const detail = await apiFetch(token, 'GET', `/projects/${projectId}`)
    expect(detail.status).toBe(200)
    expect(detail.data?.data?.status).toBe('inactive')
  })

  test('PROJECT-COPY-01. 复制检测服务可修改编号和描述且默认复制BOM绑定', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    await createProjectBom(suffix)
    const code = `E2E-PRJ-COPY-${suffix}`
    const created = await apiFetch(token, 'POST', '/projects', {
      code,
      name: `E2E复制源项目-${suffix}`,
      type: 'ihc',
      cycle: '2天',
      manager: 'E2E',
      status: 'active',
      description: '复制源描述',
      bomId,
    })
    expect(created.status, `创建复制源检测服务失败: ${JSON.stringify(created.data)}`).toBe(201)
    projectId = created.data?.data?.id
    expect(projectId).toBeTruthy()

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/projects?keyword=${encodeURIComponent(code)}`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('tbody tr').filter({ hasText: code }).first()
    await expect(row).toBeVisible({ timeout: 15000 })

    await row.getByRole('button', { name: '复制' }).click()
    await expect(page.getByText('复制检测服务')).toBeVisible({ timeout: 10000 })

    const copiedCode = `${code}-MANUAL`
    await page.getByLabel(/新服务编号/).fill(copiedCode)
    await page.getByLabel(/新服务描述/).fill('复制后调整描述')

    const createResponsePromise = page.waitForResponse(res =>
      res.url().endsWith('/api/v1/projects') &&
      res.request().method() === 'POST'
    )
    await page.getByRole('button', { name: '确认复制' }).click()
    const createResponse = await createResponsePromise
    expect(createResponse.status()).toBe(201)
    const createBody = createResponse.request().postDataJSON()
    expect(createBody).toMatchObject({
      code: copiedCode,
      description: '复制后调整描述',
      bomId,
    })

    const createdCopy = await createResponse.json()
    copiedProjectId = createdCopy.data?.id || createdCopy.data?.data?.id
    expect(copiedProjectId).toBeTruthy()

    const detail = await apiFetch(token, 'GET', `/projects/${copiedProjectId}`)
    expect(detail.status).toBe(200)
    expect(detail.data?.data).toMatchObject({
      code: copiedCode,
      description: '复制后调整描述',
      bomId,
    })
  })

  test('PROJECT-IMPORT-01. 导入检测服务时停用BOM必须在预校验阶段拦截', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    await createProjectBom(suffix)
    const disabledBom = await apiFetch(token, 'PATCH', `/boms/${bomId}/status`, { status: 'inactive' })
    expect(disabledBom.status, `停用导入测试BOM失败: ${JSON.stringify(disabledBom.data)}`).toBe(200)

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/projects`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: '导入' }).click()
    await expect(page.getByText('导入检测服务')).toBeVisible({ timeout: 10000 })

    const postBodies: string[] = []
    await page.route('**/api/v1/projects', async route => {
      if (route.request().method() === 'POST') {
        postBodies.push(route.request().postData() || '')
      }
      await route.continue()
    })

    const csv = [
      'code,name,type,cycle,manager,status,description,bomId',
      `E2E-PRJ-IMPORT-${suffix},停用BOM导入服务,ihc,1天,E2E,启用,应被拦截,${bomId}`,
    ].join('\n')
    await page.locator('input[type="file"]').setInputFiles({
      name: `project-import-inactive-bom-${suffix}.csv`,
      mimeType: 'text/csv',
      buffer: Buffer.from(csv, 'utf8'),
    })

    await expect(page.getByText(`第 2 行BOM ID不存在或未启用：${bomId}`)).toBeVisible({ timeout: 10000 })
    await expect(page.getByRole('button', { name: /^开始导入/ })).toBeDisabled()
    expect(postBodies).toHaveLength(0)
  })

  test('PROJECT-EDIT-TYPE-01. 已有出库历史的检测服务编辑时不得更换服务类型', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const code = `E2E-PRJ-TYPE-HIS-${suffix}`
    const created = await apiFetch(token, 'POST', '/projects', {
      code,
      name: `E2E历史类型项目-${suffix}`,
      type: 'he',
      cycle: '1天',
      manager: 'E2E',
      status: 'active',
    })
    expect(created.status, `创建历史类型检测服务失败: ${JSON.stringify(created.data)}`).toBe(201)
    projectId = created.data?.data?.id
    expect(projectId).toBeTruthy()
    await createProjectOutboundHistory(suffix)

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/projects?keyword=${encodeURIComponent(code)}`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('tbody tr').filter({ hasText: code }).first()
    await expect(row).toBeVisible({ timeout: 15000 })

    await row.getByRole('button', { name: '编辑' }).click()
    await expect(page.getByText('编辑检测服务')).toBeVisible({ timeout: 10000 })
    const editDialog = page.locator('.fixed').filter({ hasText: '编辑检测服务' }).first()
    await editDialog.getByText('病理技术-HE制片').click()
    await editDialog.getByTestId('option-ihc').click()

    const updateResponse = page.waitForResponse(res =>
      res.url().endsWith(`/api/v1/projects/${projectId}`) &&
      res.request().method() === 'PUT'
    )
    await page.getByRole('button', { name: '保存' }).click()
    await expect((await updateResponse).status()).toBe(409)

    const detail = await apiFetch(token, 'GET', `/projects/${projectId}`)
    expect(detail.status).toBe(200)
    expect(detail.data?.data?.type).toBe('he')
  })

  test('PROJECT-EDIT-CODE-01. 已有出库历史的检测服务编辑时不得篡改只读服务编号', async ({ page }) => {
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const code = `E2E-PRJ-CODE-HIS-${suffix}`
    const created = await apiFetch(token, 'POST', '/projects', {
      code,
      name: `E2E历史编号项目-${suffix}`,
      type: 'he',
      cycle: '1天',
      manager: 'E2E',
      status: 'active',
    })
    expect(created.status, `创建历史编号检测服务失败: ${JSON.stringify(created.data)}`).toBe(201)
    projectId = created.data?.data?.id
    expect(projectId).toBeTruthy()
    await createProjectOutboundHistory(suffix)

    await loginAs(page, 'admin')
    await page.goto(`${FE_BASE}/projects?keyword=${encodeURIComponent(code)}`, { waitUntil: 'domcontentloaded' })
    const row = page.locator('tbody tr').filter({ hasText: code }).first()
    await expect(row).toBeVisible({ timeout: 15000 })

    await row.getByRole('button', { name: '编辑' }).click()
    await expect(page.getByText('编辑检测服务')).toBeVisible({ timeout: 10000 })
    const editDialog = page.locator('.fixed').filter({ hasText: '编辑检测服务' }).first()
    const codeInput = editDialog.locator(`input[value="${code}"]`)
    await expect(codeInput).toHaveAttribute('readonly', '')
    await expect(codeInput).toBeVisible()
    await editDialog.locator(`input[value="E2E历史编号项目-${suffix}"]`).fill(`E2E历史编号项目-${suffix}-更新`)

    await page.route(`**/api/v1/projects/${projectId}`, async route => {
      if (route.request().method() !== 'PUT') {
        await route.continue()
        return
      }
      const body = JSON.parse(route.request().postData() || '{}')
      await route.continue({
        headers: {
          ...route.request().headers(),
          'content-type': 'application/json',
        },
        postData: JSON.stringify({
          ...body,
          code: `${code}-RENAMED`,
        }),
      })
    })

    const updateResponse = page.waitForResponse(res =>
      res.url().endsWith(`/api/v1/projects/${projectId}`) &&
      res.request().method() === 'PUT'
    )
    await page.getByRole('button', { name: '保存' }).click()
    await expect((await updateResponse).status()).toBe(409)

    const detail = await apiFetch(token, 'GET', `/projects/${projectId}`)
    expect(detail.status).toBe(200)
    expect(detail.data?.data?.code).toBe(code)
  })
})
