# 任务单: 第四批构建推进与类型债务分流

> 日期: 2026-06-12
> 来源: 主会话第三批执行结果
> 目标分支: `collaboration/2026-06-12-scan-report`
> 主会话分支: `codex/governance-docs-accuracy`

## 一、当前进度

主会话本轮已处理入库页当前最前置缺失组件:

1. `前端代码/src/pages/inbound/components/InboundFormModal.tsx`
2. `前端代码/src/pages/inbound/components/InboundDetailModal.tsx`
3. `前端代码/src/pages/inbound/components/InboundPrintModal.tsx`
4. `前端代码/src/pages/inbound/components/InboundTable.tsx`
5. `前端代码/src/pages/inbound/hooks/useInboundPage.ts`
6. `前端代码/src/pages/inbound/hooks/useInboundPage.test.ts`
7. `前端代码/src/api/inventory.ts`
8. `前端代码/src/types/index.ts`

验证结果:

```bash
/Users/maxiaoyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vitest/vitest.mjs run src/pages/inbound/hooks/useInboundPage.test.ts
```

结果: 通过，10 个测试全部通过。

```bash
/Users/maxiaoyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js build
```

结果: 继续失败，但最前置阻塞已从入库页推进到告警页:

`src/pages/alerts/Alerts.tsx` 缺失 `./components/AlertTable`。

```bash
/Users/maxiaoyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -b --pretty false
```

结果: 仍失败，主要剩余类型债务分为:

1. 缺失叶子组件或配置文件。
2. axios response interceptor 与 TypeScript 返回类型不一致。
3. 未使用 import 或隐式 any。
4. 少量业务类型字段缺失。

## 二、第二台设备第四批任务

执行方: 第二台设备

目标: 完成第三批缺失叶子组件任务，并额外整理下一层低风险缺失文件。

### 必须先完成第三批未完成项

如果第三批还未完成，先继续第三批，不要跳到第四批:

- `前端代码/src/pages/bom/constants.ts`
- `前端代码/src/pages/bom/hooks/useBOMPage.ts`
- `前端代码/src/pages/alerts/components/AlertTable.tsx`
- `前端代码/src/pages/alerts/components/AlertHandleModal.tsx`
- `前端代码/src/pages/equipment/components/EquipmentTypeFormModal.tsx`
- `前端代码/src/pages/labor/hooks/useLaborTimePage.ts`
- `前端代码/src/pages/labor/components/LaborTimeFormModal.tsx`
- `前端代码/src/pages/dashboard/components/QuickAction.tsx`
- `前端代码/src/pages/dashboard/config/dashboard-roles.ts`

### 第四批新增允许文件

在第三批完成后，可继续处理以下低风险缺失文件:

- `前端代码/src/pages/cost/CostPoolList.tsx`
- `前端代码/src/pages/cost/CostForecast.tsx`
- `前端代码/src/pages/cost/SupplierCostAnalysis.tsx`
- `前端代码/src/pages/cost/EquipmentEfficiency.tsx`
- `前端代码/src/components/ui/CostWaterfall.tsx`
- `前端代码/src/pages/master/hooks/useSuppliersPage.ts`
- `前端代码/src/api/reconciliation.ts`

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
- `前端代码/src/api/inventory.ts`
- `前端代码/src/types/index.ts`

### 第二台设备交付要求

1. 不做假功能按钮，不写空壳 toast。
2. 无法确认真实动作时，按钮禁用或只展示数据，并在回传中说明。
3. 每个新增组件必须根据当前调用方 props 定义接口。
4. 运行:

```bash
/Users/maxiaoyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/typescript/bin/tsc -b --pretty false
/Users/maxiaoyuan/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node ./node_modules/vite/bin/vite.js build
```

5. 回传内容必须包含:
   - 修改文件列表。
   - 是否有超范围文件。
   - 两条命令的结果。
   - 当前 Vite build 的最前置错误。
   - 当前 TypeScript 错误数量或主要分组。

## 三、主会话第四批任务

执行方: 主会话

目标: 继续守住构建主线，并审查第二台设备产出。

主会话继续处理:

1. 审查第二台设备是否只改允许文件。
2. 第二台设备完成缺失组件后，重新运行 Vite build，定位下一处最前置阻塞。
3. 分批处理 axios 返回类型债务:
   - 优先在局部 hook 做安全收敛。
   - 如果同类问题超过 20 处，再评估是否集中调整 `request.ts` 类型。
4. 保持入库页单测通过。
5. 不接手第二台已分配的简单批量补文件，除非它的产出阻塞主线。

## 四、是否需要新开会话

当前不需要切换会话。

触发新会话或会话交接的条件:

1. 当前会话继续处理后，`tsc` 剩余错误仍超过 100 且需要全局类型方案。
2. 需要集中重构 `request.ts`、API 类型层或大量页面 hook。
3. 第二台设备连续两批出现超范围修改，需要单独开审查会话。
4. 主会话上下文开始影响判断，例如无法稳定区分已完成任务、待审查分支、禁止文件。

如果触发以上任一条件，主会话先通知用户，再创建新的交接文档，不直接切换。

## 五、下一次主会话审查清单

1. `git diff --name-only origin/main...HEAD` 检查是否越界。
2. 对每个新增组件确认:
   - props 与调用方匹配。
   - 没有未接入的可点击假功能。
   - loading、empty、disabled 状态基本存在。
3. 重新运行 Vite build，记录新的最前置阻塞。
4. 重新运行 TypeScript，按缺失文件、axios 类型、未使用 import、业务字段四类归档。
