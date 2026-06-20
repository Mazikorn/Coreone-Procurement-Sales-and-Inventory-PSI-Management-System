# 仓管查看库存、处理预警、调拨、盘点和报废 用户故事运行记录

## 故事边界

- 故事: 作为仓管，我要查看库存、处理预警、调拨、盘点和报废，以便库存位置、数量和损耗事实可信
- 角色: 仓库管理员
- 用户目标: 日常库存维护闭环完成
- 涉及页面: `/inventory`, `/alerts`, `/transfers`, `/stocktaking`, `/scraps`, `/locations`
- 涉及后端/API/数据表: `/api/v1/inventory`, `/api/v1/alerts`, `/api/v1/transfers`, `/api/v1/stocktaking`, `/api/v1/scraps`, `/api/v1/locations`; `inventory`, `inventory_locations`, `batches`, `inbound_records`, `stocktaking_records`, `scrap_records`, `stock_logs`, `operation_logs`, `alerts`
- 上游输入: 入库批次、库位、库存阈值
- 下游交接: 出库、成本、预警
- 明确不做: 不处理普通出库、BOM 出库、退库和供应商退货；若库存维护会影响出库、成本、预警或审计事实链，作为当前故事问题处理。

## 当前检索记录

- 角色菜单/路由: `warehouse_manager` 可进入 `/inventory`, `/alerts`, `/transfers`, `/stocktaking`, `/scraps`, `/locations`；不可进入 `/logs`。
- 前端页面/组件/hook: `InventoryList`, `InventoryTable`, `Transfers`, `Stocktaking`, `Scraps`, `Alerts`, `Logs`。
- 后端路由/权限/副作用: `inventory-v1.1.ts`, `alerts-v1.1.ts`, `transfers-v1.1.ts`, `stocktaking-v1.1.ts`, `scraps-v1.1.ts`, `locations-v1.1.ts`, `alertChecker.ts`。
- 数据表/审计日志: 调拨、盘点、报废均写 `stock_logs`；修复后同步写 `operation_logs`；报废/盘点确认后刷新低库存预警。
- 测试: `transfers.test.ts`, `scraps.test.ts`, `stocktaking.test.ts`, `logs.test.ts`, `inventory-batches.test.ts`, `inventory-consistency.test.ts`, `alerts.test.ts`。
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, `docs/05_Role_Permission_Matrix.md`, `docs/02_PRD.md`, `docs/04_Business_Rules.md`, 004 运行记录相邻线索。
- 库存/BOM/出库/成本/预警/审计影响: 本故事维护库存数量、位置、差异和损耗事实，直接影响后续出库可用量、成本消耗和预警可信度。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 仓管可维护库存、库位、调拨、盘点、报废和预警处理；管理员/财务可看日志 | 职责边界基本合理，日志由管理员回看而非仓管自审 | 仓管不能越权审计全局日志 | 保持权限；浏览器验证仓管不能进入 `/logs` |
| 用户目标是否完整 | 页面可看库存批次、做调拨、盘点确认、报废、看预警 | 主流程完整，但原预警自动刷新缺失 | 低库存风险可能不进入待办 | 已修复 |
| 信息字段是否够用 | 调拨含来源/目标库位、批次；报废含批次/原因；盘点含账面/实盘/差异原因 | 高频决策字段够用 | 支撑库存、损耗、差异解释 | 保持 |
| 交接关系是否正确 | 库存维护结果交给出库、成本、预警和管理者 | 原操作审计缺口会导致交接追责断裂 | 管理者无法从操作日志追溯仓管动作 | 已修复 |
| 状态流转是否合理 | 调拨可撤销，报废可撤销，盘点从 completed 到 confirmed，可撤销 | 主状态流转合理 | 撤销需回滚库存/批次/库位/预警 | 相关回归覆盖 |
| 用户工作量是否合理 | 仓管通过弹窗一次完成主操作 | 不需要额外手工生成低库存预警 | 降低线下补台账和人工巡检 | 已修复自动预警 |
| 是否支撑库存/成本/审计 | `stock_logs` 支撑库存流水，`operation_logs` 支撑操作审计 | 原本缺全局操作日志和自动预警 | 成本/审计事实链不完整 | 已补齐 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS-005-01 | 审计/角色交接 | 调拨、报废、盘点会改库存事实，但成功写操作不进入 `operation_logs` | 红灯测试 `TR-AUDIT-001`, `SC-AUDIT-001`, `ST-AUDIT-001` 初始均返回 `[]` | 仓管 -> 管理者/财务审计断裂，后续成本差异难追责 | P2 | 修复 | 后端测试、日志 API、管理员真实日志页 | completed |
| RS-005-02 | 预警事实链 | 报废或盘点确认导致库存低于安全库存后不自动产生低库存预警；`alertChecker` 使用 `status = "pending"` 被 SQLite 当列名且异常被吞 | 红灯测试 `SC-ALERT-001`, `ST-ALERT-001` 初始无 alert；现场复现报错 `no such column: "pending"` | 仓管库存维护 -> 预警待办断裂，管理者看不到风险 | P2 | 修复 | 后端测试、真实浏览器报废后预警页回看 | completed |
| RS-005-03 | 权限文档 | 权限矩阵中 `/api/v1/locations` 和 `/api/v1/inventory` 仍为“待目标分支核对” | 现场核对 `app.ts` 和前端权限 | 文档误导后续角色复核 | P3 | 修复文档 | 文档更新 | completed |
| RS-005-04 | 库存页易用性 | 库存页 URL `?keyword=` 不会自动初始化搜索，批次默认折叠 | 004 和 005 浏览器验证均需手动搜索并展开 | 不阻断主流程，但增加回看成本 | P3 | 记录相邻线索 | 后续库存页体验优化 | recorded |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS-005-01 | `transfers-v1.1.ts` | 调拨创建和撤销成功后写 `operation_logs`，记录物料、批次、数量、来源/目标库位 |
| RS-005-01 | `scraps-v1.1.ts` | 单条/批量报废和撤销成功后写 `operation_logs`，记录物料、批次、数量、原因 |
| RS-005-01 | `stocktaking-v1.1.ts` | 盘点创建、确认、撤销成功后写 `operation_logs`，记录账面、实盘、差异、原因 |
| RS-005-02 | `alertChecker.ts` | 修复 `status = "pending"` 为单引号字符串，恢复自动预警生成 |
| RS-005-02 | `scraps-v1.1.ts` | 单条/批量报废和撤销提交后调用 `checkStockAlerts` |
| RS-005-02 | `stocktaking-v1.1.ts` | 盘点确认和撤销提交后调用 `checkStockAlerts` |
| RS-005-03 | `docs/05_Role_Permission_Matrix.md` | 更新 `/api/v1/locations`、`/api/v1/inventory` 当前后端权限 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| RED: 操作日志缺口 | `npm run test -- tests/transfers.test.ts tests/scraps.test.ts tests/stocktaking.test.ts` | 3 条新增 audit 用例失败，返回空日志 | `TR-AUDIT-001`, `SC-AUDIT-001`, `ST-AUDIT-001` |
| GREEN: 操作日志修复 | `npm run test -- tests/transfers.test.ts tests/scraps.test.ts tests/stocktaking.test.ts` | 43/43 通过 | 调拨/报废/盘点操作日志断言通过 |
| RED: 预警断裂 | `npm run test -- tests/scraps.test.ts tests/stocktaking.test.ts` | 2 条新增 alert 用例失败，无低库存预警 | `SC-ALERT-001`, `ST-ALERT-001` |
| 预警根因复现 | `node --import tsx ...` | `checkStockAlerts` 报 `no such column: "pending"` | 确认为 SQLite 双引号字符串问题 |
| GREEN: 预警修复 | `npm run test -- tests/scraps.test.ts tests/stocktaking.test.ts` | 32/32 通过 | 报废/盘点确认生成低库存预警，撤销后 auto_resolved |
| 相关后端回归 | `npm run test -- tests/transfers.test.ts tests/scraps.test.ts tests/stocktaking.test.ts tests/logs.test.ts tests/inventory-batches.test.ts tests/inventory-consistency.test.ts tests/alerts.test.ts` | 86/86 通过 | 库存、批次、一致性、日志、预警均通过 |
| 后端构建 | `npm run build` | 通过 | `tsc` 无错误 |
| 格式检查 | `git diff --check -- ...` | 通过 | 无 whitespace error |
| Playwright 前置规则 | 读 `AGENTS.md` Playwright 强规则和两条记忆文件；`find`, `test -x`, `--version`, real launch | 通过 | Playwright 1.59.1, Chromium 1217, Chrome for Testing 147.0.7727.15, title `chromium-path-ok` |
| 真实浏览器闭环 | Playwright 仓管/管理员角色页面验证 | 通过 | suffix `RS005-1781948565119`, materialId `410f249e-741f-4a03-a7b8-96bcc2561d33` |

## 浏览器闭环证据

- 仓管登录后在 `/inventory` 搜到物料、展开看到批次和来源库位。
- 仓管在 `/transfers` 通过弹窗完成来源库位到目标库位调拨。
- 仓管在 `/stocktaking` 通过三步弹窗创建盘点并处理差异，盘点确认后库存从 10 调整为 9。
- 仓管在 `/scraps` 选择批次和受控原因完成报废，库存变为 7。
- 后端事实链显示该物料库存合计为 7，并生成 pending 低库存预警。
- 仓管在 `/alerts` 能看到低库存预警。
- 仓管不能使用 `/logs`；管理员在 `/logs` 用物料 ID 搜到调拨、盘点确认和报废操作日志。
- `/api/v1/logs` 同样包含 `POST /transfers/inbound`, `POST /stocktaking`, `POST /stocktaking/:id/confirm`, `POST /scraps`。

## 故事收口报告

- P0/P1 是否清零: 是，本故事未发现 P0/P1。
- 影响角色交接或事实链的 P2 是否清零: 是，操作审计缺口和自动预警断裂均已修复并验证。
- 角色职责/权限边界是否合理: 是，仓管可完成库存维护和预警处理；全局日志仍由管理员审计。
- 页面/弹窗验证: 已覆盖库存、调拨、盘点、报废、预警、日志真实页面和弹窗。
- 前后端权限一致性验证: 已覆盖仓管页面权限、后端 API 权限、仓管不可访问日志、管理员可访问日志。
- 后端/API/数据库验证: 已覆盖库存、库位、批次、库存流水、操作日志、低库存预警。
- 数据回看验证: 已覆盖库存页批次回看、预警页回看、管理员日志页回看、API 回看。
- 库存/BOM/出库/成本/预警/审计影响: 库存数量/位置/批次事实可信；报废和盘点会自动触发预警；操作日志可支撑后续成本和审计追责。
- 未处理 P3: 库存页 URL `keyword` 未初始化和批次默认折叠，记录为体验优化线索。
- 相邻故事线索: 006 需要继续检查普通出库、BOM 出库、退库、供应商退货是否保持批次/库位/成本快照/撤销事实一致，并复核这些逆向路径是否写操作日志和刷新预警。
- 当前 git 状态: 已有多故事累计修改，未提交。
