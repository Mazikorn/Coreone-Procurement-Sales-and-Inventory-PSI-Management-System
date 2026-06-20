# 收费对照 主流程收口记录

## 入口边界

- 入口: 收费对照
- 导航路径: 成本管理 -> 收费对照 (`/abc/fee-comparison`)
- 主要用户: 财务
- 本轮目标: 检查并修复收费与成本差异核对的高频主流程核心问题。
- 包含范围: 日期/项目类型/盈亏/映射筛选、收费成本差异、差异提醒、分页、导出回看。
- 明确不做: 不提前修成本趋势、仪表盘、审计治理；若发现相邻问题，先作为线索记录。

## 当前检索记录

- 从 `025 盈利分析` 自动切换而来，复核 `docs/main-flow-entry-list-2026-06-20.md` 后确认 `026 收费对照` 为当前 `in_progress` 入口。
- 现场检索 `前端代码/src/pages/cost/FeeComparison.tsx`、`前端代码/src/pages/cost/FeeComparison.test.tsx`、`后端代码/server/src/routes/abc-v1.1.ts` 的 `/abc/fee-comparison`。
- 复核 023/024/025 成本分析口径后确认本入口也必须排除 `pending_cost/cost_exception`，否则与成本看板、切片成本、盈利分析不一致。

## 产品建模质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 分类是否准确 | 页面有项目类型、盈亏、映射状态筛选 | 筛选分类合理，但后端必须真正执行，否则只是 UI 装饰 | 财务看到的差异分类和提醒错误 | 已补后端筛选 |
| 字段是否够用 | 前端表格需要出库单号、日期、项目、样本数、成本、收费、利润、利润率、收费标准 | 旧后端只返回项目名和成本/收费/利润，缺少出库单号、日期、项目类型、收费标准 | 页面主键、日期、映射状态、导出内容都不可信 | 已补齐字段 |
| 关系是否正确 | 收费对照应连接出库记录、项目、收费标准、ABC 成本快照 | 旧接口没有 join 出库单和收费标准，无法证明收费与哪笔出库事实对应 | 财务不能追溯差异来源 | 已补 join 和回传字段 |
| 状态流转是否合理 | 成本快照存在已核算、重算、待核算、异常 | 收费对照只能统计可信快照；异常/待核算应进入异常处理，不应当作差异事实 | 异常成本会被误判为亏损或未映射 | 已排除 `pending_cost/cost_exception` |
| 用户工作量是否合理 | 财务按日期、类型、盈亏、映射筛选并导出 | 旧接口忽略筛选和分页，用户只能导出后手工筛 | 长期人工修表，且容易漏掉异常行 | 已后端化筛选/分页/汇总 |
| 是否支撑成本分析 | 收费对照应与盈利分析和看板同源 | 旧接口只取最近 100 条且无汇总，不能支撑月度结账核对 | 收费差异、利润和未映射提醒失真 | 已修复 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| FEE-026-001 | 功能/数据口径 | `/abc/fee-comparison` 固定返回最近 100 条，忽略前端传入的日期、项目类型、盈亏、映射筛选和分页 | 后端接口只有 `ORDER BY d.created_at DESC LIMIT 100` | 页面筛选、分页、导出无法代表用户选择范围 | P1 | 后端补筛选、分页和 summary | 后端集成、真实 API/SQLite、真实页面 | completed |
| FEE-026-002 | 产品建模/字段关系 | 后端不返回出库单号、日期、项目类型、样本数、收费标准，前端表格字段缺来源 | 旧接口只返回 `projectName/materialCost/activityCost/totalCost/feeAmount/profit/profitRate` | 财务不能追溯收费差异对应哪张出库单和收费规则 | P1 | join 出库记录、项目、收费标准并返回完整字段 | 后端集成、前端测试、真实页面 | completed |
| FEE-026-003 | 产品建模/状态口径 | 收费对照旧接口混入 `pending_cost/cost_exception` | 旧接口无 `cost_status` 过滤 | 未核算或异常快照可能被当成亏损/未映射差异，误导处理优先级 | P1 | 只统计 `costed/recalculated` 等可信快照 | 后端集成、真实 API/SQLite | completed |
| FEE-026-004 | 交互/主流程 P2 | 在非第 1 页点击查询时，前端先 `setPage(1)` 又立即 `loadData()`，可能用旧页码查询 | `handleSearch` 同步调用 `setPage(1)` 和 `loadData()` | 财务改筛选后仍停在旧页，误以为无数据或漏看差异 | P2 | 第 1 页直接查询；非第 1 页仅重置页码，让 effect 用新页码查询 | 前端测试覆盖既有页面；真实页面验证筛选结果 | completed |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| FEE-026-001/002/003 | `后端代码/server/src/routes/abc-v1.1.ts` | `/abc/fee-comparison` 改为支持 `page/pageSize/startDate/endDate/month/projectType/profitFilter/mappingFilter`，返回 `successList`、`summary` 和完整表格字段。 |
| FEE-026-002 | `后端代码/server/src/routes/abc-v1.1.ts` | join `outbound_records`、`projects`、`fee_standards`，返回 `outboundNo/date/projectType/sampleCount/feeStandardName/feeCategory/costMonth`。 |
| FEE-026-003 | `后端代码/server/src/routes/abc-v1.1.ts` | 增加 `COALESCE(d.cost_status, 'costed') NOT IN ('pending_cost', 'cost_exception')`，收费对照与看板/切片/盈利口径一致。 |
| FEE-026-001/002/003 | `后端代码/server/tests/integration/cost-exceptions.test.ts` | 新增收费对照日期、项目类型、盈亏、映射状态筛选和可信快照过滤集成测试。 |
| FEE-026-004 | `前端代码/src/pages/cost/FeeComparison.tsx` | 修复查询页码重置时可能用旧页码的问题。 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 后端集成测试 | `npm test -- --run tests/integration/cost-exceptions.test.ts` | 17/17 passed；末尾仍有已知 Vite close timeout 提示，测试已通过 | 新增收费对照筛选/汇总/可信快照用例通过 |
| 前端组件测试 | `npm test -- --run src/pages/cost/FeeComparison.test.tsx` | 2/2 passed | 表格项目类型展示、筛选后导出显示标签通过 |
| 后端构建 | `npm run build` | passed | TypeScript 编译通过 |
| 前端构建 | `npm run build` | passed | Vite 构建通过；仅保留既有 chunk size warning |
| 真实 API/SQLite | 临时库 `/tmp/coreone-fee-comparison-026.db`，请求 `/api/v1/abc/fee-comparison?startDate=2099-11-01&endDate=2099-11-30&projectType=he&pageSize=10` 和 `profitFilter=loss&mappingFilter=unmapped` | 全量 HE 返回 2 条可信记录、成本 140、收入 120、利润 -20、亏损 1、未映射 1；亏损+未映射只返回 `OUT-FEE-REAL-LOSS-026`；库中同时保留异常和待核算快照作为排除对照 | `/tmp/coreone-fee-comparison-026.db` |
| 真实页面/导出 | Playwright 打开 `http://127.0.0.1:8080/abc/fee-comparison`，筛选日期 `2099-11-01..2099-11-30`、项目类型 `HE染色`、再筛选 `亏损+未映射` 并导出 | 页面汇总从 2 条/¥140/¥120/¥-20 变为 1 条/¥80/¥0/¥-80；盈利行被筛除；导出 CSV 仅含 `OUT-FEE-REAL-LOSS-026` 且项目类型显示 `HE染色`、收费标准显示 `未映射` | `/tmp/coreone-fee-comparison-026-page.png`、`/tmp/coreone-fee-comparison-026-filtered.png`、`/tmp/coreone-fee-comparison-026-export.csv` |
| Playwright 环境纪律 | 浏览器验证前再次读取两份本地 Playwright 规则记忆，使用既有 executablePath，未执行任何安装命令 | passed | Chrome for Testing `147.0.7727.15` |

## 入口收口报告

- P0/P1 是否清零: 是，FEE-026-001、FEE-026-002、FEE-026-003 已修复并验证。
- 影响主流程的 P2 是否清零: 是，FEE-026-004 已修复。
- 产品建模问题是否已处理或明确阻塞: 已处理收费对照筛选分类、字段关系和成本状态口径。
- 页面/弹窗验证: 已验证真实页面筛选、提醒、表格和导出；本入口无弹窗主流程。
- 后端/API/数据库验证: 已验证真实 API 与 SQLite 数据状态对照。
- 数据回看验证: 已确认数据库存在可信、异常、待核算、异日期、异类型数据，页面/API/导出只计入当前筛选内可信快照。
- 库存/BOM/出库/成本/审计影响: 不改库存/BOM/出库写入；成本分析读取口径与 023/024/025 对齐。
- 未处理 P3: 暂无。
- 相邻入口线索: 027 成本趋势需要继续复核是否也过滤成本状态、是否支持项目类型和时间维度一致。
- 当前 git 状态: 工作树包含本目标多入口累计改动，本入口仅新增/修改上述收费对照相关文件和本记录。
