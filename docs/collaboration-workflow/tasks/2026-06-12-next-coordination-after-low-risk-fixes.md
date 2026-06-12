# 任务单: 低风险修复审查后的下一步协同

> 日期: 2026-06-12
> 来源: 主会话审查 `f576547`
> 适用分支: `collaboration/2026-06-12-scan-report` 与 `codex/governance-docs-accuracy`

## 一、主会话审查结论

第二台设备提交 `f576547` 总体通过审查。

已确认:

1. 角色权限 URL 初始化修复方向正确。
2. 角色权限 `assignedUsers` 运算符优先级修复正确。
3. 消耗对账导出按钮从“无响应”改为禁用状态，避免假功能。
4. LIS 导入上传区域改为真实文件读取，符合任务目标。
5. 库位删除从原生 `confirm()` 改为 `ConfirmDialog`，符合项目标准模式。
6. 额外修改 `Locations.tsx` 可以接受，因为 `ConfirmDialog` 必须在 JSX 树中渲染，且改动最小。

非阻断建议:

1. `ImportLisModal` 上传区域文案仍写“点击粘贴LIS数据”，后续可改为“点击上传LIS数据文件，或在下方粘贴数据”。
2. `confirmDelete` 删除失败时保持弹窗打开是可接受行为，后续可增加 loading 防重复点击。

## 二、当前不建议继续让第二台改代码

原因:

1. 第二台已经完成一轮代码修改，需要先由主会话整合和验证。
2. 当前项目存在更大的全局构建阻断，继续局部修复容易扩大冲突。
3. `collaboration/2026-06-12-scan-report` 与主会话分支已有分叉，需要先明确合并策略。

第二台设备下一步只做只读工作，不再提交业务代码，直到主会话发新任务单。

## 三、第二台设备下一步任务

### 任务: 全局构建阻断只读盘点

执行方: 第二台设备

修改权限: 禁止修改代码

目标:

根据主会话发现的构建问题，盘点全局阻断来源，形成报告。

只读检查项:

1. `src/main.tsx` 引用 `./App`，但 `src/App` 是否缺失。
2. `@/components/ui/Modal` 是否缺失。
3. `@/components/ui/Pagination` 是否缺失。
4. `@/hooks/usePagination` 是否缺少 `UsePaginationReturn` 类型导出。
5. 是否有明显缺失的页面组件或 hook，例如 `useBOMPage`、`useInventoryPage`、`useSuppliersPage`。

建议命令:

```bash
rg -n "from './App'|from '@/components/ui/Modal'|from '@/components/ui/Pagination'|UsePaginationReturn|useBOMPage|useInventoryPage|useSuppliersPage" 前端代码/src
rg --files 前端代码/src | rg "App|Modal|Pagination|useBOMPage|useInventoryPage|useSuppliersPage"
```

交付:

新增报告文件:

`docs/collaboration-workflow/reports/2026-06-12-build-blocker-inventory.md`

报告格式:

| 阻断项 | 被引用位置 | 实际文件是否存在 | 建议处理方 | 备注 |
|:---|:---|:---:|:---|:---|

提交要求:

```bash
git add docs/collaboration-workflow/reports/2026-06-12-build-blocker-inventory.md .claude/session-log/2026-06-12.md
git commit -m "docs(collaboration): inventory frontend build blockers"
git push
```

## 四、主会话下一步任务

主会话负责代码稳定化:

1. 合并或 cherry-pick 第二台的 `f576547`，确认额外 `Locations.tsx` 改动可接受。
2. 修复最前置构建阻断:
   - `前端代码/src/App.tsx` 缺失。
   - `前端代码/src/components/ui/Modal.tsx` 缺失。
   - `前端代码/src/components/ui/Pagination.tsx` 缺失。
   - `前端代码/src/hooks/usePagination.ts` 缺少 `UsePaginationReturn` 类型导出。
3. 运行:

```bash
/Users/maxiaoyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -b --pretty false
```

4. 将剩余错误分成:
   - 缺失文件。
   - API 返回类型不一致。
   - 未使用变量。
   - 业务口径待定。

## 五、新开会话策略

当前会话可以继续处理本轮审查和任务分配，但建议在以下任一条件满足时新开主会话:

1. 准备正式整合第二台代码并进入大规模构建修复前。
2. 当前聊天中活跃分支超过 3 条。
3. 同时存在超过 5 个未完成任务单。
4. 需要连续处理 20 个以上 TypeScript 构建错误。
5. 主会话开始出现遗漏最新分支、提交或任务边界的迹象。

## 六、新会话稳定衔接规则

新主会话启动前，旧主会话必须更新一个 handoff 文件:

`docs/collaboration-workflow/handoff/current-main-session.md`

必须包含:

1. 当前日期和时区。
2. 当前主分支和第二台分支。
3. 最近关键提交:
   - 主会话最新提交。
   - 第二台最新提交。
4. 已完成事项。
5. 未合并事项。
6. 禁止触碰文件。
7. 下一步第一条命令。
8. 当前已知构建阻断。
9. 需要用户决策的问题。

新会话启动后第一步:

```bash
sed -n '1,260p' AGENTS.md
sed -n '1,260p' docs/collaboration-workflow/handoff/current-main-session.md
git status --short
```

只有读完 handoff 后，才允许继续改代码。

## 七、合并节奏

建议合并顺序:

1. 主会话完成构建基础组件补齐。
2. 主会话审查并吸收 `f576547`。
3. 第二台提交构建阻断盘点报告。
4. 主会话根据报告拆下一批任务。
5. 每批只允许一个主题，避免同时修 UI、API、构建和业务口径。
