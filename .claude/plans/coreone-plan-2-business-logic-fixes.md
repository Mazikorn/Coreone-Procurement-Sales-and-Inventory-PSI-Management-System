# Plan 2: 业务逻辑修复 — 详细实施计划

> **优先级**: P0（紧急修复）
> **预估工时**: 16h
> **问题来源**: 产品视角 + 用户视角 + 设计交互视角审查
> **PM-QA-001 审查**: ✅ 已通过第一层+第二层+第三层防御

---

## 一、VibeContract（功能契约）

### 业务意图
作为**病理科主任/仓库管理员**，我希望**业务流程完整闭环、数据准确**，以便**系统能支撑日常进销存管理，不会出现数据丢失或误导**。

### 数据契约

| 字段 | 类型 | 来源 | 约束 | 示例 |
|------|------|------|------|------|
| skippedItems | Array | BOM出库响应 | 可为空数组 | [{materialId, materialName, reason}] |
| cancel_reason | TEXT | 出库取消 | 可为空 | "操作失误" |
| cancel_remark | TEXT | 出库取消 | 可为空 | "重复录入" |
| operator | TEXT | req.user.username | 非空 | "admin" |
| timeRange | string | 动态生成 | 格式 YYYY/YYYYqN | "2026q2" |

### 边界契约

| # | 边界场景 | 预期行为 | 风险等级 |
|---|---------|---------|---------|
| 1 | BOM出库部分物料库存不足 | 返回 skippedItems，主物料正常出库 | High |
| 2 | 出库取消原因为空 | 允许，cancel_reason 为 null | Low |
| 3 | 退库记录的 operator 被前端篡改 | 忽略前端值，使用 req.user.username | High |
| 4 | CostAnalysis 当前年份无数据 | 显示空状态，不显示假数据 | Medium |
| 5 | SupplierReturns 两个采购订单下拉框 | 只保留一个，删除重复 | Medium |
| 6 | 报表退库成本跨月统计 | 按原始出库时间统计退库成本 | High |

### 异常契约

| 场景 | 状态码 | 错误消息 | 处理方式 |
|------|--------|---------|---------|
| BOM出库全部物料库存不足 | 200 | skippedItems 包含所有物料 | 正常返回，前端提示 |
| 出库取消记录不存在 | 404 | "出库记录不存在" | 直接返回 |
| 后端错误消息语言 | 统一中文 | "库存不足" 而非 "Insufficient stock" | 统一替换 |

### 验收标准（测试必须覆盖）

- [ ] **BOM出库**: 库存不足的物料出现在 skippedItems 中
- [ ] **出库取消**: 取消原因正确保存到数据库
- [ ] **退库operator**: 记录的 operator 是当前登录用户（非前端传入）
- [ ] **CostAnalysis**: 时间选项基于当前年份动态生成
- [ ] **SupplierReturns**: 表单只有一个"关联采购订单"字段
- [ ] **报表退库成本**: 按原始出库时间统计

---

## 二、对抗性提示

### 边界 1: BOM出库 skippedItems 丢失

**场景**: BOM 有 5 种物料，其中 2 种库存不足。出库成功但 skippedItems 未返回。
**风险**: 用户以为全部出库成功，实际缺少试剂。
**测试用例**:
```typescript
it('BOM出库部分物料库存不足时返回skippedItems', async () => {
  // 准备：BOM 有 3 种物料，其中 1 种库存为 0
  const res = await request(app).post('/api/v1/outbound/bom').send({...})
  expect(res.status).toBe(201)
  expect(res.body.data.skippedItems).toHaveLength(1)
  expect(res.body.data.skippedItems[0].materialName).toBe('测试物料B')
})
```

### 边界 2: 出库取消原因丢失

**场景**: 用户填写取消原因后点击确认，但原因未保存到数据库。
**风险**: 审计追溯时无法找到取消原因。
**测试用例**:
```typescript
it('出库取消原因正确保存', async () => {
  const res = await request(app)
    .delete(`/api/v1/outbound/${id}`)
    .send({ reason: '操作失误', remark: '重复录入' })
  expect(res.status).toBe(200)
  // 验证数据库
  const record = db.prepare('SELECT cancel_reason FROM outbound_records WHERE id = ?').get(id)
  expect(record.cancel_reason).toBe('操作失误')
})
```

### 边界 3: CostAnalysis 时间硬编码

**场景**: 当前是 2026 年，但时间选项只显示 2024/2023 年。
**风险**: 用户无法查看当前年份的报表数据。
**测试用例**:
```typescript
it('CostAnalysis时间选项包含当前年份', async () => {
  // 渲染 CostAnalysis 组件
  // 验证下拉框包含 2026 年选项
  const currentYear = new Date().getFullYear().toString()
  expect(page.getByText(`${currentYear}年全年`)).toBeVisible()
})
```

### 契约遗漏检查

| 可能遗漏 | 状态 | 说明 |
|---------|------|------|
| BOM出库全部失败时是否应该回滚 | ⚠️ 需确认 | 当前行为是主物料出库成功、扩展配额跳过 |
| 出库取消是否需要权限提升 | ✅ 已确认 | app.ts 已有 requireRole 中间件 |
| 报表退库成本时间对齐是否有性能影响 | ⚠️ 需确认 | 需要 JOIN 出库记录，可能增加查询时间 |

---

## 三、Red-Green-Refactor 要求

### 执行顺序

| Step | 操作 | 预期结果 |
|------|------|---------|
| 1 | 写集成测试用例（使用 `node:sqlite` DatabaseSync `:memory:`） | 测试失败（功能缺失） |
| 2 | 运行测试，提供失败日志 | 确认失败原因是"功能缺失" |
| 3 | 写最小实现使测试通过 | 测试通过 |
| 4 | 运行全量测试 | 无回归 |
| 5 | 添加边界/异常测试 | 全部通过 |

**禁止**：跳过 Step 1-2 直接写实现、使用 Mock 数据库、使用宽松断言

---

## 四、测试要求

### 集成测试文件

**新增文件**: `后端代码/server/tests/integration/business-logic-fixes.test.ts`

### 测试用例清单（先写，预期失败）

```typescript
describe('业务逻辑修复', () => {
  describe('任务 2.1: BOM出库skippedItems', () => {
    it('部分物料库存不足时返回skippedItems', async () => {})
    it('全部物料库存充足时skippedItems为空', async () => {})
    it('全部物料库存不足时skippedItems包含所有物料', async () => {})
  })

  describe('任务 2.2: 出库取消原因', () => {
    it('取消原因和备注正确保存', async () => {})
    it('取消原因为空时cancel_reason为null', async () => {})
  })

  describe('任务 2.3-2.4: operator来源', () => {
    it('退库operator从认证用户获取', async () => {})
    it('调拨撤销operator从认证用户获取', async () => {})
  })

  describe('任务 2.5: CostAnalysis时间', () => {
    it('时间选项包含当前年份', async () => {})
    it('季度选项不超过当前季度', async () => {})
  })

  describe('任务 2.6: SupplierReturns字段', () => {
    it('表单只有一个关联采购订单字段', async () => {})
  })

  describe('任务 2.7: 报表退库成本时间', () => {
    it('退库成本按原始出库时间统计', async () => {})
    it('跨月退库在正确月份扣减', async () => {})
  })
})
```

---

## 四、任务清单

### 任务 2.1: 修复 BOM 出库静默跳过问题

**文件**: `后端代码/server/src/routes/outbound-v1.1.ts` (POST /bom)

**改动内容**:

```typescript
const skippedItems: Array<{ materialId: string; materialName: string; reason: string }> = []

// catch 块改为收集
} catch (e: any) {
  skippedItems.push({
    materialId: gr.material_id,
    materialName: gr.material_name,
    reason: e.message,
  })
}

// 响应中增加
success(res, { id: outboundId, outboundNo, ..., skippedItems })
```

**验收标准**:
- [ ] 出库响应包含 skippedItems
- [ ] 集成测试通过

---

### 任务 2.2: 修复出库取消原因丢失

**前端**: `前端代码/src/pages/outbound/Outbound.tsx` — handleCancel 传递 reason 和 remark
**后端**: `后端代码/server/src/routes/outbound-v1.1.ts` — DELETE /:id 接收并保存 reason/remark

**验收标准**:
- [ ] 取消原因正确保存到数据库
- [ ] 集成测试通过

---

### 任务 2.3: 修复退库 operator 来源

**文件**: `后端代码/server/src/routes/returns-v1.1.ts` (POST /)

**改动**: `req.body.operator` → `(req as any).user?.username || 'system'`

**验收标准**:
- [ ] operator 是当前登录用户
- [ ] 集成测试通过

---

### 任务 2.4: 修复调拨 operator 来源

**文件**: `后端代码/server/src/routes/transfers-v1.1.ts` (DELETE /:id)

**改动**: `req.body.operator` → `(req as any).user?.username || 'system'`

**验收标准**:
- [ ] operator 是当前登录用户
- [ ] 集成测试通过

---

### 任务 2.5: 修复 CostAnalysis 时间硬编码

**文件**: `前端代码/src/pages/report/CostAnalysis.tsx` (lines 42-49)

**改动**: 动态生成时间选项

**验收标准**:
- [ ] 时间选项包含当前年份
- [ ] 季度选项不超过当前季度

---

### 任务 2.6: 修复 SupplierReturns 表单字段重复

**文件**: `前端代码/src/pages/supplier-returns/SupplierReturns.tsx`

**改动**: 删除第 498-514 行重复的"关联采购订单"字段

**验收标准**:
- [ ] 表单只有一个"关联采购订单"
- [ ] E2E 测试通过

---

### 任务 2.7: 修复报表退库成本时间范围

**文件**: `后端代码/server/src/routes/reports-v1.1.ts`

**改动**: 退库成本 JOIN 出库记录，按出库时间统计

**验收标准**:
- [ ] 跨月退库在正确月份扣减
- [ ] 集成测试通过

---

### 任务 2.8: 修复设备折旧公式不一致

**文件**: `后端代码/server/src/routes/reports-v1.1.ts` (line 399)

**改动**: `250 * 8 * 60` → `365 * 24 * 60`

**验收标准**:
- [ ] 报表和设备管理页面折旧金额一致

---

### 任务 2.9: 修复 Dashboard 硬编码假数据

**文件**: `前端代码/src/pages/dashboard/hooks/useDashboardPage.ts`

**改动**: 从 API 获取真实趋势数据，无数据时显示空状态

**验收标准**:
- [ ] 趋势图显示真实数据或空状态（非假数据）

---

### 任务 2.10: 修复对账页面标签不匹配

**文件**: `前端代码/src/pages/reconciliation/Reconciliation.tsx`

**改动**: "病例缺失" → "未关联BOM"

**验收标准**:
- [ ] 标签与查询逻辑一致

---

### 任务 2.11: 修复对账导出按钮空实现

**文件**: `前端代码/src/pages/reconciliation/Reconciliation.tsx`

**改动**: 实现导出功能或隐藏按钮

**验收标准**:
- [ ] 导出按钮可下载 Excel 或按钮隐藏

---

### 任务 2.12: 统一后端错误消息为中文

**文件**: 多个后端路由文件

**改动**: 所有用户可见的错误消息改为中文

**验收标准**:
- [ ] 无英文错误消息暴露给用户

---

### 任务 2.13: 修复入库删除不扣减 inventory.stock (Critical)

**文件**: `后端代码/server/src/routes/inbound-v1.1.ts` (DELETE /:id)

**改动**:
```typescript
// 在扣减 batches 之后、软删除之前添加
db.prepare('UPDATE inventory SET stock = stock - ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?')
  .run(record.quantity, record.material_id)
```

**验收标准**:
- [ ] 入库删除后 inventory.stock 正确扣减
- [ ] 集成测试通过

---

### 任务 2.14: 修复 Reconciliation 周期选择器不工作

**文件**: `前端代码/src/pages/reconciliation/hooks/useReconciliationPage.ts`

**改动**: 添加 useEffect 将 period 映射为 startDate/endDate

**验收标准**:
- [ ] 点击"本周/本月/本季/本年"后日期范围正确更新

---

### 任务 2.15: 修复入库 PUT 编辑不校验库存变负

**文件**: `后端代码/server/src/routes/inbound-v1.1.ts` (PUT /:id)

**改动**: 在修改库存前检查 stock + qtyDiff >= 0

**验收标准**:
- [ ] 减少数量时库存不会变负

---

### 任务 2.16: 修复盘点撤销后未检查库存合理性

**文件**: `后端代码/server/src/routes/stocktaking-v1.1.ts` (DELETE /:id)

**改动**: 撤销前检查恢复后库存是否 >= 0

**验收标准**:
- [ ] 撤销后库存为负时返回错误

---

### 任务 2.17: 修复对账导入未验证 project_id

**文件**: `后端代码/server/src/routes/reconciliation-v1.1.ts` (POST /cases/import)

**改动**: 导入前验证 project_id 存在且未删除

**验收标准**:
- [ ] 无效 project_id 的记录被跳过并提示

---

## 五、变更影响面报告

### 改动范围
- 修改文件: ~12 个（6 前端 + 6 后端）
- 新增文件: 1 个集成测试

### 影响功能
| 功能 | 是否受影响 | 验证方式 |
|------|-----------|---------|
| 出库 | ✅ | BOM出库+取消 测试 |
| 退库 | ✅ | operator 来源测试 |
| 调拨 | ✅ | operator 来源测试 |
| 报表 | ✅ | 退库成本+折旧 测试 |
| Dashboard | ✅ | 趋势数据 测试 |
| 对账 | ✅ | 标签+导出 测试 |
| 供应商退货 | ✅ | 表单字段 测试 |

### 回滚方案

| 任务 | 回滚方式 | 影响 |
|------|---------|------|
| 2.1 skippedItems | 移除 skippedItems 字段 | 用户无法看到跳过的物料 |
| 2.2 取消原因 | 恢复原 DELETE 逻辑 | 取消原因丢失 |
| 2.3-2.4 operator | 恢复 req.body.operator | 操作者可伪造 |
| 2.5 时间硬编码 | 恢复硬编码选项 | 无法查看当前年份 |
| 2.6 字段重复 | 恢复重复字段 | 表单有两个相同下拉框 |
| 2.7 退库成本 | 恢复原查询逻辑 | 退库成本不准确 |
| 2.8 折旧公式 | 恢复 250*8*60 | 折旧金额偏低 4.38 倍 |
| 2.9 Dashboard | 恢复硬编码假数据 | 趋势图显示假数据 |
| 2.10 对账标签 | 恢复原标签 | 标签与数据不匹配 |
| 2.11 对账导出 | 移除导出功能 | 导出按钮不可用 |
| 2.12 错误消息 | 恢复英文消息 | 中英文混用 |
| 2.13 入库删除stock | 移除 stock 扣减 | 库存虚高 |
| 2.14 周期选择器 | 恢复硬编码日期 | 日期范围不更新 |
| 2.15 入库PUT校验 | 移除负库存检查 | 库存可能变负 |
| 2.16 盘点撤销检查 | 移除库存合理性检查 | 撤销后库存可能变负 |
| 2.17 对账project验证 | 移除 project_id 验证 | 无效项目关联 |

---

## 六、PM 黑盒验收清单

### 功能正确性
- [ ] BOM出库时库存不足的物料有明确提示
- [ ] 出库取消原因正确保存和显示
- [ ] 退库/调拨记录的 operator 是当前登录用户
- [ ] CostAnalysis 显示当前年份数据
- [ ] SupplierReturns 表单无重复字段
- [ ] Dashboard 趋势图显示真实数据或空状态

### 数据一致性
- [ ] 出库取消后，取消原因可在详情中查看
- [ ] 报表退库成本与出库时间对齐
- [ ] 设备折旧在报表和设备管理页面一致

### 异常处理
- [ ] BOM出库全部失败时有明确提示
- [ ] 后端错误消息全部中文
- [ ] 网络超时有友好提示

---

## 七、执行顺序

```
Step 1: 写集成测试 → 运行 → 确认失败
Step 2: 修复任务 2.1-2.4（后端逻辑）→ 运行测试 → 确认通过
Step 3: 修复任务 2.5-2.6（前端修复）→ E2E 测试
Step 4: 修复任务 2.7-2.12（其他修复）→ 运行测试
Step 5: 运行全量测试 → 确认无回归
Step 6: PM 黑盒验收
```
