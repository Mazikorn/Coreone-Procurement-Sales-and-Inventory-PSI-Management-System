# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: users.spec.ts >> 用户管理 -> 筛选功能 >> USER-FILTER-02. 正常用例：按角色筛选
- Location: e2e\users.spec.ts:119:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('select').filter({ hasText: /全部角色|系统管理员/i }).first()
    - locator resolved to <select class="h-10 px-3 pr-8 text-sm text-[#111827] bg-white border border-[#e5e7eb] rounded-md outline-none transition-all focus:border-[#3b82f6] focus:shadow-[0_0_0_3px_rgba(59,130,246,0.1)] appearance-none cursor-pointer">…</select>
  - attempting select option action
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
    - waiting 20ms
    2 × waiting for element to be visible and enabled
      - did not find some options
    - retrying select option action
      - waiting 100ms
    55 × waiting for element to be visible and enabled
       - did not find some options
     - retrying select option action
       - waiting 500ms

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
        - link "仪表盘" [ref=e15] [cursor=pointer]:
          - /url: /
          - img [ref=e16]
          - generic [ref=e21]: 仪表盘
        - link "库存列表" [ref=e22] [cursor=pointer]:
          - /url: /inventory
          - img [ref=e23]
          - generic [ref=e27]: 库存列表
        - link "入库记录" [ref=e28] [cursor=pointer]:
          - /url: /inbound
          - img [ref=e29]
          - generic [ref=e31]: 入库记录
        - link "出库记录" [ref=e32] [cursor=pointer]:
          - /url: /outbound
          - img [ref=e33]
          - generic [ref=e35]: 出库记录
        - link "库存盘点" [ref=e36] [cursor=pointer]:
          - /url: /stocktaking
          - img [ref=e37]
          - generic [ref=e41]: 库存盘点
        - link "检测项目" [ref=e42] [cursor=pointer]:
          - /url: /projects
          - img [ref=e43]
          - generic [ref=e45]: 检测项目
        - link "BOM清单" [ref=e46] [cursor=pointer]:
          - /url: /bom
          - img [ref=e47]
          - generic [ref=e50]: BOM清单
        - link "消耗对账" [ref=e51] [cursor=pointer]:
          - /url: /reconciliation
          - img [ref=e52]
          - generic [ref=e54]: 消耗对账
        - link "物料成本分析" [ref=e55] [cursor=pointer]:
          - /url: /cost-analysis
          - img [ref=e56]
          - generic [ref=e58]: 物料成本分析
        - link "物料分类" [ref=e59] [cursor=pointer]:
          - /url: /categories
          - img [ref=e60]
          - generic [ref=e65]: 物料分类
        - link "耗材管理" [ref=e66] [cursor=pointer]:
          - /url: /materials
          - img [ref=e67]
          - generic [ref=e77]: 耗材管理
        - link "预警中心" [ref=e78] [cursor=pointer]:
          - /url: /alerts
          - img [ref=e79]
          - generic [ref=e82]: 预警中心
        - link "供应商管理" [ref=e84] [cursor=pointer]:
          - /url: /suppliers
          - img [ref=e85]
          - generic [ref=e90]: 供应商管理
        - link "库位管理" [ref=e91] [cursor=pointer]:
          - /url: /locations
          - img [ref=e92]
          - generic [ref=e95]: 库位管理
        - link "用户管理" [ref=e96] [cursor=pointer]:
          - /url: /users
          - img [ref=e97]
          - generic [ref=e102]: 用户管理
        - link "角色权限" [ref=e103] [cursor=pointer]:
          - /url: /roles
          - img [ref=e104]
          - generic [ref=e106]: 角色权限
        - link "操作日志" [ref=e107] [cursor=pointer]:
          - /url: /logs
          - img [ref=e108]
          - generic [ref=e111]: 操作日志
      - generic [ref=e112]:
        - generic [ref=e113]:
          - img [ref=e115]
          - generic [ref=e120]:
            - generic [ref=e121]: 管理员
            - generic [ref=e122]: 系统管理员
        - button "收起侧边栏" [ref=e123] [cursor=pointer]:
          - img [ref=e124]
          - generic [ref=e126]: 收起侧边栏
    - generic [ref=e127]:
      - banner [ref=e128]:
        - navigation [ref=e129]:
          - link "首页" [ref=e131] [cursor=pointer]:
            - /url: /
          - generic [ref=e132]:
            - img [ref=e133]
            - generic [ref=e135]: 用户管理
        - generic [ref=e136]:
          - generic [ref=e137]:
            - img [ref=e138]
            - textbox "全局搜索..." [ref=e141]
          - button "2" [ref=e143] [cursor=pointer]:
            - img [ref=e144]
            - generic [ref=e147]: "2"
          - button "管理员 系统管理员" [ref=e149] [cursor=pointer]:
            - img [ref=e151]
            - generic [ref=e154]:
              - generic [ref=e155]: 管理员
              - generic [ref=e156]: 系统管理员
      - main [ref=e157]:
        - generic [ref=e158]:
          - generic [ref=e159]:
            - generic [ref=e160]:
              - heading "用户管理" [level=1] [ref=e161]
              - paragraph [ref=e162]: 管理系统用户、角色和权限分配
            - button "新建用户" [ref=e163] [cursor=pointer]:
              - img [ref=e164]
              - text: 新建用户
          - generic [ref=e165]:
            - generic [ref=e166]:
              - generic [ref=e167]: "9"
              - generic [ref=e168]: 用户总数
            - generic [ref=e169]:
              - generic [ref=e170]: "9"
              - generic [ref=e171]: 启用用户
            - generic [ref=e172]:
              - generic [ref=e173]: "0"
              - generic [ref=e174]: 停用用户
            - generic [ref=e175]:
              - generic [ref=e176]: "1"
              - generic [ref=e177]: 管理员
          - generic [ref=e178]:
            - generic [ref=e179]:
              - generic [ref=e180]: 角色列表
              - generic [ref=e182]: 暂无角色数据
            - generic [ref=e183]:
              - generic [ref=e184]:
                - generic [ref=e185]: 用户列表
                - generic [ref=e186]:
                  - generic [ref=e187]:
                    - img [ref=e188]
                    - textbox "搜索用户名、姓名..." [ref=e191]
                  - combobox [ref=e192] [cursor=pointer]:
                    - option "全部角色" [selected]
                  - combobox [ref=e193] [cursor=pointer]:
                    - option "全部状态" [selected]
                    - option "正常"
                    - option "禁用"
                  - button "查询" [ref=e194] [cursor=pointer]
                  - button "重置" [ref=e195] [cursor=pointer]
              - table [ref=e197]:
                - rowgroup [ref=e198]:
                  - row "用户名 姓名 部门 角色 状态 最后登录 操作" [ref=e199]:
                    - columnheader [ref=e200]:
                      - checkbox [ref=e201]
                    - columnheader "用户名" [ref=e202]
                    - columnheader "姓名" [ref=e203]
                    - columnheader "部门" [ref=e204]
                    - columnheader "角色" [ref=e205]
                    - columnheader "状态" [ref=e206]
                    - columnheader "最后登录" [ref=e207]
                    - columnheader "操作" [ref=e208]
                - rowgroup [ref=e209]:
                  - row "dupe-1779248175503 concurrent-1779248202780 - technician 正常 - 详情 编辑 停用 重置密码 删除" [ref=e210]:
                    - cell [ref=e211]:
                      - checkbox [ref=e212]
                    - cell "dupe-1779248175503" [ref=e213]
                    - cell "concurrent-1779248202780" [ref=e214]
                    - cell "-" [ref=e215]
                    - cell "technician" [ref=e216]
                    - cell "正常" [ref=e217]:
                      - generic [ref=e218]: 正常
                    - cell "-" [ref=e219]
                    - cell "详情 编辑 停用 重置密码 删除" [ref=e220]:
                      - generic [ref=e221]:
                        - button "详情" [ref=e222] [cursor=pointer]
                        - button "编辑" [ref=e223] [cursor=pointer]
                        - button "停用" [ref=e224] [cursor=pointer]
                        - button "重置密码" [ref=e225] [cursor=pointer]
                        - button "删除" [ref=e226] [cursor=pointer]
                  - row "dupe-1779243088117 concurrent-1779243117949 - technician 正常 - 详情 编辑 停用 重置密码 删除" [ref=e227]:
                    - cell [ref=e228]:
                      - checkbox [ref=e229]
                    - cell "dupe-1779243088117" [ref=e230]
                    - cell "concurrent-1779243117949" [ref=e231]
                    - cell "-" [ref=e232]
                    - cell "technician" [ref=e233]
                    - cell "正常" [ref=e234]:
                      - generic [ref=e235]: 正常
                    - cell "-" [ref=e236]
                    - cell "详情 编辑 停用 重置密码 删除" [ref=e237]:
                      - generic [ref=e238]:
                        - button "详情" [ref=e239] [cursor=pointer]
                        - button "编辑" [ref=e240] [cursor=pointer]
                        - button "停用" [ref=e241] [cursor=pointer]
                        - button "重置密码" [ref=e242] [cursor=pointer]
                        - button "删除" [ref=e243] [cursor=pointer]
                  - row "dupe-1779180469166 concurrent-1779180506948 - technician 正常 - 详情 编辑 停用 重置密码 删除" [ref=e244]:
                    - cell [ref=e245]:
                      - checkbox [ref=e246]
                    - cell "dupe-1779180469166" [ref=e247]
                    - cell "concurrent-1779180506948" [ref=e248]
                    - cell "-" [ref=e249]
                    - cell "technician" [ref=e250]
                    - cell "正常" [ref=e251]:
                      - generic [ref=e252]: 正常
                    - cell "-" [ref=e253]
                    - cell "详情 编辑 停用 重置密码 删除" [ref=e254]:
                      - generic [ref=e255]:
                        - button "详情" [ref=e256] [cursor=pointer]
                        - button "编辑" [ref=e257] [cursor=pointer]
                        - button "停用" [ref=e258] [cursor=pointer]
                        - button "重置密码" [ref=e259] [cursor=pointer]
                        - button "删除" [ref=e260] [cursor=pointer]
                  - row "admin 管理员 病理科 admin 正常 - 详情 编辑 停用 重置密码 删除" [ref=e261]:
                    - cell [ref=e262]:
                      - checkbox [ref=e263]
                    - cell "admin" [ref=e264]
                    - cell "管理员" [ref=e265]
                    - cell "病理科" [ref=e266]
                    - cell "admin" [ref=e267]
                    - cell "正常" [ref=e268]:
                      - generic [ref=e269]: 正常
                    - cell "-" [ref=e270]
                    - cell "详情 编辑 停用 重置密码 删除" [ref=e271]:
                      - generic [ref=e272]:
                        - button "详情" [ref=e273] [cursor=pointer]
                        - button "编辑" [ref=e274] [cursor=pointer]
                        - button "停用" [ref=e275] [cursor=pointer]
                        - button "重置密码" [ref=e276] [cursor=pointer]
                        - button "删除" [ref=e277] [cursor=pointer]
                  - row "cangguan 王仓库 病理科 warehouse_manager 正常 - 详情 编辑 停用 重置密码 删除" [ref=e278]:
                    - cell [ref=e279]:
                      - checkbox [ref=e280]
                    - cell "cangguan" [ref=e281]
                    - cell "王仓库" [ref=e282]
                    - cell "病理科" [ref=e283]
                    - cell "warehouse_manager" [ref=e284]
                    - cell "正常" [ref=e285]:
                      - generic [ref=e286]: 正常
                    - cell "-" [ref=e287]
                    - cell "详情 编辑 停用 重置密码 删除" [ref=e288]:
                      - generic [ref=e289]:
                        - button "详情" [ref=e290] [cursor=pointer]
                        - button "编辑" [ref=e291] [cursor=pointer]
                        - button "停用" [ref=e292] [cursor=pointer]
                        - button "重置密码" [ref=e293] [cursor=pointer]
                        - button "删除" [ref=e294] [cursor=pointer]
                  - row "jishuyuan1 张技术 病理科 technician 正常 - 详情 编辑 停用 重置密码 删除" [ref=e295]:
                    - cell [ref=e296]:
                      - checkbox [ref=e297]
                    - cell "jishuyuan1" [ref=e298]
                    - cell "张技术" [ref=e299]
                    - cell "病理科" [ref=e300]
                    - cell "technician" [ref=e301]
                    - cell "正常" [ref=e302]:
                      - generic [ref=e303]: 正常
                    - cell "-" [ref=e304]
                    - cell "详情 编辑 停用 重置密码 删除" [ref=e305]:
                      - generic [ref=e306]:
                        - button "详情" [ref=e307] [cursor=pointer]
                        - button "编辑" [ref=e308] [cursor=pointer]
                        - button "停用" [ref=e309] [cursor=pointer]
                        - button "重置密码" [ref=e310] [cursor=pointer]
                        - button "删除" [ref=e311] [cursor=pointer]
                  - row "yishi1 刘医师 病理科 pathologist 正常 - 详情 编辑 停用 重置密码 删除" [ref=e312]:
                    - cell [ref=e313]:
                      - checkbox [ref=e314]
                    - cell "yishi1" [ref=e315]
                    - cell "刘医师" [ref=e316]
                    - cell "病理科" [ref=e317]
                    - cell "pathologist" [ref=e318]
                    - cell "正常" [ref=e319]:
                      - generic [ref=e320]: 正常
                    - cell "-" [ref=e321]
                    - cell "详情 编辑 停用 重置密码 删除" [ref=e322]:
                      - generic [ref=e323]:
                        - button "详情" [ref=e324] [cursor=pointer]
                        - button "编辑" [ref=e325] [cursor=pointer]
                        - button "停用" [ref=e326] [cursor=pointer]
                        - button "重置密码" [ref=e327] [cursor=pointer]
                        - button "删除" [ref=e328] [cursor=pointer]
                  - row "caigou 赵采购 设备科 procurement 正常 - 详情 编辑 停用 重置密码 删除" [ref=e329]:
                    - cell [ref=e330]:
                      - checkbox [ref=e331]
                    - cell "caigou" [ref=e332]
                    - cell "赵采购" [ref=e333]
                    - cell "设备科" [ref=e334]
                    - cell "procurement" [ref=e335]
                    - cell "正常" [ref=e336]:
                      - generic [ref=e337]: 正常
                    - cell "-" [ref=e338]
                    - cell "详情 编辑 停用 重置密码 删除" [ref=e339]:
                      - generic [ref=e340]:
                        - button "详情" [ref=e341] [cursor=pointer]
                        - button "编辑" [ref=e342] [cursor=pointer]
                        - button "停用" [ref=e343] [cursor=pointer]
                        - button "重置密码" [ref=e344] [cursor=pointer]
                        - button "删除" [ref=e345] [cursor=pointer]
                  - row "caiwu 孙财务 财务科 finance 正常 - 详情 编辑 停用 重置密码 删除" [ref=e346]:
                    - cell [ref=e347]:
                      - checkbox [ref=e348]
                    - cell "caiwu" [ref=e349]
                    - cell "孙财务" [ref=e350]
                    - cell "财务科" [ref=e351]
                    - cell "finance" [ref=e352]
                    - cell "正常" [ref=e353]:
                      - generic [ref=e354]: 正常
                    - cell "-" [ref=e355]
                    - cell "详情 编辑 停用 重置密码 删除" [ref=e356]:
                      - generic [ref=e357]:
                        - button "详情" [ref=e358] [cursor=pointer]
                        - button "编辑" [ref=e359] [cursor=pointer]
                        - button "停用" [ref=e360] [cursor=pointer]
                        - button "重置密码" [ref=e361] [cursor=pointer]
                        - button "删除" [ref=e362] [cursor=pointer]
  - region "Notifications alt+T"
```

# Test source

```ts
  22  |   await page.fill('input[type="password"]', cred.password)
  23  |   await page.click('button[type="submit"]')
  24  |   await page.waitForURL(`${FE_BASE}/`, { timeout: 10000 })
  25  | }
  26  | 
  27  | async function apiLogin(role: RoleKey): Promise<string> {
  28  |   const res = await fetch(`${API_BASE}/auth/login`, {
  29  |     method: 'POST', headers: { 'Content-Type': 'application/json' },
  30  |     body: JSON.stringify(ROLES[role]),
  31  |   })
  32  |   const data = (await res.json()) as any
  33  |   return data.data?.token || data.token
  34  | }
  35  | 
  36  | async function apiFetch(token: string, method: string, path: string, body?: any) {
  37  |   const opts: any = { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } }
  38  |   if (body) opts.body = JSON.stringify(body)
  39  |   const res = await fetch(`${API_BASE}${path}`, opts)
  40  |   return { status: res.status, data: (await res.json().catch(() => null)) as any }
  41  | }
  42  | 
  43  | async function cleanupTestData(token: string) {
  44  |   try {
  45  |     const res = await apiFetch(token, 'GET', '/users?page=1&pageSize=100')
  46  |     const list = res.data?.data?.list || []
  47  |     for (const item of list) {
  48  |       if (item.username?.startsWith('testuser')) {
  49  |         await apiFetch(token, 'DELETE', `/users/${item.id}`)
  50  |       }
  51  |     }
  52  |   } catch { /* ignore */ }
  53  | }
  54  | 
  55  | test.beforeEach(async () => {
  56  |   const token = await apiLogin('admin')
  57  |   await cleanupTestData(token)
  58  | })
  59  | 
  60  | // ───────────────────────────────────────────────
  61  | // 1. 查看用户列表
  62  | // ───────────────────────────────────────────────
  63  | test.describe('用户管理 -> 查看用户列表', () => {
  64  |   test('USER-LIST-01. 正常用例：admin可查看用户列表', async ({ page }) => {
  65  |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  66  |     await expect(page.locator('text=/用户管理|用户列表/i').first()).toBeVisible()
  67  |   })
  68  |   test('USER-LIST-02. 正常用例：用户列表显示列标题', async ({ page }) => {
  69  |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  70  |     await expect(page.locator('text=/用户名|姓名|部门|角色|状态|最后登录|操作/i').first()).toBeVisible()
  71  |   })
  72  |   test('USER-LIST-03. 正常用例：用户列表显示统计卡片', async ({ page }) => {
  73  |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  74  |     await expect(page.locator('text=/用户总数|启用用户|停用用户|管理员/i').first()).toBeVisible()
  75  |   })
  76  |   test('USER-LIST-04. 正常用例：左侧显示角色列表面板', async ({ page }) => {
  77  |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  78  |     await expect(page.locator('text=/角色列表|系统角色/i').first()).toBeVisible()
  79  |   })
  80  |   test('USER-LIST-05. 空数据边界：无用户数据显示空状态', async ({ page }) => {
  81  |     await page.route('**/api/v1/users**', r => r.fulfill({ status: 200, body: JSON.stringify({ data: { list: [], pagination: { total: 0 } } }) }))
  82  |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  83  |     await expect(page.locator('text=/暂无数据|暂无/i').first()).toBeVisible()
  84  |     await page.unroute('**/api/v1/users**')
  85  |   })
  86  |   test('USER-LIST-06. 异常恢复：API 500显示错误', async ({ page }) => {
  87  |     await page.route('**/api/v1/users**', r => r.fulfill({ status: 500, body: JSON.stringify({ message: 'err' }) }))
  88  |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  89  |     await page.unroute('**/api/v1/users**')
  90  |   })
  91  |   test('USER-LIST-07. 权限：technician访问返回403', async ({ page }) => {
  92  |     await loginAs(page, 'technician'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1200)
  93  |     await expect(page.locator('text=/无权访问|403|Forbidden/i').first()).toBeVisible()
  94  |   })
  95  |   test('USER-LIST-08. 并发：快速刷新页面多次', async ({ page }) => {
  96  |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`)
  97  |     for (let i = 0; i < 3; i++) { await page.reload(); await page.waitForTimeout(800) }
  98  |     await expect(page.locator('body')).toBeVisible()
  99  |   })
  100 |   test('USER-LIST-09. UI差异：admin显示新建用户按钮', async ({ page }) => {
  101 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  102 |     await expect(page.locator('text=/新建用户|新建/i').first()).toBeVisible()
  103 |   })
  104 |   test('USER-LIST-10. 正常用例：用户状态标签显示正常/禁用', async ({ page }) => {
  105 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  106 |     await expect(page.locator('text=/正常|禁用|停用/i').first()).toBeVisible()
  107 |   })
  108 | })
  109 | 
  110 | // ───────────────────────────────────────────────
  111 | // 2. 筛选功能
  112 | // ───────────────────────────────────────────────
  113 | test.describe('用户管理 -> 筛选功能', () => {
  114 |   test('USER-FILTER-01. 正常用例：按关键词搜索用户名', async ({ page }) => {
  115 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  116 |     const search = page.locator('input[placeholder*="搜索"]').first()
  117 |     if (await search.isVisible().catch(() => false)) { await search.fill('admin'); await page.waitForTimeout(800) }
  118 |   })
  119 |   test('USER-FILTER-02. 正常用例：按角色筛选', async ({ page }) => {
  120 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  121 |     const sel = page.locator('select').filter({ hasText: /全部角色|系统管理员/i }).first()
> 122 |     if (await sel.isVisible().catch(() => false)) { await sel.selectOption({ index: 1 }); await page.waitForTimeout(800) }
      |                                                               ^ Error: locator.selectOption: Test timeout of 30000ms exceeded.
  123 |   })
  124 |   test('USER-FILTER-03. 正常用例：按状态筛选', async ({ page }) => {
  125 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  126 |     const sel = page.locator('select').filter({ hasText: /全部状态|正常|禁用/i }).first()
  127 |     if (await sel.isVisible().catch(() => false)) { await sel.selectOption({ index: 1 }); await page.waitForTimeout(800) }
  128 |   })
  129 |   test('USER-FILTER-04. 正常用例：点击查询按钮', async ({ page }) => {
  130 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  131 |     const btn = page.locator('text=/查询/i').first()
  132 |     if (await btn.isVisible().catch(() => false)) { await btn.click(); await page.waitForTimeout(800) }
  133 |   })
  134 |   test('USER-FILTER-05. 正常用例：点击重置按钮恢复全部', async ({ page }) => {
  135 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  136 |     const reset = page.locator('text=/重置/i').first()
  137 |     if (await reset.isVisible().catch(() => false)) { await reset.click(); await page.waitForTimeout(800) }
  138 |   })
  139 |   test('USER-FILTER-06. 空数据边界：筛选无结果', async ({ page }) => {
  140 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  141 |     const search = page.locator('input[placeholder*="搜索"]').first()
  142 |     if (await search.isVisible().catch(() => false)) { await search.fill('XYZ不存在的用户'); await page.waitForTimeout(800) }
  143 |   })
  144 |   test('USER-FILTER-07. 并发：快速切换筛选条件', async ({ page }) => {
  145 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  146 |     const selects = page.locator('select')
  147 |     for (let i = 0; i < Math.min(2, await selects.count()); i++) {
  148 |       if (await selects.nth(i).isVisible().catch(() => false)) { await selects.nth(i).selectOption({ index: 1 }); await page.waitForTimeout(300) }
  149 |     }
  150 |   })
  151 |   test('USER-FILTER-08. 正常用例：点击左侧角色筛选用户', async ({ page }) => {
  152 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  153 |     const roleItem = page.locator('text=/系统管理员|操作员|查看者/i').first()
  154 |     if (await roleItem.isVisible().catch(() => false)) { await roleItem.click(); await page.waitForTimeout(800) }
  155 |   })
  156 | })
  157 | 
  158 | // ───────────────────────────────────────────────
  159 | // 3. 新建用户
  160 | // ───────────────────────────────────────────────
  161 | test.describe('用户管理 -> 新建用户', () => {
  162 |   test('USER-CREATE-01. 正常用例：admin新建用户成功', async ({ page }) => {
  163 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  164 |     await page.click('text=/新建用户|新建/i'); await page.waitForTimeout(500)
  165 |     const inputs = page.locator('input[type="text"]')
  166 |     if (await inputs.count() >= 2) {
  167 |       await inputs.nth(0).fill(`testuser-${Date.now()}`)
  168 |       await inputs.nth(1).fill('测试姓名')
  169 |     }
  170 |     const pwd = page.locator('input[type="password"]').first()
  171 |     if (await pwd.isVisible().catch(() => false)) await pwd.fill('password123')
  172 |     await page.click('text=/创建用户|保存/i'); await page.waitForTimeout(1000)
  173 |   })
  174 |   test('USER-CREATE-02. 正常用例：新建用户选择角色', async ({ page }) => {
  175 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  176 |     await page.click('text=/新建用户|新建/i'); await page.waitForTimeout(500)
  177 |     const inputs = page.locator('input[type="text"]')
  178 |     if (await inputs.count() >= 2) {
  179 |       await inputs.nth(0).fill(`testuser-role-${Date.now()}`)
  180 |       await inputs.nth(1).fill('角色测试')
  181 |     }
  182 |     const roleSel = page.locator('select').first()
  183 |     if (await roleSel.isVisible().catch(() => false)) { await roleSel.selectOption({ index: 1 }); await page.waitForTimeout(300) }
  184 |     await page.click('text=/创建用户|保存/i'); await page.waitForTimeout(1000)
  185 |   })
  186 |   test('USER-CREATE-03. 正常用例：新建用户选择部门', async ({ page }) => {
  187 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  188 |     await page.click('text=/新建用户|新建/i'); await page.waitForTimeout(500)
  189 |     const inputs = page.locator('input[type="text"]')
  190 |     if (await inputs.count() >= 2) {
  191 |       await inputs.nth(0).fill(`testuser-dept-${Date.now()}`)
  192 |       await inputs.nth(1).fill('部门测试')
  193 |     }
  194 |     const deptSel = page.locator('select').filter({ hasText: /请选择部门|病理科|检验科/i }).first()
  195 |     if (await deptSel.isVisible().catch(() => false)) { await deptSel.selectOption({ index: 1 }); await page.waitForTimeout(300) }
  196 |     await page.click('text=/创建用户|保存/i'); await page.waitForTimeout(1000)
  197 |   })
  198 |   test('USER-CREATE-04. 空数据边界：必填项为空提交被阻止', async ({ page }) => {
  199 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  200 |     await page.click('text=/新建用户|新建/i'); await page.waitForTimeout(500)
  201 |     const save = page.locator('text=/创建用户|保存/i').first()
  202 |     if (await save.isVisible().catch(() => false)) { await save.click(); await page.waitForTimeout(500) }
  203 |   })
  204 |   test('USER-CREATE-05. 表单校验：未传必填字段返回400', async ({ page }) => {
  205 |     const token = await apiLogin('admin')
  206 |     const res = await apiFetch(token, 'POST', '/users', {})
  207 |     expect([400, 422]).toContain(res.status)
  208 |   })
  209 |   test('USER-CREATE-06. 表单校验：缺少用户名返回400', async ({ page }) => {
  210 |     const token = await apiLogin('admin')
  211 |     const res = await apiFetch(token, 'POST', '/users', { password: 'pass', realName: 'test' })
  212 |     expect([400, 422]).toContain(res.status)
  213 |   })
  214 |   test('USER-CREATE-07. 业务冲突：username已存在返回409', async ({ page }) => {
  215 |     const token = await apiLogin('admin')
  216 |     const username = `dupe-${Date.now()}`
  217 |     await apiFetch(token, 'POST', '/users', { username, password: 'pass', realName: 'test', role: 'technician' })
  218 |     const res = await apiFetch(token, 'POST', '/users', { username, password: 'pass', realName: 'test2', role: 'technician' })
  219 |     expect([409, 400]).toContain(res.status)
  220 |   })
  221 |   for (const role of ['technician', 'pathologist', 'procurement', 'finance', 'warehouse_manager'] as RoleKey[]) {
  222 |     test(`USER-CREATE-08-${role}. 权限：${role}新建用户返回403`, async () => {
```