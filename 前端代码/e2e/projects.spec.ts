import { test, expect } from '@playwright/test'
import { apiFetch, apiLogin, FE_BASE, loginAs } from './scenarios/shared/auth'

test.describe('检测服务状态影响检查', () => {
  let token = ''
  let projectId = ''

  test.beforeEach(async () => {
    token = await apiLogin('admin')
  })

  test.afterEach(async () => {
    if (projectId) {
      await apiFetch(token, 'DELETE', `/projects/${projectId}`)
      projectId = ''
    }
  })

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
})
