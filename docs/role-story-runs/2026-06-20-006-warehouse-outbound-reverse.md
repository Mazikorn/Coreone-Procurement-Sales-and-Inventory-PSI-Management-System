# 仓管完成普通出库、BOM 出库、退库和供应商退货 用户故事运行记录

## 故事边界

- 故事: 作为仓管，我要完成普通出库、BOM 出库、退库和供应商退货，以便库存扣减、恢复和退货事实正确
- 角色: 仓库管理员
- 用户目标: 出库和逆向流程可追溯
- 涉及页面: `/outbound`, `/returns`, `/supplier-returns`, `/inventory`, `/bom`, `/projects`
- 涉及后端/API/数据表: `/api/v1/outbound`, `/api/v1/returns`, `/api/v1/supplier-returns`, `/api/v1/inventory`, `/api/v1/projects`, `/api/v1/boms`; `outbound_records`, `outbound_items`, `return_records`, `supplier_returns`, `inventory`, `inventory_locations`, `batches`, `stock_logs`, `operation_logs`, `alerts`, `outbound_abc_details`
- 上游输入: 库存批次、BOM、项目、供应商来源
- 下游交接: 技术消耗、成本快照、审计
- 明确不做: 不处理技术建模和财务成本配置本体；若出库/退库/退货会影响 BOM、成本快照、预警或审计事实链，作为当前故事问题处理。

## 当前检索记录

- 角色菜单/路由: `warehouse_manager` 可见 `/outbound`, `/returns`, `/supplier-returns`, `/inventory`, `/projects`, `/bom`; `technician`/`pathologist` 不可见 `/outbound`、`/returns`、`/supplier-returns`；`procurement` 可见 `/supplier-returns`。
- 前端页面/组件/hook: 当前故事使用真实页面弹窗验证，重点看仓管能创建普通出库、退库、供应商退货，并能从项目/BOM 完成标准 BOM 出库。
- 后端路由/权限/副作用: `/api/v1/outbound` 已改为严格 `admin, warehouse_manager`；`/api/v1/returns` 为 `admin, warehouse_manager`；`/api/v1/supplier-returns` 为 `admin, warehouse_manager, procurement`。
- 数据表/审计日志: 出库/退库/供应商退货均写 `stock_logs`；本轮补齐普通出库、BOM 出库、普通出库编辑/删除、退库创建/撤销、供应商退货创建/删除的 `operation_logs`。
- 测试: `outbound.test.ts`, `returns.test.ts`, `supplier-returns.test.ts`, `supplier-returns-audit.test.ts`, `outbound-flow.test.ts`, `inventory-batches.test.ts`, `alerts.test.ts`, `logs.test.ts`。
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, `docs/05_Role_Permission_Matrix.md`, 005 运行记录相邻线索
- 库存/BOM/出库/成本/预警/审计影响: 本故事会扣减、恢复或退回库存，直接影响技术消耗、成本快照、供应商来源和审计追溯。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 前端不让技术员/医生进入出库页，但后端原先允许读 `/api/v1/outbound` | 出库台账属于仓储交接事实，不应给非仓管通过 API 绕过页面读取 | 角色边界不一致，后续故事可能把技术查看误当成仓管执行依据 | P2 修复 |
| 用户目标是否完整 | 普通出库、BOM 出库、退库、供应商退货已有库存/批次主副作用 | 主目标覆盖够，但缺少操作级审计会让仓管交接不可回看 | 出库/退货事实可做库存变动，但不够审计 | P2 修复 |
| 信息字段是否够用 | 出库明细保留批次、单价、用途、接收方；退库绑定 outbound_item；供应商退货绑定供应商/批次/订单/入库来源 | 高频字段够用；供应商退货必须能归属供应商的规则合理 | 防止退货退款和批次来源失真 | 保留 |
| 交接关系是否正确 | BOM 出库生成成本快照，退库绑定出库明细，供应商退货绑定供应商来源 | 主交接关系正确；缺口在预警和审计联动 | 影响技术消耗、财务成本和仓管回看 | P2 修复 |
| 状态流转是否合理 | BOM 出库不可编辑；普通出库可编辑/删除；退库可撤销；供应商退货 pending 可删除、状态可流转取消 | 高频状态流转合理，且已有批次恢复保护 | 避免后续消耗后撤销污染批次数量 | 保留并回归 |
| 用户工作量是否合理 | 仓管需要从库存/项目/BOM/出库来源选择，不重复手填成本 | 主流程工作量可接受 | 仍需页面验证确认弹窗输入顺畅 | 页面验证 |
| 是否支撑库存/成本/审计 | 库存和成本快照已有；预警刷新与操作日志不完整 | 不完整会导致低库存提醒过期、操作责任断裂 | 库存/BOM/出库/成本/预警/审计事实链不闭合 | P2 修复 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS-006-01 | 权限边界 | 后端 `/api/v1/outbound` 允许 technician/pathologist 读，前端却不给 `/outbound` 入口 | `app.ts` 原 `requireRole('admin','warehouse_manager','technician','pathologist')`；权限矩阵历史备注要求收敛 | 非仓管可绕过页面读取仓管台账，角色职责错位 | P2 | 改为 `requireStrictRole('admin','warehouse_manager')`，并更新权限矩阵 | `OUT 权限测试` + 浏览器/接口验证 | fixed |
| RS-006-02 | 审计追踪 | 普通出库、BOM 出库、退库创建/撤销、供应商退货创建/删除缺少统一 `operation_logs` | RED: `OUT-AUDIT-001`, BOM 出库审计断言, `RT-AUDIT-001`, `SR-AUDIT-003` 初始失败 | 仓管/采购/财务无法从日志回看是谁创建或撤销关键库存事实 | P2 | 在对应路由提交后调用 `logOperation`，保留 request/response 摘要 | 后端测试 + 管理员日志页面回看 | fixed |
| RS-006-03 | 预警事实链 | 退库恢复库存、撤销退库、供应商退货扣减/恢复库存后未刷新低库存预警 | RED: `RT-ALERT-001` 初始 pending 未关闭；供应商退货缺少对应覆盖 | 仓管看到过期低库存预警或漏看退货后低库存风险 | P2 | 在退库、供应商退货、出库编辑/删除提交后调用 `checkStockAlerts` | 后端测试 + 仓管预警页面回看 | fixed |
| RS-006-04 | 前端路由权限 | 技术员直达 `/outbound` 仍可停留在出库页，虽然后端 API 已返回 403 | Playwright 现场验证中 `zhangwei` 访问 `/outbound` 未被前端带回首页；`App.tsx` 中 `/outbound`, `/returns`, `/supplier-returns` 未包 `RoleRoute` | 非仓管可看到仓管工作台页面，前后端权限不一致，容易让技术角色误以为可执行仓管职责 | P2 | 将出库、退库、供应商退货路由纳入 `RoleRoute`，补路由守卫测试 | 前端路由测试 + 浏览器直达 URL 验证 | fixed |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS-006-01 | `后端代码/server/src/app.ts`, `docs/05_Role_Permission_Matrix.md`, `后端代码/server/tests/integration/outbound.test.ts` | `/api/v1/outbound` 改为严格 `admin, warehouse_manager`；补 technician/pathologist 读取 403 测试；权限矩阵同步为已收敛。 |
| RS-006-02 | `outbound-v1.1.ts`, `returns-v1.1.ts`, `supplier-returns-v1.1.ts` 及相关测试 | 普通出库/BOM 出库/普通出库编辑/删除、退库创建/撤销、供应商退货创建/删除写入 `operation_logs`；供应商退货状态流转保留原状态操作日志。 |
| RS-006-03 | `outbound-v1.1.ts`, `returns-v1.1.ts`, `supplier-returns-v1.1.ts` 及相关测试 | 退库、供应商退货、普通出库编辑/删除在提交后刷新低库存预警；供应商退货取消状态也刷新预警。 |
| RS-006-04 | `前端代码/src/App.tsx`, `前端代码/src/App.routes.test.ts` | `/outbound`, `/returns`, `/supplier-returns` 统一包 `RoleRoute`，补 direct URL 守卫测试，确保技术员不能绕过菜单进入仓管逆向作业页。 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 故事切换 | 更新 `docs/role-story-list-2026-06-20.md` | 006 标记为 `in_progress` | 005 已 completed，006 运行记录已创建 |
| RED 测试 | `npm run test -- tests/integration/outbound.test.ts tests/returns.test.ts tests/supplier-returns.test.ts` | 预期失败 | 操作日志缺失、退库预警未自动关闭、technician/pathologist 读取出库返回 200 |
| 后端目标回归 | `npm run test -- tests/integration/outbound.test.ts tests/returns.test.ts` | 通过 | 2 files / 44 tests passed |
| 供应商退货集成审计 | `npm run test -- tests/integration/supplier-returns-audit.test.ts` | 通过 | 1 file / 2 tests passed |
| 供应商退货主测试 | 临时 Vitest 配置跑 `tests/supplier-returns.test.ts`，跑后删除临时配置 | 通过 | 1 file / 25 tests passed |
| 后端扩展回归 | `npm run test -- tests/integration/outbound.test.ts tests/integration/outbound-flow.test.ts tests/returns.test.ts tests/integration/supplier-returns-audit.test.ts tests/inventory-batches.test.ts tests/alerts.test.ts tests/logs.test.ts` | 通过 | 7 files / 81 tests passed |
| 后端构建 | `npm run build` | 通过 | TypeScript build passed |
| 前端路由/权限测试 | `npm run test -- src/App.routes.test.ts src/lib/permissions.test.ts` | 通过 | 2 files / 8 tests passed |
| 前端构建 | `npm run build` | 通过 | Vite build passed；仅保留既有 chunk size warning |
| Playwright 浏览器前置检查 | 按 AGENTS 强规则读取两条记忆文件，执行 `find ~/Library/Caches/ms-playwright`、`test -x`、`--version`、真实 launch | 通过 | Chromium 1217 / Chrome for Testing 147.0.7727.15 可执行；真实 launch title `chromium-path-ok` |
| 仓管真实页面闭环 | `wangkq` 在 `/outbound`, `/returns`, `/supplier-returns` 完成现场数据 `rs006-1781950704354` | 通过 | 普通出库截图、BOM 出库截图、退库截图、供应商退货截图均保存至 `docs/role-story-runs/screenshots/006/` |
| 库存/预警/日志/权限回看 | API + 管理员日志页 + 技术员直达 URL | 通过 | 普通物料库存 20 -> 18 -> 19 -> 16；BOM 物料 10 -> 8；低库存预警最终 pending=1；技术员 API `/outbound` 403 且前端直达 `/outbound` 返回 `/`；日志包含 `POST /outbound`, `POST /outbound/bom`, `POST /returns`, `POST /supplier-returns` 对应本轮记录 id |

## 故事收口报告

- P0/P1 是否清零: 是，本故事未发现 P0/P1。
- 影响角色交接或事实链的 P2 是否清零: 是，RS-006-01~04 均已修复并验证。
- 角色职责/权限边界是否合理: 是，仓管可执行出库/逆向作业；技术员不能通过前端直达或后端 API 读取仓管出库台账；采购仍可进入供应商退货协同入口。
- 页面/弹窗验证: 已覆盖 `/outbound` 普通出库与 BOM 出库、`/returns` 退库、`/supplier-returns` 退货给供应商真实弹窗。
- 前后端权限一致性验证: 已覆盖 `zhangwei` 前端直达 `/outbound` 返回 `/`，后端 `/api/v1/outbound` 返回 403。
- 后端/API/数据库验证: 已覆盖库存、批次、出库、退库、供应商退货、预警和操作日志数据回看。
- 数据回看验证: 管理员日志页截图与 `/api/v1/logs` 回看均覆盖本轮四个核心操作记录。
- 库存/BOM/出库/成本/预警/审计影响: 已验证普通出库扣减、BOM 出库扣减并保留成本快照，退库恢复并关闭低库存预警，供应商退货扣减并重建低库存预警，四类动作均可审计。
- 未处理 P3: 无。
- 相邻故事线索: 007 需继续质疑技术员对项目/BOM/设备/标准工时的写权限是否过宽，以及技术建模是否需要版本/归档/成本重算提示。
- 当前 git 状态: 工作区包含本轮及前序故事未提交改动，未发现需要回退的无关变更。
