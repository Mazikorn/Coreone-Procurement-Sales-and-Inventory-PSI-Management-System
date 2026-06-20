# 财务消耗对账、成本核算、重算和关账 用户故事运行记录

## 故事边界

- 故事: 作为财务，我要完成消耗对账、成本核算、重算和关账，以便月度成本结果可信且可重算
- 角色: 财务
- 用户目标: 月度成本可核算、重算、关账和追溯
- 涉及页面: `/reconciliation`, `/abc/dashboard`, `/abc/cost-pools`, `/alerts`, `/logs`
- 涉及后端/API/数据表: `/api/v1/reconciliation/*`, `/api/v1/abc/dashboard`, `/api/v1/abc/periods`, `/api/v1/abc/cost-runs`, `/api/v1/abc/exceptions`, `/api/v1/logs`, `lis_cases`, `reconciliation_logs`, `bom_items`, `abc_periods`, `cost_exceptions`, `cost_runs`, `abc_audit_logs`
- 上游输入: 出库、LIS、BOM、成本配置、收费映射
- 下游交接: 成本分析、管理报表、审计
- 明确不做: 不处理利润趋势和收费对照展示细节；这些进入 011。

## 当前检索记录

- 角色菜单/路由: 财务可进入消耗对账、ABC 看板、成本池、预警、操作日志；技术员也可进入消耗对账但不应写财务配置。
- 前端页面/组件/hook: `Reconciliation.tsx`, `ReconcileProjectTab.tsx`, `useReconciliationPage.ts`, `CostDashboard.tsx`, `CostAlerts.tsx`, `AuditTrail.tsx`。
- 后端路由/权限/副作用: `reconciliation-v1.1.ts`, `abc-v1.1.ts`, `auth.ts`。
- 数据表/审计日志: `reconciliation_logs` 记录 BOM 修正和病例对账修改；`abc_audit_logs` 记录期间、重算、异常、调整单等成本动作；`operation_logs` 财务可回看。
- 测试: 对账集成、成本异常集成、010 角色边界测试、前端对账/成本看板测试。
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, 009 运行记录, `docs/05_Role_Permission_Matrix.md`。
- 库存/BOM/出库/成本/预警/审计影响: 财务月结会固化成本事实；本故事验证异常阻断、重算保护、关账保护、病例归属追责和 BOM 技术职责边界。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 财务负责对账、异常处理、核算、关账；技术员负责 BOM 标准修正 | 原页面把 `修正BOM` 暴露给财务，职责错位 | 财务可能直接改技术标准，污染 BOM 和后续成本事实 | P1 修复 |
| 用户目标是否完整 | 财务能看对账、成本看板、异常和日志 | 月结前可识别异常和未补算项 | 支撑月结判断 | 保留 |
| 信息字段是否够用 | 对账差异包含理论、实际、差异率和状态；看板显示开放异常/未补算 | 能解释关账阻断原因 | 支撑低打扰处理 | 保留 |
| 交接关系是否正确 | 对账可审计差异进入成本异常；BOM 修正由技术员处理 | 财务审计和技术修正边界需要前后端一致 | 防止交接断裂和越权 | P1 修复 |
| 状态流转是否合理 | 成本期间需 calculated 才可关账；开放异常、收费映射异常、未补算出库阻断关账；已关账期间不能重算 | 主链路合理 | 支撑可重算、可审计 | 回归验证 |
| 用户工作量是否合理 | 财务可先看对账和异常汇总，不能顺手改 BOM | 避免把技术建模工作转嫁给财务 | 降低长期手工修正风险 | 修复 |
| 是否支撑成本/审计 | BOM 修正有日志；关账/调整有 ABC 审计 | 病例项目重绑原先缺少对账日志 | 影响病例成本归属追责 | P2 修复 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS010-P1-01 | 角色职责/权限边界 | 财务在消耗对账差异行可见 `修正BOM`，且后端 `/reconciliation/logs` 会更新 `bom_items` | 现场代码走查: `ReconcileProjectTab` 对非 match 行无角色判断；`POST /reconciliation/logs` 原无严格角色限制 | 财务可直接改 BOM 标准，技术建模和成本事实链错位 | P1 | 前端按角色隐藏，后端仅 admin/technician 可写 BOM 修正日志 | 后端 010 测试、对账回归、Playwright 财务/技术员页面、财务 API 403、BOM 数据回看 | completed |
| RS010-P2-01 | 审计/事实链 | `PUT /reconciliation/cases/:id` 修改病例项目/状态后未进入 `reconciliation_logs` | 现场代码走查: 路由仅更新 `lis_cases` | 病例成本归属被修改后无法在对账日志中追责 | P2 | 写入 `case_edit` 对账日志，记录旧值/新值 JSON、操作人和病例号 | 对账集成测试扩展，验证日志字段、旧值、新值、operator | completed |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS010-P1-01 | `前端代码/src/pages/reconciliation/Reconciliation.tsx` | 根据 `getUserRole()` 计算 `canFixBom`，仅 admin/technician 可修正 BOM |
| RS010-P1-01 | `前端代码/src/pages/reconciliation/components/ReconcileProjectTab.tsx` | `修正BOM` 按钮增加 `canFixBom` 判断，财务仍保留 `审计差异` |
| RS010-P1-01 | `后端代码/server/src/routes/reconciliation-v1.1.ts` | `POST /reconciliation/logs` 增加 `requireStrictRole('admin', 'technician')`，避免普通成本权限绕过 |
| RS010-P1-01 | `前端代码/src/pages/reconciliation/components/ReconcileProjectTab.test.tsx` | 增加财务隐藏/技术角色显示 BOM 修正按钮测试 |
| RS010-P1-01 | `后端代码/server/tests/role-story-010-finance-cost-closing.test.ts` | 增加财务可读对账、不可写 BOM 修正，技术员可进入参数校验的角色边界测试 |
| RS010-P2-01 | `后端代码/server/src/routes/reconciliation-v1.1.ts` | 病例项目/状态修改后写入 `reconciliation_logs.type='case_edit'` |
| RS010-P2-01 | `后端代码/server/tests/integration/reconciliation.test.ts` | 在病例编辑回归中验证 `case_edit` 日志的病例号、字段、旧值、新值和操作人 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 后端角色/对账/成本回归 | `npm run test -- tests/role-story-010-finance-cost-closing.test.ts tests/integration/reconciliation.test.ts tests/integration/cost-exceptions.test.ts` | 3 files / 44 tests passed；Vitest 有关闭超时提示但 exit code 0；成本异常测试中模拟缺表失败的 stderr 为既有预期场景 | 财务读对账 200，财务写 BOM 修正 403，技术员写入口进入 400 参数校验，病例编辑写 `case_edit` 日志，关账阻断/重算/调整回归通过 |
| 前端对账页面测试 | `npm run test -- src/pages/reconciliation/components/ReconcileProjectTab.test.tsx src/pages/reconciliation/Reconciliation.test.tsx src/pages/reconciliation/hooks/useReconciliationPage.test.ts` | 3 files / 23 tests passed | 财务隐藏 `修正BOM`，技术角色显示 |
| 前端成本页面测试 | `npm run test -- src/pages/cost/CostDashboard.test.ts src/pages/cost/CostDashboard.adjustments.render.test.tsx src/pages/cost/CostAlerts.render.test.tsx src/pages/cost/AuditTrail.render.test.tsx` | 4 files / 21 tests passed；React Router future flag warnings only | 关账阻断提示、调整单刷新、异常页失败态、审计轨迹渲染通过 |
| 后端构建 | `npm run build` in `后端代码/server` | passed | `tsc` 通过 |
| 前端构建 | `npm run build` in `前端代码` | passed | Vite build 通过，仅 chunk size warning |
| Playwright 前置规则 | 读取 AGENTS Playwright 强规则和两条记忆；`find`, `test -x`, `--version`, real launch | passed | Chrome for Testing `147.0.7727.15`，真实 launch title `chromium-path-ok` |
| 真实页面: 财务对账 | Playwright 登录 `sunli`，打开 `/reconciliation`，展开 `RS010财务对账差异项目` | passed | 截图 `docs/role-story-runs/screenshots/010/rs010-1781954382515-finance-reconciliation-no-fix-bom.png`；可见 `审计差异`，不可见 `修正BOM` |
| 真实后端: 财务越权写 | 财务 token `POST /api/v1/reconciliation/logs` | passed | HTTP 403 `FORBIDDEN`；DB 回看 `bom_items.usage_per_sample=1`，伪修正日志 0 条 |
| 真实页面: 成本关账阻断 | Playwright 登录财务打开 `/abc/dashboard` | passed | 截图 `docs/role-story-runs/screenshots/010/rs010-1781954382515-finance-dashboard-close-blocked.png`；关账按钮禁用并显示阻断原因 |
| 真实后端: 关账阻断 | 插入 `RS010-PERIOD-209904` calculated 期间和开放 error 异常，财务调用 close | passed | HTTP 422 `OPEN_COST_EXCEPTIONS` |
| 真实页面: 技术交接 | Playwright 登录 `zhangwei`，打开同一对账项目 | passed | 截图 `docs/role-story-runs/screenshots/010/rs010-1781954382515-technician-reconciliation-fix-bom.png`；技术员可见 `修正BOM` |
| 操作日志回看 | 财务 token `GET /api/v1/logs?page=1&pageSize=5` | passed | HTTP 200 |

## 故事收口报告

- P0/P1 是否清零: 是。财务不再能从前端或后端直接修正 BOM 标准。
- 影响角色交接或事实链的 P2 是否清零: 是。病例项目/状态修改补入对账日志，BOM 修正保持技术员/管理员职责。
- 角色职责/权限边界是否合理: 是。财务可读对账、审计差异、处理成本月结；技术员保留 BOM 标准修正。
- 页面/弹窗验证: 已覆盖财务对账页、财务成本看板、技术员对账页。
- 前后端权限一致性验证: 已覆盖财务页面隐藏、财务 API 403、技术员 API 可进入业务校验。
- 后端/API/数据库验证: 已覆盖对账读接口、BOM 修正写接口、病例编辑日志、关账阻断、日志 API。
- 数据回看验证: 已回看 BOM 用量未被财务越权写污染，伪修正日志未产生；测试回看 `case_edit` 日志。
- 库存/BOM/出库/成本/预警/审计影响: BOM 标准由技术侧维护；出库未补算和成本异常阻断关账；对账和关账证据可追溯。
- 未处理 P3: 成本看板当前没有显式选择历史期间的入口优化，若后续财务需要跨月补账，可在报表/期间管理故事中增强筛选体验。
- 相邻故事线索: 011 继续复核切片成本、盈利分析、收费对照和趋势导出口径是否只使用可信已核算快照。
- 当前 git 状态: 工作区包含 001-010 多个故事的未提交改动；本故事只新增/修改 010 相关代码、测试、截图和运行记录。
