# 进度日志

## 会话：2026-05-28

### 阶段 0：调研与分析
- **状态：** complete
- **开始时间：** 2026-05-28
- 执行的操作：
  - 网络搜索免疫组化行业检测项目与 BOM 配置规范
  - 网络搜索病理科 LIS 系统成本核算方法
  - 网络搜索免疫组化抗体 Panel 临床应用指南
  - 深入走读后端核心路由代码（bom、outbound、inbound、inventory、reports、reconciliation、projects、returns、supplier-returns）
  - 深入走读前端核心组件代码（BOMFormModal、BOMDetailModal、ProjectCreateModal、CostAnalysis、useBOMPage、useProjectsPage、useCostAnalysisPage）
  - 走读数据库模型 DatabaseManager.ts
- 创建/修改的文件：
  - `findings.md` —— 调研发现汇总
  - `task_plan.md` —— 修复实施计划
  - `progress.md` —— 本文件

---

## 测试结果

| 测试 | 输入 | 预期结果 | 实际结果 | 状态 |
|------|------|---------|---------|------|
| 项目创建关联 BOM | 新建检测服务时选择已有 BOM | bom_id 保存到 projects 表 | 前后端字段已打通，待验证 | 🔄 已修复 |
| BOM 在线编辑物料 | 新建/编辑 BOM 时添加物料 | 物料保存到 bom_items | 前端已增加可编辑物料表格 | 🔄 已修复 |
| BOM 复制 materialId | 复制 BOM 时保留物料清单 | 新 BOM 物料与原 BOM 一致 | 前后端字段已统一映射 | 🔄 已修复 |
| 替代物料功能 | BOM 配置主物料+替代物料 | 出库时自动选择替代 | 代码完全未实现替代逻辑 | ❌ 失败 |
| 多批次出库 | 同一物料多个批次，出库量>单批次剩余 | 分配到多个批次，成本加权 | 只扣单批次，可致负库存 | ❌ 失败 |
| 成本报表时间筛选 | 选择时间范围查询 | 返回该时间段数据 | 始终返回全量数据 | ❌ 失败 |
| BOM 分组配置 | 编辑 BOM 时为物料填写分组 | group_name 保存到 bom_items | 前后端已支持，待验证 | 🔄 已修复 |
| 品牌池出库 | 同一分组配置 Dako+迈新，出库 | 自动在品牌池内按 FEFO 分配 | allocateGroupBatches 已实现 | 🔄 已修复 |
| 分组成本报表 | 查看"项目分组成本"Tab | 项目→分组→物料三级下钻 | 接口+前端组件已实现 | 🔄 已修复 |

---

## 错误日志

| 时间戳 | 错误 | 尝试次数 | 解决方案 |
|--------|------|---------|---------|
| 2026-05-28 | 出库只取单批次 | 1 | 重写批次分配逻辑，遍历多批次 |
| 2026-05-28 | 多批次成本不加权 | 1 | 逐批次扣减，成本加权累加 |
| 2026-05-28 | 项目不保存 bom_id | 1 | 前后端增加 bomId 字段传递 |
| 2026-05-28 | BOM 无法在线编辑物料 | 1 | 重构 BOMFormModal，增加可编辑物料表格 |
| 2026-05-29 | 分组成本报表数据关联 | 1 | 通过 project.bom_id → bom_items 动态关联获取 group_name |
| 2026-05-29 | BOMDetailModal colSpan 不匹配 | 1 | 新增分组列后同步更新 colSpan 和空行提示 |

---

## 会话：2026-05-29

### 阶段 3：功能增强（P1）
- **状态：** complete
- **设计依据**：`design-rationale-phase3.md`
- 执行的操作：
  - 数据库迁移：`bom_items.group_name` + `batches.verified`
  - 后端 `bom-v1.1.ts`：支持 groupName 读写，理论成本动态计算
  - 后端 `outbound-v1.1.ts`：新增 `allocateGroupBatches()` 品牌池分配
  - 后端 `reports-v1.1.ts`：新增 `/cost-by-project-group` 分组成本报表
  - 后端 `inventory-v1.1.ts`：库存列表返回 `batchVerified`
  - 前端类型 + useBOMPage.ts：BOMMaterial 增加 groupName
  - 前端 BOMFormModal：物料行增加分组输入框
  - 前端 BOMDetailModal：按 group 分组展示，品牌池标识
  - 前端 CostAnalysis：新增"项目分组成本"Tab + 三级下钻组件
- 编译验证：前端零错误，后端仅既有错误（categories-v1.1.ts:193）
- 创建/修改的文件：
  - `design-rationale-phase3.md` — 阶段3设计依据
  - `DatabaseManager.ts` — 数据库迁移
  - `bom-v1.1.ts` — 分组+品牌池+动态成本
  - `outbound-v1.1.ts` — 品牌池出库分配
  - `reports-v1.1.ts` — 分组成本报表接口
  - `inventory-v1.1.ts` — 批次验证字段
  - `types/index.ts` — BOMMaterial.groupName
  - `useBOMPage.ts` — groupName 支持
  - `BOMFormModal.tsx` — 分组输入
  - `BOMDetailModal.tsx` — 分组展示
  - `CostAnalysis.tsx` / `useCostAnalysisPage.ts` — 分组成本Tab
  - `ProjectGroupCostTable.tsx` — 分组成本报表组件（新建）

---

---

## 会话：2026-05-29

### 阶段 4：完善与优化（P1-P2）
- **状态：** complete
- **设计依据**：`design-rationale-phase4.md`（含行业调研与规范验证）
- 执行的操作：
  - 后端 `DatabaseManager.ts`：`return_records` 新增 `unit_cost`/`total_cost`/`batch_no`/`outbound_item_id`
  - 后端 `returns-v1.1.ts`：重写为"原发出成本追溯法"；POST 追溯最近出库批次成本，DELETE 恢复库存
  - 后端 `supplier-returns-v1.1.ts`：创建时强制绑定批次，自动填充单价；删除时恢复批次库存
  - 后端 `reports-v1.1.ts`：`/cost-by-material` 净成本 = 出库成本 - 退库成本
  - 前端 `types/index.ts`：`ReturnRecord` 新增成本字段；`SupplierReturnFormData` 新增 `batchId`
  - 前端 `OutboundDetailModal.tsx`：按物料聚合展示，支持展开批次明细，BOM出库显示成本计算说明
  - 前端 `CostDetailModal.tsx`：新增成本差异分析面板（价格差异+用量差异+管理建议）
  - 前端 `Returns.tsx`：列表增加批次号、成本金额列
  - 前端 `SupplierReturns.tsx`：创建弹窗增加批次选择，自动填充单价和建议退款金额
- 编译验证：前端零错误，后端仅既有错误（categories-v1.1.ts:193）
- 创建/修改的文件：
  - `design-rationale-phase4.md` — 阶段4设计依据（含行业规范验证）
  - `DatabaseManager.ts` — 退库成本字段迁移
  - `returns-v1.1.ts` — 原发出成本追溯法
  - `supplier-returns-v1.1.ts` — 批次绑定退货
  - `reports-v1.1.ts` — 退库成本扣除
  - `types/index.ts` — 退库类型扩展
  - `OutboundDetailModal.tsx` — 批次明细聚合
  - `CostDetailModal.tsx` — 成本差异分析
  - `Returns.tsx` — 成本列展示
  - `SupplierReturns.tsx` — 批次选择与自动填充

---

---

## 会话：2026-06-02

### 阶段 7：PM-QA-001 质量审查启动
- **状态：** in_progress
- 执行的操作：
  - 创建 `/pm-qa-001` 技能（Vibe Coding 三层防御体系）
  - 成本分析页面示范审查（VibeContract + 对抗性分析 + 回归防护）
  - 发现 7 个质量问题（QA-001 ~ QA-007），测试质量评分 54/100
  - 更新 `task_plan.md` 追加阶段 7 全功能审查计划
  - 更新 `findings.md` 追加成本分析审查结果
- 下一步：启动 Wave 1（P0 核心模块并行审查）

---

## 当前状态

| 阶段 | 状态 |
|------|------|
| 阶段1：阻塞性 BUG | ✅ 完成 |
| 阶段2：成本核算核心 | ✅ 完成 |
| 阶段3：功能增强 | ✅ 完成 |
| 阶段4：完善与优化 | ✅ 完成 |
| 阶段5：测试与验证 | ✅ 完成 |
| 阶段6：扩展BOM + ABC | ✅ 完成 |
| **阶段7：PM-QA-001 全功能审查** | **🔄 Wave 1 完成，Wave 2 待启动** |

### Wave 1 结果（5个P0模块）
- 审查模块数：5/5
- 初查发现问题总数：**70**
- 🔴 Critical: 5 | 🟠 High: 18 | 🟡 Medium: 31 | 🟢 Low: 16
- 平均测试质量评分：**51.6/100**

### Wave 1 Critical 复核结果（2026-06-02）
- **复核方法**：独立阅读源代码验证
- **复核产出**：`.claude/qa-reports/2026-06-02-wave1-critical-review.md`
- **判定统计**：5 个初查 Critical → 1 个确认、3 个误判、1 个降级
  - ✅ **确认**：bom PUT 无事务包裹（`bom-v1.1.ts:204-271`）
  - ❌ **误判**：outbound 权限（app.ts 已挂载）、inventory SQL 注入（参数化查询）、bom 认证（app.ts 已挂载）
  - ⚠️ **降级**：inbound amount 计算（字符串乘法实际安全，真正问题是缺少类型校验）
- **findings.md 已更新**：追加 8.3b 复核记录

### Wave 1 High 复核结果（2026-06-02）
- **复核产出**：`.claude/qa-reports/2026-06-02-wave1-high-review.md`
- **判定统计**：18 个初查 High → 11 个确认、2 个误判、5 个降级
  - **data-consistency（5/5 确认）**：before_stock 错误、operator 伪造（3处）、取消原因丢失
  - **security（0/5 确认）**：2 个误判（app.ts 已挂载）、3 个降级（权限更严格是合理设计）
  - **test-quality（6/8 确认）**：断言宽松、业务逻辑未验证、预警静默吞异常
- **findings.md 已更新**：追加 8.4b 复核记录

### Wave 1 Medium/Low 复核结果（2026-06-02）
- **复核产出**：已追加至 findings.md 8.5b 节
- **判定统计**：31 Medium → 22 确认、9 降级；16 Low → 14 确认、2 降级
- **关键发现**：E2E 测试质量差（~30 个二选一断言、~15 个无断言）、bom POST 也无事务、inbound PUT 不更新 amount

### Wave 2 审查结果（2026-06-02）
- **审查模块**：11 个 P1 模块（purchase-orders, alerts, returns, reconciliation, supplier-returns, equipment, labor-time, indirect-cost, stocktaking, scraps, transfers）
- **发现产出**：已追加至 findings.md 第九节
- **发现统计**：Critical 1 + High 3 + Medium 10 + Low 6 = **20 个问题**

### Wave 3 审查结果（2026-06-02）
- **审查模块**：8 个 P2 模块（categories, locations, projects, roles, users, suppliers, logs, depletion）
- **发现产出**：已追加至 findings.md 第十节
- **发现统计**：High 3 + Medium 8 + Low 5 = **16 个问题**

### Wave 4 审查结果（2026-06-02）
- **审查模块**：基础设施层（materials, auth, reports, middleware, database, app.ts）
- **发现产出**：已追加至 findings.md 第十一节
- **发现统计**：High 3 + Medium 7 + Low 4 = **14 个问题**

### 全项目审查最终统计
| 严重度 | Wave 1 | Wave 2 | Wave 3 | Wave 4 | 合计 |
|--------|--------|--------|--------|--------|------|
| 🔴 Critical | 1 | 1 | 0 | 0 | **2** |
| 🟠 High | 11 | 3 | 3 | 3 | **20** |
| 🟡 Medium | 22 | 10 | 8 | 7 | **47** |
| 🟢 Low | 14 | 6 | 5 | 4 | **29** |
| **总计** | **48** | **20** | **16** | **14** | **98** |

### 下一步建议

1. **立即修复 1 个确认 Critical**（bom 事务包裹）
2. 继续复核 18 个 High 级别问题
3. Wave 2：purchase, alerts, equipment, labor, reconciliation, returns（P1模块）
4. Wave 3：master, system, transfers（P2模块）

---

## 会话：2026-06-04

### 安全审查（安全专家代理）
- **状态：** complete
- 执行的操作：
  - 审查认证机制（JWT 实现、登录流程、Token 刷新）
  - 审查授权检查（角色权限矩阵、pathToPermission 映射）
  - 审查输入验证（SQL 注入、express-validator 覆盖率）
  - 审查敏感数据（密码加密、Token 存储、.env 安全）
  - 审查 API 安全（速率限制、CORS、helmet 配置）
- 发现漏洞：
  - CRITICAL: Token 存储在 localStorage（V1）
  - HIGH: CSP 允许 unsafe-inline（V2）、Refresh 无速率限制（V3）、Refresh Secret 确定性派生（V4）、Logout 不失效（V5）
  - MEDIUM: 输入验证仅登录有（V6）、pathToPermission 遗漏（V7）、无全局速率限制（V8）
- Blocker 状态：
  - C9（登录速率限制）：已解决
  - C10（Token localStorage）：未解决
  - H-NEW-11（Refresh 同 Secret）：部分解决
  - H-NEW-12（角色权限绕过）：低风险

---

## 会话：2026-06-11

### 项目治理方案重构
- **状态：** complete
- 执行的操作：
  - 读取并对比三份治理方案：`docs/00_Project_Governance_Framework.md`、DeepSeek 单人 PM 方案、Claude Code CLI v4 工作流手册
  - 扫描项目实际结构：前端/后端 package、README、CLAUDE/AGENTS、CI、E2E、session log、V1.1 设计资料
  - 确认当前事实：React/Vite 前端、Express/TypeScript 后端、SQLite `node:sqlite`，历史设计稿中 MySQL/Prisma/Ant Design 仅能作为参考
  - 重写 `docs/00_Project_Governance_Framework.md` 为 COREONE 专用治理方案，重点覆盖事实源优先级、最小文档体系、多 Agent 协作、测试门禁、发布治理和落地清单
- 创建/修改的文件：
  - `docs/00_Project_Governance_Framework.md`
  - `progress.md`

### 项目治理执行规划生成
- **状态：** complete
- 执行的操作：
  - 基于 `docs/00_Project_Governance_Framework.md` 生成完整治理落地执行规划
  - 将治理落地拆成 Phase 0~6：启动与基线冻结、项目接管与事实报告、核心事实文档、PRD 与验收体系、任务/缺陷/决策统一、发布门禁与归档、持续运行机制
  - 明确每个阶段的输入、执行动作、产出文档、PM 审核点、验收标准、风险控制和下一步立即执行项
- 创建/修改的文件：
  - `docs/16_Governance_Execution_Plan.md`
  - `progress.md`

### 双工作台分工更新
- **状态：** complete
- 背景：
  - PM 当前同时使用 Codex 和 VS Code Claude Code CLI + mimo 模型工作
  - 新分工：Codex 负责规划、治理文档、任务拆解、复核和定向 bug 修复；Claude Code CLI + mimo 负责大部分具体执行工作
- 执行的操作：
  - 更新 `docs/00_Project_Governance_Framework.md`，将“多 Agent 协作”明确为“Codex + Claude Code CLI/mimo 双工作台协作”
  - 更新 `docs/16_Governance_Execution_Plan.md`，为每个阶段和任务补充 Codex/mimo/PM 主责边界
  - 增加 Codex 给 mimo 的执行任务包模板、mimo 执行回执模板、Codex 复核模板
- 创建/修改的文件：
  - `docs/00_Project_Governance_Framework.md`
  - `docs/16_Governance_Execution_Plan.md`
  - `progress.md`

---

## 五问重启检查

| 问题 | 答案 |
|------|------|
| 我在哪里？ | 阶段4已完成，阶段1-4全部完成 |
| 我要去哪里？ | 阶段5：测试与验证 |
| 目标是什么？ | 确保所有修复不影响现有功能，成本数据准确 |
| 我学到了什么？ | 见 findings.md + design-rationale-phase3.md + design-rationale-phase4.md |
| 我做了什么？ | 完成阶段1-4全部代码修改，编译验证通过 |
