# COREONE 方案二：深度集成 — 系统规划文档

> **创建日期**: 2026-06-03
> **方案选择**: 用户选择方案二（深度集成）
> **参考文档**:
> - [三方案归档](../research/abc-three-plans-archive.md)
> - [市场调研报告](../research/abc-market-research.md)
> - [ABC 调研参考](../research/abc-cost-model-references.md)

---

## 一、系统架构

### 1.1 三层架构

```
配置层                    计算层                    分析层
─────────                ─────────                ─────────
作业中心(8个)    ┐
成本动因(7种)    ├→ ABC计算引擎 ←→ 出库事务流  →  切片成本分析
成本池(月度归集)  │   cost-calculator.ts   outbound-v1.1.ts  盈利性分析
BOM作业关联      ┘                                       成本趋势
收费标准(82条)   ──────────────────────────────────→  收费vs成本对比
```

### 1.2 核心数据流

```
出库请求 → BOM查找 → 材料成本(已有)
                   → abc_bom_activity_links → 作业成本(新增)
                   → fee_standards → 收费金额(新增)
                   → 写入 outbound_abc_details
                   → totalCost = 材料 + 作业
                   → profit = 收费 - 成本
```

---

## 二、数据库设计

### 2.1 新增表

**outbound_abc_details** — 出库ABC成本明细
- 关联 outbound_records、boms、fee_standards
- 字段：material_cost, activity_cost, total_cost, cost_per_slide, fee_amount, profit, profit_rate
- activity_details: JSON 存储各作业中心成本明细

**slide_cost_snapshots** — 切片成本快照
- 按BOM+月份存储标准成本快照
- 用于趋势分析和历史回溯

### 2.2 修改表

**boms** 增加：fee_standard_id, fee_category, standard_slide_cost, standard_fee_per_slide, standard_margin_rate

**outbound_records** 增加：abc_total_cost, abc_activity_cost, fee_amount, profit

---

## 三、API 设计

### 3.1 新增端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/v1/abc/slide-cost | 计算指定BOM单张切片成本 |
| POST | /api/v1/abc/case-cost | 计算病例成本（多张切片） |
| GET | /api/v1/abc/profitability | 盈利性分析（项目/病例/BOM维度） |
| GET | /api/v1/abc/slide-cost-trend | 切片成本月度趋势 |
| GET/PUT | /api/v1/abc/fee-mapping/:bomId | BOM-收费标准映射 |
| POST | /api/v1/outbound/preview-cost | 出库成本预览（不实际出库） |

### 3.2 改造端点

| 端点 | 改造内容 |
|------|---------|
| POST /outbound/bom | 嵌入ABC计算+收费匹配，写入outbound_abc_details |
| GET /outbound | 返回值增加 abcTotalCost, feeAmount, profit |
| GET/PUT /boms/:id | 增加收费标准关联和标准切片成本 |
| GET /reports/full-cost-by-project | 增加ABC口径分解和收费/利润字段 |

---

## 四、前端页面设计

### 4.1 页面清单

| 页面 | 路由 | 类型 | 核心价值 |
|------|------|------|---------|
| 出库成本预览 | 嵌入出库弹窗 | 改造 | 出库前预览全成本和收费 |
| 切片成本分析 | /abc/slide-cost | 新增 | 一目了然看每张切片成本 |
| 盈利性分析 | /abc/profitability | 改造 | 项目/病例/BOM三维度 |
| BOM收费标准 | /bom 详情Tab | 改造 | 配置BOM与收费映射 |
| 成本池管理 | /abc/cost-pools | 增强 | 从间接成本中心同步 |

### 4.2 核心页面：切片成本分析

```
┌─────────────────────────────────────────────────┐
│ 切片成本分析                    [导出] [刷新]    │
├────────┬────────┬────────┬────────┤
│ 平均切片成本│ 材料占比 │ 收费覆盖率│ 平均利润率│
├─────────────────────────────────────────────────┤
│ BOM名称 | 类型 | 材料 | 作业 | 总成本 | 收费 | 利润率│
│ HE常规   | he  | 12.50| 6.25 | 18.75 | 52.50| 64.3%│
│ IHC-ER   | ihc | 29.80|22.40 | 52.20 |105.00| 50.3%│
├─────────────────────────────────────────────────┤
│ 作业成本瀑布图（点击某行展开）                    │
│ 材料    |████████████████████████| 12.50 (67%)   │
│ 标本处理|███                     |  1.50 (8%)    │
│ 切片    |█████                   |  2.50 (13%)   │
│ 染色    |████                    |  1.25 (7%)    │
│ 诊断    |███                     |  1.00 (5%)    │
└─────────────────────────────────────────────────┘
```

---

## 五、实施计划

### Phase 1: 数据基础层（Week 1-2）

**交付物**：
1. 新表创建（outbound_abc_details, slide_cost_snapshots）
2. 现有表 ALTER（boms, outbound_records）
3. BOM-收费标准映射种子脚本
4. 历史数据回填脚本

**验收标准**：
- 新表正常创建，索引生效
- 82条收费标准数据完整
- 80%+ BOM 完成收费标准映射

### Phase 2: 计算引擎集成（Week 3-4）

**交付物**：
1. cost-calculator.ts 扩展（calculateSlideCost 增加收费匹配）
2. outbound-v1.1.ts 改造（POST /bom 嵌入ABC计算）
3. abc-v1.1.ts 新增端点（slide-cost, profitability, fee-mapping）
4. bom-v1.1.ts 改造（增加收费标准字段）
5. 单元测试

**验收标准**：
- 出库自动计算ABC成本
- 单张切片成本误差 < 0.01 元
- 阶梯定价和封顶机制正确
- 单元测试覆盖率 > 85%

### Phase 3: 前端页面改造（Week 5-6）

**交付物**：
1. 出库成本预览面板
2. 切片成本分析页（新增）
3. 盈利分析页改造（三维度视图）
4. BOM详情页增加收费标准Tab
5. 出库列表增加ABC成本列

**验收标准**：
- BOM出库时可实时预览成本和收费
- 切片成本分析页正确展示瀑布图
- 盈利分析支持项目/病例/BOM三维度

### Phase 4: 报表与优化（Week 7-8）

**交付物**：
1. 报表增强（ABC口径 + 收费/利润字段）
2. 切片成本快照定时任务
3. Dashboard 改造（切片成本卡片、盈利Top5）
4. 导出功能
5. E2E 测试

**验收标准**：
- 报表数据与出库明细一致
- E2E 测试通过率 100%
- 页面 P95 响应时间 < 3 秒

### 关键里程碑

| 里程碑 | 时间 | 交付物 |
|--------|------|--------|
| M1 | Week 2 | 数据基础层完成 |
| M2 | Week 4 | 计算引擎集成完成，API就绪 |
| M3 | Week 6 | 前端页面改造完成 |
| M4 | Week 8 | 全功能上线 |

---

## 六、测试策略

### 单元测试
- calculateSlideCost: 正常/空BOM/空成本池/多作业中心累加
- calculateFeeAmount: 无阶梯/有阶梯/跨越边界/封顶
- calculateTieredCost: 空数组/单tier/多tier/cap生效
- calculateProfitability: 盈利/亏损/多项目汇总

### 集成测试
- BOM出库 + ABC成本计算全流程
- 出库成本预览（不实际出库）
- 阶梯定价正确性（10张/20张/更多）
- BOM-收费标准映射
- 盈利性分析聚合

### E2E 测试
- BOM出库全流程（含成本预览验证）
- 切片成本分析（瀑布图展示）
- BOM收费标准配置
- 盈利分析多维度切换
- 权限控制验证

---

## 七、关键文件清单

| 文件 | 改动内容 |
|------|---------|
| `后端代码/server/src/utils/cost-calculator.ts` | 扩展 calculateSlideCost, calculateFeeAmount, 新增 calculateProfitability |
| `后端代码/server/src/routes/outbound-v1.1.ts` | POST /bom 嵌入ABC计算+收费匹配 |
| `后端代码/server/src/database/DatabaseManager.ts` | 新增表、ALTER语句、索引 |
| `后端代码/server/src/routes/abc-v1.1.ts` | 新增 slide-cost, profitability, fee-mapping 端点 |
| `后端代码/server/src/routes/bom-v1.1.ts` | 增加收费标准字段 |
| `前端代码/src/pages/cost/SlideCostAnalysis.tsx` | 新增：切片成本分析页 |
| `前端代码/src/pages/cost/ProfitabilityAnalysis.tsx` | 改造：三维度视图 |
| `前端代码/src/pages/bom/BOMDetailModal.tsx` | 改造：增加收费标准Tab |
| `前端代码/src/components/ui/CostWaterfall.tsx` | 新增：成本瀑布图组件 |

---

*本计划基于方案二（深度集成）设计，参考市场调研结论采用"以收费为锚点，以ABC为引擎"的混合模式。*
