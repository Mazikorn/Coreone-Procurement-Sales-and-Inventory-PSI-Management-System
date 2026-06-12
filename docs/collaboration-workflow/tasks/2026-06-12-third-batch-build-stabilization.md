# 任务单: 第三批构建稳定化与双设备扩容协同

> 日期: 2026-06-12
> 来源: 主会话审查第二台设备云端增量
> 目标分支: `collaboration/2026-06-12-scan-report`
> 主会话分支: `codex/governance-docs-accuracy`

## 一、云端改动审查结论

第二台设备本轮新增 2 个提交，整体通过审查:

1. 新增 `docs/collaboration-workflow/reports/2026-06-12-build-blocker-inventory.md`，完成全局构建阻断只读盘点。
2. 新增 `docs/17_Codex_PM_AI_Development_Guide.md`，补充 PM 使用 Codex 推动开发、验收、治理的协作指南。
3. 更新 `docs/00_Project_Governance_Framework.md`，把 `17_Codex_PM_AI_Development_Guide.md` 纳入治理文档分层。

非阻断问题:

1. 构建阻断报告中的汇总数量需要修正:
   - `Modal` 汇总写 10 个文件，当前实际引用文件为 16 个。
   - `Pagination` 汇总写 18 个文件，当前实际引用文件为 21 个。
2. 报告中的明细方向正确，不影响下一批任务执行。

## 二、主会话已处理事项

主会话已在本地完成第一组 P0 构建基础补齐:

1. 新增 `前端代码/src/App.tsx`。
2. 新增 `前端代码/src/components/ui/Modal.tsx`。
3. 新增 `前端代码/src/components/ui/Pagination.tsx`。
4. 更新 `前端代码/src/hooks/usePagination.ts`，导出 `UsePaginationOptions` 与 `UsePaginationReturn`。

验证结果:

```bash
/Users/maxiaoyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -b --pretty false
```

结果: 仍失败，但 `App.tsx`、`Modal.tsx`、`Pagination.tsx`、`UsePaginationReturn` 缺失类错误已消失。

```bash
/Users/maxiaoyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js build
```

结果: 继续失败，当前最前置阻断为:

`src/pages/inbound/Inbound.tsx` 引用缺失的 `./components/InboundDetailModal`。

## 三、下一批分工原则

根据用户反馈，后续每次给双方安排更大的任务包:

1. 第二台设备承担“简单但量大”的缺失组件、缺失导出、报告修正。
2. 主会话承担入口、通用组件、构建主线、审查与合并判断。
3. 每批允许文件范围扩大，但仍必须明确禁止文件。
4. 每批结束必须回传:
   - 修改文件。
   - 运行命令。
   - 结果。
   - 仍未关闭的问题。

## 四、第二台设备第三批任务

执行方: 第二台设备

目标: 批量补齐低风险缺失文件，优先让 Vite build 继续向后推进。

### 允许修改文件

文档:

- `docs/collaboration-workflow/reports/2026-06-12-build-blocker-inventory.md`
- `.claude/session-log/2026-06-12.md`

前端缺失文件补齐:

- `前端代码/src/pages/bom/constants.ts`
- `前端代码/src/pages/bom/hooks/useBOMPage.ts`
- `前端代码/src/pages/alerts/components/AlertTable.tsx`
- `前端代码/src/pages/alerts/components/AlertHandleModal.tsx`
- `前端代码/src/pages/equipment/components/EquipmentTypeFormModal.tsx`
- `前端代码/src/pages/labor/hooks/useLaborTimePage.ts`
- `前端代码/src/pages/labor/components/LaborTimeFormModal.tsx`
- `前端代码/src/pages/dashboard/components/QuickAction.tsx`
- `前端代码/src/pages/dashboard/config/dashboard-roles.ts`

### 禁止修改文件

- `后端代码/server/src/routes/*`
- `前端代码/e2e/*.spec.ts`
- `.github/workflows/*`
- `前端代码/src/components/layout/AppSidebar.tsx`
- `前端代码/src/components/layout/AppLayout.tsx`
- `前端代码/src/components/layout/TopBar.tsx`
- `前端代码/src/App.tsx`
- `前端代码/src/components/ui/Modal.tsx`
- `前端代码/src/components/ui/Pagination.tsx`
- `前端代码/src/hooks/usePagination.ts`
- `前端代码/src/pages/inbound/*`
- `前端代码/src/pages/inventory/*`
- `前端代码/src/pages/master/*`

### 任务内容

1. 修正构建阻断报告汇总数量:
   - `Modal`: 16 个引用文件。
   - `Pagination`: 21 个引用文件。
2. 补齐 BOM 常量与类型 hook:
   - `constants.ts` 必须导出 BOM 页面当前引用的状态、类型、层级、标签等常量。
   - `useBOMPage.ts` 至少导出 `BOMForm`、`CopyForm` 类型。
   - 如果要实现 hook，先保持最小可编译，不扩展业务逻辑。
3. 补齐 alerts、equipment、labor、dashboard 的缺失叶子组件:
   - 优先根据当前页面调用 props 定义接口。
   - 可做最小可用 UI，但不能做假按钮和空壳 toast。
   - 无法确认业务逻辑时，只展示禁用态或提示“待接入”，并在回传中说明。
4. 运行:

```bash
/Users/maxiaoyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -b --pretty false
/Users/maxiaoyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js build
```

5. 如果命令失败，记录新的最前置错误，不要扩大修改范围。

### 提交要求

```bash
git add docs/collaboration-workflow/reports/2026-06-12-build-blocker-inventory.md .claude/session-log/2026-06-12.md 前端代码/src/pages/bom/constants.ts 前端代码/src/pages/bom/hooks/useBOMPage.ts 前端代码/src/pages/alerts/components/AlertTable.tsx 前端代码/src/pages/alerts/components/AlertHandleModal.tsx 前端代码/src/pages/equipment/components/EquipmentTypeFormModal.tsx 前端代码/src/pages/labor/hooks/useLaborTimePage.ts 前端代码/src/pages/labor/components/LaborTimeFormModal.tsx 前端代码/src/pages/dashboard/components/QuickAction.tsx 前端代码/src/pages/dashboard/config/dashboard-roles.ts
git commit -m "fix(frontend/build): add missing leaf components"
git push
```

## 五、主会话第三批任务

执行方: 主会话

目标: 继续推进构建主线，并审查第二台设备产出。

主会话继续处理:

1. 提交并同步 `App.tsx`、`Modal.tsx`、`Pagination.tsx`、`usePagination.ts`。
2. 补齐入库页当前最前置缺失组件:
   - `前端代码/src/pages/inbound/components/InboundDetailModal.tsx`
   - `前端代码/src/pages/inbound/components/InboundFormModal.tsx`
   - `前端代码/src/pages/inbound/components/InboundPrintModal.tsx`
   - `前端代码/src/pages/inbound/components/InboundTable.tsx`
3. 第二台设备提交后，审查其是否只改允许文件。
4. 重新运行 TypeScript 与 Vite build，更新剩余错误分组。

## 六、下一次审查重点

下一次主会话审查第二台设备时重点看:

1. 是否修改了禁止文件。
2. 是否出现假功能、空壳 toast 或无效按钮。
3. 是否只为编译通过而隐藏真实业务错误。
4. 是否把未运行测试写成“已通过”。
5. 是否把报告数量和实际 `rg` 结果保持一致。
