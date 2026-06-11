# Batch 6: 业务逻辑补充修复记录

> **状态**: ✅ 已完成
> **目标**: 修复剩余业务逻辑问题
> **开始时间**: 2026-06-02
> **完成时间**: 2026-06-02

---

## SF-06: 人工成本包含设备步骤或明确排除

**修复前**: cost-calculator.ts:17 `WHERE is_equipment_step = 0` 显式过滤
**修复后**: 根据业务需求决定是否包含，或分开计算

**验证**:
- [ ] 设备步骤的成本处理逻辑明确
- [ ] 文档注释说明排除原因

---

## SF-07: 库存扣减使用原子 UPDATE

**修复前**: allocateBatches 先 SELECT remaining 再 UPDATE
**修复后**: 使用 `UPDATE ... WHERE remaining >= ?`

**验证**:
- [ ] 库存扣减使用原子操作
- [ ] 并发场景下不超卖

---

## SF-08: BOM POST/PUT 加事务

**修复前**: bom-v1.1.ts POST 有多个 INSERT 但无 BEGIN/COMMIT
**修复后**: 包裹在 BEGIN IMMEDIATE ... COMMIT 事务中

**验证**:
- [ ] BOM 创建/更新有事务保护
- [ ] 中途失败时数据回滚

---

## SF-09: 采购收货加事务

**修复前**: purchase-orders-v1.1.ts 收货无事务
**修复后**: 添加事务保护

**验证**:
- [ ] 采购收货有事务保护

---

## SF-23: 库存预警阈值统一

**修复前**: inventory 使用 min_stock，alerts 使用 safety_stock
**修复后**: 统一使用同一字段

**验证**:
- [ ] 预警阈值来源一致

---

## SF-26: BOM 创建验证 material_id 存在性

**修复前**: bom-v1.1.ts:155-162 INSERT 前不验证物料存在
**修复后**: INSERT 前检查 material_id 是否存在

**验证**:
- [ ] 使用不存在的 material_id 创建 BOM 时返回错误

---

## NH-14: 入库数量/有效性验证

**修复前**: inbound quantity 无校验（可为负数或 NaN）
**修复后**: 添加数量校验

**验证**:
- [ ] 入库数量为负数或 NaN 时返回 400 错误

---

## 本批次完成检查

- [ ] SF-06~09/23/26 修复完成
- [ ] NH-14 修复完成
- [ ] 后端测试通过
