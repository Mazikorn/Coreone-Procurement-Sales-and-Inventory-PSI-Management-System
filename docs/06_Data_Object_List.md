# COREONE 数据对象清单

> **版本**: 1.0.0
> **创建日期**: 2026-06-11
> **依据来源**: `后端代码/server/src/database/DatabaseManager.ts`（42 张表）、`前端代码/src/types/index.ts`（约 768 行）
> **维护者**: Codex（从代码反推，PM 审核确认）

---

## 0. 概述

COREONE 数据库共 **42 张表**，前端类型定义约 **50+ 接口**。按业务模块分为 14 个域。

**数据库技术**：SQLite via `node:sqlite`/`DatabaseSync`，原生 SQL，无 ORM。
**主键策略**：UUID（TEXT 类型）。
**软删除**：多数业务表使用 `is_deleted` 字段（INTEGER，0=正常，1=已删除）。
**时间戳**：`created_at`、`updated_at`（DATETIME，DEFAULT CURRENT_TIMESTAMP）。

---

## 1. 用户与权限域

### 1.1 users 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 用户唯一标识 |
| username | TEXT | NOT NULL, UNIQUE | 登录用户名 |
| password | TEXT | NOT NULL | 密码哈希值（bcrypt） |
| real_name | TEXT | NOT NULL | 真实姓名 |
| role | TEXT | NOT NULL, DEFAULT 'operator' | 角色代码 |
| department | TEXT | 可选 | 所属部门 |
| phone | TEXT | 可选 | 联系电话 |
| email | TEXT | 可选 | 电子邮箱 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态（1=启用, 0=禁用） |
| is_deleted | INTEGER | NOT NULL, DEFAULT 0 | 软删除标记 |

**预置数据**：admin, wangkq, zhangwei, liuyf, zhaohp, sunli

### 1.2 roles 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 角色唯一标识 |
| code | TEXT | NOT NULL, UNIQUE | 角色代码 |
| name | TEXT | NOT NULL | 角色名称 |
| description | TEXT | 可选 | 角色描述 |
| permissions | TEXT | NOT NULL, DEFAULT '[]' | 权限列表（JSON 数组） |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态 |

**预置数据**：admin, warehouse_manager, technician, pathologist, procurement, finance

### 1.3 operation_logs 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 日志唯一标识 |
| user_id | TEXT | FK → users.id | 操作人 |
| username | TEXT | | 操作人用户名（冗余） |
| operation | TEXT | | 操作类型 |
| description | TEXT | | 操作描述 |
| request_data | TEXT | | 请求数据（JSON） |
| response_data | TEXT | | 响应数据（JSON） |
| ip | TEXT | | 客户端 IP |
| user_agent | TEXT | | 浏览器 UA |

### 1.4 login_attempts 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 记录标识 |
| username | TEXT | | 尝试登录的用户名 |
| ip_address | TEXT | | 客户端 IP |
| success | INTEGER | | 是否成功（0/1） |
| attempted_at | DATETIME | | 尝试时间 |

**前端接口**：`User`, `LoginForm`, `LoginResponse`, `Role`, `OperationLog`

---

## 2. 物料主数据域

### 2.1 material_categories 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 分类唯一标识 |
| code | TEXT | NOT NULL, UNIQUE | 分类编码 |
| name | TEXT | NOT NULL | 分类名称 |
| parent_id | TEXT | FK → material_categories.id | 父分类（支持层级） |
| level | INTEGER | NOT NULL, DEFAULT 1 | 层级深度 |
| sort_order | INTEGER | DEFAULT 0 | 排序序号 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态 |

### 2.2 materials 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 物料唯一标识 |
| code | TEXT | NOT NULL, UNIQUE | 物料编码 |
| name | TEXT | NOT NULL | 物料名称 |
| spec | TEXT | 可选 | 规格型号 |
| unit | TEXT | NOT NULL | 计量单位 |
| spec_qty | REAL | 可选 | 规格含量 |
| spec_unit | TEXT | 可选 | 规格单位 |
| category_id | TEXT | FK → material_categories.id | 所属分类 |
| supplier_id | TEXT | FK → suppliers.id | 默认供应商 |
| price | REAL | DEFAULT 0 | 参考单价 |
| min_stock | REAL | DEFAULT 0 | 最低库存 |
| max_stock | REAL | DEFAULT 0 | 最高库存 |
| safety_stock | REAL | DEFAULT 0 | 安全库存 |
| location_id | TEXT | FK → locations.id | 默认库位 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态 |
| is_deleted | INTEGER | NOT NULL, DEFAULT 0 | 软删除 |

### 2.3 suppliers 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 供应商唯一标识 |
| code | TEXT | NOT NULL, UNIQUE | 供应商编码 |
| name | TEXT | NOT NULL | 供应商名称 |
| contact | TEXT | 可选 | 联系人 |
| phone | TEXT | 可选 | 联系电话 |
| email | TEXT | 可选 | 电子邮箱 |
| address | TEXT | 可选 | 地址 |
| tax_no | TEXT | 可选 | 税号 |
| bank_name | TEXT | 可选 | 开户行 |
| bank_account | TEXT | 可选 | 银行账号 |
| cooperation_count | INTEGER | DEFAULT 0 | 合作次数 |
| total_amount | REAL | DEFAULT 0 | 累计金额 |
| rating | REAL | 可选 | 评级分数 |
| is_deleted | INTEGER | NOT NULL, DEFAULT 0 | 软删除 |

### 2.4 locations 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 库位唯一标识 |
| code | TEXT | NOT NULL, UNIQUE | 库位编码 |
| name | TEXT | NOT NULL | 库位名称 |
| type | TEXT | 可选 | 库位类型 |
| parent_id | TEXT | FK → locations.id | 父库位（支持层级） |
| zone | TEXT | 可选 | 区域 |
| shelf | TEXT | 可选 | 货架 |
| position | TEXT | 可选 | 位置 |
| capacity | REAL | DEFAULT 0 | 容量 |
| used | REAL | DEFAULT 0 | 已用容量 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态 |

**前端接口**：`Category`, `Material`, `Batch`, `Supplier`, `Location`

---

## 3. 入库与采购域

### 3.1 purchase_orders 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 采购订单标识 |
| order_no | TEXT | NOT NULL, UNIQUE | 订单编号 |
| material_id | TEXT | FK → materials.id | 物料 |
| supplier_id | TEXT | FK → suppliers.id | 供应商 |
| ordered_qty | REAL | NOT NULL | 订购数量 |
| received_qty | REAL | DEFAULT 0 | 已收数量 |
| unit | TEXT | NOT NULL | 单位 |
| unit_price | REAL | NOT NULL | 单价 |
| total_amount | REAL | NOT NULL | 总金额 |
| expected_date | TEXT | 可选 | 预计到货日期 |
| status | TEXT | NOT NULL | 状态（pending/received/cancelled） |

### 3.2 inbound_records 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 入库记录标识 |
| inbound_no | TEXT | NOT NULL, UNIQUE | 入库单号 |
| type | TEXT | NOT NULL | 入库类型（direct/purchase/return） |
| material_id | TEXT | FK → materials.id | 物料 |
| batch_id | TEXT | FK → batches.id | 批次 |
| quantity | REAL | NOT NULL | 入库数量 |
| unit | TEXT | NOT NULL | 单位 |
| price | REAL | NOT NULL | 单价 |
| amount | REAL | NOT NULL | 总金额 |
| supplier_id | TEXT | FK → suppliers.id | 供应商 |
| location_id | TEXT | FK → locations.id | 库位 |
| operator | TEXT | NOT NULL | 操作人 |
| status | TEXT | NOT NULL | 状态 |
| purchase_order_id | TEXT | FK → purchase_orders.id | 关联采购订单 |
| purchase_order_no | TEXT | | 采购订单编号（冗余） |

**前端接口**：`InboundRecord`, `InboundFormData`, `InboundType`, `PurchaseOrder`

---

## 4. 库存与批次域

### 4.1 inventory 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 库存记录标识 |
| material_id | TEXT | FK → materials.id, UNIQUE | 物料（每物料一条库存） |
| stock | REAL | NOT NULL, DEFAULT 0 | 当前库存量 |
| locked_stock | REAL | DEFAULT 0 | 锁定库存量 |
| location_id | TEXT | FK → locations.id | 库位 |
| last_inbound_id | TEXT | | 最近入库记录 |
| last_outbound_id | TEXT | | 最近出库记录 |
| last_inbound_date | TEXT | | 最近入库日期 |
| last_outbound_date | TEXT | | 最近出库日期 |

### 4.2 batches 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 批次标识 |
| material_id | TEXT | FK → materials.id | 物料 |
| batch_no | TEXT | NOT NULL | 批次号 |
| quantity | REAL | NOT NULL | 批次总量 |
| remaining | REAL | NOT NULL | 剩余量 |
| production_date | TEXT | 可选 | 生产日期 |
| expiry_date | TEXT | 可选 | 有效期 |
| inbound_id | TEXT | FK → inbound_records.id | 关联入库记录 |
| inbound_price | REAL | | 入库单价 |
| supplier_id | TEXT | FK → suppliers.id | 供应商 |
| verified | INTEGER | DEFAULT 0 | 是否已验证 |

### 4.3 stock_logs 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 日志标识 |
| type | TEXT | NOT NULL | 变动类型（inbound/outbound/return/scrap/transfer/stocktaking） |
| material_id | TEXT | FK → materials.id | 物料 |
| quantity | REAL | NOT NULL | 变动数量（正=入库，负=出库） |
| before_stock | REAL | | 变动前库存 |
| after_stock | REAL | | 变动后库存 |
| related_id | TEXT | | 关联记录 ID |
| related_type | TEXT | | 关联记录类型 |
| operator | TEXT | | 操作人 |

**前端接口**：`InventoryItem`, `InventoryStats`, `StockLog`

---

## 5. 出库域

### 5.1 outbound_records 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 出库记录标识 |
| outbound_no | TEXT | NOT NULL, UNIQUE | 出库单号 |
| type | TEXT | NOT NULL | 出库类型（project/transfer/scrap） |
| project_id | TEXT | FK → projects.id | 关联检测项目 |
| total_cost | REAL | DEFAULT 0 | 总成本 |
| sample_count | INTEGER | DEFAULT 0 | 样本数 |
| operator | TEXT | NOT NULL | 操作人 |
| status | TEXT | NOT NULL | 状态 |
| abc_total_cost | REAL | | ABC 总成本 |
| abc_activity_cost | REAL | | ABC 活动成本 |
| fee_amount | REAL | | 收费金额 |
| profit | REAL | | 利润 |

### 5.2 outbound_items 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 出库明细标识 |
| outbound_id | TEXT | FK → outbound_records.id | 出库记录 |
| material_id | TEXT | FK → materials.id | 物料 |
| batch_id | TEXT | FK → batches.id | 批次 |
| quantity | REAL | NOT NULL | 出库数量 |
| unit | TEXT | NOT NULL | 单位 |
| unit_cost | REAL | | 单位成本 |
| total_cost | REAL | | 总成本 |
| usage | REAL | | 用量 |
| receiver | TEXT | | 领用人 |

**前端接口**：`OutboundRecord`, `OutboundItem`, `OutboundFormData`, `OutboundType`

---

## 6. 退库、报废与调拨域

### 6.1 return_records 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 退库记录标识 |
| return_no | TEXT | NOT NULL, UNIQUE | 退库单号 |
| material_id | TEXT | FK → materials.id | 物料 |
| batch_id | TEXT | FK → batches.id | 批次 |
| quantity | REAL | NOT NULL | 退库数量 |
| unit_cost | REAL | | 单位成本 |
| total_cost | REAL | | 总成本 |
| outbound_item_id | TEXT | FK → outbound_items.id | 关联出库明细 |
| reason | TEXT | | 退库原因 |
| operator | TEXT | | 操作人 |
| status | TEXT | | 状态 |

### 6.2 scrap_records 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 报废记录标识 |
| scrap_no | TEXT | NOT NULL, UNIQUE | 报废单号 |
| material_id | TEXT | FK → materials.id | 物料 |
| batch_id | TEXT | FK → batches.id | 批次 |
| quantity | REAL | NOT NULL | 报废数量 |
| reason | TEXT | | 报废原因 |
| operator | TEXT | | 操作人 |
| status | TEXT | | 状态 |

### 6.3 supplier_returns 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 退货记录标识 |
| return_no | TEXT | NOT NULL, UNIQUE | 退货单号 |
| material_id | TEXT | FK → materials.id | 物料 |
| batch_id | TEXT | FK → batches.id | 批次 |
| quantity | REAL | NOT NULL | 退货数量 |
| supplier_id | TEXT | FK → suppliers.id | 供应商 |
| purchase_order_id | TEXT | FK → purchase_orders.id | 关联采购订单 |
| reason | TEXT | | 退货原因 |
| refund_amount | REAL | | 退款金额 |
| tracking_no | TEXT | | 物流单号 |
| status | TEXT | | 状态 |

**前端接口**：`ReturnRecord`, `ScrapRecord`, `TransferRecord`, `SupplierReturnRecord`, `SupplierReturnFormData`

---

## 7. 盘点域

### 7.1 stocktaking_records 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 盘点记录标识 |
| stocktaking_no | TEXT | NOT NULL, UNIQUE | 盘点单号 |
| material_id | TEXT | FK → materials.id | 物料 |
| system_stock | REAL | | 系统库存 |
| actual_stock | REAL | | 实际库存 |
| difference | REAL | | 差异数量 |
| operator | TEXT | | 操作人 |
| status | TEXT | | 状态（pending/confirmed） |

---

## 8. 项目与 BOM 域

### 8.1 projects 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 项目标识 |
| code | TEXT | NOT NULL, UNIQUE | 项目编码 |
| name | TEXT | NOT NULL | 项目名称 |
| type | TEXT | | 项目类型 |
| cycle | TEXT | | 检测周期 |
| bom_id | TEXT | FK → boms.id | 关联 BOM |
| supportable_samples | INTEGER | | 可支持样本数 |
| manager | TEXT | | 项目负责人 |
| description | TEXT | | 项目描述 |
| status | INTEGER | NOT NULL, DEFAULT 1 | 状态 |

### 8.2 boms 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | BOM 标识 |
| code | TEXT | NOT NULL, UNIQUE | BOM 编码 |
| name | TEXT | NOT NULL | BOM 名称 |
| version | TEXT | DEFAULT '1.0' | 版本号 |
| type | TEXT | | BOM 类型 |
| service_id | TEXT | | 服务 ID |
| supportable_samples | INTEGER | | 可支持样本数 |
| unit_cost | REAL | | 单位成本 |
| standard_labor_cost | REAL | | 标准人工成本 |
| standard_equipment_cost | REAL | | 标准设备成本 |
| standard_indirect_cost | REAL | | 标准间接成本 |
| standard_total_cost | REAL | | 标准总成本 |
| fee_standard_id | TEXT | | 收费标准 ID |
| fee_category | TEXT | | 收费类别 |
| standard_slide_cost | REAL | | 标准切片成本 |
| standard_fee_per_slide | REAL | | 标准每切片收费 |
| standard_margin_rate | REAL | | 标准利润率 |

### 8.3 bom_items 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | BOM 子项标识 |
| bom_id | TEXT | FK → boms.id | 所属 BOM |
| material_id | TEXT | FK → materials.id | 物料 |
| usage_per_sample | REAL | NOT NULL | 每样本用量 |
| unit | TEXT | | 单位 |
| is_alternative | INTEGER | DEFAULT 0 | 是否替代物料 |
| main_item_id | TEXT | FK → bom_items.id | 主物料（替代时指向） |
| group_name | TEXT | | 分组名称 |

### 8.4 BOM 扩展表（4 张）

| 表名 | 说明 |
|------|------|
| `bom_general_reagents` | BOM 通用试剂 |
| `bom_general_consumables` | BOM 通用耗材 |
| `bom_quality_controls` | BOM 质控品 |
| `bom_equipment_templates` | BOM 设备模板 |

**前端接口**：`Project`, `BOM`, `BOMMaterial`, `BOMVersion`, `BOMGeneralReagent`, `BOMGeneralConsumable`, `BOMQualityControl`, `BOMEquipmentTemplate`

---

## 9. 设备与工时域

### 9.1 equipment_types 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 设备类型标识 |
| code | TEXT | NOT NULL, UNIQUE | 类型编码 |
| name | TEXT | NOT NULL | 类型名称 |
| default_purchase_price | REAL | | 默认购入价 |
| default_depreciable_life_years | INTEGER | | 默认折旧年限 |
| default_residual_value | REAL | | 默认残值 |
| default_depreciation_method | TEXT | | 默认折旧方法 |
| default_total_capacity | REAL | | 默认总产能 |

**预置数据**：切片机、染色机、扫描仪、PCR 仪、其他

### 9.2 equipment 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 设备标识 |
| code | TEXT | NOT NULL, UNIQUE | 设备编码 |
| name | TEXT | NOT NULL | 设备名称 |
| model | TEXT | | 型号 |
| manufacturer | TEXT | | 制造商 |
| purchase_price | REAL | | 购入价 |
| purchase_date | TEXT | | 购入日期 |
| depreciable_life_years | INTEGER | | 折旧年限 |
| residual_value | REAL | | 残值 |
| depreciation_method | TEXT | | 折旧方法 |
| total_capacity | REAL | | 总产能 |
| type_id | TEXT | FK → equipment_types.id | 设备类型 |

### 9.3 equipment_usage 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 使用记录标识 |
| equipment_id | TEXT | FK → equipment.id | 设备 |
| project_id | TEXT | FK → projects.id | 检测项目 |
| outbound_id | TEXT | FK → outbound_records.id | 出库记录 |
| usage_minutes | REAL | | 使用分钟 |
| usage_count | INTEGER | | 使用次数 |
| depreciation_cost | REAL | | 折旧成本 |
| operator | TEXT | | 操作人 |
| usage_date | TEXT | | 使用日期 |

### 9.4 standard_labor_times 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 工时记录标识 |
| step_code | TEXT | NOT NULL, UNIQUE | 步骤编码 |
| step_name | TEXT | NOT NULL | 步骤名称 |
| project_type | TEXT | | 项目类型 |
| standard_minutes | REAL | NOT NULL | 标准分钟数 |
| labor_rate_per_minute | REAL | | 每分钟人工费率 |
| is_equipment_step | INTEGER | DEFAULT 0 | 是否设备步骤 |
| skill_level | TEXT | | 技能等级 |
| skill_rate_multiplier | REAL | DEFAULT 1.0 | 技能费率系数 |

**预置数据**：10 条标准工时记录

**前端接口**：`Equipment`, `EquipmentType`, `DepreciationStat`, `EquipmentUsage`, `StandardLaborTime`

---

## 10. 成本核算域

### 10.1 indirect_cost_centers 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 成本中心标识 |
| code | TEXT | NOT NULL, UNIQUE | 成本中心编码 |
| name | TEXT | NOT NULL | 成本中心名称 |
| cost_type | TEXT | | 成本类型 |
| monthly_amount | REAL | | 月度金额 |
| allocation_base | TEXT | | 分摊基准 |
| description | TEXT | | 描述 |

### 10.2 indirect_cost_allocations 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 分摊记录标识 |
| cost_center_id | TEXT | FK → indirect_cost_centers.id | 成本中心 |
| year_month | TEXT | | 年月 |
| total_amount | REAL | | 分摊总额 |
| allocation_base_value | REAL | | 分摊基准值 |
| allocation_rate | REAL | | 分摊率 |

### 10.3 project_cost_details 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 明细标识 |
| outbound_id | TEXT | FK → outbound_records.id | 出库记录 |
| project_id | TEXT | FK → projects.id | 检测项目 |
| sample_count | INTEGER | | 样本数 |
| material_cost | REAL | | 材料成本 |
| labor_cost | REAL | | 人工成本 |
| equipment_cost | REAL | | 设备成本 |
| qc_cost | REAL | | 质控成本 |
| indirect_cost | REAL | | 间接成本 |
| total_cost | REAL | | 总成本 |
| cost_month | TEXT | | 成本月份 |

**前端接口**：`IndirectCostCenter`, `IndirectCostAllocation`, `CostPreview`

---

## 11. ABC 作业成本域（12 表）

### 11.1 核心表

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `abc_activity_centers` | 作业中心 | code, name, cost_driver_type, parent_id, status |
| `abc_cost_drivers` | 成本动因 | code, name, unit, calculation_method, tier_rules |
| `abc_cost_pools` | 成本池（按月归集） | activity_center_id, year_month, direct_cost, indirect_cost, total_cost, driver_quantity, driver_rate |
| `abc_driver_rates` | 动因费率 | cost_driver_id, year_month, rate, base_quantity |
| `abc_bom_activity_links` | BOM 与作业关联 | bom_id, activity_center_id, cost_driver_id, driver_quantity |

### 11.2 业务表

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `outbound_abc_details` | 出库 ABC 成本明细 | outbound_id, bom_id, project_id, sample_count, slide_count, material_cost, activity_cost, total_cost, cost_per_slide, fee_amount, profit, profit_rate |
| `slide_cost_snapshots` | 切片成本快照 | snapshot_date, bom_id, project_type, std_material_cost, std_activity_cost, std_total_cost, std_cost_per_slide, fee_category, standard_fee, margin, margin_rate |
| `case_cost_records` | 病例成本记录 | case_id, slide_id, bom_id, slide_count, block_count, material_cost, activity_costs, total_cost, fee_amount, profit, profit_rate |
| `fee_standards` | 收费标准 | code, name, category, unit, base_price, tier_rules, cap_amount, is_self_pay, effective_date |
| `cost_budgets` | 成本预算 | year_month, category, budget_amount, actual_amount, execution_rate, status |
| `quality_costs` | 质量成本 | year_month, cost_type, sub_type, amount, description |
| `cost_alert_rules` | 成本预警规则 | rule_type, threshold_value, comparison, notification_type, status |
| `cost_audit_logs` | 成本审计日志 | action, target_type, target_id, old_value, new_value, reason, operator |
| `cost_adjustments` | 季度成本调整 | cost_center_id, year_quarter, pre_provision_amount, actual_amount, adjustment_amount, review_status |

**前端接口**：`CostAdjustment`

---

## 12. 预警域

### 12.1 alert_rules 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 规则标识 |
| type | TEXT | NOT NULL | 预警类型（low_stock/expiry/stagnant） |
| name | TEXT | NOT NULL | 规则名称 |
| threshold | REAL | | 阈值 |
| threshold_days | INTEGER | | 阈值天数 |
| enabled | INTEGER | DEFAULT 1 | 是否启用 |

**预置数据**：低库存预警、有效期预警、呆滞预警

### 12.2 alerts 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 预警记录标识 |
| type | TEXT | NOT NULL | 预警类型 |
| level | TEXT | | 预警级别 |
| material_id | TEXT | FK → materials.id | 物料 |
| material_name | TEXT | | 物料名称（冗余） |
| current_stock | REAL | | 当前库存 |
| threshold | REAL | | 阈值 |
| message | TEXT | | 预警消息 |
| status | TEXT | DEFAULT 'pending' | 状态（pending/handled） |
| handled_by | TEXT | | 处理人 |

**前端接口**：`Alert`, `AlertRule`

---

## 13. 批次追踪与对账域

### 13.1 batch_usage_tracking 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 追踪标识 |
| material_id | TEXT | FK → materials.id | 物料 |
| batch | TEXT | | 批次号 |
| total_qty | REAL | | 总量 |
| remaining | REAL | | 剩余量 |
| start_date | TEXT | | 开始日期 |
| days_used | INTEGER | | 已用天数 |
| expected_days | INTEGER | | 预计天数 |
| progress | REAL | | 进度 |
| usage | REAL | | 用量 |
| receiver | TEXT | | 领用人 |
| status | TEXT | | 状态 |

### 13.2 batch_depletion 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 消耗记录标识 |
| tracking_id | TEXT | FK → batch_usage_tracking.id | 追踪记录 |
| material_id | TEXT | FK → materials.id | 物料 |
| batch | TEXT | | 批次号 |
| total_qty | REAL | | 总量 |
| remain_qty | REAL | | 剩余量 |
| start_date | TEXT | | 开始日期 |
| end_date | TEXT | | 结束日期 |
| days_used | INTEGER | | 已用天数 |
| actual_days | INTEGER | | 实际天数 |
| deplete_type | TEXT | | 消耗类型 |

### 13.3 lis_cases 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 病例标识 |
| case_no | TEXT | NOT NULL, UNIQUE | 病例号 |
| project_id | TEXT | | 检测项目 ID |
| project_name | TEXT | | 检测项目名称 |
| operator | TEXT | | 操作人 |
| operate_time | TEXT | | 操作时间 |
| status | TEXT | | 状态 |
| import_batch | TEXT | | 导入批次 |

### 13.4 reconciliation_logs 表

| 字段 | 类型 | 约束 | 业务含义 |
|------|------|------|----------|
| id | TEXT | PK | 日志标识 |
| type | TEXT | | 对账类型 |
| target_id | TEXT | | 目标 ID |
| target_name | TEXT | | 目标名称 |
| field | TEXT | | 修改字段 |
| old_value | TEXT | | 原值 |
| new_value | TEXT | | 新值 |
| reason | TEXT | | 修改原因 |
| operator | TEXT | | 操作人 |

---

## 14. 通用类型（前端）

| 接口名 | 说明 |
|--------|------|
| `ApiResponse<T>` | 统一 API 响应（success, data, message） |
| `PaginationData<T>` | 分页数据（list, pagination: page/pageSize/total/totalPages） |
| `PageParams` | 分页请求参数（page, pageSize, keyword, sortField, sortOrder） |

---

## 15. 表间关系概览

```
material_categories ←── materials ←── batches
       ↑                   ↑              ↑
    locations          suppliers      inbound_records ←── purchase_orders
       ↑                   ↑              ↑
    inventory          outbound_records ←┘
                          ↑
                    outbound_items ←── return_records
                          ↑
                    outbound_abc_details
                          ↑
                    projects ←── boms ←── bom_items
                                ←── bom_general_reagents
                                ←── bom_general_consumables
                                ←── bom_quality_controls
                                ←── bom_equipment_templates
                                ←── abc_bom_activity_links

equipment_types ←── equipment ←── equipment_usage
indirect_cost_centers ←── indirect_cost_allocations
abc_activity_centers ←── abc_cost_pools
abc_cost_drivers ←── abc_driver_rates
alert_rules ←── alerts
batch_usage_tracking ←── batch_depletion
```

---

## 16. PM 审核确认

| 确认项 | PM 判断 |
|--------|---------|
| 数据对象是否覆盖所有业务实体 | 待确认 |
| 字段命名是否可理解（非技术术语） | 待确认 |
| 是否有遗漏的业务字段 | 待确认 |
| 表间关系是否正确 | 待确认 |
| 是否需要补充业务含义说明 | 待确认 |
