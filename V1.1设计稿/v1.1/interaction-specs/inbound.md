# 入库页面交互规范（Inbound）

> **文件**: [前端代码/src/pages/inbound/Inbound.tsx](前端代码/src/pages/inbound/Inbound.tsx)  
> **路由**: `/inbound`  
> **权限**: admin / warehouse_manager / procurement  
> **状态**: 已实现，1628行

---

## 一、页面结构

```
┌─────────────────────────────────────────────────────────────┐
│ 页面头部：入库记录 / 管理物料入库记录，跟踪采购入库流程       │
├─────────────────────────────────────────────────────────────┤
│ 快捷操作栏：[+新增入库] [扫码入库] [批量导入] [打印记录]     │
├─────────────────────────────────────────────────────────────┤
│ 统计卡片(4)：本月入库 | 入库金额 | 待入库 | 供应商数          │
├─────────────────────────────────────────────────────────────┤
│ 快速筛选：[全部(156)] [今日(12)] [本周(45)] [本月(156)]      │
├─────────────────────────────────────────────────────────────┤
│ 筛选栏：搜索 | 耗材 | 状态 | 来源 | 日期范围 → 查询/重置    │
├─────────────────────────────────────────────────────────────┤
│ 批量操作栏（选中时显示）：已选N项 [导出] [打印] [取消]      │
├─────────────────────────────────────────────────────────────┤
│ 表格（11列）：多选 | 单号 | 耗材 | 批号 | 来源 | 数量 | 金额│
│               | 供应商 | 时间 | 状态 | 操作                   │
├─────────────────────────────────────────────────────────────┤
│ 分页：共N条，第X/Y页 [上一页] [1][2][3]...[下一页]           │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 表格列定义

| 列 | 字段 | 类型 | 说明 |
|---|------|------|------|
| 多选 | checkbox | - | 全选/半选/单选 |
| 入库单号 | `inboundNo` | mono 12px | 如 RK20250522001 |
| 耗材名称 | `materialName` | medium 14px | 加粗显示 |
| 批号 | `batchNo` | mono 12px | 空时显示 `-` |
| 入库来源 | `type` | badge | 采购/退库/直接/调拨 |
| 数量 | `quantity` + `unit` | - | 如 10 盒 |
| 金额 | `amount` / `price*quantity` | currency | 自动计算 |
| 供应商 | `supplierName` | - | 空时显示 `-` |
| 入库时间 | `createdAt` | datetime | 如 2025/05/22 09:30 |
| 状态 | `status` | badge | completed/pending/cancelled |
| 操作 | actions | buttons | 详情/编辑/删除 + 动态按钮 |

### 1.2 操作列动态按钮规则

| 状态 | 动态按钮 |
|------|---------|
| `cancelled` | 恢复 |
| `pending` | 确认入库（蓝色主按钮） |
| `completed` | 打印 |

---

## 二、状态定义

### 2.1 入库来源（type）

| 值 | 显示 | Badge颜色 |
|---|------|----------|
| `purchase` | 采购入库 | blue |
| `return` | 退库入库 | cyan |
| `direct` | 直接入库 | emerald |
| `transfer` | 调拨入库 | amber |
| `surplus` | 盘盈入库 | slate |
| `other` | 其他入库 | gray |

### 2.2 入库状态（status）

| 值 | 显示 | Badge颜色 |
|---|------|----------|
| `completed` | 已完成 | green |
| `pending` | 部分到货 | amber |
| `cancelled` | 已取消 | gray |

> **注意**: `pending` 判断逻辑在代码中为演示用（`row.quantity > 1000`），实际应以后端数据为准。

---

## 三、表单验证规则

### 3.1 新增/编辑入库弹窗（create/edit）

| 字段 | 必填 | 校验规则 | 错误提示 |
|------|------|---------|---------|
| 入库来源 | 是 | select，非空 | （UI限制，无显式错误提示） |
| 耗材名称 | 是 | materialId 非空 | "请选择耗材并输入数量" |
| 数量 | 是 | `quantity > 0` | "请选择耗材并输入数量" |
| 来源库位 | 条件 | `type === 'transfer'` 时必填 | "请选择或输入来源库位" |
| 目标库位 | 是 | locationId 非空 | （UI限制） |
| 批号 | 否 | 文本，任意 | - |
| 规格单价 | 否 | number >= 0 | - |
| 生产日期 | 否 | date | - |
| 有效期至 | 否 | date | - |
| 供应商 | 否 | select | - |
| 备注 | 否 | textarea，任意 | - |
| 采购订单 | 条件 | `type === 'purchase'` 时可选 | 选择后自动填充供应商/耗材/单价/数量 |

### 3.2 确认入库弹窗（confirm）

| 字段 | 必填 | 校验规则 |
|------|------|---------|
| 本次入库数量 | 是 | number，min=1，max=订单数量 |
| 入库后处理 | 是 | radio：keep / complete |

### 3.3 表单联动规则

```
type = 'purchase' → 显示采购订单下拉（有数据时）
                    → 隐藏来源库位字段
                    → 库位标签 = "库位"

type = 'transfer' → 隐藏采购订单
                    → 显示来源库位（支持select + input自由输入）
                    → 库位标签 = "目标库位"

type = 'return' | 'direct' → 隐藏采购订单
                             → 隐藏来源库位
                             → 库位标签 = "库位"

选择采购订单 → 自动填充: supplierId, materialId, price, quantity
```

---

## 四、弹窗状态机

```
                    ┌─────────────┐
         ┌─────────│   页面列表   │
         │         └──────┬──────┘
         │                │ 点击按钮
         ▼                ▼
   ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
   │  create  │     │  scan    │     │ import   │     │  print   │
   │ 新增/编辑 │     │ 扫码入库  │     │ 批量导入  │     │ 打印预览  │
   └────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
        │                │                │                │
        │ 提交成功        │ 扫码成功        │ 导入成功        │ 点击打印
        │                │ 800ms后         │                │
        ▼                ▼                ▼                ▼
   ┌──────────┐     ┌──────────┐     ┌──────────┐     window.print()
   │ 刷新列表  │     │  → create │     │ 刷新列表  │
   └──────────┘     └──────────┘     └──────────┘

   ┌──────────┐     ┌──────────┐
   │  detail  │     │ confirm  │
   │ 详情弹窗  │     │ 确认入库  │
   └────┬─────┘     └────┬─────┘
        │                │
        │ 点击打印        │ 点击确认
        ▼                ▼
   ┌──────────┐     ┌──────────┐
   │  print   │     │ 刷新列表  │
   └──────────┘     └──────────┘

   ┌──────────┐     ┌──────────┐
   │  restore │     │  edit    │
   │ 恢复入库  │     │ 编辑入库  │
   └────┬─────┘     └────┬─────┘
        │                │
        │ 点击恢复        │ 提交成功
        ▼                ▼
   ┌──────────┐     ┌──────────┐
   │ 刷新列表  │     │ 刷新列表  │
   └──────────┘     └──────────┘
```

### 4.1 弹窗尺寸

| 弹窗 | size | 对应 max-w |
|------|------|-----------|
| create / edit | xl | max-w-4xl (56rem) |
| detail | lg | max-w-2xl (42rem) |
| confirm / restore | md | max-w-md (28rem) |
| scan | md | max-w-md |
| import | lg | max-w-2xl |
| print | lg | max-w-2xl |

### 4.2 弹窗关闭方式

- 点击遮罩层关闭
- 点击右上角 X 关闭
- 按 ESC 键关闭
- 取消/关闭按钮
- 提交成功后自动关闭

---

## 五、批量操作

### 5.1 触发条件

表格多选框选中 >= 1 项时，顶部显示批量操作栏。

### 5.2 批量操作按钮

| 操作 | 行为 | 成功提示 |
|------|------|---------|
| 导出 | toast.info | "正在导出 N 条入库记录..." |
| 打印 | 打开 print 弹窗 | - |
| 取消选择 | 清空选中集 | - |

### 5.3 选择逻辑

```
全选按钮: 当前页全选/全不选
半选状态: indeterminate = 部分选中
行选择: 点击行内checkbox，行高亮 bg-blue-50
跨页选择: 不支持（分页切换不保留选中状态）
```

---

## 六、筛选与搜索

### 6.1 快速筛选（Quick Filter）

| 标签 | 筛选条件 |
|------|---------|
| 全部 | 无 |
| 今日 | `createdAt.startsWith(今天)` |
| 本周 | `createdAt >= 本周一` |
| 本月 | `createdAt >= 本月1日` |

切换快速筛选时：`page` 重置为 1。

### 6.2 筛选栏

| 控件 | 字段 | 类型 |
|------|------|------|
| 搜索框 | searchKeyword | text，placeholder: "搜索入库单号/耗材名称/批号..." |
| 耗材 | filterMaterial | select，选项来自 materials API |
| 状态 | filterStatus | select：全部/已完成/部分到货/已取消 |
| 来源 | filterType | select：全部来源/采购/退库/直接/调拨 |
| 开始日期 | filterStartDate | date input |
| 结束日期 | filterEndDate | date input，后端拼接 `T23:59:59` |

筛选联动规则：
- 统计卡片点击 → 设置对应 filterStatus
- 任何筛选变化 → `page` 重置为 1

---

## 七、加载与空状态

### 7.1 表格加载

```
状态: loading = true
显示: 居中 spinning + "加载中..."
列数: 11列合并（colSpan={11}）
```

### 7.2 空状态

```
条件: !loading && paginatedData.length === 0
显示: "暂无数据"
列数: 11列合并
```

### 7.3 提交加载

```
按钮: "确认入库" → "提交中..."
状态: disabled + opacity-50
弹窗: 不可关闭
```

---

## 八、错误处理

| 场景 | 处理方式 | Toast提示 |
|------|---------|----------|
| 获取列表失败 | console.error + toast | "获取数据失败" |
| 获取引用数据失败 | console.error（静默） | 无 |
| 获取采购订单失败 | 设为空数组 | 无 |
| 表单提交失败 | toast + 保持弹窗 | "创建失败" / "更新失败" |
| 删除失败 | toast | "删除失败" |
| 更新采购订单数量失败 | toast.info | "入库成功，但更新采购订单失败" |

### 8.1 表单提交流程

```
1. 防重复: if (submitting) return
2. 校验: materialId && quantity > 0
   └─ 不通过 → toast.error("请选择耗材并输入数量")，return
3. transfer校验: fromLocationId || fromLocationName
   └─ 不通过 → toast.error("请选择或输入来源库位")，return
4. setSubmitting(true)
5. API调用
6. 成功 → toast.success + closeModal + fetchData()
7. 失败 → toast.error + 保持弹窗
8. finally → setSubmitting(false)
```

---

## 九、数据流

```
页面加载
    │
    ├─→ fetchData() → inboundApi.getList({ page, pageSize })
    │                 → setData(res.list)
    │                 → setTotal(res.pagination.total)
    │
    └─→ fetchPurchaseOrders() → purchaseOrderApi.getList({ status: 'pending' })
                              → setPurchaseOrders(res.data.list)

打开 create/edit
    │
    ├─→ fetchRefs() → Promise.all([materials, suppliers, locations])
    │
    └─→ setForm(initialValues)

提交
    │
    ├─→ edit → inboundApi.update(id, { ... })
    ├─→ transfer → inboundApi.createTransfer({ ... })
    └─→ other → inboundApi.create(form)
                └─ 有 selectedOrderId → purchaseOrderApi.receive(orderId, { quantity })

删除
    └─→ confirm() → inboundApi.delete(id) → fetchData()
```

---

## 十、采购订单部分入库

### 10.1 业务定义

采购订单部分入库指：一个采购订单可以分多次收货，每次只入库订单数量的一部分，系统自动累计已收货数量并更新订单状态。

### 10.2 数据模型

**采购订单表 (`purchase_orders`)：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `ordered_qty` | DECIMAL | 订单采购数量 |
| `received_qty` | DECIMAL | 已收货数量（累计） |
| `status` | TEXT | `pending` → `partial` → `completed` |

**计算字段（API返回）：**
```
remainingQty = ordered_qty - received_qty
```

### 10.3 状态流转

```
创建订单 (ordered_qty=100, received_qty=0)
    │
    ▼
status = 'pending'
    │
    ├─→ 第一次入库 20
    │     received_qty = 20
    │     status = 'partial'
    │
    ├─→ 第二次入库 30
    │     received_qty = 50
    │     status = 'partial'
    │
    └─→ 第三次入库 50
          received_qty = 100
          status = 'completed'
```

### 10.4 当前已实现的后端支持

| 能力 | 状态 | 说明 |
|------|------|------|
| 数据库字段 | ✅ | `ordered_qty`, `received_qty` |
| 累加收货API | ✅ | `PUT /purchase-orders/:id/receive` |
| 超收校验 | ✅ | `newReceived > orderedQty` 返回 400 |
| 自动状态更新 | ✅ | `partial` / `completed` |
| 入库关联采购订单 | ✅ | 创建入库时传 `purchaseOrderId` |
| 删除回退收货量 | ✅ | 删除入库记录时扣减 `received_qty` |
| 返回剩余数量 | ✅ | `remainingQty` 字段 |

### 10.5 前端已有的部分入库流程（路径A）

```
点击"新增入库"
    │
    ▼
选择 type = 'purchase'
    │
    ▼
选择采购订单下拉（仅显示 status='pending' 的订单）
    │  显示格式: 订单号 · 耗材名 · 待入: remainingQty + unit
    ▼
自动填充: supplierId, materialId, price, quantity
    │
    ▼
修改数量（可输入小于订单数量的值）
    │
    ▼
提交 → inboundApi.create(form)
    │     → 成功 → purchaseOrderApi.receive(orderId, { quantity })
    │     → 自动更新采购订单 received_qty 和 status
    │
    ▼
toast: "入库成功，已更新采购订单收货数量"
```

**当前问题：**
- 选择采购订单后，表单中的数量被自动填充为订单的 `remainingQty`，但用户可以修改
- 没有校验用户输入的数量是否超过 `remainingQty`（后端会校验，但前端无即时提示）
- 采购订单下拉仅显示 `status='pending'` 的订单，`partial` 状态的订单不会显示（也应可入库）

### 10.6 前端缺失的部分入库流程（路径B）

表格中 `pending` 状态的行会显示"确认入库"按钮，但点击后打开的确认入库弹窗当前为**演示状态**：

| 问题 | 现状 |
|------|------|
| 本次入库数量 | 使用 `defaultValue`，未绑定 state |
| 入库后处理 | radio 选项无实际作用 |
| 提交逻辑 | `handleConfirmInbound` 仅 toast + closeModal，未调 API |
| 数据准确性 | "已到货数量"和"恢复后库存"都是硬编码计算 |

### 10.7 修复建议

#### 优先级 P0：路径A完善

1. **采购订单下拉筛选条件**：将 `status: 'pending'` 改为 `status: 'pending,partial'`（或去掉 status 筛选，后端支持多状态）
2. **前端数量校验**：选择采购订单后，数量输入框添加 `max={remainingQty}` 校验
3. **显示剩余待入库**：选择采购订单后，在数量字段旁显示 "剩余待入: X 单位"

#### 优先级 P1：路径B实现

1. **确认入库弹窗绑定 state**：将"本次入库数量"绑定到 state
2. **调用入库 API**：`handleConfirmInbound` 实际调用 `inboundApi.create` 或更新已有入库记录
3. **关联采购订单自动更新**：入库成功后调用 `purchaseOrderApi.receive`
4. **移除硬编码数据**：从后端获取实际的已到货数量和剩余数量

#### 优先级 P2：采购订单视角

1. **采购订单独立页面**（或整合到入库页面标签页）
2. 显示每个订单的 `ordered_qty / received_qty / remainingQty`
3. 从订单直接触发入库操作

---

## 十一、已知问题

1. **确认入库弹窗**：表单中的"本次入库数量"使用 `defaultValue`，未绑定到 state，实际不会参与提交逻辑（`handleConfirmInbound` 只是 toast + closeModal，未调用 API）。
2. **恢复入库弹窗**：`selectedRecord.quantity + 400` 是硬编码演示数据。
3. **扫码入库**：点击区域模拟扫码，固定返回 "DNA提取试剂盒"。
4. **批量导入**：点击"开始导入"模拟成功，固定返回 50 条。
5. **打印预览**：操作人固定为 "张医生"。
6. **查询按钮**：`onClick={() => {}}` 为空函数，筛选通过 onChange 实时生效。
7. **分页逻辑**：前端分页（`filteredData.slice`），非后端分页。
8. **pending 判断**：`row.quantity > 1000` 为演示逻辑。
9. **采购订单下拉**：仅显示 `status='pending'` 的订单，`partial` 状态订单无法继续入库。
