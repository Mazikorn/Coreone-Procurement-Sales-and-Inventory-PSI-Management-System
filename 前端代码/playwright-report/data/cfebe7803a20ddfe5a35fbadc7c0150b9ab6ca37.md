# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios\finance-suite\cost-trend.spec.ts >> 财务成本趋势 - 查看成本趋势路径 >> 路径1-步骤5: 验证趋势标题可见
- Location: e2e\scenarios\finance-suite\cost-trend.spec.ts:62:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=成本趋势, text=趋势分析, text=趋势')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=成本趋势, text=趋势分析, text=趋势')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - complementary [ref=e4]:
        - generic [ref=e6]:
          - img [ref=e8]
          - generic [ref=e11]:
            - generic [ref=e12]: COREONE
            - generic [ref=e13]: 病理实验室耗材管理
        - navigation [ref=e14]:
          - generic [ref=e15]:
            - generic [ref=e16]: 概览
            - link "仪表盘" [ref=e17] [cursor=pointer]:
              - /url: /
              - img [ref=e18]
              - generic [ref=e23]: 仪表盘
            - link "预警中心" [ref=e24] [cursor=pointer]:
              - /url: /alerts
              - img [ref=e25]
              - generic [ref=e28]: 预警中心
          - generic [ref=e30]:
            - generic [ref=e31]: 库存作业
            - link "库存列表" [ref=e32] [cursor=pointer]:
              - /url: /inventory
              - img [ref=e33]
              - generic [ref=e37]: 库存列表
          - generic [ref=e39]:
            - generic [ref=e40]: 成本管理
            - link "成本看板" [ref=e41] [cursor=pointer]:
              - /url: /abc/dashboard
              - img [ref=e42]
              - generic [ref=e44]: 成本看板
            - link "切片成本" [ref=e45] [cursor=pointer]:
              - /url: /abc/slide-cost
              - img [ref=e46]
              - generic [ref=e50]: 切片成本
            - link "盈利分析" [ref=e51] [cursor=pointer]:
              - /url: /abc/profitability
              - img [ref=e52]
              - generic [ref=e55]: 盈利分析
            - link "收费对照" [ref=e56] [cursor=pointer]:
              - /url: /abc/fee-comparison
              - img [ref=e57]
              - generic [ref=e60]: 收费对照
            - link "成本趋势" [ref=e61] [cursor=pointer]:
              - /url: /abc/trend
              - img [ref=e62]
              - generic [ref=e65]: 成本趋势
            - link "消耗对账" [ref=e66] [cursor=pointer]:
              - /url: /reconciliation
              - img [ref=e67]
              - generic [ref=e69]: 消耗对账
            - link "物料成本分析" [ref=e70] [cursor=pointer]:
              - /url: /cost-analysis
              - img [ref=e71]
              - generic [ref=e74]: 物料成本分析
            - link "ABC配置" [ref=e75] [cursor=pointer]:
              - /url: /abc/activity-centers
              - img [ref=e76]
              - generic [ref=e79]: ABC配置
          - generic [ref=e81]:
            - generic [ref=e82]: 基础数据
            - link "物料分类" [ref=e83] [cursor=pointer]:
              - /url: /categories
              - img [ref=e84]
              - generic [ref=e89]: 物料分类
        - generic [ref=e90]:
          - generic [ref=e91]:
            - img [ref=e93]
            - generic [ref=e98]:
              - generic [ref=e99]: 财务人员
              - generic [ref=e100]: finance
          - button "收起侧边栏" [ref=e101] [cursor=pointer]:
            - img [ref=e102]
            - generic [ref=e104]: 收起侧边栏
      - generic [ref=e105]:
        - banner [ref=e106]:
          - navigation [ref=e107]:
            - link "首页" [ref=e109] [cursor=pointer]:
              - /url: /
            - generic [ref=e110]:
              - img [ref=e111]
              - link "abc" [ref=e113] [cursor=pointer]:
                - /url: /abc
            - generic [ref=e114]:
              - img [ref=e115]
              - generic [ref=e117]: 成本趋势
          - generic [ref=e118]:
            - generic [ref=e119]:
              - img [ref=e120]
              - textbox "全局搜索..." [ref=e123]
            - button [ref=e125] [cursor=pointer]:
              - img [ref=e126]
            - button "sunli 财务人员" [ref=e130] [cursor=pointer]:
              - img [ref=e132]
              - generic [ref=e135]:
                - generic [ref=e136]: sunli
                - generic [ref=e137]: 财务人员
        - main [ref=e138]:
          - generic [ref=e139]:
            - generic [ref=e140]:
              - generic [ref=e141]:
                - heading "成本趋势" [level=1] [ref=e142]
                - paragraph [ref=e143]: 切片成本与利润率的时间序列分析
              - button "导出" [ref=e144] [cursor=pointer]:
                - img [ref=e145]
                - text: 导出
            - generic [ref=e149]:
              - generic [ref=e150]:
                - button "月度" [ref=e151] [cursor=pointer]
                - button "季度" [ref=e152] [cursor=pointer]
              - combobox [ref=e153]:
                - option "全部类型" [selected]
                - option "免疫组化"
                - option "HE染色"
                - option "特殊染色"
                - option "分子病理"
                - option "细胞病理"
              - combobox [ref=e154]:
                - option "近 6 个月"
                - option "近 12 个月" [selected]
                - option "近 24 个月"
            - generic [ref=e155]:
              - heading "切片成本趋势" [level=3] [ref=e156]
              - generic [ref=e158]:
                - img [ref=e159]:
                  - generic [ref=e166]: 2026-06
                  - generic [ref=e168]:
                    - generic [ref=e170]: ¥0
                    - generic [ref=e172]: ¥20
                    - generic [ref=e174]: ¥40
                    - generic [ref=e176]: ¥60
                    - generic [ref=e178]: ¥80
                - list [ref=e240]:
                  - listitem [ref=e241]:
                    - img [ref=e242]
                  - listitem [ref=e244]:
                    - img [ref=e245]
                    - generic [ref=e247]: BOM-MP-002
                  - listitem [ref=e248]:
                    - img [ref=e249]
                    - generic [ref=e251]: BOM-IHC-CK20
                  - listitem [ref=e252]:
                    - img [ref=e253]
                    - generic [ref=e255]: BOM-IHC-CK56
                  - listitem [ref=e256]:
                    - img [ref=e257]
                    - generic [ref=e259]: BOM-IHC-CK7
                  - listitem [ref=e260]:
                    - img [ref=e261]
                    - generic [ref=e263]: BOM-IHC-TTF1
                  - listitem [ref=e264]:
                    - img [ref=e265]
                    - generic [ref=e267]: BOM-IHC-CK
                  - listitem [ref=e268]:
                    - img [ref=e269]
                    - generic [ref=e271]: BOM-MP-001
                  - listitem [ref=e272]:
                    - img [ref=e273]
                    - generic [ref=e275]: BOM-SS-001
                  - listitem [ref=e276]:
                    - img [ref=e277]
                    - generic [ref=e279]: BOM-MP-003
                  - listitem [ref=e280]:
                    - img [ref=e281]
                    - generic [ref=e283]: BOM-CYTO-001
                  - listitem [ref=e284]:
                    - img [ref=e285]
                    - generic [ref=e287]: BOM-HE-001
                  - listitem [ref=e288]:
                    - img [ref=e289]
                    - generic [ref=e291]: BOM-CYTO-002
                - generic:
                  - generic:
                    - paragraph: 2026-06
                    - list:
                      - listitem: "BOM-MP-002 : ¥26.20"
                      - listitem: "BOM-IHC-CK20 : ¥26.87"
                      - listitem: "BOM-IHC-CK56 : ¥19.73"
                      - listitem: "BOM-IHC-CK7 : ¥39.68"
                      - listitem: "BOM-IHC-TTF1 : ¥35.18"
                      - listitem: "BOM-IHC-CK : ¥8.68"
                      - listitem: "BOM-MP-001 : ¥72.02"
                      - listitem: "BOM-SS-001 : ¥22.12"
                      - listitem: "BOM-MP-003 : ¥34.85"
                      - listitem: "BOM-CYTO-001 : ¥7.99"
                      - listitem: "BOM-HE-001 : ¥55.56"
                      - listitem: "BOM-CYTO-002 : ¥13.57"
            - generic [ref=e292]:
              - heading "利润率趋势" [level=3] [ref=e293]
              - img [ref=e296]:
                - generic [ref=e303]: 2026-06
                - generic [ref=e305]:
                  - generic [ref=e307]: 0%
                  - generic [ref=e309]: 15%
                  - generic [ref=e311]: 30%
                  - generic [ref=e313]: 45%
                  - generic [ref=e315]: 60%
    - region "Notifications alt+T"
  - generic [ref=e321]: 0%
```

# Test source

```ts
  1   | import { test, expect, Page } from '@playwright/test'
  2   | import { loginAs, apiLogin, apiFetch, FE_BASE, RoleKey } from '../shared/auth'
  3   | 
  4   | /**
  5   |  * 财务成本趋势 - 场景化测试套件
  6   |  *
  7   |  * 基于"然后呢"三层追问设计：
  8   |  * 1. 场景端的然后呢：查看成本趋势 → 选择时间范围 → 验证数据更新 → 验证导出
  9   |  * 2. 操作端的然后呢：登录 → 进入成本趋势页面 → 验证图表 → 选择时间范围 → 验证API → 验证导出按钮
  10  |  * 3. 测试路径矩阵：场景树 × 操作链 × 分支条件
  11  |  */
  12  | 
  13  | // ────────────────────────────────────────────
  14  | // 测试数据准备
  15  | // ────────────────────────────────────────────
  16  | 
  17  | let adminToken = ''
  18  | let financeToken = ''
  19  | 
  20  | test.beforeAll(async () => {
  21  |   adminToken = await apiLogin('admin')
  22  |   financeToken = await apiLogin('finance')
  23  | })
  24  | 
  25  | // ────────────────────────────────────────────
  26  | // 路径1: 查看成本趋势路径
  27  | // ────────────────────────────────────────────
  28  | 
  29  | test.describe('财务成本趋势 - 查看成本趋势路径', () => {
  30  |   test('路径1-步骤1: 财务登录成功', async ({ page }) => {
  31  |     await loginAs(page, 'finance')
  32  |     await expect(page).toHaveURL(`${FE_BASE}/`)
  33  |   })
  34  | 
  35  |   test('路径1-步骤2: 进入成本趋势页面成功', async ({ page }) => {
  36  |     await loginAs(page, 'finance')
  37  |     await page.goto(`${FE_BASE}/abc/trend`)
  38  |     await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  39  |   })
  40  | 
  41  |   test('路径1-步骤3: 验证成本趋势页面加载', async ({ page }) => {
  42  |     await loginAs(page, 'finance')
  43  |     await page.goto(`${FE_BASE}/abc/trend`)
  44  |     await page.waitForTimeout(1000)
  45  | 
  46  |     // 验证页面内容可见
  47  |     await expect(page.locator('body')).toBeVisible()
  48  |   })
  49  | 
  50  |   test('路径1-步骤4: 验证图表区域可见', async ({ page }) => {
  51  |     await loginAs(page, 'finance')
  52  |     await page.goto(`${FE_BASE}/abc/trend`)
  53  |     await page.waitForTimeout(1000)
  54  | 
  55  |     // 验证图表区域可见（Recharts 渲染的 SVG 或 canvas）
  56  |     const chartArea = page.locator('svg, canvas, .recharts-wrapper, [data-testid="chart"]')
  57  |     const hasChart = await chartArea.first().isVisible().catch(() => false)
  58  |     // 至少验证页面不会崩溃
  59  |     await expect(page.locator('body')).toBeVisible()
  60  |   })
  61  | 
  62  |   test('路径1-步骤5: 验证趋势标题可见', async ({ page }) => {
  63  |     await loginAs(page, 'finance')
  64  |     await page.goto(`${FE_BASE}/abc/trend`)
  65  |     await page.waitForTimeout(1000)
  66  | 
  67  |     // 验证趋势相关标题可见
> 68  |     await expect(page.locator('text=成本趋势, text=趋势分析, text=趋势')).toBeVisible({ timeout: 5000 })
      |                                                                 ^ Error: expect(locator).toBeVisible() failed
  69  |   })
  70  | })
  71  | 
  72  | // ────────────────────────────────────────────
  73  | // 路径2: 选择时间范围路径
  74  | // ────────────────────────────────────────────
  75  | 
  76  | test.describe('财务成本趋势 - 选择时间范围路径', () => {
  77  |   test('路径2-步骤1: 财务登录成功', async ({ page }) => {
  78  |     await loginAs(page, 'finance')
  79  |     await expect(page).toHaveURL(`${FE_BASE}/`)
  80  |   })
  81  | 
  82  |   test('路径2-步骤2: 进入成本趋势页面成功', async ({ page }) => {
  83  |     await loginAs(page, 'finance')
  84  |     await page.goto(`${FE_BASE}/abc/trend`)
  85  |     await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  86  |   })
  87  | 
  88  |   test('路径2-步骤3: 查找时间范围选择器', async ({ page }) => {
  89  |     await loginAs(page, 'finance')
  90  |     await page.goto(`${FE_BASE}/abc/trend`)
  91  |     await page.waitForTimeout(1000)
  92  | 
  93  |     // 查找时间范围选择器
  94  |     const timeRangeSelect = page.locator('select[name="timeRange"], [data-testid="time-range-select"]')
  95  |     const dateRangePicker = page.locator('[data-testid="date-range-picker"], .date-range-picker')
  96  |     const hasTimeSelector = await timeRangeSelect.isVisible().catch(() => false) ||
  97  |                             await dateRangePicker.isVisible().catch(() => false)
  98  |     // 至少验证页面不会崩溃
  99  |     await expect(page.locator('body')).toBeVisible()
  100 |   })
  101 | 
  102 |   test('路径2-步骤4: 选择时间范围', async ({ page }) => {
  103 |     await loginAs(page, 'finance')
  104 |     await page.goto(`${FE_BASE}/abc/trend`)
  105 |     await page.waitForTimeout(1000)
  106 | 
  107 |     // 选择时间范围
  108 |     const timeRangeSelect = page.locator('select[name="timeRange"], [data-testid="time-range-select"]')
  109 |     if (await timeRangeSelect.isVisible().catch(() => false)) {
  110 |       await timeRangeSelect.selectOption({ index: 1 })
  111 |       await page.waitForTimeout(500)
  112 |     }
  113 |   })
  114 | 
  115 |   test('路径2-步骤5: 验证数据更新', async ({ page }) => {
  116 |     await loginAs(page, 'finance')
  117 |     await page.goto(`${FE_BASE}/abc/trend`)
  118 |     await page.waitForTimeout(1000)
  119 | 
  120 |     // 验证页面不会崩溃
  121 |     await expect(page.locator('body')).toBeVisible()
  122 |   })
  123 | })
  124 | 
  125 | // ────────────────────────────────────────────
  126 | // 路径3: 验证API数据路径
  127 | // ────────────────────────────────────────────
  128 | 
  129 | test.describe('财务成本趋势 - 验证API数据路径', () => {
  130 |   test('路径3-步骤1: 财务登录成功', async ({ page }) => {
  131 |     await loginAs(page, 'finance')
  132 |     await expect(page).toHaveURL(`${FE_BASE}/`)
  133 |   })
  134 | 
  135 |   test('路径3-步骤2: 进入成本趋势页面成功', async ({ page }) => {
  136 |     await loginAs(page, 'finance')
  137 |     await page.goto(`${FE_BASE}/abc/trend`)
  138 |     await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  139 |   })
  140 | 
  141 |   test('路径3-步骤3: API获取成本趋势数据', async ({ page }) => {
  142 |     const res = await apiFetch(financeToken, 'GET', '/abc/trend')
  143 | 
  144 |     expect(res.status).toBe(200)
  145 |   })
  146 | 
  147 |   test('路径3-步骤4: API获取切片成本趋势数据', async ({ page }) => {
  148 |     const res = await apiFetch(financeToken, 'GET', '/abc/slide-cost-trend')
  149 | 
  150 |     expect([200, 404]).toContain(res.status)
  151 |   })
  152 | 
  153 |   test('路径3-步骤5: 验证API返回数据结构', async ({ page }) => {
  154 |     const res = await apiFetch(financeToken, 'GET', '/abc/trend')
  155 | 
  156 |     expect(res.status).toBe(200)
  157 |     if (res.data?.data) {
  158 |       expect(res.data.data).toBeDefined()
  159 |     }
  160 |   })
  161 | })
  162 | 
  163 | // ────────────────────────────────────────────
  164 | // 路径4: 验证导出按钮路径
  165 | // ────────────────────────────────────────────
  166 | 
  167 | test.describe('财务成本趋势 - 验证导出按钮路径', () => {
  168 |   test('路径4-步骤1: 财务登录成功', async ({ page }) => {
```