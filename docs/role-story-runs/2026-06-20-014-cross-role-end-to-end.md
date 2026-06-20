# 跨角色采购入库出库成本审计全链路 用户故事运行记录

## 故事边界

- 故事: 作为一个实验室团队，我们要完成从供应商采购、采购入库、库存出库、消耗对账、成本核算到审计回看的完整链路，以便证明系统能替代线下台账
- 角色: 多角色
- 用户目标: 跨角色端到端业务事实贯通
- 涉及页面: `/suppliers`, `/purchase-orders`, `/inbound`, `/inventory`, `/outbound`, `/reconciliation`, `/abc/dashboard`, `/abc/trend`, `/logs`
- 涉及后端/API/数据表: `suppliers`, `purchase_orders`, `inbound`, `batches`, `inventory`, `outbound_records`, `outbound_items`, `outbound_abc_details`, `bom_fee_mappings`, `fee_standards`, `operation_logs`
- 上游输入: 供应商、物料、库位、采购订单、BOM、项目、收费标准和收费映射
- 下游交接: 仓储库存事实、财务成本核算、管理者成本结果、管理员审计日志
- 明确不做: 不重新展开每个角色的低频边界；只处理跨角色高频主链路阻断和事实链问题。

## 当前检索记录

- 角色菜单/路由: 采购员可进入供应商/采购订单；仓管可进入入库/库存/出库；财务可进入消耗对账和 ABC 成本看板/趋势；管理员可进入操作日志。
- 前端页面/组件/hook: 用真实浏览器打开 `/suppliers`, `/purchase-orders`, `/inbound`, `/inventory`, `/outbound`, `/reconciliation`, `/abc/dashboard`, `/abc/trend`, `/logs`。
- 后端路由/权限/副作用: 用采购、仓管、技术、财务、管理员 token 创建并读取同一条业务链路。
- 数据表/审计日志: 现场核对采购单收货状态、批次来源、库存最近入/出库、出库成本快照、ABC 明细、批次追踪和操作日志。
- 测试: 新增 `tests/role-story-014-cross-role-end-to-end.test.ts`，并联动 `tests/integration/outbound.test.ts`、`tests/purchase-order-inbound.test.ts`。
- 规范/PRD/历史线索: `AGENTS.md`, 三份 role-story 文档, 001-013 运行记录。
- 库存/BOM/出库/成本/预警/审计影响: 重点验证供应商、采购订单、入库批次、库存、BOM 出库、ABC 成本、成本趋势、批次追踪和操作日志能形成可解释、可回看、可审计的完整事实链。

## 用户故事质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 角色职责是否准确 | 采购建供应商/采购单，仓管入库/出库，技术建 BOM/项目，财务配收费并核算，管理员回看日志 | 主责链路准确，未发现当前故事阻断性错位 | 支撑岗位交接 | 保持 |
| 用户目标是否完整 | 可从采购到入库、库存、BOM 出库、成本、审计形成一条数据链 | 主链路完整，但需要修复最近出库字段和收费标准状态兼容 | 否则库存回看或成本收入会失真 | 已修复 |
| 信息字段是否够用 | 批次保存供应商/入库/单价，出库保存项目/病例/样本/成本，ABC 保存收费和来源快照 | 核心审计字段够用 | 支撑追溯 | 保持 |
| 交接关系是否正确 | 采购单完成后仓管可按批次入库，出库后财务可核算，管理员可查日志 | 修复后交接不断链 | 支撑替代线下台账 | 已验证 |
| 状态流转是否合理 | 采购单 `completed`，出库成本状态可从 `costed` 进入 `recalculated` | `recalculated` 属于已核算状态，不能误判为异常 | 支撑重算解释 | 已在验证口径中确认 |
| 用户工作量是否合理 | 跨角色主链路无需重复录入供应商、物料、批次、BOM 和收费口径 | 高频流程可接受 | 减少线下补账 | 保持 |
| 是否支撑成本/审计 | 出库主表、ABC 明细、批次追踪、看板/趋势和日志均可回看 | 修复后可支撑 | 成本和审计可信 | 已验证 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| RS014-P1-01 | 事实链断点 | BOM 出库扣减库存后，`inventory.last_outbound_id` / `last_outbound_date` 未更新 | 新增端到端测试最初断言库存最近出库字段为 `null` | 仓管/管理者从库存页回看最近出库来源时断链，影响库存审计 | P1 | 在普通出库和 BOM 出库创建时同步更新最近出库字段 | `role-story-014-cross-role-end-to-end.test.ts`、出库回归、开发库现场回看 | completed |
| RS014-P1-02 | 成本事实失真 | 成本计算工具只接受 `fee_standards.status = 'active'`，真实开发库启用值为 `1` 时收费映射会被跳过 | 开发库 `fee_standards` schema 为整数启用标志；浏览器现场必须插入 `status=1` | 财务已配置收费映射但出库收入/利润可能被算成 0，成本分析失真 | P1 | `cost-calculator` 统一兼容 `active`、`1`、`'1'` | 014 端到端测试改用 `status=1`，开发库现场 ABC 明细 `fee_amount=450` | completed |
| RS014-P3-01 | 页面可读性 | 部分列表默认视图更突出项目/状态，不一定直接显示原始病例号、批号或操作名 | 首轮浏览器文本探针中 `/outbound`、`/reconciliation`、`/logs` 的部分技术标识未命中，但 API/数据库事实链完整 | 不阻断主链路，影响精确检索效率 | P3 | 记录为后续列表检索/列配置优化线索 | 本轮不修复 | open |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| RS014-P1-01 | `后端代码/server/src/routes/outbound-v1.1.ts` | 普通出库和 BOM 出库创建时，在扣减 `inventory.stock` 的同时更新 `last_outbound_id`、`last_outbound_date` 和 `update_time`。 |
| RS014-P1-02 | `后端代码/server/src/utils/cost-calculator.ts` | 新增统一 active 状态 SQL，收费映射和旧 BOM 收费标准回退都兼容 `active`、`1`、`'1'`。 |
| RS014-P1-02 | `后端代码/server/tests/role-story-014-cross-role-end-to-end.test.ts` | 新增跨角色端到端事实链测试，并用 `fee_standards.status=1` 覆盖历史/真实库启用状态。 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 后端端到端回归 | `npm run test -- tests/role-story-014-cross-role-end-to-end.test.ts` | 1 个测试通过 | 覆盖供应商、采购单、入库、批次、库存、BOM 出库、ABC 明细、看板、趋势、批次追踪、日志 |
| 后端相邻回归 | `npm run test -- tests/role-story-014-cross-role-end-to-end.test.ts tests/integration/outbound.test.ts tests/purchase-order-inbound.test.ts` | 3 文件 / 57 测试通过 | 出库和采购入库相邻事实链未回退 |
| 后端构建 | `npm run build` | 通过 | TypeScript 编译通过 |
| Playwright 强规则 | 读取 `AGENTS.md` Playwright 强规则和两条记忆文件；`find`、`test -x`、`--version`、真实 launch | 通过 | Chromium `1217`，Chrome for Testing `147.0.7727.15`，launch 标题 `chromium-path-ok` |
| 真实页面链路 | 用 suffix `1781957927837` 创建跨角色开发库数据并截图 | 通过 | `docs/role-story-runs/screenshots/014/rs014-1781957927837-final-*.png` |
| 开发库事实回看 | 采购单、批次、库存、出库、ABC 明细、日志 SQL/API 断言 | 9/9 通过 | 采购单 `completed/12`；批次剩余 `6`；库存 `stock=6` 且最近入/出库 ID 正确；出库 `fee_amount=450`、`profit=198`、`cost_status=recalculated`；日志包含 `POST /suppliers`、`POST /purchase-orders`、`POST /inbound`、`POST /outbound/bom` |
| 财务成本读回 | `/api/v1/abc/dashboard`、`/api/v1/abc/slide-cost-trend`、`/api/v1/abc/batch-trace/:batchId` | 通过 | 看板/趋势包含成本，批次追踪包含本次出库 |

## 故事收口报告

- P0/P1 是否清零: 是。RS014-P1-01、RS014-P1-02 已修复并验证。
- 影响角色交接或事实链的 P2 是否清零: 是。本轮未保留阻断性交接或事实链 P2。
- 角色职责/权限边界是否合理: 是。采购、仓管、技术、财务、管理员在本链路中的职责分工清晰。
- 页面/弹窗验证: 是。真实浏览器覆盖采购、入库、库存、出库、对账、成本看板、成本趋势、日志页面。
- 前后端权限一致性验证: 是。浏览器按对应角色 token 打开页面，后端按角色 token 执行业务操作。
- 后端/API/数据库验证: 是。端到端测试和开发库现场 SQL/API 均通过。
- 数据回看验证: 是。采购单、批次、库存、出库、ABC 明细、批次追踪和操作日志均可回看。
- 库存/BOM/出库/成本/预警/审计影响: 已验证库存/BOM/出库/成本/审计事实链；本故事没有触发新的预警修复。
- 未处理 P3: RS014-P3-01，后续可优化列表默认列、搜索和日志操作名显示。
- 相邻故事线索: 若后续做报表体验优化，可加强 `/outbound`、`/reconciliation`、`/logs` 对病例号/批号/操作名的显性检索。
- 当前 git 状态: 工作区包含 001-014 故事累计修改和运行记录，未提交。
