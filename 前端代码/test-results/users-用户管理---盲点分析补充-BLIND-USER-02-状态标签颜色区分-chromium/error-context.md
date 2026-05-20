# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: users.spec.ts >> 用户管理 -> 盲点分析补充 >> BLIND-USER-02. 状态标签颜色区分
- Location: e2e\users.spec.ts:581:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator:  locator('text=/正常|禁用/i').first()
Expected: visible
Received: hidden
Timeout:  5000ms

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('text=/正常|禁用/i').first()
    9 × locator resolved to <option value="active">正常</option>
      - unexpected value "hidden"

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
                        - button "编辑" [ref=e223] [cursor=pointer]
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
  - region "Notifications alt+T"
```

# Test source

```ts
  483 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  484 |     const next = page.locator('text=/下一页/i').first()
  485 |     if (await next.isVisible().catch(() => false)) { expect(await next.isDisabled().catch(() => false)).toBe(true) }
  486 |   })
  487 |   test('USER-PAGE-03. 并发：快速切换分页', async ({ page }) => {
  488 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  489 |     const next = page.locator('text=/下一页/i').first()
  490 |     for (let i = 0; i < 3; i++) { if (await next.isVisible().catch(() => false)) await next.click() }
  491 |     await page.waitForTimeout(800)
  492 |   })
  493 | })
  494 | 
  495 | // ───────────────────────────────────────────────
  496 | // 10. 角色权限矩阵补充
  497 | // ───────────────────────────────────────────────
  498 | test.describe('用户管理 -> 角色权限矩阵补充', () => {
  499 |   const permScenes = [
  500 |     { id: 'TC-PERM-USER-01', role: 'technician' as RoleKey, method: 'GET', path: '/users', expect: 403 },
  501 |     { id: 'TC-PERM-USER-02', role: 'pathologist' as RoleKey, method: 'GET', path: '/users', expect: 403 },
  502 |     { id: 'TC-PERM-USER-03', role: 'procurement' as RoleKey, method: 'GET', path: '/users', expect: 403 },
  503 |     { id: 'TC-PERM-USER-04', role: 'finance' as RoleKey, method: 'GET', path: '/users', expect: 403 },
  504 |     { id: 'TC-PERM-USER-05', role: 'warehouse_manager' as RoleKey, method: 'GET', path: '/users', expect: 403 },
  505 |     { id: 'TC-PERM-USER-06', role: 'admin' as RoleKey, method: 'GET', path: '/users', expect: 200 },
  506 |     { id: 'TC-PERM-USER-07', role: 'technician' as RoleKey, method: 'POST', path: '/users', expect: 403 },
  507 |     { id: 'TC-PERM-USER-08', role: 'technician' as RoleKey, method: 'PUT', path: '/users/test-id', expect: 403 },
  508 |     { id: 'TC-PERM-USER-09', role: 'technician' as RoleKey, method: 'DELETE', path: '/users/test-id', expect: 403 },
  509 |     { id: 'TC-PERM-USER-10', role: 'admin' as RoleKey, method: 'PUT', path: '/users/test-id', expect: 404 },
  510 |   ]
  511 |   for (const scene of permScenes) {
  512 |     test(`${scene.id}. ${scene.role} ${scene.method} ${scene.path} 返回${scene.expect}`, async () => {
  513 |       const token = await apiLogin(scene.role)
  514 |       const res = await apiFetch(token, scene.method, scene.path, scene.method === 'POST' ? { username: 'TEST', password: 'pass', realName: 'test' } : { realName: 'test' })
  515 |       expect(res.status).toBe(scene.expect)
  516 |     })
  517 |   }
  518 | })
  519 | 
  520 | // ───────────────────────────────────────────────
  521 | // 11. 业务流程树
  522 | // ───────────────────────────────────────────────
  523 | test.describe('用户管理 -> 业务流程树', () => {
  524 |   test('BF-USER-01. 主路径：创建用户→配置角色→保存', async ({ page }) => {
  525 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  526 |     await page.click('text=/新建用户|新建/i'); await page.waitForTimeout(500)
  527 |     const inputs = page.locator('input[type="text"]')
  528 |     if (await inputs.count() >= 2) {
  529 |       await inputs.nth(0).fill(`testuser-bf-${Date.now()}`)
  530 |       await inputs.nth(1).fill('流程测试')
  531 |     }
  532 |     await page.click('text=/创建用户|保存/i'); await page.waitForTimeout(1000)
  533 |   })
  534 |   test('BF-USER-02. 分支：创建用户时不填必填项被阻止', async ({ page }) => {
  535 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  536 |     await page.click('text=/新建用户|新建/i'); await page.waitForTimeout(500)
  537 |     const save = page.locator('text=/创建用户|保存/i').first()
  538 |     if (await save.isVisible().catch(() => false)) { await save.click(); await page.waitForTimeout(500) }
  539 |   })
  540 |   test('BF-USER-03. 分支：编辑用户后取消不保存', async ({ page }) => {
  541 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  542 |     const edit = page.locator('text=/编辑|修改/i').first()
  543 |     if (await edit.isVisible().catch(() => false)) { await edit.click(); await page.waitForTimeout(500); await page.click('text=/取消|关闭/i'); await page.waitForTimeout(500) }
  544 |   })
  545 |   test('BF-USER-04. 分支：停用用户后重新启用', async ({ page }) => {
  546 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  547 |     const toggle = page.locator('text=/停用|启用/i').first()
  548 |     if (await toggle.isVisible().catch(() => false)) { await toggle.click(); await page.waitForTimeout(800) }
  549 |   })
  550 |   test('BF-USER-05. 分支：重置用户密码', async ({ page }) => {
  551 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  552 |     const reset = page.locator('text=/重置密码|重置/i').first()
  553 |     if (await reset.isVisible().catch(() => false)) { await reset.click(); await page.waitForTimeout(800) }
  554 |   })
  555 |   test('BF-USER-06. 分支：筛选后查看用户详情', async ({ page }) => {
  556 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  557 |     const search = page.locator('input[placeholder*="搜索"]').first()
  558 |     if (await search.isVisible().catch(() => false)) { await search.fill('admin'); await page.waitForTimeout(800) }
  559 |     const detail = page.locator('text=/详情/i').first()
  560 |     if (await detail.isVisible().catch(() => false)) { await detail.click(); await page.waitForTimeout(800); await page.click('text=/关闭/i'); await page.waitForTimeout(300) }
  561 |   })
  562 |   test('BF-USER-07. 分支：无权限用户访问被拦截', async ({ page }) => {
  563 |     await loginAs(page, 'technician'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1200)
  564 |     await expect(page.locator('body')).toBeVisible()
  565 |   })
  566 |   test('BF-USER-08. 分支：点击左侧角色筛选用户', async ({ page }) => {
  567 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  568 |     const roleItem = page.locator('text=/系统管理员|操作员/i').first()
  569 |     if (await roleItem.isVisible().catch(() => false)) { await roleItem.click(); await page.waitForTimeout(800) }
  570 |   })
  571 | })
  572 | 
  573 | // ───────────────────────────────────────────────
  574 | // 12. 盲点分析补充
  575 | // ───────────────────────────────────────────────
  576 | test.describe('用户管理 -> 盲点分析补充', () => {
  577 |   test('BLIND-USER-01. 用户头像显示首字母', async ({ page }) => {
  578 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  579 |     await expect(page.locator('body')).toBeVisible()
  580 |   })
  581 |   test('BLIND-USER-02. 状态标签颜色区分', async ({ page }) => {
  582 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
> 583 |     await expect(page.locator('text=/正常|禁用/i').first()).toBeVisible()
      |                                                         ^ Error: expect(locator).toBeVisible() failed
  584 |   })
  585 |   test('BLIND-USER-03. 新建用户初始密码默认显示', async ({ page }) => {
  586 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  587 |     await page.click('text=/新建用户|新建/i'); await page.waitForTimeout(500)
  588 |     await expect(page.locator('text=/初始密码|Abc@123456|随机生成/i').first()).toBeVisible()
  589 |     const cancel = page.locator('text=/取消|关闭/i').first()
  590 |     if (await cancel.isVisible().catch(() => false)) await cancel.click()
  591 |   })
  592 |   test('BLIND-USER-04. 角色下拉选项完整性', async ({ page }) => {
  593 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  594 |     await page.click('text=/新建用户|新建/i'); await page.waitForTimeout(500)
  595 |     const roleSel = page.locator('select').first()
  596 |     if (await roleSel.isVisible().catch(() => false)) {
  597 |       const options = await roleSel.locator('option').allTextContents()
  598 |       expect(options.length).toBeGreaterThanOrEqual(1)
  599 |     }
  600 |     const cancel = page.locator('text=/取消|关闭/i').first()
  601 |     if (await cancel.isVisible().catch(() => false)) await cancel.click()
  602 |   })
  603 |   test('BLIND-USER-05. 用户全选checkbox功能', async ({ page }) => {
  604 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  605 |     const checkAll = page.locator('thead input[type="checkbox"]').first()
  606 |     if (await checkAll.isVisible().catch(() => false)) { await checkAll.click(); await page.waitForTimeout(300) }
  607 |   })
  608 |   test('BLIND-USER-06. 分页页码按钮样式', async ({ page }) => {
  609 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  610 |     await expect(page.locator('text=/上一页|下一页|共.*条/i').first()).toBeVisible()
  611 |   })
  612 |   test('BLIND-USER-07. 响应式布局检查', async ({ page }) => {
  613 |     await page.setViewportSize({ width: 375, height: 667 })
  614 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  615 |     await expect(page.locator('body')).toBeVisible()
  616 |     await page.setViewportSize({ width: 1280, height: 720 })
  617 |   })
  618 |   test('BLIND-USER-08. 用户API响应格式验证', async ({ page }) => {
  619 |     const token = await apiLogin('admin')
  620 |     const res = await apiFetch(token, 'GET', '/users?page=1&pageSize=1')
  621 |     expect(res.status).toBe(200)
  622 |     if (res.data?.data?.list) { expect(Array.isArray(res.data.data.list)).toBe(true) }
  623 |   })
  624 |   test('BLIND-USER-09. 页面加载性能检查', async ({ page }) => {
  625 |     const start = Date.now()
  626 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`)
  627 |     await page.waitForTimeout(1500)
  628 |     expect(Date.now() - start).toBeLessThan(10000)
  629 |   })
  630 |   test('BLIND-USER-10. 用户详情权限列表展示', async ({ page }) => {
  631 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  632 |     const detail = page.locator('text=/详情/i').first()
  633 |     if (await detail.isVisible().catch(() => false)) {
  634 |       await detail.click(); await page.waitForTimeout(1000)
  635 |       await expect(page.locator('text=/权限列表|数据范围/i').first()).toBeVisible()
  636 |       const close = page.locator('text=/关闭/i').first()
  637 |       if (await close.isVisible().catch(() => false)) await close.click()
  638 |     }
  639 |   })
  640 | })
  641 | 
```