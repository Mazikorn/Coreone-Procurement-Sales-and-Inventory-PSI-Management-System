# ABC 成本核算产品化 Phase 0/1 执行拆解

> 日期：2026-06-15
> 来源：`docs/ABC成本核算产品化诊断与重构建议.md`
> 范围：Phase 0 基线统一 + Phase 1 核算底座
> 原则：先让 ABC 成本核算“可信、可恢复、可审计”，再扩展更多分析页面

---

## 1. 执行目标

本阶段不追求一次性完成所有 ABC 分析页面，而是先解决两个基础问题：

1. 当前主目录和 worktree 的 ABC 实现不一致，必须先统一目标实现。
2. 出库、成本计算、异常、重算、期间状态之间缺少核算底座，必须先补闭环。

完成后，系统至少应满足：

```text
BOM 出库成功
→ 成本计算成功则写入成本快照
→ 成本计算失败则写入异常台账
→ 财务可按期间查看异常
→ 配置修复后可对未关账期间补算
```

---

## 2. Phase 0：基线统一

### ABC-P0-001 确认目标实现来源

| 项目 | 内容 |
|---|---|
| 背景 | 当前主目录 import `abc-v1.1.js`，但主目录缺少 `abc-v1.1.ts` 和 `cost-calculator.ts`；完整实现存在于 `.worktrees/master-aligned-integration-2026-06-15` |
| 目标 | 明确以哪个分支/工作树作为 ABC 产品化基线 |
| 产出 | 一条决策记录，写入 `docs/13_Decision_Log.md` 或新建专题决策文档 |
| 验收 | 后续所有 ABC 改动只基于同一个目标工作树 |

建议决策：以 `.worktrees/master-aligned-integration-2026-06-15` 中的 ABC 文件作为候选基线，但合入前必须通过构建和 smoke test。

### ABC-P0-002 补齐目标分支缺失文件

| 项目 | 内容 |
|---|---|
| 目标文件 | `后端代码/server/src/routes/abc-v1.1.ts`、`后端代码/server/src/utils/cost-calculator.ts` |
| 风险 | 直接复制可能覆盖另一个会话的变更 |
| 做法 | 先 diff worktree 与主目录，再按文件级补齐 |
| 验收 | `后端代码/server/src/app.ts` 的 ABC import 能解析 |

### ABC-P0-003 构建和 smoke test

| 测试 | 通过标准 |
|---|---|
| 后端 TypeScript 构建 | 无缺失模块错误 |
| 后端启动 | `/api/health` 返回 ok |
| ABC 路由 | `/api/v1/abc/dashboard` 在授权下返回结构化数据 |
| 出库接口 | BOM 出库不因 ABC 文件缺失崩溃 |

### ABC-P0-004 标记空壳接口

| 接口 | 当前风险 | 处理 |
|---|---|---|
| `/abc/export` | 返回 `{ url: null }` | MVP 前不得标记为已完成 |
| `/abc/batch-trace/:batchId` | 返回空列表 | 标记为 P1 或实现 |
| `/abc/variance-analysis` | 返回空结构 | 标记为 P1 或实现 |
| `/abc/cost-pools/sync` | 返回 OK 但不归集 | Phase 1 必须实现真实动作 |

---

## 3. Phase 1：核算底座

### ABC-P1-001 新增成本期间对象

| 字段 | 说明 |
|---|---|
| `id` | 主键 |
| `year_month` | 核算月份，如 `2026-06` |
| `status` | `open`、`collecting`、`calculated`、`reviewed`、`closed`、`adjusted` |
| `started_at` | 开始核算时间 |
| `closed_at` | 关账时间 |
| `closed_by` | 关账人 |
| `remark` | 备注 |

API 建议：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/abc/periods` | 查询期间列表 |
| POST | `/abc/periods` | 创建或打开期间 |
| POST | `/abc/periods/:id/start-collection` | 开始成本池归集 |
| POST | `/abc/periods/:id/close` | 关账 |

验收：

- 可创建当月期间。
- 已关账期间禁止直接重算。
- 期间状态变化写入审计日志。

### ABC-P1-002 新增成本异常台账

| 字段 | 说明 |
|---|---|
| `id` | 主键 |
| `year_month` | 成本月份 |
| `source_type` | `outbound`、`bom`、`fee_mapping`、`cost_pool` |
| `source_id` | 来源记录 ID |
| `exception_type` | `missing_fee_mapping`、`missing_driver_rate`、`calculation_failed`、`missing_price` |
| `severity` | `info`、`warning`、`blocking` |
| `status` | `open`、`resolved`、`ignored` |
| `message` | 展示给用户的原因 |
| `detail` | JSON 明细 |
| `resolved_by` | 处理人 |
| `resolved_at` | 处理时间 |

API 建议：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/abc/exceptions` | 异常列表 |
| POST | `/abc/exceptions/:id/resolve` | 标记已处理 |
| POST | `/abc/exceptions/:id/ignore` | 有理由地忽略 |

验收：

- ABC 计算失败不再只写 console。
- 出库成功但成本失败时，异常中心能看到记录。
- 异常处理写入审计日志。

### ABC-P1-003 标准化成本快照

当前 `outbound_abc_details` 可作为基础，但需补齐产品字段。

建议字段：

| 字段 | 说明 |
|---|---|
| `cost_status` | `costed`、`pending_cost`、`cost_exception`、`recalculated` |
| `cost_run_id` | 关联核算任务 |
| `case_no` | 病例号，支持病例级收费聚合 |
| `charge_group_id` | 收费聚合组 |
| `calculation_version` | 计算版本 |
| `source_snapshot` | 当时 BOM、费率、收费规则摘要 |

验收：

- 一条 BOM 出库至少有一个成本快照或异常记录。
- 快照可解释使用了哪个 BOM、哪个费率、哪个收费规则。

### ABC-P1-004 实现成本重算任务

新增 `cost_runs`：

| 字段 | 说明 |
|---|---|
| `id` | 主键 |
| `year_month` | 重算月份 |
| `run_type` | `initial`、`recalculate`、`adjustment` |
| `status` | `pending`、`running`、`completed`、`failed` |
| `started_by` | 发起人 |
| `started_at` | 开始时间 |
| `finished_at` | 结束时间 |
| `summary` | JSON 汇总 |

API 建议：

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/abc/cost-runs` | 创建核算/重算任务 |
| GET | `/abc/cost-runs` | 查看任务列表 |
| GET | `/abc/cost-runs/:id` | 查看任务详情 |

验收：

- 可对未关账期间重算。
- 重算后更新成本快照状态。
- 失败时生成异常。

### ABC-P1-005 让成本池动作真实化

当前 `sync/auto-collect/recalculate` 不应只返回 OK。

最低要求：

| 动作 | 真实行为 |
|---|---|
| `sync` | 从人工、设备、间接成本模块拉取当月费用来源 |
| `auto-collect` | 按作业中心生成成本池费用明细 |
| `recalculate` | 生成动因费率并触发成本重算任务 |

验收：

- 成本池页面能看到费用来源。
- 费率有公式和来源：`driver_rate = cost_pool_amount / driver_quantity`。
- 费率变化能触发重算。

---

## 4. 前端最小改造

### ABC-FE-001 成本核算工作台

最小页面元素：

| 区块 | 内容 |
|---|---|
| 期间选择 | 月份、状态、关账状态 |
| 汇总卡片 | 出库数、成本快照数、异常数、未补算数 |
| 操作按钮 | 开始归集、执行核算、关账 |
| 异常提醒 | P0 异常列表入口 |

### ABC-FE-002 异常中心

最小页面元素：

| 区块 | 内容 |
|---|---|
| 筛选 | 月份、异常类型、状态、严重度 |
| 表格 | 来源、原因、影响、状态、处理人 |
| 操作 | 查看详情、标记已处理、忽略、触发补算 |

### ABC-FE-003 出库成本状态展示

在出库列表和详情中展示：

| 字段 | 示例 |
|---|---|
| 成本状态 | 已核算、待补算、计算异常 |
| ABC 总成本 | 123.45 |
| 收费金额 | 300.00 |
| 利润 | 176.55 |
| 异常入口 | 查看异常 |

---

## 5. 测试要求

### 单元测试

| 测试 | 说明 |
|---|---|
| 成本失败生成异常 | 模拟缺费率/缺映射 |
| 期间状态机 | closed 后禁止直接重算 |
| 重算任务状态 | success/failure 都有记录 |
| 动因费率计算 | 金额、动因量、舍入规则正确 |

### 集成测试

| 测试 | 主路径 |
|---|---|
| 出库成功 + 成本成功 | 创建出库，生成成本快照 |
| 出库成功 + 成本失败 | 创建出库，生成异常 |
| 修复配置 + 补算 | 异常关闭，快照更新 |
| 月末关账 | 期间状态变 closed，禁止重算 |

### E2E 测试

| 场景 | 用户 |
|---|---|
| 财务查看核算工作台 | finance |
| 财务处理成本异常 | finance |
| 仓管出库后查看成本状态 | warehouse_manager |
| 主任查看可信成本看板 | pathologist |

---

## 6. 建议开发顺序

| 顺序 | 任务 |
|---:|---|
| 1 | 确认目标 worktree/分支并补齐缺失 ABC 文件 |
| 2 | 后端新增成本期间、异常、重算任务基础表 |
| 3 | 改造出库 ABC try-catch，失败写异常台账 |
| 4 | 实现异常列表 API 和成本期间 API |
| 5 | 实现成本核算工作台和异常中心最小页面 |
| 6 | 将 `cost-pools/recalculate` 接到真实重算任务 |
| 7 | 补单元和集成测试 |
| 8 | 再改 Dashboard/切片成本/导出 |

---

## 7. 暂不进入本批的任务

| 任务 | 原因 |
|---|---|
| 成本预测 | 需要历史稳定数据 |
| 质量成本完整 ISO 体系 | 产品范围过大，适合 P1/P2 |
| 供应商成本优化建议 | 依赖采购和质量维度 |
| 人员效率排行榜 | 需要人员工时真实采集 |
| 复杂批次追溯图谱 | 可先保留简单追溯 |

---

## 8. 开发前必须确认

1. 本轮 ABC 产品化是否以 `.worktrees/master-aligned-integration-2026-06-15` 为基线。
2. 是否允许把 ABC 计算失败从“console 记录”升级为“异常台账记录”。
3. 病例号是否已经存在稳定来源；如果没有，MVP 是否允许先用项目出库批次作为临时收费聚合组。
4. 月度关账是否由 finance 执行，admin 是否可强制解锁。
5. 导出格式优先 Excel，PDF 后置。

---

## 9. 2026-06-15 执行记录

已完成首批代码落地：

| 项目 | 状态 | 说明 |
|---|---:|---|
| Phase 0 基线补齐 | 已完成 | 当前分支缺失的后端运行基线文件已从 `.worktrees/master-aligned-integration-2026-06-15` 补齐 |
| 成本异常台账 | 已完成首版 | 新增 `cost_exceptions` 表、索引和写入工具 |
| 出库异常写入 | 已完成首版 | 扩展物料跳过写入 warning；ABC 计算/详情写入失败写入 error |
| ABC 异常查询 | 已完成首版 | 新增 `/api/v1/abc/exceptions`，并在 dashboard `alerts` 暴露开放异常 |
| 旧库兼容 | 已完成首版 | 补齐收费标准和成本池旧表迁移，成本池接口兼容直接成本/间接成本/动因率 |
| 验证 | 已完成 | `npm run build`、新增异常台账测试、出库/ABC 相邻集成测试均通过 |

仍未完成：

| 项目 | 后续批次 |
|---|---|
| 成本期间与关账状态机 | Phase 1 下一批 |
| 成本重算任务 | Phase 1 下一批 |
| 异常处理动作：resolve/ignore/retry | Phase 1 下一批 |
| 前端异常中心和出库成本状态展示 | 前端最小改造批次 |
