# 仓管按采购订单入库并回看库存批次 用户故事收口记录

## 故事边界

- 故事: 作为仓管，我要按采购订单入库并回看库存批次，以便实物、批次、单价、供应商来源可信
- 角色: 仓库管理员
- 用户目标: 到货可入库，库存批次可回看
- 涉及页面: `/inbound`, `/purchase-orders`, `/inventory`, `/materials`, `/locations`
- 涉及后端/API/数据表: `/api/v1/purchase-orders`, `/api/v1/inbound`, `/api/v1/inventory`, `/api/v1/logs`; `purchase_orders`, `inbound_records`, `batches`, `inventory`, `inventory_locations`, `stock_logs`, `operation_logs`
- 上游输入: 采购订单、物料、库位、供应商
- 下游交接: 库存、出库、成本批次
- 明确不做: 不处理普通出库、退库、供应商退货、盘点和 ABC 关账；若入库设计会阻断库存批次、订单状态、供应商来源、成本单价或审计事实链，作为当前故事问题处理。

## 当前检索记录

- 角色菜单/路由: `permissions.ts`, `AppSidebar.tsx`, `PurchaseOrders.tsx`, `Inbound.tsx`, `InventoryList.tsx`, `docs/05_Role_Permission_Matrix.md`
- 前端页面/组件/hook: `PurchaseOrders.tsx` 收货弹窗, `useInboundPage.ts`, `InboundFormModal.tsx`, `InventoryTable.tsx`
- 后端路由/权限/副作用: `purchase-orders-v1.1.ts`, `inbound-v1.1.ts`, `inventory-v1.1.ts`, `app.ts`
- 数据表/审计日志: `purchase_orders`, `inbound_records`, `batches`, `inventory`, `inventory_locations`, `stock_logs`, `operation_logs`
- 测试: `purchase-order-inbound.test.ts`, `inbound-batch.test.ts`, `InventoryTable` 和 `useInventoryPage` 相关测试线索
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, `docs/05_Role_Permission_Matrix.md`, `docs/02_PRD.md`, `docs/04_Business_Rules.md`, 003 运行记录相邻线索
- 库存/BOM/出库/成本/预警/审计影响: 本故事把采购订单转成入库记录、库存批次、库存流水和成本单价来源，直接影响后续出库、退货、成本核算和审计追责。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 仓管可查看采购订单、点击收货并进入入库页；采购员不能直接收货 | 符合实物责任边界 | 采购下单和仓管实物入库交接清楚 | 保持并验证 |
| 用户目标是否完整 | 仓管可从采购订单带入物料、供应商、数量、单价，再补批号、库位和有效期 | 高频主流程完整 | 仓管不用重复录入采购来源，只补实物批次信息 | 已验证 |
| 信息字段是否够用 | 入库表单含采购订单、物料、批号、数量、单价、供应商、库位、有效期 | 高频主流程够用；库存页批次默认折叠但可展开 | 批次可回看，但需要一次展开操作 | 记录 P3，不阻断 |
| 交接关系是否正确 | 入库后订单 received/remaining/status 更新，库存页展示批次 | 交接闭环成立 | 后续出库可按批次扣减，成本单价来自批次 | 已验证 |
| 状态流转是否合理 | pending -> partial/completed；取消入库会回滚订单收货数、库存和批次 | 后端已有超收、错供应商/物料、取消保护 | 状态能解释剩余待收货数量 | 保持 |
| 用户工作量是否合理 | 仓管从采购订单点收货后跳入入库页，需补批号、库位、有效期 | 合理；库存回看需要搜索并展开分组 | 批次回看多一步但不造成事实错误 | 记录 P3 |
| 是否支撑库存/成本/审计 | 入库写 `stock_logs` 和库存批次；原缺少系统操作日志 | 库存事实已足够，管理员审计追责原不完整 | 入库责任链和采购订单交接审计缺口 | 已补 `operation_logs` |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS-004-01 | 审计/事实链 | 入库创建、取消、更新、删除只写库存流水 `stock_logs`，不写管理员可回看的 `operation_logs` | RED: `PO-IN-AUDIT-001` 初次运行 `operation_logs` 返回 `[]` | 仓管入库 -> 采购订单收货 -> 库存批次 -> 成本单价；缺少系统审计追责 | P2 | 在入库成功写操作后写 `operation_logs`，覆盖创建、批量创建、更新、删除、取消 | 后端 RED/GREEN、真实浏览器入库后管理员日志 API 回看 | completed |
| RS-004-02 | 权限文档口径 | `docs/05_Role_Permission_Matrix.md` 仍写仓管不可访问 `/purchase-orders`，但仓管故事需要从采购订单收货 | 文档矩阵与 `ROLE_MENU_MAP`、后端读权限和真实页面不一致 | 后续故事和 PM 验收可能误判仓管入口 | P3 | 同步矩阵为仓管可访问采购订单，并补齐采购订单后端读/写权限口径 | 文档复核 | completed |
| RS-004-P3-01 | 库存回看体验 | 库存页批次明细默认折叠，URL `?keyword=` 不自动初始化搜索；页面内搜索并展开后可见批号 | Playwright 需要输入搜索并展开物料分组才能看到批号 | 不阻断仓管回看；增加一次点击和搜索操作 | P3 | 暂缓，不在 004 扩大前端改造 | 后续 005 库存日常故事继续评估 | recorded |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS-004-01 | `后端代码/server/src/routes/inbound-v1.1.ts` | 引入 `logOperation`，在入库批量创建、单条创建、更新、删除、专用取消成功后写 `operation_logs` |
| RS-004-01 | `后端代码/server/tests/purchase-order-inbound.test.ts` | 新增 `PO-IN-AUDIT-001`，覆盖采购入库创建和取消可按入库单 ID 回看系统操作日志 |
| RS-004-02 | `docs/05_Role_Permission_Matrix.md` | 同步仓管 `/purchase-orders` 前端可访问；补齐采购订单后端读/写权限 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 入库审计 RED | `npm run test -- tests/purchase-order-inbound.test.ts` | 初次失败 | `PO-IN-AUDIT-001` 期望 `POST /inbound`, `POST /inbound/:id/cancel`，实际 `[]` |
| 采购订单入库回归 | `npm run test -- tests/purchase-order-inbound.test.ts` | 21/21 通过 | 覆盖仓管读/不能建采购单、入库状态、批次、超收、来源、审计 |
| 入库批次/库存回归 | `npm run test -- tests/purchase-order-inbound.test.ts tests/inbound-batch.test.ts` | 2 files / 40 tests 通过 | 入库批次、库存流水、取消/删除/恢复保护未回归 |
| 后端构建 | `npm run build` in `后端代码/server` | 通过 | TypeScript 编译通过 |
| 代码复核 | 按 `code-reviewer` 清单复核入库路由 diff | 未发现需返工问题 | 日志写在成功事务后；失败路径不误记；`stock_logs` 与 `operation_logs` 职责分开 |
| Playwright 使用前规则 | 读取 `AGENTS.md` 和两条指定记忆；`find ~/Library/Caches/ms-playwright`、`test -x`、`--version`、真实 launch | 通过 | Chromium 1217 / Chrome for Testing 147.0.7727.15；未运行 `npx playwright install` |
| 真实仓管入库闭环 | 管理员准备采购订单；仓管登录 `/purchase-orders`，点击收货，跳转 `/inbound`，补批号/库位/有效期并确认入库 | 通过 | 输出 `ok: true`; 订单 `PO20260620-0007`; 批号 `B-RS004-*` |
| 后端副作用/数据回看 | API/DB 回看采购订单、入库记录、`batches`, `inventory`, `inventory_locations`, `stock_logs` | 通过 | 订单 `receivedQty=4`, `remainingQty=6`, `status=partial`; 批次/库存/库位库存均为 4，单价 23 |
| 库存页面回看 | 仓管进入 `/inventory`，页面内搜索物料并展开分组 | 通过 | 物料和批号可见 |
| 操作日志回看 | 管理员 `/logs` API 按入库单 ID 查询 | 通过 | `POST /inbound` 可回看 |
| 验证数据清理 | 按唯一 suffix 清理采购订单、入库记录、批次、库存、库位库存、流水、测试主数据 | 通过 | 输出 `validation artifacts cleaned by exact story suffix` |

## 故事收口报告

- P0/P1 是否清零: 是，本故事未发现阻断仓管按订单入库的 P0/P1。
- 影响角色交接或事实链的 P2 是否清零: 是，RS-004-01 已修复并验证。
- 角色职责/权限边界是否合理: 是，仓管能读采购订单并收货入库，不能新建采购订单；采购员在 003 已移除入库/收货入口。
- 页面/弹窗验证: 已真实验证采购订单收货弹窗、入库新增弹窗、入库列表、库存列表搜索和批次展开。
- 前后端权限一致性验证: 仓管菜单含 `/purchase-orders` 与 `/inbound`；后端采购订单读允许仓管、写拒绝仓管；入库写允许仓管。
- 后端/API/数据库验证: 采购订单收货数、入库记录、批次、库存总账、库位库存、库存流水和操作日志均通过回看。
- 数据回看验证: 入库列表按批号回看；库存页搜索并展开后回看批号；日志 API 按入库单 ID 回看。
- 库存/BOM/出库/成本/预警/审计影响: 入库写入批次单价和供应商来源，后续出库和成本可引用；库存和库位库存同步；系统操作日志补齐责任追踪。
- 未处理 P3: 库存页 URL keyword 不初始化搜索、批次默认折叠需要展开；不阻断 004，留给 005 库存日常故事评估。
- 相邻故事线索: 005 继续验证库存预警、调拨、盘点、报废是否能围绕该批次形成可信库存事实；006 继续验证出库/退库/供应商退货能否沿用批次来源和成本单价。
- 当前 git 状态: 工作区包含 001/002/003/004 已完成修改和 005 启动记录；未提交。
