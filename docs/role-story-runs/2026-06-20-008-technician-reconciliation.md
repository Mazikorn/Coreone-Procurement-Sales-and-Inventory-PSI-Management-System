# 技术员查看消耗、参与对账并处理项目/BOM 异常 用户故事运行记录

## 故事边界

- 故事: 作为技术员，我要查看消耗、参与对账并处理项目/BOM 异常，以便 LIS 消耗和系统出库能对上
- 角色: 技术员
- 用户目标: 消耗差异可识别、可修正、可交给财务
- 涉及页面: `/reconciliation`, `/inventory`, `/abc/slide-cost`, `/alerts`, `/bom`, `/projects`
- 涉及后端/API/数据表: `/api/v1/reconciliation`, `/api/v1/inventory`, `/api/v1/abc`, `/api/v1/alerts`, `/api/v1/boms`, `/api/v1/projects`; `reconciliation_*`, `inventory`, `outbound_records`, `lis_cases`, `boms`, `projects`, `alerts`, `operation_logs`
- 上游输入: 出库记录、LIS/病例消耗、BOM
- 下游交接: 财务对账和成本核算
- 明确不做: 不修改财务 ABC 配置、成本池、收费映射或关账逻辑；若技术员看不到必要上下文、能越权修改财务配置、或消耗/BOM异常无法交给财务，作为当前故事问题处理。

## 当前检索记录

- 角色菜单/路由: 复核 `ROLE_MENU_MAP`, `App.tsx`, `AppSidebar`; 原技术员菜单缺 `/reconciliation`，却暴露多项 ABC 成本页面和 `/abc/fee-mappings` 财务配置入口；对账和 ABC 路由原未接入 `RoleRoute`。
- 前端页面/组件/hook: 复核 `Reconciliation.tsx`, `useReconciliationPage.ts`, `SlideCostAnalysis.tsx`, `FeeMappingConfig.tsx`; 本故事需要技术员看到消耗对账和切片成本，但不进入财务配置。
- 后端路由/权限/副作用: 复核 `app.ts`, `reconciliation-v1.1.ts`, `abc-v1.1.ts`; `/api/v1/reconciliation` 已允许技术员，`/api/v1/abc` 原不允许技术员，导致切片成本前端入口与 API 403 不一致；ABC 写操作由 `requireCostWrite` 限制 admin/finance。
- 数据表/审计日志: 复核 `lis_cases`, `outbound_records`, `outbound_items`, `outbound_abc_details`, `cost_exceptions`, `reconciliation_logs`; Playwright 事实数据 `rs008-1781952391768` 已触发 `reconciliation_variance` 成本异常。
- 测试: 新增 `role-story-008-technician-reconciliation.test.ts`；更新 `App.routes.test.ts`, `permissions.test.ts`；回归 `reconciliation.test.ts`, `abc-cost.test.ts`。
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, 007 运行记录, 006 仓管出库/逆向流程记录, `docs/05_Role_Permission_Matrix.md`。
- 库存/BOM/出库/成本/预警/审计影响: 技术员可查看 LIS 病例、项目/BOM理论消耗、实际出库、成本异常和切片成本结果；财务配置仍由财务/管理员维护。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 技术员负责识别项目/BOM消耗差异，财务负责 ABC 配置、成本池和收费映射 | 原设计缺消耗对账入口，同时暴露财务配置入口 | 技术员无法接住出库/LIS差异，或误入财务配置 | 补 `/reconciliation`，技术员仅保留 `/abc/slide-cost` 成本结果入口 |
| 用户目标是否完整 | 需要看到 LIS 病例、实际出库、BOM理论消耗和切片成本结果 | 修复后可在对账页看项目/物料差异，并在切片成本页看成本结果 | 支撑技术员判断差异是否来自 BOM/项目口径 | Playwright 以 `rs008-1781952391768` 验证对账和切片成本页面 |
| 信息字段是否够用 | 对账页展示病例、出库、未配置 BOM、项目物料差异；切片成本页展示 BOM、样本数、成本、收入、利润 | 当前高频判断字段足够；更细的异常处理审批留给财务故事 | 不阻断 008 | 本故事不扩展财务审批字段 |
| 交接关系是否正确 | 技术员对账差异可写入 `cost_exceptions`，财务在后续故事处理 | 修复后技术员能把差异交给财务，但不能写财务配置 | 对账异常不会停留在线下沟通 | 验证 `CE-20260620-392462-000` 成本异常 open |
| 状态流转是否合理 | 差异审计产生 open/warning/error 成本异常，恢复后可关闭 | 当前主流程可用 | 财务关账前可识别阻断项 | 复用并回归 `reconciliation.test.ts` |
| 用户工作量是否合理 | 技术员从侧边栏进入消耗对账和切片成本，不需要记住隐藏 URL | 修复前必须直达 URL 或面对 403；修复后路径顺畅 | 降低线下查账和手工转述 | 前端菜单/路由测试和真实页面验证 |
| 是否支撑成本/审计 | 对账差异进入异常台账；ABC 只读结果可回看；财务配置写入仍被拒绝 | 支撑成本可信链，且不扩大配置权限 | 防止技术员误改成本池/收费映射 | 后端 403 测试和 Playwright 财务配置直达拦截 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS-008-01 | 角色路径/交接 | 技术员缺 `/reconciliation` 前端入口，不能自然进入消耗对账 | `ROLE_MENU_MAP.technician` 原不含 `/reconciliation`；故事清单和权限矩阵要求技术员参与对账 | 出库/LIS/BOM差异无法由技术员接住，后续财务核算缺技术解释 | P1 | 给技术员增加消耗对账入口，并用 `RoleRoute` 守卫直达路径 | 前端权限/路由测试，Playwright 技术员 `/reconciliation` 页面回看 | fixed/verified |
| RS-008-02 | 前后端一致性/成本结果 | 技术员前端有 ABC 成本页面，但后端 `/api/v1/abc` 不允许技术员，且前端暴露 `/abc/fee-mappings` 财务配置入口 | `app.ts` 原 `/api/v1/abc` 仅 admin/finance/pathologist；`ROLE_MENU_MAP.technician` 原含 dashboard/profitability/fee-comparison/fee-mappings/trend | 技术员看不到切片成本结果，或误入财务配置，角色职责错位 | P1 | 后端 ABC 允许技术员读；ABC 写操作继续 `requireCostWrite`；前端技术员只保留 `/abc/slide-cost`，财务配置路由接入 `RoleRoute` | 后端 008 测试、前端权限/路由测试、Playwright `/abc/slide-cost` 与 `/abc/fee-mappings` 验证 | fixed/verified |
| RS-008-03 | 文档口径 | 权限矩阵仍写旧的技术员成本入口、项目/BOM/设备/工时写权限和 ABC 权限 | `docs/05_Role_Permission_Matrix.md` 多处与 007/008 修复后代码不一致 | 后续故事可能按旧口径判断完成状态 | P2 | 同步权限矩阵为当前实现事实 | 文档复核 | fixed |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS-008-01 | `前端代码/src/lib/permissions.ts`, `前端代码/src/App.tsx` | 技术员菜单补 `/reconciliation`；对账路由接入 `RoleRoute` |
| RS-008-02 | `前端代码/src/lib/permissions.ts`, `前端代码/src/App.tsx`, `后端代码/server/src/app.ts` | 技术员前端只保留 `/abc/slide-cost`；ABC/间接成本相关路由接入 `RoleRoute`；后端 `/api/v1/abc` 允许技术员读取，写入仍由 `requireCostWrite` 拒绝 |
| RS-008-03 | `docs/05_Role_Permission_Matrix.md` | 更新技术员职责、前端页面矩阵、项目/BOM/设备/工时写权限、对账和 ABC 权限说明 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 故事切换 | 更新 `docs/role-story-list-2026-06-20.md` | 008 标记为 `in_progress` | 007 已 completed，008 运行记录已创建 |
| 后端权限/对账/ABC 回归 | `npm run test -- tests/role-story-008-technician-reconciliation.test.ts tests/integration/reconciliation.test.ts tests/integration/abc-cost.test.ts` | 3 files / 46 tests passed | 技术员 GET 对账上下文和 ABC profitability 200；技术员 POST 成本池/收费映射审计 403；对账和 ABC 既有回归通过 |
| 前端权限/路由回归 | `npm run test -- src/App.routes.test.ts src/lib/permissions.test.ts` | 2 files / 12 tests passed | 对账/ABC 路由均接入 `RoleRoute`；技术员有 `/reconciliation` 和 `/abc/slide-cost`，无财务配置入口 |
| 后端构建 | `npm run build` | passed | TypeScript 构建通过 |
| 前端构建 | `npm run build` | passed | Vite build 通过，仅保留 chunk size warning |
| Playwright 前置规则 | 读取 `AGENTS.md` Playwright 强规则和两条记忆文件；`find ~/Library/Caches/ms-playwright`; `test -x`; `--version`; 真实 launch | passed | Chrome for Testing `147.0.7727.15`; launch title `chromium-path-ok`; 未运行 `npx playwright install` |
| 真实故事 API/副作用 | 插入 `rs008-1781952391768` 项目/BOM/LIS/出库/ABC 快照；技术员调用对账审计和 ABC 只读 API | passed | 技术员对账项目/物料回看成功；审计生成成本异常 `CE-20260620-392462-000`，`severity=error`, `status=open`; ABC 明细 `total_cost=72`, `fee_amount=120`, `profit=48`; 技术员写 ABC 配置 403 |
| 真实页面回看 | Playwright 登录技术员访问 `/reconciliation`, `/abc/slide-cost`, `/abc/fee-mappings` | passed | 截图: `docs/role-story-runs/screenshots/008/technician-reconciliation.png`, `technician-slide-cost.png`, `technician-fee-mappings-redirect.png`; 对账页显示项目，切片成本页显示 BOM，收费映射直达重定向首页且侧边栏无收费映射 |

## 故事收口报告

- P0/P1 是否清零: 已清零；RS-008-01/02 均 fixed/verified。
- 影响角色交接或事实链的 P2 是否清零: 已清零；RS-008-03 已同步权限矩阵。
- 角色职责/权限边界是否合理: 当前故事内合理；技术员能看消耗对账和切片成本结果，可发起差异审计交给财务，但不能进入或写 ABC 财务配置。
- 页面/弹窗验证: 已覆盖技术员 `/reconciliation`, `/abc/slide-cost`, `/abc/fee-mappings` 直达拦截。
- 前后端权限一致性验证: 已覆盖前端菜单/路由和后端 API 200/403；技术员读成本结果 200，写财务配置 403。
- 后端/API/数据库验证: 已覆盖对账 summary/projects/materials、差异审计、ABC profitability、ABC 配置写拒绝。
- 数据回看验证: `rs008-1781952391768` 项目/BOM/LIS/出库/ABC 快照在 API 和页面回看；成本异常 `CE-20260620-392462-000` 已落库。
- 库存/BOM/出库/成本/预警/审计影响: 本故事不直接改库存；验证了 BOM 理论消耗、出库实际消耗、LIS 病例和 ABC 成本快照能形成对账异常并进入成本异常台账。
- 未处理 P3: 技术员是否应导入 LIS 或编辑病例仍需结合真实医院岗位分工细化；当前保留既有对账能力，不在 008 扩展审批流。
- 相邻故事线索: 009 需继续验证财务可配置作业中心、成本池、收费映射，并且技术员收敛后的只读成本结果不会阻断财务配置。
- 当前 git 状态: 2026-06-20 18:48 CST 复核时分支 `codex/abc-productization-phase0-1-2026-06-15` ahead 191，工作区含本轮和前序故事未提交改动；未回退无关改动。
