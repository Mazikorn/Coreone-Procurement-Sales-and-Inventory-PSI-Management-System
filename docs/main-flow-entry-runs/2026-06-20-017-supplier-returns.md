# 退货给供应商 主流程收口记录

## 入口边界

- 入口: 退货给供应商
- 导航路径: 库存作业 -> 退货给供应商 (`/supplier-returns`)
- 主要用户: 仓管、采购员
- 本轮目标: 检查并修复供应商退货创建、状态流转、库存扣减、批次/供应商来源和撤销追踪的高频主流程核心问题。
- 包含范围: 供应商退货列表、退货创建、退货状态/撤销、来源供应商/入库批次、库存/批次/库位扣减、流水和审计。
- 明确不做: 不提前修调拨、报废、盘点本体；若供应商退货发现这些入口问题，先作为相邻线索记录。

## 当前检索记录

- 从 `016 退库管理` 自动切换而来。
- 现场读取 `后端代码/server/src/routes/supplier-returns-v1.1.ts`、`前端代码/src/pages/supplier-returns/SupplierReturns.tsx`、`后端代码/server/tests/supplier-returns.test.ts`、`后端代码/server/tests/integration/supplier-returns-audit.test.ts`、`后端代码/server/src/routes/reports-v1.1.ts`。
- 对照成本报表发现 `/reports/cost-by-supplier` 会按 `supplier_returns.supplier_id` 汇总退款扣减，供应商退货若缺供应商或批次来源不匹配，会直接造成供应商成本漏扣或错扣。
- 对照真实库存链路确认供应商退货应区别于 `016 退库管理`: 本入口是“退给供应商并扣减库存”，不是“已出库物料退回库存”。

## 产品建模质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 分类是否准确 | 供应商退货独立于退库、调拨、报废 | 分类准确；本入口应只承载“退给供应商” | 避免与退库恢复库存、调拨移动库位、报废损耗混淆 | 保持入口边界，不扩展相邻功能 |
| 字段是否够用 | 已有 `supplier_id`、`batch_id`、`purchase_order_id`、`inbound_record_id`、退款金额、物流单号 | 字段够用，但供应商/批次来源必须从可选变为主流程必备事实 | 缺供应商会让退款无法归属，缺批次来源会让库存和成本事实不可追踪 | 已要求供应商可识别，前端供应商必填，后端允许由入库/采购来源推导 |
| 关系是否正确 | 旧实现只验证部分采购/入库引用，批次只验证物料和库存 | 不足；供应商 A 可以扣供应商 B 批次，或关联入库记录与所选批次不一致 | 供应商成本、批次剩余、库存来源和退款扣减可能错账 | 已校验批次供应商、入库批号与退货来源一致 |
| 状态流转是否合理 | `pending -> shipped -> received -> refunded/cancelled`，取消/删除恢复库存 | 主流程可用；取消必须恢复库存、批次、库位并留审计 | 状态取消若副作用不完整会导致库存账和实体库存不一致 | 已用真实链路验证取消恢复和操作日志 |
| 用户工作量是否合理 | 前端供应商原非必填，仓管不能加载采购订单来源 | 仓管建单需要看采购来源；供应商必填能减少后续财务人工修正 | 仓管无法选 PO 或漏选供应商会制造长期补账 | 已放开仓管前端 PO 来源读取，并按供应商过滤批次/入库候选 |
| 是否支撑成本分析 | 报表按供应商入库金额减供应商退货退款 | 原设计在无供应商退货时漏扣；错批次时供应商和批次成本错位 | 成本分析阶段会出现供应商成本失真 | 已补强供应商归属和批次来源约束 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| SR-017-001 | 产品建模/后端 | 可创建没有供应商、采购来源或入库来源的供应商退货 | `validateSupplierReturnReferences` 原返回 `supplierId: null` 时继续创建；前端 `validateSupplierReturnForm` 不要求供应商 | 供应商退货库存已扣，但 `/reports/cost-by-supplier` 无法按供应商扣退款 | P1 | 后端要求有效供应商或可推导来源；前端供应商必填 | 后端专项、前端专项、真实 API/报表回看 | completed |
| SR-017-002 | 产品建模/后端 | 选择供应商 A 时可扣供应商 B 的批次；关联入库记录时可选不同批号批次 | 批次查询原只校验 `batch_id + material_id + remaining` | 批次来源、库存扣减、退款归属和后续成本分析错位 | P1 | 新增批次来源校验: 批次必须有供应商，且与退货供应商一致；有关联入库记录时批号也必须一致 | 后端专项、真实 API/SQLite 回看 | completed |
| SR-017-003 | 前端/权限 | 仓管可使用供应商退货后端，但前端不加载采购订单来源 | `canAccessPurchaseOrders` 原只允许 `admin/procurement`，而采购订单后端已允许仓管读取 | 仓管建退货时无法选择 PO 来源，后续采购/入库追踪变弱 | P2 | 前端放开 `warehouse_manager` 读取 PO 来源；供应商变更时清空来源，入库候选按供应商过滤 | 前端专项、真实弹窗回看 | completed |
| SR-017-004 | 产品线索 | 退款金额仍由用户手填，系统只展示批次入库单价建议 | 弹窗显示 `建议退款`，未强制按批次单价 * 数量 | 低频合同/部分退款场景需要灵活金额；主流程不阻断 | P3 | 本轮不强制自动锁定，留作后续财务策略线索 | 记录为 P3 | recorded |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| SR-017-001 | `后端代码/server/src/routes/supplier-returns-v1.1.ts` | 创建供应商退货时，必须有显式供应商或由采购/入库来源推导出的供应商；缺失返回 `SUPPLIER_REQUIRED`，不进入库存扣减事务。 |
| SR-017-001 | `前端代码/src/pages/supplier-returns/SupplierReturns.tsx` | 表单校验新增供应商必填；供应商字段在弹窗标为必填。 |
| SR-017-002 | `后端代码/server/src/routes/supplier-returns-v1.1.ts` | 新增 `validateSupplierReturnBatchSource`，校验批次供应商、入库批号与退货来源一致；不一致时事务回滚并返回 `BATCH_SOURCE_MISMATCH`。 |
| SR-017-002 | `前端代码/src/pages/supplier-returns/SupplierReturns.tsx` | 按所选供应商过滤批次和入库记录候选，供应商变更时清空批次/采购/入库来源，减少错选。 |
| SR-017-003 | `前端代码/src/pages/supplier-returns/SupplierReturns.tsx` | `canAccessPurchaseOrders` 增加 `warehouse_manager`，让仓管在前端可加载 PO 来源。 |
| SR-017-001~003 | `后端代码/server/tests/supplier-returns.test.ts`、`前端代码/src/pages/supplier-returns/SupplierReturns.test.ts` | 补供应商必填、错供应商批次、入库批号不匹配、仓管 PO 来源权限回归。 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 后端供应商退货专项 | `npx vitest run --config vitest.supplier-returns.config.ts` | 23/23 通过；Vitest 结束时有已知 close timeout 提示，但测试已成功关闭 | 覆盖无供应商拒绝、批次供应商不匹配拒绝、入库批号不匹配拒绝、库存/批次/审计回归 |
| 后端供应商退货审计 | `npm test -- --run tests/integration/supplier-returns-audit.test.ts` | 2/2 通过；同样出现 Vitest close timeout 提示 | 创建/撤销 operator、状态操作日志通过 |
| 前端表单专项 | `npm test -- --run src/pages/supplier-returns/SupplierReturns.test.ts` | 6/6 通过 | 供应商必填、批次必选、批次余量、供应商批次匹配、仓管 PO 来源权限 |
| 后端构建 | `npm run build` in `后端代码/server` | 通过 | TypeScript 编译通过 |
| 前端构建 | `npm run build` in `前端代码` | 通过，有 chunk size warning | Vite 生产构建通过 |
| Playwright 环境规则 | 读取两份本地 Playwright 记忆后执行 `find ~/Library/Caches/ms-playwright`、`test -x`、`--version`、真实 launch | 通过，未执行下载 | Chrome for Testing `147.0.7727.15`，launch title `supplier-return-pw-ok` |
| 真实 API/成本链路 | 临时库 `/tmp/coreone-supplier-returns-017.db`，创建供应商/物料/入库/批次/库存后调用 `/supplier-returns` | 有效退货 200；无供应商 400 `SUPPLIER_REQUIRED`；错供应商 409 `BATCH_SOURCE_MISMATCH` | 有效记录 `SR-20260620-349826-000`，供应商成本从 120 扣退款 36 后为 84 |
| SQLite 副作用回看 | 直接查询 `/tmp/coreone-supplier-returns-017.db` | 库存、批次、库位均从 10 扣到 7；库存流水 -3；库位调整 -3；无效请求未新增记录 | `inventory.stock=7`、`batches.remaining=7`、`inventory_locations.stock=7`、`stock_logs.quantity=-3` |
| 真实状态撤销 | API 创建第二条退货 1 瓶，流转 `pending -> shipped -> cancelled` 后回看 DB | 创建/发货/取消均 200；库存/批次/库位从 7->6->7；取消流水和操作日志写入 | `supplier_return_cancel` 流水 `before_stock=6 after_stock=7`，`operation_logs.username=admin` |
| 真实页面/弹窗 | Playwright 打开 `http://127.0.0.1:8080/supplier-returns` | 列表显示供应商、批次和退货单；新建弹窗供应商必填，选择供应商后可见该供应商批次余量 7 | 截图 `/tmp/coreone-supplier-returns-017-page.png`、`/tmp/coreone-supplier-returns-017-form.png` |

## 入口收口报告

- P0/P1 是否清零: 是，SR-017-001 和 SR-017-002 已修复并验证。
- 影响主流程的 P2 是否清零: 是，SR-017-003 已修复并验证。
- 产品建模问题是否已处理或明确阻塞: 已处理供应商归属、批次来源、入库批号、仓管来源选择；退款金额策略作为 P3 留线索。
- 页面/弹窗验证: 通过，真实页面和新建弹窗已截图。
- 后端/API/数据库验证: 通过，真实 API、SQLite 副作用和专项测试覆盖。
- 数据回看验证: 通过，列表、详情字段、成本报表、库存/批次/库位/流水均回看。
- 库存/BOM/出库/成本/审计影响: 库存/批次/库位扣减正确；成本供应商报表退款扣减正确；操作日志和库存流水正确；不影响 BOM/出库快照。
- 未处理 P3: 退款金额是否默认锁定为批次入库单价 * 数量，需后续结合财务规则决定。
- 相邻入口线索: 调拨管理需同样检查批次移动、来源库位、目标库位、撤销后库位恢复是否形成可信事实链。
- 当前 git 状态: 工作区包含本轮 017 修改及此前入口连续修改；未回退无关改动。
