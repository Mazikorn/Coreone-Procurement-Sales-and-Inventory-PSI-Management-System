# 盈利分析 主流程收口记录

## 入口边界

- 入口: 盈利分析
- 导航路径: 成本管理 -> 盈利分析 (`/abc/profitability`)
- 主要用户: 管理者、财务
- 本轮目标: 检查并修复项目维度盈利分析的收入、成本、利润、利润率和导出回看等高频主流程核心问题。
- 包含范围: 月度盈利分析、项目类型筛选、项目维度汇总、样本数/成本/收入/利润率、导出。
- 明确不做: 不提前修收费对照、成本趋势、ABC 审计；病例维度下钻先记录为产品线索，不阻断本入口项目维度主流程。

## 当前检索记录

- 从 `024 切片成本` 自动切换而来，复核 `docs/main-flow-entry-list-2026-06-20.md` 后确认 `025 盈利分析` 为当前 `in_progress` 入口。
- 现场检索前端 `前端代码/src/pages/cost/ProfitabilityAnalysis.tsx`、测试 `前端代码/src/pages/cost/ProfitabilityAnalysis.test.ts`、后端 `后端代码/server/src/routes/abc-v1.1.ts` 的 `/abc/profitability` 与 `/abc/export`。
- 复核 024 已补的 `/abc/profitability?dimension=bom`，确认盈利分析页仍未显式请求项目维度，也未规避默认分页明细聚合。

## 产品建模质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 分类是否准确 | 页面按项目类型筛选，后端可按 `projects.type` 过滤 | 分类口径可用，但必须由后端聚合后再进入页面，不能让前端用默认分页明细自行拼结果 | 分页缺失会让某类项目利润低估 | 已修复为 `dimension=project` 服务端聚合 |
| 字段是否够用 | 页面展示项目、项目类型、样本数、成本、收入、利润、利润率、单样本成本/收入 | 项目盈利主流程字段够用；病例维度没有显式 UI | 病例级盈利分析后续可能仍需下钻 | 病例维度记为 P3 产品线索 |
| 关系是否正确 | 成本快照关联项目、成本、收费、利润 | 项目关系必须基于全部已核算快照，而不是当前分页 | 项目利润、样本数、单样本成本可能失真 | 已改为后端按项目全量汇总 |
| 状态流转是否合理 | 成本快照存在 `costed`、`recalculated`、`pending_cost`、`cost_exception` 等状态 | 盈利报表与导出只能计入已核算/重算快照，异常和待核算只能作为异常线索 | 异常快照混入会让收入、成本、利润错误 | 已修复 `/abc/profitability` 与 `/abc/export` 同口径 |
| 用户工作量是否合理 | 财务选择月份和项目类型即可查看 | 如果页面口径不可信，用户只能导出后手工修正 | 长期人工修表，且难以审计 | 已修复主流程口径 |
| 是否支撑成本分析 | 盈利分析承接出库 ABC 快照、收费映射和成本调整后的导出 | 需要与成本看板、切片成本共享“只计入可信快照”的口径 | 影响管理层对项目盈利/亏损判断 | 已与 023/024 口径对齐 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| PRF-025-001 | 产品建模/数据口径 | 盈利分析页调用 `/abc/profitability` 时未指定维度和大页数，后端默认返回分页明细，前端再按项目聚合 | `ProfitabilityAnalysis.tsx` 仅传 `startDate/endDate/projectType`；后端 raw 路径默认 `pageSize` | 超过默认分页后的成本快照不会进入项目汇总，项目利润、样本数、单样本成本低估 | P1 | 增加 `/abc/profitability?dimension=project` 服务端项目聚合；前端显式请求项目维度 | 后端集成、前端组件、真实 API/SQLite、真实页面 | completed |
| PRF-025-002 | 产品建模/导出口径 | `/abc/export` 只按月份和项目类型过滤，未排除 `pending_cost/cost_exception` | 导出查询缺少成本状态过滤 | 导出 CSV 与页面/看板口径不一致，异常或未核算快照可能被当成利润事实 | P1 | 导出成本明细增加可信快照过滤，异常统计仍保留在 summary | 后端集成、真实 API/SQLite | completed |
| PRF-025-003 | 产品线索 | 页面没有病例维度下钻 | 成本快照表有 `case_no`，但当前页面只呈现项目维度 | 不阻断项目盈利主流程；若管理层要找单病例亏损，需要后续补维度切换 | P3 | 记录为后续产品增强，不阻断 025 | 文档记录 | recorded |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| PRF-025-001 | `后端代码/server/src/routes/abc-v1.1.ts` | `/abc/profitability` 增加 `dimension=project`，按项目汇总全部已核算/重算快照，返回 `caseCount/sampleCount/materialCost/activityCost/totalCost/feeAmount/profit/profitRate`。 |
| PRF-025-001 | `前端代码/src/pages/cost/ProfitabilityAnalysis.tsx` | 页面请求增加 `dimension: 'project'` 和 `pageSize: 1000`，前端只做兼容归一化，不再依赖默认分页明细。 |
| PRF-025-001 | `前端代码/src/pages/cost/ProfitabilityAnalysis.test.ts` | 更新页面请求断言，锁定项目维度请求参数。 |
| PRF-025-001/002 | `后端代码/server/tests/integration/cost-exceptions.test.ts` | 新增 25 条同项目快照、异常快照、待核算快照、异月和异类型数据，验证项目汇总和导出口径。 |
| PRF-025-002 | `后端代码/server/src/routes/abc-v1.1.ts` | `/abc/export` 成本明细增加 `COALESCE(d.cost_status, 'costed') NOT IN ('pending_cost', 'cost_exception')`。 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 后端集成测试 | `npm test -- --run tests/integration/cost-exceptions.test.ts` | 16/16 passed；末尾仍有已知 Vite close timeout 提示，测试已通过 | 新增项目汇总/导出口径用例通过 |
| 前端组件测试 | `npm test -- --run src/pages/cost/ProfitabilityAnalysis.test.ts` | 3/3 passed | 请求参数包含 `dimension: 'project'`、`pageSize: 1000` |
| 后端构建 | `npm run build` | passed | TypeScript 编译通过 |
| 前端构建 | `npm run build` | passed | Vite 构建通过；仅保留既有 chunk size warning |
| 真实 API/SQLite | 临时库 `/tmp/coreone-profitability-025.db`，登录后请求 `/api/v1/abc/profitability?dimension=project&startDate=2099-12&endDate=2099-12&projectType=he&pageSize=10` 与 `/api/v1/abc/export?month=2099-12&projectType=he` | 盈利接口返回 1 个 HE 项目、25 样本、成本 375、收入 750、利润 375；导出 25 行且不含异常/待核算；数据库中同时保留 `cost_exception` 与 `pending_cost` 作为排除对照 | `/tmp/coreone-profitability-025.db` |
| 真实页面 | Playwright 使用既有 Chromium `1217`，打开 `http://127.0.0.1:8080/abc/profitability`，切换月份 `2099-12` 与项目类型 `HE染色` | 页面汇总为项目总数 1、样本 25、总成本 ¥375.00、总收入 ¥750.00、总利润 ¥375.00、平均利润率 50.0%；IHC 行被筛除 | `/tmp/coreone-profitability-025-page.png`、`/tmp/coreone-profitability-025-he-filter.png` |
| Playwright 环境纪律 | 浏览器验证前读取两份本地 Playwright 规则记忆，使用既有 executablePath，未执行任何安装命令 | passed | Chrome for Testing `147.0.7727.15` |

## 入口收口报告

- P0/P1 是否清零: 是，PRF-025-001、PRF-025-002 已修复并验证。
- 影响主流程的 P2 是否清零: 是，本入口未发现未处理的主流程 P2。
- 产品建模问题是否已处理或明确阻塞: 已处理项目维度和状态口径；病例维度下钻记录为 P3 产品线索。
- 页面/弹窗验证: 已验证真实页面、筛选和数据回看；本入口无弹窗主流程。
- 后端/API/数据库验证: 已验证真实 API 与 SQLite 数据状态对照。
- 数据回看验证: 已确认数据库存在已核算、异常、待核算、异月、异类型数据，页面/API/导出只计入当前月当前类型的可信快照。
- 库存/BOM/出库/成本/审计影响: 不改库存/BOM/出库写入；成本分析读取口径与 023 成本看板、024 切片成本保持一致；导出仍写 `abc_audit_logs`。
- 未处理 P3: `PRF-025-003` 病例维度盈利下钻。
- 相邻入口线索: 026 收费对照需要继续复核是否也过滤月份/类型/成本状态，不能沿用未过滤明细。
- 当前 git 状态: 工作树包含本目标多入口累计改动，本入口仅新增/修改上述盈利分析相关文件和本记录。
