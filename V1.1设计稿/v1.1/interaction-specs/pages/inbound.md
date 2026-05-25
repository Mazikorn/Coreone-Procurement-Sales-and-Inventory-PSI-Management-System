# 入库记录交互规范

> **页面**: [前端代码/src/pages/inbound/Inbound.tsx](../../../前端代码/src/pages/inbound/Inbound.tsx)  
> **路由**: `/inbound`  
> **权限**: admin / warehouse_manager / procurement  
> **引用**: [交互规范总纲](../交互规范总纲.md)

---

## 快捷操作

### IN-01: 新增入库

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement |
| **触发** | 点击"+新增入库"按钮 |
| **当前状态** | ✅ 可用 |

**交互步骤**:
1. 点击按钮 → 打开 create 弹窗（size=xl）
2. 表单字段：来源/耗材/批号/数量/单价/库位/日期/供应商/备注
3. 点击"确认入库" → 校验 → 调 `POST /inbound` → 成功关闭弹窗+刷新列表

**验收标准**:
- [ ] 弹窗正确打开，无数据残留
- [ ] 必填字段（耗材、数量、库位）未填时阻止提交
- [ ] 提交成功后 toast"入库成功"，列表刷新

---

### IN-02: 扫码入库

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement |
| **触发** | 点击"扫码入库"按钮 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 点击按钮 → 打开 scan 弹窗（size=md）
2. 弹窗显示摄像头扫描区域（或扫码枪输入框）
3. 识别条码 → 调 `GET /materials/barcode/:code` 查询耗材
4. 识别成功 → 自动填充耗材 → 关闭 scan → 打开 create 弹窗（预填充）
5. 识别失败 → toast"未识别该条码，请手动输入"
6. 点击"手动输入" → 关闭 scan → 打开 create 弹窗

**API定义**:
```
GET /api/v1/materials/barcode/:code
Response: { id, name, spec, unit, supplierId }
```

**修复方案**:
- 接入 `navigator.mediaDevices.getUserMedia` 摄像头 API
- 或支持扫码枪输入（监听 input focus + 快速输入事件）
- 后端新增 barcode 查询接口（或在 materials 表增加 barcode 字段）

**验收标准**:
- [ ] 能扫描真实条码并识别耗材
- [ ] 识别后自动跳转到 create 弹窗并预填充
- [ ] 失败时有 fallback 手动输入

---

### IN-03: 批量导入

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement |
| **触发** | 点击"批量导入"按钮 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 点击按钮 → 打开 import 弹窗（size=lg）
2. 显示拖拽上传区域，支持 .xlsx / .csv
3. 上传文件 → 前端解析 → 逐条校验
4. 校验通过 → 显示"成功 X 条，失败 Y 条"预览
5. 点击"开始导入" → 调 `POST /inbound/batch` → 成功后关闭弹窗+刷新列表

**校验规则**:
- 耗材编码必须存在
- 批号非空
- 数量 > 0
- 有效期格式 YYYY-MM-DD

**修复方案**:
- 前端集成 xlsx 库解析文件
- 后端新增 `POST /inbound/batch` 批量创建接口（事务保护）

**验收标准**:
- [ ] 能上传真实 Excel 文件
- [ ] 解析后显示校验结果
- [ ] 导入成功后列表刷新

---

### IN-04: 打印记录

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement, admin |
| **触发** | 点击"打印记录"按钮 |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 点击按钮 → 打开 print 弹窗（size=lg）
2. 弹窗显示打印预览表格
3. 打印单包含：操作人（当前登录用户）、生成时间、入库记录列表
4. 点击"打印" → `window.print()`

**修复方案**:
- 从 JWT payload 或 localStorage 获取当前用户名
- 打印样式使用 `@media print` 隐藏不需要的元素

**验收标准**:
- [ ] 打印单显示真实操作人
- [ ] 打印单显示当前时间
- [ ] 打印内容格式正确

---

## 统计卡片

### IN-05~08: 查看统计卡片

| 属性 | 内容 |
|:---|:---|
| **角色** | 全部授权角色 |
| **触发** | 进入页面 |
| **当前状态** | ⚠️ 有缺陷 |

**缺陷**: 统计卡片使用 `|| 156` 等硬编码 fallback

**规范定义**:
- 数字必须来自后端 API 或前端真实计算
- 无数据时显示 `0` 或 `-`，不使用硬编码数字
- 点击卡片可筛选对应状态

**修复方案**:
- 移除所有 `|| 默认值` 的硬编码
- 后端提供 `GET /inbound/stats` 接口
- 或前端从已有数据中真实计算

**验收标准**:
- [ ] 无硬编码 fallback
- [ ] 空数据时显示合理值

---

## 快速筛选

### IN-10~13: 快速筛选标签

| 属性 | 内容 |
|:---|:---|
| **角色** | 全部授权角色 |
| **触发** | 点击标签（全部/今日/本周/本月） |
| **当前状态** | ⚠️ 有缺陷 |

**缺陷**: 筛选生效，但 URL 不同步 + 前端分页

**规范定义**:
1. 点击标签 → 高亮当前标签，更新 URL `?quick=all|today|week|month`
2. 表格按日期范围筛选
3. 分页重置到第 1 页

**验收标准**（引用总纲 2.2）:
- [ ] URL 同步
- [ ] 筛选后重置分页

---

## 筛选栏

### IN-14~19: 筛选栏操作

| 属性 | 内容 |
|:---|:---|
| **角色** | 全部授权角色 |
| **触发** | 输入/选择筛选条件 |
| **当前状态** | ⚠️ 有缺陷 |

**缺陷汇总**:
- IN-16 状态筛选：pending 判断为 `quantity > 1000` 演示逻辑
- IN-19 查询按钮：为空函数（虽然 onChange 已生效，但按钮冗余）
- 全部筛选：URL 不同步

**规范定义**:
1. 搜索框实时搜索（debounce 300ms）
2. 下拉筛选 onChange 实时生效
3. 日期范围选择后需点击"查询"按钮生效（或 onChange 生效但按钮保留用于显式触发）
4. "查询"按钮：如筛选已实时生效，则移除按钮；如需显式触发，则按钮有效
5. "重置"按钮：清空所有筛选条件 + URL query

**修复方案**:
- 移除无效的"查询"按钮（如筛选已实时生效）
- 后端入库记录真实支持 `pending` 状态
- 前端 `getRecordStatus` 去掉 `quantity > 1000` 演示逻辑

**验收标准**（引用总纲 2.2）:
- [ ] URL 同步
- [ ] 重置清空所有条件

---

## 表格操作

### IN-22: 查看入库详情

| 属性 | 内容 |
|:---|:---|
| **角色** | 全部授权角色 |
| **触发** | 点击"详情" |
| **当前状态** | ✅ 可用 |

**验收标准**:
- [ ] 弹窗显示完整信息（单号/耗材/批号/来源/数量/金额/供应商/时间/状态/备注）
- [ ] 数据与表格行一致

---

### IN-23: 编辑入库记录

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement, admin |
| **触发** | 点击"编辑" |
| **当前状态** | ✅ 可用 |

**验收标准**:
- [ ] 弹窗预填充当前数据
- [ ] 可修改字段：批号/数量/单价/库位/日期/供应商/备注
- [ ] 提交后更新成功，列表刷新

---

### IN-24: 删除入库记录

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement, admin |
| **触发** | 点击"删除" |
| **当前状态** | ⚠️ 有缺陷 |

**缺陷**: 使用原生 `confirm()`，未调用 `checkDeletable`

**规范定义**（引用总纲 2.5）:
1. 点击"删除" → 调 `GET /inbound/:id/check-deletable`
2. 打开自定义确认弹窗
3. 弹窗显示：
   - 入库单号、耗材名称、数量
   - 删除影响（如"该批次已有出库记录 10 盒"）
   - 若不可删除：显示原因，"删除"按钮 disabled
4. 点击"确认删除" → 调 `DELETE /inbound/:id` → 成功 toast + 刷新

**修复方案**:
- 创建通用 `DeleteConfirmModal` 组件
- 删除前调用 checkDeletable API

**验收标准**（引用总纲 2.5）:
- [ ] 自定义确认弹窗（非原生 confirm）
- [ ] 展示删除影响
- [ ] 不可删除时禁用按钮

---

### IN-25: 确认部分到货入库

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager |
| **触发** | 表格行状态为 pending 时，点击"确认入库" |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 点击"确认入库" → 打开 confirm 弹窗（size=md）
2. 弹窗显示：
   - 入库单号、耗材名称
   - 订单数量、已到货数量、剩余待入量
   - 输入框："本次入库数量"（`type=number`, `max=remainingQty`, 默认=remainingQty）
   - 单选："保持订单" / "完成订单"
3. 数量输入超过 `remainingQty` 时红色提示
4. 点击"确认入库" → 调 `POST /inbound`（quantity=本次数量, type=purchase）→ 成功调 `PUT /purchase-orders/:id/receive`
5. toast"入库成功，已更新采购订单"

**API调用**:
```
POST /api/v1/inbound
Body: { type: "purchase", materialId, quantity, ... }

PUT /api/v1/purchase-orders/:id/receive
Body: { quantity }
```

**修复方案**:
- confirm 弹窗绑定 quantity state（useState）
- handleConfirmInbound 实际调用 inboundApi.create + purchaseOrderApi.receive
- 后端入库记录支持 `pending` 真实状态

**验收标准**:
- [ ] 弹窗显示真实订单信息
- [ ] 数量输入有上限校验
- [ ] 提交后创建入库记录 + 更新采购订单

---

### IN-26: 恢复已取消入库

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, admin |
| **触发** | 表格行状态为 cancelled 时，点击"恢复" |
| **当前状态** | ❌ 缺失 |

**缺陷**: 恢复后库存显示 `selectedRecord.quantity + 400`（硬编码）

**规范定义**:
1. 点击"恢复" → 打开 restore 弹窗（size=md）
2. 弹窗显示：
   - 入库单号、耗材名称、入库数量
   - 当前库存（从 API 获取）
   - 恢复后库存 = 当前库存 + 入库数量
3. 点击"确认恢复" → 调 `POST /inbound/:id/restore` → 成功后刷新

**修复方案**:
- 调 `GET /inventory/:materialId` 获取当前库存
- 恢复后库存 = 当前库存 + 入库数量（真实计算）

**验收标准**:
- [ ] 显示当前真实库存
- [ ] 恢复后库存为真实计算值
- [ ] 提交后刷新列表

---

### IN-27: 打印单条入库记录

| 属性 | 内容 |
|:---|:---|
| **角色** | 全部授权角色 |
| **触发** | 点击操作列"打印" |
| **当前状态** | ❌ 缺失 |

**缺陷**: 操作人固定为"张医生"

**规范定义**（引用总纲 2.7）:
1. 点击"打印" → 打开 print 弹窗（size=lg）
2. 打印单显示：
   - 标题"入库单"
   - 生成时间：当前时间
   - 操作人：当前登录用户（从 JWT 或 localStorage 获取）
   - 该条入库记录完整信息
3. 点击"打印" → `window.print()`

**修复方案**:
- `const operator = JSON.parse(localStorage.getItem('user'))?.name || 'system'`

**验收标准**（引用总纲 2.7）:
- [ ] 操作人为当前登录用户
- [ ] 时间为当前时间

---

## 批量操作

### IN-28: 批量导出

| 属性 | 内容 |
|:---|:---|
| **角色** | 全部授权角色 |
| **触发** | 选中行后点击"导出" |
| **当前状态** | ❌ 缺失 |

**缺陷**: 仅 toast"正在导出"，无真实文件下载

**规范定义**（引用总纲 2.6）:
1. 选中行 → 点击"导出" → 调 `POST /inbound/export`
2. 参数：选中记录的 ID 列表 + 当前筛选条件
3. 后端生成 Excel → 返回文件流
4. 前端触发文件下载

**修复方案**:
- 后端新增 `POST /inbound/export` 接口
- 前端使用 `Blob` + `URL.createObjectURL` 触发下载

**验收标准**（引用总纲 2.6）:
- [ ] 下载真实文件
- [ ] 文件名包含日期
- [ ] 内容为当前筛选结果

---

### IN-29: 批量打印

| 属性 | 内容 |
|:---|:---|
| **角色** | 全部授权角色 |
| **触发** | 选中行后点击"打印" |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 选中行 → 点击"打印" → 打开 print 弹窗
2. 打印预览显示所有选中记录
3. 操作人为当前登录用户

**修复方案**:
- 同 IN-27

---

## 分页

### IN-31~33: 分页操作

| 属性 | 内容 |
|:---|:---|
| **角色** | 全部授权角色 |
| **触发** | 点击页码/上一页/下一页 |
| **当前状态** | ⚠️ 有缺陷 |

**缺陷**: 前端 `filteredData.slice`

**规范定义**（引用总纲 2.3）:
1. 分页参数传给后端：`GET /inbound?page=2&pageSize=20`
2. 后端返回 `{ list, pagination: { total, page, pageSize } }`
3. 切换页码时 URL 同步：`?page=2`

**修复方案**:
- 后端 `GET /inbound` 已支持分页参数，但前端未传递
- 前端修改 `fetchData` 传递 `page`/`pageSize`
- 封装通用分页 hook

**验收标准**（引用总纲 2.3）:
- [ ] 分页参数传给后端
- [ ] 显示"共 X 条"
- [ ] URL 同步

---

## 新增/编辑弹窗

### IN-34: 选择入库来源

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement |
| **触发** | create 弹窗内下拉选择 |
| **当前状态** | ✅ 可用 |

---

### IN-35: 选择采购订单

| 属性 | 内容 |
|:---|:---|
| **角色** | procurement |
| **触发** | 来源=purchase 时显示下拉 |
| **当前状态** | ⚠️ 有缺陷 |

**缺陷**: 仅显示 `status='pending'`，`partial` 不显示

**规范定义**:
1. 来源=purchase 时显示采购订单下拉
2. 下拉查询条件：`status IN ('pending', 'partial')`
3. 显示格式：`订单号 · 耗材名 · 待入: remainingQty unit`
4. 空时显示"暂无待入库订单"

**修复方案**:
```typescript
// Inbound.tsx ~376行
const res = await purchaseOrderApi.getList({ pageSize: 100 })
// 去掉 status: 'pending'，或改为 status: 'pending,partial'
```

**验收标准**:
- [ ] partial 订单显示在下拉中
- [ ] 显示 remainingQty

---

### IN-36: 自动填充采购订单信息

| 属性 | 内容 |
|:---|:---|
| **角色** | procurement |
| **触发** | 选择采购订单后 |
| **当前状态** | ✅ 可用 |

**验收标准**:
- [ ] 自动填充 supplierId, materialId, price, quantity

---

### IN-37: 输入入库数量

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement |
| **触发** | 输入数量 |
| **当前状态** | ⚠️ 有缺陷 |

**缺陷**: 无 `remainingQty` 上限校验

**规范定义**:
1. 输入框 `type=number`, `step=0.01`, `min=0.01`
2. 选择采购订单后：
   - 输入框旁显示 `"剩余待入: ${remainingQty} ${unit}"`
   - `max={remainingQty}`
3. 输入 > remainingQty 时：
   - 输入框边框变红
   - 显示 `"超过剩余待入量 ${remainingQty}"`
   - 提交按钮 disabled

**修复方案**:
```typescript
// 选择采购订单后
const order = purchaseOrders.find(o => o.id === selectedOrderId);
const remainingQty = order?.remainingQty || 0;

// 数量输入框
<input
  type="number"
  max={remainingQty}
  value={form.quantity}
  onChange={e => setForm({ ...form, quantity: Number(e.target.value) })}
  className={cn(form.quantity > remainingQty && 'border-red-500')}
/>
{form.quantity > remainingQty && (
  <span className="text-red-500 text-xs">超过剩余待入量 {remainingQty}</span>
)}
```

**验收标准**:
- [ ] 显示剩余待入量
- [ ] 超量时前端阻止提交

---

### IN-38~44: 表单其他字段

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement |
| **触发** | 填写表单 |
| **当前状态** | ✅ 可用 |

**字段清单**:
- IN-38 目标库位：必填，下拉选择
- IN-39 批号：可选，文本输入
- IN-40 规格单价：可选，number ≥ 0
- IN-41 生产日期：可选，date input
- IN-42 有效期：可选，date input，必须 ≥ 生产日期
- IN-43 供应商：可选，下拉选择
- IN-44 备注：可选，textarea

**验收标准**:
- [ ] 有效期必须晚于生产日期（如有）

---

### IN-45: 调拨来源库位

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager |
| **触发** | 来源=transfer 时显示 |
| **当前状态** | ✅ 可用 |

---

### IN-46: 提交入库表单

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement |
| **触发** | 点击"确认入库" |
| **当前状态** | ⚠️ 有缺陷 |

**缺陷**: 选择采购订单后超量无前端校验，后端返回 400 体验差

**规范定义**:
1. 防重复提交：`if (submitting) return`
2. 前端校验：
   - materialId 非空
   - quantity > 0
   - quantity ≤ remainingQty（如有采购订单）
   - locationId 非空
3. 调拨时：fromLocationId 或 fromLocationName 非空
4. 提交中：按钮 disabled + "提交中..."
5. 成功后：toast + closeModal + fetchData()
6. 失败后：toast 显示具体错误 + 保持弹窗

**验收标准**（引用总纲 2.8）:
- [ ] 前端校验完整
- [ ] 提交中防重
- [ ] 错误提示具体

---

### IN-47~52: 编辑字段

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement, admin |
| **触发** | edit 弹窗内修改 |
| **当前状态** | ✅ 可用 |

**可编辑字段**:
- 批号、数量、单价、供应商、库位、生产日期、有效期、备注

**验收标准**:
- [ ] 提交后更新成功

---

## 确认入库弹窗（IN-53~56）

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager |
| **触发** | 表格行 pending 状态，点击"确认入库" |
| **当前状态** | ❌ 缺失 |

**规范定义**:
1. 弹窗绑定 quantity state（useState，非 defaultValue）
2. 显示真实订单信息（从后端获取）
3. 调 `POST /inbound` 创建入库记录
4. 调 `PUT /purchase-orders/:id/receive` 更新收货量

**修复方案**:
```typescript
const [confirmQty, setConfirmQty] = useState(0);

const handleConfirmInbound = async () => {
  if (!confirmQty || confirmQty <= 0) {
    toast.error('请输入入库数量');
    return;
  }
  // 创建入库记录
  await inboundApi.create({
    type: 'purchase',
    materialId: selectedRecord.materialId,
    quantity: confirmQty,
    ...
  });
  // 更新采购订单
  await purchaseOrderApi.receive(selectedRecord.purchaseOrderId, {
    quantity: confirmQty
  });
  toast.success('入库成功');
  closeModal();
  fetchData();
};
```

**验收标准**:
- [ ] 数量绑定 state
- [ ] 调真实 API
- [ ] 成功后刷新列表

---

## 恢复弹窗（IN-57~59）

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, admin |
| **触发** | 表格行 cancelled 状态，点击"恢复" |
| **当前状态** | ❌ 缺失 |

**缺陷**: 恢复后库存 `+400` 硬编码

**规范定义**:
1. 弹窗显示：
   - 耗材名称、入库数量
   - 当前库存（从 API 获取）
   - 恢复后库存 = 当前库存 + 入库数量
2. 点击"确认恢复" → 调 `POST /inbound/:id/restore`

**修复方案**:
- 调 `GET /inventory/:materialId` 获取当前库存
- 恢复后库存 = 当前库存 + 入库数量

---

## 扫码弹窗（IN-60~62）

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement |
| **触发** | 点击扫码区域或"手动输入" |
| **当前状态** | ❌ 缺失 |

**规范定义**: 同 IN-02

---

## 批量导入弹窗（IN-63~65）

| 属性 | 内容 |
|:---|:---|
| **角色** | warehouse_manager, procurement |
| **触发** | 上传文件/下载模板/开始导入 |
| **当前状态** | ❌ 缺失 |

**规范定义**: 同 IN-03

---

## 打印预览弹窗（IN-66~69）

| 属性 | 内容 |
|:---|:---|
| **角色** | 全部授权角色 |
| **触发** | 打开打印弹窗 |
| **当前状态** | ❌ 缺失 |

**缺陷**: 操作人固定为"张医生"

**规范定义**（引用总纲 2.7）:
1. 操作人 = 当前登录用户（从 JWT 或 localStorage 获取）
2. 生成时间 = 当前系统时间
3. 打印内容 = 选中记录或全部记录

**修复方案**:
```typescript
const user = JSON.parse(localStorage.getItem('user') || '{}');
const operator = user?.name || user?.username || 'system';
```

---

## 详情弹窗（IN-70~78）

| 属性 | 内容 |
|:---|:---|
| **角色** | 全部授权角色 |
| **触发** | 点击"详情" |
| **当前状态** | ✅ 可用 |

**展示字段**:
- IN-70 入库单号
- IN-71 状态标签
- IN-72 物料名称/编码/批号
- IN-73 数量/单价/金额
- IN-74 供应商
- IN-75 生产日期/有效期/入库时间
- IN-76 操作人
- IN-77 备注
- IN-78 详情内打印

**验收标准**:
- [ ] 所有字段完整显示
- [ ] 空字段显示 `-` 而非空白
- [ ] 金额格式化（¥X,XXX.XX）
- [ ] 时间格式化（YYYY/MM/DD HH:mm）

---

## 入库页面修复汇总

| 优先级 | 场景 | 问题 | 工时 |
|:---|:---|:---|:---:|
| P0 | IN-35 | partial 订单不显示 | 1h |
| P0 | IN-37 | 数量无 remainingQty 校验 | 2h |
| P1 | IN-25 | 确认入库弹窗空壳 | 4h |
| P1 | IN-26 | 恢复入库硬编码 | 2h |
| P1 | IN-02,60~62 | 扫码入库模拟 | 4h |
| P1 | IN-03,63~65 | 批量导入模拟 | 4h |
| P2 | IN-04,66~69 | 打印操作人固定 | 2h |
| P2 | IN-24 | 删除用原生 confirm | 2h |
| P2 | IN-28 | 批量导出模拟 | 3h |
| P2 | IN-31~33 | 前端分页 | 4h |
| P2 | IN-05~08 | 统计卡片硬编码 | 2h |
| P2 | IN-16 | pending 演示逻辑 | 2h |

---

*本规范引用 [交互规范总纲](../交互规范总纲.md) 的共性标准。*
