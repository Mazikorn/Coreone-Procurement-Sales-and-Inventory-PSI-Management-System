# COREONE — Agent 指导文档

> 基于 everything-claude-code (ECC) 模式构建的 COREONE 专用 AI 代理系统。
> **版本**: 1.0.0 | **创建**: 2026-05-22

## 核心原则

1. **Agent 优先** — 复杂任务委托给专业代理
2. **测试驱动** — 新功能先写测试再实现
3. **安全优先** — 不妥协安全，验证所有输入
4. **计划先行** — 复杂功能先规划再执行
5. **产品经理友好** — 解释清晰，不假设技术背景

## 可用代理

| 代理 | 用途 | 自动触发条件 |
|------|------|-------------|
| planner | 功能实现计划 | 复杂功能、重构、架构变更 |
| tdd-guide | 测试驱动开发 | 新功能、bug 修复 |
| code-reviewer | 代码质量审查 | 写完/修改代码后 |
| security-reviewer | 安全漏洞检测 | 认证/授权/输入处理代码 |
| build-error-resolver | 构建错误修复 | 构建/类型检查失败 |
| e2e-runner | E2E 测试执行 | 关键用户流程验证 |
| database-reviewer | 数据库审查 | schema 变更、SQL 优化 |

## 代理调度规则

**主动使用（无需用户显式请求）：**
- 复杂功能请求 → **planner**（制定实施计划）
- 刚写完/修改代码 → **code-reviewer**（质量审查）
- Bug 修复或新功能 → **tdd-guide**（测试先行）
- 安全敏感代码（认证、权限、输入处理） → **security-reviewer**
- 数据库结构变更 → **database-reviewer**

**并行执行：** 独立操作可同时启动多个代理。

## 代理文件位置

- `agents/planner.md`
- `agents/tdd-guide.md`
- `agents/code-reviewer.md`
- `agents/security-reviewer.md`

## 格式规范

所有代理文件使用 Markdown + YAML frontmatter：

```yaml
---
name: 代理名
description: 描述
tools: ["Read", "Write", "Grep"]  # 可用工具
model: opus  # 推荐模型
---
```

## 与用户协作方式

用户是**产品经理**，非专业开发人员：
- 解释技术决策时避免术语堆砌
- 需要用户决策时提供清晰的选项和影响
- 不确定需求时主动提问，不自行猜测
- 复杂方案先获批准再执行

---

## 多 Agent 会话协调

> **说明**: 本项目同时使用多个 Claude Code 会话，各自负责不同维度。
> **创建**: 2026-05-22 | **会话A** (Roo): E2E + 后端修复 | **会话B** (当前): 交互规范 + 前端修复

### 状态快照

#### 会话A (Roo) — 已完成

| 批次 | 内容 | 状态 |
|:---|:---|:---:|
| v1.19~v1.44 | 后端 P0/P1/P2 缺陷修复（权限/分页/SQL/参数绑定） | ✅ |
| v1.45~v1.48 | P2 后端边界修复（categories/projects/bom/alerts） | ✅ |
| v1.49 | 前端权限: `AppSidebar.tsx` `ROLE_MENU_MAP` + `AppLayout.tsx` 守卫 + `TopBar.tsx` | ✅ `a6167774` |
| v1.50 | JWT base64url-safe 解码 + 角色权限 | ✅ `eb3249d5` |
| v1.51 | BOM 一键出库 `POST /outbound/bom` | ✅ `9e6aa261` |
| CI | GitHub Actions E2E 回归 | 🔄 |

#### 会话B (当前) — 已完成

| 交付物 | 内容 | 状态 |
|:---|:---|:---:|
| 交互规范总纲 | 共性标准（分页/筛选/URL/删除/表单/打印/导出） | ✅ |
| 18 页面交互规范 | 439 个场景逐一定义 | ✅ |
| 功能矩阵-严格评估 | 60.6%可用/31.2%缺陷/8.2%缺失 | ✅ |
| 待办清单 | 按优先级和工时排序 | ✅ |

### 分工边界（避免冲突）

#### 会话A 不碰的文件
- `前端代码/src/pages/inbound/Inbound.tsx`
- `前端代码/src/pages/outbound/Outbound.tsx`
- `前端代码/src/pages/inventory/InventoryList.tsx`
- 任何前端分页/URL 同步/confirm 弹窗改动

#### 会话B 不碰的文件
- `后端代码/server/src/routes/*`（已由会话A 修复完毕）
- `前端代码/e2e/*.spec.ts`
- `.github/workflows/*`
- `前端代码/src/components/layout/AppSidebar.tsx`
- `前端代码/src/components/layout/AppLayout.tsx`
- `前端代码/src/components/layout/TopBar.tsx`

### 会话B 下一步计划

| 批次 | 内容 | 预计 |
|:---|:---|:---:|
| 批次1 | 入库页面 P0（partial订单/remainingQty校验/confirm弹窗/恢复硬编码） | 1天 |
| 批次2 | 跨页面共性（后端分页/URL同步/自定义confirm） | 3.5天 |
| 批次3 | 前端假功能（扫码/导入/打印/导出） | 1.5天 |

### 协调规则

1. **提交前**: `git pull --rebase`
2. **提交信息**: 会话B 用 `fix(frontend/xxx):` 前缀
3. **冲突**: 先提交的为准，后提交方 rebase 解决
4. **E2E**: 会话B 每批修复后运行对应 spec，不破坏已有绿测试

### 关键文件索引

| 文件 | 用途 | 归属 |
|:---|:---|:---:|
| `V1.1设计稿/v1.1/交互规范总纲.md` | 共性标准 | 会话B |
| `V1.1设计稿/v1.1/interaction-specs/pages/*.md` | 18页面规范 | 会话B |
| `E2E-Next-Steps-2026-05-16.md` | E2E修复计划 | 会话A |
| `待办清单.md` | 全局待办 | 会话B |
| `AGENTS.md` | 本文件 | 共享 |
| `.claude/SESSION-A-WORKLOG.md` | 会话A修改日志 | 会话A |
| `.claude/SESSION-B-WORKLOG.md` | 会话B修改日志 | 会话B |

### 会话协作机制

| 会话 | 标识 | 职责 | 工作日志 |
|:---|:---|:---|:---|
| A | Roo | E2E + 后端修复 | `.claude/SESSION-A-WORKLOG.md` + GitHub Actions 报告 |
| B | 当前 | 交互规范 + 前端修复 | `.claude/SESSION-B-WORKLOG.md` |

---

## 会话B 工作日志

> 本章节由会话B维护，记录每次修改的文件和具体变更，方便会话A（Roo）查阅。

### 批次1 — 入库页面 P0 缺陷修复（2026-05-22）

| 文件 | 修改类型 | 具体变更 | 对应场景 |
|:---|:---|:---|:---|
| `前端代码/src/pages/inbound/Inbound.tsx` | 新增 | `selectedOrder` useMemo：根据 `selectedOrderId` 查找当前选中采购订单 | IN-37 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 修改 | 数量输入框：`min={0.01}` `max={selectedOrder?.remainingQty}`，label 旁显示"待入库: X" | IN-37 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 修改 | `handleSubmit`：增加 `quantity > remainingQty` 拦截，toast 提示 | IN-46 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 修改 | `InboundStatus` 类型：移除 `'pending'`，仅剩 `completed \| cancelled` | IN-16 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 修改 | `getRecordStatus`：删除 demo 逻辑 `row.quantity > 1000`，改为直接返回 `row.status` | IN-16 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 删除 | 操作列移除 `status === 'pending'` 分支的"确认入库"按钮 | IN-25 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 删除 | 移除 `ModalType` 中的 `'confirm'` 及 `openConfirm` 函数 | IN-25 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 删除 | 移除"确认入库"弹窗整段 JSX（含硬编码 `Math.max(1, selectedRecord.quantity - 5)` 等 demo 数据） | IN-25 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 修改 | 统计卡片：`{stats.total \|\| 156}` → `{stats.total}` 等，移除所有硬编码 fallback | IN-05~08 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 修改 | 快速筛选标签：`count: quickFilterCounts.all \|\| 156` → `count: quickFilterCounts.all` 等 | IN-05~08 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 新增 | `confirmModal` 状态、`openConfirmModal`、`closeConfirmModal` | IN-24 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 修改 | `handleDelete`：从 `native confirm()` 改为调用 `openConfirmModal` + `inboundApi.delete` | IN-24 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 新增 | 通用确认弹窗 JSX（复用现有 `Modal` 组件） | IN-24 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 修改 | `handleRestoreInbound`：从空壳 toast 改为调用 `inboundApi.update` 尝试恢复 `status` | IN-26 |
| `后端代码/server/src/routes/purchase-orders-v1.1.ts` | 修改 | `GET /`：单 status 匹配改为逗号分隔多 status 支持（`pending,partial`） | IN-35 |

### 会话A 需注意的变更

1. **采购订单查询**：`purchaseOrderApi.getList` 现在传 `status: 'pending,partial'`，后端已支持逗号分隔多状态。
2. **恢复入库**：`handleRestoreInbound` 调用 `PUT /inbound/:id` 传 `{ status: 'completed' }`，若后端后续支持 `status` 字段更新则功能自动生效。
3. **确认入库功能已移除**：入库记录本身无 `pending` 状态，此按钮和弹窗已删除。如需在采购订单页面实现"继续入库"，请会话A评估后端是否需要新增接口。

---

*本文档双方 Agent 均可编辑更新。*
