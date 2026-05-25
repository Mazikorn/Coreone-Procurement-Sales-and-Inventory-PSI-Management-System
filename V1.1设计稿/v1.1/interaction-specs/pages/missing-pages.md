# 缺失页面交互规范

> **说明**: 以下5个页面在前端无实现，但后端部分已有API。本规范定义各缺失页面的用途、权限、核心功能场景、需调用的API及验收标准。  
> **引用**: [交互规范总纲](../交互规范总纲.md)  
> **来源**: [角色场景交互清单](../../角色场景交互清单.md) 缺失页面部分、 [功能矩阵-严格评估](../../功能矩阵-严格评估.md) 18.缺失页面

---

## 页面总览

| 页面 | 后端路由文件 | 前端路由 | 工作量 | 状态 |
|:---|:---|:---|:---:|:---:|
| 退库管理 | `returns-v1.1.ts` | `/returns` | 3-5天 | ❌ 无页面 |
| 报废管理 | `scraps-v1.1.ts` | `/scraps` | 3-5天 | ❌ 无页面 |
| 调拨管理 | `transfers-v1.1.ts` | `/transfers` | 3-5天 | ❌ 无页面 |
| 采购订单管理 | `purchase-orders-v1.1.ts` | `/purchase-orders` | 3-5天 | ⚠️ 无菜单入口 |
| 退货管理 | ❌ 无API | `/purchase-returns` | 5-7天 | ❌ 需前后端 |

**严格统计**: ✅ 0 | ⚠️ 0 | ❌ 12

---

## 一、退库管理（Returns）

> **页面路由**: `/returns`  
> **权限**: warehouse_manager, technician  
> **后端路由**: `returns-v1.1.ts`  
> **关联场景**: MISS-01, MISS-02

### 页面用途

管理已出库物料的退回操作。当出库物料未使用完或发生质量问题时， technician 或 warehouse_manager 可发起退库，将物料退回库存。

### MISS-01: 创建退库记录

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, technician |
| **触发** | 点击"新建退库"按钮 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 点击"新建退库" → 打开 create 弹窗（size=xl）
2. 弹窗表单字段：
   - 选择出库记录（下拉，查询已完成出库记录）
   - 显示原出库信息（物料名称、批号、原出库数量）
   - 退库数量（number，max=原出库数量，必填）
   - 退库原因（下拉：未使用完/质量问题/订单取消/其他，必填）
   - 退库备注（textarea，可选）
   - 目标库位（下拉，默认原出库库位，可修改）
3. 选择出库记录后 → 调 `GET /outbound/:id` 加载原出库详情
4. 退库数量 > 原出库数量时 → 红色提示，阻止提交
5. 点击"确认退库" → 校验 → 调 `POST /returns` → 成功关闭弹窗+刷新列表

**API定义**:
```
GET /api/v1/outbound?status=completed&pageSize=100
Response: { list: [{ id, materialName, batchNo, quantity, locationId }] }

POST /api/v1/returns
Body: { outboundId, quantity, reason, remark?, locationId }
Response: { id, status }
```

**修复方案**:
- 前端：新建 `Returns.tsx` 页面 + `ReturnModal.tsx` 弹窗组件
- 后端：确认 `returns-v1.1.ts` 已实现 `POST /returns` 接口
- 退库成功后需联动更新库存（后端事务处理）

**验收标准**:
- [ ] 弹窗正确打开，出库记录下拉可加载
- [ ] 退库数量不能超过原出库数量
- [ ] 退库原因必选
- [ ] 提交成功后库存增加对应数量
- [ ] 列表刷新，新退库记录状态为"已完成"

---

### MISS-02: 查看退库列表

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager |
| **触发** | 进入退库页面 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 页面布局：统计卡片 + 筛选栏 + 表格 + 分页
2. 统计卡片：退库总数 / 本月退库 / 待处理 / 已处理
3. 筛选栏：关键词搜索 / 退库原因筛选 / 日期范围 / 状态筛选
4. 表格列：退库单号 / 原出库单号 / 物料名称 / 批号 / 退库数量 / 退库原因 / 操作人 / 退库时间 / 状态
5. 表格操作：详情 / 编辑（待处理时） / 删除（待处理时）
6. 分页：后端分页 `GET /returns?page=1&pageSize=20`

**API定义**:
```
GET /api/v1/returns
Query: { page, pageSize, keyword, reason, status, startDate, endDate }
Response: { list, pagination: { total, page, pageSize } }
```

**修复方案**:
- 前端：新建 `Returns.tsx` 列表页
- 后端：确认 `returns-v1.1.ts` 已实现列表查询接口
- 菜单配置：在导航栏新增"退库管理"入口（warehouse_manager 角色可见）

**验收标准**:
- [ ] 页面正常加载，显示退库记录表格
- [ ] 统计卡片数据正确
- [ ] 筛选功能正常，URL 同步
- [ ] 分页为后端分页
- [ ] 表格操作按钮按状态显示（待处理可编辑/删除，已处理仅查看）

---

## 二、报废管理（Scraps）

> **页面路由**: `/scraps`  
> **权限**: warehouse_manager  
> **后端路由**: `scraps-v1.1.ts`  
> **关联场景**: MISS-03, MISS-04

### 页面用途

管理库存物料的报废操作。当物料过期、损坏或不再使用时，warehouse_manager 可发起报废，将物料从库存中移除。

### MISS-03: 创建报废记录

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager |
| **触发** | 点击"新建报废"按钮 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 点击"新建报废" → 打开 create 弹窗（size=xl）
2. 弹窗表单字段：
   - 选择库存物料（下拉，支持搜索，显示物料名称+批号+当前库存）
   - 报废数量（number，max=当前库存，必填）
   - 报废原因（下拉：过期/损坏/变质/淘汰/其他，必填）
   - 报废备注（textarea，可选）
   - 附件上传（可选，上传报废照片/证明）
3. 选择物料后 → 调 `GET /inventory/:materialId` 加载当前库存
4. 报废数量 > 当前库存时 → 红色提示，阻止提交
5. 点击"确认报废" → 校验 → 调 `POST /scraps` → 成功关闭弹窗+刷新列表

**API定义**:
```
GET /api/v1/inventory?keyword=&pageSize=100
Response: { list: [{ id, materialName, batchNo, quantity, locationName }] }

POST /api/v1/scraps
Body: { inventoryId, materialId, quantity, reason, remark?, attachment? }
Response: { id, status }
```

**修复方案**:
- 前端：新建 `Scraps.tsx` 页面 + `ScrapModal.tsx` 弹窗组件
- 后端：确认 `scraps-v1.1.ts` 已实现 `POST /scraps` 接口
- 报废成功后需联动扣减库存（后端事务处理）

**验收标准**:
- [ ] 弹窗正确打开，库存物料下拉可加载
- [ ] 报废数量不能超过当前库存
- [ ] 报废原因必选
- [ ] 提交成功后库存扣减对应数量
- [ ] 列表刷新，新报废记录状态为"已完成"

---

### MISS-04: 查看报废列表

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager |
| **触发** | 进入报废页面 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 页面布局：统计卡片 + 筛选栏 + 表格 + 分页
2. 统计卡片：报废总数 / 本月报废 / 待审批 / 已报废
3. 筛选栏：关键词搜索 / 报废原因筛选 / 日期范围 / 状态筛选
4. 表格列：报废单号 / 物料名称 / 批号 / 报废数量 / 报废原因 / 操作人 / 报废时间 / 状态
5. 表格操作：详情 / 编辑（待审批时） / 删除（待审批时）
6. 分页：后端分页 `GET /scraps?page=1&pageSize=20`

**API定义**:
```
GET /api/v1/scraps
Query: { page, pageSize, keyword, reason, status, startDate, endDate }
Response: { list, pagination: { total, page, pageSize } }
```

**修复方案**:
- 前端：新建 `Scraps.tsx` 列表页
- 后端：确认 `scraps-v1.1.ts` 已实现列表查询接口
- 菜单配置：在导航栏新增"报废管理"入口（warehouse_manager 角色可见）

**验收标准**:
- [ ] 页面正常加载，显示报废记录表格
- [ ] 统计卡片数据正确
- [ ] 筛选功能正常，URL 同步
- [ ] 分页为后端分页
- [ ] 表格操作按钮按状态显示

---

## 三、调拨管理（Transfers）

> **页面路由**: `/transfers`  
> **权限**: warehouse_manager  
> **后端路由**: `transfers-v1.1.ts`  
> **关联场景**: MISS-05, MISS-06

### 页面用途

管理库存物料在不同库位之间的调拨操作。当物料需要从一个库位转移到另一个库位时，warehouse_manager 可发起调拨。

### MISS-05: 创建调拨记录

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager |
| **触发** | 点击"新建调拨"按钮 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 点击"新建调拨" → 打开 create 弹窗（size=xl）
2. 弹窗表单字段：
   - 选择来源库位（下拉，必填）
   - 选择目标库位（下拉，必填，不能与来源相同）
   - 选择物料（下拉，根据来源库位过滤，显示物料+批号+当前库存）
   - 调拨数量（number，max=当前库存，必填）
   - 调拨原因（下拉：库位调整/项目需求/整理盘点/其他，可选）
   - 调拨备注（textarea，可选）
3. 选择来源库位后 → 调 `GET /inventory?locationId=` 加载该库位物料
4. 目标库位 = 来源库位时 → 红色提示，阻止提交
5. 调拨数量 > 当前库存时 → 红色提示，阻止提交
6. 点击"确认调拨" → 校验 → 调 `POST /transfers` → 成功关闭弹窗+刷新列表

**API定义**:
```
GET /api/v1/locations?status=active
Response: { list: [{ id, name, path }] }

GET /api/v1/inventory?locationId={id}&pageSize=100
Response: { list: [{ id, materialName, batchNo, quantity }] }

POST /api/v1/transfers
Body: { fromLocationId, toLocationId, materialId, quantity, reason?, remark? }
Response: { id, status }
```

**修复方案**:
- 前端：新建 `Transfers.tsx` 页面 + `TransferModal.tsx` 弹窗组件
- 后端：确认 `transfers-v1.1.ts` 已实现 `POST /transfers` 接口
- 调拨成功后需联动更新库存（来源库位扣减，目标库位增加，后端事务处理）

**验收标准**:
- [ ] 弹窗正确打开，库位和物料下拉可加载
- [ ] 来源和目标库位不能相同
- [ ] 调拨数量不能超过当前库存
- [ ] 提交成功后来源库位库存扣减，目标库位库存增加
- [ ] 列表刷新，新调拨记录状态为"已完成"

---

### MISS-06: 查看调拨列表

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager |
| **触发** | 进入调拨页面 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 页面布局：统计卡片 + 筛选栏 + 表格 + 分页
2. 统计卡片：调拨总数 / 本月调拨 / 待执行 / 已完成
3. 筛选栏：关键词搜索 / 来源库位筛选 / 目标库位筛选 / 日期范围 / 状态筛选
4. 表格列：调拨单号 / 物料名称 / 批号 / 调拨数量 / 来源库位 → 目标库位 / 操作人 / 调拨时间 / 状态
5. 表格操作：详情 / 编辑（待执行时） / 删除（待执行时）
6. 分页：后端分页 `GET /transfers?page=1&pageSize=20`

**API定义**:
```
GET /api/v1/transfers
Query: { page, pageSize, keyword, fromLocationId, toLocationId, status, startDate, endDate }
Response: { list, pagination: { total, page, pageSize } }
```

**修复方案**:
- 前端：新建 `Transfers.tsx` 列表页
- 后端：确认 `transfers-v1.1.ts` 已实现列表查询接口
- 菜单配置：在导航栏新增"调拨管理"入口（warehouse_manager 角色可见）

**验收标准**:
- [ ] 页面正常加载，显示调拨记录表格
- [ ] 统计卡片数据正确
- [ ] 筛选功能正常，URL 同步
- [ ] 分页为后端分页
- [ ] 表格操作按钮按状态显示

---

## 四、采购订单管理（Purchase Orders）

> **页面路由**: `/purchase-orders`  
> **权限**: procurement, admin  
> **后端路由**: `purchase-orders-v1.1.ts`  
> **关联场景**: MISS-07 ~ MISS-10

### 页面用途

管理耗材采购订单的全生命周期。procurement 可创建采购订单、跟踪收货进度、查看订单详情；admin 可查看全部订单。

> **特殊说明**: 后端 API 已存在，但前端无菜单入口。需在导航栏新增入口。

### MISS-07: 创建采购订单

| 属性 | 内容 |
|:---|:---|
| **角色** | procurement |
| **触发** | 点击"新建订单"按钮 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 点击"新建订单" → 打开 create 弹窗（size=xl）
2. 弹窗表单字段：
   - 订单编号（文本，自动生成或手动输入，唯一）
   - 选择耗材（下拉，支持搜索，必填）
   - 供应商（下拉，根据耗材默认供应商，可修改，必填）
   - 采购数量（number，> 0，必填）
   - 单价（number，≥ 0，必填）
   - 预计到货日期（date，可选）
   - 采购备注（textarea，可选）
3. 选择耗材后 → 自动填充默认供应商和参考单价
4. 支持添加多行（一个订单可包含多种耗材）
5. 点击"确认创建" → 校验 → 调 `POST /purchase-orders` → 成功关闭弹窗+刷新列表

**API定义**:
```
GET /api/v1/materials?status=active&pageSize=100
Response: { list: [{ id, name, spec, unit, defaultSupplierId, referencePrice }] }

GET /api/v1/suppliers?status=active
Response: { list: [{ id, name }] }

POST /api/v1/purchase-orders
Body: { orderNo, items: [{ materialId, supplierId, quantity, price }], expectedDate?, remark? }
Response: { id, status: "pending" }
```

**修复方案**:
- 前端：新建 `PurchaseOrders.tsx` 页面 + `PurchaseOrderModal.tsx` 弹窗组件
- 支持多行明细（类似出库弹窗的物料明细添加方式）
- 后端：确认 `purchase-orders-v1.1.ts` 已实现 `POST /purchase-orders` 接口

**验收标准**:
- [ ] 弹窗正确打开，耗材和供应商下拉可加载
- [ ] 选择耗材后自动填充默认供应商和参考单价
- [ ] 支持一个订单包含多种耗材
- [ ] 订单编号唯一校验
- [ ] 提交成功后列表刷新，订单状态为"待入库"

---

### MISS-08: 查看采购订单列表

| 属性 | 内容 |
|:---|:---|
| **角色** | procurement, admin |
| **触发** | 进入采购订单页面 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 页面布局：统计卡片 + 筛选栏 + 表格 + 分页
2. 统计卡片：订单总数 / 待入库 / 部分到货 / 已完成 / 已取消
3. 筛选栏：关键词搜索 / 供应商筛选 / 状态筛选 / 日期范围
4. 表格列：订单编号 / 供应商 / 耗材种类数 / 总金额 / 已到货金额 / 到货进度 / 预计到货日 / 状态
5. 到货进度显示：进度条（已到货数量 / 采购数量）
6. 表格操作：详情 / 编辑（pending/partial 时） / 取消（pending 时）
7. 分页：后端分页 `GET /purchase-orders?page=1&pageSize=20`

**API定义**:
```
GET /api/v1/purchase-orders
Query: { page, pageSize, keyword, supplierId, status, startDate, endDate }
Response: { list: [{ id, orderNo, supplierName, itemCount, totalAmount, receivedAmount, progress, expectedDate, status }], pagination }
```

**修复方案**:
- 前端：新建 `PurchaseOrders.tsx` 列表页
- 后端：确认 `purchase-orders-v1.1.ts` 已实现列表查询接口
- 菜单配置：在导航栏新增"采购订单"入口（procurement, admin 角色可见）

**验收标准**:
- [ ] 页面正常加载，显示采购订单表格
- [ ] 统计卡片数据正确
- [ ] 到货进度条显示正确
- [ ] 筛选功能正常，URL 同步
- [ ] 分页为后端分页

---

### MISS-09: 查看采购订单详情

| 属性 | 内容 |
|:---|:---|
| **角色** | procurement, admin |
| **触发** | 点击"详情" |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 点击"详情" → 打开 detail 弹窗（size=lg）
2. 弹窗内容分 Tab：
   - **基本信息 Tab**: 订单编号、供应商、创建时间、预计到货日、状态、备注
   - **明细清单 Tab**: 耗材列表（名称/规格/数量/单价/金额/已到货/剩余待入）
   - **关联入库 Tab**: 该订单关联的入库记录列表（单号/数量/时间/操作人）
3. 明细清单中每行显示到货进度

**API定义**:
```
GET /api/v1/purchase-orders/:id
Response: { id, orderNo, supplier, items, status, expectedDate, remark, createdAt }

GET /api/v1/inbound?purchaseOrderId={id}
Response: { list: [{ id, quantity, createdAt, operator }] }
```

**修复方案**:
- 前端：在 `PurchaseOrders.tsx` 中实现详情弹窗
- 后端：确认 `purchase-orders-v1.1.ts` 已实现详情查询接口

**验收标准**:
- [ ] 弹窗显示订单完整信息
- [ ] 明细清单显示每种耗材的到货进度
- [ ] 关联入库 Tab 显示所有关联入库记录
- [ ] 数据与列表行一致

---

### MISS-10: 取消采购订单

| 属性 | 内容 |
|:---|:---|
| **角色** | procurement, admin |
| **触发** | 点击"取消" |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 仅 `status='pending'` 的订单可取消
2. 点击"取消" → 打开确认弹窗（size=sm）
3. 弹窗显示：订单编号、供应商、取消影响（"该订单尚未入库，取消后不可恢复"）
4. 点击"确认取消" → 调 `PUT /purchase-orders/:id/cancel` → 成功 toast + 刷新列表

**API定义**:
```
PUT /api/v1/purchase-orders/:id/cancel
Response: { id, status: "cancelled" }
```

**修复方案**:
- 前端：在 `PurchaseOrders.tsx` 中实现取消确认弹窗
- 后端：确认 `purchase-orders-v1.1.ts` 已实现取消接口

**验收标准**:
- [ ] 仅 pending 状态订单显示取消按钮
- [ ] 取消前有二次确认弹窗
- [ ] 取消成功后订单状态变为"已取消"
- [ ] 已取消订单不可再次取消

---

## 五、退货管理（Purchase Returns）

> **页面路由**: `/purchase-returns`  
> **权限**: warehouse_manager, procurement  
> **后端路由**: ❌ 无API  
> **关联场景**: MISS-11, MISS-12

### 页面用途

管理向供应商退货的操作。当采购的物料存在质量问题或采购错误时，warehouse_manager 或 procurement 可发起退货，将物料退回供应商。

> **特殊说明**: 该页面后端 API 完全缺失，需前后端同时开发。

### MISS-11: 创建退货记录

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement |
| **触发** | 点击"新建退货"按钮 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 点击"新建退货" → 打开 create 弹窗（size=xl）
2. 弹窗表单字段：
   - 选择入库记录（下拉，查询已完成的入库记录）
   - 显示原入库信息（物料名称/批号/供应商/原入库数量/当前库存）
   - 退货数量（number，max=当前库存，必填）
   - 退货原因（下拉：质量问题/采购错误/供应商发错/其他，必填）
   - 退货备注（textarea，可选）
   - 关联采购订单（如入库来自采购订单，自动关联，不可修改）
3. 选择入库记录后 → 调 `GET /inbound/:id` 加载原入库详情
4. 退货数量 > 当前库存时 → 红色提示，阻止提交
5. 点击"确认退货" → 校验 → 调 `POST /purchase-returns` → 成功关闭弹窗+刷新列表

**API定义**（需新增）:
```
GET /api/v1/inbound?status=completed&pageSize=100
Response: { list: [{ id, materialName, batchNo, supplierName, quantity, locationId, purchaseOrderId }] }

POST /api/v1/purchase-returns
Body: { inboundId, quantity, reason, remark? }
Response: { id, status }
```

**修复方案**:
- 前端：新建 `PurchaseReturns.tsx` 页面 + `PurchaseReturnModal.tsx` 弹窗组件
- 后端：新建 `purchase-returns-v1.1.ts` 路由文件，实现：
  - `POST /purchase-returns` 创建退货
  - `GET /purchase-returns` 列表查询
  - `GET /purchase-returns/:id` 详情查询
  - `PUT /purchase-returns/:id/cancel` 取消退货
- 数据库：新增 `purchase_returns` 表
- 退货成功后需联动扣减库存（后端事务处理）

**验收标准**:
- [ ] 弹窗正确打开，入库记录下拉可加载
- [ ] 退货数量不能超过当前库存
- [ ] 退货原因必选
- [ ] 提交成功后库存扣减对应数量
- [ ] 列表刷新，新退货记录状态为"已完成"

---

### MISS-12: 查看退货列表

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement |
| **触发** | 进入退货页面 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 页面布局：统计卡片 + 筛选栏 + 表格 + 分页
2. 统计卡片：退货总数 / 本月退货 / 待处理 / 已完成
3. 筛选栏：关键词搜索 / 退货原因筛选 / 供应商筛选 / 日期范围 / 状态筛选
4. 表格列：退货单号 / 原入库单号 / 物料名称 / 批号 / 退货数量 / 退货原因 / 供应商 / 操作人 / 退货时间 / 状态
5. 表格操作：详情 / 编辑（待处理时） / 删除（待处理时）
6. 分页：后端分页 `GET /purchase-returns?page=1&pageSize=20`

**API定义**（需新增）:
```
GET /api/v1/purchase-returns
Query: { page, pageSize, keyword, reason, supplierId, status, startDate, endDate }
Response: { list, pagination: { total, page, pageSize } }
```

**修复方案**:
- 前端：新建 `PurchaseReturns.tsx` 列表页
- 后端：在 `purchase-returns-v1.1.ts` 中实现列表查询接口
- 数据库：新增 `purchase_returns` 表，字段包括：
  - id, inboundId, materialId, quantity, reason, remark, status, operator, createdAt, updatedAt
- 菜单配置：在导航栏新增"退货管理"入口（warehouse_manager, procurement 角色可见）

**验收标准**:
- [ ] 页面正常加载，显示退货记录表格
- [ ] 统计卡片数据正确
- [ ] 筛选功能正常，URL 同步
- [ ] 分页为后端分页
- [ ] 表格操作按钮按状态显示

---

## 缺失页面修复汇总

| 优先级 | 页面 | 场景 | 问题 | 工时 |
|:---|:---|:---|:---|:---:|
| P1 | 采购订单 | MISS-07~10 | 后端有API，前端无页面和菜单入口 | 3-5天 |
| P1 | 退库管理 | MISS-01~02 | 后端有API，前端无页面 | 3-5天 |
| P1 | 报废管理 | MISS-03~04 | 后端有API，前端无页面 | 3-5天 |
| P1 | 调拨管理 | MISS-05~06 | 后端有API，前端无页面 | 3-5天 |
| P2 | 退货管理 | MISS-11~12 | 前后端均无实现 | 5-7天 |

### 各页面开发工作量明细

| 页面 | 前端页面 | 弹窗组件 | 菜单配置 | 后端API确认 | 数据库 | 合计 |
|:---|:---:|:---:|:---:|:---:|:---:|:---:|
| 退库管理 | 1d | 1d | 0.5d | 0.5d | - | 3d |
| 报废管理 | 1d | 1d | 0.5d | 0.5d | - | 3d |
| 调拨管理 | 1d | 1d | 0.5d | 0.5d | - | 3d |
| 采购订单 | 1d | 1.5d | 0.5d | 0.5d | - | 3.5d |
| 退货管理 | 1d | 1d | 0.5d | 2d | 1d | 5.5d |

### 共性验收标准（适用于全部缺失页面）

- [ ] 页面路由可正常访问，无404
- [ ] 权限控制正确，无权限角色无法访问
- [ ] 导航菜单显示正确（有权限角色可见，无权限角色隐藏）
- [ ] 统计卡片数据来自后端真实API
- [ ] 筛选功能完整，URL同步
- [ ] 分页为后端分页
- [ ] 表格支持排序
- [ ] 删除有二次确认弹窗（非原生confirm）
- [ ] 表单校验完善（必填、范围、格式）
- [ ] 错误处理完善，失败时有明确提示

---

*本规范引用 [交互规范总纲](../交互规范总纲.md) 的共性标准。*
