# 主会话接力卡

> 更新时间: 2026-06-12 12:00 Asia/Shanghai
> 目的: 当当前聊天上下文过长或需要新开主会话时，保证新会话可稳定接手。

## 一、当前分支

主会话本地分支:

`codex/governance-docs-accuracy`

第二台设备分支:

`collaboration/2026-06-12-scan-report`

GitHub 仓库:

`Mazikorn/Coreone-Procurement-Sales-and-Inventory-PSI-Management-System`

## 二、最近关键提交

主会话本地最新提交:

`7b31018` - `fix(frontend/master): restore projects and locations compile blockers`

主会话已通过 GitHub 连接器写入远端的关键提交:

- `638c102` - 第二批低风险修复任务单。
- `a6402bc` - 补齐 `LocationCards.tsx`。
- `dd2c118` - 补齐 `useProjectsPage.ts`。

第二台设备最新提交:

`f576547` - 完成第二批低风险修复。

## 三、已完成事项

1. 已建立双设备协作文档目录: `docs/collaboration-workflow/`。
2. 第二台设备完成 5 个页面扫描报告，报告已修正为 35 个问题。
3. 主会话已审查第二台设备提交 `f576547`。
4. 主会话结论: `f576547` 无阻断问题，额外修改 `Locations.tsx` 可接受。
5. 主会话已补齐两个前端缺失文件:
   - `前端代码/src/pages/master/hooks/useProjectsPage.ts`
   - `前端代码/src/pages/master/components/LocationCards.tsx`

## 四、未合并事项

1. 第二台设备分支 `collaboration/2026-06-12-scan-report` 尚未正式合并进主会话本地分支。
2. 主会话本地提交与通过 GitHub 连接器写入的远端提交需要在新会话开始时重新核对。
3. 项目仍存在全局构建阻断，不能把 `f576547` 单独视为可发布状态。

## 五、禁止触碰文件

除非用户明确重新授权，新会话继续遵守 `AGENTS.md` 边界:

会话B 不碰:

- `后端代码/server/src/routes/*`
- `前端代码/e2e/*.spec.ts`
- `.github/workflows/*`
- `前端代码/src/components/layout/AppSidebar.tsx`
- `前端代码/src/components/layout/AppLayout.tsx`
- `前端代码/src/components/layout/TopBar.tsx`

第二台设备下一轮在收到新任务单前只做只读盘点，不继续提交业务代码。

## 六、下一步第一条命令

新主会话启动后先执行:

```bash
sed -n '1,260p' AGENTS.md
sed -n '1,260p' docs/collaboration-workflow/handoff/current-main-session.md
git status --short
```

确认边界后再执行:

```bash
/Users/maxiaoyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -b --pretty false
```

## 七、当前已知构建阻断

`tsc -b --pretty false` 当前仍失败，主要阻断包括:

1. `前端代码/src/main.tsx` 引用 `./App`，但 `前端代码/src/App.tsx` 缺失。
2. 多处引用 `@/components/ui/Modal`，但 `前端代码/src/components/ui/Modal.tsx` 缺失。
3. 多处引用 `@/components/ui/Pagination`，但 `前端代码/src/components/ui/Pagination.tsx` 缺失。
4. `@/hooks/usePagination` 缺少 `UsePaginationReturn` 类型导出。
5. 多个页面还存在缺失 hook、缺失 API 导出、API 返回类型不一致、未使用变量等后续错误。

## 八、需要用户决策的问题

当前无需用户立即决策。

建议策略:

1. 先让第二台设备只读盘点构建阻断。
2. 主会话处理最前置的构建基础组件缺失。
3. 当剩余 TypeScript 错误超过 20 个且需要连续修复时，新开主会话接手构建稳定化。

## 九、新开会话触发条件

满足以下任一条件时，建议新开主会话:

1. 准备正式合并第二台设备代码并进入大规模构建修复前。
2. 当前聊天中活跃分支超过 3 条。
3. 同时存在超过 5 个未完成任务单。
4. 需要连续处理 20 个以上 TypeScript 构建错误。
5. 主会话开始遗漏最新分支、提交或任务边界。
