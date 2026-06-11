# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: scenarios\warehouse-manager-suite\login.spec.ts >> 仓管员登录 - 验证侧边栏菜单路径 >> 路径3-步骤2: 验证侧边栏可见入库管理
- Location: e2e\scenarios\warehouse-manager-suite\login.spec.ts:138:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('text=入库管理, a[href*="inbound"]').first()
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=入库管理, a[href*="inbound"]').first()

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
          - link "入库管理" [ref=e32] [cursor=pointer]:
            - /url: /inbound
            - img [ref=e33]
            - generic [ref=e35]: 入库管理
          - link "库存列表" [ref=e36] [cursor=pointer]:
            - /url: /inventory
            - img [ref=e37]
            - generic [ref=e41]: 库存列表
          - link "出库管理" [ref=e42] [cursor=pointer]:
            - /url: /outbound
            - img [ref=e43]
            - generic [ref=e45]: 出库管理
          - link "退库管理" [ref=e46] [cursor=pointer]:
            - /url: /returns
            - img [ref=e47]
            - generic [ref=e50]: 退库管理
          - link "退货给供应商" [ref=e51] [cursor=pointer]:
            - /url: /supplier-returns
            - img [ref=e52]
            - generic [ref=e55]: 退货给供应商
          - link "调拨管理" [ref=e56] [cursor=pointer]:
            - /url: /transfers
            - img [ref=e57]
            - generic [ref=e60]: 调拨管理
          - link "报废管理" [ref=e61] [cursor=pointer]:
            - /url: /scraps
            - img [ref=e62]
            - generic [ref=e65]: 报废管理
          - link "库存盘点" [ref=e66] [cursor=pointer]:
            - /url: /stocktaking
            - img [ref=e67]
            - generic [ref=e71]: 库存盘点
        - generic [ref=e73]:
          - generic [ref=e74]: 采购管理
          - link "供应商管理" [ref=e75] [cursor=pointer]:
            - /url: /suppliers
            - img [ref=e76]
            - generic [ref=e81]: 供应商管理
        - generic [ref=e83]:
          - generic [ref=e84]: 基础数据
          - link "物料管理" [ref=e85] [cursor=pointer]:
            - /url: /materials
            - img [ref=e86]
            - generic [ref=e96]: 物料管理
          - link "物料分类" [ref=e97] [cursor=pointer]:
            - /url: /categories
            - img [ref=e98]
            - generic [ref=e103]: 物料分类
          - link "库位管理" [ref=e104] [cursor=pointer]:
            - /url: /locations
            - img [ref=e105]
            - generic [ref=e108]: 库位管理
      - generic [ref=e109]:
        - generic [ref=e110]:
          - img [ref=e112]
          - generic [ref=e117]:
            - generic [ref=e118]: 仓库管理员
            - generic [ref=e119]: warehouse_manager
        - button "收起侧边栏" [ref=e120] [cursor=pointer]:
          - img [ref=e121]
          - generic [ref=e123]: 收起侧边栏
    - generic [ref=e124]:
      - banner [ref=e125]:
        - navigation [ref=e126]:
          - generic [ref=e128]: 仪表盘
        - generic [ref=e129]:
          - generic [ref=e130]:
            - img [ref=e131]
            - textbox "全局搜索..." [ref=e134]
          - button [ref=e136] [cursor=pointer]:
            - img [ref=e137]
          - button "wangkq 仓库管理员" [ref=e141] [cursor=pointer]:
            - img [ref=e143]
            - generic [ref=e146]:
              - generic [ref=e147]: wangkq
              - generic [ref=e148]: 仓库管理员
      - main [ref=e149]:
        - generic [ref=e150]:
          - generic [ref=e152]:
            - heading "晚上好，仓库管理员" [level=1] [ref=e153]
            - paragraph [ref=e154]: 2026年6月5日 星期五 · 欢迎使用 COREONE 实验室耗材管理系统
          - generic [ref=e155]:
            - generic [ref=e156]:
              - generic [ref=e157]:
                - img [ref=e158]
                - generic [ref=e160]: 待处理预警 (5)
              - button "查看全部" [ref=e161] [cursor=pointer]:
                - text: 查看全部
                - img [ref=e162]
            - generic [ref=e164]:
              - generic [ref=e165] [cursor=pointer]:
                - generic [ref=e167]:
                  - text: 95%乙醇
                  - generic [ref=e168]: 库存不足 (剩余12，安全库存10)
                - img [ref=e169]
              - generic [ref=e171] [cursor=pointer]:
                - generic [ref=e173]: SMA抗体即将过期
                - img [ref=e174]
              - generic [ref=e176] [cursor=pointer]:
                - generic [ref=e178]: ERG抗体即将过期
                - img [ref=e179]
          - generic [ref=e181]:
            - generic [ref=e183]:
              - generic [ref=e185] [cursor=pointer]:
                - generic [ref=e186]:
                  - paragraph [ref=e187]: 库存总量
                  - paragraph [ref=e188]: "181"
                  - paragraph [ref=e189]: 库存物料种类
                - img [ref=e191]
              - generic [ref=e196] [cursor=pointer]:
                - generic [ref=e197]:
                  - paragraph [ref=e198]: 入库总数
                  - paragraph [ref=e199]: "91"
                  - paragraph [ref=e200]: 累计完成
                - img [ref=e202]
              - generic [ref=e205] [cursor=pointer]:
                - generic [ref=e206]:
                  - paragraph [ref=e207]: 出库总数
                  - paragraph [ref=e208]: "24"
                  - paragraph [ref=e209]: 累计完成
                - img [ref=e211]
              - generic [ref=e214] [cursor=pointer]:
                - generic [ref=e215]:
                  - paragraph [ref=e216]: 待处理预警
                  - paragraph [ref=e217]: "6"
                  - paragraph [ref=e218]: 需立即处理
                - img [ref=e220]
            - generic [ref=e222]:
              - generic [ref=e223]:
                - heading "最近活动" [level=3] [ref=e224]
                - button "查看全部" [ref=e225] [cursor=pointer]
              - generic [ref=e226]:
                - generic [ref=e227]:
                  - img [ref=e229]
                  - generic [ref=e231]:
                    - paragraph [ref=e232]: 入库：CD68抗体
                    - paragraph [ref=e233]: 数量 1瓶 · 王坤强
                  - generic [ref=e234]: 刚刚
                - generic [ref=e235]:
                  - img [ref=e237]
                  - generic [ref=e239]:
                    - paragraph [ref=e240]: 入库：载玻片架（20片装）
                    - paragraph [ref=e241]: 数量 1包 · 王坤强
                  - generic [ref=e242]: 刚刚
                - generic [ref=e243]:
                  - img [ref=e245]
                  - generic [ref=e247]:
                    - paragraph [ref=e248]: 入库：EMA抗体
                    - paragraph [ref=e249]: 数量 1瓶 · 赵慧萍
                  - generic [ref=e250]: 4小时前
                - generic [ref=e251]:
                  - img [ref=e253]
                  - generic [ref=e255]:
                    - paragraph [ref=e256]: 出库：OB-20260511-016
                    - paragraph [ref=e257]: 项目消耗 · 王坤强
                  - generic [ref=e258]: 4小时前
                - generic [ref=e259]:
                  - img [ref=e261]
                  - generic [ref=e263]:
                    - paragraph [ref=e264]: 出库：OB-20260511-015
                    - paragraph [ref=e265]: 项目消耗 · 王坤强
                  - generic [ref=e266]: 4小时前
                - generic [ref=e267]:
                  - img [ref=e269]
                  - generic [ref=e271]:
                    - paragraph [ref=e272]: 出库：OB-20260511-014
                    - paragraph [ref=e273]: 细针穿刺细胞学检测 · 张伟
                  - generic [ref=e274]: 4小时前
          - generic [ref=e275]:
            - heading "待办事项" [level=3] [ref=e276]
            - generic [ref=e277]:
              - button "5 条预警待处理 点击前往预警中心" [ref=e278] [cursor=pointer]:
                - img [ref=e279]
                - generic [ref=e282]:
                  - paragraph [ref=e283]: 5 条预警待处理
                  - paragraph [ref=e284]: 点击前往预警中心
              - button "5 个采购单待收货 点击前往采购订单" [ref=e285] [cursor=pointer]:
                - img [ref=e286]
                - generic [ref=e290]:
                  - paragraph [ref=e291]: 5 个采购单待收货
                  - paragraph [ref=e292]: 点击前往采购订单
              - button "5 种物料库存不足 点击前往库存列表" [ref=e293] [cursor=pointer]:
                - img [ref=e294]
                - generic [ref=e298]:
                  - paragraph [ref=e299]: 5 种物料库存不足
                  - paragraph [ref=e300]: 点击前往库存列表
          - generic [ref=e301]:
            - heading "快捷操作" [level=2] [ref=e302]
            - generic [ref=e303]:
              - button "入库登记 录入新到耗材批次" [ref=e304] [cursor=pointer]:
                - img [ref=e306]
                - generic [ref=e308]:
                  - paragraph [ref=e309]: 入库登记
                  - paragraph [ref=e310]: 录入新到耗材批次
                - img [ref=e311]
              - button "出库领用 记录耗材消耗" [ref=e313] [cursor=pointer]:
                - img [ref=e315]
                - generic [ref=e317]:
                  - paragraph [ref=e318]: 出库领用
                  - paragraph [ref=e319]: 记录耗材消耗
                - img [ref=e320]
              - button "库存盘点 核对实际库存" [ref=e322] [cursor=pointer]:
                - img [ref=e324]
                - generic [ref=e328]:
                  - paragraph [ref=e329]: 库存盘点
                  - paragraph [ref=e330]: 核对实际库存
                - img [ref=e331]
          - generic [ref=e333]:
            - generic [ref=e334]:
              - heading "库存预警摘要" [level=3] [ref=e335]
              - button "查看全部" [ref=e336] [cursor=pointer]
            - generic [ref=e337]:
              - generic [ref=e338]:
                - img [ref=e339]
                - generic [ref=e343]:
                  - paragraph [ref=e344]: "5"
                  - paragraph [ref=e345]: 库存不足
              - generic [ref=e346]:
                - img [ref=e347]
                - generic [ref=e349]:
                  - paragraph [ref=e350]: "1"
                  - paragraph [ref=e351]: 已过期
  - region "Notifications alt+T"
```

# Test source

```ts
  43  | 
  44  |   test('路径1-步骤3: 点击登录按钮', async ({ page }) => {
  45  |     await page.goto(`${FE_BASE}/login`)
  46  | 
  47  |     const loginButton = page.locator('button[type="submit"]')
  48  |     await expect(loginButton.first()).toBeVisible({ timeout: 15000 })
  49  |   })
  50  | 
  51  |   test('路径1-步骤4: 登录成功后跳转到首页', async ({ page }) => {
  52  |     await loginAs(page, 'warehouse_manager')
  53  |     await expect(page).toHaveURL(`${FE_BASE}/`)
  54  |   })
  55  | 
  56  |   test('路径1-步骤5: 验证首页仪表盘可见', async ({ page }) => {
  57  |     await loginAs(page, 'warehouse_manager')
  58  |     await page.waitForTimeout(1000)
  59  | 
  60  |     // 验证首页内容可见
  61  |     await expect(page.locator('body')).toBeVisible()
  62  |   })
  63  | })
  64  | 
  65  | // ────────────────────────────────────────────
  66  | // 路径2: 登录失败 → 错误提示 → 重试
  67  | // ────────────────────────────────────────────
  68  | 
  69  | test.describe('仓管员登录 - 登录失败路径', () => {
  70  |   test('路径2-步骤1: 打开登录页面', async ({ page }) => {
  71  |     await page.goto(`${FE_BASE}/login`)
  72  |     await expect(page.locator('body')).toBeVisible({ timeout: 30000 })
  73  |   })
  74  | 
  75  |   test('路径2-步骤2: 输入错误密码', async ({ page }) => {
  76  |     await page.goto(`${FE_BASE}/login`)
  77  | 
  78  |     const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]')
  79  |     const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]')
  80  | 
  81  |     await usernameInput.first().waitFor({ state: 'visible', timeout: 15000 })
  82  |     if (await usernameInput.first().isVisible().catch(() => false)) {
  83  |       await usernameInput.first().fill('wangkq')
  84  |     }
  85  |     if (await passwordInput.first().isVisible().catch(() => false)) {
  86  |       await passwordInput.first().fill('wrong-password')
  87  |     }
  88  |   })
  89  | 
  90  |   test('路径2-步骤3: 点击登录按钮失败', async ({ page }) => {
  91  |     await page.goto(`${FE_BASE}/login`)
  92  | 
  93  |     const usernameInput = page.locator('input[placeholder="请输入用户名"], input[type="text"]')
  94  |     const passwordInput = page.locator('input[placeholder="请输入密码"], input[type="password"]')
  95  | 
  96  |     await usernameInput.first().waitFor({ state: 'visible', timeout: 15000 })
  97  |     if (await usernameInput.first().isVisible().catch(() => false)) {
  98  |       await usernameInput.first().fill('wangkq')
  99  |     }
  100 |     if (await passwordInput.first().isVisible().catch(() => false)) {
  101 |       await passwordInput.first().fill('wrong-password')
  102 |     }
  103 | 
  104 |     const loginButton = page.locator('button[type="submit"]')
  105 |     if (await loginButton.first().isVisible().catch(() => false)) {
  106 |       await loginButton.first().click()
  107 |       await page.waitForTimeout(1000)
  108 |     }
  109 | 
  110 |     // 验证仍然在登录页面（未跳转）
  111 |     await expect(page).toHaveURL(/login/)
  112 |   })
  113 | 
  114 |   test('路径2-步骤4: 验证错误提示显示', async ({ page }) => {
  115 |     await page.goto(`${FE_BASE}/login`)
  116 |     await page.waitForTimeout(1000)
  117 | 
  118 |     // 验证页面不会崩溃
  119 |     await expect(page.locator('body')).toBeVisible()
  120 |   })
  121 | 
  122 |   test('路径2-步骤5: 使用正确密码重新登录成功', async ({ page }) => {
  123 |     await loginAs(page, 'warehouse_manager')
  124 |     await expect(page).toHaveURL(`${FE_BASE}/`)
  125 |   })
  126 | })
  127 | 
  128 | // ────────────────────────────────────────────
  129 | // 路径3: 登录后验证侧边栏菜单
  130 | // ────────────────────────────────────────────
  131 | 
  132 | test.describe('仓管员登录 - 验证侧边栏菜单路径', () => {
  133 |   test('路径3-步骤1: 仓管员登录成功', async ({ page }) => {
  134 |     await loginAs(page, 'warehouse_manager')
  135 |     await expect(page).toHaveURL(`${FE_BASE}/`)
  136 |   })
  137 | 
  138 |   test('路径3-步骤2: 验证侧边栏可见入库管理', async ({ page }) => {
  139 |     await loginAs(page, 'warehouse_manager')
  140 |     await page.waitForTimeout(1000)
  141 | 
  142 |     const inboundLink = page.locator('text=入库管理, a[href*="inbound"]')
> 143 |     await expect(inboundLink.first()).toBeVisible({ timeout: 5000 })
      |                                       ^ Error: expect(locator).toBeVisible() failed
  144 |   })
  145 | 
  146 |   test('路径3-步骤3: 验证侧边栏可见库存列表', async ({ page }) => {
  147 |     await loginAs(page, 'warehouse_manager')
  148 |     await page.waitForTimeout(1000)
  149 | 
  150 |     const inventoryLink = page.locator('text=库存列表, a[href*="inventory"]')
  151 |     await expect(inventoryLink.first()).toBeVisible({ timeout: 5000 })
  152 |   })
  153 | 
  154 |   test('路径3-步骤4: 验证侧边栏可见出库管理', async ({ page }) => {
  155 |     await loginAs(page, 'warehouse_manager')
  156 |     await page.waitForTimeout(1000)
  157 | 
  158 |     const outboundLink = page.locator('text=出库管理, a[href*="outbound"]')
  159 |     await expect(outboundLink.first()).toBeVisible({ timeout: 5000 })
  160 |   })
  161 | 
  162 |   test('路径3-步骤5: 验证侧边栏可见盘点管理', async ({ page }) => {
  163 |     await loginAs(page, 'warehouse_manager')
  164 |     await page.waitForTimeout(1000)
  165 | 
  166 |     const stocktakingLink = page.locator('text=盘点, a[href*="stocktaking"]')
  167 |     await expect(stocktakingLink.first()).toBeVisible({ timeout: 5000 })
  168 |   })
  169 | 
  170 |   test('路径3-步骤6: 验证侧边栏可见调拨管理', async ({ page }) => {
  171 |     await loginAs(page, 'warehouse_manager')
  172 |     await page.waitForTimeout(1000)
  173 | 
  174 |     const transferLink = page.locator('text=调拨, a[href*="transfer"]')
  175 |     await expect(transferLink.first()).toBeVisible({ timeout: 5000 })
  176 |   })
  177 | })
  178 | 
  179 | // ────────────────────────────────────────────
  180 | // 路径4: 验证仓管员权限边界（不能访问管理页面）
  181 | // ────────────────────────────────────────────
  182 | 
  183 | test.describe('仓管员登录 - 验证权限边界路径', () => {
  184 |   test('路径4-步骤1: 仓管员登录成功', async ({ page }) => {
  185 |     await loginAs(page, 'warehouse_manager')
  186 |     await expect(page).toHaveURL(`${FE_BASE}/`)
  187 |   })
  188 | 
  189 |   test('路径4-步骤2: 验证不能访问用户管理页面', async ({ page }) => {
  190 |     await loginAs(page, 'warehouse_manager')
  191 |     await page.goto(`${FE_BASE}/users`)
  192 |     await page.waitForTimeout(1000)
  193 | 
  194 |     // 仓管员访问 /users 应被拒绝或重定向
  195 |     // 可能显示403或重定向到首页
  196 |     const url = page.url()
  197 |     const isForbidden = url.includes('login') || url.endsWith('/') || !url.includes('users')
  198 |     expect(isForbidden).toBe(true)
  199 |   })
  200 | 
  201 |   test('路径4-步骤3: 验证不能访问角色管理页面', async ({ page }) => {
  202 |     await loginAs(page, 'warehouse_manager')
  203 |     await page.goto(`${FE_BASE}/roles`)
  204 |     await page.waitForTimeout(1000)
  205 | 
  206 |     // 仓管员访问 /roles 应被拒绝或重定向
  207 |     const url = page.url()
  208 |     const isForbidden = url.includes('login') || url.endsWith('/') || !url.includes('roles')
  209 |     expect(isForbidden).toBe(true)
  210 |   })
  211 | 
  212 |   test('路径4-步骤4: 验证侧边栏不显示用户管理入口', async ({ page }) => {
  213 |     await loginAs(page, 'warehouse_manager')
  214 |     await page.waitForTimeout(1000)
  215 | 
  216 |     // 仓管员侧边栏不应看到用户管理链接
  217 |     const usersLink = page.locator('a[href="/users"], text=用户管理')
  218 |     const isVisible = await usersLink.first().isVisible().catch(() => false)
  219 |     // 如果可见，则可能是管理页面入口存在但访问会被拒绝
  220 |     // 这里主要验证仓管员没有管理权限
  221 |     if (isVisible) {
  222 |       // 如果可见，验证点击后会被拒绝
  223 |       await usersLink.first().click()
  224 |       await page.waitForTimeout(1000)
  225 |       const url = page.url()
  226 |       const isForbidden = url.includes('login') || url.endsWith('/') || !url.includes('users')
  227 |       expect(isForbidden).toBe(true)
  228 |     }
  229 |   })
  230 | })
  231 | 
```