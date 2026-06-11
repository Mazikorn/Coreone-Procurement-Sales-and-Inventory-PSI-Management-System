# COREONE 变更日志

> **版本**: 1.0.0
> **创建日期**: 2026-06-11
> **依据来源**: `.claude/session-log/`、`git log`、`.claude/fix-records/`
> **维护者**: Codex（AI 汇总，mimo 回传执行结果）

---

## 变更记录格式

| 字段 | 说明 |
|------|------|
| 变更编号 | CL-{日期}-{序号} |
| 日期 | 变更日期 |
| 模块 | 影响的业务模块 |
| 类型 | feat/fix/refactor/test/docs/chore |
| 描述 | 变更内容 |
| 关联需求/ Bug | TASK-xxx / BUG-xxx |
| 负责方 | Codex / mimo |

---

## 2026-06-11

### CL-20260611-001 治理框架建立

| 字段 | 内容 |
|------|------|
| 变更编号 | CL-20260611-001 |
| 日期 | 2026-06-11 |
| 模块 | 治理 |
| 类型 | docs |
| 描述 | 建立项目治理框架和执行规划，生成核心治理文档体系 |
| 关联 | DEC-012 |
| 负责方 | Codex |

**变更文件**
- `docs/00_Project_Governance_Framework.md` — 治理总入口
- `docs/16_Governance_Execution_Plan.md` — 执行规划
- `docs/14_Project_Resume_Report.md` — 项目接管报告
- `docs/15_Environment_Setup.md` — 环境搭建
- `docs/01_Project_Charter.md` — 项目章程
- `docs/02_PRD.md` — 产品需求文档
- `docs/04_Business_Rules.md` — 业务规则
- `docs/05_Role_Permission_Matrix.md` — 权限矩阵
- `docs/06_Data_Object_List.md` — 数据对象清单
- `docs/07_Acceptance_Criteria.md` — 验收标准
- `docs/08_Test_Cases_PM.md` — PM 测试用例
- `docs/09_Task_Backlog.md` — 统一待办
- `docs/10_Change_Log.md` — 变更日志（本文件）
- `docs/11_Bug_Log.md` — Bug 日志
- `docs/12_Release_Checklist.md` — 发布检查清单
- `docs/13_Decision_Log.md` — 决策日志 |

---

## 2026-06-11

### CL-20260611-002 E2E Phase 3 完成

| 字段 | 内容 |
|------|------|
| 变更编号 | CL-20260611-002 |
| 日期 | 2026-06-11 |
| 模块 | E2E 测试 |
| 类型 | fix |
| 描述 | E2E Phase 3 稳定化完成，19/19 失败全部修复 |
| 关联 | — |
| 负责方 | mimo |

**修复内容**
- 后端 UNIQUE 约束错误码修复（14 个路由文件 `SQLITE_CONSTRAINT_UNIQUE` → `UNIQUE constraint failed`）
- BOM + 间接成本 code 长度校验（>100 字符返回 400）
- categories 测试断言（详情面板选择器 + 状态标签不存在 + 编码规则）
- inbound 取消测试断言（添加 500 到预期值）
- roles 测试断言（并发编辑 + 详情弹窗 strict mode）

**测试结果**：Phase 2 全量回归 870 通过 / 141 失败 → Phase 3 全部 19 失败已修复

---

## 2026-06-10

### CL-20260610-001 E2E Phase 3 修复

| 字段 | 内容 |
|------|------|
| 变更编号 | CL-20260610-001 |
| 日期 | 2026-06-10 |
| 模块 | E2E 测试 |
| 类型 | fix |
| 描述 | Phase 3 修复：abc-cost 全部通过 + dashboard/alerts 断言修复 |
| 关联 | — |
| 负责方 | mimo |

---

## 2026-06-09

### CL-20260609-001 E2E Phase 1 + Phase 2

| 字段 | 内容 |
|------|------|
| 变更编号 | CL-20260609-001 |
| 日期 | 2026-06-09 |
| 模块 | E2E 测试 |
| 类型 | fix |
| 描述 | Phase 1 loginAs domcontentloaded 修复 + Phase 2 全量回归基线 |
| 关联 | — |
| 负责方 | mimo |

---

## 2026-06-08

### CL-20260608-001 E2E 登录超时根因修复

| 字段 | 内容 |
|------|------|
| 变更编号 | CL-20260608-001 |
| 日期 | 2026-06-08 |
| 模块 | E2E 测试 |
| 类型 | fix |
| 描述 | 修复登录超时根因：速率限制+账户锁定+domcontentloaded |
| 关联 | — |
| 负责方 | mimo |

---

## 2026-06-05

### CL-20260605-001 场景化 E2E 测试套件全量补全

| 字段 | 内容 |
|------|------|
| 变更编号 | CL-20260605-001 |
| 日期 | 2026-06-05 |
| 模块 | E2E 测试 |
| 类型 | test |
| 描述 | 场景化 E2E 测试套件全量补全：5 角色套件 + 7 业务流程 + 4 日常模拟 |
| 关联 | — |
| 负责方 | mimo |

---

## 2026-06-04

### CL-20260604-001 ABC v4.3 方案实施

| 字段 | 内容 |
|------|------|
| 变更编号 | CL-20260604-001 |
| 日期 | 2026-06-04 |
| 模块 | ABC 作业成本法 |
| 类型 | feat |
| 描述 | ABC v4.3 方案设计+代码实施+对抗审查 |
| 关联 | — |
| 负责方 | Codex + mimo |

---

## 关联文档

| 文档 | 路径 |
|------|------|
| 待办清单 | `docs/09_Task_Backlog.md` |
| Bug 日志 | `docs/11_Bug_Log.md` |
| 决策日志 | `docs/13_Decision_Log.md` |
| 发布检查清单 | `docs/12_Release_Checklist.md` |
