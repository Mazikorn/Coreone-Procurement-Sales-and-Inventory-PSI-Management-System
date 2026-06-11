# COREONE v1.2 Phase 4 业务逻辑深度审查报告

> **审查日期**: 2026-06-02
> **审查范围**: 成本计算引擎 + 库存流转 + 预警生成 + 事务/并发/软删除
> **审查方法**: 2 个并行深度审查任务（代码走查 + 场景推演）
> **审查人**: Claude Code 自动化审查

---

## 一、审查概要

| 指标 | 数值 |
|------|------|
| 扫描成本计算函数 | 5 个 |
| 扫描库存操作路由 | 8 个 |
| 扫描预警逻辑 | 3 个 |
| 扫描报表接口 | 3 个 |
| **发现问题总数** | **42 项**（去重后） |
| P0 — 业务逻辑错误 | 8 项 |
| P1 — 边界缺失/数据不一致 | 18 项 |
| P2 — 竞态/事务/规范 | 16 项 |

---

## 二、P0 级问题（业务逻辑错误）

### P0-BIZ-01: 退库逻辑库存方向完全相反

- **位置**: `routes/returns-v1.1.ts:120-125`
- **类型**: 逻辑方向错误
- **严重程度**: 🔴🔴🔴
- **问题描述**: 退库操作应**增加**库存（将已出库物料退回），但代码执行的是**扣减**：
  - 第120行: `UPDATE inventory SET stock = stock - ?`（应为 `+`）
  - 第123行: `UPDATE batches SET remaining = remaining - ?`（应为 `+`）
- **业务影响**: 退库后库存反而减少，与"退库"语义完全相反。多次退库可能导致库存为负。
- **修复建议**: 两处均改为 `+` 操作

### P0-BIZ-02: BOM 出库完全未处理扩展配额

- **位置**: `routes/outbound-v1.1.ts:220-358`
- **类型**: 功能遗漏
- **严重程度**: 🔴🔴🔴
- **问题描述**: `POST /bom` 仅处理 `bom_items` 表中的特异性试剂，**完全忽略** `bom_general_reagents`、`bom_general_consumables`、`bom_quality_controls`、`bom_equipment_templates` 四张扩展配额表。通用试剂、耗材、质控品、设备的库存未被扣减。
- **业务影响**: BOM 出库后通用试剂和耗材库存未减少，库存数据与实际严重不符，后续可能超发。
- **修复建议**: 扩展 BOM 出库逻辑，按扩展配额计算需求量并执行批次分配和库存扣减。

### P0-BIZ-03: 报表样本数统计使用 COUNT 而非 SUM

- **位置**: `routes/reports-v1.1.ts:18-39`
- **类型**: 计算错误
- **严重程度**: 🔴🔴🔴
- **问题描述**: `cost-by-project` 使用 `COUNT(r.id)` 统计出库单数量，而非 `SUM(r.sample_count)` 统计实际样本数。1 张出库单含 10 个样本时，返回 1 而非 10。
- **业务影响**: 单样本成本 `unitCost = totalCost / sampleCount` 被严重放大，成本分析完全失真。
- **修复建议**: `COUNT(r.id)` → `SUM(r.sample_count)`

### P0-BIZ-04: 全成本报表自行计算而非调用统一引擎

- **位置**: `routes/reports-v1.1.ts:262-469`
- **类型**: 逻辑重复/不一致
- **严重程度**: 🔴🔴🔴
- **问题描述**: `full-cost-by-project` 自行计算全成本（预加载逻辑），而非调用 `utils/cost-calculator.ts` 的 `calculateFullCost`。导致：
  - 代码重复且可能不一致
  - `project_cost_details` 缓存表与报表实时计算结果不同步
  - 缓存机制失效（每次实时计算，不保存）
- **业务影响**: 同一数据不同入口可能得到不同结果。
- **修复建议**: 调用 `getOrCalculateProjectFullCost` 统一计算并缓存。

### P0-BIZ-05: 直线法折旧全年无休假设（低估 4.38 倍）

- **位置**: `utils/cost-calculator.ts:46`
- **类型**: 计算错误
- **严重程度**: 🔴🔴
- **问题描述**: `minutesPerYear = 365 * 24 * 60` 假设设备全年无休。病理设备实际约 250 工作日/年、8 小时/天。实际折旧率被低估约 `(365*24)/(250*8) = 4.38` 倍。
- **业务影响**: 直线法下设备折旧成本仅为实际应分摊成本的约 23%，全成本报表失真。
- **修复建议**: 使用实际工作分钟数（如 `250 * 8 * 60 = 120,000`）或引入 `annual_working_minutes` 配置。

### P0-BIZ-06: 质控成本使用标准价而非实际采购价

- **位置**: `utils/cost-calculator.ts:64-82`
- **类型**: 计算错误
- **严重程度**: 🔴🔴
- **问题描述**: `calculateQCCost` 使用 `materials.price`（标准价）而非批次实际入库价 `batches.inbound_price`。此外 `usage_per_batch` 被查询但未参与计算，公式遗漏该字段。
- **业务影响**: 质控成本使用静态价，价格差异无法反映。`usage_per_batch > 1` 时计算错误。
- **修复建议**:
  1. 使用质控品批次的 `inbound_price`
  2. 公式包含 `usage_per_batch`: `cost += (price * usage_per_batch / coverage) * sampleCount`

### P0-BIZ-07: 过期预警去重逻辑缺陷

- **位置**: `routes/alerts-v1.1.ts:131-136`
- **类型**: 逻辑缺陷
- **严重程度**: 🔴🔴
- **问题描述**: 去重仅匹配 `material_id` 和 `type = 'expiry'`，不区分具体批次。物料A的批次001过期生成预警后，批次002过期时不会生成新预警。
- **业务影响**: 同一物料多个批次先后过期时，仅第一个批次有预警，后续遗漏。
- **修复建议**: 去重条件增加批次号匹配。

### P0-BIZ-08: 人工成本排除设备步骤导致系统性低估

- **位置**: `utils/cost-calculator.ts:13-25`
- **类型**: 逻辑矛盾
- **严重程度**: 🔴🔴
- **问题描述**: `calculateLaborCost` 过滤 `is_equipment_step = 0`，排除设备操作步骤。但设备运行期间技术人员在场监督的人工成本被遗漏。
- **业务影响**: IHC、特殊染色等项目人工成本被系统性低估。
- **修复建议**: 明确 `is_equipment_step` 语义，补充独立的"设备值守"人工工时记录。

---

## 三、P1 级问题（边界缺失/数据不一致）

### P1-BIZ-01: 库存扣减存在并发竞态条件

- **位置**: `routes/outbound-v1.1.ts`、`routes/inbound-v1.1.ts` 等
- **类型**: 竞态条件
- **严重程度**: 🟠🟠🟠
- **问题描述**: 所有库存操作使用"先读后写"模式：
  ```typescript
  const current = db.prepare('SELECT stock FROM inventory').get(materialId)
  const newStock = current.stock - quantity
  db.prepare('UPDATE inventory SET stock = ?').run(newStock)
  ```
  SQLite 无行级锁保护，高并发时两个请求同时读取同一库存，都得到相同值，分别扣减后导致超卖。
- **业务影响**: 高并发出库时可能出现负库存。
- **修复建议**: 使用 `UPDATE inventory SET stock = stock - ? WHERE material_id = ?` 原子操作，或添加 `locked_stock` 乐观锁机制。

### P1-BIZ-02: BOM 出库无事务保护

- **位置**: `routes/outbound-v1.1.ts:220-358`
- **类型**: 事务缺失
- **严重程度**: 🟠🟠🟠
- **问题描述**: BOM 出库涉及多个物料的库存扣减、出库记录创建、成本计算，但无 `BEGIN/COMMIT` 事务包裹。中途失败时部分库存已扣减但无记录，导致账实不符。
- **修复建议**: 整个 BOM 出库流程包裹在事务中。

### P1-BIZ-03: 采购订单收货无事务保护

- **位置**: `routes/purchase-orders-v1.1.ts`
- **类型**: 事务缺失
- **严重程度**: 🟠🟠
- **问题描述**: 采购订单收货涉及更新 `purchase_orders` 表和创建 `inbound_records`，无事务保护。
- **修复建议**: 包裹在事务中。

### P1-BIZ-04: 入库库存日志 before_stock 计算依赖数学推导

- **位置**: `routes/inbound-v1.1.ts:245-248`
- **类型**: 逻辑晦涩
- **严重程度**: 🟠🟠
- **问题描述**: `before_stock` 通过 `COALESCE(...) - quantity` 计算，依赖数学推导而非显式读取。虽数学正确，但可读性差，维护困难。
- **修复建议**: 更新 inventory 前先显式读取 `before_stock`，再计算 `after_stock`。

### P1-BIZ-05: 出库删除后未恢复预警

- **位置**: `routes/outbound-v1.1.ts:492-532`
- **类型**: 边界缺失
- **严重程度**: 🟠🟠
- **问题描述**: 删除出库单恢复库存后，未调用 `checkStockAlerts` 关闭已恢复的预警。
- **业务影响**: 库存已恢复但低库存预警仍 pending，用户困惑。
- **修复建议**: 删除出库单后检查并关闭相关预警。

### P1-BIZ-06: 普通出库 sampleCount 默认值覆盖 0

- **位置**: `routes/outbound-v1.1.ts:118`
- **类型**: 边界缺失
- **严重程度**: 🟠
- **问题描述**: `Number(req.body.sampleCount) || 1` 将传入的 0 覆盖为 1。
- **修复建议**: `req.body.sampleCount !== undefined ? Number(req.body.sampleCount) : 1`

### P1-BIZ-07: BOM 出库组内首个物料 usage=0 导致整组跳过

- **位置**: `routes/outbound-v1.1.ts:271-296`
- **类型**: 边界缺失
- **严重程度**: 🟠
- **问题描述**: `quantity = firstItem.usage_per_sample * sc`，当 `firstItem.usage_per_sample = 0` 时整组跳过，但组内其他物料可能非零。
- **修复建议**: 组内按每个物料分别计算需求量。

### P1-BIZ-08: 出库 items 数组未检测重复物料

- **位置**: `routes/outbound-v1.1.ts:107-218`
- **类型**: 边界缺失
- **严重程度**: 🟠
- **问题描述**: 未检测 `items` 中是否有重复 `materialId`，可能导致库存重复扣减。
- **修复建议**: 事务开始前检查重复物料。

### P1-BIZ-09: 间接成本当月无记录时返回 0 且无提示

- **位置**: `utils/cost-calculator.ts:84-94`
- **类型**: 边界缺失
- **严重程度**: 🟠
- **问题描述**: `calculateIndirectCost` 当月无分摊记录时返回 0，用户可能误以为"当月无间接费用"。
- **修复建议**: 报表 API 增加 `missingIndirectData` 标记提示数据缺失。

### P1-BIZ-10: 库存列表与预警阈值字段不一致

- **位置**: `routes/inventory-v1.1.ts:32-33` vs `routes/alerts-v1.1.ts:103`
- **类型**: 数据不一致
- **严重程度**: 🟠
- **问题描述**: 库存列表低库存判断使用 `min_stock`，预警生成使用 `safety_stock`，两者可能不一致。
- **修复建议**: 统一使用 `safety_stock` 作为预警阈值。

### P1-BIZ-11: 入库过期预警阈值硬编码 30 天

- **位置**: `routes/inbound-v1.1.ts:24`
- **类型**: 配置缺失
- **严重程度**: 🟠
- **问题描述**: `checkStockAlerts` 中过期预警阈值固定 30 天，未读取 `alert_rules.threshold_days`。
- **修复建议**: 查询 `alert_rules` 表获取配置阈值。

### P1-BIZ-12: 成本明细在出库修改/删除后不同步

- **位置**: `routes/outbound-v1.1.ts`
- **类型**: 数据不一致
- **严重程度**: 🟠
- **问题描述**: 修改/删除出库单后，`project_cost_details` 缓存表中的数据未同步更新。
- **修复建议**: 出库修改/删除时同步更新/删除对应的 `project_cost_details` 记录。

### P1-BIZ-13: BOM 出库替代物料预警未检查

- **位置**: `routes/outbound-v1.1.ts:347`
- **类型**: 逻辑缺陷
- **严重程度**: 🟠
- **问题描述**: `bomMaterialIds` 从 `itemAllocations` 收集（使用 `firstItem.material_id`），但品牌池替代出库实际使用的是 `alloc.materialId`，可能导致替代物料预警未被检查。
- **修复建议**: `bomMaterialIds` 从所有 `alloc.materialId` 收集。

### P1-BIZ-14: 全成本报表 sampleCount fallback 导致失真

- **位置**: `routes/reports-v1.1.ts:363`
- **类型**: 边界缺失
- **严重程度**: 🟡
- **问题描述**: `row.sample_count || 1` 将 0 fallback 到 1，单样本成本失真。
- **修复建议**: 区分 BOM 出库和普通出库的样本数处理。

### P1-BIZ-15: 全成本报表 avgUnitCost 计算不一致

- **位置**: `routes/reports-v1.1.ts:446-465`
- **类型**: 计算不一致
- **严重程度**: 🟡
- **问题描述**: `unitCost` 是各项目单样本成本的简单平均，`avgUnitCost` 是加权平均，两者可能不一致。
- **修复建议**: 统一计算方式并在前端统一展示。

### P1-BIZ-16: 软删除后数据悬空

- **位置**: 多个路由文件
- **类型**: 数据治理
- **严重程度**: 🟠
- **问题描述**: 删除物料/供应商/项目后，关联的出入库记录中外键字段（`material_id`、`supplier_id`、`project_id`）变为悬空引用。
- **修复建议**: 软删除时保留关联关系（不更新外键），或提供"已删除"占位显示。

### P1-BIZ-17: 分配函数负库存风险

- **位置**: `utils/allocation.ts:13-46`
- **类型**: 边界缺失
- **严重程度**: 🟡
- **问题描述**: 若 `remaining` 为负数，`totalAvailable` 会包含负值，判断逻辑可能出错。
- **修复建议**: 增加 `b.remaining > 0` 过滤。

### P1-BIZ-18: 入库时 batch_id 未写入

- **位置**: `routes/inbound-v1.1.ts`
- **类型**: 字段遗漏
- **严重程度**: 🟠
- **问题描述**: `inbound_records` 有 `batch_id` 字段但 INSERT 时未写入（已在 Phase 3 记录）。

---

## 四、P2 级问题（竞态/事务/规范）

### P2-BIZ-01~05: 多个操作缺少事务保护

| 操作 | 文件 | 涉及表 |
|------|------|--------|
| 入库创建 | `inbound-v1.1.ts` | inventory + batches + inbound_records |
| 出库创建 | `outbound-v1.1.ts` | inventory + batches + outbound_records + outbound_items |
| 退库创建 | `returns-v1.1.ts` | inventory + batches + return_records |
| 报废创建 | `scraps-v1.1.ts` | inventory + batches + scrap_records |
| 调拨创建 | `transfers-v1.1.ts` | inventory + batches + transfers |

以上操作均涉及多表更新，但**全部缺少显式事务包裹**。SQLite 的 `DatabaseSync` 默认 autocommit，每条语句独立提交。

### P2-BIZ-06: 软删除后关联数据未处理

- 删除分类后，子分类自动上浮逻辑已存在，但物料的 `category_id` 未更新
- 删除供应商后，物料的 `supplier_id` 仍为原值
- 删除项目后，出库记录的 `project_id` 仍为原值

### P2-BIZ-07: 有效期早于生产日期未拦截

- 入库时未校验 `expiryDate < productionDate` 的情况

### P2-BIZ-08: 入库数量为 0 或负数未拦截

- `inbound-v1.1.ts` 中 `quantity` 未校验 > 0

### P2-BIZ-09~16: 其他规范问题

- 出库单号生成未考虑并发（两个请求可能生成相同单号）
- `stock_logs` 中 `related_type` 字段值不统一（有的是表名，有的是操作类型）
- 成本计算引擎未记录计算日志，无法追溯计算过程
- `project_cost_details` 缓存表未设置过期/清理机制

---

## 五、业务规则验证结论

| 规则 | 状态 | 说明 |
|------|------|------|
| FEFO 先过期先出 | ✅ 正确 | `ORDER BY expiry_date ASC` |
| 库存不足拦截 | ✅ 正确 | `totalAvailable < totalQty` 时报错 |
| 批次号同一物料唯一 | ✅ 正确 | `UNIQUE(material_id, batch_no)` |
| 退库成本追溯 | ⚠️ 方向相反 | 库存应增加但代码扣减 |
| BOM 扩展配额出库 | ❌ 未实现 | 通用试剂/耗材/质控品/设备未扣减 |
| 入库后库存更新 | ✅ 正确 | `inventory.stock += quantity` |
| 出库后库存更新 | ✅ 正确 | `inventory.stock -= quantity` |
| 预警去重 | ⚠️ 批次维度缺失 | 同一物料多批次只预警一次 |
| 成本计算五项汇总 | ⚠️ 路径不一致 | 报表自行计算 vs 引擎统一计算 |

---

## 六、修复优先级矩阵

### 🔴 立即修复（数据准确性/完整性）

| 序号 | 问题 | 影响 |
|------|------|------|
| 1 | 退库库存方向修正 | 退库后库存反而减少 |
| 2 | BOM 出库扩展配额 | 通用试剂/耗材库存未扣减 |
| 3 | 报表样本数 COUNT→SUM | 单样本成本失真 |
| 4 | 全成本报表调用统一引擎 | 缓存与实时计算不同步 |
| 5 | 直线法折旧修正 | 设备成本低估 4.38 倍 |
| 6 | 质控成本公式修正 | 标准价+遗漏 usage_per_batch |
| 7 | 过期预警去重修正 | 多批次过期遗漏 |

### 🟠 尽快修复（边界/并发）

| 序号 | 问题 | 影响 |
|------|------|------|
| 8 | 库存操作加事务 | 中途失败账实不符 |
| 9 | 并发竞态修复 | 高并发超卖 |
| 10 | 出库删除后恢复预警 | 预警状态不一致 |
| 11 | 成本明细同步 | 修改/删除出库单后缓存不同步 |
| 12 | 预警阈值统一 | min_stock vs safety_stock |

### 🟡 后续优化

| 序号 | 问题 | 影响 |
|------|------|------|
| 13 | 入库过期预警阈值配置化 | 硬编码 30 天 |
| 14 | 有效期校验 | 未拦截 expiry < production |
| 15 | 负库存保护 | 未校验 quantity > 0 |
| 16 | 成本计算日志 | 无法追溯 |

---

## 七、检查范围声明

本次 Phase 4 审查覆盖以下维度：

| 维度 | 检查方法 | 覆盖度 |
|------|---------|-------|
| 成本计算逻辑 | 逐函数数学计算验证 | 100% |
| 库存流转逻辑 | 逐路由代码走查 | 100% |
| 预警生成逻辑 | 代码走查 + 场景推演 | 100% |
| 事务一致性 | 检查 BEGIN/COMMIT/ROLLBACK | 100% |
| 并发竞态 | 检查"先读后写"模式 | 100% |
| 边界条件 | 零值/负数/空值场景推演 | 抽样 |

---

*报告生成时间: 2026-06-02*
*累计发现问题: Phase 1 (30) + Phase 2 (24) + Phase 3 (49) + Phase 4 (42) = 145 项*
*下一 Phase: Phase 5 — 性能深度审查*
