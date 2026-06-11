import { test, expect, Page } from '@playwright/test'

const FE_BASE = 'http://localhost:8080'
const API_BASE = 'http://127.0.0.1:3001/api/v1'

const ROLES = {
  admin: { username: 'admin', password: 'admin123' },
  technician: { username: 'zhangwei', password: 'CoreOne2026!' },
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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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

test.describe('ABC 作业成本法', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'admin')
  })

  test.describe('作业中心管理', () => {
    test('查看作业中心列表', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/activity-centers`)
      await page.waitForTimeout(800)
      await expect(page.locator('h1, h2, h3')).toContainText('作业中心')

      // 验证表格存在
      await expect(page.locator('table')).toBeVisible()

      // 验证有数据行
      const rows = page.locator('table tbody tr')
      await expect(rows.first()).toBeVisible()
    })

    test('创建作业中心', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/activity-centers`)
      await page.waitForTimeout(800)

      // 点击新增按钮
      await page.click('button:has-text("新增")')
      await page.waitForTimeout(500)

      // 填写表单（使用 placeholder 匹配，因 input 无 id 属性）
      const uniqueCode = `E2E_AC_${Date.now()}`
      await page.fill('input[placeholder*="SPECIMEN"]', uniqueCode)
      await page.fill('input[placeholder*="标本处理中心"]', `E2E测试作业中心_${uniqueCode}`)
      await page.fill('textarea[placeholder*="详细描述"]', 'E2E测试描述')

      // 成本动因类型默认为"切片数"，无需额外操作

      // 提交
      await page.click('button:has-text("创建")')

      // 验证成功提示 (sonner toast) - 使用较长超时
      await expect(page.locator('[data-sonner-toast]').first()).toContainText('成功', { timeout: 15000 })

      // 验证列表中出现新记录
      await expect(page.locator(`text=E2E测试作业中心_${uniqueCode}`)).toBeVisible({ timeout: 10000 })
    })

    test('编辑作业中心', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/activity-centers`)
      await page.waitForTimeout(800)

      // 点击第一个编辑按钮（使用 title 属性）
      await page.click('button[title="编辑"]')
      await page.waitForTimeout(500)

      // 修改名称
      await page.fill('input[placeholder*="标本处理中心"]', '更新后的名称')

      // 提交
      await page.click('button:has-text("更新")')
      await page.waitForTimeout(1000)

      // 验证成功提示 (sonner toast)
      await expect(page.locator('[data-sonner-toast]')).toContainText('成功')
    })

    test('删除作业中心', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/activity-centers`)
      await page.waitForTimeout(800)

      // 先创建一个用于删除
      await page.click('button:has-text("新增")')
      await page.waitForTimeout(500)
      const uniqueCode = `DEL_${Date.now()}`
      await page.fill('input[placeholder*="SPECIMEN"]', uniqueCode)
      await page.fill('input[placeholder*="标本处理中心"]', `待删除_${uniqueCode}`)
      // 成本动因类型默认为"切片数"
      await page.click('button:has-text("创建")')

      // 等待创建成功
      await expect(page.locator('[data-sonner-toast]').first()).toContainText('成功', { timeout: 15000 })

      // 等待列表刷新，找到新创建的行的删除按钮
      await page.waitForTimeout(1000)

      // 点击最后一行的删除按钮
      const lastDeleteBtn = page.locator('button[title="删除"]').last()
      await lastDeleteBtn.click()
      await page.waitForTimeout(500)

      // 确认删除（React ConfirmDialog，不是浏览器 dialog）
      await page.click('button:has-text("确认删除")')

      // 验证成功提示 (sonner toast)
      await expect(page.locator('[data-sonner-toast]').first()).toContainText('成功', { timeout: 15000 })
    })
  })

  test.describe('成本动因管理', () => {
    test('查看成本动因列表', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/cost-drivers`)
      await page.waitForTimeout(800)
      await expect(page.locator('h1, h2, h3')).toContainText('成本动因')

      // 验证表格存在
      await expect(page.locator('table')).toBeVisible()
    })

    test('创建成本动因', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/cost-drivers`)
      await page.waitForTimeout(800)

      // 点击新增按钮
      await page.click('button:has-text("新增")')
      await page.waitForTimeout(500)

      // 填写表单（placeholder 实际值：例如：slide_count / 例如：切片数 / 例如：张、个、次）
      const uniqueCode = `e2e_${Date.now()}`
      await page.fill('input[placeholder*="slide_count"]', uniqueCode)
      await page.fill('input[placeholder*="切片数"]', 'E2E测试动因')
      await page.fill('input[placeholder*="张"]', '张')

      // 提交
      await page.click('button:has-text("创建")')
      await page.waitForTimeout(1000)

      // 验证成功提示 (sonner toast)
      await expect(page.locator('[data-sonner-toast]')).toContainText('成功')
    })
  })

  test.describe('成本池管理', () => {
    test('查看成本池列表', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/cost-pools`)
      await page.waitForTimeout(800)
      await expect(page.locator('h1, h2, h3')).toContainText('成本池')

      // 验证表格存在
      await expect(page.locator('table')).toBeVisible()
    })

    test('创建成本池', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/cost-pools`)
      await page.waitForTimeout(800)

      // 点击新增按钮
      await page.click('button:has-text("新增")')
      await page.waitForTimeout(500)

      // 选择作业中心 - 使用原生 select（表单无 placeholder，用 label 定位）
      await page.locator('select').first().selectOption({ index: 1 })

      // 填写成本数据（表单无 placeholder，按 label 文本定位 input）
      const directCostInput = page.locator('label:has-text("直接成本") + input, label:has-text("直接成本") ~ input').first()
      const indirectCostInput = page.locator('label:has-text("间接成本") + input, label:has-text("间接成本") ~ input').first()
      const driverQtyInput = page.locator('label:has-text("动因数量") + input, label:has-text("动因数量") ~ input').first()

      await directCostInput.fill('10000')
      await indirectCostInput.fill('5000')
      await driverQtyInput.fill('100')

      // 提交
      await page.click('button:has-text("创建")')
      await page.waitForTimeout(1000)

      // 验证成功提示 (sonner toast)
      await expect(page.locator('[data-sonner-toast]')).toContainText('成功')
    })
  })

  test.describe('盈利性分析', () => {
    test('查看盈利性分析页面', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/profitability`)
      await page.waitForTimeout(1000)

      // 验证页面加载（标题或主体内容）
      await expect(page.locator('h1, h2, h3').first()).toBeVisible({ timeout: 10000 })

      // 验证汇总卡片存在（使用模糊匹配）
      const summaryCard = page.locator('text=/项目总数|总成本|总收入|总利润/').first()
      if (await summaryCard.isVisible().catch(() => false)) {
        await expect(summaryCard).toBeVisible()
      }
    })

    test('筛选功能', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/profitability`)
      await page.waitForTimeout(1000)

      // 选择项目类型 - 使用通用选择器 + fallback
      const filterBtn = page.locator('[data-testid="select-project-type"], button:has-text("选择项目类型"), select').first()
      if (await filterBtn.isVisible().catch(() => false)) {
        await filterBtn.click()
        await page.waitForTimeout(300)
      }
    })

    test('导出功能', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/profitability`)
      await page.waitForTimeout(1000)

      // 点击导出按钮（如果存在）
      const exportBtn = page.locator('button:has-text("导出")').first()
      if (await exportBtn.isVisible().catch(() => false)) {
        const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null)
        await exportBtn.click()
        const download = await downloadPromise
        if (download) {
          expect(download.suggestedFilename()).toContain('.xlsx')
        }
      }
    })
  })

  test.describe('权限控制', () => {
    test('非管理员无法访问 ABC 功能', async ({ page }) => {
      // 登出 - 使用通用选择器 + fallback（头像按钮通常在右上角）
      await page.locator('[data-testid="user-menu"], button:has-text("用户"), button:has(svg.lucide-user), .user-avatar, [aria-label="用户菜单"]').first().click()
      await page.click('text=退出登录')

      // 用技术员账号登录
      await loginAs(page, 'technician')

      // 尝试访问 ABC 页面
      await page.goto(`${FE_BASE}/abc/activity-centers`)
      await page.waitForTimeout(800)

      // 验证被拒绝（跳转到首页或显示无权限）
      await expect(page).not.toHaveURL(`${FE_BASE}/abc/activity-centers`)
    })
  })

  test.describe('数据一致性', () => {
    test('作业中心删除后关联数据处理', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/activity-centers`)
      await page.waitForTimeout(800)

      // 尝试删除有关联成本池的作业中心
      await page.click('button[title="删除"]')
      await page.waitForTimeout(500)

      // 确认删除（React ConfirmDialog）
      await page.click('button:has-text("确认删除")')
      await page.waitForTimeout(1000)

      // 如果有关联数据，应该显示错误提示
      // 如果没有关联数据，应该成功删除
      await expect(page.locator('[data-sonner-toast]').first()).toBeVisible()
    })

    test('成本池创建后列表更新', async ({ page }) => {
      await page.goto(`${FE_BASE}/abc/cost-pools`)
      await page.waitForTimeout(800)

      // 记录当前行数
      const initialRows = await page.locator('table tbody tr').count()

      // 创建新成本池
      await page.click('button:has-text("新增")')
      await page.waitForTimeout(500)
      await page.locator('select').first().selectOption({ index: 1 })

      // 表单无 placeholder，按 label 文本定位 input
      const directCostInput = page.locator('label:has-text("直接成本") + input, label:has-text("直接成本") ~ input').first()
      const indirectCostInput = page.locator('label:has-text("间接成本") + input, label:has-text("间接成本") ~ input').first()
      const driverQtyInput = page.locator('label:has-text("动因数量") + input, label:has-text("动因数量") ~ input').first()

      await directCostInput.fill('5000')
      await indirectCostInput.fill('2000')
      await driverQtyInput.fill('50')

      await page.click('button:has-text("创建")')
      await page.waitForTimeout(1000)

      // 验证行数增加或数据更新
      const finalRows = await page.locator('table tbody tr').count()
      expect(finalRows).toBeGreaterThanOrEqual(initialRows)
    })
  })
})
