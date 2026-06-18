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

历史未完成项（已由后续 9.1/9.2 闭环覆盖）：

| 项目 | 当前状态 |
|---|---|
| 成本期间与关账状态机 | 已完成首版 |
| 成本重算任务 | 已完成首版 |
| 异常处理动作：resolve/ignore/retry | 已完成首版 |
| 前端异常中心和出库成本状态展示 | 已完成首版 |

### 9.1 后端闭环补充

| 项目 | 状态 | 说明 |
|---|---:|---|
| 成本期间与关账状态机 | 已完成首版 | 新增期间 API；开放 error 异常会阻止关账；已关账期间禁止重算 |
| 成本重算任务 | 已完成首版 | 新增 `cost_runs`，可对未关账期间重算并更新成本快照 |
| 异常处理动作 | 已完成首版 | 支持 resolve、ignore、retry，并写入审计日志 |
| 成本池真实动作 | 已完成首版 | sync/auto-collect/recalculate 已接入来源汇总、自动归集和重算 |
| 成本快照标准字段 | 已完成首版 | 补齐 cost_status、cost_run_id、charge_group_id、calculation_version、source_snapshot |
| 出库成本状态 | 已完成后端 | 出库记录返回 costStatus，BOM 出库成功/异常会同步状态 |

### 9.2 前端闭环与前置模块补漏

| 项目 | 状态 | 说明 |
|---|---:|---|
| 成本核算工作台 | 已完成首版 | 成本看板支持期间状态、开始归集、自动归集、执行重算、关账和最近任务展示 |
| 成本异常中心 | 已完成首版 | `/abc/alerts` 改为异常台账，支持筛选、resolve、ignore、retry |
| 出库成本状态 | 已完成前端 | 出库列表新增成本状态列，异常单可跳转到异常中心定位 |
| 前置模块补漏 | 已完成首轮 | 补齐首页 QuickAction、库存预警表格/处理弹窗、供应商 hook、设备类型表单、标准工时 hook/表单、成本瀑布图、对账 API、首页角色配置 |
| 验证 | 已完成 | 后端 build、前端 build、`cost-exceptions`、`outbound`、`abc-cost` 集成测试通过 |

### 9.3 P0 空壳接口清理

| 项目 | 状态 | 说明 |
|---|---:|---|
| ABC 基线决策记录 | 已完成 | `docs/13_Decision_Log.md` 新增 DEC-013，明确 `codex/abc-productization-phase0-1-2026-06-15` 为 ABC 产品化验收基线 |
| `/abc/export` | 已完成首版 | 返回当前期间成本汇总、明细 rows、CSV content、文件名，并写入导出审计日志 |
| `/abc/batch-trace/:batchId` | 已完成首版 | 串联批次、出库消耗、ABC 快照、库存流水和追溯汇总 |
| `/abc/variance-analysis` | 已完成首版 | 基于 ABC 快照和出库实际材料成本生成项目/月/BOM 维度差异列表和汇总 |
| 前端导出按钮 | 已完成首版 | 成本看板、切片成本、成本趋势、盈利分析、收费对照已接入 CSV 下载 |
| 验证 | 已完成 | 后端 build、前端 build、`cost-exceptions`、`outbound`、`abc-cost` 集成测试通过，新增接口被专项测试覆盖 |

### 9.4 成本池产品入口与旧库兼容

| 项目 | 状态 | 说明 |
|---|---:|---|
| 成本池页面 | 已完成首版 | 新增 `/abc/cost-pools`，展示作业中心、来源、直接/间接/总成本、动因量、动因费率、计算公式和说明 |
| 成本池导航 | 已完成 | 财务和管理员可在成本管理侧栏直接进入“成本池” |
| 成本池筛选 | 已完成 | 前端支持期间、来源、关键字筛选；后端 `GET /abc/cost-pools` 支持 `yearMonth/source/activityCenterId/keyword` |
| 成本池动作 | 已完成 | 页面支持同步来源、自动归集、重算快照；非财务/管理员不展示写操作 |
| 旧库兼容 | 已完成 | 自动归集兼容旧库 `abc_activity_centers.status = 1`，新建作业中心显式写入 `active` |
| 看板工作台指标 | 已完成 | 摘要区补齐出库数、成本快照、开放异常、未补算 |
| 看板作业结构 | 已完成 | `costByActivity` 按当月成本池汇总作业中心成本与占比，不再返回空数组 |
| 看板环比 | 已完成 | `costChange/feeChange/profitChange` 按当前月与上月 ABC 快照计算，不再固定为 0 |

### 9.5 端到端验收补齐

| 场景 | 用户 | 状态 |
|---|---|---:|
| 财务查看核算工作台 | finance | 通过 |
| 财务处理成本异常 | finance | 通过 |
| 财务归集成本池并查看动因费率公式 | finance | 通过 |
| 财务配置 BOM 收费映射并触发完整性检查 | finance | 通过 |
| 仓管出库后查看成本状态 | warehouse_manager | 通过 |
| 仓管 BOM 出库填写病例号并在详情回显 | warehouse_manager | 通过 |
| 主任查看可信成本看板且无写操作 | pathologist | 通过 |

验证命令：

| 命令 | 结果 |
|---|---:|
| `npm run build`（前端） | 通过，保留 Vite chunk size warning |
| `npm run build`（后端） | 通过 |
| `npm run test:node -- tests/integration/cost-exceptions.test.ts` | 通过，7 tests |
| `npm run test:node -- tests/integration/outbound.test.ts` | 通过，12 tests |
| `npm run test:node -- tests/integration/abc-cost.test.ts` | 通过，15 tests |
| `PLAYWRIGHT_CHROMIUM_PATH="$HOME/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" npx playwright test e2e/abc-productization.spec.ts --project=chromium --reporter=list` | 通过，7 tests |

2026-06-16 收口验证补充：

| 命令 | 结果 |
|---|---:|
| `npm run build`（后端） | 通过 |
| `npm run build`（前端） | 通过，保留 Vite chunk size warning |
| `npm run test:node -- tests/integration/bom.test.ts tests/integration/outbound.test.ts tests/integration/cost-exceptions.test.ts tests/integration/abc-cost.test.ts tests/integration/reconciliation.test.ts` | 通过，52 tests |
| `npm run test:node -- tests/integration/cost-exceptions.test.ts` | 通过，9 tests |
| `PLAYWRIGHT_CHROMIUM_PATH="$HOME/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" npx playwright test e2e/abc-productization.spec.ts --project=chromium --reporter=list` | 通过，7 tests |
| `git diff --check` | 通过 |

### 9.6 Phase 2 收费映射与病例聚合首批

| 项目 | 状态 | 说明 |
|---|---:|---|
| BOM 多收费项映射 | 已完成后端首版 | 新增 `bom_fee_mappings`，支持一 BOM 对多收费标准、数量倍率、按出库/病例聚合 |
| 映射配置 API | 已完成 | `GET/PUT /api/v1/abc/bom-fee-mappings/:bomId` |
| 映射规则预览 | 已完成 | `POST /api/v1/abc/bom-fee-mappings/:bomId/preview` 返回收费拆分、总收费、利润 |
| 病例级收费聚合 | 已完成后端首版 | 新增 `case_charge_groups`，按病例/月/收费标准累计数量并计算阶梯/封顶总额 |
| 出库成本快照 | 已完成补充 | BOM 出库支持 `caseNo`，快照保存 `case_no`、`charge_group_id`、`feeBreakdown` |
| 验证 | 已完成 | `cost-exceptions` 新增病例聚合阶梯收费测试，后端/前端 build 和相邻集成/E2E 均通过 |

### 9.7 Phase 2 收费映射配置与完整性检查

| 项目 | 状态 | 说明 |
|---|---:|---|
| 映射完整性审计 API | 已完成 | 新增 `GET /api/v1/abc/bom-fee-mappings/audit`，支持关键字、状态、分页和汇总 |
| 未映射 BOM 异常入库 | 已完成 | 新增 `POST /api/v1/abc/bom-fee-mappings/audit`，缺映射 BOM 写入 `missing_fee_mapping` 成本异常，补齐后再次审计自动关闭 |
| 出库即时缺映射异常 | 已完成 | BOM 出库遇到无收费映射时仍成功出库，但成本状态为 `cost_exception`，并写入 `missing_fee_mapping` 待处理异常 |
| 收费映射配置页 | 已完成首版 | 新增 `/abc/fee-mappings`，财务可查看映射状态、触发完整性检查、编辑多收费项和预览收费拆分 |
| 草稿规则预览 | 已完成 | `/preview` 支持传入未保存映射草稿，前端可在保存前验证收费构成 |
| 角色与导航 | 已完成 | 成本管理侧栏新增“收费映射”，管理员、财务及只读成本角色路径已补齐 |
| 验证 | 已完成 | 后端 build、前端 build、`cost-exceptions` 7 tests、`outbound + abc-cost` 26 tests、ABC E2E 6 tests |

### 9.8 病例号前端采集与仓管只读主数据

| 项目 | 状态 | 说明 |
|---|---:|---|
| BOM 出库病例号采集 | 已完成 | 出库登记选择 BOM 后显示病例号输入框，提交 `/outbound/bom` 时传递 `caseNo` |
| 出库详情病例回显 | 已完成 | 出库详情展示病例号和样本数，便于核对病例级收费聚合依据 |
| 仓管主数据只读权限 | 已完成 | `warehouse_manager` 可读取项目/BOM 供出库选择，BOM/项目写入仍仅 admin |
| 权限文档 | 已完成 | 更新 `docs/05_Role_Permission_Matrix.md` 的仓管职责和项目/BOM API 读权限 |
| 验证 | 已完成 | 后端 build、前端 build、`outbound` 12 tests、`abc-cost` 15 tests、`cost-exceptions` 7 tests、ABC E2E 7 tests |

### 9.9 BOM 来源快照首版

| 项目 | 状态 | 说明 |
|---|---:|---|
| BOM 来源快照 | 已完成首版 | BOM 出库与重算写入 `source_snapshot.bomSnapshot`，保存当时 BOM code/name/version/type、支持样本数、服务/收费字段和更新时间 |
| 用量来源快照 | 已完成首版 | 快照包含 `bom_items`、通用试剂、通用耗材、质控品的物料编码、规格、单位、用量、分组和分摊方式 |
| 收费映射来源 | 已完成首版 | 快照包含当前多收费项映射或旧字段 fallback，便于解释当次收费拆分的规则来源 |
| 回归覆盖 | 已完成 | `outbound.test.ts` 断言 BOM 出库后的 ABC 快照保留 BOM 版本和用量来源 |

### 9.10 BOM 版本表与版本差异首版

| 项目 | 状态 | 说明 |
|---|---:|---|
| BOM 版本表 | 已完成首版 | 新增 `bom_versions`，创建 BOM 写入 v1.0 快照，更新 BOM 写入自增版本快照 |
| 版本快照 | 已完成首版 | 快照保存 BOM 基本字段、标准成本、物料明细、通用试剂/耗材、质控品、设备模板 |
| 版本差异摘要 | 已完成首版 | 后端生成字段变更、物料新增/移除、物料用量调整的结构化 diff 和中文摘要 |
| 生效范围选择 | 已完成后端首版 | BOM 更新支持 `future_only` / `retroactive`，版本历史保存选择结果 |
| 历史影响统计 | 已完成后端首版 | 更新 BOM 时返回受影响历史出库数、月份、期间状态和可重算月份数 |
| 追溯自动重算 | 已完成首版 | 选择 `retroactive` 后自动对未关账受影响月份创建 `bom_retroactive_recalculate` 任务，并把相关 ABC 快照标记为 `recalculated` |
| 前端历史展示 | 已完成首版 | BOM 详情的版本历史显示当前版本、变更摘要、操作人、生效范围、关键物料用量变化和影响出库数 |
| 回归覆盖 | 已完成 | `bom.test.ts` 覆盖 v1.0/v1.1/v1.2 快照、名称变更、物料用量差异、追溯选择、自动重算任务和历史影响返回 |
| 关账后调整单 | 已完成首版 | 已关账期间继续禁止重算，但可创建调整单；审核通过后进入看板调整额、调整后利润和 ABC 导出 |
| 病例阶梯历史回放 | 已完成首版 | 取消非最新历史出库后，会按病例、月份、收费标准重排剩余 ABC 明细 |

### 9.11 病例聚合取消回退

| 项目 | 状态 | 说明 |
|---|---:|---|
| 出库取消回退病例聚合 | 已完成首版 | 删除/取消 BOM 出库时，先根据该出库 ABC 快照里的病例级收费项回退 `case_charge_groups`，再清理 ABC 明细 |
| 阶梯收费回算 | 已完成首版 | 回退后按病例收费组的历史规则快照重新计算 `total_fee`，避免只按本次增量金额相减导致阶梯收费失真 |
| 非最新历史单重排 | 已完成首版 | 取消中间出库后，剩余同病例明细会重算 `fee_amount`、`profit`、`profit_rate` 和来源快照里的收费拆分 |
| 回归覆盖 | 已完成 | `cost-exceptions.test.ts` 覆盖无映射出库即时异常、同病例两笔取消最新一笔，以及三笔取消中间一笔后的阶梯金额重排 |

### 9.12 对账差异异常化首版

| 项目 | 状态 | 说明 |
|---|---:|---|
| 项目物料差异审计 | 已完成后端首版 | 新增 `POST /reconciliation/projects/:id/materials/audit`，复用理论用量和实际出库差异计算 |
| 成本异常联动 | 已完成首版 | warn/danger 差异写入 `cost_exceptions` 的 `reconciliation_variance`；danger 作为 error 级异常参与关账阻断 |
| 异常恢复 | 已完成首版 | 差异恢复为 match 后再次审计会自动关闭对应开放异常 |
| 前端入口 | 已完成首版 | `/reconciliation` 页面恢复路由，项目展开后可触发“审计差异” |
| 对账导出 | 已完成首版 | 新增 `/reconciliation/export`，按项目/物料/病例/日志导出 CSV；页面“导出报表”按当前 Tab 下载 |
| 前端 API | 已完成 | `reconciliationApi.auditProjectMaterials`、`reconciliationApi.exportData` 已封装 |
| 回归覆盖 | 已完成 | `reconciliation.test.ts` 覆盖差异写入异常、恢复后自动关闭和导出非空 CSV |
| LIS 病例进入标准出库 | 已完成首版 | BOM 出库支持只传 `caseNo` 反查 LIS 病例并自动带出项目/BOM；出库表单可选择 LIS 病例自动填入病例号、项目、BOM 和样本数 |

### 9.13 关账后调整单首版

| 项目 | 状态 | 说明 |
|---|---:|---|
| 调整单表 | 已完成首版 | 新增 `abc_cost_adjustments`，与既有季度间接成本调整表隔离 |
| 关账约束 | 已完成 | 已关账期间继续禁止重算；只有已关账期间可以创建调整单 |
| 审核流 | 已完成首版 | 调整单支持 pending / approved / rejected，审核动作写入审计日志 |
| 看板联动 | 已完成首版 | 成本看板显示调整额、待审调整、调整后利润，并提供创建和审核入口 |
| 导出联动 | 已完成首版 | ABC 导出包含调整单区段和调整后汇总 |
| 回归覆盖 | 已完成 | `cost-exceptions.test.ts` 覆盖已关账禁止重算、调整单创建/审核、看板汇总、导出和审计日志 |

### 9.14 LIS 病例进入标准出库流程首版

| 项目 | 状态 | 说明 |
|---|---:|---|
| 后端病例反查 | 已完成首版 | `POST /outbound/bom` 支持 `caseNo + sampleCount`，从 `lis_cases` 反查项目并使用项目 BOM |
| 防错校验 | 已完成 | 显式传入 BOM 时校验 BOM 与项目配置一致 |
| 来源留痕 | 已完成首版 | 出库记录、ABC 明细和 `source_snapshot.lisCaseId` 保留病例链路 |
| 前端入口 | 已完成首版 | 出库表单新增 LIS 病例选择器，自动带入病例号、项目、BOM 和样本数 |
| 回归覆盖 | 已完成 | `outbound.test.ts` 覆盖只传 LIS 病例号进入标准 BOM 出库流程 |
