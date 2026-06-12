# 任务单: 第二批低风险修复

> 日期: 2026-06-12
> 执行方: 另一台设备
> 来源: 修正版扫描报告 v2
> 修改权限: 仅限本任务列出的文件

## 一、任务目标

在主会话处理 P0 编译阻断的同时，另一台设备处理低风险、边界清楚的问题。

本任务不处理:

1. `useProjectsPage` 缺失。
2. `LocationCards` 缺失。
3. 库位层级配置持久化。
4. 成本分析后端分页。
5. 成本分析 `changeRate` 业务口径。
6. 任何后端接口改造。

## 二、允许修改文件

只允许修改以下文件:

| 页面 | 文件 |
|:---|:---|
| 角色权限 | `前端代码/src/pages/system/hooks/useRolesPage.ts` |
| 消耗对账 | `前端代码/src/pages/reconciliation/components/CaseListTab.tsx` |
| 消耗对账 | `前端代码/src/pages/reconciliation/components/ImportLisModal.tsx` |
| 库位管理 | `前端代码/src/pages/master/hooks/useLocationsPage.ts` |

如果发现必须修改其他文件，先停止并反馈主会话，不要自行扩大范围。

## 三、禁止修改文件

禁止修改:

| 路径 | 原因 |
|:---|:---|
| `后端代码/server/src/routes/*` | 后端不在本任务范围 |
| `前端代码/src/pages/master/Projects.tsx` | 主会话处理 |
| `前端代码/src/pages/master/Locations.tsx` | 主会话处理 |
| `前端代码/src/pages/master/components/LocationCards.tsx` | 主会话处理 |
| `前端代码/src/pages/master/hooks/useProjectsPage.ts` | 主会话处理 |
| `前端代码/src/pages/report/*` | 成本分析业务口径未定 |
| `前端代码/src/pages/cost/*` | 成本分析业务口径未定 |
| `.github/workflows/*` | CI 配置不在本任务范围 |

## 四、具体任务

### 任务 1: 角色权限 URL 初始化

文件:

- `前端代码/src/pages/system/hooks/useRolesPage.ts`

问题:

- 当前 `keyword` 和 `tabType` 会写入 URL，但初始化没有从 URL 读取，刷新页面会丢失筛选条件。

要求:

1. 初始化 `keyword` 时读取 `get('keyword')`。
2. 初始化 `tabType` 时读取 `get('tab')`。
3. 只允许 `all/system/custom` 三种 tab 值。
4. 不改变现有分页逻辑。

验收:

- URL `?keyword=abc&tab=custom` 打开后，页面状态能恢复。

### 任务 2: 角色权限运算符优先级

文件:

- `前端代码/src/pages/system/hooks/useRolesPage.ts`

问题:

- `sum + userCount || 0` 运算符优先级不清晰，可能导致统计值异常。

要求:

1. 改为 `sum + (userCount || 0)`。
2. 不改 stats 的整体计算方式，后续全局统计由主会话评估。

验收:

- TypeScript 无报错。
- stats 中 `assignedUsers` 不再依赖错误优先级。

### 任务 3: 消耗对账导出按钮

文件:

- `前端代码/src/pages/reconciliation/components/CaseListTab.tsx`

问题:

- “导出”按钮没有 `onClick`，用户点击无响应。

要求:

1. 如果当前组件能拿到表格数据，则用 `xlsx` 导出当前列表。
2. 如果数据结构不足以导出，则先移除按钮或禁用按钮，并用清晰的 disabled 样式表达不可用。
3. 不添加假 toast，不做“导出成功”模拟。

验收:

- 按钮不能再是无响应空按钮。
- 不引入假功能。

### 任务 4: 消耗对账上传区域

文件:

- `前端代码/src/pages/reconciliation/components/ImportLisModal.tsx`

问题:

- 上传区域只 toast 提示，非真实文件上传。

要求:

1. 如果能低风险接入文件选择，则添加隐藏 `<input type="file">`，读取文本内容填入现有 textarea。
2. 如果实现成本超出范围，则移除可点击上传区域，保留 textarea 导入方式。
3. 不添加假功能。

验收:

- 点击上传区域不再只是 toast。
- 用户可以明确知道当前导入方式。

### 任务 5: 库位管理原生 confirm

文件:

- `前端代码/src/pages/master/hooks/useLocationsPage.ts`

问题:

- 删除库位仍使用浏览器原生 `confirm()`。

要求:

1. 优先复用已有确认弹窗模式。
2. 如果需要改动 `Locations.tsx` 或新增弹窗组件，先停止并反馈主会话。
3. 不碰 `LocationCards` 缺失问题。

验收:

- 不再使用原生 `confirm()`。
- 删除行为仍调用 `locationApi.delete(id)`。

## 五、提交要求

完成后执行:

```bash
git status --short
git diff --name-only
```

确认只包含允许文件后提交:

```bash
git add 前端代码/src/pages/system/hooks/useRolesPage.ts 前端代码/src/pages/reconciliation/components/CaseListTab.tsx 前端代码/src/pages/reconciliation/components/ImportLisModal.tsx 前端代码/src/pages/master/hooks/useLocationsPage.ts
git commit -m "fix(frontend/common): address low-risk scan findings"
git push
```

## 六、完成后汇报

请汇报:

1. 修改文件列表。
2. 每个任务是否完成。
3. 未完成原因。
4. 执行过的测试或检查命令。
5. 是否有超出任务范围的发现。
