# COREONE v1.2 Phase 5 性能深度审查报告

> **审查日期**: 2026-06-02
> **审查范围**: 后端 SQL 查询 + 前端渲染 + Bundle 大小
> **审查方法**: 2 个并行深度审查任务（代码走查 + 模式识别）
> **审查人**: Claude Code 自动化审查

---

## 一、审查概要

| 指标 | 数值 |
|------|------|
| 扫描后端路由文件 | 25 个 |
| 扫描前端源文件 | 180+ 个 |
| 扫描数据库表 | 37 张 |
| **发现问题总数** | **30 项** |
| P0 — 严重影响性能 | 7 项 |
| P1 — 中等性能影响 | 9 项 |
| P2 — 轻微性能影响 | 14 项 |

---

## 二、P0 级问题（严重影响性能）

### P0-PERF-01: 数据库完全缺少索引

- **位置**: `DatabaseManager.ts`（全部表）
- **类型**: 索引缺失
- **严重程度**: 🔴🔴🔴
- **问题描述**: 所有 `CREATE TABLE` 语句仅包含主键和 UNIQUE 约束，**未创建任何辅助索引**。以下高频查询字段缺少索引：
  - `materials.category_id` — 分类树/物料列表
  - `materials.supplier_id` — 供应商关联
  - `batches.material_id` + `batches.status` + `batches.remaining` — FEFO 分配核心
  - `inventory.material_id` — 库存查询核心
  - `outbound_items.outbound_id` + `outbound_items.material_id` — 出库明细/成本报表
  - `bom_items.bom_id` — BOM 明细
  - `alerts.material_id` + `alerts.type` + `alerts.status` — 预警查询
  - `projects.bom_id` — 项目-BOM 关联
- **性能影响**: 所有查询随数据量增长而线性变慢。当前测试数据量小（数十条），但实际使用数月后可能达数万条，查询时间从毫秒级升至秒级。
- **修复建议**: 在 `initializeDatabase()` 中添加索引创建：
  ```sql
  CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category_id);
  CREATE INDEX IF NOT EXISTS idx_batches_material ON batches(material_id);
  CREATE INDEX IF NOT EXISTS idx_batches_status_remaining ON batches(status, remaining);
  CREATE INDEX IF NOT EXISTS idx_batches_expiry ON batches(expiry_date);
  CREATE INDEX IF NOT EXISTS idx_inventory_material ON inventory(material_id);
  CREATE INDEX IF NOT EXISTS idx_outbound_items_outbound ON outbound_items(outbound_id);
  CREATE INDEX IF NOT EXISTS idx_outbound_items_material ON outbound_items(material_id);
  CREATE INDEX IF NOT EXISTS idx_bom_items_bom ON bom_items(bom_id);
  CREATE INDEX IF NOT EXISTS idx_alerts_material_type_status ON alerts(material_id, type, status);
  CREATE INDEX IF NOT EXISTS idx_projects_bom ON projects(bom_id);
  ```

### P0-PERF-02: inventory 列表相关子查询（每行 3 次）

- **位置**: `routes/inventory-v1.1.ts:8-15`
- **类型**: 相关子查询
- **严重程度**: 🔴🔴🔴
- **问题描述**: `getBatchSubQuery` 和 `getBatchVerifiedSubQuery` 在 SELECT 列表中被调用 3 次。inventory 列表每返回一行，SQLite 执行 3 次子查询。分页 200 条 = 600 次子查询。
- **性能影响**: 库存列表是高频访问页面，200 条/页时响应时间显著增加。
- **修复建议**: 使用 LEFT JOIN 替代子查询，或预先构建物化视图存储每个物料的最早过期批次。

### P0-PERF-03: categories 分类树 N+1 查询

- **位置**: `routes/categories-v1.1.ts:22-35`
- **类型**: N+1
- **严重程度**: 🔴🔴🔴
- **问题描述**: `buildTree` 递归中每个节点执行 `SELECT COUNT(*) FROM materials WHERE category_id = ?`。100 个节点 = 100 次查询。
- **性能影响**: 分类树加载时间随节点数线性增长。
- **修复建议**: 预先一次性 `GROUP BY category_id` 查询所有计数，构建 Map 后查表。

### P0-PERF-04: outbound 列表 N+1 查询

- **位置**: `routes/outbound-v1.1.ts:76-89`
- **类型**: N+1
- **严重程度**: 🔴🔴🔴
- **问题描述**: 先查询分页后的 `outbound_records`，然后在 `records.map()` 中对每条记录查询 `outbound_items`。分页 100 条 = 100 次子查询。
- **性能影响**: 出库列表页响应时间随分页大小线性增长。
- **修复建议**: 使用 JOIN 一次性查询，应用层按 outbound_id 分组。

### P0-PERF-05: 全成本报表无分页 + 大数据量内存计算

- **位置**: `routes/reports-v1.1.ts:262-469`
- **类型**: 大数据量 + 内存风险
- **严重程度**: 🔴🔴🔴
- **问题描述**: `GET /full-cost-by-project` 无 LIMIT，查询所有符合条件的出库记录，然后以 `as any[]` 加载到内存中进行大量聚合计算。一年数据可能数万条。
- **性能影响**: 大数据量时查询超时或 OOM。
- **修复建议**: 添加分页支持，或改为纯 SQL 聚合让数据库做分组汇总。

### P0-PERF-06: 成本分析页面一次性请求 6 个报表接口

- **位置**: `前端代码/src/pages/report/hooks/useCostAnalysisPage.ts`
- **类型**: 重复请求
- **严重程度**: 🔴🔴
- **问题描述**: `fetchData()` 页面挂载时并行请求 6 个报表接口（项目成本、分组成本、物料成本、供应商成本、趋势、全成本），即使用户只看一个 Tab。
- **性能影响**: 后端压力倍增，网络带宽浪费，首屏加载慢。
- **修复建议**: 按 Tab 懒加载，只请求当前 Tab 所需接口。

### P0-PERF-07: 物料管理页面一次性加载 99999 条数据

- **位置**: `前端代码/src/pages/master/hooks/useMaterialsPage.tsx`
- **类型**: 大数据量全量加载
- **严重程度**: 🔴🔴
- **问题描述**: `materialApi.getList({ page: 1, pageSize: 99999 })` 一次性加载几乎所有物料到 `allMaterials`。统计卡片每次渲染执行 3 次 `.filter()` 遍历全量数据。
- **性能影响**: 物料数量增长时内存占用线性增长，页面卡顿。
- **修复建议**: 统计调用独立 API；下拉选项改为服务端搜索；`stats` 用 `useMemo` 缓存。

---

## 三、P1 级问题（中等性能影响）

### P1-PERF-01: BOM 列表全表聚合

- **位置**: `routes/bom-v1.1.ts:23`
- **类型**: 全表扫描
- **严重程度**: 🟠🟠
- **问题描述**: `SELECT bom_id, COUNT(*) FROM bom_items GROUP BY bom_id` 无 WHERE 条件，全表聚合。
- **修复建议**: 只查询当前分页 BOM 的物料数量。

### P1-PERF-02: reconciliation 项目列表 N+1 × 3

- **位置**: `routes/reconciliation-v1.1.ts:72-116`
- **类型**: N+1 + 相关子查询
- **严重程度**: 🟠🟠
- **问题描述**: 对每个 project 执行 2 个相关子查询 + 1 个 BOM 查询，N 个项目 = 3N 次查询。
- **修复建议**: 相关子查询改为 JOIN + GROUP BY；循环内查询改为批量 IN 查询。

### P1-PERF-03: reconciliation 物料列表 N+1 × K

- **位置**: `routes/reconciliation-v1.1.ts`（ materials 接口）
- **类型**: N+1
- **严重程度**: 🟠🟠
- **问题描述**: 对每个 material 查询 bomUsages，再对每个 bomUsage 查询 lis_cases COUNT。
- **修复建议**: 改为批量 IN 查询。

### P1-PERF-04: alerts 生成 N+1 查询

- **位置**: `routes/alerts-v1.1.ts:91-142`
- **类型**: N+1
- **严重程度**: 🟠🟠
- **问题描述**: 对低库存/过期物料循环检查 `alerts` 表是否已有 pending 记录。1000 个物料 = 1000 次查询。
- **修复建议**: 使用 `NOT EXISTS` 或 `LEFT JOIN` 在单条 SQL 中完成插入判断。

### P1-PERF-05: supplier 批量评级 N+1 × 3

- **位置**: `routes/suppliers-v1.1.ts:134-146`
- **类型**: N+1
- **严重程度**: 🟠🟠
- **问题描述**: 对每个供应商执行 3 次独立查询。500 家供应商 = 1500 次查询。
- **修复建议**: 一次性查询所有供应商的采购/退货统计，内存中计算后批量 UPDATE。

### P1-PERF-06: 库存列表 COUNT 子查询性能差

- **位置**: `routes/inventory-v1.1.ts:40-49`
- **类型**: 复杂 COUNT
- **严重程度**: 🟠
- **问题描述**: COUNT 使用子查询 + HAVING，SQLite 需生成完整结果集再计数。
- **修复建议**: 将 HAVING 条件转化为 WHERE 条件，或应用层过滤计数。

### P1-PERF-07: 报表分组成本重复查询

- **位置**: `routes/reports-v1.1.ts:163-198`
- **类型**: 重复查询
- **严重程度**: 🟠
- **问题描述**: `cost-by-project-group` 执行两个几乎相同的六表 JOIN 查询，只是 GROUP BY 不同。
- **修复建议**: 合并为一个查询，应用层构建层级结构。

### P1-PERF-08: 前端 stats 每次渲染重新计算

- **位置**: `前端代码/src/pages/master/hooks/useMaterialsPage.tsx`
- **类型**: 重渲染
- **严重程度**: 🟠
- **问题描述**: `stats` 对象每次渲染执行 3 次 `allMaterials.filter()`。
- **修复建议**: `useMemo` 缓存。

### P1-PERF-09: 库存页面同时加载 5 组数据

- **位置**: `前端代码/src/pages/inventory/hooks/useInventoryPage.ts`
- **类型**: 瀑布请求
- **严重程度**: 🟠
- **问题描述**: 挂载时同时调用 5 个数据获取函数，其中耗尽跟踪/已耗尽记录可能不必要。
- **修复建议**: Tab 懒加载。

---

## 四、P2 级问题（轻微性能影响）

### P2-PERF-01: BOM 表单 SearchableSelect options 每次重新生成

- **位置**: `前端代码/src/pages/bom/components/BOMFormModal.tsx`
- **类型**: 重渲染
- **严重程度**: 🟡
- **问题描述**: `allMaterials.map(...)` 每次渲染创建新的 `options` 数组，导致 `SearchableSelect` 内部 `useMemo` 失效。
- **修复建议**: 父组件用 `useMemo` 缓存 options。

### P2-PERF-02: ProjectGroupCostTable Fragment 嵌套

- **位置**: `前端代码/src/pages/report/components/ProjectGroupCostTable.tsx`
- **类型**: key/Fragment
- **严重程度**: 🟡
- **问题描述**: 嵌套 Fragment 包裹多行 `<tr>`，React diff 效率降低。
- **修复建议**: 扁平化为数组渲染。

### P2-PERF-03: 入库/出库统计多次独立 COUNT

- **位置**: `routes/inbound-v1.1.ts:103-114`、`routes/outbound-v1.1.ts:95-105`
- **类型**: 多次 COUNT
- **严重程度**: 🟡
- **问题描述**: 分别执行 6 次和 5 次独立 `SELECT COUNT(*)`。
- **修复建议**: 合并为单条 SQL。

### P2-PERF-04: InventoryTable 排序未缓存

- **位置**: `前端代码/src/pages/inventory/components/InventoryTable.tsx`
- **类型**: 前端排序
- **严重程度**: 🟡
- **问题描述**: `sortedData` 和 `groupedData` 每次渲染重新计算。
- **修复建议**: `useMemo` 缓存。

### P2-PERF-05: 采购订单 COUNT 未带过滤条件

- **位置**: `routes/purchase-orders-v1.1.ts:41`
- **类型**: COUNT 不准确
- **严重程度**: 🟡
- **问题描述**: COUNT 查询未复用 WHERE 条件。
- **修复建议**: COUNT 与列表查询使用相同 WHERE。

### P2-PERF-06: 物料列表 SELECT *

- **位置**: `routes/materials.ts:30-42`
- **类型**: 字段过多
- **严重程度**: 🟡
- **问题描述**: `SELECT m.*` 选择全部字段，同时 LEFT JOIN 4 张表。
- **修复建议**: 明确列出需要的字段。

### P2-PERF-07: 设备使用记录全表聚合

- **位置**: `routes/equipment-v1.1.ts:51`
- **类型**: 全表聚合
- **严重程度**: 🟡
- **问题描述**: `SELECT equipment_id, SUM(...) FROM equipment_usage GROUP BY equipment_id` 全表聚合。
- **修复建议**: `equipment_usage.equipment_id` 添加索引。

### P2-PERF-08: reconciliation cases N+1

- **位置**: `routes/reconciliation-v1.1.ts:283-317`
- **类型**: N+1
- **严重程度**: 🟡
- **问题描述**: 对每条 case 查询 `projects`。
- **修复建议**: JOIN 一次性查询。

### P2-PERF-09: SearchableSelect 缓存失效

- **位置**: `前端代码/src/components/ui/SearchableSelect.tsx`
- **类型**: 缓存失效
- **严重程度**: 🟡
- **问题描述**: `filtered` 的 `useMemo` 因 `options` 引用不稳定而失效。
- **修复建议**: 确保父组件传入稳定的 `options` 引用。

### P2-PERF-10: CostDetailModal 重渲染

- **位置**: `前端代码/src/pages/report/components/CostDetailModal.tsx`
- **类型**: 重渲染
- **严重程度**: 🟡
- **问题描述**: `CostPieChart` 非 memo 组件，每次打开重新计算。
- **修复建议**: `React.memo` 包裹。

### P2-PERF-11: Bundle 依赖冗余

- **位置**: `前端代码/package.json`
- **类型**: Bundle 体积
- **严重程度**: 🟡
- **问题描述**: `@radix-ui/*`（25+ 个）、`framer-motion`、`embla-carousel-react`、`input-otp`、`vaul`、`react-day-picker` 等未使用或极少使用。
- **修复建议**: `vite-bundle-visualizer` 分析后移除未使用依赖。

### P2-PERF-12: CategoryTree 递归重渲染

- **位置**: `前端代码/src/pages/master/components/CategoryTree.tsx`
- **类型**: 递归重渲染
- **严重程度**: 🟡
- **问题描述**: 搜索时整棵树重新渲染。
- **修复建议**: `useMemo` 缓存 `filterMatch` 结果，或 `React.memo` 包裹 `TreeNodeItem`。

### P2-PERF-13: 仪表盘硬编码数据

- **位置**: `前端代码/src/pages/dashboard/hooks/useDashboardPage.ts`
- **类型**: 数据缺失
- **严重程度**: 🟡
- **问题描述**: `monthlyInbound`、`monthlyOutbound` 硬编码为 0，趋势图为假数据。
- **修复建议**: 补充真实统计 API。

### P2-PERF-14: 单号生成未考虑并发

- **位置**: 多个路由文件
- **类型**: 并发
- **严重程度**: 🟡
- **问题描述**: 单号生成使用 `SELECT MAX(...)` 后 `+1`，高并发时可能生成重复单号。
- **修复建议**: 使用 UUID 或数据库序列，或在事务中加锁。

---

## 五、性能影响矩阵

| 页面/功能 | 当前性能 | 数据量增长后 | 主要问题 |
|-----------|---------|-------------|---------|
| 库存列表 | ⚠️ 中 | 🔴 差 | 相关子查询 3 次/行 |
| 分类树 | ⚠️ 中 | 🔴 差 | N+1 查询 |
| 出库列表 | ⚠️ 中 | 🔴 差 | N+1 查询 |
| 全成本报表 | ⚠️ 中 | 🔴 差 | 无分页 + 内存计算 |
| 成本分析页 | 🔴 差 | 🔴 差 | 6 个并行请求 |
| 物料管理页 | 🔴 差 | 🔴 差 | 99999 条全量加载 |
| BOM 列表 | 🟡 良 | ⚠️ 中 | 全表聚合 |
| 对账项目列表 | 🟡 良 | 🔴 差 | N+1 × 3 |
| 预警生成 | 🟡 良 | 🔴 差 | N+1 查询 |
| 入库列表 | 🟢 优 | 🟡 良 | 轻微 |

---

## 六、修复优先级矩阵

### 🔴 立即修复（上线前必须）

| 序号 | 问题 | 影响 |
|------|------|------|
| 1 | 添加数据库索引 | 所有查询性能基础 |
| 2 | inventory 相关子查询改 JOIN | 库存列表核心页面 |
| 3 | categories N+1 改批量查询 | 分类树加载 |
| 4 | outbound N+1 改 JOIN | 出库列表核心页面 |
| 5 | 全成本报表加分页 | 防止 OOM |
| 6 | 成本分析按 Tab 懒加载 | 首屏加载速度 |
| 7 | 物料管理改为分页/搜索 | 大数据量卡顿 |

### 🟠 尽快修复（1-2 周内）

| 序号 | 问题 | 影响 |
|------|------|------|
| 8 | reconciliation N+1 优化 | 对账页面 |
| 9 | alerts 生成 N+1 优化 | 预警生成速度 |
| 10 | 供应商评级批量计算 | 批量操作速度 |
| 11 | 报表重复查询合并 | 报表加载速度 |
| 12 | 前端 stats useMemo 缓存 | 页面响应 |

### 🟡 后续优化

| 序号 | 问题 | 影响 |
|------|------|------|
| 13 | 入库/出库统计 COUNT 合并 | 轻微 |
| 14 | Bundle 体积优化 | 首屏加载 |
| 15 | 单号生成并发安全 | 极端并发场景 |

---

## 七、检查范围声明

本次 Phase 5 审查覆盖以下维度：

| 维度 | 检查方法 | 覆盖度 |
|------|---------|-------|
| N+1 查询 | 循环内数据库调用扫描 | 100% |
| 相关子查询 | SELECT 列表子查询扫描 | 100% |
| 索引缺失 | CREATE TABLE 语句审查 | 100% |
| 大数据量查询 | LIMIT/分页检查 | 100% |
| 前端重渲染 | useMemo/useCallback 扫描 | 关键组件 |
| 前端大数据量 | pageSize/全量加载检查 | 关键页面 |
| Bundle 大小 | package.json 依赖审查 | 100% |

**未覆盖项**: 实际性能基准测试（未运行 Lighthouse/benchmark）、内存泄漏检测（需长期运行观察）。

---

*报告生成时间: 2026-06-02*
*累计发现问题: Phase 1 (30) + Phase 2 (24) + Phase 3 (49) + Phase 4 (42) + Phase 5 (30) = 175 项*
*下一 Phase: Phase 6 — 最终验收*
