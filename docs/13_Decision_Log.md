# COREONE 决策日志

> **版本**: 1.0.0
> **创建日期**: 2026-06-11
> **依据来源**: `.claude/session-log/`、`docs/04_Business_Rules.md`、`docs/05_Role_Permission_Matrix.md`、项目历史文档
> **维护者**: Codex（AI 记录，PM 确认）

---

## 决策记录格式

| 字段 | 说明 |
|------|------|
| 决策编号 | DEC-{序号} |
| 日期 | 决策日期 |
| 背景 | 为什么需要这个决策 |
| 选项 | 考虑过的方案 |
| 结论 | 最终选择 |
| 影响 | 对系统/开发/用户的影响 |
| 确认人 | PM / Codex / mimo |

---

## 已确认决策

### DEC-001 技术栈选择

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-001 |
| 日期 | 2026-04 |
| 背景 | 系统需要选择前端、后端、数据库技术栈 |
| 选项 | (A) React + Express + SQLite (B) Vue + Nest.js + PostgreSQL (C) React + Express + MySQL |
| 结论 | 选择 (A) React 18 + TypeScript + Vite 前端，Node.js + Express + TypeScript + SQLite 后端 |
| 影响 | SQLite 不支持高并发写入，单 worker E2E；但部署简单，无需额外数据库服务 |
| 确认人 | PM |

---

### DEC-002 数据库选择 SQLite 而非 MySQL

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-002 |
| 日期 | 2026-04 |
| 背景 | 旧技术设计文档（TECH-SPEC-v1.1.md）中指定 MySQL + Prisma |
| 选项 | (A) MySQL + Prisma (B) SQLite + node:sqlite |
| 结论 | 选择 SQLite，使用 Node.js 内置 `node:sqlite`/`DatabaseSync`，不使用 ORM |
| 影响 | 部署更简单，无需数据库服务；但并发写入受限，需 `BEGIN IMMEDIATE` 事务 |
| 确认人 | PM |

---

### DEC-003 UI 框架选择 Radix UI + Tailwind

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-003 |
| 日期 | 2026-04 |
| 背景 | 旧设计稿中使用 Ant Design |
| 选项 | (A) Ant Design (B) Radix UI + Tailwind CSS (C) shadcn/ui |
| 结论 | 选择 Radix UI Primitives + Tailwind CSS 3.4 + class-variance-authority |
| 影响 | 更轻量，样式更可控，与设计稿 HTML 原型一致 |
| 确认人 | PM |

---

### DEC-004 角色体系 6 角色

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-004 |
| 日期 | 2026-04 |
| 背景 | 需要定义系统角色和权限 |
| 选项 | (A) 3 角色（管理员/操作员/查看者） (B) 6 角色 (C) 自定义角色 |
| 结论 | 选择 6 固定角色：admin, warehouse_manager, technician, pathologist, procurement, finance |
| 影响 | 角色固定在代码中，新增角色需修改代码和前端权限映射 |
| 确认人 | PM |

---

### DEC-005 E2E 测试单 Worker

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-005 |
| 日期 | 2026-06 |
| 背景 | E2E 测试并发运行时出现 ECONNRESET 错误 |
| 选项 | (A) 多 worker (B) 单 worker (C) 每个测试独立数据库 |
| 结论 | 选择单 worker (`workers: 1`)，避免 SQLite 写锁 |
| 影响 | E2E 测试速度较慢，但稳定性高 |
| 确认人 | PM |

---

### DEC-006 批次分配策略 FEFO

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-006 |
| 日期 | 2026-04 |
| 背景 | 出库时需要决定从哪个批次扣减 |
| 选项 | (A) FIFO 先入先出 (B) FEFO 先到期先出 (C) LIFO 后入先出 |
| 结论 | 选择 FEFO（先到期先出），按 `expiry_date ASC, created_at ASC` 排序 |
| 影响 | 优先使用即将过期的批次，减少浪费 |
| 确认人 | PM |

---

### DEC-007 软删除策略

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-007 |
| 日期 | 2026-04 |
| 背景 | 业务数据不应物理删除 |
| 选项 | (A) 物理删除 (B) 软删除 is_deleted 字段 (C) 归档到历史表 |
| 结论 | 选择软删除，`is_deleted = 1` 标记 |
| 影响 | 查询需加 `WHERE is_deleted = 0`，数据量持续增长 |
| 确认人 | PM |

---

### DEC-008 退库成本追溯方式

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-008 |
| 日期 | 2026-05 |
| 背景 | 退库时需要确定退库成本 |
| 选项 | (A) 固定成本 (B) 加权平均价 (C) 原发成本追溯 |
| 结论 | 选择原发成本追溯法：按出库时间倒序查找最近的出库记录，取其 unit_cost |
| 影响 | 退库成本与原出库成本一致，成本核算更准确 |
| 确认人 | PM |

---

### DEC-009 BOM 版本管理方式

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-009 |
| 日期 | 2026-05 |
| 背景 | BOM 修改后需要版本控制 |
| 选项 | (A) 无版本控制 (B) 自动递增次版本号 (C) 手动版本管理 |
| 结论 | 选择自动递增次版本号：创建 v1.0，编辑时 v1.0 → v1.1 → v1.2 |
| 影响 | 历史版本不保留，仅当前版本有效 |
| 确认人 | PM |

---

### DEC-010 盘点差异处理方式

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-010 |
| 日期 | 2026-05 |
| 背景 | 盘点实盘数量与系统库存不一致时如何处理 |
| 选项 | (A) 增量调整 (B) 覆盖式更新 (C) 需要审批 |
| 结论 | 选择覆盖式更新：`inventory.stock = actualStock` |
| 影响 | 盘点后库存直接设为实盘值，差异不可逆 |
| 确认人 | PM |

---

### DEC-011 双工作台协作模式

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-011 |
| 日期 | 2026-06-11 |
| 背景 | 需要明确 Codex 和 Claude Code CLI/mimo 的分工 |
| 选项 | (A) 单工作台 (B) 双工作台分工 (C) 多 Agent 并行 |
| 结论 | 选择双工作台：Codex 负责规划/治理/复核，mimo 负责主要代码执行 |
| 影响 | 避免重复修改和覆盖，任务包驱动开发 |
| 确认人 | PM |

---

### DEC-012 治理文档结构

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-012 |
| 日期 | 2026-06-11 |
| 背景 | 项目文档分散，需要统一治理 |
| 选项 | (A) 全部放根目录 (B) 全部放 docs/ (C) 核心 8 份 + 自动 5 份 + 归档 |
| 结论 | 选择 (C)：核心 8 份由 PM+AI 维护，自动 5 份由 AI 生成，历史资料归档 |
| 影响 | PM 只需维护核心文档，AI 自动补充执行管理文档 |
| 确认人 | PM |

### DEC-013 ABC 产品化基线分支

| 字段 | 内容 |
|------|------|
| 决策编号 | DEC-013 |
| 日期 | 2026-06-15 |
| 背景 | ABC 成本核算产品化启动时，主目录、治理分支和集成 worktree 中 ABC 后端文件与成本计算工具不一致，直接继续开发会导致验收口径漂移 |
| 选项 | (A) 继续在治理分支上修补 (B) 以 `.worktrees/master-aligned-integration-2026-06-15` 的 ABC 文件为候选基线后迁移到独立分支 (C) 回滚 ABC 路由注册 |
| 结论 | 选择 (B)：以集成 worktree 中可构建的 ABC 实现作为候选基线，迁移到独立分支 `codex/abc-productization-phase0-1-2026-06-15` 后继续 Phase 0/1 产品化 |
| 影响 | 后续 ABC 成本期间、异常台账、重算任务、成本池归集、前端工作台等改动均以该独立分支为唯一验收基线，不再混入治理文档分支 |
| 确认人 | PM / Codex |

---

## 2026-06-16 PR #1 合并判断快照

| 项目 | 事实 |
|------|------|
| PR | #1 `fix(integration): prepare master-aligned COREONE PR` |
| 分支 | `codex/master-aligned-integration-2026-06-15` |
| 当前状态 | Ready for review，OPEN，非 Draft |
| Head SHA | `d97efa991fee4797a7ccc8c3a6d684925d584da7` |
| GitHub E2E | `E2E Tests / e2e` success |
| Merge 状态 | `mergeStateStatus=CLEAN` |
| 合并建议 | E2E 已绿但 PM 决定暂缓合并；等待另一个会话完成全部优化、PM 补齐功能细节后再判断 |
| 剩余风险 | 前端 full unit tests 仍有 3 个 `useInventoryPage.test.ts` 失败；lint 未绿；部分权限/API 口径需后续实现收敛 |
| 后续质量收敛 | unit/lint 不作为当前合并节奏的唯一阻断；若 PR 合并后仍需收口，从最新主干新建独立 `quality-gates` 分支 |

## 2026-06-16 PM 已确认补充决策

| 决策项 | PM 结论 | 执行口径 |
|--------|---------|----------|
| PR #1 合并时机 | 暂不合并 | 等另一个会话完成全部优化、PM 补齐所有功能细节后再重新做合并判断 |
| 前端 3 个 `useInventoryPage` 单测失败 | 按建议处理 | 不作为当前合并节奏的唯一阻断；后续质量分支收敛 |
| lint 未绿 | 按建议处理 | 不作为当前合并节奏的唯一阻断；后续质量分支收敛 |
| `quality-gates` 分支 | 按建议处理 | PR 合并后如仍需质量收敛，再从最新主干新建独立分支 |
| technician/pathologist 出库权限 | 按最小权限建议处理 | 前端不展示 `/outbound`；后端 `/api/v1/outbound` 只读权限后续收敛，除非 PM 后续提出明确业务场景 |
| finance 隐藏 ABC 页面 | 按建议处理 | 暂不放入侧边栏，保留 URL 直接访问 |
| `.env` 历史密钥 | 按建议处理 | 若历史提交中是真实密钥则轮换；若仅本地测试密钥则记录风险后置 |
| 入库中间态 | 按建议处理 | 暂不新增“待审核”中间态，保持当前入库闭环简单 |
| 报废/盘点/调拨权限 | 按建议处理 | 限制为 admin + warehouse_manager |
| 退库撤销、调拨原库位、供应商退货事务 | 按建议处理 | 作为后续 P1 数据一致性修复，不挡 PR #1 当前 Ready 状态 |
| BOM 出库缺料 | 按建议处理 | 不允许静默跳过；应失败并明确提示缺料项 |

## PM 待确认决策

| 编号 | 问题 | 影响 |
|------|------|------|
| DEC-PM-010 | 另一个会话完成优化后，PR #1 是否继续沿用当前分支合并，还是重开汇总 PR | 合并策略 |

---

## 关联文档

| 文档 | 路径 |
|------|------|
| 治理框架 | `docs/00_Project_Governance_Framework.md` |
| 业务规则 | `docs/04_Business_Rules.md` |
| 权限矩阵 | `docs/05_Role_Permission_Matrix.md` |
