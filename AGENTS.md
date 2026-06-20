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

## 当前工作机制

> **说明**: 项目当前按单设备、单会话方式推进；历史并行分工和旧边界不再作为执行规则。

### 执行规则

1. **单一负责人**: 当前会话负责端到端检查、修改、验证和报告。
2. **不设文件禁区**: 可按任务需要修改前端、后端、测试和文档，但必须避免回退无关改动。
3. **先看现状再下结论**: 旧测试、旧工作日志和旧功能矩阵只能作为线索，不能作为完成证明。
4. **ABC 隔离**: 非 ABC 修复不得直接改 ABC 本体；若会影响库存、出库、BOM、成本异常等 ABC 输入，必须补相应回归。
5. **验收从严**: 页面/弹窗必须检查真实副作用，不能只看按钮存在或测试通过。
6. **废弃范围**: 旧版物料成本分析 `/cost-analysis` 是 ABC 成本法之前的一版方案，已于 2026-06-17 废弃；源码仅保留在 `前端代码/deprecated/legacy-cost-analysis/` 作为历史参考，不再修复、扩展或纳入非 ABC 审计。

### Playwright 强规则

1. **禁止默认下载**: 在本项目中不得把 `npx playwright install`、`npx playwright install chromium`、`npx playwright install chromium --only-shell` 作为默认修复或验证步骤。
2. **使用前必读**: 每次使用 Playwright 或做真实浏览器页面验证前，必须先阅读:
   - `/Users/maxiaoyuan/.codex/memories/extensions/ad_hoc/notes/20260620-130305-playwright-hard-rule.md`
   - `/Users/maxiaoyuan/.codex/memories/extensions/ad_hoc/notes/20260620-130650-playwright-recovered-backup.md`
3. **先验本地缓存**: 先用 `find ~/Library/Caches/ms-playwright`、`test -x`、`--version` 和真实 launch 检查现有浏览器。
4. **优先本地恢复**: 如缓存缺失，先运行稳定备份恢复脚本 `/Users/maxiaoyuan/Documents/Codex/playwright-browser-backups/pw-1.59.1-chromium-1217-cft-147.0.7727.15-mac-arm64/restore-playwright-chromium-1217.sh`，再验证可执行文件和真实 launch。
5. **网络恢复需确认**: 只有本地缓存和本地备份都不可用，且用户明确同意时，才允许用可断点续传的镜像/CDN 分段下载恢复；恢复后必须重新建立本地稳定备份。
6. **当前验证基线**: Playwright `1.59.1`，Chromium `1217`，Chrome for Testing `147.0.7727.15`；期望可执行文件为 `~/Library/Caches/ms-playwright/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`。

### 关键文件索引

| 文件 | 用途 |
|:---|:---|
| `V1.1设计稿/v1.1/交互规范总纲.md` | 共性交互标准 |
| `V1.1设计稿/v1.1/interaction-specs/pages/*.md` | 页面交互规范 |
| `V1.1设计稿/v1.1/功能矩阵-严格评估.md` | 历史缺口线索 |
| `docs/non-abc-full-functional-audit-2026-06-16.md` | 当前非 ABC 全功能审计报告 |
| `AGENTS.md` | 本文件 |

## 历史工作日志摘录

> 以下内容仅保留为历史线索，不再代表当前会话分工。

### 入库页面 P0 缺陷修复（2026-05-22）

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

### 历史注意事项

1. **采购订单查询**：`purchaseOrderApi.getList` 现在传 `status: 'pending,partial'`，后端已支持逗号分隔多状态。
2. **恢复入库**：`handleRestoreInbound` 调用 `PUT /inbound/:id` 传 `{ status: 'completed' }`，若后端后续支持 `status` 字段更新则功能自动生效。
3. **确认入库功能已移除**：入库记录本身无 `pending` 状态，此按钮和弹窗已删除。如需在采购订单页面实现"继续入库"，应重新评估后端是否需要新增接口。

---

*本文档由当前单会话维护。*
