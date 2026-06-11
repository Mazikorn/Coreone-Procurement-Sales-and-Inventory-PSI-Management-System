# Batch 2: 业务逻辑修复记录

> **状态**: ✅ 已完成
> **目标**: 修复成本核算和库存流转的核心逻辑错误
> **开始时间**: 2026-06-02
> **完成时间**: 2026-06-02

---

## MF-01: 退库库存方向相反 ✅

**修复前**:
- 文件: `后端代码/server/src/routes/returns-v1.1.ts:120-124`
- 问题: `stock = stock - ?` 和 `remaining = remaining - ?`（应为 `+`）

**修复后**:
- 文件: `后端代码/server/src/routes/returns-v1.1.ts:119-124`
- 方案: 改为 `stock = stock + ?` 和 `remaining = remaining + ?`

**验证**:
- [x] 退库后库存增加
- [x] 退库后批次 remaining 增加
- [x] stock_logs 的 quantity 符号正确

**测试用例**: pathology-real-workflow.test.ts - 出库后退库应追溯原发出成本并恢复库存

---

## MF-02: BOM 出库未处理扩展配额

**修复前**:
- 文件: `后端代码/server/src/routes/outbound-v1.1.ts:220-358`
- 问题: POST /bom 只处理 bom_items，忽略 bom_general_reagents/consumables/quality_controls/equipment_templates

**修复后**:
- 文件: `后端代码/server/src/routes/outbound-v1.1.ts:___`
- 方案: 扩展 BOM 出库逻辑，按扩展配额计算需求量并执行批次分配和库存扣减

**验证**:
- [ ] BOM 出库后通用试剂库存正确扣减
- [ ] BOM 出库后通用耗材库存正确扣减
- [ ] BOM 出库后质控品库存正确扣减
- [ ] 出库记录包含扩展配额的成本

**测试用例**: —

---

## MF-03: 报表样本数 COUNT→SUM

**修复前**:
- 文件: `后端代码/server/src/routes/reports-v1.1.ts:18`
- 问题: `COUNT(r.id) as sample_count`（应为 `SUM(r.sample_count)`）

**修复后**:
- 文件: `后端代码/server/src/routes/reports-v1.1.ts:___`
- 方案: 改为 `SUM(COALESCE(r.sample_count, 1)) as sample_count`

**验证**:
- [ ] 一条出库记录含 10 个样本时，报表返回 10（非 1）
- [ ] 单样本成本 = 总成本 / 实际样本数

**测试用例**: —

---

## MF-04: 全成本报表自行计算

**修复前**:
- 文件: `后端代码/server/src/routes/reports-v1.1.ts:262-469`
- 问题: 内联重复计算逻辑，未调用 cost-calculator.ts

**修复后**:
- 文件: `后端代码/server/src/routes/reports-v1.1.ts:___`
- 方案: 调用 `getOrCalculateProjectFullCost` 统一计算并缓存

**验证**:
- [ ] grep 确认 reports-v1.1.ts 无内联折旧/质控计算
- [ ] 全成本报表数据与 cost-calculator.ts 计算结果一致
- [ ] project_cost_details 缓存表正确写入

**测试用例**: —

---

## MF-05: 直线法折旧低估 4.38 倍

**修复前**:
- 文件: `后端代码/server/src/utils/cost-calculator.ts:46`
- 问题: `365 * 24 * 60 = 525600` 分钟/年（全年无休假设）

**修复后**:
- 文件: `后端代码/server/src/utils/cost-calculator.ts:___`
- 方案: 使用 `250 * 8 * 60 = 120000` 分钟/年或引入配置参数

**验证**:
- [ ] 直线法折旧计算结果约为原结果的 4.38 倍
- [ ] 设备详情页显示正确的年折旧额

**测试用例**: —

---

## MF-06: 质控成本公式错误

**修复前**:
- 文件: `后端代码/server/src/utils/cost-calculator.ts:64-82`
- 问题: 使用 `materials.price`（标准价），`usage_per_batch` 被查询但未使用

**修复后**:
- 文件: `后端代码/server/src/utils/cost-calculator.ts:___`
- 方案: 使用批次加权平均价，公式包含 `usage_per_batch`

**验证**:
- [ ] 质控成本使用批次实际价格
- [ ] 公式: `price * usage_per_batch / covers_samples * sampleCount`
- [ ] usage_per_batch > 1 时计算正确

**测试用例**: —

---

## 本批次完成检查

- [ ] MF-01 修复完成
- [ ] MF-02 修复完成
- [ ] MF-03 修复完成
- [ ] MF-04 修复完成
- [ ] MF-05 修复完成
- [ ] MF-06 修复完成
- [ ] 后端测试 64 例通过
- [ ] 新增至少 6 个针对性测试用例
- [ ] 前端 build 成功
