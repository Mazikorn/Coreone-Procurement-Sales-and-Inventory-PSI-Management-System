# 消耗对账 主流程收口记录

## 入口边界

- 入口: 消耗对账
- 导航路径: 成本管理 -> 消耗对账 (`/reconciliation`)
- 主要用户: 财务、技术员
- 本轮目标: 检查并修复 LIS/项目消耗导入、对账、差异修正、成本异常线索和审计回看的高频主流程核心问题。
- 包含范围: 对账汇总、差异列表、修正闭环、LIS/项目/BOM/出库事实链、成本异常影响。
- 明确不做: 不提前修成本看板、切片成本、盈利分析等成本分析入口；若发现这些入口问题，先作为相邻线索记录。

## 当前检索记录

- 从 `020 库存盘点` 自动切换而来。
- 已现场检索 `后端代码/server/src/routes/reconciliation-v1.1.ts`、`后端代码/server/src/app.ts`、`后端代码/server/src/constants/rolePermissions.ts`、`后端代码/server/tests/integration/reconciliation.test.ts`、`前端代码/src/pages/reconciliation/Reconciliation.tsx`、`useReconciliationPage.ts`、`CaseListTab.tsx`、`ImportLisModal.tsx`、`EditCaseModal.tsx`、`FixBomModal.tsx`、`前端代码/src/api/reconciliation.ts`。
- 当前主流程为：LIS 病例导入/文件导入 -> 病例项目匹配/编辑 -> 按项目/BOM 计算理论消耗 -> 对比实际出库 -> 审计差异写入成本异常 -> BOM 修正和修正日志回看。
- 旧 E2E 和历史测试仅作线索；本轮重新用 API、SQLite、真实页面验证。
- Playwright 使用前已读取本地强规则记忆，未运行任何 `npx playwright install*`。

## 产品建模质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 分类是否准确 | LIS 病例状态有 `normal`/`modified`/`unmatched`，但导入未匹配项目时原先仍落默认 `normal` | 状态分类会掩盖未匹配病例 | 未匹配病例不进入项目对账，后续成本差异被漏看 | P1 修复 |
| 字段是否够用 | LIS 字段包含病理号、项目、操作人、操作时间、状态、导入批次 | 高频导入和编辑字段够用；病例状态需要随绑定动作维护 | 状态错误比字段缺失更影响闭环 | 保留字段，修状态 |
| 关系是否正确 | 技术员前端可见 `/reconciliation`，后端原仅允许 admin/pathologist/finance | 入口主要用户之一被后端拦截 | 技术员无法导入/修正 LIS 病例，主流程断裂 | P1 修复权限 |
| 状态流转是否合理 | 未匹配病例绑定项目后，前端原会保持 `unmatched`，后端也不自动改 | 绑定到带 BOM 项目后仍显示未关联，事实错误 | 筛选、审计、成本归集状态失真 | P1 修复 |
| 用户工作量是否合理 | 用户可导入、筛选、编辑病例、修正 BOM | 主流程操作可接受；状态自动维护后减少手工改状态 | 降低长期手工修正 | 已处理 |
| 是否支撑成本分析 | 项目物料差异可审计入成本异常，BOM 修正写日志 | 权限、未匹配状态、统计文案修正后更可解释 | 成本异常和病例绑定链路可追踪 | 已处理 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| REC-021-001 | 权限/入口 | `docs` 和前端菜单把技术员列为主用户，但后端 `/reconciliation` 不允许 technician | `ROLE_MENU_MAP.technician` 包含 `/reconciliation`；`app.ts` 原 requireRole 不含 technician；技术员权限无 `cost_analysis` | 技术员 -> 消耗对账 -> 导入/修正 LIS | P1 | 后端路由和角色默认权限加入 technician/cost_analysis | 集成测试、真实 API、真实页面 | completed |
| REC-021-002 | 状态建模 | LIS 导入未匹配项目时只返回 unmatched 计数，病例记录仍默认 `normal` | `importLisItems` 原 INSERT 未写 status | LIS 导入 -> 病例筛选 -> 项目对账 | P1 | 未匹配项目写入 `status='unmatched'`；匹配项目写 `normal` | 集成测试、真实 SQLite | completed |
| REC-021-003 | 状态流转 | 未匹配病例绑定到已配置 BOM 项目后仍可能保持 `unmatched` | `EditCaseModal` 原选择项目不改状态；后端 PUT 原样保存 status | 病例绑定 -> 对账闭环 -> 成本归集 | P1 | 前端选择带 BOM 项目时自动转 `modified`；后端兜底把带 BOM 项目的 `unmatched` 修正为 `modified` | 前端组件测试、集成测试、真实页面弹窗 | completed |
| REC-021-004 | 产品文案/指标 | 汇总卡把 `projectsWithoutBom` 显示为“病例缺失” | `Reconciliation.tsx` stats label 原为 `病例缺失` | 管理者误解为病例缺失，而实际是项目未配置 BOM | P2 | 改为“未配置BOM项目” | 前端页面测试、真实页面截图 | completed |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| REC-021-001 | `后端代码/server/src/app.ts` | `/api/v1/reconciliation` 允许 `technician` 角色访问。 |
| REC-021-001 | `后端代码/server/src/constants/rolePermissions.ts` | 技术员默认权限加入 `cost_analysis`，与导航菜单和入口主用户一致。 |
| REC-021-002 | `后端代码/server/src/routes/reconciliation-v1.1.ts` | LIS 导入按匹配结果写入 `normal`/`unmatched`；重复导入未匹配项目不清空既有关联。 |
| REC-021-003 | `后端代码/server/src/routes/reconciliation-v1.1.ts` | 病例绑定带 BOM 项目时自动维护状态为 `modified`，避免继续显示未关联。 |
| REC-021-003 | `前端代码/src/pages/reconciliation/components/EditCaseModal.tsx` | 选择带 BOM 项目时把 unmatched 状态切换为 `modified`；补 React 导入以满足测试/构建。 |
| REC-021-003 | `前端代码/src/pages/reconciliation/components/EditCaseModal.test.tsx` | 新增病例编辑弹窗状态流转测试。 |
| REC-021-004 | `前端代码/src/pages/reconciliation/Reconciliation.tsx` | 汇总卡文案从“病例缺失”改为“未配置BOM项目”。 |
| REC-021-004 | `前端代码/src/pages/reconciliation/Reconciliation.test.tsx` | 新增汇总卡文案回归测试。 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 后端消耗对账集成 | `npm test -- --run tests/integration/reconciliation.test.ts` | 24/24 passed；Vitest 结束后仍有已知 close timeout 噪声 | 覆盖技术员权限、未匹配状态、绑定状态、导入/编辑/审计/导出/日志 |
| 前端消耗对账专项 | `npm test -- --run src/pages/reconciliation/Reconciliation.test.tsx src/pages/reconciliation/hooks/useReconciliationPage.test.ts src/pages/reconciliation/components/EditCaseModal.test.tsx` | 22/22 passed | 覆盖页面文案、hook、导入解析、导出、编辑弹窗状态 |
| 后端构建 | `npm run build` in `后端代码/server` | passed | TypeScript 编译通过 |
| 前端构建 | `npm run build` in `前端代码` | passed | Vite 构建通过；仅保留 chunk size warning |
| 真实 DB/API | `/tmp/coreone-reconciliation-021.db` 一次性脚本 | passed | 技术员 summary 200；导入 2 条、unmatched 1；未匹配病例 status=`unmatched`；绑定带 BOM 项目后 status=`modified`；`projectsWithoutBom=1` |
| 真实页面/弹窗 | Playwright 技术员账号 `/reconciliation` | passed | 截图：`/tmp/coreone-reconciliation-021-page-tech.png`、`/tmp/coreone-reconciliation-021-case-list.png`、`/tmp/coreone-reconciliation-021-edit-case.png` |

## 入口收口报告

- P0/P1 是否清零: 是，REC-021-001/002/003 已修复并验证。
- 影响主流程的 P2 是否清零: 是，REC-021-004 已修复并验证。
- 产品建模问题是否已处理或明确阻塞: 是；主要问题集中在角色、病例绑定状态和指标语义，均已处理。
- 页面/弹窗验证: 已通过技术员真实页面、病例列表和编辑弹窗验证。
- 后端/API/数据库验证: 已通过集成测试和真实 DB/API 验证。
- 数据回看验证: 已通过 SQLite 回看未匹配/已修改状态和汇总统计。
- 库存/BOM/出库/成本/审计影响: 未直接改库存/出库；修复保证 LIS 病例进入正确项目/BOM 对账状态，差异可继续审计入成本异常。
- 未处理 P3: 暂无阻断主流程的 P3；后续可再细化短缺差异的 warning/error 阈值策略。
- 相邻入口线索: 下一入口 `预警中心` 需确认成本异常、库存异常、消耗异常是否能区分来源，避免把未匹配 LIS 或 BOM 缺失误报成普通库存预警。
- 当前 git 状态: 工作树含本轮及既有多入口累计改动；本轮未清理或回退非 021 文件。
