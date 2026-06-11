# Phase 2: ABC 计算引擎 + 出库集成 — 详细实施计划（修订版）

> **目标**: 出库时自动计算 ABC 成本和收费
> **前置条件**: Phase 1 完成（BOM 已关联收费标准）
> **参考**:
> - [产品规划](abc-product-plan.md)
> - [前端设计规范调研] 基于 DESIGN.md + coreone-guardrails.md + 现有组件分析
> - [质量审查报告] 5 个 P0 问题

---

## 核心阻塞问题处理（Phase 2 必须解决）

### 阻塞问题 3: 出库流程未集成 ABC 计算

**问题**: outbound-v1.1.ts 中完全没有调用 calculateSlideCost 或任何 ABC 计算函数
**方案**: 在出库流程中嵌入 ABC 计算

**文件**: `后端代码/server/src/routes/outbound-v1.1.ts`
**位置**: `router.post('/bom', ...)` 路由（约第 222 行）

**实现方案**:

```typescript
// 在 db.exec('COMMIT') 之前增加
// 计算 ABC 成本（使用 try-catch 包裹，失败不阻断出库）
try {
  const month = new Date().toISOString().slice(0, 7)
  const slideCost = calculateSlideCost(db, {
    bomId: bomId,
    slideCount: sampleCount,
    blockCount: 1,
    month: month,
    materialCost: totalCost,
  })

  // 写入 outbound_abc_details
  const abcDetailId = uuidv4()
  db.prepare(`
    INSERT INTO outbound_abc_details
    (id, outbound_id, bom_id, project_id, sample_count, slide_count, block_count,
     material_cost, activity_cost, total_cost, cost_per_slide,
     fee_category, fee_standard_id, fee_amount, profit, profit_rate,
     activity_details, cost_month)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    abcDetailId, outboundId, bomId, projectId || null,
    sampleCount, sampleCount, 1,
    slideCost.materialCost, slideCost.totalActivityCost, slideCost.totalCost,
    slideCost.totalCost / sampleCount,
    slideCost.feeCategory, slideCost.feeStandardId,
    slideCost.feeAmount, slideCost.profit, slideCost.profitRate,
    JSON.stringify(slideCost.activityCosts),
    month
  )

  // 更新 outbound_records 增加 ABC 字段
  db.prepare(`
    UPDATE outbound_records SET
      abc_total_cost = ?, abc_activity_cost = ?, fee_amount = ?, profit = ?
    WHERE id = ?
  `).run(slideCost.totalCost, slideCost.totalActivityCost, slideCost.feeAmount, slideCost.profit, outboundId)

} catch (abcErr) {
  console.error('ABC calculation failed, outbound continues:', abcErr)
  // 不抛出异常，出库继续
}
```

**验收标准**:
- [ ] 出库时自动计算 ABC 成本
- [ ] outbound_abc_details 记录正确写入
- [ ] outbound_records 的 ABC 字段正确更新
- [ ] 出库后可查询到 ABC 成本数据
- [ ] ABC 计算失败不阻断出库

---

### 阻塞问题 4: 关键表未创建

**问题**: DatabaseManager.ts 中没有 outbound_abc_details 和 slide_cost_snapshots 表的建表语句
**方案**: 在 DatabaseManager.ts 中添加建表语句

**文件**: `后端代码/server/src/database/DatabaseManager.ts`
**位置**: `initializeDatabase()` 函数，ABC 相关表 section

**建表语句**:

```sql
-- 出库 ABC 成本明细
CREATE TABLE IF NOT EXISTS outbound_abc_details (
  id TEXT PRIMARY KEY,
  outbound_id TEXT NOT NULL,
  bom_id TEXT,
  project_id TEXT,
  sample_count INTEGER NOT NULL DEFAULT 1,
  slide_count INTEGER NOT NULL DEFAULT 0,
  block_count INTEGER NOT NULL DEFAULT 0,
  material_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  activity_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  total_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  cost_per_slide DECIMAL(18,4) NOT NULL DEFAULT 0,
  fee_category TEXT,
  fee_standard_id TEXT,
  fee_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  profit DECIMAL(18,4) NOT NULL DEFAULT 0,
  profit_rate DECIMAL(18,4) NOT NULL DEFAULT 0,
  activity_details TEXT,
  cost_month TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outbound_id) REFERENCES outbound_records(id),
  FOREIGN KEY (bom_id) REFERENCES boms(id),
  FOREIGN KEY (fee_standard_id) REFERENCES fee_standards(id)
);

-- 切片成本快照
CREATE TABLE IF NOT EXISTS slide_cost_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_date TEXT NOT NULL,
  bom_id TEXT NOT NULL,
  project_type TEXT NOT NULL,
  std_material_cost DECIMAL(18,4) DEFAULT 0,
  std_activity_cost DECIMAL(18,4) DEFAULT 0,
  std_total_cost DECIMAL(18,4) DEFAULT 0,
  std_cost_per_slide DECIMAL(18,4) DEFAULT 0,
  activity_breakdown TEXT,
  fee_category TEXT,
  standard_fee DECIMAL(18,4) DEFAULT 0,
  margin DECIMAL(18,4) DEFAULT 0,
  margin_rate DECIMAL(18,4) DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (bom_id) REFERENCES boms(id)
);

-- boms 表增加字段
ALTER TABLE boms ADD COLUMN fee_standard_id TEXT;
ALTER TABLE boms ADD COLUMN fee_category TEXT;
ALTER TABLE boms ADD COLUMN standard_slide_cost DECIMAL(18,4) DEFAULT 0;
ALTER TABLE boms ADD COLUMN standard_fee_per_slide DECIMAL(18,4) DEFAULT 0;
ALTER TABLE boms ADD COLUMN standard_margin_rate DECIMAL(18,4) DEFAULT 0;

-- outbound_records 表增加字段
ALTER TABLE outbound_records ADD COLUMN abc_total_cost DECIMAL(18,4) DEFAULT 0;
ALTER TABLE outbound_records ADD COLUMN abc_activity_cost DECIMAL(18,4) DEFAULT 0;
ALTER TABLE outbound_records ADD COLUMN fee_amount DECIMAL(18,4) DEFAULT 0;
ALTER TABLE outbound_records ADD COLUMN profit DECIMAL(18,4) DEFAULT 0;

-- 索引
CREATE INDEX IF NOT EXISTS idx_outbound_abc_outbound ON outbound_abc_details(outbound_id);
CREATE INDEX IF NOT EXISTS idx_outbound_abc_bom ON outbound_abc_details(bom_id);
CREATE INDEX IF NOT EXISTS idx_outbound_abc_project ON outbound_abc_details(project_id);
CREATE INDEX IF NOT EXISTS idx_outbound_abc_month ON outbound_abc_details(cost_month);
CREATE INDEX IF NOT EXISTS idx_slide_snap_bom ON slide_cost_snapshots(bom_id);
CREATE INDEX IF NOT EXISTS idx_slide_snap_date ON slide_cost_snapshots(snapshot_date);
```

**验收标准**:
- [ ] outbound_abc_details 表已创建
- [ ] slide_cost_snapshots 表已创建
- [ ] boms 表已增加收费标准字段
- [ ] outbound_records 表已增加 ABC 字段
- [ ] 所有索引已创建
- [ ] ALTER 语句幂等执行（重复运行不报错）

---

### 阻塞问题 5: 两套成本体系并行冲突

**问题**: 传统全成本体系和 ABC 作业成本法各自独立运行，数据不一致风险极高
**方案**: 统一为一套体系，ABC 作为主计算引擎，传统模型作为降级方案

**文件**: `后端代码/server/src/utils/cost-calculator.ts`

**实现方案**:

```typescript
/**
 * 统一成本计算入口
 * 优先使用 ABC 模型，失败时降级到传统模型
 */
export function calculateUnifiedCost(
  db: any,
  params: {
    bomId: string
    projectType: string
    sampleCount: number
    materialCost: number
    month: string
  }
): UnifiedCostResult {
  try {
    // 优先使用 ABC 模型
    const abcResult = calculateSlideCost(db, {
      bomId: params.bomId,
      slideCount: params.sampleCount,
      blockCount: 1,
      month: params.month,
      materialCost: params.materialCost,
    })

    return {
      model: 'abc',
      materialCost: abcResult.materialCost,
      activityCost: abcResult.totalActivityCost,
      totalCost: abcResult.totalCost,
      costPerSlide: abcResult.totalCost / params.sampleCount,
      feeAmount: abcResult.feeAmount,
      profit: abcResult.profit,
      profitRate: abcResult.profitRate,
      activityBreakdown: abcResult.activityCosts,
    }
  } catch (err) {
    // 降级到传统模型
    console.warn('ABC calculation failed, falling back to traditional model:', err)
    const traditionalResult = calculateFullCost(db, {
      projectType: params.projectType,
      bomId: params.bomId,
      sampleCount: params.sampleCount,
      materialCost: params.materialCost,
      month: params.month,
    })

    return {
      model: 'traditional',
      materialCost: traditionalResult.materialCost,
      activityCost: traditionalResult.laborCost + traditionalResult.equipmentCost + traditionalResult.qcCost + traditionalResult.indirectCost,
      totalCost: traditionalResult.totalCost,
      costPerSlide: traditionalResult.totalCost / params.sampleCount,
      feeAmount: 0, // 传统模型不计算收费
      profit: 0,
      profitRate: 0,
      activityBreakdown: [],
    }
  }
}
```

**验收标准**:
- [ ] 统一的成本计算入口函数已实现
- [ ] ABC 计算失败时自动降级到传统模型
- [ ] 前端展示统一的成本数据
- [ ] 两套体系的数据一致性已验证

---

### 阻塞问题 6: ABC 核心计算函数缺少单元测试

**问题**: calculateActivityCost、calculateSlideCost 等函数完全没有测试
**方案**: 补充 ABC 核心计算函数的单元测试

**文件**: `后端代码/server/src/utils/cost-calculator.test.ts`

**测试用例**:

```typescript
describe('ABC 核心计算函数', () => {
  describe('calculateActivityCost', () => {
    it('当月有数据时使用当月费率', () => {
      // 准备：插入当月成本池数据
      const cost = calculateActivityCost(db, 'activity-1', 10, '2026-06')
      expect(cost).toBe(150) // 10 * 15.00
    })

    it('当月无数据时降级使用上月费率', () => {
      const cost = calculateActivityCost(db, 'activity-1', 10, '2026-06')
      expect(cost).toBe(120) // 10 * 12.00（上月费率）
    })
  })

  describe('calculateSlideCost', () => {
    it('正常BOM，单切片，验证材料成本+各作业中心成本', () => {
      const result = calculateSlideCost(db, {
        bomId: 'bom-1', slideCount: 1, blockCount: 1, month: '2026-06',
      })
      expect(result.materialCost).toBeGreaterThan(0)
      expect(result.activityCosts).toHaveLength(4)
      expect(result.totalCost).toBe(result.materialCost + result.totalActivityCost)
    })

    it('空BOM返回0', () => {
      const result = calculateSlideCost(db, {
        bomId: 'nonexistent', slideCount: 1, blockCount: 1, month: '2026-06',
      })
      expect(result.totalCost).toBe(0)
    })
  })

  describe('calculateTieredCost', () => {
    it('IHC 阶梯：前3项205元，第4-12项210元，第13+项105元', () => {
      const tiers = [
        { maxQuantity: 3, unitPrice: 205 },
        { maxQuantity: 12, unitPrice: 210 },
        { unitPrice: 105 },
      ]
      expect(calculateTieredCost(5, tiers)).toBe(1035) // 3*205 + 2*210
      expect(calculateTieredCost(15, tiers)).toBe(2820) // 3*205 + 9*210 + 3*105
    })

    it('FISH 封顶：每探针1200元，封顶3600元', () => {
      const tiers = [{ unitPrice: 1200 }]
      expect(calculateTieredCost(2, tiers, 3600)).toBe(2400)
      expect(calculateTieredCost(4, tiers, 3600)).toBe(3600) // 封顶
    })
  })

  describe('calculateFeeAmount', () => {
    it('无阶梯规则，基础价格 × 数量', () => {
      const standard = { base_price: 100, tier_rules: null, cap_amount: null }
      expect(calculateFeeAmountFromStandard(standard, 5)).toBe(500)
    })

    it('有阶梯规则和封顶', () => {
      const standard = {
        base_price: 1200,
        tier_rules: null,
        cap_amount: 3600,
      }
      expect(calculateFeeAmountFromStandard(standard, 4)).toBe(3600)
    })
  })
})
```

**验收标准**:
- [ ] 所有 ABC 核心函数都有单元测试
- [ ] 测试覆盖正常路径、边界情况、异常情况
- [ ] 所有测试通过
- [ ] 断言严格（不使用 toBeDefined）

---

### P0-1: ABC 计算失败不应阻断出库事务

**问题**: 出库事务中嵌入 ABC 计算，如果计算失败会导致整个出库回滚
**方案**: ABC 计算使用 try-catch 包裹，失败时记录日志但不阻断出库

```typescript
// 在出库事务中
db.exec('BEGIN IMMEDIATE')
try {
  // 1. 材料出库（已有逻辑）
  // ... 扣减库存、记录明细 ...

  // 2. ABC 计算（新增，失败不阻断）
  try {
    const slideCost = calculateSlideCost(db, {
      bomId, slideCount: sampleCount, blockCount: 1, month, materialCost: totalCost,
    })
    // 写入 outbound_abc_details
    // 更新 outbound_records ABC 字段
  } catch (abcErr) {
    console.error('ABC calculation failed, outbound continues:', abcErr)
    // 不抛出异常，出库继续
  }

  // 3. 库存预警检查（已有逻辑）
  db.exec('COMMIT')
} catch (err) {
  db.exec('ROLLBACK')
  throw err
}
```

### P0-3: 成本池为空时需要降级策略

**问题**: 成本池数据为空时，ABC 计算返回 0，导致成本失真
**方案**: 三级降级策略

```typescript
function getDriverRate(db: any, activityCenterId: string, month: string): number {
  // 1. 查当月成本池
  let pool = db.prepare(`
    SELECT driver_rate FROM abc_cost_pools
    WHERE activity_center_id = ? AND year_month = ?
  `).get(activityCenterId, month) as any

  if (pool && pool.driver_rate > 0) return pool.driver_rate

  // 2. 降级查上月
  const prevMonth = getPreviousMonth(month)
  pool = db.prepare(`
    SELECT driver_rate FROM abc_cost_pools
    WHERE activity_center_id = ? AND year_month = ?
  `).get(activityCenterId, prevMonth) as any

  if (pool && pool.driver_rate > 0) return pool.driver_rate

  // 3. 最终降级使用 BOM 标准成本中的费率
  const defaultRate = db.prepare(`
    SELECT standard_slide_cost / (
      SELECT COUNT(*) FROM abc_bom_activity_links WHERE activity_center_id = ?
    ) as default_rate
    FROM boms WHERE standard_slide_cost > 0 LIMIT 1
  `).get(activityCenterId) as any

  return defaultRate?.default_rate || 0
}
```

### P0-4: 无 BOM 出库需要明确处理路径

**问题**: 无 BOM 的出库记录无法计算 ABC 成本
**方案**: 无 BOM 出库仅记录材料成本，ABC 成本为 0，在前端明确标识

```typescript
if (!bomId) {
  // 无 BOM，仅记录材料成本
  db.prepare(`
    INSERT INTO outbound_abc_details
    (id, outbound_id, material_cost, total_cost, cost_per_slide, cost_month)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(uuidv4(), outboundId, materialCost, materialCost, month)
} else {
  // 有 BOM，计算 ABC 成本
  // ...
}
```

---

## 任务清单

### 任务 2.1: 数据库 — 新增 outbound_abc_details 表

**文件**: `后端代码/server/src/database/DatabaseManager.ts`
**位置**: `initializeDatabase()` 函数

**改动内容**:
```sql
CREATE TABLE IF NOT EXISTS outbound_abc_details (
  id TEXT PRIMARY KEY,
  outbound_id TEXT NOT NULL,
  bom_id TEXT,
  project_id TEXT,
  sample_count INTEGER NOT NULL DEFAULT 1,
  slide_count INTEGER NOT NULL DEFAULT 0,
  block_count INTEGER NOT NULL DEFAULT 0,
  material_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  activity_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  total_cost DECIMAL(18,4) NOT NULL DEFAULT 0,
  cost_per_slide DECIMAL(18,4) NOT NULL DEFAULT 0,
  fee_category TEXT,
  fee_standard_id TEXT,
  fee_amount DECIMAL(18,4) NOT NULL DEFAULT 0,
  profit DECIMAL(18,4) NOT NULL DEFAULT 0,
  profit_rate DECIMAL(18,4) NOT NULL DEFAULT 0,
  activity_details TEXT,
  cost_month TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (outbound_id) REFERENCES outbound_records(id),
  FOREIGN KEY (bom_id) REFERENCES boms(id),
  FOREIGN KEY (fee_standard_id) REFERENCES fee_standards(id)
);

CREATE INDEX IF NOT EXISTS idx_outbound_abc_outbound ON outbound_abc_details(outbound_id);
CREATE INDEX IF NOT EXISTS idx_outbound_abc_bom ON outbound_abc_details(bom_id);
CREATE INDEX IF NOT EXISTS idx_outbound_abc_project ON outbound_abc_details(project_id);
CREATE INDEX IF NOT EXISTS idx_outbound_abc_month ON outbound_abc_details(cost_month);
```

**验收标准**:
- [ ] 表正常创建
- [ ] 索引生效
- [ ] 外键约束正确

---

### 任务 2.2: 后端 — 扩展 cost-calculator.ts

**文件**: `后端代码/server/src/utils/cost-calculator.ts`

#### 2.2.1: 新增辅助函数

```typescript
/** 获取上一个月 */
function getPreviousMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  const prev = mon === 1 ? 12 : mon - 1
  const prevYear = mon === 1 ? year - 1 : year
  return `${prevYear}-${String(prev).padStart(2, '0')}`
}
```

#### 2.2.2: 新增 getDriverRate 函数（含降级策略）

```typescript
/**
 * 获取作业中心的动因费率（含三级降级策略）
 * 1. 优先使用当月成本池数据
 * 2. 降级使用上月成本池数据
 * 3. 最终降级使用 BOM 标准成本
 */
export function getDriverRate(db: any, activityCenterId: string, month: string): number {
  // 1. 查当月成本池
  let pool = db.prepare(`
    SELECT driver_rate FROM abc_cost_pools
    WHERE activity_center_id = ? AND year_month = ?
  `).get(activityCenterId, month) as any

  if (pool && pool.driver_rate > 0) return pool.driver_rate

  // 2. 降级查上月
  const prevMonth = getPreviousMonth(month)
  pool = db.prepare(`
    SELECT driver_rate FROM abc_cost_pools
    WHERE activity_center_id = ? AND year_month = ?
  `).get(activityCenterId, prevMonth) as any

  if (pool && pool.driver_rate > 0) return pool.driver_rate

  // 3. 最终降级：使用该作业中心关联的 BOM 的平均标准成本
  const defaultRate = db.prepare(`
    SELECT AVG(b.standard_slide_cost / (
      SELECT COUNT(*) FROM abc_bom_activity_links WHERE bom_id = b.id
    )) as avg_rate
    FROM boms b
    JOIN abc_bom_activity_links bal ON bal.bom_id = b.id
    WHERE bal.activity_center_id = ? AND b.standard_slide_cost > 0
  `).get(activityCenterId) as any

  return defaultRate?.avg_rate || 0
}
```

#### 2.2.3: 新增 calculateFeeAmountFromStandard 函数

```typescript
/**
 * 根据收费标准对象计算收费金额
 * @param feeStandard - 收费标准对象 { base_price, tier_rules, cap_amount }
 * @param quantity - 数量
 * @returns 收费金额
 */
export function calculateFeeAmountFromStandard(
  feeStandard: { base_price: number; tier_rules: string | null; cap_amount: number | null },
  quantity: number
): number {
  if (!feeStandard || quantity <= 0) return 0

  // 解析阶梯规则
  let tiers: Array<{ maxQuantity?: number; unitPrice: number }> = []
  if (feeStandard.tier_rules) {
    try {
      tiers = JSON.parse(feeStandard.tier_rules)
    } catch {
      // 解析失败，使用基础价格
      return Math.round(feeStandard.base_price * quantity * 100) / 100
    }
  }

  if (tiers.length > 0) {
    return calculateTieredCost(quantity, tiers, feeStandard.cap_amount || undefined)
  }

  // 无阶梯规则，按基础价格计算
  return Math.round(feeStandard.base_price * quantity * 100) / 100
}
```

#### 2.2.3: 扩展 calculateSlideCost 函数

在现有函数基础上，增加收费匹配逻辑和降级策略

#### 2.2.4: 扩展 SlideCostBreakdown 接口

```typescript
export interface SlideCostBreakdown {
  materialCost: number
  activityCosts: ActivityCostBreakdown[]
  totalActivityCost: number
  totalCost: number
  // 新增字段
  feeAmount: number
  feeStandardId: string | null
  feeCategory: string | null
  profit: number
  profitRate: number
}
```

**验收标准**:
- [ ] getDriverRate 三级降级策略正确
- [ ] calculateFeeAmountFromStandard 正确计算收费金额
- [ ] 阶梯定价正确（10张/20张/更多）
- [ ] 封顶机制正确
- [ ] calculateSlideCost 返回收费和利润字段
- [ ] 单元测试覆盖所有场景

---

### 任务 2.3: 后端 — 改造出库路由

**文件**: `后端代码/server/src/routes/outbound-v1.1.ts`
**位置**: `router.post('/bom', ...)` 路由（约第 222 行）

**改动内容**:

在出库成功后，增加 ABC 成本计算和收费匹配逻辑（使用 try-catch 包裹，失败不阻断）

**验收标准**:
- [ ] 出库时自动计算 ABC 成本
- [ ] ABC 计算失败不阻断出库
- [ ] outbound_abc_details 记录正确写入
- [ ] outbound_records 增加 ABC 字段
- [ ] 出库响应包含 abcCostDetail 字段
- [ ] 无 BOM 出库正确处理

---

### 任务 2.4: 后端 — 新增出库成本预览 API

**文件**: `后端代码/server/src/routes/outbound-v1.1.ts`

**新增端点**: `POST /api/v1/outbound/preview-cost`

**设计**:
- 不创建任何数据库记录
- 使用 try-catch 包裹，失败返回降级数据
- 权限：admin, warehouse_manager, technician, pathologist

**验收标准**:
- [ ] API 返回成本预览数据
- [ ] 不创建任何数据库记录
- [ ] 收费金额正确计算
- [ ] 利润和利润率正确计算
- [ ] 成本池为空时使用降级策略

---

### 任务 2.5: 后端 — 新增盈利性分析 API

**文件**: `后端代码/server/src/routes/abc-v1.1.ts`

**新增端点**: `GET /api/v1/abc/profitability`

**设计**:
- 权限：admin, finance, pathologist
- 支持按项目类型、时间范围筛选
- 支持 project/case/bom 三种聚合维度

**验收标准**:
- [ ] API 返回盈利性分析数据
- [ ] 支持按项目类型筛选
- [ ] 支持按时间范围筛选
- [ ] 汇总数据正确
- [ ] 权限控制正确

---

### 任务 2.6: 前端 — 出库弹窗增加成本预览面板

**文件**: `前端代码/src/pages/outbound/components/OutboundFormModal.tsx`（或类似文件）

**设计规范**（基于 DESIGN.md）：
- 面板容器：`bg-gray-50 rounded-lg p-4`
- 标签：`text-sm text-gray-500`
- 数值：`text-sm font-medium text-gray-900`
- 利润率标签：`rounded-full px-2 py-1 text-xs font-medium`
- 防抖：300ms，仅在 BOM 和样本数变化时调用

**复用组件**：
- `formatCurrency()` — 金额格式化
- `ProfitBadge` — 利润率标签（需新增）

**验收标准**:
- [ ] 选择 BOM 和样本数后实时显示成本预览
- [ ] 材料成本和作业成本正确显示
- [ ] 作业成本明细（各作业中心）正确显示
- [ ] 收费金额和利润正确显示
- [ ] 利润率颜色标签正确
- [ ] 防抖 300ms

---

### 任务 2.7: 前端 — 出库列表增加 ABC 成本列

**文件**: `前端代码/src/pages/outbound/Outbound.tsx`（或类似文件）

**设计规范**：
- 表头：`bg-gray-50 text-xs font-medium text-gray-500 uppercase`
- 单元格：`px-4 py-3 text-sm`
- 利润列：正值绿色 `text-green-600`，负值红色 `text-red-600`

**验收标准**:
- [ ] 出库列表显示 ABC 总成本列
- [ ] 出库列表显示收费金额列
- [ ] 出库列表显示利润列
- [ ] 利润颜色标签正确

---

### 任务 2.8: 单元测试（PM-QA-001 强制）

**文件**: `后端代码/server/src/utils/cost-calculator.test.ts`

**基于 PM-QA-001 审查要求，必须覆盖以下测试场景**：

#### 2.8.1: calculateFeeAmountFromStandard — 阶梯定价测试

```typescript
describe('calculateFeeAmountFromStandard', () => {
  // 基础场景
  it('无阶梯规则，基础价格 × 数量', () => {
    const standard = { base_price: 100, tier_rules: null, cap_amount: null }
    expect(calculateFeeAmountFromStandard(standard, 5)).toBe(500)
  })

  // 阶梯定价边界测试（对抗性提示 - 边界1）
  it('IHC 阶梯：前3项205元，第4-12项210元，第13+项105元', () => {
    const standard = {
      base_price: 205,
      tier_rules: JSON.stringify([
        { maxQuantity: 3, unitPrice: 205 },
        { maxQuantity: 12, unitPrice: 210 },
        { unitPrice: 105 },
      ]),
      cap_amount: null,
    }
    // 5 项 = 3×205 + 2×210 = 615 + 420 = 1035
    expect(calculateFeeAmountFromStandard(standard, 5)).toBe(1035)
    // 15 项 = 3×205 + 9×210 + 3×105 = 615 + 1890 + 315 = 2820
    expect(calculateFeeAmountFromStandard(standard, 15)).toBe(2820)
  })

  // 诊断费阶梯测试
  it('诊断费阶梯：前10张105元，11-20张147元，21+张189元', () => {
    const standard = {
      base_price: 105,
      tier_rules: JSON.stringify([
        { maxQuantity: 10, unitPrice: 105 },
        { maxQuantity: 20, unitPrice: 147 },
        { unitPrice: 189 },
      ]),
      cap_amount: null,
    }
    // 5 张 = 5×105 = 525
    expect(calculateFeeAmountFromStandard(standard, 5)).toBe(525)
    // 15 张 = 10×105 + 5×147 = 1050 + 735 = 1785
    expect(calculateFeeAmountFromStandard(standard, 15)).toBe(1785)
    // 25 张 = 10×105 + 10×147 + 5×189 = 1050 + 1470 + 945 = 3465
    expect(calculateFeeAmountFromStandard(standard, 25)).toBe(3465)
  })

  // 封顶机制测试（对抗性提示 - 边界2）
  it('FISH 封顶：每探针1200元，封顶3600元', () => {
    const standard = {
      base_price: 1200,
      tier_rules: null,
      cap_amount: 3600,
    }
    // 2 探针 = 2400（未达封顶）
    expect(calculateFeeAmountFromStandard(standard, 2)).toBe(2400)
    // 3 探针 = 3600（正好封顶）
    expect(calculateFeeAmountFromStandard(standard, 3)).toBe(3600)
    // 4 探针 = 3600（超过封顶，取封顶值）
    expect(calculateFeeAmountFromStandard(standard, 4)).toBe(3600)
  })

  // 边界值测试
  it('数量为0时返回0', () => {
    const standard = { base_price: 100, tier_rules: null, cap_amount: null }
    expect(calculateFeeAmountFromStandard(standard, 0)).toBe(0)
  })

  it('数量为1时返回基础价格', () => {
    const standard = { base_price: 100, tier_rules: null, cap_amount: null }
    expect(calculateFeeAmountFromStandard(standard, 1)).toBe(100)
  })
})
```

#### 2.8.2: getDriverRate — 降级策略测试

```typescript
describe('getDriverRate', () => {
  // 对抗性提示 - 边界3
  it('当月有数据时使用当月费率', () => {
    // 准备：插入当月成本池数据
    db.prepare('INSERT INTO abc_cost_pools ...').run(...)
    const rate = getDriverRate(db, 'IHC', '2026-06')
    expect(rate).toBe(15.50)
  })

  it('当月无数据时降级使用上月费率', () => {
    // 准备：仅插入上月成本池数据
    db.prepare('INSERT INTO abc_cost_pools ...').run(...)
    const rate = getDriverRate(db, 'IHC', '2026-06')
    expect(rate).toBe(12.00) // 上月费率
  })

  it('当月和上月都无数据时降级使用BOM标准成本', () => {
    // 准备：不插入任何成本池数据
    const rate = getDriverRate(db, 'IHC', '2026-06')
    expect(rate).toBeGreaterThan(0) // BOM标准成本中的默认费率
  })
})
```

#### 2.8.3: calculateSlideCost — ABC 计算测试

```typescript
describe('calculateSlideCost', () => {
  it('正常BOM，单切片，验证材料成本+各作业中心成本', () => {
    const result = calculateSlideCost(db, {
      bomId: 'bom-1', slideCount: 1, blockCount: 1, month: '2026-06',
    })
    expect(result.materialCost).toBeGreaterThan(0)
    expect(result.activityCosts).toHaveLength(4) // 4个作业中心
    expect(result.totalCost).toBe(result.materialCost + result.totalActivityCost)
    expect(result.costPerSlide).toBe(result.totalCost)
  })

  it('空BOM返回0', () => {
    const result = calculateSlideCost(db, {
      bomId: 'nonexistent', slideCount: 1, blockCount: 1, month: '2026-06',
    })
    expect(result.materialCost).toBe(0)
    expect(result.totalActivityCost).toBe(0)
    expect(result.totalCost).toBe(0)
  })

  it('收费匹配正确', () => {
    // 准备：BOM关联收费标准
    const result = calculateSlideCost(db, {
      bomId: 'bom-ihc', slideCount: 5, blockCount: 1, month: '2026-06',
    })
    expect(result.feeAmount).toBe(1035) // 3×205 + 2×210
    expect(result.profit).toBe(result.feeAmount - result.totalCost)
    expect(result.profitRate).toBeCloseTo(result.profit / result.feeAmount, 2)
  })
})
```

#### 2.8.4: ABC 计算失败不阻断出库测试

```typescript
describe('ABC calculation failure isolation', () => {
  it('ABC计算失败时出库仍然成功', async () => {
    // 准备：构造会导致ABC计算失败的条件
    // 执行：出库操作
    // 验证：outbound_records 记录存在
    // 验证：outbound_abc_details 记录不存在（或部分存在）
    // 验证：库存正确扣减
  })
})
```

#### 2.8.5: 出库编辑/删除时 ABC 记录同步测试

```typescript
describe('ABC record sync on outbound edit/delete', () => {
  it('出库删除时ABC记录同步删除', async () => {
    // 准备：创建出库 + ABC记录
    // 执行：删除出库
    // 验证：outbound_records.is_deleted = 1
    // 验证：outbound_abc_details 记录不存在
  })

  it('出库编辑时ABC记录重新计算', async () => {
    // 准备：创建出库 + ABC记录
    // 执行：编辑出库（修改样本数）
    // 验证：outbound_abc_details 记录已更新
    // 验证：新的成本计算正确
  })
})
```

#### 2.8.6: 并发出库测试（PM-QA-001 第二轮补充）

```typescript
describe('concurrent outbound', () => {
  it('两个仓管同时对同一BOM出库，ABC计算不冲突', async () => {
    // 准备：同一BOM，两个并发请求
    // 执行：同时发起两个出库请求
    // 验证：两个出库都成功
    // 验证：两个 ABC 记录都正确写入
    // 验证：库存扣减正确（总扣减 = 两次出库之和）
  })
})
```

#### 2.8.7: BOM/收费标准变更后的数据处理策略（PM-QA-001 第二轮补充）

**策略：快照语义**

- 历史出库记录的 ABC 成本保持不变（快照）
- 新出库使用当前 BOM 配置和收费标准
- 成本趋势页面标注"BOM 配置变更点"
- 收费对照页面标注"收费标准变更点"

**测试用例**：
```typescript
describe('BOM/fee standard change snapshot', () => {
  it('BOM更新后历史出库记录的ABC成本不变', async () => {
    // 准备：创建出库 + ABC记录
    // 执行：更新BOM的作业关联
    // 执行：查询历史出库的ABC成本
    // 验证：历史ABC成本与更新前一致
  })

  it('BOM更新后新出库使用新配置', async () => {
    // 准备：更新BOM的作业关联
    // 执行：创建新出库
    // 验证：新出库的ABC成本使用新配置
  })
})
```

**验收标准**:
- [ ] 所有测试用例通过
- [ ] 阶梯定价边界测试覆盖（跨越 3、10、20 张边界）
- [ ] 封顶机制测试覆盖（未达封顶、正好封顶、超过封顶）
- [ ] 降级策略测试覆盖（当月/上月/BOM 标准三级降级）
- [ ] ABC 计算失败不阻断出库测试
- [ ] 出库编辑/删除时 ABC 记录同步测试
- [ ] 并发出库测试
- [ ] BOM/收费标准变更后数据处理测试
- [ ] 断言严格（不使用 toBeDefined，使用 toBe/tobeCloseTo/tomatchObject）

---

## 依赖关系

```
2.1 (数据库) ──→ 2.2 (计算引擎) ──→ 2.3 (出库改造)
                    │                    │
                    │                    ├──→ 2.6 (出库预览面板)
                    │                    └──→ 2.7 (出库列表)
                    │
                    └──→ 2.4 (预览API)
                    └──→ 2.5 (盈利性API)
                    └──→ 2.8 (单元测试)
```

### 任务 2.9: 退库成本处理（故事 21）

**文件**: `后端代码/server/src/routes/returns-v1.1.ts`

**改动内容**:

在退库流程中增加 ABC 成本处理：

```typescript
// 退库时，记录退库的 ABC 成本
router.post('/', authenticateToken, (req, res) => {
  // ... 现有退库逻辑 ...

  // 新增：记录退库的 ABC 成本
  const originalAbc = db.prepare(`
    SELECT * FROM outbound_abc_details WHERE outbound_id = ?
  `).get(outboundId) as any

  if (originalAbc) {
    // 按退库数量比例计算退库成本
    const returnRatio = returnQuantity / originalQuantity
    const returnMaterialCost = originalAbc.material_cost * returnRatio
    const returnActivityCost = originalAbc.activity_cost * returnRatio
    const returnTotalCost = returnMaterialCost + returnActivityCost
    const returnFeeAmount = originalAbc.fee_amount * returnRatio

    // 写入退库 ABC 记录
    db.prepare(`
      INSERT INTO outbound_abc_details
      (id, outbound_id, bom_id, project_id, sample_count, material_cost, activity_cost, total_cost, fee_amount, profit, cost_month)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(uuidv4(), returnId, originalAbc.bom_id, originalAbc.project_id,
      -returnQuantity, -returnMaterialCost, -returnActivityCost, -returnTotalCost,
      -returnFeeAmount, returnFeeAmount - returnTotalCost, month)
  }
})
```

**验收标准**:
- [ ] 退库时正确计算退库成本
- [ ] 退库成本按比例计算
- [ ] 退库记录正确写入 outbound_abc_details
- [ ] 退库对利润的影响正确

---

### 任务 2.10: 批次成本追溯（故事 20）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts`

**新增端点**: `GET /api/v1/abc/batch-trace/:batchId`

**返回数据**:
```typescript
{
  batch: {
    batchId: string,
    batchNo: string,
    materialId: string,
    materialName: string,
    inboundPrice: number,
    supplierName: string,
    inboundDate: string,
    expiryDate: string,
    remaining: number,
  },
  outboundRecords: [{
    outboundId: string,
    outboundNo: string,
    date: string,
    projectName: string,
    quantity: number,
    unitCost: number,
    totalCost: number,
  }],
  costTrend: [{
    month: string,
    avgUnitCost: number,
    totalQuantity: number,
  }],
}
```

**验收标准**:
- [ ] 批次信息正确返回
- [ ] 使用该批次的出库记录正确返回
- [ ] 批次成本趋势正确
- [ ] 权限控制正确

---

### 任务 2.11: 出库前成本预览增强（故事 19 补充）

**文件**: `前端代码/src/pages/outbound/components/OutboundFormModal.tsx`

**增强内容**:

在成本预览面板中增加阶梯定价预览：

```tsx
// 阶梯定价预览
{preview.feeBreakdown && (
  <div className="mt-3 pt-3 border-t border-gray-200">
    <h5 className="text-xs font-medium text-gray-500 mb-2">收费明细</h5>
    {preview.feeBreakdown.map((item, index) => (
      <div key={index} className="flex justify-between text-xs text-gray-600">
        <span>{item.name}</span>
        <span>{formatCurrency(item.amount)}</span>
      </div>
    ))}
  </div>
)}
```

**验收标准**:
- [ ] 阶梯定价预览正确显示
- [ ] 封顶金额正确显示
- [ ] 收费明细逐项展示

---

## 预计工时

| 任务 | 工时 |
|------|------|
| 2.1 数据库 | 0.5h |
| 2.2 计算引擎 | 3.5h |
| 2.3 出库改造 | 2.5h |
| 2.4 预览API | 1.5h |
| 2.5 盈利性API | 2h |
| 2.6 出库预览面板 | 2.5h |
| 2.7 出库列表 | 1h |
| 2.8 单元测试 | 2h |
| 2.9 退库成本处理 | 2h |
| 2.10 批次成本追溯 | 2h |
| 2.11 出库预览增强 | 1h |
| **合计** | **20.5h** |
