# COREONE 业务规则

> **版本**: 1.0.0
> **创建日期**: 2026-06-11
> **依据来源**: `后端代码/server/src/routes/` 全部路由文件、`后端代码/server/src/utils/allocation.ts`、`后端代码/server/src/database/DatabaseManager.ts`
> **维护者**: Codex（从代码反推，PM 审核确认）

---

## 0. 概述

本文档从后端代码中反推提取，覆盖入库、出库、退库、报废、盘点、调拨、供应商退货、BOM 共 8 个业务模块的核心规则。每条规则带编号（BR-模块-序号），可追溯到源文件和行号。

**⚠️ 重要**：本文档以代码为准。如历史设计文档（PRD、TECH-SPEC）与本文档冲突，以本文档（即当前代码实现）为准。

---

## 1. 跨模块通用规则

| 编号 | 规则 | 说明 |
|------|------|------|
| BR-GEN-001 | 软删除 | 所有业务表使用 `is_deleted = 1` 标记，不物理删除 |
| BR-GEN-002 | 库存日志 | 所有库存变动必须写入 `stock_logs`，记录 `before_stock` 和 `after_stock` |
| BR-GEN-003 | 事务保护 | 所有写操作使用 `BEGIN IMMEDIATE` 事务，防止并发写冲突 |
| BR-GEN-004 | 负库存禁止 | 库存不能为负数，扣减后均做负库存兜底检查 |
| BR-GEN-005 | UUID 主键 | 所有主键使用 `uuidv4` 生成 |
| BR-GEN-006 | 单据编号 | 入库 `IB-`、出库 `OB-`、退库 `RT-`、报废 `SC-`、盘点 `ST-`、调拨 `TF-`、供应商退货 `SR-` |
| BR-GEN-007 | 分页默认 | `page=1, pageSize=20`，上限 100 或 200 |
| BR-GEN-008 | 预警触发 | 入库和出库操作完成后自动调用 `checkStockAlerts` |
| BR-GEN-009 | TOCTOU 防护 | 退库、报废、供应商退货将库存检查移入事务内部 |
| BR-GEN-010 | 错误码映射 | `SQLITE_CONSTRAINT` → 409，`SQLITE_BUSY` → 503，库存不足 → 422 `STOCK_INSUFFICIENT` |

---

## 2. 入库模块

### 2.1 状态流转

| 编号 | 规则 |
|------|------|
| BR-IN-001 | 初始状态固定为 `completed`，无"待审核"中间态 |
| BR-IN-002 | 状态流转：`completed` ↔ `cancelled`（双向） |
| BR-IN-003 | 取消方式：PUT `/:id` 传 `status: 'cancelled'` 或 POST `/:id/cancel` |
| BR-IN-004 | 取消前置条件：当前状态必须为 `completed` |
| BR-IN-005 | 取消时记录 `cancel_reason` |

### 2.2 数据校验

| 编号 | 规则 |
|------|------|
| BR-IN-006 | 必填字段：`type`、`materialId`、`quantity`、`locationId` |
| BR-IN-007 | 物料必须存在且未删除（`is_deleted = 0`） |
| BR-IN-008 | 写入权限：仅 `admin` 和 `warehouse_manager` |
| BR-IN-009 | `purchaseOrderId` 可选，提供时验证存在性 |
| BR-IN-010 | `batchNo` 可选，支持无批次入库 |
| BR-IN-011 | `amount` 自动计算：`price * quantity`，`price` 默认 0 |

### 2.3 库存变动

| 编号 | 规则 |
|------|------|
| BR-IN-013 | 创建入库：`inventory.stock += quantity`，无记录则新建 |
| BR-IN-014 | 批次处理：(1) 同名活跃批次累加；(2) 同名停用批次恢复并累加；(3) 不存在则新建 |
| BR-IN-015 | 批次唯一约束：`(material_id, batch_no)` |
| BR-IN-016 | 取消入库：扣减库存 + 批次，批次 `remaining <= 0` 自动停用 |
| BR-IN-017 | 恢复入库：增加库存 + 批次，恢复批次状态 |
| BR-IN-018 | 编辑数量：增量调整 `qtyDiff = newQty - oldQty` |
| BR-IN-019 | 编辑批次号：先扣旧批次，再增新批次 |
| BR-IN-020 | 减少数量时检查：`currentStock + qtyDiff < 0` 则拒绝 |
| BR-IN-021 | 删除前置条件：(1) 无出库记录；(2) 无使用中消耗跟踪；(3) 批次库存不为负 |

### 2.4 采购订单关联

| 编号 | 规则 |
|------|------|
| BR-IN-023 | 入库关联采购订单时：`received_qty += quantity`，满额→`completed`，否则→`partial` |
| BR-IN-024 | 取消入库时：`received_qty = max(0, received_qty - quantity)`，归零→`pending` |
| BR-IN-025 | 恢复入库时：重新累加并更新状态 |
| BR-IN-026 | 删除入库时：同样回退采购订单 |

### 2.5 事务与错误处理

| 编号 | 规则 |
|------|------|
| BR-IN-029~032 | 创建/更新/删除/取消均使用 `BEGIN IMMEDIATE` 事务 |
| BR-IN-033 | try-catch + `ROLLBACK` 模式 |
| BR-IN-034 | 取消时批次有出库记录或使用中则拒绝 |
| BR-IN-036 | 库存不足返回 422 `STOCK_INSUFFICIENT` |

---

## 3. 出库模块

### 3.1 状态流转

| 编号 | 规则 |
|------|------|
| BR-OB-001 | 初始状态固定为 `completed` |
| BR-OB-002 | 仅支持软删除，删除即作废 |
| BR-OB-003 | 删除时记录 `cancel_reason` 和 `cancel_remark` |

### 3.2 数据校验

| 编号 | 规则 |
|------|------|
| BR-OB-004 | 普通出库必填：`type`、`items`（非空数组） |
| BR-OB-005 | BOM 出库必填：`bomId`、`sampleCount` |
| BR-OB-006 | 每项必填：`materialId` 存在，`quantity` 为正 |
| BR-OB-007 | `sampleCount` 必须为正整数 |
| BR-OB-008 | BOM 必须存在且至少有 1 个 bom_item |
| BR-OB-010 | 写入权限：仅 `admin` 和 `warehouse_manager` |

### 3.3 FEFO 批次分配

| 编号 | 规则 |
|------|------|
| BR-OB-011 | **FEFO（先到期先出）**：按 `expiry_date ASC, created_at ASC` 排序 |
| BR-OB-012 | 分配条件：`remaining > 0 AND status = 1 AND is_deleted = 0` |
| BR-OB-013 | 批次总库存 < 需求量 → 抛出 `'批次库存不足'` |
| BR-OB-014 | 贪心算法：按 FEFO 顺序取 `min(batch.remaining, 剩余需求)` |
| BR-OB-015 | 出库后：`stock -= qty`，`batches.remaining -= qty`，`remaining <= 0` → `status = 0` |
| BR-OB-017 | 出库完成后自动触发 `checkStockAlerts` |

### 3.4 BOM 出库特殊规则

| 编号 | 规则 |
|------|------|
| BR-OB-018 | 按 `group_name` 分组，同组物料视为"品牌池" |
| BR-OB-019 | 品牌池内所有物料的批次统一按 FEFO 排序后贪心分配 |
| BR-OB-020 | 无 `group_name` 的物料单独成组 |
| BR-OB-021 | 物料数量 = `usage_per_sample * sampleCount` |
| BR-OB-022 | 通用试剂库存不足时跳过，不阻断出库 |
| BR-OB-023 | 通用耗材库存不足时跳过 |
| BR-OB-024 | 质控品数量 = `ceil(sampleCount / covers_samples) * usage_per_batch`，不足时跳过 |
| BR-OB-025 | BOM 出库类型固定为 `'bom'` |

### 3.5 批次消耗跟踪

| 编号 | 规则 |
|------|------|
| BR-OB-026 | `usage === 'self'` 时自动创建 `batch_usage_tracking`，状态 `'in-use'`，默认 30 天 |
| BR-OB-027 | BOM 出库时所有物料 usage 固定为 `'self'` |

### 3.6 成本计算

| 编号 | 规则 |
|------|------|
| BR-OB-028 | 出库成本 = Σ(分配量 × 批次入库价) |
| BR-OB-029 | 每项记录 `unit_cost`（批次入库价）和 `total_cost` |
| BR-OB-030 | ABC 成本在 BOM 出库时执行，失败不阻断出库 |
| BR-OB-032 | ABC 详情写入 `outbound_abc_details`，更新出库记录的 ABC 字段 |

### 3.7 事务

| 编号 | 规则 |
|------|------|
| BR-OB-033~036 | 创建/更新/删除均使用 `BEGIN IMMEDIATE` 事务 |
| BR-OB-037 | 更新采用"回退-重做"模式：先恢复旧库存，再重新分配 |

---

## 4. 退库模块

### 4.1 规则

| 编号 | 规则 |
|------|------|
| BR-RT-001 | 无显式状态管理，创建即存在，删除即撤销 |
| BR-RT-002 | 必填：`materialId`、`quantity`（正数）、`reason` |
| BR-RT-005 | 库存不足返回 422 |

### 4.2 库存变动

| 编号 | 规则 |
|------|------|
| BR-RT-006 | 退库 = 退回已出库物料，库存**增加** |
| BR-RT-007 | 有 `batchId` 时同时增加批次 `remaining` |
| BR-RT-008 | 撤销退库时反转操作 |

### 4.3 成本计算 — 原发成本追溯法

| 编号 | 规则 |
|------|------|
| BR-RT-009 | 按出库时间倒序查找最近的 `outbound_items`，取其 `unit_cost` |
| BR-RT-010 | 优先匹配 `quantity >= 退库数量` 的记录 |
| BR-RT-011 | 无出库记录兜底：使用加权平均价 `Σ(remaining × inbound_price) / Σ(remaining)` |
| BR-RT-012 | 退库总成本 = `quantity × unitCost` |

---

## 5. 报废模块

| 编号 | 规则 |
|------|------|
| BR-SC-001 | 无显式状态管理，创建即生效，删除即撤销 |
| BR-SC-002 | 必填：`materialId`、`quantity`（正数）、`reason` |
| BR-SC-006 | 报废扣减库存：`stock -= quantity` |
| BR-SC-007 | 负库存兜底：扣减后 `stock < 0` 则回滚 |
| BR-SC-008 | 撤销时恢复库存 |
| BR-SC-009 | **报废不操作批次表**，仅修改总库存 |
| BR-SC-010 | 无成本计算，仅记录 `stock_logs`（type=`'scrap'`） |
| BR-SC-014 | ⚠️ 无写入权限中间件控制 |

---

## 6. 盘点模块

### 6.1 状态流转

| 编号 | 规则 |
|------|------|
| BR-ST-001 | 确认操作将 status 更新为 `'confirmed'` |
| BR-ST-002 | 已确认不可重复确认 |
| BR-ST-003 | 删除即撤销 |

### 6.2 差异处理

| 编号 | 规则 |
|------|------|
| BR-ST-008 | `difference = actualStock - systemStock` |
| BR-ST-009 | **覆盖式更新**：`inventory.stock = actualStock`（非增量调整） |
| BR-ST-010 | 确认时同样覆盖式更新 |
| BR-ST-011 | 负库存兜底 |
| BR-ST-012 | 撤销时恢复到盘点前的 `system_stock` |
| BR-ST-014 | 差异为零时不产生库存变动和日志 |

---

## 7. 调拨模块

| 编号 | 规则 |
|------|------|
| BR-TF-001 | 调拨记录存储在 `inbound_records` 表，`type = 'transfer'` |
| BR-TF-003 | 必填：`materialId`、`toLocationId`、`quantity` |
| BR-TF-004 | 来源库位必填：`fromLocationId` 或 `fromLocationName` |
| BR-TF-008 | 来源库位必须与当前库存 `location_id` 匹配 |
| BR-TF-009 | 来源库位库存必须充足 |
| BR-TF-010 | **不改变总库存**，仅变更 `inventory.location_id` |
| BR-TF-012 | ⚠️ 撤销调拨**不恢复原始库位**（`from_location_id` 未存储） |
| BR-TF-018 | **已知缺陷**：撤销后无法自动恢复原始库位 |

---

## 8. 供应商退货模块

### 8.1 状态流转

| 编号 | 规则 |
|------|------|
| BR-SR-001 | 状态机：`pending` → `shipped` → `received` → `refunded`（终态），任何状态可 → `cancelled`（终态） |
| BR-SR-002 | 不合法的状态转换返回 400 |
| BR-SR-003 | 初始状态 `pending` |
| BR-SR-004 | 仅 `pending` 状态可删除 |

### 8.2 批次分配

| 编号 | 规则 |
|------|------|
| BR-SR-007 | 指定 `batchId` 时验证：存在、属于该物料、status=1、`remaining >= quantity` |
| BR-SR-008 | 未指定时自动选择最早批次（FEFO：`ORDER BY expiry_date ASC, created_at ASC`） |

### 8.3 库存变动

| 编号 | 规则 |
|------|------|
| BR-SR-011 | 创建退货：`stock -= quantity` |
| BR-SR-012 | 同时扣减批次 `batches.remaining -= quantity` |
| BR-SR-013 | 负库存兜底 |
| BR-SR-014 | 删除时恢复库存和批次 |

### 8.4 成本计算

| 编号 | 规则 |
|------|------|
| BR-SR-015 | 退款金额 = `batches.inbound_price × quantity` |
| BR-SR-016 | 支持手动覆盖 `refundAmount` |

---

## 9. BOM 模块

### 9.1 状态与版本

| 编号 | 规则 |
|------|------|
| BR-BM-001 | `status`：1=active，0=inactive |
| BR-BM-004 | 创建时版本固定 `v1.0` |
| BR-BM-005 | 更新时自动递增次版本号：`v1.0` → `v1.1` → `v1.2` |
| BR-BM-006 | 格式：`v{主版本}.{次版本}`，仅次版本递增 |

### 9.2 数据校验

| 编号 | 规则 |
|------|------|
| BR-BM-007 | 必填：`code`、`name`、`type` |
| BR-BM-008 | `code` 长度 ≤ 100 字符 |
| BR-BM-009 | `usagePerSample` 必须非负 |
| BR-BM-010 | 物料必须存在且未删除 |
| BR-BM-011 | 写入权限仅 `admin` |
| BR-BM-013 | `code` UNIQUE 约束，重复返回 409 |

### 9.3 标准成本计算

| 编号 | 规则 |
|------|------|
| BR-BM-014 | 标准成本 = 材料 + 人工 + 设备 + 质控 + 间接 |
| BR-BM-015 | 材料成本 = Σ(单价 × 每样本用量)，单价优先加权平均价，无批次价时用 `materials.price` |
| BR-BM-016 | 加权平均价 = `Σ(remaining × inbound_price) / Σ(remaining)`，仅有效批次 |
| BR-BM-017 | 人工成本按项目类型计算 |
| BR-BM-018 | 设备成本按 BOM 设备模板计算 |
| BR-BM-019 | 质控成本按 BOM 质控品计算 |
| BR-BM-020 | 间接成本按月份计算 |
| BR-BM-021 | 金额保留两位小数 |
| BR-BM-023 | 利润率保留四位小数 |

### 9.4 物料分组（品牌池）

| 编号 | 规则 |
|------|------|
| BR-BM-031 | 相同 `group_name` 的物料视为可替代组（品牌池） |
| BR-BM-032 | 无 `group_name` 的物料单独成组 |
| BR-BM-033 | 品牌池内物料使用相同 `usage_per_sample`，出库时跨品牌统一分配 |

### 9.5 扩展配额

| 编号 | 规则 |
|------|------|
| BR-BM-034 | 四类配额：核心物料、通用试剂、通用耗材、质控品 |
| BR-BM-035 | 通用试剂/耗材有 `allocation_type`（如 `'per_slide'`） |
| BR-BM-036 | 质控品使用 `covers_samples` + `usage_per_batch` 计算 |
| BR-BM-037 | 设备模板支持 `equipment_id` 或 `equipment_type_id` |

### 9.6 事务

| 编号 | 规则 |
|------|------|
| BR-BM-038 | 创建 BOM 涉及 6 张表的事务 |
| BR-BM-039 | 更新 BOM 采用"先删后插"模式 |
| BR-BM-041 | 子表更新策略：DELETE 全部 → INSERT 新数据 |

---

## 10. 已知缺陷与待确认项

> **2026-06-15 复核更新**：目标 Draft PR #1 已修复多项历史 P0/P1 后端一致性问题，但本节保留仍需 PM 决策或专项复核的业务规则缺口。已修复项的关闭证据同步记录在 `docs/11_Bug_Log.md`。

### 10.1 已知缺陷

| 编号 | 模块 | 缺陷 | 影响 |
|------|------|------|------|
| BR-TF-018 | 调拨 | 撤销调拨无法恢复原始库位 | `from_location_id` 未存储 |
| BR-RT-008 | 退库 | 撤销退库时批次操作存在逻辑不一致 | 代码第 168 行对 batch 做的是 `+` 而非 `-` |
| BR-SC-014 | 报废 | 写入权限控制需回归确认 | 入口路由已限制为 admin/warehouse_manager，但仍需角色 E2E/API 回归 |
| BR-ST-020 | 盘点 | 写入权限控制需回归确认 | 入口路由已限制为 admin/warehouse_manager，但仍需角色 E2E/API 回归 |
| BR-TF-017 | 调拨 | 写入权限控制需回归确认 | 入口路由已限制为 admin/warehouse_manager，但仍需角色 E2E/API 回归 |
| BR-SR-019 | 供应商退货 | 状态更新不在事务中 | 单条 UPDATE，无事务保护 |
| BR-SR-020 | 供应商退货 | 撤销日志 operator 仍可从 body 读取 | 审计操作者来源不完全可信 |

### 10.2 PM 待确认

| 编号 | 问题 |
|------|------|
| PM-BR-001 | 入库初始状态为 `completed`，是否需要"待审核"中间态？ |
| PM-BR-002 | 报废/盘点/调拨缺少写入权限控制，是否需要限制为 `warehouse_manager`？ |
| PM-BR-003 | 退库撤销时批次操作逻辑不一致，是否需要修复？ |
| PM-BR-004 | 调拨撤销不恢复原始库位，是否需要存储 `from_location_id`？ |
| PM-BR-005 | 供应商退货状态更新不在事务中，是否需要改为事务保护？ |
| PM-BR-006 | 通用试剂/耗材库存不足时跳过出库，业务上是否可接受？ |

---

## 11. 关联文档

| 文档 | 路径 | 关联 |
|------|------|------|
| 数据对象清单 | `docs/06_Data_Object_List.md` | 表结构和字段定义 |
| 权限矩阵 | `docs/05_Role_Permission_Matrix.md` | 各模块写入权限 |
| 项目章程 | `docs/01_Project_Charter.md` | 功能范围 |
| FRS 系列 | `docs/FRS/` | 功能需求规格 |
| TestScenarios | `docs/TestScenarios/` | 测试场景 |
