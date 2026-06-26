# COREONE 分支移植到 master — 集成诊断与分阶段计划

> 2026-06-25。目标：把 `codex/abc-productization-phase0-1-2026-06-15`（下称"本线"）的工作移植到真实 `origin/master`。
> 结论先行：**两线无共同 git 历史（并行 fork）**，不能直接 PR/merge；需按子系统**分阶段移植 + 逐文件协调**。这是一个多阶段集成工程，非单次 PR。

## 1. 结构性事实

| 项 | 值 |
|----|----|
| 本线根提交 | `cc8659c` rebuild local baseline from workspace snapshot（孤儿快照根） |
| master 根提交 | `bfa5184` COREONE v1.1.0（真实项目根） |
| 共同祖先 | **无**（merge-base 为空）→ 两棵不相关的树 |
| 两树文件差异总数 | **1424**（939 A / 102 D / 307 M / ~80 R） |
| 其中生产源码(.ts/.tsx，非测试) | **271**：93 A（仅本线）/ 10 D（仅 master）/ 157 M（双方都改）/ 11 R |

> "ahead 235 / behind 131" 是两棵无关树的对比假象，不是从共同点的分叉。

## 2. 三类源码

### 2.1 A — 仅本线有（93，可基本无冲突地新增到 master）
本线的**独有价值**，master 完全没有：
- **ABC 成本子系统（皇冠明珠）**：后端 `routes/abc-v1.1.ts`、`cost-adjustment-v1.1.ts`、`utils/cost-calculator.ts`、`closing-readiness.ts`（14 个 utils）；前端 `pages/cost/`（19）、`cost-center/`（4）、`labor/`（4）、`equipment/`（8 含设备折旧）。
- 关键：这些是 master 没有的，新增不会覆盖 master 工作（但部分依赖下列 M 共享文件）。

### 2.2 D — 仅 master 有（10，移植时**必须保留，勿删**）
master 比本线新增/保留的文件——本线移植**不得删除**：
- `components/layout/AppLayout.tsx`、`pages/bom/BOM.tsx` + `BOMBatchDeleteModal`/`BOMImportModal`、`reconciliation/components/MaterialSummaryTab.tsx`、`report/components/CostDetailModal.tsx` + `report/hooks/useCostAnalysisPage.ts`。
- **`dashboard/components/AlertPanel.tsx`、`CategoryDistribution.tsx`、`SimpleBarChart.tsx`** —— ⚠️ 本线 P2 曾把这三个当"死代码"删除，但 **master 仍保留**。移植时**不得照搬该删除**（master 上它们可能在用）。

### 2.3 M — 双方都改（157，**逐文件协调**，最难）
冲突热区（两线对同一文件各有改动，无共同基线→需人工三方式合并）：
`master`(29) · 后端`routes`(23) · `inventory`(21) · `system`(14) · `inbound`(10) · `reconciliation`(8) · `bom`(8) · `alerts`(7) · `outbound`(6) · `dashboard`(4) …
- 含 `DatabaseManager.ts`、`app.ts`、`outbound/inbound/depletion/reconciliation-v1.1.ts`、`middleware`、`types/index.ts`、`supplier-returns`、`transfers` 等。
- master 这一侧的 131 commit 在这些文件里实现了**供应商退货模块、84 前端单测、E2E CI 拆分/修复、Docker 部署、outbound 后端过滤/导出打印**等——与本线的审计修复/polish **大量重叠**，很多本线改动可能已被 master 以不同方式实现（冗余）或冲突。

## 3. 分阶段移植计划（建议次序：价值高→冲突低 优先）

### Phase 1 — ABC 成本子系统（推荐先做：master 完全没有，最additive、最自洽）
1. 从 `origin/master` 新建集成分支 `integrate/abc-onto-master`。
2. 直接加入 2.1 的 93 个 A 文件（ABC 前后端）。
3. **协调注入** ABC 对共享 M 文件的改动：`DatabaseManager.ts`（ABC schema/表/迁移）、`outbound-v1.1.ts`/`depletion-v1.1.ts`/`reconciliation-v1.1.ts`（成本写入/对账接线）、`app.ts`（路由注册）、`types/index.ts`（ABC 类型）——取 master 版本为底，**仅叠加 ABC 相关增量**，不回退 master 的并行改动。
4. 跑后端 ABC 套件（黄金/高间接/拟真 + 全量回归）+ 前端 cost 单测 + vite build。
5. 重新加回 `.github/workflows/abc-accuracy.yml`（需 `workflow` scope）。

### Phase 2 — 非 ABC 基础审计修复（P0/P1）逐项 triage
- master 的 131 commit 也修过 outbound/inbound/supplier-returns 等；本线 6 P0 + 17 P1 需**逐项判断**：master 是否已修（→跳过）、修法是否不同（→协调）、本线独有（→移植）。
- 这是冲突最密集的部分，需按模块逐一核。

### Phase 3 — Polish 逐项 re-apply
- toast 去重 / 日志 Link / OutboundFormModal 拆分 / react-query 卸载：在 master 当前代码上重做（master 可能已不同）。
- **跳过** 2.2 警示的删除（AlertPanel 等）。

## 4. 风险与现实评估
- 这是**多阶段、多会话**的集成工程，不是一次 PR。157 个冲突文件需逐一协调。
- Phase 1（ABC）最自洽、价值最高，建议先做并单独成 PR（基于真 master，有共同历史→可正常 PR/评审）。
- Phase 2/3 因与 master 并行工作大量重叠，需要按模块谨慎核对，避免回退 master 的新功能（供应商退货模块、84 单测等）。
- 已推送的本线分支 `origin/codex/abc-productization-phase0-1-2026-06-15`（已剥离 abc-accuracy.yml）保持原样作参照，不影响 master。
