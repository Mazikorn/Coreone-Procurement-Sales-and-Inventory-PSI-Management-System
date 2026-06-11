# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios\technician-suite\view-outbound-records.spec.ts >> 技术员查看出库记录 - 出库详情路径 >> 路径2-步骤3: 验证出库列表有数据
- Location: e2e\scenarios\technician-suite\view-outbound-records.spec.ts:139:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('table tbody tr').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('table tbody tr').first()

```

# Page snapshot

```yaml
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
        - generic [ref=e76]:
          - generic [ref=e77]: 基础数据
          - link "物料管理" [ref=e78] [cursor=pointer]:
            - /url: /materials
            - img [ref=e79]
            - generic [ref=e89]: 物料管理
          - link "物料分类" [ref=e90] [cursor=pointer]:
            - /url: /categories
            - img [ref=e91]
            - generic [ref=e96]: 物料分类
          - link "检测项目" [ref=e97] [cursor=pointer]:
            - /url: /projects
            - img [ref=e98]
            - generic [ref=e100]: 检测项目
          - link "BOM清单" [ref=e101] [cursor=pointer]:
            - /url: /bom
            - img [ref=e102]
            - generic [ref=e105]: BOM清单
          - link "设备管理" [ref=e106] [cursor=pointer]:
            - /url: /equipment
            - img [ref=e107]
            - generic [ref=e109]: 设备管理
          - link "标准工时库" [ref=e110] [cursor=pointer]:
            - /url: /labor-times
            - img [ref=e111]
            - generic [ref=e114]: 标准工时库
      - generic [ref=e115]:
        - generic [ref=e116]:
          - img [ref=e118]
          - generic [ref=e123]:
            - generic [ref=e124]: 技术员
            - generic [ref=e125]: technician
        - button "收起侧边栏" [ref=e126] [cursor=pointer]:
          - img [ref=e127]
          - generic [ref=e129]: 收起侧边栏
    - generic [ref=e130]:
      - banner [ref=e131]:
        - navigation [ref=e132]:
          - generic [ref=e134]: 仪表盘
        - generic [ref=e135]:
          - generic [ref=e136]:
            - img [ref=e137]
            - textbox "全局搜索..." [ref=e140]
          - button [ref=e142] [cursor=pointer]:
            - img [ref=e143]
          - button "zhangwei 技术员" [ref=e147] [cursor=pointer]:
            - img [ref=e149]
            - generic [ref=e152]:
              - generic [ref=e153]: zhangwei
              - generic [ref=e154]: 技术员
      - main [ref=e155]:
        - generic [ref=e156]:
          - generic [ref=e158]:
            - heading "晚上好，技术员" [level=1] [ref=e159]
            - paragraph [ref=e160]: 2026年6月5日 星期五 · 欢迎使用 COREONE 实验室耗材管理系统
          - generic [ref=e161]:
            - generic [ref=e162]:
              - generic [ref=e163]:
                - img [ref=e164]
                - generic [ref=e166]: 待处理预警 (5)
              - button "查看全部" [ref=e167] [cursor=pointer]:
                - text: 查看全部
                - img [ref=e168]
            - generic [ref=e170]:
              - generic [ref=e171] [cursor=pointer]:
                - generic [ref=e173]:
                  - text: 95%乙醇
                  - generic [ref=e174]: 库存不足 (剩余12，安全库存10)
                - img [ref=e175]
              - generic [ref=e177] [cursor=pointer]:
                - generic [ref=e179]: SMA抗体即将过期
                - img [ref=e180]
              - generic [ref=e182] [cursor=pointer]:
                - generic [ref=e184]: ERG抗体即将过期
                - img [ref=e185]
          - generic [ref=e187]:
            - generic [ref=e189]:
              - generic [ref=e191] [cursor=pointer]:
                - generic [ref=e192]:
                  - paragraph [ref=e193]: 库存总量
                  - paragraph [ref=e194]: "181"
                  - paragraph [ref=e195]: 库存物料种类
                - img [ref=e197]
              - generic [ref=e202] [cursor=pointer]:
                - generic [ref=e203]:
                  - paragraph [ref=e204]: 出库总数
                  - paragraph [ref=e205]: "24"
                  - paragraph [ref=e206]: 累计完成
                - img [ref=e208]
              - generic [ref=e211] [cursor=pointer]:
                - generic [ref=e212]:
                  - paragraph [ref=e213]: 待处理预警
                  - paragraph [ref=e214]: "6"
                  - paragraph [ref=e215]: 需立即处理
                - img [ref=e217]
            - generic [ref=e219]:
              - generic [ref=e220]:
                - heading "最近活动" [level=3] [ref=e221]
                - button "查看全部" [ref=e222] [cursor=pointer]
              - generic [ref=e223]:
                - generic [ref=e224]:
                  - img [ref=e226]
                  - generic [ref=e228]:
                    - paragraph [ref=e229]: 出库：OB-20260511-016
                    - paragraph [ref=e230]: 项目消耗 · 王坤强
                  - generic [ref=e231]: 4小时前
                - generic [ref=e232]:
                  - img [ref=e234]
                  - generic [ref=e236]:
                    - paragraph [ref=e237]: 出库：OB-20260511-015
                    - paragraph [ref=e238]: 项目消耗 · 王坤强
                  - generic [ref=e239]: 4小时前
                - generic [ref=e240]:
                  - img [ref=e242]
                  - generic [ref=e244]:
                    - paragraph [ref=e245]: 出库：OB-20260511-014
                    - paragraph [ref=e246]: 细针穿刺细胞学检测 · 张伟
                  - generic [ref=e247]: 4小时前
          - generic [ref=e248]:
            - heading "快捷操作" [level=2] [ref=e249]
            - generic [ref=e250]:
              - button "出库领用 记录耗材消耗" [ref=e251] [cursor=pointer]:
                - img [ref=e253]
                - generic [ref=e255]:
                  - paragraph [ref=e256]: 出库领用
                  - paragraph [ref=e257]: 记录耗材消耗
                - img [ref=e258]
              - button "BOM清单 查看物料配置" [ref=e260] [cursor=pointer]:
                - img [ref=e262]
                - generic [ref=e265]:
                  - paragraph [ref=e266]: BOM清单
                  - paragraph [ref=e267]: 查看物料配置
                - img [ref=e268]
              - button "检测项目 管理检测项目" [ref=e270] [cursor=pointer]:
                - img [ref=e272]
                - generic [ref=e274]:
                  - paragraph [ref=e275]: 检测项目
                  - paragraph [ref=e276]: 管理检测项目
                - img [ref=e277]
  - region "Notifications alt+T"
```

# Test source

```ts
  50  |     await loginAs(page, 'technician')
  51  |     await expect(page).toHaveURL(`${FE_BASE}/`)
  52  |   })
  53  | 
  54  |   test('路径1-步骤2: 进入出库页面成功', async ({ page }) => {
  55  |     await loginAs(page, 'technician')
  56  |     await page.goto(`${FE_BASE}/outbound`)
  57  |     await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  58  |   })
  59  | 
  60  |   test('路径1-步骤3: 验证出库列表加载', async ({ page }) => {
  61  |     await loginAs(page, 'technician')
  62  |     await page.goto(`${FE_BASE}/outbound`)
  63  |     await page.waitForTimeout(1000)
  64  | 
  65  |     // 验证表格存在
  66  |     const table = page.locator('table, [role="table"], [data-testid="outbound-table"]')
  67  |     await expect(table.first()).toBeVisible({ timeout: 5000 })
  68  |   })
  69  | 
  70  |   test('路径1-步骤4: 验证出库列表有数据行', async ({ page }) => {
  71  |     if (!outboundId) {
  72  |       test.skip()
  73  |       return
  74  |     }
  75  | 
  76  |     await loginAs(page, 'technician')
  77  |     await page.goto(`${FE_BASE}/outbound`)
  78  |     await page.waitForTimeout(1000)
  79  | 
  80  |     // 验证表格有数据行
  81  |     const rows = page.locator('table tbody tr')
  82  |     await expect(rows.first()).toBeVisible({ timeout: 5000 })
  83  |   })
  84  | 
  85  |   test('路径1-步骤5: 验证出库单号列可见', async ({ page }) => {
  86  |     if (!outboundId) {
  87  |       test.skip()
  88  |       return
  89  |     }
  90  | 
  91  |     await loginAs(page, 'technician')
  92  |     await page.goto(`${FE_BASE}/outbound`)
  93  |     await page.waitForTimeout(1000)
  94  | 
  95  |     // 验证出库单号列存在
  96  |     const codeColumn = page.locator('th:has-text("出库单号"), th:has-text("单号"), th:has-text("Outbound No"), th:has-text("Number")')
  97  |     await expect(codeColumn.first()).toBeVisible({ timeout: 5000 })
  98  |   })
  99  | 
  100 |   test('路径1-步骤6: 验证项目名称列可见', async ({ page }) => {
  101 |     if (!outboundId) {
  102 |       test.skip()
  103 |       return
  104 |     }
  105 | 
  106 |     await loginAs(page, 'technician')
  107 |     await page.goto(`${FE_BASE}/outbound`)
  108 |     await page.waitForTimeout(1000)
  109 | 
  110 |     // 验证项目名称列存在
  111 |     const nameColumn = page.locator('th:has-text("项目名称"), th:has-text("项目"), th:has-text("Project"), th:has-text("Project Name")')
  112 |     await expect(nameColumn.first()).toBeVisible({ timeout: 5000 })
  113 |   })
  114 | 
  115 |   test('路径1-步骤7: 验证API返回出库列表', async ({ page }) => {
  116 |     const res = await apiFetch(technicianToken, 'GET', '/outbound?page=1&pageSize=10')
  117 | 
  118 |     expect(res.status).toBe(200)
  119 |     expect(res.data?.data?.list).toBeDefined()
  120 |   })
  121 | })
  122 | 
  123 | // ────────────────────────────────────────────
  124 | // 路径2: 查看出库详情 → 点击第一行 → 验证详情弹窗
  125 | // ────────────────────────────────────────────
  126 | 
  127 | test.describe('技术员查看出库记录 - 出库详情路径', () => {
  128 |   test('路径2-步骤1: 技术员登录成功', async ({ page }) => {
  129 |     await loginAs(page, 'technician')
  130 |     await expect(page).toHaveURL(`${FE_BASE}/`)
  131 |   })
  132 | 
  133 |   test('路径2-步骤2: 进入出库页面成功', async ({ page }) => {
  134 |     await loginAs(page, 'technician')
  135 |     await page.goto(`${FE_BASE}/outbound`)
  136 |     await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  137 |   })
  138 | 
  139 |   test('路径2-步骤3: 验证出库列表有数据', async ({ page }) => {
  140 |     if (!outboundId) {
  141 |       test.skip()
  142 |       return
  143 |     }
  144 | 
  145 |     await loginAs(page, 'technician')
  146 |     await page.goto(`${FE_BASE}/outbound`)
  147 |     await page.waitForTimeout(1000)
  148 | 
  149 |     const rows = page.locator('table tbody tr')
> 150 |     await expect(rows.first()).toBeVisible({ timeout: 5000 })
      |                                ^ Error: expect(locator).toBeVisible() failed
  151 |   })
  152 | 
  153 |   test('路径2-步骤4: 点击第一条出库记录', async ({ page }) => {
  154 |     if (!outboundId) {
  155 |       test.skip()
  156 |       return
  157 |     }
  158 | 
  159 |     await loginAs(page, 'technician')
  160 |     await page.goto(`${FE_BASE}/outbound`)
  161 |     await page.waitForTimeout(1000)
  162 | 
  163 |     // 点击第一条记录
  164 |     const firstRow = page.locator('table tbody tr').first()
  165 |     if (await firstRow.isVisible().catch(() => false)) {
  166 |       await firstRow.click()
  167 |     }
  168 |   })
  169 | 
  170 |   test('路径2-步骤5: 验证详情弹窗显示', async ({ page }) => {
  171 |     if (!outboundId) {
  172 |       test.skip()
  173 |       return
  174 |     }
  175 | 
  176 |     await loginAs(page, 'technician')
  177 |     await page.goto(`${FE_BASE}/outbound`)
  178 |     await page.waitForTimeout(1000)
  179 | 
  180 |     const firstRow = page.locator('table tbody tr').first()
  181 |     if (await firstRow.isVisible().catch(() => false)) {
  182 |       await firstRow.click()
  183 |       await page.waitForTimeout(500)
  184 | 
  185 |       // 验证详情弹窗或页面显示
  186 |       const detailPanel = page.locator('text=出库详情, text=出库信息, text=Outbound Detail, [role="dialog"], .modal')
  187 |       await expect(detailPanel.first()).toBeVisible({ timeout: 5000 })
  188 |     }
  189 |   })
  190 | 
  191 |   test('路径2-步骤6: 验证详情包含物料明细', async ({ page }) => {
  192 |     if (!outboundId) {
  193 |       test.skip()
  194 |       return
  195 |     }
  196 | 
  197 |     await loginAs(page, 'technician')
  198 |     await page.goto(`${FE_BASE}/outbound`)
  199 |     await page.waitForTimeout(1000)
  200 | 
  201 |     const firstRow = page.locator('table tbody tr').first()
  202 |     if (await firstRow.isVisible().catch(() => false)) {
  203 |       await firstRow.click()
  204 |       await page.waitForTimeout(500)
  205 | 
  206 |       // 验证详情中包含物料明细
  207 |       const materialDetail = page.locator('text=物料明细, text=物料列表, text=Material Detail, text=出库物料')
  208 |       await expect(materialDetail.first()).toBeVisible({ timeout: 5000 })
  209 |     }
  210 |   })
  211 | 
  212 |   test('路径2-步骤7: 验证API返回出库详情', async ({ page }) => {
  213 |     if (!outboundId) {
  214 |       test.skip()
  215 |       return
  216 |     }
  217 | 
  218 |     const res = await apiFetch(technicianToken, 'GET', `/outbound/${outboundId}`)
  219 | 
  220 |     expect([200, 404]).toContain(res.status)
  221 |   })
  222 | })
  223 | 
  224 | // ────────────────────────────────────────────
  225 | // 路径3: 查看出库记录 → 按日期范围筛选
  226 | // ────────────────────────────────────────────
  227 | 
  228 | test.describe('技术员查看出库记录 - 按日期筛选路径', () => {
  229 |   test('路径3-步骤1: 技术员登录成功', async ({ page }) => {
  230 |     await loginAs(page, 'technician')
  231 |     await expect(page).toHaveURL(`${FE_BASE}/`)
  232 |   })
  233 | 
  234 |   test('路径3-步骤2: 进入出库页面成功', async ({ page }) => {
  235 |     await loginAs(page, 'technician')
  236 |     await page.goto(`${FE_BASE}/outbound`)
  237 |     await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  238 |   })
  239 | 
  240 |   test('路径3-步骤3: 验证日期筛选器可见', async ({ page }) => {
  241 |     await loginAs(page, 'technician')
  242 |     await page.goto(`${FE_BASE}/outbound`)
  243 |     await page.waitForTimeout(1000)
  244 | 
  245 |     // 验证日期筛选器存在
  246 |     const dateFilter = page.locator('input[type="date"], [data-testid="date-filter"], text=日期, text=Date, .date-picker')
  247 |     await expect(dateFilter.first()).toBeVisible({ timeout: 5000 })
  248 |   })
  249 | 
  250 |   test('路径3-步骤4: 选择开始日期', async ({ page }) => {
```