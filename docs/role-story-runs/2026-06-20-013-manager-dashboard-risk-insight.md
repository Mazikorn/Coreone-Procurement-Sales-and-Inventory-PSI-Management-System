# 管理者仪表盘、预警和成本趋势查看 用户故事运行记录

## 故事边界

- 故事: 作为管理者，我要通过仪表盘、预警和成本趋势查看经营状态，以便快速发现库存和成本风险
- 角色: 管理者
- 用户目标: 首页和报表指标可信，不误导决策
- 涉及页面: `/`, `/alerts`, `/inventory`, `/abc/dashboard`, `/abc/trend`, `/abc/profitability`
- 涉及后端/API/数据表: `/api/v1/auth/login`, `/api/v1/inventory`, `/api/v1/inventory/stats`, `/api/v1/alerts`, `/api/v1/alerts/stats`, `/api/v1/abc/dashboard`, `/api/v1/abc/slide-cost-trend`, `/api/v1/abc/profitability`, `/api/v1/users`, `/api/v1/outbound`, `/api/v1/abc/periods`, `/api/v1/abc/bom-fee-mappings/:id`, `users`, `roles`, `inventory`, `inventory_batches`, `alerts`, `abc_cost_snapshots`
- 上游输入: 库存、预警、成本、利润
- 下游交接: 管理决策、整改任务
- 明确不做: 不处理跨角色采购到审计的完整端到端闭环；进入 014。

## 当前检索记录

- 角色菜单/路由: 新增 `manager`，仅可见首页、预警中心、库存列表、成本看板、盈利分析、成本趋势；不显示系统管理、仓储执行、消耗对账或 ABC 配置入口。
- 前端页面/组件/hook: `permissions.ts`, `App.tsx`, `AppSidebar.tsx`, `Dashboard.tsx`, `dashboard-roles.ts`, `useDashboardPage.ts`, `Alerts.tsx`, `AlertTable.tsx`, `AlertDetailModal.tsx`, `AlertConsumptionDetailModal.tsx`, `InventoryList.tsx`, `InventoryTable.tsx`, `InventoryDetailModal.tsx`, `useInventoryPage.ts`。
- 后端路由/权限/副作用: `manager` 可读库存、预警、ABC 看板/趋势/盈利结果；不能写用户、出库、预警处理、ABC 期间或收费映射。
- 数据表/审计日志: 管理者标准账号 `guanli`、系统角色 `ROLE-MGR`；本故事不允许管理者写库存、出库、预警处理、成本配置或系统管理事实。
- 测试: 新增 `role-story-013-manager-risk-insight.test.ts`；扩展前端权限、仪表盘、预警、库存和路由测试。
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, 012 运行记录。
- 库存/BOM/出库/成本/预警/审计影响: 管理者只能消费库存、预警、成本和利润结果；不能替仓管处理预警/出库/报废，也不能替财务配置 ABC，避免决策角色污染事实链。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 原系统没有独立管理者角色，只能借用 admin 查看经营信息 | 管理决策职责与系统管理/仓储/财务写权限混在一起 | 管理者为了看指标被赋予过宽权限，可误改用户、库存、出库和成本配置 | P1 修复 |
| 用户目标是否完整 | 首页、库存、预警、ABC 看板、趋势、盈利页可支撑风险查看 | 结果查看目标合理，但必须只读 | 管理者可发现风险并交给责任角色处理 | 保留并验证 |
| 信息字段是否够用 | 仪表盘有库存/预警/成本概览，库存和成本页可钻到结果 | 高频经营判断够用；低频模型验证不是本故事主路径 | 可支撑发现风险，不负责纠偏 | 保留 |
| 交接关系是否正确 | 管理者查看风险，仓管/财务/技术承担整改 | 原预警和库存执行动作暴露后会把整改动作推给管理者 | 角色交接断裂，风险查看者可能直接改事实 | P1/P2 修复 |
| 状态流转是否合理 | 管理者不应改变库存、预警、成本配置状态 | 写接口和页面动作拒绝后，状态仍由责任角色流转 | 避免管理者误触发库存/预警/成本状态变化 | 回归验证 |
| 用户工作量是否合理 | 管理者只需查看汇总和风险详情 | 修复后无需记住哪些按钮不能点 | 减少长期靠口头约束防误操作 | 保留 |
| 是否支撑成本/审计 | 管理者只读，不产生业务审计事实 | 合理；审计责任留给实际操作角色 | 防止审计责任不清 | 回归验证 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS013-P1-01 | 角色建模/权限 | 系统没有 `manager` 角色，管理者故事只能用 `admin` 完成查看 | 现场复核角色权限、种子账号、前端菜单时未发现管理者角色 | 管理者查看经营风险会附带系统管理、仓储执行、财务配置写权限，职责严重错位 | P1 | 新增 `manager` 只读经营洞察角色、标准账号、菜单、首页配置和后端读权限 | 后端权限测试、前端权限/仪表盘测试、真实管理者登录页面和直接 API | completed |
| RS013-P1-02 | 路由守卫/权限一致性 | `/stocktaking`, `/scraps`, `/transfers` 没有 `RoleRoute`，管理者可直达仓储执行页 | 首轮 Playwright 直达 `/stocktaking` 后停留在该页 | 管理者可绕过菜单进入盘点、报废、调拨，破坏仓储职责边界 | P1 | 给盘点、报废、调拨路由补 `RoleRoute` 守卫 | `App.routes.test.ts`，Playwright 直达路由均回到 `/` | completed |
| RS013-P2-01 | 页面动作/角色交接 | 管理者库存页仍显示 `出库登记`、行 `出库`、批量出库/报废和 checkbox | Playwright 真实管理者库存页首轮检查发现执行动作 | 管理者可从风险查看进入仓储执行动作，增加误出库/误报废风险 | P2 | 库存页增加 `canManageInventoryActions`，仅 admin/warehouse_manager 显示并可打开出库/报废动作 | 前端库存 hook/table 测试、Vite build、Playwright 库存页复验 | completed |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS013-P1-01 | `后端代码/server/src/constants/rolePermissions.ts` | 新增 `manager` 权限: `dashboard`, `inventory:view`, `alerts:view`, `cost_analysis:view` |
| RS013-P1-01 | `后端代码/server/src/database/DatabaseManager.ts` | 新增标准账号 `guanli` 和系统角色 `ROLE-MGR`，并纳入启动种子/启用保护 |
| RS013-P1-01 | `后端代码/server/src/app.ts`, `后端代码/server/src/routes/roles-v1.1.ts` | 后端允许 manager 读取库存、预警、ABC 结果页，系统角色保护包含 manager |
| RS013-P1-01 | `前端代码/src/lib/permissions.ts`, `AppSidebar.tsx`, `Dashboard.tsx`, `dashboard-roles.ts` | 新增 manager 菜单、侧栏角色名和管理者首页卡片/快捷入口 |
| RS013-P1-01 | `docs/05_Role_Permission_Matrix.md` | 记录 manager 只读经营洞察角色和权限边界 |
| RS013-P1-02 | `前端代码/src/App.tsx`, `前端代码/src/App.routes.test.ts` | 给 `/stocktaking`, `/scraps`, `/transfers` 补路由守卫和回归断言 |
| RS013-P2-01 | `前端代码/src/pages/inventory/hooks/useInventoryPage.ts` | 增加 `canManageInventoryActions`，守住出库、批量出库、批量报废、物料选择和确认写动作 |
| RS013-P2-01 | `InventoryList.tsx`, `InventoryTable.tsx`, `InventoryDetailModal.tsx` | 管理者只读时隐藏出库登记、行/组出库、批量出库/报废、checkbox 和详情出库按钮 |
| RS013-P2-01 | `InventoryTable.test.tsx`, `useInventoryPage.test.ts` | 增加管理者库存只读断言，确认前端动作隐藏且 hook 不调用报废 API |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 后端管理者权限回归 | `npm run test -- tests/role-story-013-manager-risk-insight.test.ts` | 1 file / 2 tests passed；Vitest 有关闭超时提示但 exit code 0 | manager 可 GET 库存/预警/ABC 结果；POST 用户/出库/处理预警/开期间、PUT 收费映射均 403 |
| 前端权限/页面回归 | `npm run test -- src/pages/inventory/components/InventoryTable.test.tsx src/pages/inventory/hooks/useInventoryPage.test.ts src/lib/permissions.test.ts src/pages/dashboard/hooks/useDashboardPage.test.ts src/pages/alerts/components/AlertTable.test.tsx src/App.routes.test.ts` | 6 files / 33 tests passed | manager 菜单、首页、预警只读、库存只读、仓储执行路由守卫均通过 |
| 前端构建 | `npm run build` in `前端代码` | passed | Vite build 通过，仅 chunk size warning |
| Playwright 前置规则 | 读取 AGENTS Playwright 强规则和两条记忆；`test -x`, `--version`, real launch | passed | Chrome for Testing `147.0.7727.15`，真实 launch title `chromium-path-ok`；未下载浏览器 |
| 真实页面: 管理者菜单和首页 | Playwright 登录 `guanli` 打开 `/` | passed | 截图 `docs/role-story-runs/screenshots/013/rs013-1781956790334-manager-dashboard.png`；应有菜单全在，禁入菜单全无 |
| 真实页面: 预警只读 | Playwright 打开 `/alerts` | passed | 截图 `docs/role-story-runs/screenshots/013/rs013-1781956790334-manager-alerts-readonly.png`；无精确 `处理`/`忽略` 行按钮，checkbox 数 0 |
| 真实页面: 库存只读 | Playwright 打开 `/inventory` | passed | 截图 `docs/role-story-runs/screenshots/013/rs013-1781956790334-manager-inventory-readonly.png`；无 `出库登记`、精确 `出库`、`批量出库`、`批量报废`，checkbox 数 0；保留 `数据诊断` |
| 真实页面: 成本结果 | Playwright 打开 `/abc/dashboard`, `/abc/trend`, `/abc/profitability` | passed | 截图 `...manager-abc-dashboard.png`, `...manager-cost-trend.png`, `...manager-profitability.png` |
| 直达路由 | Playwright 直达 `/stocktaking`, `/scraps`, `/transfers`, `/outbound`, `/reconciliation`, `/abc/fee-mappings`, `/abc/activity-centers`, `/abc/cost-pools` | passed | 所有 forbidden route 最终路径均为 `/` |
| 直接 API | 管理者 token 调用读/写 API | passed | GET 库存、预警、ABC 看板/趋势/盈利均 200；写用户、出库、处理预警、开期间、改收费映射均 403 |

## 故事收口报告

- P0/P1 是否清零: 是。无独立管理者角色和直达仓储执行路由两项 P1 已修复并验证。
- 影响角色交接或事实链的 P2 是否清零: 是。库存页暴露仓储执行动作的 P2 已修复并验证。
- 角色职责/权限边界是否合理: 是。manager 只读消费库存、预警、成本和利润结果，不写系统、仓储、对账或财务配置事实。
- 页面/弹窗验证: 已覆盖真实管理者首页、预警、库存、ABC 看板、成本趋势、盈利分析和直达禁入路由。
- 前后端权限一致性验证: 已覆盖前端菜单/路由、页面按钮隐藏、hook guard、后端直接 API 200/403。
- 后端/API/数据库验证: 已覆盖标准账号登录、manager 可读 API 和写接口拒绝；本故事不产生业务写入副作用。
- 数据回看验证: 管理者可回看库存、预警、成本看板、成本趋势和盈利分析；不能进入对账/配置/仓储执行页。
- 库存/BOM/出库/成本/预警/审计影响: 管理者不再能改库存、出库、预警处理或 ABC 配置，只把风险发现交给仓管、技术或财务处理。
- 未处理 P3: 管理者可运行库存 `数据诊断`，当前视为风险洞察能力保留；若后续产品要求诊断也只给仓管/管理员，可单独收窄。
- 相邻故事线索: 014 需要从采购、入库、出库、对账、成本到日志验证跨角色事实链是否完整贯通。
- 当前 git 状态: 工作区包含 001-013 多个故事累计未提交改动；本故事只新增/修改 013 相关权限、测试、截图和运行记录。
