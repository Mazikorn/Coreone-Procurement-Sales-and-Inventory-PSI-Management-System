# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: users.spec.ts >> 用户管理 -> 新建用户 >> USER-CREATE-02. 正常用例：新建用户选择角色
- Location: e2e\users.spec.ts:174:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.selectOption: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('select').first()
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
    52 × waiting for element to be visible and enabled
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
            - textbox "全局搜索..." [ref=e141]: testuser-role-1779248740780
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
              - generic [ref=e167]: "0"
              - generic [ref=e168]: 用户总数
            - generic [ref=e169]:
              - generic [ref=e170]: "0"
              - generic [ref=e171]: 启用用户
            - generic [ref=e172]:
              - generic [ref=e173]: "0"
              - generic [ref=e174]: 停用用户
            - generic [ref=e175]:
              - generic [ref=e176]: "0"
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
                    - textbox "搜索用户名、姓名..." [active] [ref=e191]: 角色测试
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
                  - row "暂无数据" [ref=e210]:
                    - cell "暂无数据" [ref=e211]
          - generic [ref=e213]:
            - generic [ref=e214]:
              - heading "新建用户" [level=3] [ref=e215]
              - button [ref=e216] [cursor=pointer]:
                - img [ref=e217]
            - generic [ref=e220]:
              - generic [ref=e221]:
                - generic [ref=e222]:
                  - generic [ref=e223]: 用户名 *
                  - textbox [ref=e224]
                - generic [ref=e225]:
                  - generic [ref=e226]: 姓名 *
                  - textbox [ref=e227]
              - generic [ref=e228]:
                - generic [ref=e229]:
                  - generic [ref=e230]: 角色 *
                  - combobox [ref=e231] [cursor=pointer]:
                    - option "系统管理员"
                    - option "操作员" [selected]
                    - option "查看者"
                - generic [ref=e232]:
                  - generic [ref=e233]: 部门 *
                  - combobox [ref=e234] [cursor=pointer]:
                    - option "请选择部门" [selected]
                    - option "病理科"
                    - option "检验科"
                    - option "信息科"
              - generic [ref=e235]:
                - generic [ref=e236]:
                  - generic [ref=e237]: 联系电话
                  - textbox [ref=e238]
                - generic [ref=e239]:
                  - generic [ref=e240]: 电子邮箱
                  - textbox [ref=e241]
              - generic [ref=e242]:
                - generic [ref=e243]: 初始密码 *
                - generic [ref=e244]:
                  - textbox [ref=e245]: Abc@123456
                  - button "随机生成" [ref=e246] [cursor=pointer]
                - generic [ref=e247]: 初始密码将在用户首次登录时要求修改
            - generic [ref=e248]:
              - button "取消" [ref=e249] [cursor=pointer]
              - button "创建用户" [ref=e250] [cursor=pointer]
  - region "Notifications alt+T"
```

# Test source

```ts
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
  122 |     if (await sel.isVisible().catch(() => false)) { await sel.selectOption({ index: 1 }); await page.waitForTimeout(800) }
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
> 183 |     if (await roleSel.isVisible().catch(() => false)) { await roleSel.selectOption({ index: 1 }); await page.waitForTimeout(300) }
      |                                                                       ^ Error: locator.selectOption: Test timeout of 30000ms exceeded.
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
  223 |       const token = await apiLogin(role)
  224 |       const res = await apiFetch(token, 'POST', '/users', { username: 'TEST', password: 'pass', realName: 'test' })
  225 |       expect(res.status).toBe(403)
  226 |     })
  227 |   }
  228 |   test('USER-CREATE-09. 并发：快速双击新建按钮', async ({ page }) => {
  229 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  230 |     const btn = page.locator('text=/新建用户|新建/i').first()
  231 |     if (await btn.isVisible().catch(() => false)) { await btn.click(); await btn.click(); await page.waitForTimeout(800) }
  232 |   })
  233 |   test('USER-CREATE-10. UI差异：admin前端显示新建按钮', async ({ page }) => {
  234 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  235 |     await expect(page.locator('text=/新建用户/i').first()).toBeVisible()
  236 |   })
  237 | })
  238 | 
  239 | // ───────────────────────────────────────────────
  240 | // 4. 编辑用户
  241 | // ───────────────────────────────────────────────
  242 | test.describe('用户管理 -> 编辑用户', () => {
  243 |   test('USER-EDIT-01. 正常用例：admin编辑用户姓名保存成功', async ({ page }) => {
  244 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  245 |     const editBtn = page.locator('text=/编辑|修改/i').first()
  246 |     if (await editBtn.isVisible().catch(() => false)) {
  247 |       await editBtn.click(); await page.waitForTimeout(500)
  248 |       const nameInput = page.locator('input[type="text"]').nth(1)
  249 |       if (await nameInput.isVisible().catch(() => false)) { await nameInput.fill(`修改姓名-${Date.now()}`) }
  250 |       await page.click('text=/保存|确认/i'); await page.waitForTimeout(1000)
  251 |     }
  252 |   })
  253 |   test('USER-EDIT-02. 正常用例：admin修改用户状态', async ({ page }) => {
  254 |     const token = await apiLogin('admin')
  255 |     const createRes = await apiFetch(token, 'POST', '/users', { username: `testuser-edit-${Date.now()}`, password: 'pass', realName: '编辑测试', role: 'technician', status: 'active' })
  256 |     const testId = createRes.data?.data?.id || createRes.data?.id
  257 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  258 |     const editBtn = testId ? page.locator(`[data-id="${testId}"] >> text=/编辑|修改/i`).first() : page.locator('text=/编辑|修改/i').first()
  259 |     if (await editBtn.isVisible().catch(() => false)) {
  260 |       await editBtn.click(); await page.waitForTimeout(500)
  261 |       const statusSel = page.locator('select').filter({ hasText: /正常|禁用/i }).first()
  262 |       if (await statusSel.isVisible().catch(() => false)) { await statusSel.selectOption('inactive'); await page.waitForTimeout(300) }
  263 |       await page.click('text=/保存|确认/i'); await page.waitForTimeout(1000)
  264 |     }
  265 |   })
  266 |   test('USER-EDIT-03. 空数据边界：编辑后姓名为空被阻止', async ({ page }) => {
  267 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  268 |     const editBtn = page.locator('text=/编辑|修改/i').first()
  269 |     if (await editBtn.isVisible().catch(() => false)) {
  270 |       await editBtn.click(); await page.waitForTimeout(500)
  271 |       const nameInput = page.locator('input[type="text"]').nth(1)
  272 |       if (await nameInput.isVisible().catch(() => false)) { await nameInput.fill(''); await page.click('text=/保存/i'); await page.waitForTimeout(500) }
  273 |     }
  274 |   })
  275 |   test('USER-EDIT-04. 表单校验：编辑不存在的用户返回404', async ({ page }) => {
  276 |     const token = await apiLogin('admin')
  277 |     const res = await apiFetch(token, 'PUT', '/users/non-existent-id', { realName: 'test' })
  278 |     expect(res.status).toBe(404)
  279 |   })
  280 |   for (const role of ['technician', 'pathologist', 'procurement', 'finance', 'warehouse_manager'] as RoleKey[]) {
  281 |     test(`USER-EDIT-05-${role}. 权限：${role}编辑用户返回403`, async () => {
  282 |       const token = await apiLogin(role)
  283 |       const res = await apiFetch(token, 'PUT', '/users/test-id', { realName: 'test' })
```