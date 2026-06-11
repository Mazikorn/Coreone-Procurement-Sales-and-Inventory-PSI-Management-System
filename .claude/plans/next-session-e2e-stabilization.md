# 下一会话工作计划：E2E 全量稳定化

> **创建**: 2026-06-08 | **更新**: 2026-06-09
> **前置**: Phase 1 ✅ 完成, Phase 2 ✅ 完成

## 当前状态

| Phase | 状态 | 结果 |
|-------|------|------|
| Phase 1: 批量修复 loginAs | ✅ 完成 | 39 文件全部修复 domcontentloaded |
| Phase 2: 全量回归 | ✅ 完成 | 870 通过 / 141 失败 / 2572 跳过 |
| Phase 3: 修复 | ⏳ 待执行 | 本计划 |

## Phase 2 关键发现

**2572 跳过的根因是 Chromium 浏览器崩溃 (0xC0000005)**，不是测试逻辑问题。

| 错误类型 | 数量 | 影响 |
|----------|------|------|
| Chromium 崩溃 (0xC0000005) | 57 | 每次崩溃导致同进程后续测试全部 skip |
| UI 元素不可见 | 28 | 真实 Bug — 组件未渲染或选择器过期 |
| 断言不匹配 | 22 | 真实 Bug — 返回值与预期不符 |
| 测试超时 (60s) | 9 | Modal/CRUD 操作超时 |
| 页面导航失败 (ERR_ABORTED) | 5 | 前端 dev server 不稳定 |
| 其他断言 | 20 | 各类小问题 |

崩溃连锁: 57 次 × ~40 tests/suite ≈ 2164 跳过 + 408 级联跳过

## Phase 3：修复计划

### P0: 修复 Chromium 崩溃 (预计 +2000 用例可运行)

**文件**: `前端代码/playwright.config.ts`

**修改**:
```ts
// 1. workers 1 → 2
workers: 2,

// 2. 添加 Chrome 启动参数防崩溃
launchOptions: {
  args: [
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--disable-extensions',
  ],
  ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
    : process.env.CI
      ? undefined
      : { executablePath: 'C:\\Users\\86185\\AppData\\Local\\ms-playwright\\chromium-1217\\chrome-win64\\chrome.exe' }),
},

// 3. 增加超时
timeout: 90000,  // 60s → 90s
```

**验证**: 修改后运行 smoke test (5 个文件)，确认无崩溃后再全量回归

### P1: 修复 UI 元素不可见 (28 个)

**目标**: 修复 ABC/仪表盘页面的缺失元素

**关键文件**:
- `abc-cost-trend.spec.ts` — 6 个失败 (趋势图/筛选/导出)
- `abc-fee-comparison.spec.ts` — 5 个失败 (汇总卡片/筛选)
- `dashboard.spec.ts` — 11 个失败 (导航/菜单/UI差异)
- `abc-cost-dashboard.spec.ts` — 1 个失败 (数字格式)
- `abc-cost-variance.spec.ts` — 1 个失败 (趋势图)
- `abc-quality-cost.spec.ts` — 1 个失败 (pathologist 角色)

**方法**: 用 Playwright `--debug` 逐个检查选择器，更新 `data-testid` 或确认组件已实现

### P2: 修复断言不匹配 (22 个)

**目标**: 更新测试期望值或修复后端返回

**关键文件**:
- `alerts.spec.ts` — 8 个 (预警处理 POST 返回值)
- `dashboard.spec.ts` — 5 个 (菜单数量/统计卡片)
- `bom.spec.ts` — 3 个 (code 重复/超长)
- `cost-analysis.spec.ts` — 2 个 (排名徽章/标签)
- 其他 — 4 个

### P3: 修复 CRUD 超时 (9 个)

**目标**: Modal 操作从 60s 超时降到 15s 内

**关键文件**:
- `abc-cost.spec.ts` — 7 个 (创建/编辑/删除 作业中心/成本动因/成本池)
- `abc-cost.spec.ts` — 2 个 (盈利性筛选/导出)

**方法**: 检查 Modal 等待逻辑，使用 `waitForSelector` 替代硬等待

## 执行顺序

```
P0 (Chromium 崩溃) → smoke test 验证 → 全量回归 → P1 (UI) → P2 (断言) → P3 (超时)
```

## 预期结果

| 阶段 | 预计通过率 |
|------|-----------|
| 当前 (Phase 2) | 86.1% (870/1011) |
| P0 修复后 | ~90%+ (大量跳过恢复正常) |
| P1-P3 修复后 | 95%+ |

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| workers=2 导致端口冲突 | Playwright 自动管理，但 webServer 需确认 |
| Chrome 参数无效 | 备选: 升级 Playwright 或 Chrome 版本 |
| P1 选择器改动量大 | 优先修复高频失败文件 |
