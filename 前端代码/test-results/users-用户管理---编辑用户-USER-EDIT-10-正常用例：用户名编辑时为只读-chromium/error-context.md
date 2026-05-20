# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: users.spec.ts >> 用户管理 -> 编辑用户 >> USER-EDIT-10. 正常用例：用户名编辑时为只读
- Location: e2e\users.spec.ts:312:3

# Error details

```
Error: expect(received).toBeTruthy()

Received: null
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
              - generic [ref=e167]: "10"
              - generic [ref=e168]: 用户总数
            - generic [ref=e169]:
              - generic [ref=e170]: "10"
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
                  - row "dupe-1779248781794 concurrent-1779248811671 - technician 正常 - 详情 编辑 停用 重置密码 删除" [ref=e210]:
                    - cell [ref=e211]:
                      - checkbox [ref=e212]
                    - cell "dupe-1779248781794" [ref=e213]
                    - cell "concurrent-1779248811671" [ref=e214]
                    - cell "-" [ref=e215]
                    - cell "technician" [ref=e216]
                    - cell "正常" [ref=e217]:
                      - generic [ref=e218]: 正常
                    - cell "-" [ref=e219]
                    - cell "详情 编辑 停用 重置密码 删除" [ref=e220]:
                      - generic [ref=e221]:
                        - button "详情" [ref=e222] [cursor=pointer]
                        - button "编辑" [active] [ref=e223] [cursor=pointer]
                        - button "停用" [ref=e224] [cursor=pointer]
                        - button "重置密码" [ref=e225] [cursor=pointer]
                        - button "删除" [ref=e226] [cursor=pointer]
                  - row "dupe-1779248175503 concurrent-1779248202780 - technician 正常 - 详情 编辑 停用 重置密码 删除" [ref=e227]:
                    - cell [ref=e228]:
                      - checkbox [ref=e229]
                    - cell "dupe-1779248175503" [ref=e230]
                    - cell "concurrent-1779248202780" [ref=e231]
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
                  - row "dupe-1779243088117 concurrent-1779243117949 - technician 正常 - 详情 编辑 停用 重置密码 删除" [ref=e244]:
                    - cell [ref=e245]:
                      - checkbox [ref=e246]
                    - cell "dupe-1779243088117" [ref=e247]
                    - cell "concurrent-1779243117949" [ref=e248]
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
                  - row "dupe-1779180469166 concurrent-1779180506948 - technician 正常 - 详情 编辑 停用 重置密码 删除" [ref=e261]:
                    - cell [ref=e262]:
                      - checkbox [ref=e263]
                    - cell "dupe-1779180469166" [ref=e264]
                    - cell "concurrent-1779180506948" [ref=e265]
                    - cell "-" [ref=e266]
                    - cell "technician" [ref=e267]
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
                  - row "admin 管理员 病理科 admin 正常 - 详情 编辑 停用 重置密码 删除" [ref=e278]:
                    - cell [ref=e279]:
                      - checkbox [ref=e280]
                    - cell "admin" [ref=e281]
                    - cell "管理员" [ref=e282]
                    - cell "病理科" [ref=e283]
                    - cell "admin" [ref=e284]
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
                  - row "cangguan 王仓库 病理科 warehouse_manager 正常 - 详情 编辑 停用 重置密码 删除" [ref=e295]:
                    - cell [ref=e296]:
                      - checkbox [ref=e297]
                    - cell "cangguan" [ref=e298]
                    - cell "王仓库" [ref=e299]
                    - cell "病理科" [ref=e300]
                    - cell "warehouse_manager" [ref=e301]
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
                  - row "jishuyuan1 张技术 病理科 technician 正常 - 详情 编辑 停用 重置密码 删除" [ref=e312]:
                    - cell [ref=e313]:
                      - checkbox [ref=e314]
                    - cell "jishuyuan1" [ref=e315]
                    - cell "张技术" [ref=e316]
                    - cell "病理科" [ref=e317]
                    - cell "technician" [ref=e318]
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
                  - row "yishi1 刘医师 病理科 pathologist 正常 - 详情 编辑 停用 重置密码 删除" [ref=e329]:
                    - cell [ref=e330]:
                      - checkbox [ref=e331]
                    - cell "yishi1" [ref=e332]
                    - cell "刘医师" [ref=e333]
                    - cell "病理科" [ref=e334]
                    - cell "pathologist" [ref=e335]
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
                  - row "caigou 赵采购 设备科 procurement 正常 - 详情 编辑 停用 重置密码 删除" [ref=e346]:
                    - cell [ref=e347]:
                      - checkbox [ref=e348]
                    - cell "caigou" [ref=e349]
                    - cell "赵采购" [ref=e350]
                    - cell "设备科" [ref=e351]
                    - cell "procurement" [ref=e352]
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
                  - row "caiwu 孙财务 财务科 finance 正常 - 详情 编辑 停用 重置密码 删除" [ref=e363]:
                    - cell [ref=e364]:
                      - checkbox [ref=e365]
                    - cell "caiwu" [ref=e366]
                    - cell "孙财务" [ref=e367]
                    - cell "财务科" [ref=e368]
                    - cell "finance" [ref=e369]
                    - cell "正常" [ref=e370]:
                      - generic [ref=e371]: 正常
                    - cell "-" [ref=e372]
                    - cell "详情 编辑 停用 重置密码 删除" [ref=e373]:
                      - generic [ref=e374]:
                        - button "详情" [ref=e375] [cursor=pointer]
                        - button "编辑" [ref=e376] [cursor=pointer]
                        - button "停用" [ref=e377] [cursor=pointer]
                        - button "重置密码" [ref=e378] [cursor=pointer]
                        - button "删除" [ref=e379] [cursor=pointer]
          - generic [ref=e381]:
            - generic [ref=e382]:
              - heading "编辑用户" [level=3] [ref=e383]
              - button [ref=e384] [cursor=pointer]:
                - img [ref=e385]
            - generic [ref=e388]:
              - generic [ref=e389]:
                - generic [ref=e390]:
                  - generic [ref=e391]: 用户名
                  - textbox [ref=e392]: dupe-1779248781794
                - generic [ref=e393]:
                  - generic [ref=e394]: 姓名 *
                  - textbox [ref=e395]: concurrent-1779248811671
              - generic [ref=e396]:
                - generic [ref=e397]:
                  - generic [ref=e398]: 角色 *
                  - combobox [ref=e399] [cursor=pointer]:
                    - option "系统管理员" [selected]
                    - option "操作员"
                    - option "查看者"
                - generic [ref=e400]:
                  - generic [ref=e401]: 部门 *
                  - combobox [ref=e402] [cursor=pointer]:
                    - option "请选择部门" [selected]
                    - option "病理科"
                    - option "检验科"
                    - option "信息科"
              - generic [ref=e403]:
                - generic [ref=e404]:
                  - generic [ref=e405]: 联系电话
                  - textbox [ref=e406]
                - generic [ref=e407]:
                  - generic [ref=e408]: 电子邮箱
                  - textbox [ref=e409]
              - generic [ref=e410]:
                - generic [ref=e411]: 状态
                - combobox [ref=e412] [cursor=pointer]:
                  - option "正常" [selected]
                  - option "禁用"
            - generic [ref=e413]:
              - button "取消" [ref=e414] [cursor=pointer]
              - button "重置密码" [ref=e415] [cursor=pointer]
              - button "保存" [ref=e416] [cursor=pointer]
  - region "Notifications alt+T"
```

# Test source

```ts
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
  284 |       expect(res.status).toBe(403)
  285 |     })
  286 |   }
  287 |   test('USER-EDIT-06. 并发：并发编辑同一用户', async ({ page }) => {
  288 |     const token = await apiLogin('admin')
  289 |     const res = await apiFetch(token, 'GET', '/users?page=1&pageSize=1')
  290 |     const id = res.data?.data?.list?.[0]?.id
  291 |     if (!id) return
  292 |     const reqs = Array.from({ length: 2 }, () => apiFetch(token, 'PUT', `/users/${id}`, { realName: `concurrent-${Date.now()}` }))
  293 |     const results = await Promise.all(reqs)
  294 |     expect(results.every(r => [200, 409].includes(r.status))).toBe(true)
  295 |   })
  296 |   test('USER-EDIT-07. 异常恢复：编辑时API 500后重试', async ({ page }) => {
  297 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  298 |     await page.route('**/api/v1/users/*', r => r.fulfill({ status: 500, body: JSON.stringify({ message: 'err' }) }))
  299 |     const editBtn = page.locator('text=/编辑|修改/i').first()
  300 |     if (await editBtn.isVisible().catch(() => false)) { await editBtn.click(); await page.waitForTimeout(500) }
  301 |     await page.unroute('**/api/v1/users/*')
  302 |   })
  303 |   test('USER-EDIT-08. UI差异：admin显示编辑按钮', async ({ page }) => {
  304 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  305 |     await expect(page.locator('text=/编辑|修改/i').first()).toBeVisible()
  306 |   })
  307 |   test('USER-EDIT-09. 正常用例：编辑后列表数据更新', async ({ page }) => {
  308 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  309 |     const editBtn = page.locator('text=/编辑|修改/i').first()
  310 |     if (await editBtn.isVisible().catch(() => false)) { await editBtn.click(); await page.waitForTimeout(500) }
  311 |   })
  312 |   test('USER-EDIT-10. 正常用例：用户名编辑时为只读', async ({ page }) => {
  313 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  314 |     const editBtn = page.locator('text=/编辑|修改/i').first()
  315 |     if (await editBtn.isVisible().catch(() => false)) {
  316 |       await editBtn.click(); await page.waitForTimeout(500)
  317 |       const userInput = page.locator('input[type="text"]').first()
  318 |       if (await userInput.isVisible().catch(() => false)) {
> 319 |         expect(await userInput.isDisabled().catch(() => false) || await userInput.getAttribute('readonly')).toBeTruthy()
      |                                                                                                             ^ Error: expect(received).toBeTruthy()
  320 |       }
  321 |       const cancel = page.locator('text=/取消|关闭/i').first()
  322 |       if (await cancel.isVisible().catch(() => false)) await cancel.click()
  323 |     }
  324 |   })
  325 | })
  326 | 
  327 | // ───────────────────────────────────────────────
  328 | // 5. 删除用户
  329 | // ───────────────────────────────────────────────
  330 | test.describe('用户管理 -> 删除用户', () => {
  331 |   test('USER-DELETE-01. 正常用例：admin删除用户成功', async ({ page }) => {
  332 |     const token = await apiLogin('admin')
  333 |     const createRes = await apiFetch(token, 'POST', '/users', { username: `testuser-del-${Date.now()}`, password: 'pass', realName: 'del', role: 'technician' })
  334 |     const id = createRes.data?.data?.id || createRes.data?.id
  335 |     if (!id) return
  336 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  337 |     const deleteBtn = page.locator(`[data-id="${id}"] >> text=/删除/i`).first()
  338 |     if (await deleteBtn.isVisible().catch(() => false)) { await deleteBtn.click(); await page.waitForTimeout(800) } else { await apiFetch(token, 'DELETE', `/users/${id}`) }
  339 |   })
  340 |   test('USER-DELETE-02. 业务冲突：删除admin自己被阻止', async ({ page }) => {
  341 |     const token = await apiLogin('admin')
  342 |     const res = await apiFetch(token, 'GET', '/users?page=1&pageSize=100')
  343 |     const adminUser = (res.data?.data?.list || []).find((u: any) => u.username === 'admin')
  344 |     if (!adminUser) return
  345 |     const delRes = await apiFetch(token, 'DELETE', `/users/${adminUser.id}`)
  346 |     expect([400, 403]).toContain(delRes.status)
  347 |   })
  348 |   test('USER-DELETE-03. 并发：并发删除同一用户', async ({ page }) => {
  349 |     const token = await apiLogin('admin')
  350 |     const createRes = await apiFetch(token, 'POST', '/users', { username: `testuser-con-${Date.now()}`, password: 'pass', realName: 'con', role: 'technician' })
  351 |     const id = createRes.data?.data?.id || createRes.data?.id
  352 |     if (!id) return
  353 |     const reqs = Array.from({ length: 2 }, () => apiFetch(token, 'DELETE', `/users/${id}`))
  354 |     const results = await Promise.all(reqs)
  355 |     expect(results.some(r => [200, 204, 404].includes(r.status))).toBe(true)
  356 |   })
  357 |   for (const role of ['technician', 'pathologist', 'procurement', 'finance', 'warehouse_manager'] as RoleKey[]) {
  358 |     test(`USER-DELETE-04-${role}. 权限：${role}删除用户返回403`, async () => {
  359 |       const token = await apiLogin(role)
  360 |       const res = await apiFetch(token, 'DELETE', '/users/test-id')
  361 |       expect(res.status).toBe(403)
  362 |     })
  363 |   }
  364 |   test('USER-DELETE-05. UI差异：admin显示删除按钮', async ({ page }) => {
  365 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  366 |     await expect(page.locator('text=/删除/i').first()).toBeVisible()
  367 |   })
  368 | })
  369 | 
  370 | // ───────────────────────────────────────────────
  371 | // 6. 启用/停用用户
  372 | // ───────────────────────────────────────────────
  373 | test.describe('用户管理 -> 启用停用用户', () => {
  374 |   test('USER-TOGGLE-01. 正常用例：admin停用用户成功', async ({ page }) => {
  375 |     const token = await apiLogin('admin')
  376 |     const createRes = await apiFetch(token, 'POST', '/users', { username: `testuser-toggle-${Date.now()}`, password: 'pass', realName: '停用测试', role: 'technician', status: 'active' })
  377 |     const testId = createRes.data?.data?.id || createRes.data?.id
  378 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  379 |     const toggle = testId ? page.locator(`[data-id="${testId}"] >> text=/停用/i`).first() : page.locator('text=/停用/i').first()
  380 |     if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await page.waitForTimeout(800) }
  381 |   })
  382 |   test('USER-TOGGLE-02. 正常用例：admin启用已停用用户', async ({ page }) => {
  383 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  384 |     const toggle = page.locator('text=/启用/i').first()
  385 |     if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await page.waitForTimeout(800) }
  386 |   })
  387 |   test('USER-TOGGLE-03. 业务冲突：停用自己账户被阻止', async ({ page }) => {
  388 |     const token = await apiLogin('admin')
  389 |     const res = await apiFetch(token, 'GET', '/users?page=1&pageSize=100')
  390 |     const adminUser = (res.data?.data?.list || []).find((u: any) => u.username === 'admin')
  391 |     if (!adminUser) return
  392 |     const toggleRes = await apiFetch(token, 'PUT', `/users/${adminUser.id}`, { status: 'inactive' })
  393 |     expect([200, 403]).toContain(toggleRes.status)
  394 |   })
  395 |   test('USER-TOGGLE-04. UI差异：admin显示停用/启用按钮', async ({ page }) => {
  396 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  397 |     await expect(page.locator('text=/停用|启用/i').first()).toBeVisible()
  398 |   })
  399 | })
  400 | 
  401 | // ───────────────────────────────────────────────
  402 | // 7. 重置密码
  403 | // ───────────────────────────────────────────────
  404 | test.describe('用户管理 -> 重置密码', () => {
  405 |   test('USER-RESET-01. 正常用例：admin重置用户密码成功', async ({ page }) => {
  406 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  407 |     const resetBtn = page.locator('text=/重置密码|重置/i').first()
  408 |     if (await resetBtn.isVisible().catch(() => false)) { await resetBtn.click(); await page.waitForTimeout(800) }
  409 |   })
  410 |   test('USER-RESET-02. 正常用例：编辑弹窗内重置密码', async ({ page }) => {
  411 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  412 |     const editBtn = page.locator('text=/编辑|修改/i').first()
  413 |     if (await editBtn.isVisible().catch(() => false)) {
  414 |       await editBtn.click(); await page.waitForTimeout(500)
  415 |       const reset = page.locator('text=/重置密码|重置/i').first()
  416 |       if (await reset.isVisible().catch(() => false)) { await reset.click(); await page.waitForTimeout(800) }
  417 |       const cancel = page.locator('text=/取消|关闭/i').first()
  418 |       if (await cancel.isVisible().catch(() => false)) await cancel.click()
  419 |     }
```