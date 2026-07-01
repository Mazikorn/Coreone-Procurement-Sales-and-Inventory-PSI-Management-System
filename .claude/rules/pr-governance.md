# PR 治理规范（防止 PR 被忽视 / 错误合并）

> **优先级**：P0 — 强制。每个会话启动读 `session-log.md` 时，连带核对本文件「活跃 PR 看板」。
> **问题背景**：本项目长期是「栈式 PR」（一个 PR base 在另一个 PR 的 head 上，最终汇入 master）。
> 栈一深 + master 在动，就容易：①某个开着的 PR 被忘了 ②合并顺序错（先合上游导致下游 base 失效/冲突）
> ③一个「半成品」PR 被单独合进 master（如只修了一半的跨院串账）。本规范把「栈关系 / 合并顺序 / 依赖 / supersedes」
> 显式记录在三处：**PR 描述体 + GitHub 标签 + 本看板**，任一处都能独立看懂，避免踩雷。

## 1. 铁律

1. **base 政策**：新 PR 的 base = 它真实依赖的那个分支（通常是栈里的上一个 PR 的 head），不要图省事 base 到 master 而把上游的改动混进自己的 diff。
2. **栈式 PR 必须físicamente依赖**：下游 PR 的 base 设成上游 PR 的 head → GitHub 天然不允许下游先于上游合并，合并顺序被物理约束。
3. **「不可单独合并」必须显式标注**：任何「半成品 / 必须和另一个 PR 一起落地」的 PR，body 顶部加 `> ⚠️ 不可单独合并：必须在 #X 之后/一起合并（原因…）`，并打 `do-not-merge-alone` 标签。
4. **supersedes 必须显式**：若新 PR 重做/取代旧 PR 的某部分，旧 PR body 注明 `被 #Y 完成/取代`，新 PR body 注明 `完成/取代 #X 的 …部分`。
5. **合并顺序写下来**：见下方看板「合并顺序」。合并任意 PR 前，先核对它是不是当前可合的最上游项；合完一个就立刻更新看板 + 处理下游 PR 的 base 重定向。
6. **base 重定向**：当上游 PR 合进 master 后，其下游 PR 的 base 会悬空 → 立即把下游 PR 的 base 改到 master（或新的上游）并 rebase，再继续。
7. **会话边界**：会话启动先读看板；开/合/改任何 PR 后立即更新看板 + 受影响 PR 的 body/标签；会话结束在 `session-log` 留指针。

## 2. 新 PR 必填字段（PR body 模板，见 `.github/pull_request_template.md`）

- **Base / 栈位置**：base=`<branch>`；本 PR 在栈中的位置（第几层、上下游是谁）。
- **依赖（Depends on）**：`#X`（必须先合）。
- **Supersedes / 完成**：`完成 #X 的 … / 取代 #Y`（如有）。
- **合并前提**：单独可合 ✅ / ⚠️ 不可单独合并（说明）。
- **验证**：测试数/回归/关键不变量（如黄金 ¥13,152）。

## 3. GitHub 标签（轻量护栏，已建）

- `stacked`：栈式 PR（base 非 master）。
- `do-not-merge-alone`：不可单独合并（半成品/需配对）。
- `merge-order/N`：合并序号（N 小者先合）。
- `ready-to-merge`：前置已满足、可合（合并前再核看板）。

## 4. 活跃 PR 看板（唯一事实源，随开/合/改实时更新）

> 更新时间：2026-06-30（partner 栈已全部并入 master）。状态以 `gh pr list` 为准。

**🎉 partner 成本盈利栈已全部并入 master**：#8(W1–W7)/#9(导入器引擎)/#10(codex P0–P6)/#11(Phase0 可信度止血)/#13(partner-pnl 月份轴) 均 MERGED。栈式合并阶段结束。

| PR | 分支 → base | 状态 | 关系 / 风险 | 标签 |
|---|---|---|---|---|
| [#14](https://github.com/Mazikorn/Coreone-Procurement-Sales-and-Inventory-PSI-Management-System/pull/14) | `claude/pr8-e2e-fix` → `master` | OPEN | **修复 master 红色 e2e**：栈全并入 master 但未带本修复 → master 现存 6 确定性 e2e 失败（退货 RBAC 迁移缺口 + 登出守卫只看 user 不看 token）。已 rebase 到 master 顶（a7d566ed）+ retarget base=master。本地 master 状态复现 6 失败→**修后 e2e 257/257、后端 493 零断言失败**。base=master → 本 PR e2e CI 真跑（合并前最终确认）。单独可合 ✅。 | — |
| [#12](https://github.com/Mazikorn/Coreone-Procurement-Sales-and-Inventory-PSI-Management-System/pull/12) | `claude/blissful-jang-aec669` → `codex/abc-productization-phase0-1-2026-06-15` | OPEN | codex 线的 supplier-returns e2e 修复（测试侧）。与 #14 是不同线的同类问题；codex 线未并入 master，价值有限，待用户定夺（可能 close）。 | — |

**已合/关闭**：#13/#11/#10/#9/#8/#7/#6/#4/#3/#2 → MERGED master；#5/#1 CLOSED。

> ✅ **账单已修、栈已合**（2026-06-29 的「合并暂停（账单）」已解除）。当前唯一主干事项 = **#14 修 master 红色 e2e**：等其 e2e CI 跑绿 → 合入 master（修复主干 CI）。无栈式依赖、无 base 重定向。

## 5. 会话启动检查清单（30 秒）

1. `gh pr list --state open` 对一遍本看板，差异即更新看板。
2. 看有没有 `do-not-merge-alone` 的 PR 处在「即将被单独合」的风险位。
3. 要合并？→ 确认是当前最上游可合项 → 合 → 更新看板 + 重定向下游 base。

---

*与 `CLAUDE.md`、`coreone-guardrails.md`、`session-log.md` 配套。看板是唯一事实源，PR body/标签是其在 GitHub 的镜像。*
