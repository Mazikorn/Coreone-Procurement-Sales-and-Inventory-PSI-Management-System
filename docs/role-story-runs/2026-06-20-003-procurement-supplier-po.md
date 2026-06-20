# 采购员维护供应商与采购订单 用户故事收口记录

## 故事边界

- 故事: 作为采购员，我要维护供应商并创建采购订单，以便仓管可以按订单收货入库
- 角色: 采购员
- 用户目标: 供应商与采购订单可创建、跟进、交给仓管
- 涉及页面: `/suppliers`, `/purchase-orders`, `/inventory`, `/alerts`
- 涉及后端/API/数据表: `/api/v1/suppliers`, `/api/v1/purchase-orders`, `/api/v1/materials`, `/api/v1/inbound`, `/api/v1/logs`; `suppliers`, `purchase_orders`, `materials`, `inbound_records`, `operation_logs`
- 上游输入: 物料、供应商、采购需求
- 下游交接: 待入库订单、供应商来源
- 明确不做: 不处理仓管实际入库和批次成本落库；若供应商或采购订单设计会阻断仓管入库、库存预期、供应商来源或审计事实链，作为当前故事问题处理。

## 当前检索记录

- 角色菜单/路由: `前端代码/src/lib/permissions.ts`, `前端代码/src/App.tsx`, `前端代码/src/components/layout/AppSidebar.tsx`, `docs/05_Role_Permission_Matrix.md`
- 前端页面/组件/hook: `前端代码/src/pages/master/Suppliers.tsx`, `前端代码/src/pages/purchase/PurchaseOrders.tsx`, 采购订单测试和权限测试
- 后端路由/权限/副作用: `suppliers-v1.1.ts`, `purchase-orders-v1.1.ts`, `inbound-v1.1.ts`, `app.ts`
- 数据表/审计日志: `suppliers`, `purchase_orders`, `materials`, `inbound_records`, `operation_logs`
- 测试: `purchase-order-inbound.test.ts`, `suppliers-batch.test.ts`, `PurchaseOrders.test.ts`, `permissions.test.ts`, `App.routes.test.ts`
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, `docs/05_Role_Permission_Matrix.md`, `docs/02_PRD.md`, `docs/04_Business_Rules.md`, 002 运行记录相邻线索
- 库存/BOM/出库/成本/预警/审计影响: 本故事产生供应商来源和采购订单，影响仓管入库待办、批次供应商、采购单价、库存预期、供应商退货和后续成本事实。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 采购员可维护供应商和采购订单；仓管负责按订单入库 | 采购页原向采购员暴露收货入口，菜单原含入库页，职责边界偏移 | 采购员可能代替仓管完成实物入库，造成交接断裂 | 已收窄采购员前端收货/入库入口 |
| 用户目标是否完整 | 供应商可建档，采购订单可按物料和供应商创建、回看、交给仓管 | 主流程完整 | 仓管能接到待入库订单 | 已验证采购员建档/建单和仓管接单 |
| 信息字段是否够用 | 采购订单包含物料、供应商、数量、单价、备注、状态、剩余数量 | 高频主流程够用；订单快照由后端取当前物料/供应商信息，防客户端伪造 | 支撑入库匹配和成本单价来源 | 保持，后续 004 继续验证批次落库 |
| 交接关系是否正确 | 采购员创建订单，仓管在采购订单页收货并进入入库 | 原采购员也能看到收货入口，交接责任不清 | 影响仓库实物责任和审计追责 | 已修复并验证 |
| 状态流转是否合理 | 订单 pending/partial/completed/cancelled；入库更新 received/remaining | 后端已有超收、错物料/供应商、收货后取消保护 | 能支撑仓管入库主流程 | 003 验证 pending 交接；004 继续验证入库后状态 |
| 用户工作量是否合理 | 采购员可在供应商页和采购订单页完成建档/建单 | 高频流程未发现额外重复录入 | 仓管接单后无需重新录采购来源 | 保持 |
| 是否支撑库存/成本/审计 | 供应商和采购订单进入入库、批次和成本单价来源 | 原供应商/采购订单写操作缺少操作日志 | 来源追责和角色交接审计断裂 | 已补操作日志并验证 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS-003-01 | 角色职责/交接 | 采购员可在采购订单行看到“收货”，且角色菜单包含 `/inbound`；后端入库写权限却只给 admin/warehouse_manager | RED: `PurchaseOrders.test.ts` 调整为采购员不应收货后失败；Playwright 直达 `/inbound` 复核 | 采购员 -> 仓管入库交接；实物责任、库存批次和成本来源 | P2 | 收货入口仅 admin/warehouse_manager 可见；采购员菜单移除 `/inbound`；`/inbound` 增加 `RoleRoute`；权限矩阵同步 | 前端单测、路由测试、真实浏览器采购员菜单/直达路由、仓管接单验证 | completed |
| RS-003-02 | 审计/事实链 | 供应商和采购订单写操作未进入 `operation_logs` | RED: `SUP-AUDIT-001` 和 `PO-AUDIT-001` 初次回看日志为空 | 供应商来源 -> 采购订单 -> 入库批次 -> 供应商退货/成本审计 | P2 | 在供应商和采购订单写路由写入操作日志，包含模块、ID、订单号/供应商等关键上下文 | 后端日志测试、真实浏览器建档/建单后管理员 `/logs` API 回看 | completed |
| RS-003-P3-01 | API 读权限口径 | 后端仍允许采购员读取 `/api/v1/inbound`，前端已隐藏入库页和直达路由 | `app.ts` 中 inbound 路由允许 admin/warehouse_manager/procurement 读，写操作仍限制仓管/admin | 不阻断采购员供应商/采购订单故事；可能用于采购跟踪到货状态 | P3 | 记录给 004/跨角色故事继续评估是否保留采购只读跟踪 | 后续故事验证仓管入库和采购只读口径 | recorded |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS-003-01 | `前端代码/src/pages/purchase/PurchaseOrders.tsx` | `canReceivePurchaseOrders` 收窄为 admin/warehouse_manager，采购员不再显示“收货” |
| RS-003-01 | `前端代码/src/lib/permissions.ts` | 采购员菜单移除 `/inbound`，保留 `/suppliers`, `/purchase-orders`, `/inventory`, `/alerts` |
| RS-003-01 | `前端代码/src/App.tsx` | `/inbound` 加入 `RoleRoute`，防采购员直接输入 URL 进入入库页 |
| RS-003-01 | `docs/05_Role_Permission_Matrix.md` | 前端页面权限矩阵同步采购员 `/inbound` 为不可见 |
| RS-003-01 | `PurchaseOrders.test.ts`, `permissions.test.ts`, `App.routes.test.ts` | 覆盖采购员不可收货、采购员无入库菜单、直达 `/inbound` 重定向 |
| RS-003-02 | `后端代码/server/src/routes/suppliers-v1.1.ts` | 供应商创建、更新、删除、批量状态、批量删除、评级操作写入 `operation_logs` |
| RS-003-02 | `后端代码/server/src/routes/purchase-orders-v1.1.ts` | 采购订单创建和取消写入 `operation_logs` |
| RS-003-02 | `suppliers-batch.test.ts`, `purchase-order-inbound.test.ts` | 增加供应商和采购订单操作日志回归 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 采购员收货权限 RED/GREEN | `npm run test -- src/pages/purchase/PurchaseOrders.test.ts src/lib/permissions.test.ts src/App.routes.test.ts` | 11/11 通过 | 覆盖采购员不显示收货、不含 `/inbound`、直达 `/inbound` 重定向 |
| 供应商/采购订单审计 RED/GREEN | `npm run test -- tests/suppliers-batch.test.ts tests/purchase-order-inbound.test.ts` | 2 files / 34 tests 通过 | 初次 RED 为日志为空，修复后供应商和采购订单日志可回看 |
| 后端构建 | `npm run build` in `后端代码/server` | 通过 | TypeScript 编译通过 |
| 前端构建 | `npm run build` in `前端代码` | 通过 | 仅保留既有 Vite chunk warning |
| Playwright 使用前规则 | 读取 `AGENTS.md` 和两条指定记忆；`find ~/Library/Caches/ms-playwright`、`test -x`、`--version`、真实 launch | 通过 | Chromium 1217 / Chrome for Testing 147.0.7727.15；未运行 `npx playwright install` |
| 真实采购员故事闭环 | 采购员登录后检查侧边栏无入库、直达 `/inbound` 回首页、在 `/suppliers` 新增供应商、在 `/purchase-orders` 新建采购订单 | 通过 | 供应商和订单通过页面创建并 API 回看 |
| 真实仓管交接验证 | 仓管登录 `/purchase-orders` 回看同一 pending 订单 | 通过 | 仓管可见“收货”，不可见“新建采购订单” |
| 审计回看 | 管理员 `/logs` API 按供应商 ID 和采购订单 ID 查询 | 通过 | `POST /suppliers` 和 `POST /purchase-orders` 可回看 |
| 验证数据清理 | 脚本按 `role-story-003-*` 备注和唯一名称清理供应商/采购订单/物料/库位/分类 | 通过 | 输出 `validation artifacts cleaned by exact story suffix` |

## 故事收口报告

- P0/P1 是否清零: 是，本故事未发现阻断采购员建档/建单的 P0/P1。
- 影响角色交接或事实链的 P2 是否清零: 是，RS-003-01 和 RS-003-02 均已修复并验证。
- 角色职责/权限边界是否合理: 是，采购员负责供应商和采购订单；仓管负责收货入库；采购员不再从菜单或直达路由进入入库页，也不在采购订单行看到“收货”。
- 页面/弹窗验证: 已真实操作供应商新增弹窗、采购订单创建弹窗、采购员菜单、仓管采购订单行操作。
- 前后端权限一致性验证: 前端已隐藏采购员入库/收货入口；后端入库写权限仍限制 admin/warehouse_manager；采购订单创建仍限制 admin/procurement，仓管页面无新建按钮。
- 后端/API/数据库验证: 供应商和采购订单创建后 API 回看字段、状态、剩余数量、供应商来源正确；操作日志可按 ID 回看。
- 数据回看验证: 采购员创建的供应商和采购订单可在页面和 API 回看；仓管可回看待入库订单。
- 库存/BOM/出库/成本/预警/审计影响: 当前故事未落库存批次，但已保证采购订单和供应商来源可交给 004 入库故事；采购单价和供应商来源的审计入口已补齐。
- 未处理 P3: 后端采购员读取入库记录的口径留待 004 或跨角色故事评估是否保留只读跟踪。
- 相邻故事线索: 004 必须验证仓管按采购订单入库后，订单 received/remaining、批次供应商/单价、库存流水、成本单价和日志是否真实落库。
- 当前 git 状态: 工作区包含 001/002/003 已完成修改和 004 启动记录；未提交。
