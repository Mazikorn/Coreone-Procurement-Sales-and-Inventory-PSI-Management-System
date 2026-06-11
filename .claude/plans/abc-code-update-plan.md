# ABC 成本法 v4.3 — 全量代码更新计划

> **基于**: v4.3 产品功能定义 + 页面流程设计 + 代码库 Gap 分析  
> **日期**: 2026-06-04  
> **方案**: B+（3.5周，15天开发 + 3天缓冲）

---

## 总览：现状 vs 目标

| 维度 | 现状 | 目标 | 差距 |
|------|------|------|------|
| 设备类型管理 | ❌ 不存在 | ✅ CRUD + 关联 | 新建整个模块 |
| 设备折旧统计 | ❌ 不存在 | ✅ 按类型聚合 | 新建页面+API |
| BOM设备模板 | 按设备ID配置 | 按设备类型配置 | 修改数据模型 |
| 成本预览 | ❌ 不存在 | ✅ BOM成本预览弹窗 | 新建组件+API |
| 参考值来源标签 | ❌ 不存在 | ✅ 标签显示+筛选 | 修改数据模型+页面 |
| 季度调整 | ❌ 不存在 | ✅ 自动+手动+审核 | 新建整个模块 |
| 成本差异分析增强 | 基础表格 | 图表+下钻+对比 | 增强现有页面 |
| 成本趋势季度聚合 | 仅月度 | 月度+季度 | 增强现有页面 |
| 成本结构饼图 | 按活动中心 | 按成本类型 | 增强现有页面 |

---

## Phase 1: 设备管理基础（第1周，4天）

### 1.1 数据库变更 — 设备类型表

**文件**: `后端代码/server/src/database/DatabaseManager.ts`

```sql
-- 新增表
CREATE TABLE IF NOT EXISTS equipment_types (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  status INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- equipment 表新增 type_id 字段（迁移兼容）
ALTER TABLE equipment ADD COLUMN type_id TEXT REFERENCES equipment_types(id);
```

**任务清单**:
- [ ] 在 `initializeDatabase()` 中添加 `equipment_types` 表创建
- [ ] 添加 `equipment.type_id` 迁移逻辑（`PRAGMA table_info` 检查）
- [ ] 种子数据：预置 5-8 个设备类型（切片机、染色机、扫描仪、PCR仪等）

### 1.2 后端 API — 设备类型 CRUD

**新建文件**: `后端代码/server/src/routes/equipment-types-v1.1.ts`

| 端点 | 方法 | 说明 | 权限 |
|------|------|------|------|
| `/` | GET | 列表（分页、关键词搜索） | admin, technician |
| `/:id` | GET | 详情 | admin, technician |
| `/` | POST | 创建 | admin |
| `/:id` | PUT | 更新 | admin |
| `/:id` | DELETE | 删除（检查关联设备） | admin |

**注册路由** (`app.ts`):
```typescript
app.use('/api/v1/equipment-types', authenticateToken, requireRole('admin', 'technician'), equipmentTypesRouter);
```

**实现要点**:
- 遵循现有路由模式（`success()`, `successList()`, `error()`）
- DELETE 时检查 `equipment` 表是否有 `type_id` 关联，有则拒绝删除
- 返回 camelCase 格式

### 1.3 后端 API — 设备折旧统计

**修改文件**: `后端代码/server/src/routes/equipment-v1.1.ts`

新增端点：
| 端点 | 方法 | 说明 |
|------|------|------|
| `/depreciation-stats` | GET | 按设备类型聚合折旧统计 |

**查询逻辑**:
```sql
SELECT
  et.id as type_id,
  et.name as type_name,
  COUNT(e.id) as equipment_count,
  SUM(e.purchase_price) as total_purchase_price,
  SUM(e.purchase_price - e.residual_value) / e.depreciable_life_years as total_annual_depreciation,
  SUM((e.purchase_price - e.residual_value) / e.depreciable_life_years / 12) as total_monthly_depreciation
FROM equipment_types et
LEFT JOIN equipment e ON e.type_id = et.id AND e.status != 'scrapped'
GROUP BY et.id
ORDER BY total_annual_depreciation DESC;
```

**前端 API** (`api/master.ts`):
```typescript
equipmentApi: {
  // ... 现有方法
  getTypes: (params) => request.get('/equipment-types', { params }),
  getTypeDetail: (id) => request.get(`/equipment-types/${id}`),
  createType: (data) => request.post('/equipment-types', data),
  updateType: (id, data) => request.put(`/equipment-types/${id}`, data),
  deleteType: (id) => request.delete(`/equipment-types/${id}`),
  getDepreciationStats: (params) => request.get('/equipment/depreciation-stats', { params }),
}
```

### 1.4 前端 — 设备类型管理页

**新建文件**:
- `前端代码/src/pages/equipment/EquipmentTypeList.tsx`
- `前端代码/src/pages/equipment/components/EquipmentTypeFormModal.tsx`
- `前端代码/src/pages/equipment/hooks/useEquipmentTypePage.ts`

**页面设计**（参考 v4.3-page-flow.md §2.3）:
- 列表表格：类型编码、类型名称、设备数量、状态、操作
- 新增/编辑弹窗：编码、名称、描述、状态
- 删除确认（检查关联设备）

**路由**: `/equipment/types`  
**侧边栏**: 在"设备管理"下新增"设备类型管理"入口

### 1.5 前端 — 设备列表页改造

**修改文件**: `前端代码/src/pages/equipment/EquipmentList.tsx`

- 新增"设备类型"筛选下拉框
- 表格新增"设备类型"列
- 新增"设备类型管理"按钮（跳转 `/equipment/types`）
- 新增"折旧统计"按钮（跳转 `/equipment/depreciation-stats`）
- 新增/编辑弹窗中新增"设备类型"选择

**修改文件**: `前端代码/src/pages/equipment/components/EquipmentFormModal.tsx`
- 新增设备类型下拉选择字段

### 1.6 前端 — 设备折旧统计页

**新建文件**:
- `前端代码/src/pages/equipment/EquipmentDepreciationStats.tsx`
- `前端代码/src/pages/equipment/components/DepreciationChart.tsx`

**页面设计**（参考 v4.3-page-flow.md §2.4）:
- 筛选：时间范围、设备类型
- 图表：按设备类型的折旧金额柱状图（Recharts BarChart）
- 表格：设备类型、设备数量、总购置价、年折旧额、月折旧额
- 导出 Excel 按钮

**路由**: `/equipment/depreciation-stats`

### 1.7 前端 — BOM 设备模板改为按类型

**数据库变更**:
```sql
ALTER TABLE bom_equipment_templates ADD COLUMN equipment_type_id TEXT REFERENCES equipment_types(id);
```

**修改文件**:
- `后端代码/server/src/routes/bom-v1.1.ts` — 创建/更新 BOM 时支持 `equipment_type_id`
- `前端代码/src/pages/bom/components/BOMFormModal.tsx` — 设备模板部分改为选择设备类型（而非单台设备）
- `前端代码/src/types/index.ts` — `BOMEquipmentTemplate` 新增 `equipmentTypeId`, `equipmentTypeName`

**计算逻辑变更**:
- 设备成本 = 该类型所有设备的平均月折旧额 × 使用时长 / 月总工时
- 需修改 `cost-calculator.ts` 中的 `calculateEquipmentCost`

---

## Phase 2: 成本报表增强（第2周，4天）

### 2.1 数据库变更 — 参考值来源标签

**文件**: `后端代码/server/src/database/DatabaseManager.ts`

```sql
ALTER TABLE standard_labor_times ADD COLUMN reference_source TEXT DEFAULT 'system';
```

**可选值**: `supplier`（供应商）, `industry`（行业）, `system`（系统预设）

### 2.2 后端 API — 参考值来源

**修改文件**: `后端代码/server/src/routes/labor-time-v1.1.ts`

- POST/PUT 端点新增 `referenceSource` 参数
- GET 列表返回 `referenceSource` 字段
- GET 列表新增 `referenceSource` 筛选参数

### 2.3 前端 — 工时列表页改造

**修改文件**:
- `前端代码/src/pages/labor/LaborTimeList.tsx` — 表格新增"参考值来源"列（Tag 标签：供应商/行业/系统预设）
- `前端代码/src/pages/labor/components/LaborTimeFormModal.tsx` — 新增"参考值来源"下拉选择
- `前端代码/src/types/index.ts` — `StandardLaborTime` 新增 `referenceSource`

### 2.4 后端 API — 成本差异分析增强

**修改文件**: `后端代码/server/src/routes/reports-v1.1.ts`

新增端点：
| 端点 | 方法 | 说明 |
|------|------|------|
| `/cost-variance` | GET | 成本差异分析（实际vs标准，支持月度对比） |

**查询参数**:
- `startDate`, `endDate` — 时间范围
- `compareType` — `actual_vs_standard` | `month_vs_month`
- `projectType` — 项目类型筛选

**返回结构**:
```typescript
interface CostVarianceResponse {
  summary: {
    totalActual: number;
    totalStandard: number;
    totalVariance: number;
    varianceRate: number;
  };
  items: Array<{
    projectId: string;
    projectName: string;
    materialActual: number;
    materialStandard: number;
    laborActual: number;
    laborStandard: number;
    equipmentActual: number;
    equipmentStandard: number;
    indirectActual: number;
    indirectStandard: number;
    totalActual: number;
    totalStandard: number;
    totalVariance: number;
    varianceRate: number;
  }>;
  trend: Array<{
    month: string;
    totalVariance: number;
    varianceRate: number;
  }>;
}
```

### 2.5 前端 — 成本差异分析增强

**修改文件**: `前端代码/src/pages/cost/CostVarianceAnalysis.tsx`

增强内容：
- 新增差异趋势折线图（Recharts LineChart）
- 表格新增成本要素分解列（材料/人工/设备/间接）
- 新增对比维度切换（实际vs标准 / 本月vs上月）
- 新增导出 Excel 功能
- 支持点击项目下钻到成本明细

### 2.6 后端 API — 成本月度环比

**修改文件**: `后端代码/server/src/routes/reports-v1.1.ts`

新增端点：
| 端点 | 方法 | 说明 |
|------|------|------|
| `/cost-monthly-comparison` | GET | 本月vs上月成本对比 |

**返回结构**:
```typescript
interface MonthlyComparisonResponse {
  currentMonth: { totalCost, materialCost, laborCost, equipmentCost, indirectCost };
  previousMonth: { totalCost, materialCost, laborCost, equipmentCost, indirectCost };
  changes: { totalChange, materialChange, laborChange, equipmentChange, indirectChange };
}
```

### 2.7 前端 — 成本月度环比

**修改文件**: `前端代码/src/pages/cost/CostDashboard.tsx`

- 新增"月度环比"卡片区域
- 显示本月vs上月的成本变化（金额+百分比+箭头方向）
- 各成本要素的变化明细

---

## Phase 3: 成本分析能力（第3周，3天）

### 3.1 后端 API — 成本趋势季度聚合

**修改文件**: `后端代码/server/src/routes/reports-v1.1.ts`

修改 `/cost-trend` 端点：
- 新增 `dimension` 参数：`monthly`（默认）| `quarterly`
- 季度聚合时按 `Q1/Q2/Q3/Q4` 分组

### 3.2 前端 — 成本趋势季度聚合

**修改文件**: `前端代码/src/pages/cost/CostTrend.tsx`

- 新增时间粒度切换：月度 / 季度
- 季度视图下：
  - 折线图 X 轴改为 Q1/Q2/Q3/Q4
  - 表格按季度聚合显示
  - 支持季度同比（如 Q2 2026 vs Q2 2025）

### 3.3 后端 API — 成本预览

**修改文件**: `后端代码/server/src/routes/bom-v1.1.ts`

新增端点：
| 端点 | 方法 | 说明 |
|------|------|------|
| `/:id/cost-preview` | GET | BOM 全成本预览 |

**计算逻辑**:
```
总成本 = 直接材料成本 + 人工成本 + 设备成本 + 间接费用
- 直接材料 = Σ(bom_items.material单价 × 用量) + 通用试剂配额 + 通用耗材配额 + 质控品配额
- 人工成本 = Σ(标准工时 × 费率)
- 设备成本 = Σ(设备类型平均折旧 × 使用时长 / 月总工时)
- 间接费用 = Σ(成本中心月度费用 × 分摊比例)
```

**返回结构**:
```typescript
interface CostPreviewResponse {
  bomId: string;
  bomName: string;
  totalCost: number;
  breakdown: {
    materialCost: { amount: number; percentage: number; items: Array<{name, amount}> };
    laborCost: { amount: number; percentage: number; items: Array<{stepName, minutes, rate, amount}> };
    equipmentCost: { amount: number; percentage: number; items: Array<{typeName, minutes, rate, amount}> };
    indirectCost: { amount: number; percentage: number; items: Array<{centerName, amount}> };
  };
  updatedAt: string;
}
```

### 3.4 前端 — 成本预览弹窗

**新建文件**:
- `前端代码/src/pages/bom/components/CostPreviewModal.tsx`

**页面设计**（参考 v4.3-page-flow.md §2.9）:
- BOM 名称（只读）
- 成本汇总卡片：直接材料、人工成本、设备成本、间接费用、总成本
- 成本占比饼图（Recharts PieChart）
- 成本明细表格：成本项、金额、占比、说明
- "刷新成本"按钮、"关闭"按钮

**集成位置**: `BOM.tsx` 列表和详情页新增"成本预览"按钮

### 3.5 前端 — 成本结构饼图增强

**修改文件**: `前端代码/src/pages/cost/CostDashboard.tsx`

- 现有饼图按活动中心展示 → 新增切换选项：按活动中心 / 按成本类型
- 按成本类型视图：材料(53%) / 人工(28%) / 设备(9%) / 间接(10%)
- 饼图支持点击下钻

---

## Phase 4: 完整闭环（第4周，4天）

### 4.1 数据库变更 — 季度调整

**文件**: `后端代码/server/src/database/DatabaseManager.ts`

```sql
CREATE TABLE IF NOT EXISTS cost_adjustments (
  id TEXT PRIMARY KEY,
  cost_center_id TEXT NOT NULL,
  year_quarter TEXT NOT NULL,        -- '2026-Q2'
  adjustment_amount DECIMAL(18,4) DEFAULT 0,
  pre_provision_amount DECIMAL(18,4) DEFAULT 0,  -- 预提金额
  actual_amount DECIMAL(18,4) DEFAULT 0,          -- 实际发生额
  adjustment_reason TEXT,
  adjusted_by TEXT,
  adjusted_at DATETIME,
  review_status TEXT DEFAULT 'pending',  -- pending/approved/rejected
  reviewed_by TEXT,
  reviewed_at DATETIME,
  review_reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (cost_center_id) REFERENCES indirect_cost_centers(id)
);
```

### 4.2 后端 API — 季度调整

**新建文件**: `后端代码/server/src/routes/cost-adjustment-v1.1.ts`

| 端点 | 方法 | 说明 |
|------|------|------|
| `/suggestions` | GET | 获取季度调整建议（自动计算） |
| `/` | POST | 手动创建调整记录 |
| `/:id/review` | POST | 审核调整（approved/rejected） |
| `/` | GET | 调整记录列表 |

**自动计算逻辑**:
```typescript
// 季度调整 = 实际发生额 - 预提金额
// 预提金额 = indirect_cost_allocations 中该季度3个月的总和
// 实际发生额 = 用户手动录入或从财务系统导入
adjustmentAmount = actualAmount - preProvisionAmount;
```

**注册路由** (`app.ts`):
```typescript
app.use('/api/v1/cost-adjustments', authenticateToken, requireRole('admin', 'finance'), costAdjustmentRouter);
```

### 4.3 前端 — 季度调整页

**新建文件**:
- `前端代码/src/pages/cost-center/QuarterlyAdjustment.tsx`
- `前端代码/src/pages/cost-center/components/AdjustmentReviewModal.tsx`
- `前端代码/src/pages/cost-center/hooks/useQuarterlyAdjustmentPage.ts`

**页面设计**（参考 v4.3-page-flow.md §2.8）:
- 筛选：季度下拉、成本中心下拉
- 调整建议表格：成本中心、预提金额、实际发生额、调整金额、调整原因、状态
- 操作按钮：生成调整建议、手动触发、审核选中项
- 调整记录表格：调整时间、成本中心、调整金额、调整人、审核状态、审核人

**路由**: `/cost-centers/adjustment`

**修改文件**: `前端代码/src/pages/cost-center/IndirectCostCenterList.tsx`
- 新增"季度调整"按钮（跳转到调整页）

### 4.4 前端 API 层

**修改文件**: `前端代码/src/api/master.ts`

```typescript
costAdjustmentApi: {
  getSuggestions: (params) => request.get('/cost-adjustments/suggestions', { params }),
  create: (data) => request.post('/cost-adjustments', data),
  review: (id, data) => request.post(`/cost-adjustments/${id}/review`, data),
  getList: (params) => request.get('/cost-adjustments', { params }),
}
```

### 4.5 前端类型定义

**修改文件**: `前端代码/src/types/index.ts`

```typescript
export interface EquipmentType {
  id: string;
  code: string;
  name: string;
  description?: string;
  status: number;
  equipmentCount?: number;
}

export interface DepreciationStat {
  typeId: string;
  typeName: string;
  equipmentCount: number;
  totalPurchasePrice: number;
  totalAnnualDepreciation: number;
  totalMonthlyDepreciation: number;
}

export interface CostAdjustment {
  id: string;
  costCenterId: string;
  costCenterName?: string;
  yearQuarter: string;
  preProvisionAmount: number;
  actualAmount: number;
  adjustmentAmount: number;
  adjustmentReason?: string;
  adjustedBy?: string;
  adjustedAt?: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  reviewedBy?: string;
  reviewedAt?: string;
  reviewReason?: string;
}

export interface CostPreview {
  bomId: string;
  bomName: string;
  totalCost: number;
  breakdown: {
    materialCost: { amount: number; percentage: number };
    laborCost: { amount: number; percentage: number };
    equipmentCost: { amount: number; percentage: number };
    indirectCost: { amount: number; percentage: number };
  };
}
```

### 4.6 路由与导航更新

**修改文件**: `前端代码/src/App.tsx`

新增路由：
```typescript
<Route path="/equipment/types" element={<EquipmentTypeList />} />
<Route path="/equipment/depreciation-stats" element={<EquipmentDepreciationStats />} />
<Route path="/cost-centers/adjustment" element={<QuarterlyAdjustment />} />
```

**修改文件**: `前端代码/src/components/layout/AppSidebar.tsx`

侧边栏更新：
```
基础数据
├── ...
├── 设备管理
│   ├── 设备列表        /equipment
│   ├── 设备类型管理    /equipment/types      ← 新增
│   └── 设备折旧统计    /equipment/depreciation-stats  ← 新增
├── ...

检测与成本
├── ...
├── 间接成本中心        /indirect-costs
├── 季度调整            /cost-centers/adjustment  ← 新增
├── ...
```

---

## 依赖关系图

```
Phase 1.1 (DB: equipment_types)
    │
    ├──→ Phase 1.2 (API: equipment types CRUD)
    │        │
    │        ├──→ Phase 1.4 (前端: 设备类型管理页)
    │        │
    │        └──→ Phase 1.5 (前端: 设备列表页改造)
    │
    ├──→ Phase 1.3 (API: 折旧统计)
    │        │
    │        └──→ Phase 1.6 (前端: 折旧统计页)
    │
    └──→ Phase 1.7 (BOM设备模板改为按类型)
             │
             └──→ Phase 3.3 (成本预览API)
                      │
                      └──→ Phase 3.4 (前端: 成本预览弹窗)

Phase 2.1 (DB: reference_source)
    │
    ├──→ Phase 2.2 (API: 参考值来源)
    │        │
    │        └──→ Phase 2.3 (前端: 工时列表改造)
    │
    ├──→ Phase 2.4 (API: 成本差异增强)
    │        │
    │        └──→ Phase 2.5 (前端: 成本差异增强)
    │
    └──→ Phase 2.6 (API: 月度环比)
             │
             └──→ Phase 2.7 (前端: 月度环比)

Phase 3.1 (API: 趋势季度聚合)
    │
    └──→ Phase 3.2 (前端: 趋势季度聚合)

Phase 3.5 (前端: 成本结构饼图增强) — 独立

Phase 4.1 (DB: cost_adjustments)
    │
    └──→ Phase 4.2 (API: 季度调整)
             │
             └──→ Phase 4.3 (前端: 季度调整页)
```

---

## 文件变更清单

### 新建文件（8个）

| 文件 | 类型 | 说明 |
|------|------|------|
| `后端代码/server/src/routes/equipment-types-v1.1.ts` | 后端路由 | 设备类型 CRUD |
| `后端代码/server/src/routes/cost-adjustment-v1.1.ts` | 后端路由 | 季度调整 |
| `前端代码/src/pages/equipment/EquipmentTypeList.tsx` | 前端页面 | 设备类型管理页 |
| `前端代码/src/pages/equipment/components/EquipmentTypeFormModal.tsx` | 前端组件 | 设备类型表单弹窗 |
| `前端代码/src/pages/equipment/hooks/useEquipmentTypePage.ts` | Hook | 设备类型页逻辑 |
| `前端代码/src/pages/equipment/EquipmentDepreciationStats.tsx` | 前端页面 | 折旧统计页 |
| `前端代码/src/pages/cost-center/QuarterlyAdjustment.tsx` | 前端页面 | 季度调整页 |
| `前端代码/src/pages/bom/components/CostPreviewModal.tsx` | 前端组件 | 成本预览弹窗 |

### 修改文件（16个）

| 文件 | 变更内容 |
|------|----------|
| `后端代码/server/src/database/DatabaseManager.ts` | 新增 equipment_types, cost_adjustments 表 + equipment.type_id, standard_labor_times.reference_source, bom_equipment_templates.equipment_type_id 字段 |
| `后端代码/server/src/routes/equipment-v1.1.ts` | 新增 /depreciation-stats 端点 |
| `后端代码/server/src/routes/labor-time-v1.1.ts` | 新增 referenceSource 参数 |
| `后端代码/server/src/routes/bom-v1.1.ts` | 新增 /:id/cost-preview 端点 + equipment_type_id 支持 |
| `后端代码/server/src/routes/reports-v1.1.ts` | 新增 /cost-variance, /cost-monthly-comparison + 增强 /cost-trend |
| `后端代码/server/src/utils/cost-calculator.ts` | 修改 calculateEquipmentCost 支持按类型计算 |
| `后端代码/server/src/app.ts` | 注册新路由 |
| `前端代码/src/types/index.ts` | 新增 EquipmentType, DepreciationStat, CostAdjustment, CostPreview 类型 |
| `前端代码/src/api/master.ts` | 新增 equipmentApi.getTypes/getDepreciationStats + costAdjustmentApi |
| `前端代码/src/pages/equipment/EquipmentList.tsx` | 新增类型筛选、类型列、跳转按钮 |
| `前端代码/src/pages/equipment/components/EquipmentFormModal.tsx` | 新增设备类型选择 |
| `前端代码/src/pages/labor/LaborTimeList.tsx` | 新增参考值来源列 |
| `前端代码/src/pages/labor/components/LaborTimeFormModal.tsx` | 新增参考值来源选择 |
| `前端代码/src/pages/cost/CostVarianceAnalysis.tsx` | 增强图表+下钻+对比 |
| `前端代码/src/pages/cost/CostTrend.tsx` | 新增季度聚合切换 |
| `前端代码/src/pages/cost/CostDashboard.tsx` | 增强成本结构饼图+月度环比 |
| `前端代码/src/pages/bom/BOM.tsx` | 新增成本预览按钮 |
| `前端代码/src/pages/cost-center/IndirectCostCenterList.tsx` | 新增季度调整按钮 |
| `前端代码/src/App.tsx` | 新增路由 |
| `前端代码/src/components/layout/AppSidebar.tsx` | 新增导航项 |

---

## 实施建议

### 执行顺序

1. **先做数据库** — 所有 Phase 的 DB 变更一次完成，减少迁移次数
2. **后端先行** — 每个 Phase 先完成 API，用 Postman/curl 验证
3. **前端跟进** — API 稳定后再做前端页面
4. **测试驱动** — 每个 API 端点写对应的测试用例

### 风险点

| 风险 | 缓解措施 |
|------|----------|
| equipment_types 与现有数据不兼容 | 先备份 DB，提供数据迁移脚本 |
| BOM 设备模板改为按类型影响成本计算 | 修改 cost-calculator.ts 后需全量回归测试 |
| 季度调整逻辑复杂 | 先实现简单版本（手动录入），后续迭代自动化 |

### 验收检查

每个 Phase 完成后执行：
1. `cd 后端代码/server && npm run test` — 后端单元测试
2. `cd 前端代码 && npm run build` — 前端构建检查
3. `cd 前端代码 && npx playwright test` — E2E 测试
4. 手动验证关键流程

---

*此计划基于 v4.3 产品功能定义和实际代码库分析生成，可直接用于实施。*
