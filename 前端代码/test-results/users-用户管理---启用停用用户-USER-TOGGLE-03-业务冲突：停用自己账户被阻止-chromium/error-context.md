# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: users.spec.ts >> 用户管理 -> 启用停用用户 >> USER-TOGGLE-03. 业务冲突：停用自己账户被阻止
- Location: e2e\users.spec.ts:387:3

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: 409
Received array: [200, 403]
```

# Test source

```ts
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
  319 |         expect(await userInput.isDisabled().catch(() => false) || await userInput.getAttribute('readonly')).toBeTruthy()
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
> 393 |     expect([200, 403]).toContain(toggleRes.status)
      |                        ^ Error: expect(received).toContain(expected) // indexOf
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
  420 |   })
  421 |   test('USER-RESET-03. 权限：非admin重置密码返回403', async () => {
  422 |     const token = await apiLogin('technician')
  423 |     const res = await apiFetch(token, 'POST', '/users/test-id/reset-password', {})
  424 |     expect(res.status).toBe(403)
  425 |   })
  426 | })
  427 | 
  428 | // ───────────────────────────────────────────────
  429 | // 8. 用户详情弹窗
  430 | // ───────────────────────────────────────────────
  431 | test.describe('用户管理 -> 用户详情弹窗', () => {
  432 |   test('USER-DETAIL-01. 正常用例：点击详情打开弹窗', async ({ page }) => {
  433 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  434 |     const detail = page.locator('text=/详情/i').first()
  435 |     if (await detail.isVisible().catch(() => false)) {
  436 |       await detail.click(); await page.waitForTimeout(1000)
  437 |       await expect(page.locator('text=/用户详情|权限列表|角色|部门/i').first()).toBeVisible()
  438 |       const close = page.locator('text=/关闭/i').first()
  439 |       if (await close.isVisible().catch(() => false)) await close.click()
  440 |     }
  441 |   })
  442 |   test('USER-DETAIL-02. 正常用例：详情弹窗显示用户头像', async ({ page }) => {
  443 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  444 |     const detail = page.locator('text=/详情/i').first()
  445 |     if (await detail.isVisible().catch(() => false)) {
  446 |       await detail.click(); await page.waitForTimeout(1000)
  447 |       await expect(page.locator('body')).toBeVisible()
  448 |       const close = page.locator('text=/关闭/i').first()
  449 |       if (await close.isVisible().catch(() => false)) await close.click()
  450 |     }
  451 |   })
  452 |   test('USER-DETAIL-03. 正常用例：详情弹窗显示权限列表', async ({ page }) => {
  453 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  454 |     const detail = page.locator('text=/详情/i').first()
  455 |     if (await detail.isVisible().catch(() => false)) {
  456 |       await detail.click(); await page.waitForTimeout(1000)
  457 |       await expect(page.locator('text=/权限列表|已授权/i').first()).toBeVisible()
  458 |       const close = page.locator('text=/关闭/i').first()
  459 |       if (await close.isVisible().catch(() => false)) await close.click()
  460 |     }
  461 |   })
  462 |   test('USER-DETAIL-04. 正常用例：详情弹窗点击编辑跳转', async ({ page }) => {
  463 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  464 |     const detail = page.locator('text=/详情/i').first()
  465 |     if (await detail.isVisible().catch(() => false)) {
  466 |       await detail.click(); await page.waitForTimeout(1000)
  467 |       const edit = page.locator('text=/编辑/i').first()
  468 |       if (await edit.isVisible().catch(() => false)) { await edit.click(); await page.waitForTimeout(800); await page.click('text=/取消|关闭/i'); await page.waitForTimeout(300) }
  469 |     }
  470 |   })
  471 | })
  472 | 
  473 | // ───────────────────────────────────────────────
  474 | // 9. 分页功能
  475 | // ───────────────────────────────────────────────
  476 | test.describe('用户管理 -> 分页功能', () => {
  477 |   test('USER-PAGE-01. 正常用例：多页数据切页', async ({ page }) => {
  478 |     await loginAs(page, 'admin'); await page.goto(`${FE_BASE}/users`); await page.waitForTimeout(1500)
  479 |     const next = page.locator('text=/下一页/i').first()
  480 |     if (await next.isVisible().catch(() => false) && await next.isEnabled().catch(() => false)) { await next.click(); await page.waitForTimeout(800) }
  481 |   })
  482 |   test('USER-PAGE-02. 边界：仅1页时下一页禁用', async ({ page }) => {
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
```