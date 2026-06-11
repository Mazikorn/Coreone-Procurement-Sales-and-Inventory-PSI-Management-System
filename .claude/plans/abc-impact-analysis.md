# ABC 成本核算模型 — 跨模块影响分析与修改计划（完整版）

> **目的**: 确认 Phase 1-4 的改动对现有功能页面的影响，列出所有需要修改的内容
> **前置条件**: Phase 1-4 计划已确认
> **参考**:
> - [Phase 1 计划](abc-phase1-bom-fee-mapping.md)
> - [Phase 2 计划](abc-phase2-cost-engine.md)
> - [Phase 3 计划](abc-phase3-frontend-pages.md)
> - [Phase 4 计划](abc-phase4-trend-report.md)
> - [前端设计规范] 基于 DESIGN.md + coreone-guardrails.md

---

## 〇、VibeContract（功能契约）

### 业务意图

作为**病理科主任/财务人员**，我希望**在出库、BOM 管理、Dashboard 等现有功能中看到 ABC 成本数据**，以便**全面了解成本构成，做出更明智的经营决策**。

### 数据契约

| 新增字段 | 类型 | 来源 | 约束 | 示例 |
|----------|------|------|------|------|
| abc_total_cost | DECIMAL(18,4) | outbound_abc_details | >=0 | 150.00 |
| abc_activity_cost | DECIMAL(18,4) | outbound_abc_details | >=0 | 80.00 |
| fee_amount | DECIMAL(18,4) | outbound_abc_details | >=0 | 205.00 |
| profit | DECIMAL(18,4) | 计算字段 | 可为负 | 55.00 |
| profit_rate | DECIMAL(18,4) | 计算字段 | -1~1 | 0.27 |
| standard_slide_cost | DECIMAL(18,4) | boms | >=0 | 120.00 |
| standard_fee_per_slide | DECIMAL(18,4) | boms | >=0 | 205.00 |
| standard_margin_rate | DECIMAL(18,4) | boms | -1~1 | 0.41 |
| fee_standard_id | TEXT | boms | 可为 null | "fs-001" |
| fee_category | TEXT | boms | 可为 null | "ihc" |

### 边界契约

- **空值处理**: 当 BOM 未配置收费标准时，fee_amount = 0，profit = 0，前端显示"未配置"标签
- **除零保护**: 当 fee_amount = 0 时，profit_rate = 0（而非 NaN）
- **负数处理**: 退库时 ABC 成本为负数，利润计算需特殊处理（退库利润 = 退库收费 - 退库成本）
- **并发场景**: 同时出库时，ABC 计算不应阻断出库事务（使用 try-catch 包裹）
- **降级策略**: ABC 计算失败时，降级使用传统成本模型（calculateUnifiedCost）
- **成本池为空**: 当月和上月成本池都为空时，使用 BOM 标准成本中的默认费率

### 异常契约

| 场景 | 状态码 | 错误消息 | 处理方式 |
|------|--------|---------|---------|
| 成本池为空 | 200 | 返回降级数据 | 使用上月数据或 BOM 标准成本 |
| 收费标准未配置 | 200 | fee_amount = 0 | 前端显示"未配置"标签 |
| ABC 计算失败 | 200 | 返回传统成本 | 记录日志，不阻断出库 |
| 权限不足 | 403 | "无权访问成本数据" | 跳转到无权限页面 |
| BOM 不存在 | 404 | "BOM 不存在" | 返回空数据 |
| 出库记录不存在 | 404 | "出库记录不存在" | 返回错误提示 |

---

## 一、影响概览

### 1.1 数据库层面的影响

| 表名 | 变更类型 | 新增字段 | 影响范围 |
|------|---------|---------|---------|
| `boms` | 修改 | +5 字段 | BOM 管理、出库、报表、成本分析 |
| `outbound_records` | 修改 | +4 字段 | 出库管理、退库、报表、Dashboard |
| `outbound_abc_details` | 新增 | 全表 | 出库详情、退库、批次追溯、盈利分析 |
| `slide_cost_snapshots` | 新增 | 全表 | 成本趋势、历史对比 |
| `cost_budgets` | 新增 | 全表 | 预算管理、Dashboard |
| `quality_costs` | 新增 | 全表 | 质量成本分析 |
| `cost_alert_rules` | 新增 | 全表 | 成本预警 |
| `cost_audit_logs` | 新增 | 全表 | 审计追踪 |
| `standard_labor_times` | 修改 | +2 字段 | 标准工时库、人员效率 |

### 1.2 API 层面的影响

| 新增 API 模块 | 端点数量 | 权限角色 |
|--------------|---------|---------|
| `/api/v1/abc/*` | 20+ | admin, finance, pathologist |
| `/api/v1/outbound/preview-cost` | 1 | admin, warehouse_manager, technician, pathologist |

---

## 二、任务清单

### 任务 1: 出库管理模块 (outbound)

**影响程度**: 🔴 高

**受影响文件**:
- `前端代码/src/pages/outbound/Outbound.tsx` — 出库列表页
- `前端代码/src/pages/outbound/components/OutboundFormModal.tsx` — 出库弹窗
- `后端代码/server/src/routes/outbound-v1.1.ts` — 出库 API

---

#### 任务 1.1: 出库列表增加 ABC 成本列

**文件**: `前端代码/src/pages/outbound/Outbound.tsx`

**位置**: 表格列定义区域

**改动内容**:

```tsx
// 新增列定义
const columns = [
  // ... 现有列 ...
  {
    key: 'abcTotalCost',
    title: 'ABC 总成本',
    dataIndex: 'abc_total_cost',
    width: 120,
    align: 'right',
    render: (value: number) => (
      <span className="text-sm text-gray-900">{formatCurrency(value)}</span>
    ),
  },
  {
    key: 'feeAmount',
    title: '收费金额',
    dataIndex: 'fee_amount',
    width: 120,
    align: 'right',
    render: (value: number) => (
      <span className="text-sm text-green-600">{formatCurrency(value)}</span>
    ),
  },
  {
    key: 'profit',
    title: '利润',
    dataIndex: 'profit',
    width: 120,
    align: 'right',
    render: (value: number) => (
      <span className={`text-sm font-medium ${value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {formatCurrency(value)}
      </span>
    ),
  },
  {
    key: 'profitRate',
    title: '利润率',
    dataIndex: 'profit_rate',
    width: 100,
    align: 'right',
    render: (value: number) => <ProfitBadge rate={value} />,
  },
]
```

**复用组件**:
- `formatCurrency()` — 金额格式化
- `ProfitBadge` — 利润率标签（Phase 3 新增）

**验收标准**:
- [ ] 出库列表显示 ABC 总成本列
- [ ] 出库列表显示收费金额列
- [ ] 出库列表显示利润列（正值绿色，负值红色）
- [ ] 出库列表显示利润率列（颜色标签）
- [ ] 列支持排序

---

#### 任务 1.2: 出库弹窗增加成本预览面板

**文件**: `前端代码/src/pages/outbound/components/OutboundFormModal.tsx`

**位置**: 表单底部，提交按钮之前

**改动内容**:

```tsx
// 新增成本预览面板
const [costPreview, setCostPreview] = useState(null)
const [previewLoading, setPreviewLoading] = useState(false)

// 防抖获取成本预览
const fetchCostPreview = useCallback(
  debounce(async (bomId: string, sampleCount: number) => {
    if (!bomId || !sampleCount) return
    setPreviewLoading(true)
    try {
      const res = await request.post('/outbound/preview-cost', {
        bomId,
        sampleCount,
      })
      setCostPreview(res)
    } catch (e) {
      console.error('成本预览失败:', e)
      setCostPreview(null)
    } finally {
      setPreviewLoading(false)
    }
  }, 300),
  []
)

// 监听 BOM 和样本数变化
useEffect(() => {
  if (formData.bomId && formData.sampleCount) {
    fetchCostPreview(formData.bomId, formData.sampleCount)
  }
}, [formData.bomId, formData.sampleCount])

// 成本预览面板 UI
{costPreview && (
  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
    <h4 className="text-sm font-medium text-gray-700">成本预览</h4>
    
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-xs text-gray-500">材料成本</p>
        <p className="text-sm font-medium text-gray-900">
          {formatCurrency(costPreview.materialCost)}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">作业成本</p>
        <p className="text-sm font-medium text-gray-900">
          {formatCurrency(costPreview.activityCost)}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">总成本</p>
        <p className="text-sm font-medium text-gray-900">
          {formatCurrency(costPreview.totalCost)}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">收费金额</p>
        <p className="text-sm font-medium text-green-600">
          {formatCurrency(costPreview.feeAmount)}
        </p>
      </div>
    </div>

    {/* 作业成本明细 */}
    {costPreview.activityBreakdown?.length > 0 && (
      <div className="pt-2 border-t border-gray-200">
        <p className="text-xs text-gray-500 mb-2">作业成本明细</p>
        {costPreview.activityBreakdown.map((item, index) => (
          <div key={index} className="flex justify-between text-xs text-gray-600">
            <span>{item.activityCenterName}</span>
            <span>{formatCurrency(item.cost)}</span>
          </div>
        ))}
      </div>
    )}

    {/* 利润预览 */}
    <div className="pt-2 border-t border-gray-200">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-gray-700">预估利润</span>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${costPreview.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(costPreview.profit)}
          </span>
          <ProfitBadge rate={costPreview.profitRate} />
        </div>
      </div>
    </div>
  </div>
)}

// 加载状态
{previewLoading && (
  <div className="bg-gray-50 rounded-lg p-4">
    <div className="flex items-center gap-2">
      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
      <span className="text-sm text-gray-500">计算成本中...</span>
    </div>
  </div>
)}
```

**复用组件**:
- `formatCurrency()` — 金额格式化
- `ProfitBadge` — 利润率标签
- `debounce` — 防抖函数（lodash 或自定义）

**验收标准**:
- [ ] 选择 BOM 和样本数后实时显示成本预览
- [ ] 材料成本和作业成本正确显示
- [ ] 作业成本明细（各作业中心）正确显示
- [ ] 收费金额和利润正确显示
- [ ] 利润率颜色标签正确
- [ ] 防抖 300ms
- [ ] 加载状态正确显示

---

#### 任务 1.3: 出库详情显示 ABC 成本明细

**文件**: `前端代码/src/pages/outbound/OutboundDetail.tsx`（或出库详情弹窗）

**位置**: 详情内容区域

**改动内容**:

```tsx
// 新增 ABC 成本详情区域
{outbound.abcTotalCost > 0 && (
  <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
    <h3 className="text-base font-semibold text-gray-900 mb-4">ABC 成本详情</h3>
    
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
      <div>
        <p className="text-xs text-gray-500">材料成本</p>
        <p className="text-sm font-medium text-gray-900">
          {formatCurrency(outbound.abcMaterialCost)}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">作业成本</p>
        <p className="text-sm font-medium text-gray-900">
          {formatCurrency(outbound.abcActivityCost)}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">总成本</p>
        <p className="text-sm font-medium text-gray-900">
          {formatCurrency(outbound.abcTotalCost)}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">单张切片成本</p>
        <p className="text-sm font-medium text-gray-900">
          {formatCurrency(outbound.abcCostPerSlide)}
        </p>
      </div>
    </div>

    {/* 收费和利润 */}
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
      <div>
        <p className="text-xs text-gray-500">收费金额</p>
        <p className="text-sm font-medium text-green-600">
          {formatCurrency(outbound.feeAmount)}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">利润</p>
        <p className={`text-sm font-medium ${outbound.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {formatCurrency(outbound.profit)}
        </p>
      </div>
      <div>
        <p className="text-xs text-gray-500">利润率</p>
        <ProfitBadge rate={outbound.profitRate} />
      </div>
    </div>

    {/* 作业成本明细（瀑布图） */}
    {abcDetails?.activityDetails && (
      <div className="pt-4 border-t border-gray-200">
        <h4 className="text-sm font-medium text-gray-700 mb-3">作业成本构成</h4>
        <CostWaterfall items={JSON.parse(abcDetails.activityDetails)} />
      </div>
    )}
  </div>
)}
```

**复用组件**:
- `formatCurrency()` — 金额格式化
- `ProfitBadge` — 利润率标签
- `CostWaterfall` — 成本瀑布图（Phase 3 新增）

**验收标准**:
- [ ] 出库详情显示 ABC 成本详情区域
- [ ] 材料成本、作业成本、总成本正确显示
- [ ] 单张切片成本正确计算
- [ ] 收费金额、利润、利润率正确显示
- [ ] 作业成本瀑布图正确展示

---

#### 任务 1.4: 出库 API 响应增加 ABC 字段

**文件**: `后端代码/server/src/routes/outbound-v1.1.ts`

**位置**: GET /outbound 和 GET /outbound/:id 路由

**改动内容**:

```typescript
// GET /outbound (列表)
router.get('/', authenticateToken, (req, res) => {
  // ... 现有查询逻辑 ...
  
  const list = db.prepare(`
    SELECT o.*,
      COALESCE(abc.total_cost, 0) as abc_total_cost,
      COALESCE(abc.activity_cost, 0) as abc_activity_cost,
      COALESCE(abc.fee_amount, 0) as fee_amount,
      COALESCE(abc.profit, 0) as profit,
      CASE WHEN COALESCE(abc.fee_amount, 0) > 0 
        THEN COALESCE(abc.profit, 0) / abc.fee_amount 
        ELSE 0 END as profit_rate
    FROM outbound_records o
    LEFT JOIN (
      SELECT outbound_id, 
        SUM(total_cost) as total_cost,
        SUM(activity_cost) as activity_cost,
        SUM(fee_amount) as fee_amount,
        SUM(profit) as profit
      FROM outbound_abc_details
      GROUP BY outbound_id
    ) abc ON o.id = abc.outbound_id
    WHERE o.is_deleted = 0
    ORDER BY o.created_at DESC
  `).all()
  
  successList(res, list.map(r => ({
    // ... 现有字段 ...
    abcTotalCost: r.abc_total_cost,
    abcActivityCost: r.abc_activity_cost,
    feeAmount: r.fee_amount,
    profit: r.profit,
    profitRate: r.profit_rate,
  })), ...)
})

// GET /outbound/:id (详情)
router.get('/:id', authenticateToken, (req, res) => {
  // ... 现有查询逻辑 ...
  
  const detail = db.prepare(`
    SELECT o.*,
      COALESCE(abc.total_cost, 0) as abc_total_cost,
      COALESCE(abc.material_cost, 0) as abc_material_cost,
      COALESCE(abc.activity_cost, 0) as abc_activity_cost,
      COALESCE(abc.cost_per_slide, 0) as abc_cost_per_slide,
      COALESCE(abc.fee_amount, 0) as fee_amount,
      COALESCE(abc.profit, 0) as profit,
      CASE WHEN COALESCE(abc.fee_amount, 0) > 0 
        THEN COALESCE(abc.profit, 0) / abc.fee_amount 
        ELSE 0 END as profit_rate
    FROM outbound_records o
    LEFT JOIN (
      SELECT outbound_id,
        SUM(material_cost) as material_cost,
        SUM(total_cost) as total_cost,
        SUM(activity_cost) as activity_cost,
        AVG(cost_per_slide) as cost_per_slide,
        SUM(fee_amount) as fee_amount,
        SUM(profit) as profit
      FROM outbound_abc_details
      GROUP BY outbound_id
    ) abc ON o.id = abc.outbound_id
    WHERE o.id = ?
  `).get(id)
  
  // 查询 ABC 成本明细
  const abcDetails = db.prepare(`
    SELECT * FROM outbound_abc_details WHERE outbound_id = ?
  `).get(id)
  
  success(res, {
    // ... 现有字段 ...
    abcTotalCost: detail.abc_total_cost,
    abcMaterialCost: detail.abc_material_cost,
    abcActivityCost: detail.abc_activity_cost,
    abcCostPerSlide: detail.abc_cost_per_slide,
    feeAmount: detail.fee_amount,
    profit: detail.profit,
    profitRate: detail.profit_rate,
    abcDetails: abcDetails ? {
      activityDetails: abcDetails.activity_details,
      feeCategory: abcDetails.fee_category,
      feeStandardId: abcDetails.fee_standard_id,
    } : null,
  })
})
```

**验收标准**:
- [ ] 出库列表 API 返回 ABC 成本字段
- [ ] 出库详情 API 返回 ABC 成本字段
- [ ] 出库详情 API 返回 ABC 成本明细
- [ ] 字段命名符合 camelCase 规范

---

#### 任务 1.5: 出库编辑/删除同步清理 ABC 记录

**文件**: `后端代码/server/src/routes/outbound-v1.1.ts`

**位置**: DELETE /outbound/:id 和 PUT /outbound/:id 路由

**改动内容**:

```typescript
// DELETE /outbound/:id
router.delete('/:id', authenticateToken, requireRole('admin', 'warehouse_manager'), (req, res) => {
  const { id } = req.params
  const db = getDatabase()
  
  db.exec('BEGIN IMMEDIATE')
  try {
    // 1. 标记出库记录删除
    db.prepare('UPDATE outbound_records SET is_deleted = 1 WHERE id = ?').run(id)
    
    // 2. 同步删除 ABC 记录（P0-2）
    db.prepare('DELETE FROM outbound_abc_details WHERE outbound_id = ?').run(id)
    
    // 3. 恢复库存（现有逻辑）
    // ...
    
    db.exec('COMMIT')
    success(res, { message: '删除成功' })
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
})

// PUT /outbound/:id
router.put('/:id', authenticateToken, requireRole('admin', 'warehouse_manager'), (req, res) => {
  const { id } = req.params
  const { sampleCount, bomId, ... } = req.body
  const db = getDatabase()
  
  db.exec('BEGIN IMMEDIATE')
  try {
    // 1. 更新出库记录（现有逻辑）
    // ...
    
    // 2. 删除旧的 ABC 记录
    db.prepare('DELETE FROM outbound_abc_details WHERE outbound_id = ?').run(id)
    
    // 3. 重新计算 ABC 成本（P0-2）
    try {
      const month = new Date().toISOString().slice(0, 7)
      const slideCost = calculateSlideCost(db, {
        bomId,
        slideCount: sampleCount,
        blockCount: 1,
        month,
        materialCost: totalCost,
      })
      
      // 写入新的 ABC 记录
      db.prepare(`
        INSERT INTO outbound_abc_details
        (id, outbound_id, bom_id, project_id, sample_count, slide_count, block_count,
         material_cost, activity_cost, total_cost, cost_per_slide,
         fee_category, fee_standard_id, fee_amount, profit, profit_rate,
         activity_details, cost_month)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), id, bomId, projectId || null,
        sampleCount, sampleCount, 1,
        slideCost.materialCost, slideCost.totalActivityCost, slideCost.totalCost,
        slideCost.totalCost / sampleCount,
        slideCost.feeCategory, slideCost.feeStandardId,
        slideCost.feeAmount, slideCost.profit, slideCost.profitRate,
        JSON.stringify(slideCost.activityCosts),
        month
      )
    } catch (abcErr) {
      console.error('ABC calculation failed on edit:', abcErr)
      // 不阻断编辑操作
    }
    
    db.exec('COMMIT')
    success(res, { message: '更新成功' })
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
})
```

**验收标准**:
- [ ] 出库删除时 ABC 记录同步删除
- [ ] 出库编辑时 ABC 记录重新计算
- [ ] ABC 计算失败不阻断编辑操作
- [ ] 事务包裹正确

---

### 任务 2: BOM 管理模块 (bom)

**影响程度**: 🔴 高

**受影响文件**:
- `前端代码/src/pages/bom/BOM.tsx` — BOM 列表页
- `前端代码/src/pages/bom/components/BOMDetailModal.tsx` — BOM 详情弹窗
- `前端代码/src/pages/bom/components/BOMFormModal.tsx` — BOM 创建/编辑弹窗
- `后端代码/server/src/routes/bom-v1.1.ts` — BOM API

---

#### 任务 2.1: BOM 列表增加收费标准和利润率列

**文件**: `前端代码/src/pages/bom/BOM.tsx`

**位置**: 表格列定义区域

**改动内容**:

```tsx
// 新增列定义
const columns = [
  // ... 现有列 ...
  {
    key: 'standardSlideCost',
    title: '标准切片成本',
    dataIndex: 'standardSlideCost',
    width: 130,
    align: 'right',
    render: (value: number) => (
      <span className="text-sm text-gray-900">{formatCurrency(value)}</span>
    ),
  },
  {
    key: 'standardFeePerSlide',
    title: '标准收费/张',
    dataIndex: 'standardFeePerSlide',
    width: 120,
    align: 'right',
    render: (value: number) => (
      <span className="text-sm text-green-600">{formatCurrency(value)}</span>
    ),
  },
  {
    key: 'standardMarginRate',
    title: '标准利润率',
    dataIndex: 'standardMarginRate',
    width: 110,
    align: 'right',
    render: (value: number) => (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
        value >= 0.2 ? 'bg-green-100 text-green-800' :
        value >= 0 ? 'bg-yellow-100 text-yellow-800' :
        'bg-red-100 text-red-800'
      }`}>
        {(value * 100).toFixed(1)}%
      </span>
    ),
  },
]
```

**验收标准**:
- [ ] BOM 列表显示标准切片成本列
- [ ] BOM 列表显示标准收费/张列
- [ ] BOM 列表显示标准利润率列
- [ ] 利润率颜色标签正确（绿>=20%, 黄0-20%, 红<0%）
- [ ] 列支持排序

---

#### 任务 2.2: BOM 详情增加收费标准 Tab

**文件**: `前端代码/src/pages/bom/components/BOMDetailModal.tsx`

**位置**: Tab 切换区域

**改动内容**:

```tsx
// 新增收费标准 Tab
const [activeTab, setActiveTab] = useState('basic') // basic | materials | fee

// Tab 切换栏
<div className="flex items-center gap-1 border-b border-gray-200">
  <button
    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      activeTab === 'basic'
        ? 'text-blue-500 border-blue-500'
        : 'text-gray-500 border-transparent hover:text-gray-700'
    }`}
    onClick={() => setActiveTab('basic')}
  >
    基本信息
  </button>
  <button
    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      activeTab === 'materials'
        ? 'text-blue-500 border-blue-500'
        : 'text-gray-500 border-transparent hover:text-gray-700'
    }`}
    onClick={() => setActiveTab('materials')}
  >
    物料清单
  </button>
  <button
    className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      activeTab === 'fee'
        ? 'text-blue-500 border-blue-500'
        : 'text-gray-500 border-transparent hover:text-gray-700'
    }`}
    onClick={() => setActiveTab('fee')}
  >
    收费标准
  </button>
</div>

// 收费标准 Tab 内容
{activeTab === 'fee' && (
  <div className="space-y-4">
    {/* 收费标准配置 */}
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">收费类别</label>
        <select
          value={bom.feeCategory || ''}
          onChange={(e) => handleFeeCategoryChange(e.target.value)}
          className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
        >
          <option value="">请选择</option>
          <option value="diagnosis">诊断费</option>
          <option value="specimen">标本处理费</option>
          <option value="stain_he">HE染色费</option>
          <option value="ihc">IHC检测费</option>
          <option value="ss">特染费</option>
          <option value="fish">FISH检测费</option>
          <option value="pcr">PCR检测费</option>
          <option value="ngs">NGS检测费</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">收费标准</label>
        <SearchableSelect
          value={bom.feeStandardId || ''}
          onChange={(value) => handleFeeStandardChange(value)}
          options={feeStandards}
          placeholder="搜索收费标准..."
        />
      </div>
    </div>

    {/* 收费规则预览 */}
    {selectedFeeStandard && (
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">收费规则</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500">基础价格</p>
            <p className="text-sm font-medium text-gray-900">
              {formatCurrency(selectedFeeStandard.base_price)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">封顶金额</p>
            <p className="text-sm font-medium text-gray-900">
              {selectedFeeStandard.cap_amount 
                ? formatCurrency(selectedFeeStandard.cap_amount) 
                : '无封顶'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">阶梯定价</p>
            <p className="text-sm font-medium text-gray-900">
              {selectedFeeStandard.tier_rules ? '有' : '无'}
            </p>
          </div>
        </div>

        {/* 阶梯规则详情 */}
        {selectedFeeStandard.tier_rules && (
          <div className="mt-3 pt-3 border-t border-gray-200">
            <p className="text-xs text-gray-500 mb-2">阶梯规则</p>
            {JSON.parse(selectedFeeStandard.tier_rules).map((tier, index) => (
              <div key={index} className="flex justify-between text-xs text-gray-600">
                <span>
                  {tier.maxQuantity 
                    ? `前 ${tier.maxQuantity} 项` 
                    : `${index > 0 ? JSON.parse(selectedFeeStandard.tier_rules)[index-1].maxQuantity + 1 : 1} 项以上`}
                </span>
                <span>{formatCurrency(tier.unitPrice)}/项</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )}

    {/* 标准成本计算结果 */}
    <div className="bg-blue-50 rounded-lg p-4">
      <h4 className="text-sm font-medium text-blue-700 mb-3">标准成本计算</h4>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-blue-600">标准切片成本</p>
          <p className="text-sm font-medium text-blue-900">
            {formatCurrency(bom.standardSlideCost)}
          </p>
        </div>
        <div>
          <p className="text-xs text-blue-600">标准收费/张</p>
          <p className="text-sm font-medium text-blue-900">
            {formatCurrency(bom.standardFeePerSlide)}
          </p>
        </div>
        <div>
          <p className="text-xs text-blue-600">标准利润率</p>
          <p className="text-sm font-medium text-blue-900">
            {((bom.standardMarginRate || 0) * 100).toFixed(1)}%
          </p>
        </div>
      </div>
    </div>
  </div>
)}
```

**复用组件**:
- `SearchableSelect` — 可搜索下拉
- `formatCurrency()` — 金额格式化

**验收标准**:
- [ ] BOM 详情页显示"收费标准"Tab
- [ ] 可以选择收费类别和收费标准
- [ ] 收费规则正确预览（阶梯定价）
- [ ] 标准成本和利润率自动计算
- [ ] 保存后 BOM 关联更新

---

#### 任务 2.3: BOM 创建/编辑支持收费标准字段

**文件**: `前端代码/src/pages/bom/components/BOMFormModal.tsx`

**位置**: 表单字段区域

**改动内容**:

```tsx
// 新增收费标准字段
<div className="grid grid-cols-2 gap-4">
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      收费类别 <span className="text-red-500">*</span>
    </label>
    <select
      name="feeCategory"
      value={formData.feeCategory || ''}
      onChange={handleChange}
      className="w-full h-10 px-3 text-sm border border-gray-300 rounded-md focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
    >
      <option value="">请选择</option>
      <option value="diagnosis">诊断费</option>
      <option value="specimen">标本处理费</option>
      <option value="stain_he">HE染色费</option>
      <option value="ihc">IHC检测费</option>
      <option value="ss">特染费</option>
      <option value="fish">FISH检测费</option>
      <option value="pcr">PCR检测费</option>
      <option value="ngs">NGS检测费</option>
    </select>
  </div>
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      收费标准
    </label>
    <SearchableSelect
      name="feeStandardId"
      value={formData.feeStandardId || ''}
      onChange={(value) => handleFieldChange('feeStandardId', value)}
      options={feeStandards}
      placeholder="搜索收费标准..."
    />
  </div>
</div>
```

**验收标准**:
- [ ] BOM 创建表单支持收费类别字段
- [ ] BOM 创建表单支持收费标准字段
- [ ] BOM 编辑表单支持收费类别字段
- [ ] BOM 编辑表单支持收费标准字段
- [ ] 收费标准下拉可搜索

---

#### 任务 2.4: BOM API 支持收费标准字段

**文件**: `后端代码/server/src/routes/bom-v1.1.ts`

**位置**: GET /boms, GET /boms/:id, POST /boms, PUT /boms/:id 路由

**改动内容**:

```typescript
// GET /boms (列表)
router.get('/', authenticateToken, (req, res) => {
  const list = db.prepare(`
    SELECT b.*,
      fs.name as fee_standard_name,
      fs.base_price as fee_base_price
    FROM boms b
    LEFT JOIN fee_standards fs ON b.fee_standard_id = fs.id
    WHERE b.is_deleted = 0
    ORDER BY b.created_at DESC
  `).all()
  
  successList(res, list.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    // ... 现有字段 ...
    feeStandardId: r.fee_standard_id,
    feeCategory: r.fee_category,
    standardSlideCost: r.standard_slide_cost,
    standardFeePerSlide: r.standard_fee_per_slide,
    standardMarginRate: r.standard_margin_rate,
    feeStandardName: r.fee_standard_name,
  })), ...)
})

// POST /boms (创建)
router.post('/', authenticateToken, requireRole('admin', 'technician'), (req, res) => {
  const { name, code, type, description, feeCategory, feeStandardId, ... } = req.body
  
  const id = uuidv4()
  db.prepare(`
    INSERT INTO boms (id, name, code, type, description, fee_category, fee_standard_id, ...)
    VALUES (?, ?, ?, ?, ?, ?, ?, ...)
  `).run(id, name, code, type, description, feeCategory, feeStandardId, ...)
  
  // 自动计算标准成本
  updateBomStandardCost(db, id)
  
  success(res, { id })
})

// PUT /boms/:id (更新)
router.put('/:id', authenticateToken, requireRole('admin', 'technician'), (req, res) => {
  const { id } = req.params
  const { name, code, type, description, feeCategory, feeStandardId, ... } = req.body
  
  db.prepare(`
    UPDATE boms SET 
      name = ?, code = ?, type = ?, description = ?,
      fee_category = ?, fee_standard_id = ?, ...
    WHERE id = ?
  `).run(name, code, type, description, feeCategory, feeStandardId, ..., id)
  
  // 重新计算标准成本
  updateBomStandardCost(db, id)
  
  success(res, { id })
})

// 新增：updateBomStandardCost 函数
function updateBomStandardCost(db: any, bomId: string) {
  const bom = db.prepare(`
    SELECT b.*, fs.base_price, fs.tier_rules, fs.cap_amount
    FROM boms b
    LEFT JOIN fee_standards fs ON b.fee_standard_id = fs.id
    WHERE b.id = ?
  `).get(bomId) as any
  
  if (!bom) return
  
  // 计算标准切片成本（物料成本 + 作业成本）
  const materialCost = calculateBomMaterialCost(db, bomId)
  const activityCost = calculateBomActivityCost(db, bomId)
  const standardSlideCost = materialCost + activityCost
  
  // 计算标准收费/张
  let standardFeePerSlide = 0
  if (bom.base_price) {
    standardFeePerSlide = calculateFeeAmountFromStandard(
      { base_price: bom.base_price, tier_rules: bom.tier_rules, cap_amount: bom.cap_amount },
      1
    )
  }
  
  // 计算标准利润率
  const standardMarginRate = standardFeePerSlide > 0
    ? (standardFeePerSlide - standardSlideCost) / standardFeePerSlide
    : 0
  
  // 更新 BOM
  db.prepare(`
    UPDATE boms SET 
      standard_slide_cost = ?,
      standard_fee_per_slide = ?,
      standard_margin_rate = ?
    WHERE id = ?
  `).run(standardSlideCost, standardFeePerSlide, standardMarginRate, bomId)
}
```

**验收标准**:
- [ ] BOM 列表 API 返回收费标准字段
- [ ] BOM 详情 API 返回收费标准字段
- [ ] BOM 创建 API 支持收费标准字段
- [ ] BOM 更新 API 支持收费标准字段
- [ ] BOM 创建/更新后自动计算标准成本

---

### 任务 3: 退库管理模块 (returns)

**影响程度**: 🟡 中

**受影响文件**:
- `前端代码/src/pages/returns/Returns.tsx` — 退库列表页
- `前端代码/src/pages/returns/components/ReturnFormModal.tsx` — 退库弹窗
- `后端代码/server/src/routes/returns-v1.1.ts` — 退库 API

---

#### 任务 3.1: 退库流程增加 ABC 成本处理

**文件**: `后端代码/server/src/routes/returns-v1.1.ts`

**位置**: POST /returns 路由

**改动内容**:

```typescript
router.post('/', authenticateToken, (req, res) => {
  const { outboundId, returnQuantity, reason, ... } = req.body
  const db = getDatabase()
  
  db.exec('BEGIN IMMEDIATE')
  try {
    // 1. 创建退库记录（现有逻辑）
    const returnId = uuidv4()
    // ...
    
    // 2. 查询原出库的 ABC 成本
    const originalAbc = db.prepare(`
      SELECT * FROM outbound_abc_details WHERE outbound_id = ?
    `).get(outboundId) as any
    
    if (originalAbc) {
      // 3. 按退库数量比例计算退库成本
      const originalQuantity = originalAbc.sample_count
      const returnRatio = returnQuantity / originalQuantity
      
      const returnMaterialCost = originalAbc.material_cost * returnRatio
      const returnActivityCost = originalAbc.activity_cost * returnRatio
      const returnTotalCost = originalAbc.total_cost * returnRatio
      const returnFeeAmount = originalAbc.fee_amount * returnRatio
      const returnProfit = returnFeeAmount - returnTotalCost
      
      // 4. 写入退库 ABC 记录（负数）
      const month = new Date().toISOString().slice(0, 7)
      db.prepare(`
        INSERT INTO outbound_abc_details
        (id, outbound_id, bom_id, project_id, sample_count, 
         material_cost, activity_cost, total_cost, cost_per_slide,
         fee_amount, profit, profit_rate, cost_month)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), returnId, originalAbc.bom_id, originalAbc.project_id,
        -returnQuantity,
        -returnMaterialCost, -returnActivityCost, -returnTotalCost,
        returnTotalCost / returnQuantity,
        -returnFeeAmount, returnProfit, 
        returnFeeAmount > 0 ? returnProfit / returnFeeAmount : 0,
        month
      )
    }
    
    db.exec('COMMIT')
    success(res, { id: returnId })
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
})
```

**验收标准**:
- [ ] 退库时正确计算退库成本
- [ ] 退库成本按比例计算（退库数/原出库数）
- [ ] 退库记录正确写入 outbound_abc_details（负数）
- [ ] 退库对利润的影响正确

---

#### 任务 3.2: 退库列表显示退库成本

**文件**: `前端代码/src/pages/returns/Returns.tsx`

**位置**: 表格列定义区域

**改动内容**:

```tsx
// 新增列定义
const columns = [
  // ... 现有列 ...
  {
    key: 'abcTotalCost',
    title: '退库成本',
    dataIndex: 'abc_total_cost',
    width: 120,
    align: 'right',
    render: (value: number) => (
      <span className="text-sm text-red-600">{formatCurrency(Math.abs(value))}</span>
    ),
  },
  {
    key: 'feeAmount',
    title: '退库收费',
    dataIndex: 'fee_amount',
    width: 120,
    align: 'right',
    render: (value: number) => (
      <span className="text-sm text-red-600">{formatCurrency(Math.abs(value))}</span>
    ),
  },
  {
    key: 'profitImpact',
    title: '利润影响',
    dataIndex: 'profit',
    width: 120,
    align: 'right',
    render: (value: number) => (
      <span className={`text-sm font-medium ${value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {formatCurrency(value)}
      </span>
    ),
  },
]
```

**验收标准**:
- [ ] 退库列表显示退库成本列
- [ ] 退库列表显示退库收费列
- [ ] 退库列表显示利润影响列

---

### 任务 4: Dashboard 模块

**影响程度**: 🟡 中

**受影响文件**:
- `前端代码/src/pages/Dashboard.tsx` — 主页 Dashboard
- `后端代码/server/src/routes/reports-v1.1.ts` — 报表 API

---

#### 任务 4.1: Dashboard 新增成本相关卡片

**文件**: `前端代码/src/pages/Dashboard.tsx`

**位置**: 统计卡片区域

**改动内容**:

```tsx
// 新增成本相关卡片
const [costData, setCostData] = useState(null)

useEffect(() => {
  loadCostData()
}, [])

const loadCostData = async () => {
  try {
    const res = await request.get('/abc/dashboard')
    setCostData(res)
  } catch (e) {
    console.error('加载成本数据失败:', e)
  }
}

// 成本卡片
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
        <Layers className="h-5 w-5 text-blue-500" />
      </div>
      <div>
        <p className="text-sm text-gray-500">本月切片成本</p>
        <p className="text-xl font-semibold text-gray-900">
          {formatCurrency(costData?.summary?.avgCostPerSlide)}
        </p>
      </div>
    </div>
  </div>
  
  <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
        <TrendingUp className="h-5 w-5 text-green-500" />
      </div>
      <div>
        <p className="text-sm text-gray-500">盈利项目数</p>
        <p className="text-xl font-semibold text-gray-900">
          {costData?.summary?.profitableCount || 0}
        </p>
      </div>
    </div>
  </div>
  
  <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
        <TrendingDown className="h-5 w-5 text-red-500" />
      </div>
      <div>
        <p className="text-sm text-gray-500">亏损项目数</p>
        <p className="text-xl font-semibold text-gray-900">
          {costData?.summary?.lossCount || 0}
        </p>
      </div>
    </div>
  </div>
  
  <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center">
        <Percent className="h-5 w-5 text-purple-500" />
      </div>
      <div>
        <p className="text-sm text-gray-500">平均利润率</p>
        <p className="text-xl font-semibold text-gray-900">
          {((costData?.summary?.profitRate || 0) * 100).toFixed(1)}%
        </p>
      </div>
    </div>
  </div>
</div>

// 盈利项目 Top5
<div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
  <h3 className="text-base font-semibold text-gray-900 mb-4">盈利项目 Top5</h3>
  <div className="space-y-3">
    {costData?.profitByProject?.slice(0, 5).map((project, index) => (
      <div key={project.projectId} className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-medium text-gray-600">
            {index + 1}
          </span>
          <span className="text-sm text-gray-900">{project.projectName}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-green-600">
            {formatCurrency(project.profit)}
          </span>
          <ProfitBadge rate={project.profitRate} />
        </div>
      </div>
    ))}
  </div>
</div>
```

**复用组件**:
- `formatCurrency()` — 金额格式化
- `ProfitBadge` — 利润率标签

**验收标准**:
- [ ] Dashboard 显示成本相关卡片（4个）
- [ ] 数据实时更新
- [ ] 盈利项目 Top5 正确展示
- [ ] 利润率颜色标签正确

---

### 任务 5: 权限配置 (permissions)

**影响程度**: 🔴 高

**受影响文件**:
- `前端代码/src/lib/permissions.ts` — 权限配置
- `前端代码/src/components/layout/AppSidebar.tsx` — 侧边栏菜单
- `前端代码/src/App.tsx` — 路由配置

---

#### 任务 5.1: ABC 页面权限配置

**文件**: `前端代码/src/lib/permissions.ts`

**位置**: 权限配置对象

**改动内容**:

```typescript
// 新增 ABC 页面权限
export const PERMISSIONS = {
  // ... 现有权限 ...
  
  // ABC 成本分析模块
  'abc:dashboard:view': ['admin', 'finance', 'pathologist'],
  'abc:slide-cost:view': ['admin', 'finance', 'pathologist'],
  'abc:profitability:view': ['admin', 'finance', 'pathologist'],
  'abc:fee-comparison:view': ['admin', 'finance', 'pathologist'],
  'abc:trend:view': ['admin', 'finance', 'pathologist'],
  'abc:budget:view': ['admin', 'finance'],
  'abc:budget:edit': ['admin', 'finance'],
  'abc:quality-cost:view': ['admin', 'finance'],
  'abc:quality-cost:edit': ['admin', 'finance'],
  'abc:disease-cost:view': ['admin', 'finance', 'pathologist'],
  'abc:alerts:view': ['admin', 'finance'],
  'abc:alerts:handle': ['admin', 'finance'],
  'abc:variance:view': ['admin', 'finance'],
  'abc:optimization:view': ['admin', 'finance'],
  'abc:audit:view': ['admin', 'finance'],
  'abc:export': ['admin', 'finance'],
}

// 权限检查函数
export function hasPermission(userRole: string, permission: string): boolean {
  const allowedRoles = PERMISSIONS[permission]
  if (!allowedRoles) return false
  return allowedRoles.includes(userRole)
}
```

**验收标准**:
- [ ] ABC 页面权限配置正确
- [ ] 非授权角色无法访问 ABC 页面
- [ ] 权限检查函数正确

---

#### 任务 5.2: 侧边栏菜单新增"成本分析"分组

**文件**: `前端代码/src/components/layout/AppSidebar.tsx`

**位置**: 菜单配置区域

**改动内容**:

```typescript
// 新增成本分析菜单分组
const ALL_MENU_GROUPS: MenuGroup[] = [
  // ... 现有分组 ...
  {
    title: '成本分析',
    items: [
      { 
        label: '成本看板', 
        path: '/abc/dashboard', 
        icon: BarChart3,
        permission: 'abc:dashboard:view',
      },
      { 
        label: '切片成本', 
        path: '/abc/slide-cost', 
        icon: Layers,
        permission: 'abc:slide-cost:view',
      },
      { 
        label: '盈利分析', 
        path: '/abc/profitability', 
        icon: TrendingUp,
        permission: 'abc:profitability:view',
      },
      { 
        label: '收费对照', 
        path: '/abc/fee-comparison', 
        icon: Receipt,
        permission: 'abc:fee-comparison:view',
      },
      { 
        label: '成本趋势', 
        path: '/abc/trend', 
        icon: Activity,
        permission: 'abc:trend:view',
      },
    ],
  },
  // ... 现有分组 ...
]

// 菜单过滤逻辑
const menuGroups = ALL_MENU_GROUPS.map(group => ({
  ...group,
  items: group.items.filter(item => 
    !item.permission || hasPermission(user.role, item.permission)
  ),
})).filter(group => group.items.length > 0)
```

**验收标准**:
- [ ] 侧边栏显示"成本分析"分组
- [ ] 菜单项路由正确
- [ ] 权限控制正确（admin, finance, pathologist）
- [ ] 非授权角色看不到菜单

---

#### 任务 5.3: 路由配置新增 ABC 页面

**文件**: `前端代码/src/App.tsx`

**位置**: 路由配置区域

**改动内容**:

```tsx
// 导入 ABC 页面组件
import { 
  CostDashboard, 
  SlideCostAnalysis, 
  ProfitabilityAnalysis, 
  FeeComparison, 
  CostTrend 
} from './pages/cost'

// 新增 ABC 路由
<Route path="/abc">
  <Route path="dashboard" element={<CostDashboard />} />
  <Route path="slide-cost" element={<SlideCostAnalysis />} />
  <Route path="profitability" element={<ProfitabilityAnalysis />} />
  <Route path="fee-comparison" element={<FeeComparison />} />
  <Route path="trend" element={<CostTrend />} />
</Route>
```

**验收标准**:
- [ ] 所有 ABC 页面路由配置正确
- [ ] 路由权限控制正确
- [ ] 页面组件正确加载

---

### 任务 6: 报表模块 (reports)

**影响程度**: 🟡 中

**受影响文件**:
- `前端代码/src/pages/report/CostAnalysis.tsx` — 全成本报表
- `后端代码/server/src/routes/reports-v1.1.ts` — 报表 API

---

#### 任务 6.1: 全成本报表整合 ABC 数据

**文件**: `前端代码/src/pages/report/CostAnalysis.tsx`

**位置**: 表格列定义和数据展示区域

**改动内容**:

```tsx
// 新增 ABC 成本列
const columns = [
  // ... 现有列 ...
  {
    key: 'abcTotalCost',
    title: 'ABC 总成本',
    dataIndex: 'abc_total_cost',
    width: 120,
    align: 'right',
    render: (value: number) => (
      <span className="text-sm text-gray-900">{formatCurrency(value)}</span>
    ),
  },
  {
    key: 'activityCost',
    title: '作业成本',
    dataIndex: 'activity_cost',
    width: 120,
    align: 'right',
    render: (value: number) => (
      <span className="text-sm text-gray-900">{formatCurrency(value)}</span>
    ),
  },
  {
    key: 'feeAmount',
    title: '收费金额',
    dataIndex: 'fee_amount',
    width: 120,
    align: 'right',
    render: (value: number) => (
      <span className="text-sm text-green-600">{formatCurrency(value)}</span>
    ),
  },
  {
    key: 'profit',
    title: '利润',
    dataIndex: 'profit',
    width: 120,
    align: 'right',
    render: (value: number) => (
      <span className={`text-sm font-medium ${value >= 0 ? 'text-green-600' : 'text-red-600'}`}>
        {formatCurrency(value)}
      </span>
    ),
  },
]

// 数据源切换逻辑
const dataSource = useMemo(() => {
  // 优先使用 ABC 数据
  if (data?.abcData?.length > 0) {
    return data.abcData.map(item => ({
      ...item,
      // 确保 ABC 字段存在
      abc_total_cost: item.abc_total_cost || item.total_cost,
      activity_cost: item.activity_cost || 0,
      fee_amount: item.fee_amount || 0,
      profit: item.profit || 0,
    }))
  }
  
  // 降级使用传统数据
  return data?.traditionalData || []
}, [data])
```

**验收标准**:
- [ ] 全成本报表显示 ABC 成本列
- [ ] 数据源正确切换（ABC 优先）
- [ ] 导出 Excel 包含 ABC 成本数据

---

### 任务 7: API 层封装 (api/)

**影响程度**: 🟡 中

**受影响文件**:
- `前端代码/src/api/abc.ts` — 新增 ABC API 封装
- `前端代码/src/types/index.ts` — TypeScript 类型定义

---

#### 任务 7.1: 创建 ABC API 封装

**文件**: `前端代码/src/api/abc.ts`（新增）

**改动内容**:

```typescript
import request from '../lib/request'

// ABC 成本分析 API
export const abcApi = {
  // 成本看板
  getDashboard: (params?: { month?: string }) => {
    return request.get('/abc/dashboard', { params })
  },

  // 切片成本明细
  getSlideCost: (params?: {
    bomId?: string
    projectType?: string
    month?: string
  }) => {
    return request.get('/abc/slide-cost', { params })
  },

  // 盈利性分析
  getProfitability: (params?: {
    startDate?: string
    endDate?: string
    projectType?: string
    dimension?: 'project' | 'case' | 'bom'
  }) => {
    return request.get('/abc/profitability', { params })
  },

  // 收费对照
  getFeeComparison: (params?: {
    startDate?: string
    endDate?: string
    projectType?: string
    profitFilter?: 'profitable' | 'loss' | 'all'
    mappingFilter?: 'mapped' | 'unmapped' | 'all'
    page?: number
    pageSize?: number
  }) => {
    return request.get('/abc/fee-comparison', { params })
  },

  // 成本趋势
  getTrend: (params?: {
    bomId?: string
    projectType?: string
    months?: number
  }) => {
    return request.get('/abc/slide-cost-trend', { params })
  },

  // 收费标准列表
  getFeeStandards: (params?: {
    category?: string
    keyword?: string
  }) => {
    return request.get('/abc/fee-standards', { params })
  },

  // 成本池同步
  syncCostPools: (yearMonth: string) => {
    return request.post('/abc/cost-pools/sync', { yearMonth })
  },

  // 成本池自动归集
  autoCollectCostPools: (yearMonth: string) => {
    return request.post('/abc/cost-pools/auto-collect', { yearMonth })
  },

  // 成本池重新计算
  recalculateCostPools: (yearMonth: string) => {
    return request.post('/abc/cost-pools/recalculate', { yearMonth })
  },

  // 导出
  export: (params: {
    type: 'slide-cost' | 'profitability' | 'fee-comparison' | 'trend'
    startDate?: string
    endDate?: string
    projectType?: string
    format?: 'xlsx' | 'csv'
  }) => {
    return request.get('/abc/export', { 
      params,
      responseType: 'blob',
    })
  },
}

export default abcApi
```

**验收标准**:
- [ ] abc.ts API 封装完成
- [ ] 所有 ABC API 都有封装
- [ ] TypeScript 类型定义补充完成

---

#### 任务 7.2: 补充 TypeScript 类型定义

**文件**: `前端代码/src/types/index.ts`

**位置**: 类型定义区域

**改动内容**:

```typescript
// ABC 相关类型定义
export interface AbcDashboardData {
  month: string
  summary: {
    totalCost: number
    totalFee: number
    totalProfit: number
    profitRate: number
    caseCount: number
    sampleCount: number
    materialCost: number
    activityCost: number
    costChange: number
    feeChange: number
    profitChange: number
    profitableCount: number
    lossCount: number
    avgCostPerSlide: number
  }
  profitByProject: Array<{
    projectId: string
    projectName: string
    projectType: string
    caseCount: number
    sampleCount: number
    totalCost: number
    feeAmount: number
    profit: number
    profitRate: number
  }>
  costByActivity: Array<{
    activityCenterId: string
    activityCenterName: string
    activityCenterCode: string
    cost: number
    ratio: number
  }>
  alerts: Array<{
    type: 'loss' | 'no_mapping'
    projectName: string
    profitRate: number
    message: string
  }>
}

export interface SlideCostData {
  bomId: string
  bomName: string
  projectType: string
  materialCostPerSlide: number
  activityCostPerSlide: number
  totalCostPerSlide: number
  feePerSlide: number
  marginRate: number
  activityBreakdown: Array<{
    activityCenterId: string
    activityCenterName: string
    cost: number
    ratio: number
  }>
}

export interface ProfitabilityData {
  dimension: 'project' | 'case' | 'bom'
  items: Array<{
    id: string
    name: string
    type?: string
    caseCount: number
    sampleCount: number
    totalCost: number
    feeAmount: number
    profit: number
    profitRate: number
  }>
}

export interface FeeComparisonData {
  summary: {
    totalOutbounds: number
    totalCost: number
    totalFee: number
    totalProfit: number
    lossCount: number
    noMappingCount: number
  }
  list: Array<{
    outboundId: string
    outboundNo: string
    date: string
    projectName: string
    projectType: string
    sampleCount: number
    materialCost: number
    activityCost: number
    totalCost: number
    feeAmount: number
    profit: number
    profitRate: number
    feeStandardName: string
    feeCategory: string
  }>
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface CostTrendData {
  month: string
  bomId: string
  bomName: string
  projectType: string
  costPerSlide: number
  materialCost: number
  activityCost: number
  feeAmount: number
  marginRate: number
}

export interface FeeStandard {
  id: string
  code: string
  name: string
  category: string
  base_price: number
  tier_rules: string | null
  cap_amount: number | null
  unit: string
  status: number
}

export interface CostPreview {
  materialCost: number
  activityCost: number
  totalCost: number
  costPerSlide: number
  feeAmount: number
  feeStandardId: string | null
  feeCategory: string | null
  profit: number
  profitRate: number
  activityBreakdown: Array<{
    activityCenterId: string
    activityCenterName: string
    cost: number
    ratio: number
  }>
}
```

**验收标准**:
- [ ] ABC 相关类型定义完整
- [ ] 类型定义与 API 返回数据匹配
- [ ] 类型定义导出正确

---

## 三、依赖关系

```
Phase 1 (配置基础)
├── 任务 2: BOM 管理修改 (P0)
├── 任务 5: 权限配置 (P0)
└── 任务 7: API 层封装 (P1)

Phase 2 (计算引擎)
├── 任务 1: 出库管理修改 (P0)
├── 任务 3: 退库管理修改 (P1)
└── 任务 6: 报表模块修改 (P1)

Phase 3 (分析展示)
├── 任务 4: Dashboard 修改 (P1)
└── 任务 5: 侧边栏+路由 (P0)

Phase 4 (报表优化)
└── 任务 6: 报表导出 (P1)
```

---

## 四、工时估算

| 任务 | 模块 | 子任务数 | 预估工时 |
|------|------|---------|---------|
| 1 | 出库管理 | 5 | 4h |
| 2 | BOM 管理 | 4 | 3h |
| 3 | 退库管理 | 2 | 2h |
| 4 | Dashboard | 1 | 2h |
| 5 | 权限配置 | 3 | 1.5h |
| 6 | 报表模块 | 1 | 2h |
| 7 | API 层 | 2 | 2h |
| **合计** | | **18** | **16.5h** |

---

## 五、验收标准汇总

### 5.1 功能验收

- [ ] 出库流程完整集成 ABC 计算
- [ ] 退库流程正确处理 ABC 成本
- [ ] BOM 管理支持收费标准配置
- [ ] Dashboard 显示成本相关数据
- [ ] 报表模块整合 ABC 数据
- [ ] 侧边栏菜单正确显示
- [ ] 权限控制正确

### 5.2 数据验收

- [ ] 出库时 ABC 成本正确计算
- [ ] 退库时 ABC 成本正确回退
- [ ] BOM 标准成本自动计算
- [ ] Dashboard 数据实时更新
- [ ] 报表数据源正确切换

### 5.3 用户体验验收

- [ ] 成本预览响应时间 < 500ms
- [ ] 利润率颜色标签正确
- [ ] 筛选和排序功能正常
- [ ] 导出功能正常

### 5.4 测试覆盖验收

- [ ] 出库流程有集成测试（真实数据库）
- [ ] 退库流程有集成测试（真实数据库）
- [ ] BOM 创建/编辑有单元测试
- [ ] 成本计算有单元测试（阶梯定价、封顶、降级）
- [ ] 权限控制有 E2E 测试
- [ ] 边界场景有测试（空值、零值、负值）
- [ ] 并发场景有测试（同时出库）

---

## 六、变更影响面报告

### 6.1 改动范围

| 类型 | 数量 | 说明 |
|------|------|------|
| 新增文件 | 2 | abc.ts（API 封装）、类型定义 |
| 修改文件 | 16 | 见下方详细列表 |
| 删除文件 | 0 | - |

**修改文件详细列表**:

| # | 文件 | 修改原因 |
|---|------|---------|
| 1 | `前端代码/src/pages/outbound/Outbound.tsx` | 出库列表增加 ABC 成本列 |
| 2 | `前端代码/src/pages/outbound/components/OutboundFormModal.tsx` | 出库弹窗增加成本预览面板 |
| 3 | `前端代码/src/pages/outbound/OutboundDetail.tsx` | 出库详情显示 ABC 成本明细 |
| 4 | `后端代码/server/src/routes/outbound-v1.1.ts` | 出库 API 响应增加 ABC 字段、编辑/删除同步清理 |
| 5 | `前端代码/src/pages/bom/BOM.tsx` | BOM 列表增加收费标准和利润率列 |
| 6 | `前端代码/src/pages/bom/components/BOMDetailModal.tsx` | BOM 详情增加收费标准 Tab |
| 7 | `前端代码/src/pages/bom/components/BOMFormModal.tsx` | BOM 创建/编辑支持收费标准字段 |
| 8 | `后端代码/server/src/routes/bom-v1.1.ts` | BOM API 支持收费标准字段 |
| 9 | `前端代码/src/pages/returns/Returns.tsx` | 退库列表显示退库成本 |
| 10 | `后端代码/server/src/routes/returns-v1.1.ts` | 退库流程增加 ABC 成本处理 |
| 11 | `前端代码/src/pages/Dashboard.tsx` | Dashboard 新增成本相关卡片 |
| 12 | `前端代码/src/lib/permissions.ts` | ABC 页面权限配置 |
| 13 | `前端代码/src/components/layout/AppSidebar.tsx` | 侧边栏新增"成本分析"菜单分组 |
| 14 | `前端代码/src/App.tsx` | 路由配置新增 ABC 页面 |
| 15 | `前端代码/src/pages/report/CostAnalysis.tsx` | 全成本报表整合 ABC 数据 |
| 16 | `前端代码/src/types/index.ts` | 补充 ABC 相关类型定义 |

### 6.2 影响功能

| 功能模块 | 是否受影响 | 验证方式 |
|---------|-----------|---------|
| 入库流程 | 否 | - |
| 出库流程 | ✅ 是 | 运行 e2e/outbound.spec.ts |
| 退库流程 | ✅ 是 | 运行 e2e/returns.spec.ts |
| BOM 管理 | ✅ 是 | 运行 e2e/bom.spec.ts |
| 报表模块 | ✅ 是 | 运行 e2e/reports.spec.ts |
| Dashboard | ✅ 是 | 运行 e2e/dashboard.spec.ts |
| 权限控制 | ✅ 是 | 运行 e2e/permissions.spec.ts |
| 库存管理 | 否 | - |
| 采购管理 | 否 | - |
| 设备管理 | 否 | - |

---

## 七、回滚方案

### 7.1 数据库回滚

```sql
-- 回滚 Phase 1: BOM 收费标准字段
ALTER TABLE boms DROP COLUMN fee_standard_id;
ALTER TABLE boms DROP COLUMN fee_category;
ALTER TABLE boms DROP COLUMN standard_slide_cost;
ALTER TABLE boms DROP COLUMN standard_fee_per_slide;
ALTER TABLE boms DROP COLUMN standard_margin_rate;

-- 回滚 Phase 1: 标准工时库技能等级字段
ALTER TABLE standard_labor_times DROP COLUMN skill_level;
ALTER TABLE standard_labor_times DROP COLUMN skill_rate_multiplier;

-- 回滚 Phase 2: outbound_records ABC 字段
ALTER TABLE outbound_records DROP COLUMN abc_total_cost;
ALTER TABLE outbound_records DROP COLUMN abc_activity_cost;
ALTER TABLE outbound_records DROP COLUMN fee_amount;
ALTER TABLE outbound_records DROP COLUMN profit;

-- 回滚 Phase 2: 删除 ABC 明细表
DROP TABLE IF EXISTS outbound_abc_details;
DROP TABLE IF EXISTS slide_cost_snapshots;

-- 回滚 Phase 3: 删除新增表
DROP TABLE IF EXISTS cost_budgets;
DROP TABLE IF EXISTS quality_costs;
DROP TABLE IF EXISTS cost_alert_rules;

-- 回滚 Phase 4: 删除新增表
DROP TABLE IF EXISTS cost_audit_logs;

-- 删除索引
DROP INDEX IF EXISTS idx_outbound_abc_outbound;
DROP INDEX IF EXISTS idx_outbound_abc_bom;
DROP INDEX IF EXISTS idx_outbound_abc_project;
DROP INDEX IF EXISTS idx_outbound_abc_month;
DROP INDEX IF EXISTS idx_slide_snap_bom;
DROP INDEX IF EXISTS idx_slide_snap_date;
```

### 7.2 前端回滚

```bash
# 1. 移除 AppSidebar.tsx 中的"成本分析"菜单分组
# 删除 ALL_MENU_GROUPS 中的"成本分析"分组

# 2. 移除 App.tsx 中的 ABC 路由
# 删除 /abc/* 路由配置

# 3. 移除 permissions.ts 中的 ABC 权限配置
# 删除 'abc:*' 相关权限配置

# 4. 删除新增文件
rm 前端代码/src/api/abc.ts

# 5. 恢复 types/index.ts
# 删除 ABC 相关类型定义
```

### 7.3 后端回滚

```bash
# 1. 删除 ABC 路由文件
rm 后端代码/server/src/routes/abc-v1.1.ts

# 2. 移除 app.ts 中的 ABC 路由注册
# 删除 abcRouter 相关代码

# 3. 移除 outbound-v1.1.ts 中的 ABC 计算逻辑
# 删除 calculateSlideCost 调用和 ABC 记录写入

# 4. 移除 bom-v1.1.ts 中的收费标准字段处理
# 删除 fee_standard_id, fee_category 相关代码

# 5. 移除 returns-v1.1.ts 中的 ABC 成本处理
# 删除退库 ABC 成本计算逻辑
```

### 7.4 回滚验证

回滚后需要验证：

- [ ] 出库流程正常工作（无 ABC 计算）
- [ ] BOM 管理正常工作（无收费标准字段）
- [ ] Dashboard 正常显示（无成本卡片）
- [ ] 侧边栏无"成本分析"菜单
- [ ] 数据库无 ABC 相关表和字段
- [ ] 所有测试通过

---

## 八、PM 黑盒验收清单

### 8.1 功能正确性

- [ ] 出库时显示成本预览，数据正确
- [ ] 出库后列表显示 ABC 成本列，数据正确
- [ ] 出库详情显示 ABC 成本明细和瀑布图
- [ ] 退库时成本正确回退，利润影响正确显示
- [ ] BOM 详情可查看和编辑收费标准
- [ ] BOM 列表显示标准成本和利润率
- [ ] Dashboard 显示成本卡片和 Top5
- [ ] 成本看板显示汇总数据和图表

### 8.2 数据一致性

- [ ] 出库后 Dashboard 数据实时更新
- [ ] BOM 修改后标准成本自动重算
- [ ] 退库后盈利分析数据正确
- [ ] 出库编辑后 ABC 成本重新计算
- [ ] 出库删除后 ABC 记录同步删除

### 8.3 权限安全

- [ ] 技术员无法访问成本看板
- [ ] 仓库管理员无法访问盈利分析
- [ ] 直接输入 URL 越权访问被拒绝
- [ ] 病理科主任可以查看成本数据
- [ ] 财务人员可以查看和编辑成本数据

### 8.4 异常处理

- [ ] BOM 未配置收费标准时，显示"未配置"标签
- [ ] 成本池为空时，使用降级数据（上月或 BOM 标准成本）
- [ ] ABC 计算失败时，出库仍能成功
- [ ] 网络超时，有友好提示而非白屏
- [ ] 操作失败，数据状态保持一致（无脏数据）

### 8.5 性能体感

- [ ] 成本预览响应时间 < 500ms
- [ ] 页面加载 < 3 秒
- [ ] 列表 1000 条数据不卡顿
- [ ] 连续操作 10 次无异常

### 8.6 边界场景

- [ ] 样本数为 0 时，成本预览显示 0
- [ ] 样本数为最大值时，计算正确
- [ ] 退库数等于出库数时，成本完全回退
- [ ] 阶梯定价边界值正确（3、10、20 张）
- [ ] 封顶机制正确（未达封顶、正好封顶、超过封顶）

---

## 九、对抗性提示（边界情况）

基于契约，以下是 3 个最可能导致功能失效的边界情况：

### 边界 1: 成本池为空时的降级策略

**场景**: 当月和上月都没有成本池数据
**风险**: ABC 计算返回 0，导致成本失真
**测试用例**:
```typescript
it('当月和上月都无数据时降级使用BOM标准成本', () => {
  // 准备：不插入任何成本池数据
  const rate = getDriverRate(db, 'IHC', '2026-06')
  expect(rate).toBeGreaterThan(0) // BOM标准成本中的默认费率
})
```

### 边界 2: 阶梯定价的跨边界计算

**场景**: IHC 检测数量跨越阶梯边界（3→4、12→13）
**风险**: 边界值计算错误
**测试用例**:
```typescript
it('IHC 阶梯：前3项205元，第4-12项210元，第13+项105元', () => {
  // 3 项 = 3×205 = 615
  expect(calculateFeeAmount(3)).toBe(615)
  // 4 项 = 3×205 + 1×210 = 825
  expect(calculateFeeAmount(4)).toBe(825)
  // 13 项 = 3×205 + 9×210 + 1×105 = 2610
  expect(calculateFeeAmount(13)).toBe(2610)
})
```

### 边界 3: 退库时的负数成本处理

**场景**: 退库数等于原出库数，成本完全回退
**风险**: 负数计算错误，导致利润失真
**测试用例**:
```typescript
it('退库数等于出库数时，成本完全回退', () => {
  // 原出库：成本 100，收费 205，利润 105
  // 退库：成本 -100，收费 -205，利润 105
  const returnCost = calculateReturnCost(originalCost, 1.0)
  expect(returnCost.totalCost).toBe(-100)
  expect(returnCost.feeAmount).toBe(-205)
  expect(returnCost.profit).toBe(105) // 退库不改变利润
})
```

---

*本计划基于 Phase 1-4 详细计划的交叉分析，确保 ABC 成本核算模型的改动不会遗漏对现有功能的影响。*
