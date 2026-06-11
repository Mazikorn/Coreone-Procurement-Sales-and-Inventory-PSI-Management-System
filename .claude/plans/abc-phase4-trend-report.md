# Phase 4: 报表优化 — 详细实施计划（修订版）

> **目标**: 支持趋势分析、导出和 Dashboard 改造
> **前置条件**: Phase 3 完成（前端页面已上线）
> **参考**:
> - [产品规划](abc-product-plan.md)
> - [前端设计规范调研] 基于 DESIGN.md + coreone-guardrails.md + 现有组件分析

---

## 任务清单

### 任务 4.1: 后端 — 成本趋势 API

**文件**: `后端代码/server/src/routes/abc-v1.1.ts`

**新增端点**: `GET /api/v1/abc/slide-cost-trend`

**权限**: admin, finance, pathologist

**筛选参数**:
- `bomId` — 按 BOM 筛选
- `projectType` — 按项目类型筛选
- `months` — 月份数（默认 12）

**返回数据结构**:
```typescript
{
  trend: [{
    month: string,           // YYYY-MM
    bomId: string,
    bomName: string,
    projectType: string,
    costPerSlide: number,    // 平均单张切片成本
    materialCost: number,    // 平均材料成本/张
    activityCost: number,    // 平均作业成本/张
    feeAmount: number,       // 平均收费/张
    marginRate: number,      // 平均利润率
  }],
}
```

**SQL 核心查询**:
```typescript
const rows = db.prepare(`
  SELECT
    d.cost_month as month,
    d.bom_id, b.name as bom_name, b.type as project_type,
    AVG(d.cost_per_slide) as cost_per_slide,
    AVG(d.material_cost / NULLIF(d.sample_count, 0)) as material_cost,
    AVG(d.activity_cost / NULLIF(d.sample_count, 0)) as activity_cost,
    AVG(d.fee_amount / NULLIF(d.sample_count, 0)) as fee_amount,
    CASE WHEN SUM(d.fee_amount) > 0
      THEN SUM(d.profit) / SUM(d.fee_amount) ELSE 0 END as margin_rate
  FROM outbound_abc_details d
  LEFT JOIN boms b ON d.bom_id = b.id
  WHERE d.cost_month >= ? AND d.cost_month <= ?
    ${bomId ? 'AND d.bom_id = ?' : ''}
    ${projectType && projectType !== 'all' ? 'AND b.type = ?' : ''}
  GROUP BY d.cost_month, d.bom_id, b.name, b.type
  ORDER BY d.cost_month ASC, b.name ASC
`).all(...params)
```

**验收标准**:
- [ ] 趋势数据正确
- [ ] 支持按 BOM 筛选
- [ ] 支持按项目类型筛选
- [ ] 支持自定义月份数
- [ ] 权限控制正确

---

### 任务 4.2: 后端 — 导出功能（阻塞问题修复）

**问题**: 导出按钮是死按钮，无功能实现

**任务**:
1. 使用 xlsx 库实现 Excel 导出
2. 支持切片成本、盈利性、收费对照、趋势四种类型
3. 支持自定义时间范围和筛选条件
4. 验证导出数据正确

**验收标准**:
- [ ] 导出功能正常工作
- [ ] 支持四种导出类型
- [ ] 导出数据正确
- [ ] 中文不乱码

**文件**: `后端代码/server/src/routes/abc-v1.1.ts`

**新增端点**: `GET /api/v1/abc/export`

**权限**: admin, finance

**筛选参数**:
- `type` — 导出类型（slide-cost/profitability/fee-comparison/trend）
- `startDate`, `endDate` — 时间范围
- `projectType` — 项目类型
- `format` — 格式（xlsx/csv，默认 xlsx）

**实现方案**:
```typescript
// 使用 xlsx 库生成 Excel 文件
import * as XLSX from 'xlsx'

router.get('/export', authenticateToken, requireRole('admin', 'finance'), (req, res) => {
  const { type, startDate, endDate, projectType, format = 'xlsx' } = req.query
  const db = getDatabase()

  // 1. 根据 type 查询数据
  let data: any[] = []
  let headers: string[] = []
  let filename = ''

  switch (type) {
    case 'slide-cost':
      // 查询切片成本数据
      data = db.prepare(`SELECT ... FROM outbound_abc_details d ...`).all(...)
      headers = ['BOM名称', '类型', '材料/张', '作业/张', '总成本/张', '收费/张', '利润率']
      filename = '切片成本分析'
      break
    case 'profitability':
      // 查询盈利性数据
      data = db.prepare(`SELECT ... FROM outbound_abc_details d ...`).all(...)
      headers = ['项目名称', '类型', '样本数', '总成本', '总收费', '利润', '利润率']
      filename = '盈利性分析'
      break
    case 'fee-comparison':
      // 查询收费对照数据
      data = db.prepare(`SELECT ... FROM outbound_abc_details d ...`).all(...)
      headers = ['出库单号', '日期', '项目', '样本', '材料成本', '作业成本', '总成本', '收费', '利润', '利润率']
      filename = '收费对照'
      break
    case 'trend':
      // 查询趋势数据
      data = db.prepare(`SELECT ... FROM outbound_abc_details d ...`).all(...)
      headers = ['月份', 'BOM名称', '类型', '成本/张', '材料/张', '作业/张', '收费/张', '利润率']
      filename = '成本趋势'
      break
  }

  // 2. 生成 Excel
  const ws = XLSX.utils.json_to_sheet(data, { header: headers })
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, filename)

  // 3. 返回文件流
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  res.setHeader('Content-Disposition', `attachment; filename=${encodeURIComponent(filename)}.xlsx`)
  res.send(buffer)
})
```

**验收标准**:
- [ ] 支持导出切片成本数据
- [ ] 支持导出盈利性数据
- [ ] 支持导出收费对照数据
- [ ] 支持导出趋势数据
- [ ] Excel 格式正确
- [ ] 中文不乱码
- [ ] 文件名包含日期和类型

---

### 任务 4.3: 前端 — 成本趋势页面

**文件**: `前端代码/src/pages/cost/CostTrend.tsx`（新增）

**页面结构**（基于 CostCharts.tsx 的图表模式）：

```tsx
export function CostTrend() {
  const [filters, setFilters] = useState({
    bomId: 'all', projectType: 'all', months: 12,
  })
  const [data, setData] = useState([])

  return (
    <div className="space-y-6">
      {/* 页面头部 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight">成本趋势</h1>
          <p className="text-sm text-gray-500 mt-1">月度成本变化趋势</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select value={filters.months} onChange={e => setFilters({...filters, months: Number(e.target.value)})}
            className="h-10 px-3 text-sm border border-gray-300 rounded-md">
            <option value={6}>近6个月</option>
            <option value={12}>近12个月</option>
            <option value={24}>近24个月</option>
          </select>
          <button className="h-10 px-4 text-sm font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4 mr-2 inline" /> 导出
          </button>
        </div>
      </div>

      {/* 筛选栏 */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <select value={filters.projectType} onChange={e => setFilters({...filters, projectType: e.target.value})}
            className="h-10 px-3 text-sm border border-gray-300 rounded-md">
            <option value="all">全部类型</option>
            <option value="he">HE染色</option>
            <option value="ihc">免疫组化</option>
            <option value="ss">特殊染色</option>
            <option value="mp">分子病理</option>
          </select>
        </div>
      </div>

      {/* 切片成本趋势折线图 */}
      <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4">切片成本趋势</h3>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} />
            <YAxis tickFormatter={(v) => `¥${v.toFixed(0)}`} />
            <Tooltip formatter={(v) => formatCurrency(v)} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
            <Legend />
            <Line type="monotone" dataKey="costPerSlide" name="总成本/张" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="materialCost" name="材料/张" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="activityCost" name="作业/张" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
            <Line type="monotone" dataKey="feeAmount" name="收费/张" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* 利润率趋势柱状图 */}
      <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 mb-4">利润率趋势</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={{ stroke: '#e5e7eb' }} />
            <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
            <Tooltip formatter={(v) => `${(v * 100).toFixed(1)}%`} contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 13 }} />
            <Bar dataKey="marginRate" name="利润率" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
```

**验收标准**:
- [ ] 趋势折线图正确展示
- [ ] 支持按项目类型筛选
- [ ] 支持自定义时间范围
- [ ] 利润率柱状图正确展示

---

### 任务 4.4: 前端 — Dashboard 改造

**文件**: `前端代码/src/pages/Dashboard.tsx`（改造现有）

**改造内容**:

在现有 Dashboard 中增加成本相关卡片：

```tsx
// 新增卡片（使用现有 CostStatsCards 组件的样式）
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
  <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
        <Layers className="h-5 w-5 text-blue-500" />
      </div>
      <div>
        <p className="text-sm text-gray-500">本月切片成本</p>
        <p className="text-xl font-semibold text-gray-900">{formatCurrency(costData.avgCostPerSlide)}</p>
      </div>
    </div>
  </div>
  {/* 盈利项目数、亏损项目数、平均利润率 */}
</div>

// 新增：盈利项目 Top5
<div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
  <h3 className="text-base font-semibold text-gray-900 mb-4">盈利项目 Top5</h3>
  <TopProfitableProjects projects={costData.top5} />
</div>
```

**验收标准**:
- [ ] Dashboard 显示成本相关卡片
- [ ] 数据实时更新
- [ ] 盈利项目 Top5 正确展示

---

### 任务 4.5: E2E 测试（PM-QA-001 第二轮补充）

**文件**: `前端代码/e2e/abc-phase4.spec.ts`（新增）

**测试用例**：

```typescript
test.describe('ABC 成本分析 - Phase 4', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.fill('input[name="username"]', 'admin')
    await page.fill('input[name="password"]', 'admin123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
  })

  test('成本趋势 - 折线图正确展示', async ({ page }) => {
    await page.goto('/abc/trend')
    // 验证图表容器
    await expect(page.locator('.recharts-responsive-container')).toBeVisible()
    // 验证图例
    await expect(page.locator('text=总成本/张')).toBeVisible()
    await expect(page.locator('text=材料/张')).toBeVisible()
    await expect(page.locator('text=作业/张')).toBeVisible()
    await expect(page.locator('text=收费/张')).toBeVisible()
  })

  test('成本趋势 - 筛选功能', async ({ page }) => {
    await page.goto('/abc/trend')
    // 选择项目类型
    await page.selectOption('select:near(:text("项目类型"))', 'ihc')
    await page.waitForTimeout(500)
    // 选择时间范围
    await page.selectOption('select:near(:text("时间范围"))', '6')
    await page.waitForTimeout(500)
    // 验证图表已刷新
  })

  test('Dashboard - 成本卡片显示', async ({ page }) => {
    await page.goto('/')
    // 验证成本相关卡片
    await expect(page.locator('text=本月切片成本')).toBeVisible()
    await expect(page.locator('text=盈利项目数')).toBeVisible()
    await expect(page.locator('text=亏损项目数')).toBeVisible()
    await expect(page.locator('text=平均利润率')).toBeVisible()
  })

  test('Dashboard - 盈利项目 Top5', async ({ page }) => {
    await page.goto('/')
    // 验证 Top5 列表
    await expect(page.locator('text=盈利项目 Top5')).toBeVisible()
  })

  test('导出功能 - 切片成本导出', async ({ page }) => {
    await page.goto('/abc/slide-cost')
    // 点击导出按钮
    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("导出")')
    const download = await downloadPromise
    // 验证下载文件名
    expect(download.suggestedFilename()).toContain('.xlsx')
  })

  test('导出功能 - 盈利分析导出', async ({ page }) => {
    await page.goto('/abc/profitability')
    const downloadPromise = page.waitForEvent('download')
    await page.click('button:has-text("导出")')
    const download = await downloadPromise
    expect(download.suggestedFilename()).toContain('.xlsx')
  })

  test('权限控制 - 技术员无法访问成本看板', async ({ page }) => {
    // 登出
    await page.click('[data-testid="user-menu"]')
    await page.click('text=退出登录')
    // 用技术员账号登录
    await page.fill('input[name="username"]', 'jishuyuan1')
    await page.fill('input[name="password"]', 'CoreOne2026!')
    await page.click('button[type="submit"]')
    await page.waitForURL('/')
    // 尝试访问成本看板
    await page.goto('/abc/dashboard')
    // 验证被拒绝
    await expect(page).not.toHaveURL('/abc/dashboard')
  })
})
```

**验收标准**:
- [ ] 所有 E2E 测试通过
- [ ] 覆盖趋势、Dashboard、导出、权限控制
- [ ] 覆盖筛选、图表、下载等交互

---

### 任务 4.6: 快照定时任务（可选）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts`

**新增端点**: `POST /api/v1/abc/snapshots/generate`

**说明**: 此任务为可选，用于历史数据回溯。当前阶段可跳过，趋势分析直接从 `outbound_abc_details` 表聚合。

---

### 任务 4.7: 成本核算审计追踪（故事 23）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/AuditTrail.tsx`（新增）

**后端改动**:

新增表 `cost_audit_logs`：
```sql
CREATE TABLE IF NOT EXISTS cost_audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,             -- calculate/adjust/allocate/revert
  target_type TEXT NOT NULL,        -- outbound/budget/quality_cost/cost_pool
  target_id TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  reason TEXT,
  operator TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

新增 API：
- `GET /api/v1/abc/audit-logs` — 查询审计日志（支持按操作类型、目标类型、时间范围筛选）

**前端改动**:

新增审计追踪页面：
- 审计日志表格（操作类型、目标、操作人、时间、详情）
- 支持按操作类型、目标类型、时间范围筛选
- 日志详情弹窗

**验收标准**:
- [ ] 审计日志正确记录
- [ ] 支持按操作类型筛选
- [ ] 支持按目标类型筛选
- [ ] 支持按时间范围筛选

---

### 任务 4.8: 质量成本报表（故事 24）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/QualityCostReport.tsx`（新增）

**后端改动**:

新增 API：`GET /api/v1/abc/quality-cost-report`

**返回数据**:
```typescript
{
  summary: {
    totalQualityCost: number,
    preventionCost: number,
    appraisalCost: number,
    internalFailureCost: number,
    externalFailureCost: number,
    qualityCostRate: number,
  },
  details: [{ costType, subType, amount, ratio }],
  trend: [{ month, totalQualityCost, qualityCostRate }],
}
```

**前端改动**:

新增质量成本报表页面：
- 四类质量成本汇总卡片
- 质量成本构成饼图
- 质量成本趋势折线图
- 质量成本明细表格
- 导出功能

**验收标准**:
- [ ] 质量成本报表数据正确
- [ ] 四类质量成本正确分类
- [ ] 质量成本占比正确计算
- [ ] 导出功能正常

---

### 任务 4.9: 成本预测（故事 25）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/CostForecast.tsx`（新增）

**后端改动**:

新增 API：`GET /api/v1/abc/forecast`

**预测算法**：
- 移动平均法（近 3 个月平均）
- 线性回归法（趋势预测）
- 敏感性分析（材料价格/人工费率变化影响）

**前端改动**:

新增成本预测页面：
- 预测图表（历史数据 + 预测线）
- 预测参数配置（预测月数、预测方法）
- 敏感性分析表格

**验收标准**:
- [ ] 预测算法正确
- [ ] 预测图表正确展示
- [ ] 敏感性分析正确

---

### 任务 4.10: 成本模型验证（故事 28）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/CostModelValidation.tsx`（新增）

**后端改动**:

新增 API：`POST /api/v1/abc/validate`

**前端改动**:

新增成本模型验证页面：
- 测试数据输入表单
- 计算结果展示
- 预期 vs 实际对比
- 计算过程明细

**验收标准**:
- [ ] 测试数据输入正常
- [ ] 计算结果正确
- [ ] 预期 vs 实际对比正确

---

### 任务 4.11: 供应商成本分析（新增需求）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/SupplierCostAnalysis.tsx`（新增）

**后端改动**:

新增 API：`GET /api/v1/abc/supplier-cost`

**返回数据**:
```typescript
{
  suppliers: [{
    supplierId: string,
    supplierName: string,
    totalPurchaseAmount: number,
    totalPurchaseQuantity: number,
    avgUnitPrice: number,
    materialCount: number,
    priceChangeRate: number,      // 价格变化率
    topMaterials: [{              // 采购金额 Top5 物料
      materialId: string,
      materialName: string,
      amount: number,
      quantity: number,
    }],
  }],
  priceTrend: [{
    month: string,
    supplierId: string,
    avgPrice: number,
  }],
}
```

**前端改动**:

新增供应商成本分析页面：
- 供应商采购金额排名表格
- 供应商价格趋势折线图
- 供应商采购明细下钻
- 支持按时间范围筛选

**验收标准**:
- [ ] 供应商采购金额排名正确
- [ ] 价格趋势正确展示
- [ ] 采购明细下钻正确
- [ ] 支持按时间范围筛选

---

### 任务 4.12: 设备使用效率分析（新增需求）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/EquipmentEfficiency.tsx`（新增）

**后端改动**:

新增 API：`GET /api/v1/abc/equipment-efficiency`

**返回数据**:
```typescript
{
  equipment: [{
    equipmentId: string,
    equipmentName: string,
    model: string,
    purchasePrice: number,
    annualDepreciation: number,
    totalUsageMinutes: number,
    annualCapacity: number,
    utilizationRate: number,      // 使用率
    costPerMinute: number,        // 每分钟成本
    totalCost: number,            // 总折旧成本
    projectCount: number,         // 服务的项目数
  }],
  utilizationTrend: [{
    month: string,
    equipmentId: string,
    usageMinutes: number,
    utilizationRate: number,
  }],
}
```

**前端改动**:

新增设备使用效率分析页面：
- 设备使用率排名表格
- 设备使用率趋势折线图
- 设备成本与产出对比
- 支持按时间范围筛选

**验收标准**:
- [ ] 设备使用率计算正确
- [ ] 使用率趋势正确展示
- [ ] 成本与产出对比正确
- [ ] 支持按时间范围筛选

---

### 任务 4.13: 人员效率分析（新增需求）

**文件**: `后端代码/server/src/routes/abc-v1.1.ts` + `前端代码/src/pages/cost/PersonnelEfficiency.tsx`（新增）

**后端改动**:

新增 API：`GET /api/v1/abc/personnel-efficiency`

**返回数据**:
```typescript
{
  personnel: [{
    userId: string,
    userName: string,
    role: string,
    skillLevel: string,
    totalWorkMinutes: number,
    totalOutboundCount: number,
    avgMinutesPerOutbound: number,
    totalCost: number,
    costPerMinute: number,
  }],
  efficiencyTrend: [{
    month: string,
    userId: string,
    workMinutes: number,
    outboundCount: number,
    efficiency: number,
  }],
}
```

**前端改动**:

新增人员效率分析页面：
- 人员效率排名表格
- 人员效率趋势折线图
- 人员成本与产出对比
- 支持按时间范围、角色筛选

**验收标准**:
- [ ] 人员效率计算正确
- [ ] 效率趋势正确展示
- [ ] 成本与产出对比正确
- [ ] 支持按时间范围、角色筛选

---

## 依赖关系

```
4.1 (趋势API) ──→ 4.3 (趋势页面)
4.2 (导出功能) ──→ 独立
4.3 (趋势页面) ──→ 4.4 (Dashboard改造)
4.4 (Dashboard) ──→ 独立
4.5 (E2E测试) ──→ 所有页面完成后
4.6 (快照任务) ──→ 可选
4.7 (审计追踪) ──→ 独立
4.8 (质量报表) ──→ 独立
4.9 (成本预测) ──→ 依赖历史数据
4.10 (模型验证) ──→ 独立
```

## 预计工时

| 任务 | 工时 |
|------|------|
| 4.1 趋势API | 1.5h |
| 4.2 导出功能 | 2h |
| 4.3 趋势页面 | 2.5h |
| 4.4 Dashboard改造 | 1.5h |
| 4.5 E2E测试 | 2h |
| 4.6 快照任务（可选） | 2h |
| 4.7 审计追踪 | 3h |
| 4.8 质量报表 | 3h |
| 4.9 成本预测 | 3h |
| 4.10 模型验证 | 2h |
| **合计** | **21.5h**（不含可选任务 19.5h） |

---

## Phase 汇总

| Phase | 内容 | 工时 |
|-------|------|------|
| Phase 1 | 配置基础（收费标准映射、成本池、作业中心、人员技能、BOM版本） | 17.5h |
| Phase 2 | 计算引擎（ABC计算+出库集成+退库+批次追溯+测试） | 20.5h |
| Phase 3 | 分析展示（看板+切片成本+盈利分析+收费对照+预算+质量成本+病种+预警+差异+优化建议+E2E） | 40.5h |
| Phase 4 | 报表优化（趋势+导出+Dashboard+审计+质量报表+预测+验证+供应商+设备+人员+E2E） | 27.5h |
| **总计** | | **106h** |
