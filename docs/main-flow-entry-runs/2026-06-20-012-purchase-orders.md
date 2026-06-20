# 采购订单 主流程收口记录

## 入口边界

- 入口: 采购订单
- 导航路径: 采购管理 -> 采购订单 (`/purchase-orders`)
- 主要用户: 采购员、仓管
- 本轮目标: 检查并修复采购订单创建、维护、跟进入库状态，以及供应商/物料/价格/剩余数量进入入库待办链路的高频主流程核心问题。
- 包含范围: 采购订单列表、搜索筛选、新建、取消、详情、状态、供应商引用、物料引用、采购数量、单价、总价、已入库数量、剩余数量、入库联动。
- 明确不做: 不直接修入库、库存或供应商退货本体；若发现相邻问题只记录线索。

## 当前检索记录

- 读取 `前端代码/src/pages/purchase/PurchaseOrders.tsx`，复核列表、搜索、创建弹窗、详情弹窗、收货跳转、取消确认和角色按钮。
- 读取 `后端代码/server/src/routes/purchase-orders-v1.1.ts`、`后端代码/server/src/app.ts`、`后端代码/server/src/constants/rolePermissions.ts`，复核采购订单读写权限、创建校验、列表/详情返回和取消状态机。
- 读取 `前端代码/src/pages/inbound/hooks/useInboundPage.ts`、`InboundFormModal.tsx`，确认入库页复用 `purchaseOrderApi.getList({ status: 'pending,partial' })` 作为采购入库候选来源。
- 读取 `后端代码/server/src/routes/inbound-v1.1.ts`，确认采购入库会校验 PO 物料、供应商、剩余数量，并在未传价格时继承采购订单单价。
- 读取 `后端代码/server/tests/purchase-order-inbound.test.ts`、`前端代码/src/pages/inbound/hooks/useInboundPage.test.ts`、`前端代码/src/pages/purchase/PurchaseOrders.test.ts`，确认既有测试覆盖入库联动，但仓管读权限和供应商必填需要调整。

## 产品建模质疑

| 检查点 | 当前设计 | 质疑结论 | 影响 | 处理决定 |
|:---|:---|:---|:---|:---|
| 分类是否准确 | 采购订单负责采购员建单，入库页负责真实入库副作用 | 分类合理；直接 `PUT /purchase-orders/:id/receive` 已拒绝，避免绕开库存批次 | 收货必须形成入库单、批次和库存日志 | 保持收货跳转入库的设计 |
| 字段是否够用 | 订单有物料、供应商、数量、单价、总额、预计到货、状态、备注 | 原供应商可空不合理；供应商来源是采购批次、退货和审计关键字段 | 批次缺供应商来源，后续供应商退货/审计断链 | 新建采购订单要求供应商必填 |
| 关系是否正确 | PO 连接物料、供应商和入库记录 | 仓管此前不能读取 PO，导致入库页也不能加载待收 PO | 采购员建单后仓管无法按 PO 入库，只能直接入库，订单剩余量/批次来源失真 | 后端开放仓管只读，前端仓管可看 PO 并跳入库 |
| 状态流转是否合理 | pending/partial 可继续收货，completed/cancelled 不可收货；已收货不能取消 | 状态流转合理；取消和入库校验已有后端保护 | 防止已收订单被取消或超收 | 保持，补角色读写边界 |
| 用户工作量是否合理 | 采购员建单，仓管从 PO 一键进入入库并带入物料/供应商/剩余量/单价 | 修复后工作量合理；无须仓管手抄 PO 信息 | 减少手工录错物料、供应商和单价 | 本轮修复 |
| 是否支撑成本分析 | 采购订单单价进入入库批次成本，供应商进入来源追踪 | 订单必须有供应商、数量、单价和剩余量可信 | 批次成本和供应商维度分析依赖本链路 | P1 清零后收口 |

## 现场问题清单

| ID | 类型 | 现象 | 证据 | 影响链路 | 优先级 | 处理决定 | 验证方式 | 状态 |
|:---|:---|:---|:---|:---|:---:|:---|:---|:---|
| PO-001 | 权限/流程断链 | 仓管无法读取采购订单，入库页也不会加载待收采购订单 | `app.ts` 原 `/purchase-orders` 只允许 `admin/procurement`；`useInboundPage.ts` 原 `canAccessPurchaseOrders` 只含 admin/procurement；目标入口用户为采购员、仓管 | 仓管无法按采购订单入库，可能退化为直接入库，订单剩余量、供应商和单价链路失真 | P1 | 后端开放仓管只读；路由内 POST/PUT 写操作仍要求 admin/procurement；前端仓管可看 PO/收货跳转但不可新建/取消 | 后端/前端测试、真实仓管页面/API | completed |
| PO-002 | 供应商关系缺失 | 新建采购订单可不选供应商 | `PurchaseOrders.tsx` 供应商非必填；`POST /purchase-orders` 原允许 `supplierId` 为空 | 后续采购入库批次可能没有供应商来源，供应商退货和审计断链 | P1 | 新建 PO 要求供应商必填，并保留停用/不存在供应商拒绝 | 后端测试、真实 API 400 | completed |
| PO-003 | 展示/追溯 | 列表/详情供应商名称依赖前端 active 供应商下拉匹配 | 后端原只返回 `supplierId`；前端 `suppliers.find()` 只加载 active 供应商 | 供应商停用后历史订单显示 `-`，影响采购追踪 | P2 | 列表/详情后端 LEFT JOIN 返回 `supplierName`，前端优先展示返回值 | 后端测试、真实采购员/仓管页面 | completed |
| PO-004 | 相邻线索 | 采购订单仍无编辑入口 | 页面只有新建、详情、收货、取消 | 录错数量/单价时需取消重建，低频但会增加采购员工作量 | P3 | 本轮不做，避免影响已入库状态机；记录后续需设计未收货订单编辑规则 | recorded |

## 修复记录

| 问题ID | 修改点 | 说明 |
|:---|:---|:---|
| PO-001 | `后端代码/server/src/app.ts` | `/api/v1/purchase-orders` 入口允许 `warehouse_manager` 访问。 |
| PO-001 | `后端代码/server/src/routes/purchase-orders-v1.1.ts` | 新增 `requirePurchaseOrderWrite`，POST、receive、cancel 写操作仍只允许 admin/procurement。 |
| PO-001 | `后端代码/server/src/constants/rolePermissions.ts` | 仓管默认权限增加 `purchase_orders:view`，保持非写权限。 |
| PO-001 | `前端代码/src/lib/permissions.ts` | 仓管菜单增加 `/purchase-orders`。 |
| PO-001 | `前端代码/src/pages/inbound/hooks/useInboundPage.ts` | 仓管入库页允许加载 pending/partial 采购订单候选。 |
| PO-001 | `前端代码/src/pages/purchase/PurchaseOrders.tsx` | 新增 `canWritePurchaseOrders()`、`canReceivePurchaseOrders()`；仓管隐藏新建/取消，保留收货跳转。 |
| PO-002/PO-003 | `后端代码/server/src/routes/purchase-orders-v1.1.ts` | 创建采购订单要求供应商必填；列表/详情 JOIN 供应商并返回 `supplierName`；关键词搜索支持供应商名。 |
| PO-002/PO-003 | `前端代码/src/pages/purchase/PurchaseOrders.tsx` | 创建弹窗供应商标必填，前端校验供应商；列表/详情优先展示 `row.supplierName`。 |
| PO-001/PO-002/PO-003 | 测试文件 | 更新 `purchase-order-inbound.test.ts`、`PurchaseOrders.test.ts`、`useInboundPage.test.ts`，覆盖仓管只读/收货、供应商必填和 supplierName 返回。 |

## 验证记录

| 验证项 | 命令/操作 | 结果 | 证据 |
|:---|:---|:---|:---|
| 后端采购订单/入库回归 | `npm test -- --run tests/purchase-order-inbound.test.ts` | 19 passed | 覆盖仓管可读不可写、供应商必填、supplierName 返回、直接收货拒绝、采购入库同步 PO、取消/超收/物料供应商匹配等链路 |
| 前端采购/入库专项 | `npm test -- --run src/pages/purchase/PurchaseOrders.test.ts src/pages/inbound/hooks/useInboundPage.test.ts` | 19 passed | 覆盖采购订单角色能力、仓管入库加载采购订单、采购入库不调用 direct receive |
| 后端构建 | `npm run build` in `后端代码/server` | passed | TypeScript 编译通过 |
| 前端构建 | `npm run build` in `前端代码` | passed | Vite build 通过，仅大 chunk 提醒 |
| 真实 API/SQLite | 临时 DB `/tmp/coreone-purchase-orders-verify-20260620.db`；采购员 `zhaohp` 建单，仓管 `wangkq` 读取和采购入库 | passed | 无供应商创建 400；有效 PO `PO20260620-0001` 创建成功；仓管 GET 200/POST 403；入库 201 后 PO `partial`、`received_qty=4`、批次 `B-POV377120` `inbound_price=18.5` |
| 真实采购员页面 | 浏览器登录采购员，打开 `/purchase-orders` 搜索 `POV377120` | passed | 页面显示 `新建采购订单`、订单 `采购验证物料POV377120`、供应商 `采购验证供应商POV377120`、`部分收货`、收货入口；该 partial 订单无取消按钮 |
| 真实仓管页面 | 浏览器登录仓管，打开 `/purchase-orders` 搜索 `POV377120`，点击收货 | passed | 仓管无 `新建采购订单`、无取消按钮；可见订单和供应商；收货弹窗显示剩余可收货 `6`；`去入库` 跳转 `/inbound?action=create&type=purchase&purchaseOrderId=...&materialId=mat-POV377120&quantity=6&price=18.5&supplierId=sup-POV377120` |
| 临时资源清理 | 停止临时前后端；删除 `/tmp/coreone-purchase-orders-verify-20260620.db*`；复核 3001/8080 端口 | passed | 临时服务已停止，临时 DB 已清理，端口无残留进程 |

## 入口收口报告

- P0/P1 是否清零: 是。仓管采购订单只读/入库链路、供应商必填和采购入库关键引用已修复并验证。
- 影响主流程的 P2 是否清零: 是。列表/详情供应商名称回看已由后端返回，避免 active 供应商下拉导致历史订单显示断链。
- 产品建模问题是否已处理或明确阻塞: 已处理高频主流程；未收货订单编辑规则记录为 P3。
- 页面/弹窗验证: 已验证采购员列表和仓管列表/收货弹窗/入库跳转。
- 后端/API/数据库验证: 已验证无供应商拒绝、仓管可读不可写、采购入库后 PO 和批次副作用。
- 数据回看验证: SQLite 回看 PO `partial`、收货数量、供应商、批次和入库价格。
- 库存/BOM/出库/成本/审计影响: 采购订单必须绑定供应商和物料；仓管从 PO 入库会带入剩余数量、单价和供应商，保护后续库存批次成本、供应商退货和审计链。
- 未处理 P3: 未收货订单编辑规则；历史供应商软删除后的快照字段可在后续审计增强中评估。
- 相邻入口线索: 013 入库管理需继续验证从采购订单跳入后，入库弹窗是否完整带入 PO/物料/供应商/价格/剩余量，并确保真实库存、批次和日志副作用。
- 当前 git 状态: 分支 `codex/abc-productization-phase0-1-2026-06-15` ahead 189；仍存在本轮前已有 `前端代码/e2e-report/index.html` modified，未触碰。
