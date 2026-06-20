# 财务成本分析、收费对照和趋势查看 用户故事运行记录

## 故事边界

- 故事: 作为财务，我要查看切片成本、盈利分析、收费对照和成本趋势，以便解释收入、成本和利润差异
- 角色: 财务
- 用户目标: 成本和利润分析可筛选、可导出、可解释
- 涉及页面: `/abc/slide-cost`, `/abc/profitability`, `/abc/fee-comparison`, `/abc/trend`, `/abc/dashboard`
- 涉及后端/API/数据表: `/api/v1/abc/profitability`, `/api/v1/abc/fee-comparison`, `/api/v1/abc/slide-cost-trend`, `/api/v1/abc/export`, `outbound_abc_details`, `projects`, `boms`, `fee_standards`, `cost_exceptions`, `abc_cost_adjustments`
- 上游输入: 已核算成本、收费、病例/项目/BOM
- 下游交接: 管理者经营判断
- 明确不做: 不处理医生/管理者只读体验；这些进入 012/013。

## 当前检索记录

- 角色菜单/路由: 财务可进入切片成本、盈利分析、收费对照、成本趋势和成本看板。
- 前端页面/组件/hook: `SlideCostAnalysis.tsx`, `ProfitabilityAnalysis.tsx`, `FeeComparison.tsx`, `CostTrend.tsx`。
- 后端路由/权限/副作用: `abc-v1.1.ts` 中盈利性分析、收费对照、趋势和导出接口。
- 数据表/审计日志: 分析主数据来自 `outbound_abc_details`，统一排除 `pending_cost` 和 `cost_exception`；导出写入 `abc_audit_logs`。
- 测试: 前端四个分析页单测；后端 `cost-exceptions.test.ts` 已覆盖可信快照过滤、导出口径、收费筛选、月/季趋势。
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, 010 运行记录。
- 库存/BOM/出库/成本/预警/审计影响: 本故事验证分析指标不混入异常或未核算数据，筛选和导出口径一致。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 财务查看成本结果、收费对照、利润和趋势 | 职责合理，页面无写业务事实动作 | 不影响上游事实 | 保留 |
| 用户目标是否完整 | 切片成本、盈利分析、收费对照、趋势均可筛选/导出 | 趋势季度视图原来不能显式调整近 6/12/24 个月范围 | 趋势解释易受默认值误导 | P2 修复 |
| 信息字段是否够用 | 成本、收入、利润、利润率、物料/作业成本拆分、项目类型、收费标准 | 主字段足够解释财务差异 | 支撑经营分析 | 保留 |
| 交接关系是否正确 | 分析结果来自 010 关账/核算后的可信快照 | 后端已排除未核算/异常快照 | 不把坏数据交给管理者 | 回归验证 |
| 状态流转是否合理 | `pending_cost` 和 `cost_exception` 不进分析指标；导出排除异常 | 合理 | 防止报表口径失真 | 回归验证 |
| 用户工作量是否合理 | 收费对照可筛选亏损/未映射，趋势可按类型和范围查看 | 季度范围修复后可直接调节 | 降低人工二次筛选 | 修复 |
| 是否支撑成本/审计 | 导出会写 ABC 审计日志，后端测试覆盖导出口径 | 满足本故事 | 支撑追责 | 保留 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS011-P2-01 | 筛选/趋势口径 | 成本趋势切到季度视图后，页面不显示 6/12/24 个月范围控件，且季度请求未监听 `months` 变化 | 现场代码走查: 月份范围 select 只在 `dimension === 'monthly'` 渲染；季度 effect 依赖缺少 `months` | 财务查看季度趋势时无法明确调整范围，导出可能沿用旧范围，影响经营判断 | P2 | 范围 select 在月度/季度都显示；季度 effect 增加 `months` 依赖；月度请求仅在月度视图触发 | 前端趋势单测、Playwright 真实请求 `dimension=quarterly&months=6` | completed |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS011-P2-01 | `前端代码/src/pages/cost/CostTrend.tsx` | 季度视图也显示近 6/12/24 个月范围控件；季度请求依赖 `months`；月度请求只在月度视图触发，避免季度页额外请求月度数据 |
| RS011-P2-01 | `前端代码/src/pages/cost/CostTrend.test.ts` | 增加季度视图修改范围后请求 `dimension=quarterly, months=6` 的测试 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 前端分析页测试 | `npm run test -- src/pages/cost/SlideCostAnalysis.test.ts src/pages/cost/ProfitabilityAnalysis.test.ts src/pages/cost/FeeComparison.test.tsx src/pages/cost/CostTrend.test.ts` | 4 files / 13 tests passed | 切片成本、盈利、收费对照、趋势导出和季度范围请求通过 |
| 后端可信快照/分析回归 | `npm run test -- tests/integration/cost-exceptions.test.ts tests/role-story-008-technician-reconciliation.test.ts` | 2 files / 21 tests passed；Vitest 有关闭超时提示但 exit code 0；成本异常测试中模拟缺表失败的 stderr 为既有预期场景 | 盈利分析、收费对照、趋势、导出均排除异常/未核算快照；技术员只读成本结果边界未回退 |
| 前端构建 | `npm run build` in `前端代码` | passed | Vite build 通过，仅 chunk size warning |
| 后端构建 | `npm run build` in `后端代码/server` | passed | `tsc` 通过 |
| Playwright 前置规则 | 读取 AGENTS Playwright 强规则和两条记忆；`find`, `test -x`, `--version`, real launch | passed | Chrome for Testing `147.0.7727.15`，真实 launch title `chromium-path-ok` |
| 真实页面: 切片成本 | Playwright 登录 `sunli` 打开 `/abc/slide-cost` | passed | 截图 `docs/role-story-runs/screenshots/011/rs011-1781954991561-finance-slide-cost.png` |
| 真实页面: 盈利分析 | Playwright 登录 `sunli` 打开 `/abc/profitability` | passed | 截图 `docs/role-story-runs/screenshots/011/rs011-1781954991561-finance-profitability.png` |
| 真实页面: 收费对照 | Playwright 登录 `sunli` 打开 `/abc/fee-comparison` | passed | 截图 `docs/role-story-runs/screenshots/011/rs011-1781954991561-finance-fee-comparison.png` |
| 真实页面: 成本趋势季度范围 | Playwright 登录 `sunli` 打开 `/abc/trend`，切季度并选择近 6 个月 | passed | 截图 `docs/role-story-runs/screenshots/011/rs011-1781954991561-finance-trend-quarterly-6months.png`；捕获请求 `dimension=quarterly&months=6` |
| 真实 API: 分析/导出 | 财务 token 调 `/abc/profitability`, `/abc/fee-comparison`, `/abc/slide-cost-trend`, `/abc/export?month=2026-06` | passed | profitability 200 total 17；feeComparison 200 totalOutbounds 20；quarterly trend 200 rows 1；导出 200 totalRecords 20 且不包含 `cost_exception` |

## 故事收口报告

- P0/P1 是否清零: 是。本故事未发现 P0/P1。
- 影响角色交接或事实链的 P2 是否清零: 是。季度趋势范围筛选已修复并验证。
- 角色职责/权限边界是否合理: 是。财务只读分析结果和导出，不改上游事实。
- 页面/弹窗验证: 已覆盖切片成本、盈利分析、收费对照、成本趋势四个真实页面。
- 前后端权限一致性验证: 已覆盖财务真实登录进入页面；技术员只读成本结果回归未回退。
- 后端/API/数据库验证: 已覆盖盈利、收费、趋势和导出 API，均基于可信 ABC 快照。
- 数据回看验证: 导出内容不包含 `cost_exception`；收费对照汇总来自可信快照。
- 库存/BOM/出库/成本/预警/审计影响: 分析页不改库存/BOM/出库；只消费已核算成本快照，避免把异常/未核算成本交给管理者。
- 未处理 P3: 盈利分析导出当前为通用 ABC 明细+汇总 CSV，而不是按页面聚合后的项目视图；口径可信但形式可在后续报表体验优化。
- 相邻故事线索: 012 复核医生只读项目/BOM和成本结果时，需要确认医生看到的成本趋势不暴露写入口且口径与财务一致。
- 当前 git 状态: 工作区包含 001-011 多个故事的未提交改动；本故事只新增/修改 011 相关代码、测试、截图和运行记录。
