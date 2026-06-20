# 病理医生只读查看项目、BOM 和成本结果 用户故事运行记录

## 故事边界

- 故事: 作为病理医生，我要查看项目、BOM、切片成本和盈利趋势，以便理解检测项目成本但不破坏业务数据
- 角色: 病理医生
- 用户目标: 医生可查看关键结果且不能误改配置
- 涉及页面: `/projects`, `/bom`, `/abc/slide-cost`, `/abc/profitability`, `/abc/trend`, `/alerts`
- 涉及后端/API/数据表: `/api/v1/projects`, `/api/v1/boms`, `/api/v1/abc/slide-cost-trend`, `/api/v1/abc/profitability`, `/api/v1/alerts`, `/api/v1/reconciliation`, `projects`, `boms`, `outbound_abc_details`, `cost_exceptions`
- 上游输入: 项目、BOM、成本结果、预警
- 下游交接: 临床/实验室决策
- 明确不做: 不处理管理者全局经营看板；进入 013。

## 当前检索记录

- 角色菜单/路由: 病理医生可进入项目、BOM、切片成本、盈利分析、成本趋势和预警；已移除消耗对账和收费映射入口。
- 前端页面/组件/hook: `permissions.ts`, `App.tsx`, `useProjectsPage.ts`, `useBOMPage.ts`, `SlideCostAnalysis.tsx`, `ProfitabilityAnalysis.tsx`, `CostTrend.tsx`。
- 后端路由/权限/副作用: 项目/BOM/ABC 分析/预警只读可访问；项目/BOM/ABC 配置写接口和消耗对账写接口必须拒绝病理医生。
- 数据表/审计日志: 本故事不允许医生写入项目、BOM、成本配置、对账日志或库存事实。
- 测试: 新增 `role-story-012-pathologist-readonly-insight.test.ts`；扩展 `permissions.test.ts`；回归项目、BOM、成本页面测试。
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, 011 运行记录。
- 库存/BOM/出库/成本/预警/审计影响: 医生只能消费可信结果，不能修改项目/BOM/收费映射/消耗对账，以免破坏后续成本事实链。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 医生应查看项目、BOM 和成本结果，辅助理解检测项目成本 | 原设计把消耗对账和收费映射也暴露给医生，职责越界 | 医生可接触 LIS 消耗对账和财务配置入口，容易破坏事实链 | P1/P2 修复 |
| 用户目标是否完整 | 项目、BOM、切片成本、盈利趋势和预警可查看 | 只读目标合理 | 支撑临床/实验室决策 | 保留并验证 |
| 信息字段是否够用 | 页面展示检测服务、BOM 组成、成本趋势、盈利和预警 | 对医生只读理解成本基本够用 | 不要求医生处理成本配置 | 保留 |
| 交接关系是否正确 | 技术/财务维护事实，医生查看结果 | 原消耗对账入口会把技术/财务交接任务交给医生 | 角色交接断裂，可能造成异常处理责任不清 | 移除入口并收紧后端 |
| 状态流转是否合理 | 医生不参与项目/BOM/成本配置状态变更 | 写接口拒绝后，状态流转由技术/财务承担 | 防止医生误改业务状态 | 回归验证 |
| 用户工作量是否合理 | 医生只需要查看和筛选，不承担修正 | 修复后操作量合理 | 减少长期手工解释/误修 | 保留 |
| 是否支撑成本/审计 | 医生不写审计事实；技术/财务写操作仍由审计链覆盖 | 合理 | 审计责任边界清楚 | 回归验证 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS012-P1-01 | 权限/角色职责 | 病理医生前端菜单包含 `/reconciliation`，后端 `/api/v1/reconciliation` 也允许 `pathologist`，导致医生可直接发起 LIS 导入、病例修改和成本异常写入 | 现场走查 `permissions.ts` 与 `app.ts`；直接 API 验证前置风险 | 医生可越权介入技术/财务对账，破坏 LIS、BOM、出库、成本异常事实链 | P1 | 后端对账路由改为仅 `admin/finance/technician`；病理医生菜单移除消耗对账 | 后端权限测试、真实医生登录菜单、直达路由、直接 API 403 | completed |
| RS012-P2-01 | 权限/财务配置入口 | 病理医生前端菜单包含 `/abc/fee-mappings`，虽然后端写入已拒绝，但 UI 仍把财务收费映射配置暴露给医生 | 现场走查 `permissions.ts`；真实医生侧栏检查 | 医生看到财务配置工作台，角色职责错位，容易形成线下请医生修配置的长期流程 | P2 | 病理医生菜单移除收费映射和其他 ABC 配置入口，仅保留成本结果查看 | 前端权限单测、真实医生侧栏、直达路由验证 | completed |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS012-P1-01 | `后端代码/server/src/app.ts` | `/api/v1/reconciliation` 改用 `requireStrictRole('admin', 'finance', 'technician')`，病理医生不能再进入消耗对账 API |
| RS012-P1-01 | `前端代码/src/lib/permissions.ts` | 病理医生角色移除 `/reconciliation` 菜单/路由权限 |
| RS012-P1-01 | `后端代码/server/tests/role-story-012-pathologist-readonly-insight.test.ts` | 新增医生只读故事权限测试，覆盖可读结果页和被拒绝写接口 |
| RS012-P2-01 | `前端代码/src/lib/permissions.ts` | 病理医生角色移除 `/abc/fee-mappings`，不再暴露财务收费映射配置入口 |
| RS012-P2-01 | `前端代码/src/lib/permissions.test.ts` | 增加病理医生只读洞察权限断言，确保结果页可见、配置/对账页不可见 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 后端医生只读权限回归 | `npm run test -- tests/role-story-012-pathologist-readonly-insight.test.ts tests/role-story-007-modeling-permissions.test.ts tests/role-story-008-technician-reconciliation.test.ts tests/role-story-010-finance-cost-closing.test.ts tests/integration/cost-exceptions.test.ts` | 5 files / 29 tests passed；Vitest 有关闭超时提示但 exit code 0；成本异常测试中模拟缺表失败的 stderr 为既有预期场景 | 医生可 GET 项目/BOM/盈利/趋势/预警；医生 POST 项目/BOM、导入对账、开期间、改收费映射均 403 |
| 前端权限/页面回归 | `npm run test -- src/lib/permissions.test.ts src/App.routes.test.ts src/pages/master/hooks/useProjectsPage.test.ts src/pages/bom/hooks/useBOMPage.test.ts src/pages/cost/SlideCostAnalysis.test.ts src/pages/cost/ProfitabilityAnalysis.test.ts src/pages/cost/CostTrend.test.ts` | 8 files / 49 tests passed | 医生菜单与路由只保留查看类页面，项目/BOM/成本页面回归通过 |
| 后端构建 | `npm run build` in `后端代码/server` | passed | `tsc` 通过 |
| 前端构建 | `npm run build` in `前端代码` | passed | Vite build 通过，仅 chunk size warning |
| Playwright 前置规则 | 读取 AGENTS Playwright 强规则和两条记忆；`find`, `test -x`, `--version`, real launch | passed | Chrome for Testing `147.0.7727.15`，真实 launch title `chromium-path-ok` |
| 真实页面: 医生侧栏 | Playwright 登录医生角色，检查侧栏 | passed | 截图 `docs/role-story-runs/screenshots/012/rs012-1781955412102-doctor-sidebar.png`；侧栏不包含 `消耗对账`、`收费映射` |
| 真实页面: 项目只读 | Playwright 打开 `/projects` | passed | 截图 `docs/role-story-runs/screenshots/012/rs012-1781955412102-doctor-projects-readonly.png`；未发现 `新建项目`、`批量导入`、`删除` 写入口 |
| 真实页面: BOM 只读 | Playwright 打开 `/bom` | passed | 截图 `docs/role-story-runs/screenshots/012/rs012-1781955412102-doctor-bom-readonly.png`；未发现 `新建BOM`、`批量导入`、`删除` 写入口 |
| 真实页面: 成本结果 | Playwright 打开 `/abc/slide-cost`, `/abc/profitability`, `/abc/trend`, `/alerts` | passed | 截图 `docs/role-story-runs/screenshots/012/rs012-1781955412102-doctor-slide-cost.png`, `...doctor-profitability.png`, `...doctor-trend.png`, `...doctor-alerts.png` |
| 直达路由/直接 API | 浏览器直达 `/reconciliation`, `/abc/fee-mappings`；医生 token POST `/reconciliation/cases/import`, `/abc/periods`, `/projects` | passed | 直达路由未停留在目标页；直接 API 分别 403 |

## 故事收口报告

- P0/P1 是否清零: 是。医生越权进入消耗对账的 P1 已修复并验证。
- 影响角色交接或事实链的 P2 是否清零: 是。医生看到财务收费映射配置入口的 P2 已修复并验证。
- 角色职责/权限边界是否合理: 是。医生只读项目、BOM、成本结果和预警；技术/财务继续承担建模、对账和配置责任。
- 页面/弹窗验证: 已覆盖医生真实侧栏、项目、BOM、切片成本、盈利分析、成本趋势和预警页面。
- 前后端权限一致性验证: 已覆盖前端菜单/路由、后端直接 API 403 和医生真实登录行为。
- 后端/API/数据库验证: 已覆盖医生可读 API 和项目/BOM/对账/ABC 配置写接口拒绝，未产生医生写入业务事实。
- 数据回看验证: 项目/BOM/成本结果页面可正常回看；消耗对账和收费映射直达被拦截。
- 库存/BOM/出库/成本/预警/审计影响: 医生不再能改对账、BOM、成本配置或库存事实，只消费技术/财务产出的可信结果。
- 未处理 P3: 医生仍可看到部分只读成本分析入口，当前与故事目标一致；如产品后续希望进一步收窄医生成本可见范围，应单独定义可见口径。
- 相邻故事线索: 013 管理者看板需要继续确认首页/预警/库存/利润趋势是否混合不同口径，避免决策误导。
- 当前 git 状态: 工作区包含 001-012 多个故事的未提交改动；本故事只新增/修改 012 相关权限、测试、截图和运行记录。
