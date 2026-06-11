# Phase 1: 配置基础 — 详细实施计划（修订版）

> **目标**: 让技术人员能配置 ABC 基础数据（收费标准映射、成本池、作业中心）
> **前置条件**: fee_standards 表已有 82 条数据，abc_activity_centers 已有 8 条数据
> **参考**:
> - [产品规划](abc-product-plan.md)
> - [前端设计规范调研] 基于 DESIGN.md + coreone-guardrails.md + 现有组件分析
> - [质量审查报告] 5 个 P0 问题

---

## 核心阻塞问题处理（Phase 1 必须解决）

### 阻塞问题 1: BOM-收费标准映射可行性未验证

**问题**: 计划假设一个 BOM 可以映射到一个收费标准，但实际业务中一个 BOM 可能需要多个收费编码（如 IHC = 诊断费 + IHC 检测费 + 标本处理费）

**方案**: 用真实数据验证 3-5 个典型 BOM 的映射关系，设计一对多映射表

**文件**: `后端代码/server/src/database/DatabaseManager.ts` + `后端代码/server/scripts/seed-bom-fee-mapping.ts`

**任务**:

#### 1.1.1: 分析典型 BOM 的收费编码映射

基于教授解释文档和收费标准 Excel，分析以下 BOM 的映射关系：

| BOM 类型 | 收费编码 | 收费名称 | 映射说明 |
|---------|---------|---------|---------|
| HE 染色 | 012100000010000 | 病理诊断费 | 诊断费按切片数阶梯 |
| HE 染色 | 012100000030000 | 常规标本处理费 | 按蜡块数阶梯 |
| IHC | 012100000010000 | 病理诊断费 | 诊断费按切片数阶梯 |
| IHC | 012100000120000 | IHC 染色检查费 | 按检测项数阶梯 |
| 特染 | 012100000010000 | 病理诊断费 | 诊断费按切片数阶梯 |
| 特染 | 012100000110000 | 化学染色检查费 | 按切片数阶梯 |
| FISH | 012100000150000 | 荧光探针检测费 | 按探针数，封顶3600 |
| PCR | 012100000170000 | 实时荧光PCR | 按位点数 |

#### 1.1.2: 设计一对多映射表

**新增表**: `bom_fee_mappings`

```sql
CREATE TABLE IF NOT EXISTS bom_fee_mappings (
  id TEXT PRIMARY KEY,
  bom_id TEXT NOT NULL,
  fee_standard_id TEXT NOT NULL,
  quantity_expression TEXT NOT NULL,  -- slide_count/block_count/test_count/probe_count
  quantity_multiplier REAL DEFAULT 1, -- 数量乘数（如每个蜡块对应多少切片）
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(bom_id, fee_standard_id),
  FOREIGN KEY (bom_id) REFERENCES boms(id),
  FOREIGN KEY (fee_standard_id) REFERENCES fee_standards(id)
);
```

#### 1.1.3: 验证收费标准数据完整性

检查 82 条收费编码是否完整：
- 阶梯规则 JSON 格式是否正确
- 封顶金额是否合理
- 编码是否唯一

**验收标准**:
- [ ] 3-5 个典型 BOM 的映射关系已验证
- [ ] bom_fee_mappings 表已创建
- [ ] 映射可行性报告已输出
- [ ] 确认一对多映射方案可行
- [ ] 收费标准数据完整性已验证

---

### 阻塞问题 2: 阶梯定价的跨 BOM 聚合问题未设计

**问题**: 阶梯定价在病例级别触发，不是单个 BOM 级别。当前设计会把每个 BOM 独立计算，导致收费金额错误

**方案**: 设计"病例级收费聚合器"，在病例级别聚合同一收费类别的数量

**文件**: `后端代码/server/src/utils/cost-calculator.ts`

**任务**:

#### 1.2.1: 分析阶梯定价触发条件

基于教授解释文档，明确阶梯定价的触发条件：

| 收费类别 | 阶梯触发条件 | 说明 |
|---------|-------------|------|
| 诊断费 | 病例级（同一患者所有切片） | 1-19张105元，20-29张147元，30+张189元 |
| 标本处理费 | BOM级（每个蜡块） | 1-3个36元，第4个起+7.2元，封顶13个 |
| IHC 检测费 | 病例级（同一患者所有 IHC） | 前3项205元，4-12项210元，13+项105元 |
| 特染费 | BOM级（每张切片） | 前3张80元，第4张起85元 |
| FISH | BOM级（每个探针） | 每探针1200元，封顶3600元 |

#### 1.2.2: 设计病例级收费聚合函数

```typescript
/**
 * 病例级收费聚合器
 * 将同一病例的多个 BOM 的收费按类别聚合后计算阶梯定价
 */
export function calculateCaseFee(
  db: any,
  caseId: string,
  slides: Array<{ bomId: string; slideCount: number; blockCount: number }>
): CaseFeeBreakdown {
  // 1. 按收费类别聚合数量
  const categoryQuantities: Record<string, number> = {}
  for (const slide of slides) {
    const mappings = db.prepare(`
      SELECT fs.category, fs.code, fm.quantity_expression, fm.quantity_multiplier
      FROM bom_fee_mappings fm
      JOIN fee_standards fs ON fm.fee_standard_id = fs.id
      WHERE fm.bom_id = ?
    `).all(slide.bomId) as any[]

    for (const mapping of mappings) {
      const quantity = getQuantityByExpression(mapping.quantity_expression, slide) * (mapping.quantity_multiplier || 1)
      categoryQuantities[mapping.category] = (categoryQuantities[mapping.category] || 0) + quantity
    }
  }

  // 2. 按类别计算阶梯定价
  let totalFee = 0
  const feeDetails: FeeDetail[] = []
  for (const [category, quantity] of Object.entries(categoryQuantities)) {
    const feeStandard = db.prepare(`
      SELECT * FROM fee_standards WHERE category = ? AND status = 1
    `).get(category) as any

    if (feeStandard) {
      const fee = calculateFeeAmountFromStandard(feeStandard, quantity)
      totalFee += fee
      feeDetails.push({ category, quantity, fee, feeStandardId: feeStandard.id })
    }
  }

  return { totalFee, feeDetails }
}
```

#### 1.2.3: 验证聚合结果正确性

测试用例：
- 一个病例包含 HE + IHC，验证诊断费按切片数阶梯聚合
- 一个病例包含多个 IHC，验证检测费按项数阶梯聚合
- 一个病例包含 FISH，验证封顶机制正确

**验收标准**:
- [ ] 阶梯定价触发条件已明确
- [ ] 病例级聚合函数已实现
- [ ] 聚合结果正确性已验证（测试用例通过）
- [ ] 与单 BOM 独立计算的结果对比正确

---

### P0-1: ABC 计算失败不应阻断出库事务

**问题**: 出库事务中嵌入 ABC 计算，如果计算失败会导致整个出库回滚
**方案**: ABC 计算使用 try-catch 包裹，失败时记录日志但不阻断出库

```typescript
// 在出库事务中
try {
  const slideCost = calculateSlideCost(db, { bomId, slideCount, blockCount, month, materialCost })
  // 写入 outbound_abc_details
} catch (err) {
  console.error('ABC calculation failed, outbound continues:', err)
  // 不抛出异常，出库继续
}
```

### P0-2: 出库编辑/删除时必须同步清理 ABC 记录

**问题**: 出库记录编辑/删除时，outbound_abc_details 未同步清理
**方案**: 在出库编辑/删除路由中增加 ABC 记录清理逻辑

```typescript
// 出库删除时
router.delete('/:id', (req, res) => {
  // ... 现有逻辑 ...
  db.prepare('UPDATE outbound_records SET is_deleted = 1 WHERE id = ?').run(id)
  // 新增：同步标记 ABC 记录删除
  db.prepare('DELETE FROM outbound_abc_details WHERE outbound_id = ?').run(id)
})

// 出库编辑时
router.put('/:id', (req, res) => {
  // ... 现有逻辑 ...
  // 新增：重新计算 ABC 成本
  db.prepare('DELETE FROM outbound_abc_details WHERE outbound_id = ?').run(id)
  // 重新计算并写入
})
```

### P0-3: 成本池为空时需要降级策略

**问题**: 成本池数据为空时，ABC 计算返回 0，导致成本失真
**方案**: 三级降级策略

```
1. 优先使用当月成本池数据
2. 降级使用上月成本池数据
3. 最终降级使用 BOM 标准成本
```

```typescript
function getDriverRate(db, activityCenterId, month) {
  // 1. 查当月成本池
  let pool = db.prepare('SELECT * FROM abc_cost_pools WHERE activity_center_id = ? AND year_month = ?')
    .get(activityCenterId, month)
  if (pool && pool.driver_rate > 0) return pool.driver_rate

  // 2. 降级查上月
  const prevMonth = getPreviousMonth(month)
  pool = db.prepare('SELECT * FROM abc_cost_pools WHERE activity_center_id = ? AND year_month = ?')
    .get(activityCenterId, prevMonth)
  if (pool && pool.driver_rate > 0) return pool.driver_rate

  // 3. 最终降级使用 BOM 标准成本
  return getDefaultRate(activityCenterId)
}
```

### P0-4: 无 BOM 出库需要明确处理路径

**问题**: 无 BOM 的出库记录无法计算 ABC 成本
**方案**: 无 BOM 出库仅记录材料成本，ABC 成本为 0，在前端明确标识

```typescript
if (!bomId) {
  // 无 BOM，仅记录材料成本
  db.prepare(`
    INSERT INTO outbound_abc_details (id, outbound_id, material_cost, total_cost, cost_per_slide, cost_month)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), outboundId, materialCost, materialCost, 0, month)
}
```

### P0-5: 成本数据的读权限需要按角色控制

**问题**: ABC 管理 API 读操作无权限控制
**方案**: 按角色控制读权限

```typescript
// 读操作：admin, finance, pathologist 可查看
router.get('/profitability', authenticateToken, requireRole('admin', 'finance', 'pathologist'), ...)

// 写操作：仅 admin, finance
router.post('/cost-pools', authenticateToken, requireRole('admin', 'finance'), ...)
```

---

## 任务清单

### 任务 1.1: 数据库 — boms 表增加收费标准字段

**文件**: `后端代码/server/src/database/DatabaseManager.ts`
**位置**: `initializeDatabase()` 函数，兼容旧数据库 section（约第 246 行）

**改动内容**:
```sql
ALTER TABLE boms ADD COLUMN fee_standard_id TEXT;
ALTER TABLE boms ADD COLUMN fee_category TEXT;
ALTER TABLE boms ADD COLUMN standard_slide_cost DECIMAL(18,4) DEFAULT 0;
ALTER TABLE boms ADD COLUMN standard_fee_per_slide DECIMAL(18,4) DEFAULT 0;
ALTER TABLE boms ADD COLUMN standard_margin_rate DECIMAL(18,4) DEFAULT 0;
```

**实现方式**:
- 使用 PRAGMA table_info(boms) 检查列是否存在
- 使用 try-catch 包裹 ALTER 语句防止重复执行报错

**验收标准**:
- [ ] ALTER 语句幂等执行
- [ ] boms 表新增 5 个字段
- [ ] 现有数据不受影响

---

### 任务 1.2: 后端 — BOM CRUD 支持收费标准字段

**文件**: `后端代码/server/src/routes/bom-v1.1.ts`

#### 1.2.1: GET /boms (列表) — 返回增加收费标准字段

**位置**: 第 26 行，`successList` 调用

**改动**:
```typescript
successList(res, list.map((r: any) => ({
  id: r.id, code: r.code, name: r.name, ...,
  feeStandardId: r.fee_standard_id,
  feeCategory: r.fee_category,
  standardSlideCost: r.standard_slide_cost,
  standardFeePerSlide: r.standard_fee_per_slide,
  standardMarginRate: r.standard_margin_rate,
})), ...)
```

#### 1.2.2: GET /boms/:id (详情) — 返回增加收费标准字段

**位置**: 第 113 行，`success` 调用

**改动**: 增加收费标准字段返回

#### 1.2.3: POST /boms (创建) — 支持收费标准字段

**位置**: 第 152 行，`INSERT INTO boms` 语句

**改动**: INSERT 语句增加 `fee_standard_id, fee_category` 字段

#### 1.2.4: PUT /boms/:id (更新) — 支持收费标准字段

**位置**: 第 234 行，`UPDATE boms SET` 语句

**改动**: UPDATE 语句增加 `fee_standard_id, fee_category` 字段

#### 1.2.5: POST/PUT 后自动计算标准成本

**位置**: `updateBomStandardCost()` 函数（第 89 行）

**改动**: 增加收费标准匹配和标准切片成本计算

**验收标准**:
- [ ] BOM 列表返回收费标准字段
- [ ] BOM 详情返回收费标准字段
- [ ] BOM 创建/更新支持收费标准字段
- [ ] BOM 创建/更新后自动计算标准切片成本和利润率

---

### 任务 1.3: 后端 — 收费标准查询 API

**文件**: `后端代码/server/src/routes/abc-v1.1.ts`

**新增端点**:

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/v1/abc/fee-standards | 收费标准列表 | admin, finance, pathologist |
| GET | /api/v1/abc/fee-standards/:id | 单个详情 | admin, finance, pathologist |
| GET | /api/v1/abc/fee-standards/calculate | 预览计算 | admin, finance, pathologist |

**验收标准**:
- [ ] 列表支持按 category 筛选
- [ ] 列表支持按 keyword 搜索
- [ ] 详情返回阶梯规则
- [ ] 预览计算结果正确
- [ ] 权限控制正确

---

### 任务 1.4: 后端 — 成本池管理 API 增强

**文件**: `后端代码/server/src/routes/abc-v1.1.ts`

**新增端点**:

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /api/v1/abc/cost-pools/sync | 从间接成本中心同步 | admin, finance |
| POST | /api/v1/abc/cost-pools/auto-collect | 自动归集动因数量 | admin, finance |
| POST | /api/v1/abc/cost-pools/recalculate | 重新计算费率 | admin, finance |

#### sync 端点详细逻辑

```typescript
// POST /api/v1/abc/cost-pools/sync
// 从 indirect_cost_centers 表读取月度金额，按成本类型映射到作业中心
router.post('/cost-pools/sync', authenticateToken, requireRole('admin', 'finance'), (req, res) => {
  const { yearMonth } = req.body
  const db = getDatabase()

  // 1. 读取所有间接成本中心的月度金额
  const centers = db.prepare(`
    SELECT id, cost_type, monthly_amount FROM indirect_cost_centers WHERE status = 1
  `).all() as any[]

  // 2. 按成本类型映射到作业中心
  const costTypeToActivityMap: Record<string, string> = {
    'rent': 'SPECIMEN',        // 房租 → 标本处理中心（面积最大）
    'utilities': 'HE_STAIN',   // 水电 → 常规染色中心（用水最多）
    'maintenance': 'IHC',      // 维护 → 免疫组化中心（设备最多）
    'admin': 'DIAGNOSIS',      // 管理费 → 诊断中心
    'it': 'DIAGNOSIS',         // IT费用 → 诊断中心
    'other': 'SPECIMEN',       // 其他 → 标本处理中心
  }

  let synced = 0
  for (const center of centers) {
    const activityCode = costTypeToActivityMap[center.cost_type]
    if (!activityCode) continue

    const activity = db.prepare('SELECT id FROM abc_activity_centers WHERE code = ?').get(activityCode) as any
    if (!activity) continue

    // 更新或插入成本池
    const existing = db.prepare(`
      SELECT id FROM abc_cost_pools WHERE activity_center_id = ? AND year_month = ?
    `).get(activity.id, yearMonth) as any

    if (existing) {
      db.prepare(`
        UPDATE abc_cost_pools SET indirect_cost = indirect_cost + ? WHERE id = ?
      `).run(center.monthly_amount, existing.id)
    } else {
      db.prepare(`
        INSERT INTO abc_cost_pools (id, activity_center_id, year_month, indirect_cost)
        VALUES (?, ?, ?, ?)
      `).run(uuidv4(), activity.id, yearMonth, center.monthly_amount)
    }
    synced++
  }

  success(res, { synced, yearMonth })
})
```

#### auto-collect 端点详细逻辑

```typescript
// POST /api/v1/abc/cost-pools/auto-collect
// 根据出库记录自动计算当月各作业中心的实际动因数量
router.post('/cost-pools/auto-collect', authenticateToken, requireRole('admin', 'finance'), (req, res) => {
  const { yearMonth } = req.body
  const db = getDatabase()

  // 1. 获取所有作业中心
  const activities = db.prepare('SELECT id, code FROM abc_activity_centers WHERE status = 1').all() as any[]

  let collected = 0
  for (const activity of activities) {
    // 2. 统计当月该作业中心的实际动因数量
    // 从 outbound_abc_details 的 activity_details JSON 中聚合
    const result = db.prepare(`
      SELECT SUM(
        json_extract(json_each.value, '$.driverQuantity')
      ) as total_quantity
      FROM outbound_abc_details, json_each(activity_details)
      WHERE cost_month = ?
        AND json_extract(json_each.value, '$.activityCenterCode') = ?
    `).get(yearMonth, activity.code) as any

    const driverQuantity = result?.total_quantity || 0

    // 3. 更新成本池的动因数量
    db.prepare(`
      UPDATE abc_cost_pools SET driver_quantity = ?
      WHERE activity_center_id = ? AND year_month = ?
    `).run(driverQuantity, activity.id, yearMonth)
    collected++
  }

  success(res, { collected, yearMonth })
})
```

#### recalculate 端点详细逻辑

```typescript
// POST /api/v1/abc/cost-pools/recalculate
// 根据最新数据重新计算费率
router.post('/cost-pools/recalculate', authenticateToken, requireRole('admin', 'finance'), (req, res) => {
  const { yearMonth } = req.body
  const db = getDatabase()

  const pools = db.prepare(`
    SELECT id, direct_cost, indirect_cost, driver_quantity
    FROM abc_cost_pools WHERE year_month = ?
  `).all(yearMonth) as any[]

  let recalculated = 0
  for (const pool of pools) {
    const totalCost = (pool.direct_cost || 0) + (pool.indirect_cost || 0)
    const driverRate = pool.driver_quantity > 0 ? totalCost / pool.driver_quantity : 0

    db.prepare(`
      UPDATE abc_cost_pools SET total_cost = ?, driver_rate = ? WHERE id = ?
    `).run(totalCost, driverRate, pool.id)
    recalculated++
  }

  success(res, { recalculated, yearMonth })
})
```

**验收标准**:
- [ ] 同步端点正确从间接成本中心读取数据
- [ ] 自动归集端点正确统计动因数量
- [ ] 重新计算端点正确计算费率
- [ ] 权限控制正确

---

### 任务 1.5: 前端 — BOM 详情页增加收费标准 Tab

**文件**: `前端代码/src/pages/bom/components/BOMDetailModal.tsx`（或类似文件）

**设计规范**（基于 DESIGN.md）：
- Tab 样式：`border-b border-gray-200`，选中项 `text-blue-500 border-b-2 border-blue-500`
- 输入框：`h-10 px-3 text-sm border border-gray-300 rounded-md`
- 按钮：`bg-[#3b82f6] text-white rounded-md h-10 px-4 text-sm font-medium`

**复用组件**：
- `SearchableSelect` — 收费标准下拉选择
- `formatCurrency()` — 金额格式化

**验收标准**:
- [ ] BOM 详情页显示"收费标准"Tab
- [ ] 可以选择收费类别和收费标准
- [ ] 收费规则正确预览（阶梯定价）
- [ ] 标准成本和利润率自动计算
- [ ] 保存后 BOM 关联更新

---

### 任务 1.6: 前端 — BOM 列表增加收费和利润率列

**文件**: `前端代码/src/pages/bom/BOM.tsx`（或类似文件）

**设计规范**：
- 表头：`bg-gray-50 text-xs font-medium text-gray-500 uppercase`
- 单元格：`px-4 py-3 text-sm`
- 利润率标签：`rounded-full px-2 py-1 text-xs font-medium`
  - 绿色：`bg-green-100 text-green-800`（>= 20%）
  - 黄色：`bg-yellow-100 text-yellow-800`（0-20%）
  - 红色：`bg-red-100 text-red-800`（< 0%）

**验收标准**:
- [ ] BOM 列表显示标准切片成本列
- [ ] BOM 列表显示标准利润率列
- [ ] 利润率颜色标签正确

---

### 任务 1.7: 前端 — 成本池管理页面增强

**文件**: `前端代码/src/pages/cost/CostPoolList.tsx`（改造现有）

**新增功能**：
1. "从间接成本中心同步"按钮
2. "自动归集"按钮
3. "重新计算费率"按钮
4. 状态列（数据来源）

**设计规范**：
- 按钮：Secondary 样式 `bg-white text-gray-700 border border-gray-300 rounded-md h-10 px-4`
- 表格：`bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden`

**验收标准**:
- [ ] 同步按钮正确填充间接成本数据
- [ ] 自动归集按钮正确统计动因数量
- [ ] 重新计算按钮正确计算费率
- [ ] 状态列正确显示数据来源

---

### 任务 1.8: 种子数据 — BOM-收费标准映射

**文件**: `后端代码/server/scripts/seed-bom-fee-mapping.ts`（新增）

**改动内容**:

为系统预置的 BOM 配置收费标准映射：

```typescript
// 基于教授解释文档和收费标准 Excel 的映射关系
const bomFeeMappings = [
  // HE 染色 → 诊断费 + 标本处理费 + HE染色费
  { bomType: 'he', feeCategory: 'diagnosis', feeStandardCode: '012100000010000' },  // 病理诊断费
  { bomType: 'he', feeCategory: 'specimen常规', feeStandardCode: '012100000030000' },  // 常规标本处理费
  { bomType: 'he', feeCategory: 'stain_he', feeStandardCode: '012100000010000' },  // HE染色费（含在诊断费中）

  // IHC 免疫组化 → 诊断费 + IHC检测费
  { bomType: 'ihc', feeCategory: 'diagnosis', feeStandardCode: '012100000010000' },  // 病理诊断费
  { bomType: 'ihc', feeCategory: 'ihc', feeStandardCode: '012100000120000' },  // IHC常规染色

  // 特殊染色 → 诊断费 + 特染费
  { bomType: 'ss', feeCategory: 'diagnosis', feeStandardCode: '012100000010000' },  // 病理诊断费
  { bomType: 'ss', feeCategory: 'ss', feeStandardCode: '012100000110000' },  // 特殊染色

  // 分子病理 FISH → FISH检测费
  { bomType: 'mp', feeCategory: 'fish', feeStandardCode: '012100000150000' },  // FISH检测

  // 分子病理 PCR → PCR检测费
  { bomType: 'mp', feeCategory: 'pcr_fluorescence', feeStandardCode: '012100000170000' },  // 实时荧光PCR

  // 分子病理 NGS → NGS检测费
  { bomType: 'mp', feeCategory: 'ngs', feeStandardCode: '012100000200000' },  // NGS

  // 细胞病理 → 诊断费 + 标本处理费 + 染色费
  { bomType: 'cyto', feeCategory: 'cyto_diagnosis', feeStandardCode: '012100000010000' },  // 诊断费
  { bomType: 'cyto', feeCategory: 'cyto_specimen', feeStandardCode: '012100000050000' },  // 细胞标本处理费
]

// 执行映射
for (const mapping of bomFeeMappings) {
  const bom = db.prepare('SELECT id FROM boms WHERE type = ? AND is_deleted = 0 LIMIT 1').get(mapping.bomType) as any
  const feeStandard = db.prepare('SELECT id FROM fee_standards WHERE code = ?').get(mapping.feeStandardCode) as any

  if (bom && feeStandard) {
    db.prepare(`
      UPDATE boms SET fee_standard_id = ?, fee_category = ? WHERE id = ?
    `).run(feeStandard.id, mapping.feeCategory, bom.id)
  }
}
```

**验收标准**:
- [ ] 预置 BOM 已关联收费标准
- [ ] BOM 详情页可看到收费标准配置
- [ ] 标准切片成本和利润率自动计算

---

### 任务 1.9: 后端 — 出库编辑/删除同步清理 ABC 记录（P0-2）

**文件**: `后端代码/server/src/routes/outbound-v1.1.ts`

**改动内容**:

在出库编辑和删除路由中增加 ABC 记录清理逻辑

**验收标准**:
- [ ] 出库删除时 ABC 记录同步删除
- [ ] 出库编辑时 ABC 记录重新计算

---

## 依赖关系

```
1.1 (数据库) ──→ 1.2 (BOM CRUD) ──→ 1.5 (前端Tab)
                    │                    └──→ 1.6 (前端列表)
                    │
                    └──→ 1.3 (收费API)
                    └──→ 1.8 (种子数据)

1.4 (成本池API) ──→ 1.7 (成本池页面)
1.9 (出库同步清理) ──→ 独立
```

### 任务 1.10: 人员技能成本配置（故事 29）

**文件**: `后端代码/server/src/routes/labor-time-v1.1.ts`（改造现有）

**改动内容**:

在标准工时库中增加技能等级和费率配置：

```typescript
// standard_labor_times 表增加字段
ALTER TABLE standard_labor_times ADD COLUMN skill_level TEXT DEFAULT 'standard';
ALTER TABLE standard_labor_times ADD COLUMN skill_rate_multiplier DECIMAL(18,4) DEFAULT 1.0;
```

**技能等级定义**：
- `junior` — 初级（费率倍数 0.8）
- `standard` — 标准（费率倍数 1.0）
- `senior` — 高级（费率倍数 1.3）
- `expert` — 专家（费率倍数 1.6）

**验收标准**:
- [ ] 标准工时库支持技能等级配置
- [ ] 不同技能等级的费率正确计算
- [ ] 前端页面可配置技能等级

---

### 任务 1.11: BOM 版本管理增强（故事 26）

**文件**: `后端代码/server/src/routes/bom-v1.1.ts`

**改动内容**:

增强现有 BOM 版本管理功能：

1. **版本对比 API**：`GET /api/v1/boms/:id/compare?version1=v1.0&version2=v1.1`
   - 返回两个版本的物料差异、成本差异
2. **版本历史 API**：`GET /api/v1/boms/:id/versions`
   - 返回 BOM 的所有版本历史
3. **版本回滚 API**：`POST /api/v1/boms/:id/rollback`
   - 回滚到指定版本

**验收标准**:
- [ ] 版本对比 API 正确返回差异
- [ ] 版本历史 API 正确返回版本列表
- [ ] 版本回滚 API 正确回滚
- [ ] 前端可查看版本对比

---

## 预计工时

| 任务 | 工时 |
|------|------|
| 1.1 数据库 | 0.5h |
| 1.2 BOM CRUD | 2h |
| 1.3 收费API | 1.5h |
| 1.4 成本池API增强 | 1.5h |
| 1.5 前端Tab | 3h |
| 1.6 前端列表 | 1h |
| 1.7 成本池页面增强 | 2h |
| 1.8 种子数据 | 1h |
| 1.9 出库同步清理 | 1h |
| 1.10 人员技能成本 | 2h |
| 1.11 BOM版本管理增强 | 2h |
| **合计** | **17.5h** |
