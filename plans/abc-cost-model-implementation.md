# ABC 作业成本法模型实现计划

> **计划名称**：COREONE ABC 作业成本法模型实现
> **创建日期**：2026-06-02
> **参考文档**：[abc-cost-model-references.md](../research/abc-cost-model-references.md)
> **状态**：待审批

---

## 一、计划概述

### 1.1 目标

基于作业成本法（Activity-Based Costing, ABC）重新设计 COREONE 系统的成本核算模型，实现：
- 按作业中心归集成本，按成本动因分摊
- 按单张切片核算成本，支持下钻到病例明细
- 与收费对照，分析项目盈利性
- 支持阶梯定价规则

### 1.2 参考依据

本计划基于以下调研成果设计：

| 参考内容 | 来源 | 关键发现 |
|---------|------|---------|
| ISO 15189:2022 标准 | 国际标准 | 需区分质量成本（预防+鉴定+失败）和运营成本 |
| 上海病理收费标准 | 教授解释文档 | 按单张切片计价，有阶梯定价和封顶机制 |
| 病理科工作流程 | 项目种子数据 | 8个作业中心：标本处理、切片、常规染色、免疫组化、特染、分子病理、诊断、细胞病理 |
| 现有系统代码 | cost-calculator.ts 等 | 5维全成本模型，有口径不一致、差异分析硬编码等问题 |
| 作业成本法理论 | 学术文献 | 按作业归集、按动因分摊的方法论 |

**详细参考内容见**：[abc-cost-model-references.md](../research/abc-cost-model-references.md)

---

## 二、分阶段实现

### Phase 1：统一计算口径 + 修复已知问题（P0）

**目标**：修复现有成本计算的错误，为 ABC 模型打好基础。

#### 1.1 设备折旧口径统一

| 项目 | 内容 |
|------|------|
| **问题** | cost-calculator.ts 用工作日(250天×8小时)，equipment-v1.1.ts 用日历年度(365天×24小时) |
| **方案** | 统一使用工作日口径（250天/年×8小时/天×60分钟/小时=120,000分钟/年） |
| **文件** | `后端代码/server/src/routes/equipment-v1.1.ts` |
| **验证** | 同一设备在两个计算路径下折旧额一致 |

#### 1.2 差异分析改为基于 BOM 标准成本

| 项目 | 内容 |
|------|------|
| **问题** | 理论成本 = 实际 × 0.92（硬编码），价格差异 = 总差异 × 0.6 |
| **方案** | 使用 BOM 的 `standard_total_cost` 字段作为理论成本，差异按实际成本结构拆分 |
| **文件** | `前端代码/src/pages/report/components/CostDetailModal.tsx` |
| **验证** | 差异分析数据来自真实 BOM 标准成本 |

#### 1.3 无 BOM 项目成本补全

| 项目 | 内容 |
|------|------|
| **问题** | 无 BOM 项目仅计材料成本，人工、设备、质控、间接全部为0 |
| **方案** | 无 BOM 项目使用默认工时（按项目类型查 standard_labor_times）+ 按样本数分摊间接成本 |
| **文件** | `后端代码/server/src/routes/reports-v1.1.ts` |
| **验证** | 无 BOM 项目也有人工和间接成本 |

#### 1.4 BOM 标准成本字段写入

| 项目 | 内容 |
|------|------|
| **问题** | `boms` 表的 `standard_labor_cost` 等字段从未写入 |
| **方案** | BOM 创建/更新时自动计算并写入标准成本 |
| **文件** | `后端代码/server/src/routes/bom-v1.1.ts` |
| **验证** | BOM 记录有标准成本值 |

---

### Phase 2：引入作业中心 + 成本动因（P0）

**目标**：建立 ABC 模型的基础数据结构。

#### 2.1 新增数据库表

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| `abc_activity_centers` | 作业中心定义 | id, code, name, description, cost_driver_type |
| `abc_cost_drivers` | 成本动因定义 | id, code, name, unit, calculation_method |
| `abc_cost_pools` | 作业成本池 | id, activity_center_id, year_month, total_cost |
| `abc_driver_rates` | 动因费率 | id, cost_driver_id, year_month, rate, base_quantity |
| `abc_bom_activity_links` | BOM与作业关联 | id, bom_id, activity_center_id, driver_quantity |

**文件**：`后端代码/server/src/database/DatabaseManager.ts`

#### 2.2 初始化作业中心数据

| 作业中心 | 代码 | 成本动因 | 说明 |
|---------|------|---------|------|
| 标本处理中心 | SPECIMEN | 蜡块数 | 人工密集 |
| 切片制作中心 | SECTION | 切片数 | 人工+耗材 |
| 常规染色中心 | HE_STAIN | 染色次数 | 耗材密集 |
| 免疫组化中心 | IHC | 检测项数 | 试剂+设备密集 |
| 特染中心 | SS | 切片数 | 试剂密集 |
| 分子病理中心 | MP | 探针/位点/面板 | 设备+试剂密集 |
| 诊断中心 | DIAGNOSIS | 报告数 | 人工密集 |
| 细胞病理中心 | CYTOLOGY | 玻片数+蜡块数 | 人工+耗材 |

**文件**：`后端代码/server/scripts/seed-abc-data.ts`

#### 2.3 实现作业中心 CRUD API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/abc/activity-centers` | GET | 列表查询 |
| `/api/v1/abc/activity-centers` | POST | 创建 |
| `/api/v1/abc/activity-centers/:id` | PUT | 更新 |
| `/api/v1/abc/activity-centers/:id` | DELETE | 删除 |

**文件**：`后端代码/server/src/routes/abc-v1.1.ts`

---

### Phase 3：单张切片成本核算 + 病例明细（P0）

**目标**：实现按单张切片核算成本，支持下钻到病例明细。

#### 3.1 成本计算引擎重构

**新增函数**：

```typescript
// 计算作业成本
export function calculateActivityCost(
  db: any,
  activityCenterId: string,
  driverQuantity: number,
  month: string
): number

// 计算单张切片成本
export function calculateSlideCost(
  db: any,
  params: {
    bomId: string
    slideCount: number
    blockCount: number
    month: string
  }
): SlideCostBreakdown

// 计算病例成本（包含多张切片）
export function calculateCaseCost(
  db: any,
  params: {
    caseId: string
    slides: Array<{
      slideId: string
      bomId: string
      slideCount: number
      blockCount: number
    }>
    month: string
  }
): CaseCostBreakdown
```

**文件**：`后端代码/server/src/utils/cost-calculator.ts`

#### 3.2 新增病例成本记录表

```sql
CREATE TABLE case_cost_records (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,           -- 病例ID
  slide_id TEXT NOT NULL,          -- 切片ID
  bom_id TEXT NOT NULL,            -- BOM ID
  slide_count INTEGER DEFAULT 1,   -- 切片数
  block_count INTEGER DEFAULT 1,   -- 蜡块数
  material_cost DECIMAL(18,4) DEFAULT 0,
  activity_cost DECIMAL(18,4) DEFAULT 0,  -- 作业成本汇总
  total_cost DECIMAL(18,4) DEFAULT 0,
  cost_month TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**文件**：`后端代码/server/src/database/DatabaseManager.ts`

#### 3.3 实现病例成本 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/cost/case/:caseId` | GET | 查询病例成本明细 |
| `/api/v1/cost/slide/:slideId` | GET | 查询单张切片成本 |
| `/api/v1/cost/calculate` | POST | 手动触发成本计算 |

**文件**：`后端代码/server/src/routes/cost-v1.1.ts`

#### 3.4 前端病例明细弹窗

**功能**：
- 显示病例包含的所有切片
- 每张切片的成本构成（材料+各作业中心）
- 与收费对照
- 支持导出

**文件**：`前端代码/src/pages/report/components/CaseCostDetailModal.tsx`

---

### Phase 4：收费对照 + 盈利性分析（P1）

**目标**：成本与收费对比，分析项目盈利性。

#### 4.1 收费标准数据表

```sql
CREATE TABLE fee_standards (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,        -- 收费编码
  name TEXT NOT NULL,               -- 收费名称
  category TEXT NOT NULL,           -- 分类：diagnosis/specimen/stain/ihc/ss/mp/cytology
  unit TEXT NOT NULL,               -- 计价单位：slide/block/item/probe/locus/panel
  base_price DECIMAL(18,4) NOT NULL, -- 基础价格
  tier_rules TEXT,                  -- 阶梯规则 JSON
  cap_amount DECIMAL(18,4),         -- 封顶金额
  is_self_pay INTEGER DEFAULT 0,    -- 是否自费
  effective_date TEXT,              -- 生效日期
  status INTEGER DEFAULT 1
)
```

**文件**：`后端代码/server/src/database/DatabaseManager.ts`

#### 4.2 初始化收费数据

基于教授解释文档，导入上海收费标准数据。

**文件**：`后端代码/server/scripts/seed-fee-standards.ts`

#### 4.3 盈利性分析 API

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/cost/profitability` | GET | 按项目分析盈利性 |
| `/api/v1/cost/profitability/:projectId` | GET | 单项目详细分析 |
| `/api/v1/cost/fee-comparison` | GET | 成本与收费对比 |

**文件**：`后端代码/server/src/routes/cost-v1.1.ts`

#### 4.4 前端盈利性分析页面

**功能**：
- 项目盈利性排名
- 成本与收费对比图表
- 阶梯定价影响分析
- 支持导出

**文件**：`前端代码/src/pages/report/ProfitabilityAnalysis.tsx`

---

### Phase 5：质量成本体系（P2，后续实现）

**目标**：符合 ISO 15189 要求的质量成本核算。

**说明**：此阶段为后续规划，本次不实现。

---

## 三、详细设计

### 3.1 数据库设计

#### 新增表结构

**abc_activity_centers** -- 作业中心定义
```sql
CREATE TABLE abc_activity_centers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,           -- 作业中心代码
  name TEXT NOT NULL,                  -- 作业中心名称
  description TEXT,                    -- 描述
  cost_driver_type TEXT NOT NULL,      -- 主要成本动因类型
  parent_id TEXT,                      -- 父作业中心（支持层次结构）
  sort_order INTEGER DEFAULT 0,
  status INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**abc_cost_drivers** -- 成本动因定义
```sql
CREATE TABLE abc_cost_drivers (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,           -- 动因代码
  name TEXT NOT NULL,                  -- 动因名称
  unit TEXT NOT NULL,                  -- 计量单位
  calculation_method TEXT NOT NULL,    -- 计算方法：linear/tiered/capped
  tier_rules TEXT,                     -- 阶梯规则 JSON
  description TEXT,
  status INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**abc_cost_pools** -- 作业成本池
```sql
CREATE TABLE abc_cost_pools (
  id TEXT PRIMARY KEY,
  activity_center_id TEXT NOT NULL,    -- 关联作业中心
  year_month TEXT NOT NULL,            -- 月份
  direct_cost DECIMAL(18,4) DEFAULT 0, -- 直接成本
  indirect_cost DECIMAL(18,4) DEFAULT 0, -- 间接成本
  total_cost DECIMAL(18,4) DEFAULT 0,  -- 总成本
  driver_quantity DECIMAL(18,4) DEFAULT 0, -- 动因数量
  driver_rate DECIMAL(18,4) DEFAULT 0, -- 动因费率
  UNIQUE(activity_center_id, year_month)
)
```

**abc_bom_activity_links** -- BOM与作业关联
```sql
CREATE TABLE abc_bom_activity_links (
  id TEXT PRIMARY KEY,
  bom_id TEXT NOT NULL,                -- 关联BOM
  activity_center_id TEXT NOT NULL,    -- 关联作业中心
  cost_driver_id TEXT,                 -- 关联成本动因
  driver_quantity DECIMAL(18,4) DEFAULT 0, -- 每样本动因数量
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(bom_id, activity_center_id)
)
```

**case_cost_records** -- 病例成本记录
```sql
CREATE TABLE case_cost_records (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,               -- 病例ID
  slide_id TEXT NOT NULL,              -- 切片ID
  bom_id TEXT NOT NULL,                -- BOM ID
  slide_count INTEGER DEFAULT 1,       -- 切片数
  block_count INTEGER DEFAULT 1,       -- 蜡块数
  material_cost DECIMAL(18,4) DEFAULT 0, -- 材料成本
  activity_costs TEXT,                 -- 作业成本明细 JSON
  total_cost DECIMAL(18,4) DEFAULT 0,  -- 总成本
  fee_amount DECIMAL(18,4) DEFAULT 0,  -- 收费金额
  profit DECIMAL(18,4) DEFAULT 0,      -- 利润
  profit_rate DECIMAL(18,4) DEFAULT 0, -- 利润率
  cost_month TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**fee_standards** -- 收费标准
```sql
CREATE TABLE fee_standards (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,           -- 收费编码
  name TEXT NOT NULL,                  -- 收费名称
  category TEXT NOT NULL,              -- 分类
  unit TEXT NOT NULL,                  -- 计价单位
  base_price DECIMAL(18,4) NOT NULL,   -- 基础价格
  tier_rules TEXT,                     -- 阶梯规则 JSON
  cap_amount DECIMAL(18,4),            -- 封顶金额
  is_self_pay INTEGER DEFAULT 0,       -- 是否自费
  effective_date TEXT,                 -- 生效日期
  status INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### 3.2 API 设计

#### 作业中心管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/abc/activity-centers` | GET | 列表查询 |
| `/api/v1/abc/activity-centers/:id` | GET | 详情查询 |
| `/api/v1/abc/activity-centers` | POST | 创建 |
| `/api/v1/abc/activity-centers/:id` | PUT | 更新 |
| `/api/v1/abc/activity-centers/:id` | DELETE | 删除 |

#### 成本动因管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/abc/cost-drivers` | GET | 列表查询 |
| `/api/v1/abc/cost-drivers/:id` | GET | 详情查询 |
| `/api/v1/abc/cost-drivers` | POST | 创建 |
| `/api/v1/abc/cost-drivers/:id` | PUT | 更新 |

#### 成本池管理

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/abc/cost-pools` | GET | 列表查询（支持按月份筛选） |
| `/api/v1/abc/cost-pools/:id` | GET | 详情查询 |
| `/api/v1/abc/cost-pools` | POST | 创建/更新 |
| `/api/v1/abc/cost-pools/calculate` | POST | 批量计算成本池 |

#### BOM作业关联

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/abc/bom-links/:bomId` | GET | 查询BOM的作业关联 |
| `/api/v1/abc/bom-links/:bomId` | PUT | 更新BOM的作业关联 |

#### 成本查询

| 接口 | 方法 | 说明 |
|------|------|------|
| `/api/v1/cost/slide/:slideId` | GET | 单张切片成本 |
| `/api/v1/cost/case/:caseId` | GET | 病例成本明细 |
| `/api/v1/cost/profitability` | GET | 盈利性分析 |
| `/api/v1/cost/profitability/:projectId` | GET | 单项目详细分析 |
| `/api/v1/cost/fee-comparison` | GET | 成本与收费对比 |

### 3.3 计算逻辑

#### 单张切片成本计算

```
单张切片成本 = 材料成本 + Σ(作业中心成本)

材料成本 = Σ(物料单价 × 每样本用量)
作业中心成本 = 动因费率 × 动因数量
动因费率 = 成本池总额 / 动因总量
```

#### 阶梯定价计算

```typescript
function calculateTieredCost(quantity: number, tiers: TierRule[]): number {
  let cost = 0
  let remaining = quantity
  
  for (const tier of tiers) {
    if (remaining <= 0) break
    
    const tierQuantity = Math.min(remaining, tier.maxQuantity || Infinity)
    cost += tierQuantity * tier.unitPrice
    remaining -= tierQuantity
  }
  
  // 应用封顶
  if (tiers.capAmount) {
    cost = Math.min(cost, tiers.capAmount)
  }
  
  return cost
}
```

---

## 四、文件变更清单

### 4.1 新增文件

| 文件 | 说明 |
|------|------|
| `后端代码/server/src/routes/abc-v1.1.ts` | ABC 管理 API |
| `后端代码/server/src/routes/cost-v1.1.ts` | 成本查询 API |
| `后端代码/server/scripts/seed-abc-data.ts` | ABC 初始化数据 |
| `后端代码/server/scripts/seed-fee-standards.ts` | 收费标准数据 |
| `后端代码/server/tests/integration/abc-cost.test.ts` | ABC 成本集成测试 |
| `前端代码/src/pages/cost/ActivityCenterList.tsx` | 作业中心管理页面 |
| `前端代码/src/pages/cost/CostDriverList.tsx` | 成本动因管理页面 |
| `前端代码/src/pages/cost/ProfitabilityAnalysis.tsx` | 盈利性分析页面 |
| `前端代码/src/pages/report/components/CaseCostDetailModal.tsx` | 病例成本明细弹窗 |

### 4.2 修改文件

| 文件 | 修改内容 |
|------|---------|
| `后端代码/server/src/database/DatabaseManager.ts` | 新增 6 张表 |
| `后端代码/server/src/utils/cost-calculator.ts` | 新增 ABC 计算函数 |
| `后端代码/server/src/routes/bom-v1.1.ts` | BOM 创建/更新时写入标准成本 |
| `后端代码/server/src/routes/equipment-v1.1.ts` | 统一设备折旧口径 |
| `后端代码/server/src/routes/reports-v1.1.ts` | 无 BOM 项目成本补全 |
| `后端代码/server/src/app.ts` | 注册新路由 |
| `前端代码/src/types/index.ts` | 新增 ABC 相关类型定义 |
| `前端代码/src/api/master.ts` | 新增 ABC API 封装 |
| `前端代码/src/pages/report/CostAnalysis.tsx` | 新增盈利性分析 Tab |
| `前端代码/src/pages/report/components/CostDetailModal.tsx` | 差异分析改为基于 BOM 标准成本 |

---

## 五、验证方案

### 5.1 单元测试

| 测试项 | 测试内容 | 验证标准 |
|--------|---------|---------|
| 设备折旧口径 | 同一设备在两个计算路径下折旧额一致 | 差异 < 0.01 |
| 阶梯定价计算 | 按阶梯规则计算成本 | 与手工计算一致 |
| 作业成本分摊 | 按动因分摊作业成本 | 分摊结果正确 |
| 单张切片成本 | 计算单张切片成本 | 与手工计算一致 |

### 5.2 集成测试

| 测试项 | 测试内容 | 验证标准 |
|--------|---------|---------|
| BOM 创建 | 创建 BOM 时自动计算标准成本 | 标准成本字段有值 |
| 成本计算 | 从出库到成本计算全流程 | 成本数据正确 |
| 病例成本 | 查询病例成本明细 | 包含所有切片 |
| 盈利性分析 | 成本与收费对比 | 数据一致 |

### 5.3 E2E 测试

| 测试项 | 测试内容 | 验证标准 |
|--------|---------|---------|
| 作业中心管理 | CRUD 操作 | 操作成功 |
| 成本查询 | 查询单张切片/病例成本 | 数据正确 |
| 盈利性分析 | 查看盈利性报表 | 图表正确 |

---

## 六、实施步骤

### Step 1：数据库迁移（Day 1）

1. 修改 `DatabaseManager.ts`，新增 6 张表
2. 创建种子数据脚本
3. 运行迁移验证

### Step 2：修复已知问题（Day 1-2）

1. 统一设备折旧口径
2. 修复差异分析硬编码
3. 无 BOM 项目成本补全
4. BOM 标准成本字段写入

### Step 3：实现 ABC 管理 API（Day 2-3）

1. 实现作业中心 CRUD
2. 实现成本动因 CRUD
3. 实现成本池管理
4. 实现 BOM 作业关联

### Step 4：实现成本计算引擎（Day 3-4）

1. 实现作业成本计算函数
2. 实现单张切片成本计算
3. 实现病例成本计算
4. 实现阶梯定价计算

### Step 5：实现成本查询 API（Day 4-5）

1. 实现切片/病例成本查询
2. 实现盈利性分析
3. 实现收费对照

### Step 6：前端页面开发（Day 5-7）

1. 实现作业中心管理页面
2. 实现成本动因管理页面
3. 实现病例成本明细弹窗
4. 实现盈利性分析页面

### Step 7：测试与验证（Day 7-8）

1. 运行单元测试
2. 运行集成测试
3. 运行 E2E 测试
4. 修复发现的问题

---

## 七、风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| 数据迁移复杂 | 可能导致数据丢失 | 先备份数据库，逐步迁移 |
| 计算逻辑复杂 | 可能出现计算错误 | 单元测试覆盖，与手工计算对比 |
| 前端开发量大 | 可能延期 | 优先实现核心功能，其他后续迭代 |
| 性能问题 | 查询慢 | 批量预加载优化，添加索引 |

---

## 八、后续规划（Phase 5）

### 质量成本体系（ISO 15189 合规）

1. 新增质量成本归集（预防+鉴定+失败）
2. 与检测项目关联
3. 支持管理评审报表

**说明**：此阶段为后续规划，本次不实现。

---

*本计划基于 [abc-cost-model-references.md](../research/abc-cost-model-references.md) 中的调研成果设计。*
