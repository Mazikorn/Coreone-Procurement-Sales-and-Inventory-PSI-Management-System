# 第五批协作任务：第三/四批审核返工 + 主线继续推进

> 日期：2026-06-12  
> 分支：`collaboration/2026-06-12-scan-report`  
> 目标：先修正第三/四批审核发现，再继续清理构建阻塞。第二台设备负责简单但量大的低风险任务；主会话负责复杂页面主线和最终审核。

## 一、第三/四批审核结论

第三/四批整体方向正确：补齐了多个缺失 leaf component/hook，让构建从“缺模块”阶段继续向前推进。但本轮不能直接放行，存在两个必须返工的问题。

### P1 必须返工：`reconciliation` API 路径重复

文件：`前端代码/src/api/reconciliation.ts`

当前新增 API 使用了 `/api/v1/reconciliation/...`。项目的 `request.ts` 已经配置 `baseURL: '/api/v1'`，因此实际请求会变成：

```text
/api/v1/api/v1/reconciliation/...
```

处理要求：

- 所有 reconciliation API 路径去掉前缀 `/api/v1`。
- 正确格式示例：`request.get('/reconciliation/cases')`。
- 修完后检查同文件内所有 `get/post/put/delete` 路径，不允许遗漏。

### P1 必须返工：`labor` hook 仍有假功能

文件：`前端代码/src/pages/labor/hooks/useLaborTimePage.ts`

当前问题：

- hook 内仍使用本地模拟数据。
- `handleSubmit` / `handleDelete` 只做 toast 和 refresh，没有真实 API 持久化。
- 这会让用户以为“新增/删除成功”，实际刷新后数据不存在。

处理要求：

- 优先接入现有 `laborTimeApi.getList/create/update/delete`。
- 如果某个操作没有后端接口，则禁用对应按钮或弹窗确认按钮，并在任务日志里说明“未接入，不伪装成功”。
- 禁止保留 mock 数据作为默认业务数据。
- 禁止 toast-only 成功。

### P1 流程问题：本轮分支包含入库页面新增文件

本轮对比范围出现了：

- `前端代码/src/pages/inbound/components/InboundDetailModal.tsx`
- `前端代码/src/pages/inbound/components/InboundFormModal.tsx`
- `前端代码/src/pages/inbound/components/InboundPrintModal.tsx`
- `前端代码/src/pages/inbound/components/InboundTable.tsx`

入库页面属于主会话负责范围。第二台设备不要继续修改 `前端代码/src/pages/inbound/*`。如果这些文件是从主会话同步过来的，请在 session log 中明确来源；如果是第二台独立改动，请停止扩展该范围，等待主会话合并。

## 二、第二台设备第五批任务

### 任务 5A：审核返工，必须先做

允许文件：

- `前端代码/src/api/reconciliation.ts`
- `前端代码/src/pages/labor/hooks/useLaborTimePage.ts`
- `前端代码/src/pages/labor/components/LaborTimeFormModal.tsx`（仅当禁用或接线需要）
- `.claude/session-log/2026-06-12.md`
- `docs/collaboration-workflow/reports/2026-06-12-build-blocker-inventory.md`

验收标准：

- `reconciliation.ts` 不再出现 `/api/v1/` 字符串。
- `useLaborTimePage.ts` 不再包含业务 mock 列表作为默认数据。
- 新增/编辑/删除至少一种处理方式成立：
  - 已接真实 API 并能失败提示；
  - 或明确禁用，不展示成功 toast。
- 提交信息建议：`fix(frontend/labor-reconciliation): address review blockers`

### 任务 5B：继续做低风险缺模块清理

完成 5A 后再做 5B。

允许文件：

- `前端代码/src/pages/master/components/LocationCards.tsx`
- `前端代码/src/pages/master/Locations.tsx`（仅允许接入 `LocationCards`，不重写页面逻辑）
- `前端代码/src/pages/master/hooks/useProjectsPage.ts`（仅当构建明确报缺失/导出错误）
- `前端代码/src/pages/master/components/Project*.tsx`（仅当构建明确报缺失）
- `.claude/session-log/2026-06-12.md`
- `docs/collaboration-workflow/reports/2026-06-12-build-progress-after-batch-5.md`

禁止文件：

- `前端代码/src/pages/inbound/*`
- `前端代码/src/pages/inventory/*`
- `前端代码/src/components/layout/*`
- `前端代码/e2e/*`
- `.github/workflows/*`
- `后端代码/server/src/routes/*`

执行方式：

1. 先做 5A 并提交。
2. 运行构建，记录第一个阻塞点。
3. 只补“缺文件/缺导出/轻量展示组件”，不做复杂业务重构。
4. 每次最多处理 3-5 个缺模块点，处理后再运行构建。
5. 写报告：本批修了什么、build 从哪里推进到哪里、剩余第一个阻塞点是什么。

## 三、主会话当前任务

主会话继续负责：

- `前端代码/src/pages/inventory/*`
- inventory 页面 hook、出库选择、批量出库/报废、详情弹窗、耗尽弹窗。
- 审核第二台 5A/5B 产出。
- 合并前最终判断哪些改动可以进入主线。

主会话本轮已处理：

- 新增 `useInventoryPage`。
- 新增 `MaterialSelectorModal` / `InventoryDetailModal` / `EditRemainModal` / `ConfirmDepleteModal`。
- 修正 inventory 内部类型对接，使 inventory 相关 TypeScript 检查不再输出新错误。

当前本机限制：

- 本机 shell 没有 GitHub HTTPS 凭据，不能直接 `git fetch`/`git push`。
- 云端审核通过 GitHub connector 完成。
- 本机 build 暂停在本地未同步的 `QuickAction` 缺失；远端分支已包含该文件，所以这不是 inventory 主线的新错误。

## 四、何时新开会话

暂时不需要新开会话。满足任一条件时再切换：

- inventory 主线修完后，构建进入跨页面类型错误清理，单次上下文开始混杂超过 3 个模块。
- 第二台第五批完成后，需要一次“云端分支合并评审 + 新一轮任务拆分”。
- 当前会话无法稳定记住分工边界或最近 3 批审核结论。

新会话衔接必须带上：

- 本文件路径。
- 最新分支名和最后提交 SHA。
- 最近一次 build 的第一个阻塞点。
- 主会话负责范围与第二台禁止文件清单。
