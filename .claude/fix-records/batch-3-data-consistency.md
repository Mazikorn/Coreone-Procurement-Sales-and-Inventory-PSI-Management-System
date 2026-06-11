# Batch 3: 数据一致性修复记录

> **状态**: ✅ 已完成
> **目标**: 修复前后端数据不一致和 stock_logs 错误
> **开始时间**: 2026-06-02
> **完成时间**: 2026-06-02

---

## MF-11: stock_logs beforeStock 计算错误

**修复前**:
- 文件: `后端代码/server/src/routes/outbound-v1.1.ts:172,194` (普通出库)
- 文件: `后端代码/server/src/routes/outbound-v1.1.ts:313,335` (BOM 出库)
- 文件: `后端代码/server/src/routes/outbound-v1.1.ts:449,470` (出库编辑)
- 问题: UPDATE stock 后才读取 beforeStock，日志中的值实际是扣减后的

**修复后**:
- 方案: 在 UPDATE 之前保存 beforeStock

**验证**:
- [ ] stock_logs 的 beforeStock = 扣减前的库存值
- [ ] stock_logs 的 afterStock = 扣减后的库存值
- [ ] 3 处出库逻辑均已修复

---

## SF-16: outbound GET 返回 sampleCount ✅

**修复前**: outbound_records 有 sample_count 字段，GET / 未返回
**修复后**: 列表查询返回 sampleCount
**文件**: `outbound-v1.1.ts:79`

---

## SF-17: outbound items 返回 batchId ✅

**修复前**: GET / 返回 items 只有 batchNo，无 batchId
**修复后**: items 返回包含 batchId
**文件**: `outbound-v1.1.ts:83`

---

## SF-18: equipment GET /:id 返回折旧字段 ✅

**修复前**: GET / 返回 annualDepreciation/accumulatedDepreciation/netBookValue，但 GET /:id 不返回
**修复后**: 详情接口补充这三个字段
**文件**: `equipment-v1.1.ts:89-116`

---

## SF-19: 供应商评级 API 前端对接

**修复前**: 后端 POST /:id/rating 和 POST /rating/all 已实现，前端未调用
**修复后**: 前端 master.ts 补充 supplierApi.rating() 方法

**验证**:
- [ ] 供应商详情页有评级按钮
- [ ] 点击后调用 API 并显示结果

---

## SF-20: 出库编辑/删除同步 project_cost_details

**修复前**: 出库编辑后 project_cost_details 未更新
**修复后**: 编辑/删除出库时删除关联的 project_cost_details

**验证**:
- [ ] 出库编辑后成本报表自动更新
- [ ] 出库删除后成本明细清除

---

## SF-22: ratio 返回 string

**修复前**: reports-v1.1.ts ratio 使用 `.toFixed(1)` 返回字符串
**修复后**: 返回数字类型

**验证**:
- [ ] 前端 CostAnalysis 无类型警告

---

## SF-24: IndirectCostCenterList costTypeLabel

**修复前**: 使用 undefined 的 costTypeLabel
**修复后**: 使用 costType 或添加映射

**验证**:
- [ ] 间接成本中心列表显示费用类型

---

## SF-25: FullCostTable sampleCount null 安全

**修复前**: sampleCount 可能为 null
**修复后**: 使用 `sampleCount || 1` 或 COALESCE

**验证**:
- [ ] sampleCount 为 null 时不崩溃

---

## 本批次完成检查

- [ ] MF-11 修复完成
- [ ] SF-16~25 修复完成
- [ ] 前端 TypeScript 零新增错误
- [ ] 后端测试通过
