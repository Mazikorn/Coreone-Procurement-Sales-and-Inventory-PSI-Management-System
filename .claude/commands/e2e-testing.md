---
name: e2e-testing
description: COREONE E2E 测试工作流。适用于编写、运行和调试 Playwright E2E 测试。
allowed_tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"]
---

# /e2e-testing

在 COREONE 项目中处理 E2E 测试时使用此工作流。

## 目标

编写、运行和调试 Playwright E2E 测试，覆盖关键业务流。

## 常用文件

- `前端代码/e2e/**/*.spec.ts` — E2E 测试文件
- `前端代码/playwright.config.ts` — Playwright 配置
- `前端代码/e2e-report/` — 测试报告输出
- `前端代码/e2e/fixtures/` — 测试夹具

## 建议流程

1. **理解测试目标**
   - 确定要覆盖的用户流程
   - 查看现有类似测试作为参考

2. **编写测试**
   - 使用 Page Object Model 模式
   - 每个测试独立，不依赖其他测试状态
   - 使用 `test.beforeEach` 设置前置条件
   - 使用有意义的测试名：`test('INB-001: 正常入库流程', ...)`

3. **本地运行**
   ```bash
   cd 前端代码
   # 全部测试
   npx playwright test

   # 单个 spec
   npx playwright test e2e/inbound.spec.ts

   # 特定用例
   npx playwright test e2e/auth.spec.ts --grep "AUTH-LOGIN-01"

   # UI 调试模式
   npx playwright test e2e/xxx.spec.ts --debug
   ```

4. **排查失败**
   - 查看终端输出和截图
   - 检查 `e2e-report/` 中的 HTML 报告
   - 检查后端是否启动（Playwright webServer 配置）
   - 常见失败：
     - `page loading timeout` → 检查后端是否启动
     - `Insufficient stock` → 测试需确保库存充足
     - `Executable doesn't exist` → `npx playwright install chromium`

5. **CI 验证**
   - 推送到 master 触发 GitHub Actions
   - 查看 `gh run list --limit 5`
   - 失败时下载 artifact：`gh run download <RUN_ID> --name e2e-report`

## 测试编写规范

```typescript
import { test, expect } from '@playwright/test'

test.describe('入库管理', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('[name="username"]', 'admin')
    await page.fill('[name="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  test('INB-001: 正常采购入库流程', async ({ page }) => {
    await page.goto('/inbound')
    // 测试步骤...
    await expect(page.locator('.toast')).toContainText('入库成功')
  })
})
```

## 典型提交信号

- `test(e2e): 添加入库流程 E2E 测试`
- `test(e2e): 修复出库测试因库存不足失败`

## 注意事项

- 每个测试必须能独立运行
- 测试数据不污染生产数据库（使用独立 DB 或清理逻辑）
- Playwright 配置使用 webServer 自动启动前后端
- 参考现有测试文件学习项目特定模式
