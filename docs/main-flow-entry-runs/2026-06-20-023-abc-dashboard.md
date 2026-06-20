# 成本看板 主流程收口记录

## 入口边界

- 入口: 成本看板
- 导航路径: 成本管理 -> 成本看板 (`/abc/dashboard`)
- 主要用户: 管理者、财务
- 本轮目标: 检查并修复月度成本、收入、利润、成本状态、异常入口和导出回看等高频主流程核心问题。
- 包含范围: 看板指标、期间筛选、成本运行/快照读取、收入/成本/利润解释、异常和下钻入口。
- 明确不做: 不提前修切片成本、盈利分析、收费对照、成本趋势、ABC 审计；若成本看板发现相邻入口问题，先作为线索记录。

## 当前检索记录

- 从 `022 预警中心` 自动切换而来。
- 已检索 `前端代码/src/pages/cost/CostDashboard.tsx`、`CostDashboard.test.ts`、`CostDashboard.adjustments.render.test.tsx`、`前端代码/src/api/abc.ts`。
- 已检索 `后端代码/server/src/routes/abc-v1.1.ts`、`后端代码/server/src/utils/cost-runs.ts`、`后端代码/server/tests/integration/cost-exceptions.test.ts`。
- 现场确认成本看板主流程高频链路为: 选择月份 -> 查看指标/异常/未补算 -> 执行重算 -> 查看任务历史 -> 关账 -> 关账后调整/审核 -> 导出与异常下钻。
- 本轮未扩展切片成本、盈利分析、收费对照、成本趋势和 ABC 审计，只记录相邻线索。

## 产品建模质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 分类是否准确 | 成本看板汇总经营指标、成本期间、任务历史、异常和调整单 | 分类基本准确；成本异常中心仍作为下钻，不在看板内完整处理 | 看板承担月结总览，不替代异常中心/审计中心 | 保持当前分类边界 |
| 字段是否够用 | 任务历史前端读取 `total/success/failed`，后端真实写入 `processed/succeeded/failed` | 字段契约不一致，任务历史不足以表达真实重算覆盖情况 | 财务可能误判重算未处理任何出库，影响月结判断 | 前端兼容当前后端字段和旧字段 |
| 关系是否正确 | 看板指标来自 `outbound_abc_details`，异常/未补算来自 `cost_exceptions` 和 `outbound_records`，调整来自 `abc_cost_adjustments` | 主数据关系基本可用；成本运行状态和期间状态关系不严 | 若未核算期间可关账，月结锁定不代表成本已重算 | 后端和前端都要求 `calculated` 后才能关账 |
| 状态流转是否合理 | 原流程允许 `open/collecting -> closed`，只检查异常和未补算 | 状态流转不合理，缺少“已核算”证明 | 可绕过执行重算，导致成本事实未结算却被锁定 | 新增 `PERIOD_NOT_CALCULATED` 状态门 |
| 用户工作量是否合理 | 关账按钮给出阻断原因，任务历史可回看最近重算 | 修复后提示更明确，用户不需要靠经验判断为什么不能关账 | 降低财务月结误操作和重复追问 | 前端提示“请先执行重算并完成核算” |
| 是否支撑成本分析 | 看板汇总月度成本、收入、利润、异常、调整单 | 修复后月结状态和任务历史更可信，可作为后续切片成本/盈利分析入口的事实前置 | 未修复会导致后续报表以未核算或误显示的任务结果为依据 | 已处理 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| DASH-023-001 | 状态流转/后端 | `open` 或 `collecting` 成本期间可直接关账，只要没有开放错误异常和未补算单 | `POST /abc/periods/:id/close` 原逻辑未检查 `period.status === calculated` | 成本期间 -> 重算 -> 成本快照 -> 关账 -> 调整单/导出/审计 | P1 | 后端关账必须要求 `calculated`；前端同步阻断提示 | 后端集成测试、真实 API/SQLite、Playwright 页面验证 | completed |
| DASH-023-002 | 前端/契约 | 成本任务历史表读取 `summary.total/success`，但后端重算写入 `processed/succeeded` | `runCostRecalculation` 写入 `{ processed, succeeded, failed }`；`CostDashboard.tsx` 原表格读 `total/success/failed` | 重算任务 -> 成本看板工作台 -> 财务月结判断 | P2 | 前端新增任务摘要兼容函数，同时支持新旧字段 | 前端单测、渲染测试、Playwright 页面验证 | completed |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| DASH-023-001 | `后端代码/server/src/routes/abc-v1.1.ts` | `POST /abc/periods/:id/close` 增加 `PERIOD_NOT_CALCULATED` 状态门，非 `calculated` 期间不能关账。 |
| DASH-023-001 | `前端代码/src/pages/cost/CostDashboard.tsx` | `getClosePeriodBlockReason` 增加非 `calculated` 阻断提示“请先执行重算并完成核算”。 |
| DASH-023-002 | `前端代码/src/pages/cost/CostDashboard.tsx` | 新增 `getCostRunProcessedCount`、`getCostRunSucceededCount`，任务表兼容 `processed/succeeded` 和旧 `total/success` 字段。 |
| DASH-023-001 / DASH-023-002 | `后端代码/server/tests/integration/cost-exceptions.test.ts`、`前端代码/src/pages/cost/CostDashboard.test.ts`、`CostDashboard.adjustments.render.test.tsx` | 补关账状态门、任务摘要兼容和页面渲染回归。 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 后端成本看板/异常集成测试 | `cd 后端代码/server && npm test -- --run tests/integration/cost-exceptions.test.ts` | 14/14 passed；末尾仍有既有 Vitest close timeout 噪声 | 覆盖只读看板、异常、关账状态门、调整单、重算、导出、看板汇总 |
| 前端成本看板测试 | `cd 前端代码 && npm test -- --run src/pages/cost/CostDashboard.test.ts src/pages/cost/CostDashboard.adjustments.render.test.tsx` | 19/19 passed | 覆盖关账阻断、任务摘要字段兼容、调整单刷新降级 |
| 后端构建 | `cd 后端代码/server && npm run build` | passed | TypeScript 构建通过 |
| 前端构建 | `cd 前端代码 && npm run build` | passed；仅 Vite chunk size warning | Vite 生产构建通过 |
| 真实 API/SQLite | 临时库 `/tmp/coreone-abc-dashboard-023.db`；创建 2099-10 期间、尝试关账、改为 calculated 后关账、查询 cost runs | open 期间关账返回 422 `PERIOD_NOT_CALCULATED`；calculated 后关账成功；SQLite 回看 `status=closed`、`closed_by=admin`；成本运行摘要保留 `processed=3/succeeded=2/failed=1` | API 输出和 `abc_periods`、`cost_runs` 表一致 |
| Playwright 禁下载规则 | 浏览器验证前读取两条 Playwright 记忆；显式使用已验证 Chrome for Testing 可执行文件 | 未执行任何 `npx playwright install*`；浏览器真实启动成功 | 截图 `/tmp/coreone-abc-dashboard-023-page.png` |
| 真实页面验证 | 临时后端 3001 + 前端 5173，登录 admin，访问 `/abc/dashboard` 并选择 `2099-10` | 页面显示已关账期间，任务历史显示重算成功且出库单/成功/失败为 `3/2/1` | Playwright 断言和截图通过 |

## 入口收口报告

- P0/P1 是否清零: 是。`DASH-023-001` 已修复并验证。
- 影响主流程的 P2 是否清零: 是。`DASH-023-002` 已修复并验证。
- 产品建模问题是否已处理或明确阻塞: 已处理；看板保持月结总览边界，不替代异常中心、切片成本、盈利分析和审计入口。
- 页面/弹窗验证: 已通过真实成本看板页面验证；本轮无新增弹窗修复。
- 后端/API/数据库验证: 已通过临时真实库 `/tmp/coreone-abc-dashboard-023.db` 验证。
- 数据回看验证: 已通过 API 和 SQLite 回看。
- 库存/BOM/出库/成本/审计影响: 修复后成本期间必须经过核算状态才能锁账，任务历史能正确反映重算覆盖；不改库存/BOM/出库本体。
- 未处理 P3: 暂无阻断；无遗留 P3。
- 相邻入口线索: 切片成本、盈利分析、收费对照、成本趋势仍需分别验证指标口径是否与看板一致；ABC 成本预警和审计日志在后续相邻入口处理。
- 当前 git 状态: 工作区已有多入口累计改动；本入口改动集中在成本看板后端、前端、测试和本工作记录。
