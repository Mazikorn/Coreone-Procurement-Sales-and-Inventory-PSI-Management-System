# COREONE 统一待办清单

> **版本**: 1.0.0
> **创建日期**: 2026-06-11
> **依据来源**: `开发任务清单.md`、`功能矩阵-严格评估.md`、`功能补全清单.md`、`.claude/session-log.md`、`.claude/qa-reports/`、`docs/04_Business_Rules.md`
> **维护者**: Codex（AI 生成，PM 审核确认）

---

## 统计摘要

> **重要核对说明（2026-06-11）**：本清单整合了历史计划、功能矩阵和 QA 报告，不能直接等同当前代码缺陷列表。执行任何任务前必须按目标分支重新 triage：确认页面、API、路由、测试是否仍然缺失或失败。

> **2026-06-16 PR 再清点说明**：PR #1 已 Ready for review，目标分支 `codex/master-aligned-integration-2026-06-15`，head `d97efa991fee4797a7ccc8c3a6d684925d584da7`。GitHub `E2E Tests / e2e` 已通过，`mergeStateStatus=CLEAN`；后端 build/test、前端 typecheck/build、路由一致性已有通过证据。前端 full unit tests 仍有 3 个 `useInventoryPage.test.ts` 失败，lint 未绿，部分权限/API 口径仍需 PM 确认。因此本清单的历史 P0/P1 不再直接作为“当前阻断数”，需要按下表重新分流。

| 优先级 | 数量 | 类型分布 |
|--------|------|---------|
| P0 | 23 | 功能 8 / Bug 7 / 安全 8 |
| P1 | 22 | 功能 13 / Bug 6 / 测试 3 |
| P2 | 22 | 功能 9 / 性能 3 / 测试 6 / 安全 4 |
| P3 | 6 | 功能 3 / 文档 1 / Bug 1 / 安全 1 |
| PM 待确认 | 6 | 需产品决策 |
| **合计** | **79** | |

---

## 2026-06-15 目标 PR 分流结果

| 状态 | 项目 | 处理结论 |
|------|------|----------|
| 已有证据显示已修复 | TASK-P1-001、TASK-P1-002、BUG-P0-001、BUG-P0-002、BUG-P0-003、BUG-P0-004、BUG-P0-005、BUG-P0-006、BUG-P0-007、SEC-P0-002、SEC-P0-003、SEC-P0-004、SEC-P0-006、SEC-P2-003 | 代码中已看到对应修复线索，且后端 build/test 或前端 build/typecheck 通过；仍需在 Bug Log 中补关闭证据 |
| 本次已处理 | SEC-P0-008 | PR 分支已从 Git 索引移除 `前端代码/.env`、`后端代码/server/.env`；历史泄露风险需通过密钥轮换/历史治理另行处理 |
| 仍需处理或 PM 决策 | SEC-P0-001、SEC-P0-005、BUG-P1-001、BUG-P1-002、PM-001~PM-006、出库/成本/ABC 等权限与 API 口径 | 仍有供应商退货状态更新无事务、供应商退货撤销日志 operator 来源、调拨原库位恢复、退库撤销逻辑、BOM 出库缺料策略、后端出库只读权限是否保留给 technician/pathologist 等未闭环 |
| 验收/产品化项，非当前 PR 阻断 | TASK-P0-005、TASK-P0-006、TASK-P1-004、TASK-P1-005、TASK-P1-008、TASK-P1-011、TASK-P1-013、P2/P3 批量优化项 | 建议进入后续产品化任务，不阻断 Ready PR 合并判断；是否阻断合并由 PM 决策 |
| 测试门禁项 | 前端 `npm test`、GitHub `e2e`、lint | GitHub `e2e` 已绿；前端单测 81/84 通过但 3 个 inventory hook 失败；lint 仍有配置/历史代码问题 |

## 2026-06-16 PR #1 合并判断与质量门禁计划

| 项目 | 当前判断 | 下一步 |
|------|----------|--------|
| PR 状态 | Ready for review；head SHA `d97efa991fee4797a7ccc8c3a6d684925d584da7`；`mergeStateStatus=CLEAN` | PM 已决定暂缓合并，等待另一个会话完成全部优化并补齐功能细节后再重新判断 |
| E2E | GitHub Actions `E2E Tests / e2e` success | 合并后发布前按发布范围复跑 |
| 前端 full unit tests | 未绿：3 个失败集中在 `useInventoryPage.test.ts` | 不作为当前合并节奏的唯一阻断；PR 合并后如仍未处理，纳入 `quality-gates` 分支 |
| lint | 未绿：配置/历史 lint 债仍在 | 不作为当前合并节奏的唯一阻断；PR 合并后如仍未处理，纳入 `quality-gates` 分支 |
| 权限/API 口径 | E2E 已验证页面访问；后端读权限、ABC/成本可见性等需按最小权限原则收敛 | 出库 API 只读权限、finance 隐藏 ABC 入口等结论同步到权限矩阵和决策日志 |
| 自动合并 | 不执行 | 等另一个会话优化完成、PM 功能细节补齐并明确批准后再操作 |

---

## P0 — 必须立即处理

### 功能类（8 项）

| ID | 任务 | 来源 | 影响范围 |
|----|------|------|----------|
| TASK-P0-001 | 退库管理需重新核对：页面/API/测试以目标分支为准 | 功能补全 PAGE-P0-01 | 退库模块可能不可用 |
| TASK-P0-002 | 报废管理需重新核对：前端和后端文件当前可见 | 功能补全 PAGE-P0-02 | 需运行测试确认是否仍有缺陷 |
| TASK-P0-003 | 调拨管理需重新核对：前端和后端文件当前可见 | 功能补全 PAGE-P0-03 | 需运行测试确认是否仍有缺陷 |
| TASK-P0-004 | 供应商退货需重新核对：页面/API/测试以目标分支为准 | 功能补全 PAGE-P1-02 | 供应商退货模块可能不可用 |
| TASK-P0-005 | 入库扫码功能为模拟 | 功能矩阵 IN-02 | 入库核心流程 |
| TASK-P0-006 | 入库批量导入为模拟 | 功能矩阵 IN-03 | 入库核心流程 |
| TASK-P0-007 | 入库确认弹窗未调 API | 功能矩阵 IN-25 | 入库核心流程 |
| TASK-P0-008 | 入库恢复硬编码库存 +400 | 功能矩阵 IN-26 | 入库数据准确性 |

### Bug 类（7 项）

| ID | 任务 | 来源 | 影响范围 |
|----|------|------|----------|
| BUG-P0-001 | BOM PUT 更新无事务包裹 | QA Critical | BOM 数据完整性 |
| BUG-P0-002 | BOM POST 创建无事务包裹 | QA Medium M-3 | BOM 数据完整性 |
| BUG-P0-003 | BOM PUT 校验失败无回滚 | QA Medium M-4 | BOM 数据完整性 |
| BUG-P0-004 | 出库 before_stock 读取时机错误 | QA High #1 | stock_logs 数据错误 |
| BUG-P0-005 | 入库 PUT 不更新 amount | QA Medium M-5 | 入库金额不一致 |
| BUG-P0-006 | 入库 DELETE 不扣减 inventory.stock | Plan 2 | 库存虚高 |
| BUG-P0-007 | 入库 PUT→cancelled 取消原因丢失 | QA High #5 | 审计追溯 |

### 安全类（8 项）

| ID | 任务 | 来源 | 影响范围 |
|----|------|------|----------|
| SEC-P0-001 | operator 从 body 读取可被伪造 | QA High #2/#3/#4 | 操作审计不可信 |
| SEC-P0-002 | 报废模块无写入权限控制 | BR-SC-014 | 报废权限 |
| SEC-P0-003 | 盘点模块无写入权限控制 | BR-ST-020 | 盘点权限 |
| SEC-P0-004 | 调拨模块无写入权限控制 | BR-TF-017 | 调拨权限 |
| SEC-P0-005 | 供应商退货状态更新不在事务中 | BR-SR-019 | 数据一致性 |
| SEC-P0-006 | 登录无速率限制 | Plan 6 | 全系统安全 |
| SEC-P0-007 | Token 存储在 localStorage | Plan 6 | 全系统安全 |
| SEC-P0-008 | .env 文件被 git 跟踪 | Plan 6 | 密钥泄露 |

---

## P1 — 本周内完成

### 功能类（13 项）

| ID | 任务 | 来源 | 影响范围 |
|----|------|------|----------|
| TASK-P1-001 | 采购订单下拉仅显示 pending | 功能补全 IN-P0-01 | 分批入库 |
| TASK-P1-002 | 数量无 remainingQty 上限校验 | 功能补全 IN-P0-02 | 入库准确性 |
| TASK-P1-003 | 采购订单需重新核对：页面/API/测试以目标分支为准 | 功能补全 PAGE-P1-01 | 采购全流程 |
| TASK-P1-004 | 全部列表页前端分页 | 功能矩阵 | 大数据量性能 |
| TASK-P1-005 | 全部列表页 URL 不同步 | 功能矩阵 | 用户体验 |
| TASK-P1-006 | BOM 出库静默跳过物料 | Plan 2 | 用户反馈 |
| TASK-P1-007 | 出库取消原因未保存 | Plan 2 | 审计追溯 |
| TASK-P1-008 | CostAnalysis 时间硬编码 | Plan 2 | 成本报表 |
| TASK-P1-009 | SupplierReturns 表单重复字段 | Plan 2 | 供应商退货 |
| TASK-P1-010 | 报表退库成本时间范围错误 | Plan 2 | 成本准确性 |
| TASK-P1-011 | Dashboard 趋势图硬编码假数据 | Plan 2 | 仪表盘 |
| TASK-P1-012 | 对账页面标签错误 | Plan 2 | 对账模块 |
| TASK-P1-013 | 对账导出按钮空实现 | Plan 2 | 对账模块 |

### Bug 类（6 项）

| ID | 任务 | 来源 | 影响范围 |
|----|------|------|----------|
| BUG-P1-001 | 退库撤销批次操作逻辑不一致 | BR-RT-008 | 退库数据 |
| BUG-P1-002 | 调拨撤销不恢复原始库位 | BR-TF-018 | 调拨数据 |
| BUG-P1-003 | 入库 PUT 不校验库存变负 | Plan 2 | 库存安全 |
| BUG-P1-004 | 盘点撤销未检查库存合理性 | Plan 2 | 盘点安全 |
| BUG-P1-005 | 设备折旧公式错误（差 4.38 倍） | Plan 2 | 设备成本 |
| BUG-P1-006 | 入库价格字段缺少类型校验 | QA High | 入库金额 |

### 测试类（3 项）

| ID | 任务 | 来源 | 影响范围 |
|----|------|------|----------|
| TEST-P1-001 | 出库/入库测试断言过于宽松 | QA High #11/#12 | 代码保护 |
| TEST-P1-002 | 预警检查失败静默吞异常 | QA High #14/#15 | 问题排查 |
| TEST-P1-003 | 路由 catch 块无 console.error | QA Medium M-11 | 错误排查 |

---

## P2 — 可选优化

### 功能类（9 项）

| ID | 任务 | 来源 |
|----|------|------|
| TASK-P2-001 | 入库打印操作人固定为"张医生" | 功能矩阵 IN-04 |
| TASK-P2-002 | 入库统计卡片硬编码 fallback | 功能矩阵 IN-05~08 |
| TASK-P2-003 | 入库 pending 判断为 quantity>1000 | 功能矩阵 IN-16 |
| TASK-P2-004 | 盘点进行中硬编码 inProgress=0 | 功能矩阵 ST-01 |
| TASK-P2-005 | 库存批量报废为模拟 | 功能矩阵 INV-28 |
| TASK-P2-006 | 多页面删除用原生 confirm() | 功能矩阵 |
| TASK-P2-007 | 入库查询按钮为空函数 | 功能补全 IN-P0-08 |
| TASK-P2-008 | 采购订单仅显示 pending | 功能矩阵 IN-35 |
| TASK-P2-009 | 仪表盘数据真实性未验证 | 功能矩阵 |

### 性能类（3 项）

| ID | 任务 | 来源 |
|----|------|------|
| PERF-P2-001 | 修复 N+1 查询 | Plan 7 |
| PERF-P2-002 | 优化 pageSize:999 全量加载 | Plan 7 |
| PERF-P2-003 | 库存列表子查询改 LEFT JOIN | Plan 7 |

### 测试类（6 项）

| ID | 任务 | 来源 |
|----|------|------|
| TEST-P2-001 | 迁移后端测试到 Vitest | Plan 8 |
| TEST-P2-002 | 补充 14 个路由模块测试 | Plan 8 |
| TEST-P2-003 | 修复集成测试硬编码路径 | Plan 8 |
| TEST-P2-004 | 清理 E2E 空壳测试 | Plan 8 |
| TEST-P2-005 | 收紧 E2E 宽松断言 | Plan 8 |
| TEST-P2-006 | E2E waitForTimeout 无断言 | QA Medium M-2 |

### 安全类（4 项）

| ID | 任务 | 来源 |
|----|------|------|
| SEC-P2-001 | 实现账户锁定机制 | Plan 6 |
| SEC-P2-002 | Refresh Token 独立 Secret | Plan 6 |
| SEC-P2-003 | 添加 helmet 安全头 | Plan 6 |
| SEC-P2-004 | 添加 express-validator | Plan 6 |

---

## P3 — 锦上添花

| ID | 任务 | 来源 | 类型 |
|----|------|------|------|
| TASK-P3-001 | 全部列表页添加表格排序 | 功能矩阵 | 功能 |
| TASK-P3-002 | 统计卡片 fallback 改为 0 或 - | 功能补全 | 功能 |
| TASK-P3-003 | 日期范围筛选含当天确认 | 功能补全 | 功能 |
| TASK-P3-004 | 错误消息语言统一为中文 | Plan 2 | 文档 |
| BUG-P3-001 | 对账导入未验证 project_id | Plan 2 | Bug |
| SEC-P3-001 | 路由不自包含权限检查 | QA 分析 | 安全 |

---

## PM 待确认项（6 项）

| ID | 问题 | 来源 | 影响 |
|----|------|------|------|
| PM-001 | 入库是否需要"待审核"中间态？ | BR PM-BR-001 | 入库流程 |
| PM-002 | 报废/盘点/调拨是否限制为 warehouse_manager？ | BR PM-BR-002 | 权限设计 |
| PM-003 | 退库撤销批次操作不一致是否修复？ | BR PM-BR-003 | 退库数据 |
| PM-004 | 调拨是否需要存储 from_location_id？ | BR PM-BR-004 | 调拨数据 |
| PM-005 | 供应商退货状态更新是否加事务？ | BR PM-BR-005 | 退货数据 |
| PM-006 | 通用试剂不足时跳过出库是否可接受？ | BR PM-BR-006 | BOM 出库 |

---

## 关联文档

| 文档 | 路径 |
|------|------|
| 业务规则 | `docs/04_Business_Rules.md` |
| 权限矩阵 | `docs/05_Role_Permission_Matrix.md` |
| PRD | `docs/02_PRD.md` |
| 验收标准 | `docs/07_Acceptance_Criteria.md` |
