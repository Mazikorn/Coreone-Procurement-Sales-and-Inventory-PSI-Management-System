# 2026-06-15 治理缺口闭环报告

> 目标 PR：#1 `fix(integration): prepare master-aligned COREONE PR`
> 目标分支：`codex/master-aligned-integration-2026-06-15`
> 复核时间：2026-06-15
> 复核口径：以治理文档为清单，以当前 PR 分支和实际验证结果为事实源。

## 一、已完成事项

| 事项 | 结论 |
|------|------|
| 主工作区脏状态 | 已处理。738 个 tracked 假修改确认为 CRLF/LF 差异，`core.autocrlf` 已改为 `false`，主工作区恢复 clean |
| Draft PR 创建 | 已完成。PR #1 已打开，head 为 `afb8c71abb805f3cda4f0ae09942575733e28655` |
| 路由一致性阻断 | 已修复。菜单/权限路径缺失的页面路由已补回，最终检查 `missing: []` |
| 后端验证 | `npm run build` 通过；`npm run test:node` 8 files / 87 tests passed |
| 前端基础验证 | `npx tsc --noEmit` 通过；`npm run build` 通过，仅保留 Vite chunk size warning |
| Git 跟踪 `.env` 风险 | 已在 PR 分支执行 `git rm --cached`，不读取、不删除本地 `.env`，只从仓库索引移除 |

## 二、仍未闭环事项

| 优先级 | 事项 | 当前状态 | 下一步 |
|--------|------|----------|--------|
| P0 | GitHub Actions `e2e` | 运行中 | 等待 PR #1 checks 最终结果 |
| P0 | 前端单测 | `npm test` 81/84 通过，3 个失败集中在 `useInventoryPage.test.ts` | 修复 inventory hook 测试或由 PM 明确豁免 |
| P0 | `.env` 历史暴露 | 当前 PR 已从索引移除，但历史提交如含真实密钥仍有风险 | PM/技术负责人确认是否轮换相关密钥 |
| P1 | lint 门禁 | 前端缺 ESLint v9 配置；后端 lint 有 1 个 error 与大量 warning | 决定是否作为本次 PR 阻断，或拆为质量债任务 |
| P1 | 权限差异 | 路由缺失已修复，菜单/后端角色意图仍需确认 | PM 确认角色可见性和隐藏 ABC 页面策略 |
| P1 | 历史 P0/P1 清单 | 已完成一轮分流，仍有供应商退货事务、调拨原库位、operator 来源等未闭环 | 拆后续任务或作为合并前阻断处理 |

## 三、治理文档更新

| 文档 | 更新内容 |
|------|----------|
| `docs/12_Release_Checklist.md` | 更新 2026-06-15 发布门禁状态、测试状态、安全风险和当前建议结论 |
| `docs/09_Task_Backlog.md` | 增加目标 PR 分流结果，避免历史 P0/P1 直接误判为当前阻断数 |
| `docs/11_Bug_Log.md` | 增加 Draft PR #1 复核摘要，标记可降级、仍需确认和未专项复核项 |
| `docs/04_Business_Rules.md` | 更新仍需 PM 决策或专项复核的业务规则缺口 |
| `docs/05_Role_Permission_Matrix.md` | 标明路由缺失已修复，剩余为权限意图和测试覆盖问题 |
| `docs/08_Test_Cases_PM.md` | 标明 PR E2E 仍在运行，不能把 spec 文件存在写成已通过 |
| `docs/02_PRD.md` | 保持模块状态为“已实现待复核”，避免提前升级为“已核验” |
| `docs/13_Decision_Log.md` | 增补 PR 合并、lint、隐藏 ABC 页面、密钥轮换等 PM 待确认决策 |

## 四、合并建议

当前 PR 应继续保持 Draft。

转 Ready 前建议至少完成：

1. GitHub `e2e` 出最终结果。
2. PM 明确是否接受前端 inventory 单测失败作为非阻断，或安排修复。
3. PM/技术负责人确认 `.env` 历史暴露是否需要轮换密钥。
4. PM 明确 lint 是否作为本次 PR 阻断。
5. PM 确认权限矩阵中的角色差异是否符合业务意图。
