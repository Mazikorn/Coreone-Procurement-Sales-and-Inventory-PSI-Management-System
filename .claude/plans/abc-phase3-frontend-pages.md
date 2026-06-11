# Phase 3: 分析展示 — 详细实施计划（修订版）

> **目标**: 让用户能看到成本全貌、盈利性和收费对照
> **前置条件**: Phase 2 完成（ABC 计算引擎已集成出库流程）
> **参考**:
> - [产品规划](abc-product-plan.md)
> - [前端设计规范调研] 基于 DESIGN.md + coreone-guardrails.md + 现有组件分析
> - [质量审查报告] 5 个 P0 问题

---

## 前端设计规范摘要

### 页面结构模板（基于 CostAnalysis.tsx）

```tsx
<div className="space-y-6">
  {/* 页面头部 */}
  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
    <div>
      <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight">页面标题</h1>
      <p className="text-sm text-gray-500 mt-1">副标题描述</p>
    </div>
    <div className="flex flex-wrap items-center gap-3">
      {/* 操作按钮 */}
    </div>
  </div>

  {/* 统计卡片 */}
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
    {/* 4列网格 */}
  </div>

  {/* 图表区 */}
  <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
    {/* Recharts 图表 */}
  </div>

  {/* Tab 切换栏 */}
  <div className="flex items-center gap-1 border-b border-gray-200">
    {/* Tab 按钮 */}
  </div>

  {/* Tab 内容：表格 + 分页 */}
  <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
    <table className="w-full">
      <thead className="bg-gray-50">
        <tr>
          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">列名</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-200">
        <tr className="hover:bg-gray-50">
          <td className="px-4 py-3 text-sm text-gray-900">数据</td>
        </tr>
      </tbody>
    </table>
  </div>
</div>
```

### 可复用组件

| 组件 | 用途 | 文件 |
|------|------|------|
| Modal | 弹窗容器 | `components/ui/Modal.tsx` |
| ConfirmDialog | 确认对话框 | `components/ui/ConfirmDialog.tsx` |
| Pagination | 分页器 | `components/ui/Pagination.tsx` |
| SearchableSelect | 可搜索下拉 | `components/ui/SearchableSelect.tsx` |
| CostStatsCards | 统计卡片 | `pages/report/components/CostStatsCards.tsx` |
| CostCharts | 图表区 | `pages/report/components/CostCharts.tsx` |
| RankBadge | 排名徽章 | `pages/report/components/ProjectCostTable.tsx` |
| ChangeBadge | 变化趋势 | `pages/report/components/ProjectCostTable.tsx` |
| CategoryTag | 分类标签 | `pages/report/components/ProjectCostTable.tsx` |

### 工具函数

- `cn()` — Tailwind 类名合并
- `formatCurrency()` — 货币格式化（¥ + 千分位 + 2位小数）
- `formatNumber()` — 数字格式化
- `formatDate()` — 日期格式化

### 图表库

使用 **Recharts**，参照 `CostCharts.tsx` 实现：
- 折线图：`LineChart`
- 饼图：`PieChart`
- 柱状图：`BarChart`
- 颜色常量：`['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316']`

---

## 任务清单

### 任务 3.1: 新增成本瀑布图组件

**文件**: `前端代码/src/components/ui/CostWaterfall.tsx`（新增）

**设计规范**：
- 容器：`space-y-3`
- 标签：`w-20 text-sm text-gray-600 text-right`
- 进度条：`h-6 rounded-sm transition-all duration-300`
- 数值：`w-24 text-sm font-medium text-gray-900 text-right`
- 百分比：`w-16 text-xs text-gray-500 text-right`
- 总计行：`pt-2 border-t border-gray-200`

**验收标准**:
- [ ] 组件正确渲染瀑布图
- [ ] 支持自定义颜色
- [ ] 支持显示百分比
- [ ] 支持自定义总成本标签

---

### 任务 3.2: 新增利润率标签组件

**文件**: `前端代码/src/components/ui/ProfitBadge.tsx`（新增）

**设计规范**：
- 绿色（>= 20%）：`bg-green-100 text-green-800`
- 黄色（0-20%）：`bg-yellow-100 text-yellow-800`
- 红色（< 0%）：`bg-red-100 text-red-800`
- 标签样式：`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium`

**验收标准**:
- [ ] 利润率颜色标签正确
- [ ] 支持显示/隐藏图标
- [ ] 支持显示/隐藏百分比

---

### 任务 3.3: 后端 — 成本看板 API

**文件**: `后端代码/server/src/routes/abc-v1.1.ts`

**新增端点**: `GET /api/v1/abc/dashboard`

**权限**: admin, finance, pathologist

**筛选参数**:
- `month` — 月份（默认当月，格式 YYYY-MM）

**返回数据结构**:
```typescript
{
  month: string,
  summary: {
    totalCost: number,        // SUM(total_cost)
    totalFee: number,         // SUM(fee_amount)
    totalProfit: number,      // SUM(profit)
    profitRate: number,       // totalProfit / totalFee
    caseCount: number,        // COUNT(DISTINCT outbound_id)
    sampleCount: number,      // SUM(sample_count)
    materialCost: number,     // SUM(material_cost)
    activityCost: number,     // SUM(activity_cost)
    costChange: number,       // (本月-上月)/上月
    feeChange: number,
    profitChange: number,
  },
  profitByProject: [{
    projectId, projectName, projectType,
    caseCount, sampleCount, totalCost, feeAmount, profit, profitRate,
  }],
  costByActivity: [{
    activityCenterId, activityCenterName, activityCenterCode, cost, ratio,
  }],
  alerts: [{
    type: 'loss' | 'no_mapping', projectName, profitRate, message,
  }],
}
```

**SQL 核心查询**:
```typescript
// 汇总
const summary = db.prepare(`
  SELECT COUNT(DISTINCT outbound_id) as case_count,
    SUM(sample_count) as sample_count,
    SUM(material_cost) as material_cost, SUM(activity_cost) as activity_cost,
    SUM(total_cost) as total_cost, SUM(fee_amount) as fee_amount, SUM(profit) as profit
  FROM outbound_abc_details WHERE cost_month = ?
`).get(month)

// 项目盈利排名
const profitByProject = db.prepare(`
  SELECT d.project_id, p.name, p.type, COUNT(DISTINCT d.outbound_id) as case_count,
    SUM(d.sample_count) as sample_count, SUM(d.total_cost) as total_cost,
    SUM(d.fee_amount) as fee_amount, SUM(d.profit) as profit,
    CASE WHEN SUM(d.fee_amount) > 0 THEN SUM(d.profit)/SUM(d.fee_amount) ELSE 0 END as profit_rate
  FROM outbound_abc_details d LEFT JOIN projects p ON d.project_id = p.id
  WHERE d.cost_month = ? GROUP BY d.project_id ORDER BY profit DESC
`).all(month)

// 成本结构（从 activity_details JSON 聚合）
// 异常提醒（亏损项目 + 未配置收费标准）
```

**验收标准**:
- [ ] 汇总数据正确
- [ ] 项目盈利性排名正确
- [ ] 环比变化正确计算
- [ ] 成本结构按作业中心正确聚合
- [ ] 异常提醒正确
- [ ] 支持按月份筛选
- [ ] 权限控制正确

---

### 任务 3.4: 后端 — 收费对照 API（新增）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts`

**新增端点**: `GET /api/v1/abc/fee-comparison`

**权限**: admin, finance, pathologist

**筛选参数**:
- `startDate`, `endDate` — 时间范围
- `projectType` — 项目类型（he/ihc/ss/mp/cyto/all）
- `profitFilter` — 盈利筛选（profitable/loss/all）
- `mappingFilter` — 映射筛选（mapped/unmapped/all）
- `page`, `pageSize` — 分页

**返回数据结构**:
```typescript
{
  summary: {
    totalOutbounds: number,       // 出库记录数
    totalCost: number,            // 总成本
    totalFee: number,             // 总收费
    totalProfit: number,          // 总利润
    lossCount: number,            // 亏损记录数
    noMappingCount: number,       // 未配置收费标准的记录数
  },
  list: [{
    outboundId: string,
    outboundNo: string,
    date: string,
    projectName: string,
    projectType: string,
    sampleCount: number,
    materialCost: number,
    activityCost: number,
    totalCost: number,
    feeAmount: number,
    profit: number,
    profitRate: number,
    feeStandardName: string,
    feeCategory: string,
  }],
  pagination: {
    page: number,
    pageSize: number,
    total: number,
    totalPages: number,
  },
}
```

**SQL 核心查询**:
```typescript
// 主查询
const rows = db.prepare(`
  SELECT d.*, o.outbound_no, o.created_at as date,
    p.name as project_name, p.type as project_type,
    fs.name as fee_standard_name, fs.category as fee_category
  FROM outbound_abc_details d
  JOIN outbound_records o ON d.outbound_id = o.id
  LEFT JOIN projects p ON d.project_id = p.id
  LEFT JOIN fee_standards fs ON d.fee_standard_id = fs.id
  WHERE o.is_deleted = 0
    ${startDate ? 'AND o.created_at >= ?' : ''}
    ${endDate ? 'AND o.created_at <= ?' : ''}
    ${projectType && projectType !== 'all' ? 'AND p.type = ?' : ''}
    ${profitFilter === 'loss' ? 'AND d.profit < 0' : ''}
    ${profitFilter === 'profitable' ? 'AND d.profit >= 0' : ''}
    ${mappingFilter === 'unmapped' ? 'AND d.fee_standard_id IS NULL' : ''}
    ${mappingFilter === 'mapped' ? 'AND d.fee_standard_id IS NOT NULL' : ''}
  ORDER BY o.created_at DESC
  LIMIT ? OFFSET ?
`).all(...params)
```

**验收标准**:
- [ ] 按出库记录逐条展示成本和收费
- [ ] 支持按时间范围筛选
- [ ] 支持按项目类型筛选
- [ ] 支持按盈利/亏损筛选
- [ ] 支持按是否配置收费标准筛选
- [ ] 汇总数据正确
- [ ] 分页正确
- [ ] 权限控制正确

---

### 任务 3.5: 前端 — 成本看板页面

**文件**: `前端代码/src/pages/cost/CostDashboard.tsx`（新增）

**页面结构**（基于 CostAnalysis.tsx 模板）：

```tsx
export function CostDashboard() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadDashboard() }, [month])

  const loadDashboard = async () => {
    setLoading(true)
    try {
      const res = await request.get(`/abc/dashboard?month=${month}`)
      setData(res)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight">成本看板</h1>
          <p className="text-sm text-gray-500 mt-1">一屏掌握成本全貌</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)}
            className="h-10 px-3 text-sm border border-gray-300 rounded-md" />
          <button className="h-10 px-4 text-sm font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4 mr-2 inline" /> 导出
          </button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="本月总成本" value={formatCurrency(data?.summary?.totalCost)} change={data?.summary?.costChange} />
        <StatCard title="本月总收入" value={formatCurrency(data?.summary?.totalFee)} change={data?.summary?.feeChange} />
        <StatCard title="本月总利润" value={formatCurrency(data?.summary?.totalProfit)} change={data?.summary?.profitChange} />
        <StatCard title="平均利润率" value={`${((data?.summary?.profitRate || 0) * 100).toFixed(1)}%`} />
      </div>

      {/* 项目盈利性排名 */}
      <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4">项目盈利性排名</h3>
        <ProfitRankingList projects={data?.profitByProject || []} />
      </div>

      {/* 成本结构饼图 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">成本结构</h3>
          <CostStructurePieChart data={data?.costByActivity || []} />
        </div>
        <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">异常提醒</h3>
          <AlertList alerts={data?.alerts || []} />
        </div>
      </div>
    </div>
  )
}
```

**验收标准**:
- [ ] 汇总卡片正确显示
- [ ] 环比变化正确显示
- [ ] 项目盈利性排名正确
- [ ] 利润率颜色标签正确
- [ ] 支持按月份切换
- [ ] 支持导出

---

### 任务 3.6: 前端 — 切片成本明细页面

**文件**: `前端代码/src/pages/cost/SlideCostAnalysis.tsx`（新增）

**页面结构**（基于 InventoryList.tsx 的可展开表格模式）：

```tsx
export function SlideCostAnalysis() {
  // ... 状态管理 ...

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      {/* 筛选栏 */}
      {/* 统计卡片 */}
      {/* 切片成本明细表（可展开） */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">BOM名称</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">材料/张</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">作业/张</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">总成本/张</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">收费/张</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">利润率</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">详情</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data.map(row => (
              <>
                <tr key={row.bomId} className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpandedRow(expandedRow === row.bomId ? null : row.bomId)}>
                  {/* 行内容 */}
                </tr>
                {expandedRow === row.bomId && (
                  <tr>
                    <td colSpan={8} className="px-4 py-4 bg-gray-50">
                      <CostWaterfall items={row.activityBreakdown} />
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

**验收标准**:
- [ ] 切片成本明细表正确展示
- [ ] 支持按项目类型、BOM、月份筛选
- [ ] 点击行展开成本瀑布图
- [ ] 成本瀑布图正确展示各作业中心成本
- [ ] 利润率颜色标签正确

---

### 任务 3.7: 前端 — 盈利分析页改造

**文件**: `前端代码/src/pages/cost/ProfitabilityAnalysis.tsx`（改造现有）

**改造内容**:
1. 增加三维度视图切换（项目/病例/BOM）
2. 使用真实数据替代假数据
3. 增加成本构成列
4. 支持点击展开病例明细

**验收标准**:
- [ ] 支持项目/病例/BOM 三维度切换
- [ ] 数据来自真实 API
- [ ] 项目维度显示正确
- [ ] 病例维度显示正确（点击展开）
- [ ] BOM 维度显示正确

---

### 任务 3.8: 前端 — 收费对照页面（新增）

**文件**: `前端代码/src/pages/cost/FeeComparison.tsx`（新增）

**页面结构**（基于 CostAnalysis.tsx 模板）：

```tsx
export function FeeComparison() {
  const [filters, setFilters] = useState({
    startDate: '', endDate: '', projectType: 'all',
    profitFilter: 'all', mappingFilter: 'all',
  })
  const { data, loading, page, pageSize, total, setPage, setPageSize, refresh } = usePagination({
    fetchFn: async (params) => {
      const res = await request.get('/abc/fee-comparison', { params: { ...params, ...filters } })
      return { list: res.list, pagination: res.pagination }
    },
    deps: [filters],
  })

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight">收费对照</h1>
          <p className="text-sm text-gray-500 mt-1">按出库记录逐条对比成本和收费</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="h-10 px-4 text-sm font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4 mr-2 inline" /> 导出
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
        <div className="flex flex-wrap gap-3">
          {/* 日期范围、项目类型、盈利筛选、映射筛选 */}
        </div>
      </div>

      {/* 汇总卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* 出库记录数、总成本、总收费、总利润、亏损记录数 */}
      </div>

      {/* 异常提醒 */}
      {data?.summary?.lossCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-500" />
            <span className="text-sm font-medium text-red-800">
              {data.summary.lossCount} 条出库记录亏损，总亏损金额 {formatCurrency(data.summary.lossAmount)}
            </span>
          </div>
        </div>
      )}

      {/* 出库记录明细表 */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">出库单号</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">日期</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">项目</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">样本</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">材料成本</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">作业成本</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">总成本</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">收费</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">利润</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">利润率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {data?.list?.map(row => (
              <tr key={row.outboundId} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-mono text-gray-900">{row.outboundNo}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{formatDate(row.date)}</td>
                <td className="px-4 py-3 text-sm text-gray-900">{row.projectName}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{row.sampleCount}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{formatCurrency(row.materialCost)}</td>
                <td className="px-4 py-3 text-sm text-right text-gray-500">{formatCurrency(row.activityCost)}</td>
                <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">{formatCurrency(row.totalCost)}</td>
                <td className="px-4 py-3 text-sm text-right text-green-600">{formatCurrency(row.feeAmount)}</td>
                <td className={`px-4 py-3 text-sm text-right font-medium ${row.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {formatCurrency(row.profit)}
                </td>
                <td className="px-4 py-3 text-sm text-right">
                  <ProfitBadge rate={row.profitRate} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} />
      </div>
    </div>
  )
}
```

**验收标准**:
- [ ] 按出库记录逐条展示成本和收费
- [ ] 支持按时间范围筛选
- [ ] 支持按项目类型筛选
- [ ] 支持按盈利/亏损筛选
- [ ] 支持按是否配置收费标准筛选
- [ ] 亏损记录红色高亮
- [ ] 未配置收费标准的记录黄色标记
- [ ] 汇总数据正确
- [ ] 异常提醒正确

---

### 任务 3.9: 前端 — 侧边栏 + 路由配置

**文件 1**: `前端代码/src/components/layout/AppSidebar.tsx`

**改动内容**:

```typescript
const ALL_MENU_GROUPS: MenuGroup[] = [
  // ... 现有分组 ...
  {
    title: '成本分析',
    items: [
      { label: '成本看板', path: '/abc/dashboard', icon: BarChart3 },
      { label: '切片成本', path: '/abc/slide-cost', icon: Layers },
      { label: '盈利分析', path: '/abc/profitability', icon: TrendingUp },
      { label: '收费对照', path: '/abc/fee-comparison', icon: Receipt },
      { label: '成本趋势', path: '/abc/trend', icon: Activity },
    ],
  },
  // ... 现有分组 ...
]
```

**文件 2**: `前端代码/src/App.tsx`

**改动内容**:

```typescript
import { CostDashboard, SlideCostAnalysis, FeeComparison, CostTrend } from './pages/cost'

<Route path="/abc/dashboard" element={<CostDashboard />} />
<Route path="/abc/slide-cost" element={<SlideCostAnalysis />} />
<Route path="/abc/profitability" element={<ProfitabilityAnalysis />} />
<Route path="/abc/fee-comparison" element={<FeeComparison />} />
<Route path="/abc/trend" element={<CostTrend />} />
```

**文件 3**: `前端代码/src/lib/permissions.ts`

**改动内容**: 增加 ABC 页面的权限配置

**验收标准**:
- [ ] 侧边栏显示"成本分析"分组
- [ ] 菜单项路由正确
- [ ] 权限控制正确（admin, finance, pathologist）

---

## 依赖关系

```
3.1 (瀑布图组件) ──→ 3.6 (切片成本页面)
3.2 (利润率标签) ──→ 3.5 (成本看板页面) + 3.8 (收费对照页面)
3.3 (看板API)    ──→ 3.5 (成本看板页面)
3.4 (收费对照API) ──→ 3.8 (收费对照页面)
3.5 (成本看板)   ──→ 3.9 (侧边栏+路由)
3.6 (切片成本)   ──→ 3.9 (侧边栏+路由)
3.7 (盈利分析)   ──→ 3.9 (侧边栏+路由)
3.8 (收费对照)   ──→ 3.9 (侧边栏+路由)
3.9 (侧边栏+路由) ──→ 最终
```

### 任务 3.10: E2E 测试（PM-QA-001 第二轮补充）

**文件**: `前端代码/e2e/abc-phase3.spec.ts`（新增）

**测试用例**：

```typescript
test.describe('ABC 成本分析 - Phase 3', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="username"]', 'admin')
    await page.fill('input[name="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  test('成本看板 - 汇总卡片正确显示', async ({ page }) => {
    await page.goto('/abc/dashboard')
    // 验证汇总卡片
    await expect(page.locator('text=本月总成本')).toBeVisible()
    await expect(page.locator('text=本月总收入')).toBeVisible()
    await expect(page.locator('text=本月总利润')).toBeVisible()
    await expect(page.locator('text=平均利润率')).toBeVisible()
    // 验证数值格式化（带 ¥ 前缀）
    await expect(page.locator('text=/¥[\\d,]+\\.\\d{2}/')).toHaveCount(4)
  })

  test('成本看板 - 项目盈利性排名', async ({ page }) => {
    await page.goto('/abc/dashboard')
    // 验证排名列表
    await expect(page.locator('text=项目盈利性排名')).toBeVisible()
    // 验证利润率颜色标签
    const badges = page.locator('[class*="bg-green-100"], [class*="bg-yellow-100"], [class*="bg-red-100"]')
    await expect(badges.first()).toBeVisible()
  })

  test('切片成本明细 - 表格和展开', async ({ page }) => {
    await page.goto('/abc/slide-cost')
    // 验证表格列
    await expect(page.locator('th:has-text("BOM名称")')).toBeVisible()
    await expect(page.locator('th:has-text("材料/张")')).toBeVisible()
    await expect(page.locator('th:has-text("作业/张")')).toBeVisible()
    await expect(page.locator('th:has-text("总成本/张")')).toBeVisible()
    await expect(page.locator('th:has-text("收费/张")')).toBeVisible()
    await expect(page.locator('th:has-text("利润率")')).toBeVisible()
    // 点击行展开瀑布图
    await page.click('tbody tr:first-child')
    await expect(page.locator('text=总成本')).toBeVisible()
  })

  test('切片成本明细 - 筛选功能', async ({ page }) => {
    await page.goto('/abc/slide-cost')
    // 选择项目类型
    await page.selectOption('select:near(:text("项目类型"))', 'ihc')
    await page.waitForTimeout(500)
    // 验证表格数据已刷新
  })

  test('盈利分析 - 三维度切换', async ({ page }) => {
    await page.goto('/abc/profitability')
    // 默认项目维度
    await expect(page.locator('text=项目名称')).toBeVisible()
    // 切换到病例维度
    await page.click('text=病例维度')
    await expect(page.locator('text=病例号')).toBeVisible()
    // 切换到BOM维度
    await page.click('text=BOM维度')
    await expect(page.locator('text=BOM名称')).toBeVisible()
  })

  test('收费对照 - 出库记录明细', async ({ page }) => {
    await page.goto('/abc/fee-comparison')
    // 验证表格列
    await expect(page.locator('th:has-text("出库单号")')).toBeVisible()
    await expect(page.locator('th:has-text("收费金额")')).toBeVisible()
    await expect(page.locator('th:has-text("利润")')).toBeVisible()
    await expect(page.locator('th:has-text("利润率")')).toBeVisible()
  })

  test('收费对照 - 异常提醒', async ({ page }) => {
    await page.goto('/abc/fee-comparison')
    // 验证异常提醒区域
    const alerts = page.locator('text=/亏损|未配置/')
    // 如果有亏损记录，验证提醒显示
  })

  test('收费对照 - 筛选功能', async ({ page }) => {
    await page.goto('/abc/fee-comparison')
    // 筛选亏损记录
    await page.selectOption('select:near(:text("盈利"))', 'loss')
    await page.waitForTimeout(500)
    // 验证表格数据已刷新
  })
})
```

**验收标准**:
- [ ] 所有 E2E 测试通过
- [ ] 覆盖成本看板、切片成本、盈利分析、收费对照四个页面
- [ ] 覆盖筛选、展开、切换等交互

---

### 任务 3.11: 成本预算管理（故事 15）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/BudgetManagement.tsx`（新增）

**后端改动**:

新增表 `cost_budgets`：
```sql
CREATE TABLE IF NOT EXISTS cost_budgets (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  category TEXT NOT NULL,           -- total/material/labor/equipment/qc/indirect
  budget_amount DECIMAL(18,4) NOT NULL,
  actual_amount DECIMAL(18,4) DEFAULT 0,
  execution_rate DECIMAL(18,4) DEFAULT 0,
  status TEXT DEFAULT 'normal',     -- normal/over_budget/alert
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(year_month, category)
)
```

新增 API：
- `GET /api/v1/abc/budgets` — 查询预算列表
- `POST /api/v1/abc/budgets` — 创建/更新预算
- `GET /api/v1/abc/budgets/execution` — 查询预算执行情况

**前端改动**:

新增预算管理页面：
- 预算配置表格（按月份、按成本类型）
- 预算执行进度条（颜色标识：绿<80%、黄80-100%、红>100%）
- 预算超支预警提示

**验收标准**:
- [ ] 预算 CRUD 功能正常
- [ ] 预算执行进度正确计算
- [ ] 预算超支预警正确显示
- [ ] 成本看板显示预算执行率

---

### 任务 3.12: 质量成本分析（故事 16）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/QualityCostAnalysis.tsx`（新增）

**后端改动**:

新增表 `quality_costs`：
```sql
CREATE TABLE IF NOT EXISTS quality_costs (
  id TEXT PRIMARY KEY,
  year_month TEXT NOT NULL,
  cost_type TEXT NOT NULL,          -- prevention/appraisal/internal_failure/external_failure
  sub_type TEXT NOT NULL,           -- training/sop/maintenance/iqc/eqa/audit/rework/complaint...
  amount DECIMAL(18,4) NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

新增 API：
- `GET /api/v1/abc/quality-costs` — 查询质量成本
- `POST /api/v1/abc/quality-costs` — 录入质量成本
- `GET /api/v1/abc/quality-costs/summary` — 质量成本汇总

**前端改动**:

新增质量成本分析页面：
- 四类质量成本卡片（预防/鉴定/内部失败/外部失败）
- 质量成本占比饼图
- 质量成本趋势折线图
- 质量成本录入表单

**验收标准**:
- [ ] 质量成本 CRUD 功能正常
- [ ] 四类质量成本正确分类
- [ ] 质量成本占比正确计算
- [ ] 质量成本趋势正确展示

---

### 任务 3.13: 按病种成本分析（故事 17）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/DiseaseCostAnalysis.tsx`（新增）

**后端改动**:

新增 API：`GET /api/v1/abc/disease-cost`

**返回数据**:
```typescript
{
  diseases: [{
    diseaseName: string,
    caseCount: number,
    avgCost: number,
    avgFee: number,
    avgProfit: number,
    profitRate: number,
    costBreakdown: {
      material: number,
      labor: number,
      equipment: number,
      qc: number,
      indirect: number,
    },
  }],
}
```

**前端改动**:

新增病种成本分析页面：
- 病种成本排名表格
- 病种盈利性对比柱状图
- 病种成本构成饼图
- 支持按时间段筛选

**验收标准**:
- [ ] 病种成本数据正确聚合
- [ ] 病种盈利性对比正确
- [ ] 病种成本构成正确
- [ ] 支持按时间段筛选

---

### 任务 3.14: 成本异常预警（故事 18）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/CostAlerts.tsx`（新增）

**后端改动**:

新增表 `cost_alert_rules`：
```sql
CREATE TABLE IF NOT EXISTS cost_alert_rules (
  id TEXT PRIMARY KEY,
  rule_type TEXT NOT NULL,          -- cost_threshold/cost_fluctuation/profit_rate
  threshold_value DECIMAL(18,4) NOT NULL,
  comparison TEXT NOT NULL,         -- gt/lt/eq
  notification_type TEXT DEFAULT 'system',  -- system/email
  status INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

新增 API：
- `GET /api/v1/abc/alerts` — 查询成本预警
- `POST /api/v1/abc/alerts/rules` — 创建预警规则
- `GET /api/v1/abc/alerts/rules` — 查询预警规则

**前端改动**:

新增成本预警页面：
- 预警规则配置表格
- 预警列表（按严重程度排序）
- 预警处理（确认/忽略）

**验收标准**:
- [ ] 预警规则 CRUD 功能正常
- [ ] 预警触发逻辑正确
- [ ] 预警通知正确发送
- [ ] 预警处理功能正常

---

### 任务 3.15: 成本差异分析（故事 22）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/CostVarianceAnalysis.tsx`（新增）

**后端改动**:

新增 API：`GET /api/v1/abc/variance-analysis`

**返回数据**:
```typescript
{
  summary: {
    totalStandardCost: number,
    totalActualCost: number,
    totalVariance: number,
    varianceRate: number,
  },
  variances: [{
    projectId: string,
    projectName: string,
    standardCost: number,
    actualCost: number,
    priceVariance: number,      // 价格差异
    usageVariance: number,      // 用量差异
    efficiencyVariance: number, // 效率差异
    totalVariance: number,
    varianceRate: number,
    reason: string,
  }],
}
```

**前端改动**:

新增成本差异分析页面：
- 差异汇总卡片
- 差异明细表格
- 差异原因分析
- 支持按项目类型筛选

**验收标准**:
- [ ] 差异计算正确（价格差异 + 用量差异 + 效率差异）
- [ ] 差异原因分析正确
- [ ] 支持按项目类型筛选
- [ ] 差异超阈值高亮显示

---

### 任务 3.16: 前端 ABC 页面重构（阻塞问题修复）

**问题**: 现有 ABC 页面使用原生 fetch，未使用项目 API 层

**任务**:
1. 创建 `前端代码/src/api/abc.ts`，封装 ABC API
2. 重构 4 个 ABC 页面，使用项目 request 模块
3. 补充 TypeScript 类型定义到 `types/index.ts`
4. 验证 API 调用正常

**验收标准**:
- [ ] abc.ts API 封装已完成
- [ ] 4 个 ABC 页面已重构
- [ ] TypeScript 类型定义已补充
- [ ] API 调用正常

---

### 任务 3.17: 盈利性分析页面增加图表（阻塞问题修复）

**问题**: 盈利性分析页面是纯表格，无图表

**任务**:
1. 增加项目盈利性柱状图（Recharts）
2. 增加成本构成饼图
3. 增加利润率趋势折线图
4. 支持三维度切换（项目/病例/BOM）

**验收标准**:
- [ ] 项目盈利性柱状图正确展示
- [ ] 成本构成饼图正确展示
- [ ] 利润率趋势折线图正确展示
- [ ] 三维度切换正常

---

### 任务 3.18: 成本优化建议（新增需求）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/CostOptimization.tsx`（新增）

**后端改动**:

新增 API：`GET /api/v1/abc/optimization`

**优化建议规则**：
```typescript
// 成本优化建议引擎
function generateOptimizationSuggestions(db: any, month: string) {
  const suggestions = []

  // 1. 高成本项目识别
  // 找出成本 Top5 的项目，建议优化 BOM 配置
  const highCostProjects = db.prepare(`
    SELECT project_id, project_name, AVG(cost_per_slide) as avg_cost
    FROM outbound_abc_details
    WHERE cost_month = ?
    GROUP BY project_id
    ORDER BY avg_cost DESC
    LIMIT 5
  `).all(month)

  for (const project of highCostProjects) {
    suggestions.push({
      type: 'high_cost',
      severity: 'warning',
      projectName: project.project_name,
      message: `项目 "${project.project_name}" 单张切片成本 ${formatCurrency(project.avg_cost)}，建议检查 BOM 配置`,
      action: '检查 BOM 物料清单，评估是否可以更换更经济的试剂',
    })
  }

  // 2. 低利润项目识别
  // 找出利润率 < 10% 的项目
  const lowProfitProjects = db.prepare(`
    SELECT project_id, project_name,
      SUM(profit) / SUM(fee_amount) as profit_rate
    FROM outbound_abc_details
    WHERE cost_month = ? AND fee_amount > 0
    GROUP BY project_id
    HAVING profit_rate < 0.1
  `).all(month)

  for (const project of lowProfitProjects) {
    suggestions.push({
      type: 'low_profit',
      severity: 'error',
      projectName: project.project_name,
      message: `项目 "${project.project_name}" 利润率仅 ${(project.profit_rate * 100).toFixed(1)}%，建议评估是否继续开展`,
      action: '与主任讨论是否调整收费标准或停止该项目',
    })
  }

  // 3. 高耗材消耗识别
  // 找出耗材消耗异常高的物料
  const highConsumptionMaterials = db.prepare(`
    SELECT material_id, material_name,
      SUM(quantity) as total_quantity,
      SUM(total_cost) as total_cost
    FROM outbound_items
    WHERE created_at >= ? AND created_at < ?
    GROUP BY material_id
    ORDER BY total_cost DESC
    LIMIT 5
  `).all(...getMonthRange(month))

  for (const material of highConsumptionMaterials) {
    suggestions.push({
      type: 'high_consumption',
      severity: 'info',
      materialName: material.material_name,
      message: `物料 "${material.material_name}" 本月消耗 ${formatCurrency(material.total_cost)}，建议检查是否有浪费`,
      action: '检查物料使用记录，评估是否需要优化操作流程',
    })
  }

  // 4. 设备使用率低识别
  // 找出使用率低的设备
  const lowUsageEquipment = db.prepare(`
    SELECT e.id, e.name,
      COALESCE(SUM(eu.usage_minutes), 0) as total_minutes,
      e.depreciable_life_years * 250 * 8 * 60 as annual_capacity
    FROM equipment e
    LEFT JOIN equipment_usage eu ON e.id = eu.equipment_id
      AND eu.usage_date >= ?
    WHERE e.status = 1
    GROUP BY e.id
    HAVING total_minutes < annual_capacity * 0.3
  `).all(...getMonthRange(month))

  for (const equipment of lowUsageEquipment) {
    suggestions.push({
      type: 'low_utilization',
      severity: 'info',
      equipmentName: equipment.name,
      message: `设备 "${equipment.name}" 使用率低于 30%，建议评估是否需要`,
      action: '检查设备使用记录，评估是否需要调整设备配置',
    })
  }

  return suggestions
}
```

**前端改动**:

新增成本优化建议页面：
- 建议列表（按严重程度排序：错误 > 警告 > 信息）
- 每条建议包含：类型、严重程度、项目/物料/设备名称、建议内容、行动建议
- 支持按类型筛选
- 支持标记为"已处理"

**验收标准**:
- [ ] 优化建议正确生成
- [ ] 高成本项目识别正确
- [ ] 低利润项目识别正确
- [ ] 高耗材消耗识别正确
- [ ] 设备使用率低识别正确
- [ ] 支持按类型筛选
- [ ] 支持标记为已处理

---

## 预计工时

| 任务 | 工时 |
|------|------|
| 3.1 瀑布图组件 | 2h |
| 3.2 利润率标签 | 1h |
| 3.3 看板API | 2h |
| 3.4 收费对照API | 2h |
| 3.5 成本看板页面 | 3h |
| 3.6 切片成本页面 | 3h |
| 3.7 盈利分析改造 | 2.5h |
| 3.8 收费对照页面 | 3h |
| 3.9 侧边栏+路由 | 1h |
| 3.10 E2E测试 | 2h |
| 3.11 成本预算管理 | 4h |
| 3.12 质量成本分析 | 4h |
| 3.13 按病种成本分析 | 3h |
| 3.14 成本异常预警 | 3h |
| 3.15 成本差异分析 | 3h |
| 3.16 成本优化建议 | 4h |
| **合计** | **40.5h** |
