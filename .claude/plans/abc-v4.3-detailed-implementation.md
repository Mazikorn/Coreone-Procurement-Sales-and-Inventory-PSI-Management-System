# ABC v4.3 — 详细实施计划（PM-Plan-001 格式）

> **日期**: 2026-06-04  
> **方案**: B+（3.5周，15天 + 3天缓冲）  
> **前置文档**: [v4.3 产品功能定义](abc-product-versions/v4.3-product-features.md) | [代码更新计划](abc-code-update-plan.md) | [废弃分析](abc-v4.3-deprecation-analysis.md)

---

## Phase 1: 设备管理基础（第1周，4天）

### VibeContract — 设备类型管理

#### 业务意图
作为**设备管理员**，我希望**按设备类型管理设备**，以便**简化 BOM 配置和成本计算**。

#### 数据契约

| 字段 | 类型 | 来源 | 约束 | 示例 |
|------|------|------|------|------|
| id | TEXT | equipment_types | PK, UUID | "et-001" |
| code | TEXT | equipment_types | UNIQUE, NOT NULL, ≤20字符 | "MICRO" |
| name | TEXT | equipment_types | NOT NULL, ≤50字符 | "切片机" |
| description | TEXT | equipment_types | 可选, ≤200字符 | "用于组织切片的设备" |
| default_purchase_price | DECIMAL(18,4) | equipment_types | ≥0 | 50000.0000 |
| default_depreciable_life_years | INTEGER | equipment_types | ≥1, ≤30 | 10 |
| default_residual_value | DECIMAL(18,4) | equipment_types | ≥0, < default_purchase_price | 5000.0000 |
| default_depreciation_method | TEXT | equipment_types | ENUM: straight_line, units_of_production | "straight_line" |
| status | INTEGER | equipment_types | 0=禁用, 1=启用 | 1 |

#### 边界契约

| # | 边界场景 | 预期行为 | 风险等级 |
|---|---------|---------|---------|
| 1 | 删除有设备关联的设备类型 | 返回 409 Conflict，提示"该类型下有 N 台设备，无法删除" | Critical |
| 2 | 创建重复 code 的设备类型 | 返回 400 Bad Request，提示"类型编码已存在" | High |
| 3 | 设备类型名称为空 | 返回 400 Bad Request，字段校验失败 | Medium |
| 4 | default_purchase_price < default_residual_value | 返回 400 Bad Request，提示"残值不能大于购置价" | High |
| 5 | 设备从无类型改为有类型 | 设备更新成功，type_id 写入 | Medium |
| 6 | BOM 设备模板引用已禁用的设备类型 | 允许引用但成本预览显示警告 | Medium |

#### 异常契约

| 场景 | 状态码 | 错误消息 | 处理方式 |
|------|--------|---------|---------|
| 设备类型不存在 | 404 | "设备类型不存在" | 前端显示错误提示 |
| 编码重复 | 400 | "类型编码 {code} 已存在" | 前端高亮编码字段 |
| 删除有关联设备的类型 | 409 | "该类型下有 {count} 台设备" | 前端显示确认框（强制删除？） |
| 数据库写入失败 | 500 | "服务器内部错误" | 前端显示通用错误，后端记录日志 |

#### 验收标准（测试必须覆盖）

- [ ] **AC-1**: 创建设备类型 → 数据库记录存在，返回 201
- [ ] **AC-2**: 创建重复 code → 返回 400
- [ ] **AC-3**: 更新设备类型 → 名称/描述/默认参数正确更新
- [ ] **AC-4**: 删除无关联设备的类型 → 返回 200，记录删除
- [ ] **AC-5**: 删除有关联设备的类型 → 返回 409
- [ ] **AC-6**: 设备 CRUD 支持 type_id → 创建/更新/查询均包含类型信息
- [ ] **AC-7**: 设备列表支持按类型筛选 → 返回正确子集
- [ ] **AC-8**: 折旧统计按类型聚合 → 金额计算正确（误差 < 0.01）

---

### 对抗性提示 — Phase 1

#### 边界 1: 设备类型删除竞态

**场景**: 管理员 A 查看设备类型（显示 0 台设备），管理员 B 同时为某设备分配该类型，管理员 A 立即点击删除。
**风险**: 删除成功但实际已有设备关联，导致 BOM 成本计算 JOIN 失败。
**测试用例**:
```typescript
it('删除设备类型时应检查关联设备（竞态安全）', async () => {
  const type = await createEquipmentType({ code: 'TEST' })
  // 并发：一个请求删除类型，另一个请求创建设备关联该类型
  const [deleteRes, createRes] = await Promise.all([
    deleteType(type.id),
    createEquipment({ typeId: type.id, code: 'EQ-001' })
  ])
  // 至少一个应该失败
  expect(deleteRes.status === 200 || createRes.status === 201).toBe(false)
})
```

#### 边界 2: BOM 设备模板迁移后成本计算

**场景**: 迁移脚本将 `equipment_id` 映射为 `equipment_type_id`，但某些设备没有 `type_id`。
**风险**: 迁移后 BOM 设备模板记录丢失，成本计算返回 0。
**测试用例**:
```typescript
it('迁移后无类型设备的 BOM 模板应标记为待处理', async () => {
  // 模拟迁移：equipment 无 type_id
  const orphanedTemplates = await db.prepare(
    'SELECT bet.* FROM bom_equipment_templates bet LEFT JOIN equipment e ON bet.equipment_id = e.id WHERE e.type_id IS NULL'
  ).all()
  expect(orphanedTemplates.length).toBe(0) // 迁移脚本应处理所有记录
})
```

#### 边界 3: 折旧统计精度

**场景**: 设备购置价 99999.99，残值 0.01，折旧年限 10 年，100 台设备。
**风险**: 浮点精度累积误差导致折旧统计总额与逐台计算不一致。
**测试用例**:
```typescript
it('折旧统计总额应与逐台计算一致（精度测试）', async () => {
  await createEquipmentType({ code: 'PREC', defaultPurchasePrice: 99999.99 })
  for (let i = 0; i < 100; i++) {
    await createEquipment({ typeId: 'PREC', purchasePrice: 99999.99, residualValue: 0.01 })
  }
  const stats = await getDepreciationStats({ typeId: 'PREC' })
  const perUnit = (99999.99 - 0.01) / 10
  expect(Math.abs(stats.totalAnnualDepreciation - perUnit * 100)).toBeLessThan(0.01)
})
```

---

### 实施步骤 — Phase 1

#### Step 1.1: 数据库变更

**目标**: 创建 equipment_types 表 + equipment.type_id 迁移  
**改动文件**:
- `后端代码/server/src/database/DatabaseManager.ts`

**具体变更**:
1. 在 `initializeDatabase()` 中添加 `equipment_types` 表创建（CREATE TABLE IF NOT EXISTS）
2. 添加 `equipment.type_id` 迁移逻辑（PRAGMA table_info 检查 + ALTER TABLE）
3. 添加 `bom_equipment_templates.equipment_type_id` 迁移（表重建，见废弃分析 §二）
4. 种子数据：预置 5 个设备类型（A-11 修订）

**A-11 种子数据定义**:

| code | name | description | default_depreciation_method |
|------|------|-------------|---------------------------|
| SLICE | 切片机 | 用于组织切片的设备（轮转式、冷冻式等） | straight_line |
| STAIN | 染色机 | 免疫组化/特染自动化染色设备 | straight_line |
| SCAN | 数字扫描仪 | 病理切片数字化扫描设备 | straight_line |
| PCR | PCR 仪 | 聚合酶链反应扩增设备 | straight_line |
| OTHER | 其他 | 未分类设备（默认归入此类） | straight_line |

**现有设备默认映射**:
```sql
-- 未分配类型的设备默认归入 OTHER
UPDATE equipment
SET type_id = (SELECT id FROM equipment_types WHERE code = 'OTHER')
WHERE type_id IS NULL OR type_id = '';
```

**验证**:
- [ ] `npm run dev` 启动无报错
- [ ] `PRAGMA table_info(equipment_types)` 返回正确字段
- [ ] `PRAGMA table_info(equipment)` 包含 type_id
- [ ] 旧数据库升级后数据完整

#### Step 1.2: 设备类型 CRUD API

**目标**: 实现 /api/v1/equipment-types 端点  
**改动文件**:
- `后端代码/server/src/routes/equipment-types-v1.1.ts`（新建）
- `后端代码/server/src/app.ts`（注册路由）

**具体变更**:
1. 新建路由文件，遵循现有模式（success/successList/error）
2. 实现 GET /, GET /:id, POST /, PUT /:id, DELETE /:id
3. DELETE 检查 equipment 表关联
4. app.ts 注册路由：`app.use('/api/v1/equipment-types', authenticateToken, requireRole('admin', 'technician'), ...)`

**验证**:
- [ ] `curl GET /api/v1/equipment-types` 返回列表
- [ ] `curl POST /api/v1/equipment-types` 创建成功
- [ ] `curl DELETE /api/v1/equipment-types/:id` 有关联设备时返回 409
- [ ] 角色权限：technician 可读，admin 可写

#### Step 1.3: 设备路由改造 + reports 内联代码重构

**目标**: 设备 CRUD 支持 type_id + 折旧统计端点 + 重构 reports-v1.1.ts 内联设备成本计算  
**改动文件**:
- `后端代码/server/src/routes/equipment-v1.1.ts`
- `后端代码/server/src/routes/reports-v1.1.ts`（重构 lines 310-324）

**具体变更**:
1. GET / — 新增 typeId 查询参数，返回新增 typeName
2. GET /:id — 返回新增 typeId, typeName
3. POST / — 接受 typeId，INSERT 包含 type_id
4. PUT /:id — 接受 typeId，UPDATE 包含 type_id
5. 新增 GET /depreciation-stats — 按类型聚合折旧
6. **[H-2 修订] 重构 reports-v1.1.ts:310-324**：删除内联设备成本计算（直接 JOIN equipment），改为调用 `calculateEquipmentCost` from `cost-calculator.ts`

**H-2 重构详情**:
```typescript
// 删除 reports-v1.1.ts:310-324 的内联计算
// 原代码: JOIN bom_equipment_templates et JOIN equipment e ON et.equipment_id = e.id
// 改为:
import { calculateEquipmentCost } from '../utils/cost-calculator.js';
// 在 full-cost-by-project 查询中调用 calculateEquipmentCost(db, bomId, sampleCount)
```

**执行顺序约束**: 此步骤的第 6 项必须在 Step 1.1（数据库迁移）之前完成。如果迁移先执行，`reports-v1.1.ts` 中的 `JOIN equipment e ON et.equipment_id = e.id` 会因列名变更而报错。

**验证**:
- [ ] 创建设备时指定 typeId → 查询返回 typeName
- [ ] 按 typeId 筛选 → 返回正确子集
- [ ] 折旧统计 → 每个类型的设备数量、总购置价、年折旧额正确
- [ ] **[H-2] reports-v1.1.ts /full-cost-by-project 设备成本计算结果不变**（回归测试）
- [ ] **[H-2] 无直接 JOIN equipment 的内联代码残留**

#### Step 1.4: 前端类型定义 + API 层

**目标**: 补充类型定义和 API 函数  
**改动文件**:
- `前端代码/src/types/index.ts`
- `前端代码/src/api/master.ts`

**具体变更**:
1. types/index.ts — 新增 EquipmentType, DepreciationStat 接口；Equipment 新增 typeId, typeName
2. master.ts — equipmentApi 新增 getTypes, getTypeDetail, createType, updateType, deleteType, getDepreciationStats

**验证**:
- [ ] TypeScript 编译无错误
- [ ] API 函数调用返回正确类型

#### Step 1.5: 设备类型管理页面

**目标**: 新建设备类型 CRUD 页面  
**改动文件**:
- `前端代码/src/pages/equipment/EquipmentTypeList.tsx`（新建）
- `前端代码/src/pages/equipment/components/EquipmentTypeFormModal.tsx`（新建）
- `前端代码/src/pages/equipment/hooks/useEquipmentTypePage.ts`（新建）

**具体变更**:
1. 列表页：表格（编码、名称、设备数量、状态、操作）+ 新增按钮
2. 表单弹窗：编码、名称、描述、默认折旧参数、状态
3. 删除确认（检查关联设备）
4. 复用现有组件：SearchableSelect, formatCurrency

**验证**:
- [ ] 页面加载无错误
- [ ] 新增/编辑/删除操作正常
- [ ] 删除有关联设备的类型时显示友好提示

#### Step 1.6: 设备列表页改造 + 折旧统计页（H-5 修订）

**目标**: 设备列表新增类型筛选 + 折旧统计页面（独立路由）  
**改动文件**:
- `前端代码/src/pages/equipment/EquipmentList.tsx`（修改）
- `前端代码/src/pages/equipment/components/EquipmentFormModal.tsx`（修改）
- `前端代码/src/pages/equipment/hooks/useEquipmentPage.ts`（修改）
- `前端代码/src/pages/equipment/DepreciationStats.tsx`（新建 — 折旧统计页）
- `前端代码/src/pages/cost/EquipmentEfficiency.tsx`（保留 — 未来设备效率分析）
- `前端代码/src/pages/cost/index.ts`（更新 barrel export）
- `前端代码/src/App.tsx`（新增路由）

**具体变更**:
1. EquipmentList — 新增类型筛选下拉、类型列、跳转按钮
2. EquipmentFormModal — 新增设备类型选择字段
3. **[H-5 修订] 新建 `DepreciationStats.tsx`**，路由 `/equipment/depreciation-stats`
4. **[H-5 修订] 保留 `EquipmentEfficiency.tsx`**，路由 `/abc/equipment-efficiency`（预留未来设备效率分析，当前仍为占位页）
5. App.tsx — 新增 `/equipment/depreciation-stats` 路由，保留 `/abc/equipment-efficiency` 路由

**路由说明**:
| 路由 | 组件 | 用途 | 用户角色 |
|------|------|------|---------|
| `/equipment/depreciation-stats` | DepreciationStats | 折旧统计（财务视角） | admin, finance |
| `/abc/equipment-efficiency` | EquipmentEfficiency | 设备效率分析（运营视角，未来） | admin, warehouse_manager |

**验证**:
- [ ] 设备列表按类型筛选正常
- [ ] `/equipment/depreciation-stats` 折旧统计图表显示正确
- [ ] `/abc/equipment-efficiency` 仍可访问（占位页）
- [ ] 导出 Excel 功能正常

---

## Phase 2: 成本报表增强（第2周，4天）

### VibeContract — 参考值来源标签

#### 业务意图
作为**实验室主管**，我希望**看到标准工时参考值的来源标签**，以便**判断是否采纳该参考值**。

#### 数据契约

| 字段 | 类型 | 来源 | 约束 | 示例 |
|------|------|------|------|------|
| reference_source | TEXT | standard_labor_times | ENUM: supplier, industry, system | "supplier" |
| reference_source_label | computed | API 响应 | 映射为中文 | "供应商提供" |

#### 边界契约

| # | 边界场景 | 预期行为 | 风险等级 |
|---|---------|---------|---------|
| 1 | 旧数据无 reference_source 字段 | 默认值 'system'，标签显示"系统预设" | Medium |
| 2 | 筛选 reference_source=supplier 且无数据 | 返回空列表，不报错 | Low |
| 3 | 批量导入工时数据无 reference_source | 使用默认值 'system' | Medium |

---

### VibeContract — 成本差异分析增强

#### 业务意图
作为**财务人员**，我希望**查看成本差异分析（实际vs标准、本月vs上月）**，以便**发现成本异常并定位根因**。

#### 数据契约

| 字段 | 类型 | 来源 | 约束 | 示例 |
|------|------|------|------|------|
| compareType | ENUM | 查询参数 | actual_vs_standard, month_vs_month | "actual_vs_standard" |
| materialVariance | DECIMAL | 计算 | = materialActual - materialStandard | 3000.00 |
| laborVariance | DECIMAL | 计算 | = laborActual - laborStandard | -500.00 |
| equipmentVariance | DECIMAL | 计算 | = equipmentActual - equipmentStandard | 0.00 |
| indirectVariance | DECIMAL | 计算 | = indirectActual - indirectStandard | 200.00 |

#### 边界契约

| # | 边界场景 | 预期行为 | 风险等级 |
|---|---------|---------|---------|
| 1 | 本月无出库记录 | 差异为 0，趋势图显示空点 | Medium |
| 2 | 标准成本未配置（BOM 无标准成本） | 差异分析标记为"标准成本未配置" | High |
| 3 | 选择的时间范围超过 12 个月 | 返回 400，提示"时间范围不超过 12 个月" | Medium |
| 4 | 成本要素为 0 的项目 | 排除或标记为"无数据" | Low |

---

### VibeContract — 成本月度环比

#### 业务意图
作为**管理者**，我希望**查看本月与上月的成本对比**，以便**及时发现成本波动**。

#### 数据契约

| 字段 | 类型 | 来源 | 约束 | 示例 |
|------|------|------|------|------|
| currentMonth.totalCost | DECIMAL | outbound_records | ≥0 | 285000.00 |
| previousMonth.totalCost | DECIMAL | outbound_records | ≥0 | 280000.00 |
| changes.totalChange | DECIMAL | 计算 | = current - previous | 5000.00 |
| changes.totalChangeRate | DECIMAL | 计算 | = change / previous * 100 | 1.79 |

---

### 对抗性提示 — Phase 2

#### 边界 1: 月初数据不完整

**场景**: 6 月 3 日查看月度环比，6 月只有 3 天数据，5 月有完整 31 天。
**风险**: 6 月成本远低于 5 月，显示"大幅下降"，实际是数据不完整。
**测试用例**:
```typescript
it('月度环比应标注当月数据不完整', async () => {
  // 6月3日查询
  const result = await getMonthlyComparison({ month: '2026-06' })
  expect(result.currentMonth.isComplete).toBe(false)
  expect(result.currentMonth.dataDays).toBe(3)
  expect(result.changes.note).toContain('当月数据不完整')
})
```

#### 边界 2: 标准成本未配置的差异分析

**场景**: 某 BOM 从未配置标准成本，但有实际出库记录。
**风险**: 差异分析显示巨大差异（实际 vs 0），误导决策。
**测试用例**:
```typescript
it('标准成本未配置时应标记而非显示差异', async () => {
  const bom = await createBom({ standardTotalCost: 0 })
  await createOutbound({ bomId: bom.id, actualCost: 500 })
  const result = await getCostVariance({ bomId: bom.id })
  expect(result.items[0].status).toBe('standard_not_configured')
  expect(result.items[0].variance).toBeNull()
})
```

---

### 实施步骤 — Phase 2

#### Step 2.1: 数据库变更 — reference_source

**改动文件**: `DatabaseManager.ts`  
**验证**:
- [ ] 旧数据库升级后 reference_source 默认值为 'system'
- [ ] 新建记录可指定 reference_source

#### Step 2.2: 后端 — 参考值来源 API

**改动文件**: `labor-time-v1.1.ts`  
**验证**:
- [ ] GET 列表返回 referenceSource
- [ ] POST/PUT 接受 referenceSource
- [ ] 按 referenceSource 筛选正常

#### Step 2.3: 前端 — 工时列表改造

**改动文件**: `LaborTimeList.tsx`, `LaborTimeFormModal.tsx`, `types/index.ts`  
**验证**:
- [ ] 列表显示参考值来源标签（Tag 组件）
- [ ] 表单可选择参考值来源
- [ ] 筛选正常

#### Step 2.4: 后端 — 成本差异分析 API

**改动文件**: `reports-v1.1.ts`  
**新增端点**: `GET /cost-variance`  
**验证**:
- [ ] actual_vs_standard 对比返回正确数据
- [ ] month_vs_month 对比返回正确数据
- [ ] 成本要素分解（材料/人工/设备/间接）正确
- [ ] 无标准成本时标记 status

#### Step 2.5: 前端 — 成本差异分析增强

**改动文件**: `CostVarianceAnalysis.tsx`  
**验证**:
- [ ] 差异趋势折线图显示
- [ ] 成本要素分解列显示
- [ ] 对比维度切换正常
- [ ] 导出 Excel 正常

#### Step 2.6: 后端 — 月度环比 API

**改动文件**: `reports-v1.1.ts`  
**新增端点**: `GET /cost-monthly-comparison`  
**验证**:
- [ ] 当月/上月数据正确
- [ ] 变化金额和百分比正确
- [ ] 当月数据不完整时标注

#### Step 2.7: 前端 — 月度环比展示

**改动文件**: `CostDashboard.tsx`  
**验证**:
- [ ] 月度环比卡片显示
- [ ] 变化方向箭头正确
- [ ] 各成本要素变化明细

---

## Phase 3: 成本分析能力（第3周，3天）

### VibeContract — 成本趋势季度聚合

#### 业务意图
作为**管理者**，我希望**按季度查看成本趋势**，以便**进行季度经营分析**。

#### 数据契约

| 字段 | 类型 | 来源 | 约束 | 示例 |
|------|------|------|------|------|
| dimension | ENUM | 查询参数 | monthly, quarterly | "quarterly" |
| period | TEXT | 计算 | monthly: "2026-01", quarterly: "2026-Q1" | "2026-Q1" |
| totalCost | DECIMAL | 聚合 | ≥0 | 850000.00 |

#### 边界契约

| # | 边界场景 | 预期行为 | 风险等级 |
|---|---------|---------|---------|
| 1 | 当前季度未结束 | 返回已结束月份的数据，标注"季度进行中" | Medium |
| 2 | 切换月度/季度视图 | 数据重新聚合，图表平滑过渡 | Low |
| 3 | 跨年季度（如 2025-Q4 → 2026-Q1） | 正确分组，不混淆年份 | High |

---

### VibeContract — BOM 成本预览

#### 业务意图
作为**BOM 管理员**，我希望**预览 BOM 的全成本构成**，以便**了解成本结构并优化配置**。

#### 数据契约

| 字段 | 类型 | 来源 | 约束 | 示例 |
|------|------|------|------|------|
| bomId | TEXT | 路径参数 | UUID | "bom-001" |
| costMode | ENUM | 查询参数 | type_default, equipment_average（默认） | "equipment_average" |
| totalCost | DECIMAL | 计算 | = material + labor + equipment + indirect | 29.00 |
| materialCost.amount | DECIMAL | bom_items + quotas | ≥0 | 15.50 |
| laborCost.amount | DECIMAL | standard_labor_times | ≥0 | 8.00 |
| equipmentCost.amount | DECIMAL | 计算 | ≥0 | 2.50 |
| equipmentCost.priceSource | ENUM | 计算 | type_default, equipment_average, actual | "equipment_average" |
| equipmentCost.equipmentCount | INTEGER | 查询 | ≥0 | 5 |
| equipmentCost.note | TEXT | 计算 | 数据来源说明 | "基于 5 台设备加权平均" |
| indirectCost.amount | DECIMAL | indirect_cost_centers | ≥0 | 3.00 |

#### 边界契约

| # | 边界场景 | 预期行为 | 风险等级 |
|---|---------|---------|---------|
| 1 | BOM 无物料配置 | 材料成本为 0，显示警告 | High |
| 2 | BOM 设备模板引用已禁用的设备类型 | 使用类型默认参数，显示警告 | Medium |
| 3 | 间接成本中心无月度费用 | 间接费用为 0，显示"未配置" | Medium |
| 4 | 成本预览 API 响应时间 > 2s | 返回缓存结果 + 标注缓存时间 | Medium |

---

### VibeContract — 成本结构饼图增强

#### 业务意图
作为**管理者**，我希望**查看按成本类型（材料/人工/设备/间接）的成本结构饼图**，以便**了解成本构成并优化资源配置**。

#### 数据契约

| 字段 | 类型 | 来源 | 约束 | 示例 |
|------|------|------|------|------|
| viewType | ENUM | 切换参数 | by_activity, by_type | "by_type" |
| costType | ENUM | 枚举 | material, labor, equipment, indirect | "material" |
| cost | DECIMAL | 聚合 | ≥0 | 152000.00 |
| ratio | DECIMAL | 计算 | 0-100 | 53.4 |

---

### 对抗性提示 — Phase 3

#### 边界 1: 成本预览 vs 实际出库差异

**场景**: BOM 成本预览显示 29 元/切片，但实际出库时因物料价格波动，实际成本为 32 元/切片。
**风险**: 用户依赖预览值做决策，实际成本超出预期。
**测试用例**:
```typescript
it('成本预览应标注使用的是标准价还是最新价', async () => {
  const preview = await getBomCostPreview('bom-001')
  expect(preview.materialCost.priceSource).toBe('weighted_average') // 加权平均价
  expect(preview.updatedAt).toBeDefined()
  expect(preview.note).toContain('基于当前物料加权平均价')
})
```

#### 边界 2: 季度聚合首尾不完整

**场景**: 2026 年 Q2（4-6 月），6 月 4 日查询，只有 4 月+5 月完整数据 + 6 月 4 天数据。
**风险**: Q2 数据被截断，趋势图显示"下降"。
**测试用例**:
```typescript
it('未完成季度应标注数据完整性', async () => {
  const trend = await getCostTrend({ dimension: 'quarterly', year: 2026 })
  const q2 = trend.find(t => t.period === '2026-Q2')
  expect(q2.isComplete).toBe(false)
  expect(q2.monthsIncluded).toBe(2) // 4月+5月完整
  expect(q2.partialMonth).toBe('2026-06') // 6月不完整
})
```

#### 边界 3: 跨年季度聚合（H-4 修订）

**场景**: 查询时间范围 2025-10 到 2026-03，跨越 Q4 和 Q1 两个年份的季度。
**风险**: 年份边界处理不当导致 Q4 和 Q1 数据混淆，或 12 月数据被归入错误年份。
**季度计算公式**: `period = strftime('%Y', date) || '-Q' || CEIL(strftime('%m', date) / 3)`，年份和季度独立计算，不会跨年混淆。
**测试用例**:
```typescript
it('跨年时间范围的季度聚合应正确分组', async () => {
  await createCostRecord({ date: '2025-10-15', amount: 10000 })
  await createCostRecord({ date: '2025-12-20', amount: 15000 })
  await createCostRecord({ date: '2026-01-10', amount: 12000 })
  await createCostRecord({ date: '2026-03-25', amount: 8000 })

  const trend = await getCostTrend({
    dimension: 'quarterly',
    startDate: '2025-10',
    endDate: '2026-03'
  })

  expect(trend.map(t => t.period)).toEqual(['2025-Q4', '2026-Q1'])
  expect(trend.find(t => t.period === '2025-Q4').totalCost).toBe(25000)
  expect(trend.find(t => t.period === '2026-Q1').totalCost).toBe(20000)
})

it('单月查询跨越年份边界应正确归属', async () => {
  await createCostRecord({ date: '2025-12-31', amount: 5000 })
  await createCostRecord({ date: '2026-01-01', amount: 3000 })

  const trend = await getCostTrend({
    dimension: 'quarterly',
    startDate: '2025-12',
    endDate: '2026-01'
  })

  expect(trend.find(t => t.period === '2025-Q4').totalCost).toBe(5000)
  expect(trend.find(t => t.period === '2026-Q1').totalCost).toBe(3000)
})
```

---

### 实施步骤 — Phase 3

#### Step 3.1: 后端 — 成本趋势季度聚合（H-4 修订）

**改动文件**: `reports-v1.1.ts`  
**变更**: `/cost-trend` 新增 `dimension` 参数，季度聚合 SQL  

**季度计算公式**:
```sql
-- 季度标签 = 年份 + '-Q' + 季度编号
-- 季度编号 = CEIL(month / 3)
strftime('%Y', date) || '-Q' ||
  CASE
    WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 1 AND 3 THEN '1'
    WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 4 AND 6 THEN '2'
    WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 7 AND 9 THEN '3'
    WHEN CAST(strftime('%m', date) AS INTEGER) BETWEEN 10 AND 12 THEN '4'
  END AS period
```

**验证**:
- [ ] dimension=monthly 行为不变
- [ ] dimension=quarterly 正确聚合
- [ ] 跨年季度正确分组（2025-Q4 和 2026-Q1 不混淆）
- [ ] 12 月数据归入当年 Q4，1 月数据归入当年 Q1

#### Step 3.2: 前端 — 成本趋势季度视图

**改动文件**: `CostTrend.tsx`  
**验证**:
- [ ] 月度/季度切换正常
- [ ] 季度视图图表正确
- [ ] 季度同比对比

#### Step 3.3: 后端 — 成本预览 API（H-1 + H-6 修订）

**改动文件**: `bom-v1.1.ts`, `cost-calculator.ts`  
**新增端点**: `GET /api/v1/boms/:id/cost-preview`  

**查询参数**:
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| costMode | string | `equipment_average` | `type_default`（使用类型默认值）/ `equipment_average`（使用该类型下所有设备加权平均值） |

**响应新增字段**:
| 字段 | 类型 | 说明 |
|------|------|------|
| equipmentCost.priceSource | string | `type_default` / `equipment_average` / `actual` |
| equipmentCost.equipmentCount | number | 该类型下的设备数量（equipment_average 模式） |
| equipmentCost.note | string | 数据来源说明，如"基于 5 台设备加权平均" |

**缓存策略 [H-6 修订]**:
- **初期**: 不缓存，实时计算，监控响应时间
- **优化期**（响应时间持续 > 2s）: 内存缓存 `Map<string, {data, timestamp}>`，TTL=300s
- **缓存失效**: 在 `PUT /api/v1/boms/:id` 中调用 `invalidateBomCostCache(bomId)`
- 详见废弃分析 §五

**验证**:
- [ ] 成本分解正确（材料/人工/设备/间接）
- [ ] 百分比合计 = 100%
- [ ] costMode=type_default 使用设备类型默认参数
- [ ] costMode=equipment_average 使用加权平均参数（默认）
- [ ] 响应包含 priceSource 字段
- [ ] 响应时间 < 2s
- [ ] PUT /api/v1/boms/:id 后缓存失效（当启用缓存时）

#### Step 3.4: 前端 — 成本预览弹窗

**改动文件**: `前端代码/src/pages/bom/components/CostPreviewModal.tsx`（新建）, `BOM.tsx`  
**验证**:
- [ ] 弹窗打开/关闭正常
- [ ] 成本汇总卡片显示正确
- [ ] 饼图显示正确
- [ ] 刷新成本功能正常

#### Step 3.5: 后端 — 成本结构 API

**改动文件**: `reports-v1.1.ts`  
**新增端点**: `GET /cost-structure`  
**验证**:
- [ ] 按成本类型聚合正确
- [ ] 百分比合计 = 100%

#### Step 3.6: 前端 — 成本结构饼图增强

**改动文件**: `CostDashboard.tsx`  
**验证**:
- [ ] 按活动中心/按成本类型切换正常
- [ ] 饼图标签和颜色正确

---

## Phase 4: 完整闭环（第4周，4天）

### VibeContract — 季度调整

#### 业务意图
作为**财务人员**，我希望**在季度末收到调整建议并完成季度结算**，以便**及时修正成本偏差**。

#### 数据契约

| 字段 | 类型 | 来源 | 约束 | 示例 |
|------|------|------|------|------|
| cost_center_id | TEXT | 路径参数 | FK → indirect_cost_centers | "cc-001" |
| year_quarter | TEXT | 查询参数 | 格式: YYYY-QN | "2026-Q2" |
| pre_provision_amount | DECIMAL | 查询 | 该季度 3 个月预提总和 | 150000.00 |
| actual_amount | DECIMAL | 用户输入 | ≥0 | 148000.00 |
| adjustment_amount | DECIMAL | 计算 | = actual - pre_provision | -2000.00 |
| review_status | ENUM | 状态机 | pending → approved/rejected | "pending" |

#### 边界契约

| # | 边界场景 | 预期行为 | 风险等级 |
|---|---------|---------|---------|
| 1 | 季度未结束时生成调整建议 | 返回 400，提示"季度未结束" | High |
| 2 | 同一季度重复生成建议 | 返回已有建议，不重复创建 | Medium |
| 3 | 调整金额为 0 | 标记为"无需调整"，自动 approved | Low |
| 4 | 审核人 = 调整人 | 返回 403，提示"不能审核自己提交的调整" | High |
| 5 | 预提金额为 0（成本中心无月度费用） | 调整金额 = 实际金额，显示警告 | Medium |

#### 权限矩阵（H-3 修订）

| 操作 | admin | finance | technician | warehouse_manager | 其他 |
|------|:-----:|:-------:|:----------:|:-----------------:|:----:|
| 查看调整建议 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 生成调整建议 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 手动创建调整 | ✅ | ✅ | ❌ | ❌ | ❌ |
| 审核调整 | ✅ | ✅（不能审自己） | ❌ | ❌ | ❌ |
| 查看调整记录 | ✅ | ✅ | ❌ | ❌ | ❌ |

**自我审核约束**: 审核时检查 `adjustment.submitted_by !== req.user.id`，违反返回 403。

#### 异常契约

| 场景 | 状态码 | 错误消息 | 处理方式 |
|------|--------|---------|---------|
| 成本中心不存在 | 404 | "成本中心不存在" | 前端显示错误 |
| 季度格式错误 | 400 | "季度格式应为 YYYY-QN" | 前端高亮字段 |
| 重复审核 | 409 | "该调整已审核" | 前端刷新状态 |
| 自我审核 | 403 | "不能审核自己提交的调整" | 前端显示提示 |
| 权限不足 | 403 | "仅管理员和财务人员可执行此操作" | 前端显示提示 |

---

### 对抗性提示 — Phase 4

#### 边界 1: 季度调整并发审核

**场景**: 财务 A 和财务 B 同时审核同一笔调整，A 通过，B 驳回。
**风险**: 状态被覆盖，数据不一致。
**测试用例**:
```typescript it('并发审核应只有一个成功', async () => {
  const adj = await createAdjustment({ status: 'pending' })
  const [resA, resB] = await Promise.all([
    reviewAdjustment(adj.id, { status: 'approved', reviewer: 'A' }),
    reviewAdjustment(adj.id, { status: 'rejected', reviewer: 'B' })
  ])
  const final = await getAdjustment(adj.id)
  // 只有一个审核成功
  expect([resA.status, resB.status].filter(s => s === 200).length).toBe(1)
  expect(final.reviewStatus).toMatch(/approved|rejected/)
})```

#### 边界 2: 跨季度调整

**场景**: Q1 的调整在 Q2 才提交审核，期间 Q2 已有新的月度费用。
**风险**: Q2 的成本计算是否受 Q1 调整影响？
**测试用例**:
```typescript it('Q1 调整不影响 Q2 的月度分摊率', async () => {
  await createAllocation({ quarter: 'Q1', amount: 100000 })
  await createAdjustment({ quarter: 'Q1', adjustmentAmount: -5000 })
  const q2Rate = await getAllocationRate({ quarter: 'Q2', month: '2026-04' })
  // Q2 分摊率不受 Q1 调整影响（调整仅影响季度结算报表）
  expect(q2Rate).toBe(q2Rate) // 不变
})```

---

### 实施步骤 — Phase 4

#### Step 4.1: 数据库变更 — cost_adjustments

**改动文件**: `DatabaseManager.ts`  
**验证**:
- [ ] 表创建成功
- [ ] 外键约束正确

#### Step 4.2: 后端 — 季度调整 API（H-3 修订）

**改动文件**: `后端代码/server/src/routes/cost-adjustment-v1.1.ts`（新建）, `app.ts`  
**路由注册**: `app.use('/api/v1/cost-adjustments', authenticateToken, requireRole('admin', 'finance'), ...)`

**权限检查**:
- 所有端点：仅 admin 和 finance 角色可访问
- POST /:id/review：额外检查 `adjustment.submitted_by !== req.user.id`，自我审核返回 403
- 并发审核：使用乐观锁 `WHERE review_status = 'pending' AND reviewed_at IS NULL`

**验证**:
- [ ] GET /suggestions 自动生成调整建议
- [ ] POST / 手动创建调整
- [ ] POST /:id/review 审核（乐观锁防并发）
- [ ] POST /:id/review 自我审核返回 403
- [ ] GET / 列表查询
- [ ] 非 admin/finance 角色访问返回 403

#### Step 4.3: 前端 — 季度调整页面

**改动文件**: `QuarterlyAdjustment.tsx`（新建）, `AdjustmentReviewModal.tsx`（新建）, `IndirectCostCenterList.tsx`  
**验证**:
- [ ] 调整建议表格显示
- [ ] 手动触发弹窗正常
- [ ] 审核弹窗正常
- [ ] 调整记录表格显示

#### Step 4.4: 前端 — 路由与导航更新

**改动文件**: `App.tsx`, `AppSidebar.tsx`  
**验证**:
- [ ] 新路由可访问
- [ ] 侧边栏导航正确
- [ ] 权限控制正常

---

## 工时汇总

| Phase | 内容 | 预估工时 | 备注 |
|-------|------|:-------:|------|
| Phase 1 | 设备管理基础 | 32h | 含 DB 迁移 + 6 个步骤 |
| Phase 2 | 成本报表增强 | 32h | 含 7 个步骤 |
| Phase 3 | 成本分析能力 | 24h | 含 6 个步骤 |
| Phase 4 | 完整闭环 | 32h | 含 4 个步骤 |
| 缓冲 | 风险+变更 | 24h | 20% 缓冲 |
| **总计** | | **144h** | 约 18 天（3.5 周） |

---

*本计划遵循 PM-Plan-001 格式，包含 VibeContract、对抗性提示、实施步骤。*
