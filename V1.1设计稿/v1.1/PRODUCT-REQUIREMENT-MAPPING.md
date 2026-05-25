# COREONE 产品需求功能映射（v1.1）

> **生成日期**: 2026-05-22
> **生成方式**: 基于 ECC 机制，从实际代码反推 + 产品经理业务确认
> **目的**: 修正设计稿对产品需求的理解偏差，建立"代码现实"与"业务需求"的准确映射

---

## 一、业务模型定义（已确认）

### 1.1 三级结构（产品经理确认）

```
物料（一级）        →  抗体（大类）
  └─ 分类树          →  一抗 / 二抗（子类，由 categories 表管理）
       └─ 耗材（二级）→  ki-67（具体试剂，由 materials 表管理）
            └─ 实例（三级）→  批次#001，100盒，有效期2026-12（由 inventory + batches 表管理）
```

### 1.2 术语对照表

| 业务术语 | 代码中的对应 | 说明 |
|---------|-------------|------|
| 物料 | `categories`（分类树） | 大类/子类，如"抗体"→"一抗" |
| 耗材 | `materials`（物料表） | 具体项，如"ki-67"，含规格/单位/价格 |
| 耗材实例 | `inventory` + `batches` | 实际库存，含批次/数量/有效期 |
| 退库（场景A） | `returns` | 出库后发现有问题，退回仓库 |
| 退货（场景B） | 暂无 | 采购到货后发现不合格，退回供应商 |

---

## 二、当前已实现功能（代码实际状态）

### 2.1 前端有页面 + 后端有 API（功能完整）

| 功能 | 前端页面 | 后端路由 | 角色权限 |
|------|---------|---------|---------|
| 仪表盘 | `Dashboard.tsx` | `/api/health` | 全部角色 |
| 物料分类 | `master/Categories.tsx` | `categories-v1.1.ts` | 全部已认证 |
| 耗材管理 | `master/Materials.tsx` | `materials.ts` | admin/warehouse/technician/pathologist/procurement |
| 供应商管理 | `master/Suppliers.tsx` | `suppliers-v1.1.ts` | admin/warehouse/procurement |
| 库位管理 | `master/Locations.tsx` | `locations-v1.1.ts` | admin/warehouse |
| 检测项目 | `master/Projects.tsx` | `projects-v1.1.ts` | admin/technician/pathologist |
| 库存列表 | `inventory/InventoryList.tsx` | `inventory-v1.1.ts` | 多角色 |
| 库存盘点 | `inventory/Stocktaking.tsx` | `stocktaking-v1.1.ts` | admin/warehouse |
| 入库记录 | `inbound/Inbound.tsx` | `inbound-v1.1.ts` | admin/warehouse/procurement |
| 出库记录 | `outbound/Outbound.tsx` | `outbound-v1.1.ts` | admin/warehouse/technician/pathologist |
| BOM清单 | `bom/BOM.tsx` | `bom-v1.1.ts` | admin/technician/pathologist |
| 消耗对账 | `reconciliation/Reconciliation.tsx` | `reconciliation-v1.1.ts` | admin/finance/pathologist |
| 物料成本分析 | `report/CostAnalysis.tsx` | `depletion-v1.1.ts` | admin/finance/pathologist |
| 预警中心 | `alerts/Alerts.tsx` | `alerts-v1.1.ts` | 多角色 |
| 用户管理 | `system/Users.tsx` | `users-v1.1.ts` | admin |
| 角色权限 | `system/Roles.tsx` | `roles-v1.1.ts` | admin |
| 操作日志 | `system/Logs.tsx` | `logs-v1.1.ts` | admin |

### 2.2 后端有 API 但前端无页面（功能不完整）

| 功能 | 后端路由 | 前端状态 | 备注 |
|------|---------|---------|------|
| 退库（场景A） | `returns-v1.1.ts` | ❌ 无页面 | 出库后退回仓库 |
| 报废 | `scraps-v1.1.ts` | ❌ 无页面 | 库存物料报废 |
| 调拨 | `transfers-v1.1.ts` | ❌ 无页面 | 库位间物料调拨 |
| 采购订单 | `purchase-orders-v1.1.ts` | ⚠️ 无菜单入口 | 整合在入库中但不完善 |
| 退货（场景B） | ❌ 无 | ❌ 无页面 | 采购到货后退回供应商 |

### 2.3 前端有页面但设计稿理解有误

| 设计稿名称 | 实际代码 | 偏差说明 |
|-----------|---------|---------|
| `consumable-config` | `master/Materials.tsx` | 设计稿以为是独立功能，实际是"耗材管理"页面 |
| `inventory-detail` | 内嵌弹窗 | 设计稿以为是独立页面，实际是库存列表的详情弹窗 |
| `project-detail` | 内嵌弹窗 | 设计稿以为是独立页面，实际是项目列表的详情弹窗 |
| `bom-versions` | 整合在 BOM 页面 | 设计稿以为是独立页面，实际是 BOM 页面中的版本管理功能 |

---

## 三、设计稿理解偏差修正

### 3.1 业务概念偏差

| 设计稿理解 | 正确理解 | 修正建议 |
|-----------|---------|---------|
| `returns` = "退货" | 实际应为"退库"（出库后退回仓库） | 页面名称改为"退库管理" |
| `consumable-config` = 独立配置功能 | 实际就是"耗材管理"页面 | 合并到 `Materials` 页面描述中 |
| `materials` = 物料大类 | 实际 `materials` 表存的是具体耗材（ki-67级别） | 明确区分：categories=物料分类，materials=耗材 |
| 前端页面数量 20 个 | 实际只有 15 个独立页面 | 按实际代码重新统计 |

### 3.2 技术栈偏差

| 设计稿描述 | 实际代码 | 修正 |
|-----------|---------|------|
| 前端：React 19 + Router v7 | React 18.3 + Router DOM 6.30 | 修正版本号 |
| 后端：Express + PostgreSQL | Express + SQLite (node:sqlite) | 修正数据库 |
| UI：自定义组件库 | Radix UI + Tailwind CSS | 修正组件库来源 |
| 前端构建：Vite | Vite (正确) | 保留 |

### 3.3 API 路径偏差

| 设计稿路径 | 实际路径 | 修正 |
|-----------|---------|------|
| `/api/v1/inventory/categories` | `/api/v1/categories` | 去掉冗余前缀 |
| `/api/v1/inventory/consumables` | `/api/v1/materials` | 统一命名 |

---

## 四、代码与需求差距清单

### 4.1 高优先级差距（影响核心业务流程）

| 差距 | 影响 | 建议方案 |
|------|------|---------|
| 缺少退库前端页面 | 出库后无法退回仓库 | 新增"退库管理"页面，与出库页面同级 |
| 缺少报废前端页面 | 无法处理物料报废 | 新增"报废管理"页面，或整合在库存操作中 |
| 缺少调拨前端页面 | 无法做库位间调拨 | 新增"调拨管理"页面 |
| 采购订单前端不完善 | 采购流程不完整 | 补全采购订单独立页面或完善入库中的采购流程 |
| 缺少采购退货（场景B） | 到货不合格无法退回供应商 | 后端新增退货 API，前端在采购/入库流程中添加退货入口 |

### 4.2 中优先级差距（功能增强）

| 差距 | 影响 | 建议方案 |
|------|------|---------|
| BOM 版本管理前端不明显 | 用户可能找不到版本切换 | 在 BOM 页面中强化版本管理入口 |
| 库存详情为弹窗非页面 | 如设计稿预期是独立页面需调整 | 确认需求：弹窗即可，还是需要独立详情页 |
| 缺少 alert-history | 无法查看历史预警 | 在预警中心页面添加"历史预警"标签页 |

### 4.3 命名不一致（需统一）

| 代码命名 | 业务命名 | 建议统一为 |
|---------|---------|-----------|
| 物料分类（/categories） | 物料（大类） | 保留"物料分类" |
| 耗材管理（/materials） | 耗材（具体项） | 保留"耗材管理" |
| 退库（returns API） | 退库 | 统一为"退库" |
| 物料成本分析（/cost-analysis） | 成本分析 | 保留"物料成本分析" |

---

## 五、后续版本规划

### 5.1 v1.2 版本（补全基础功能）

| 功能 | 优先级 | 工作量估算 |
|------|--------|-----------|
| 退库管理前端页面 | P0 | 3-5天 |
| 报废管理前端页面 | P0 | 3-5天 |
| 调拨管理前端页面 | P0 | 3-5天 |
| 采购退货（场景B）后端 API | P0 | 2-3天 |
| 采购订单前端完善 | P1 | 3-5天 |

### 5.2 v1.3 版本（功能增强）

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 预警历史记录 | P1 | 在预警中心添加历史标签页 |
| 库存详情独立页面 | P2 | 如业务需要，将弹窗升级为独立页面 |
| 批次管理强化 | P1 | 完善批次追踪、有效期预警 |

### 5.3 v2.0 版本（长期规划）

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 智能采购建议 | P2 | 基于库存和消耗数据自动生成采购建议 |
| 多院区协同 | P2 | 支持多实验室/院区数据互通 |
| 移动端支持 | P2 | 扫码入库/出库移动端适配 |

---

## 六、核心业务数据链路（已确认）

```
物料分类（categories）
    ↓ 关联
耗材（materials）
    ↓ 入库
库存（inventory）+ 批次（batches）
    ↓ 出库/BOM关联
消耗记录
    ↓ 对账
消耗对账（reconciliation）
    ↓ 分析
物料成本分析（cost-analysis）
```

**核心目标**：通过 BOM 预估消耗 → 实际出库对账 → 成本分析，有效控制实验室成本。

---

## 七、设计稿修正检查清单

基于本文档，设计稿需要修正的内容：

- [ ] 技术栈描述按本文档修正（SQLite、React 18.3 等）
- [ ] API 路径按本文档修正
- [ ] `returns` 统一改为"退库"（而非"退货"）
- [ ] `consumable-config` 合并到"耗材管理"描述中
- [ ] 删除独立的 `bom-versions`、`inventory-detail`、`project-detail` 页面描述，改为弹窗/内嵌功能
- [ ] 补充"退库管理"、"报废管理"、"调拨管理"页面描述（v1.2 规划）
- [ ] 页面数量按实际代码重新统计
- [ ] 角色权限矩阵按本文档修正

---

*本文档基于 ECC 机制生成，随代码演进持续更新。*
