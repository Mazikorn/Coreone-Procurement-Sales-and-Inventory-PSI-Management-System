# 任务单: 扫描报告审核后的下一步

> 日期: 2026-06-12
> 来源: 主会话审核 `collaboration/2026-06-12-scan-report`
> 状态: 待执行

## 一、主会话审核结论

另一台设备的第一次只读扫描产出总体合格，可以采纳。

已确认:

1. 分支 `collaboration/2026-06-12-scan-report` 存在。
2. 相对协作文档基线只新增 2 个文档文件，没有代码修改。
3. 扫描范围符合任务单要求。
4. 关键发现基本准确，包括:
   - `useProjectsPage` 缺失。
   - `LocationCards` 缺失。
   - 库位层级配置 `saveLevelConfigs` 只 toast，不持久化。
   - 成本分析导出为假功能。
   - 成本分析存在 `Math.random()` 模拟同比数据。

需要修正:

1. 报告中的问题总数不一致。
2. `LocationCards` 缺失出现在备注和会话日志中，但未进入问题明细表。
3. P0/P1/P2/P3 数量需要重新核对。
4. 报告需要区分“已确认问题”和“待主会话复核问题”。

## 二、另一台设备下一步任务

### 任务 A: 修正扫描报告

执行方: 另一台设备

修改范围:

- `docs/collaboration-workflow/reports/2026-06-12-second-device-scan-report.md`
- `.claude/session-log/2026-06-12.md`

要求:

1. 重新统计所有问题数量。
2. 把 `LocationCards` 缺失补入“库位管理”问题明细。
3. 重新计算 P0/P1/P2/P3 汇总。
4. 在每个问题后标记状态:
   - `已确认`
   - `待主会话复核`
5. 不修改任何业务代码。

完成后提交:

```bash
git add docs/collaboration-workflow/reports/2026-06-12-second-device-scan-report.md .claude/session-log/2026-06-12.md
git commit -m "docs(collaboration): correct scan report counts"
git push
```

### 任务 B: 等待主会话分配修复任务

报告修正完成后，不要自行开始代码修复，等待主会话确认第二批任务。

## 三、主会话下一步任务

主会话优先处理 P0 编译阻断:

| 问题 | 文件 | 处理方式 |
|:---|:---|:---|
| `useProjectsPage` 缺失 | `前端代码/src/pages/master/Projects.tsx` | 主会话实现完整 hook |
| `LocationCards` 缺失 | `前端代码/src/pages/master/Locations.tsx` | 主会话确认补组件或调整引用 |

这些问题涉及页面主流程、数据获取和组件结构，不交给另一台设备。

## 四、第二批可交给另一台的低风险修复

报告修正后，以下任务可以考虑交给另一台设备:

| 优先级 | 页面 | 问题 | 原因 |
|:---:|:---|:---|:---|
| 1 | 角色权限 | 修复 `sum + userCount || 0` 运算符优先级 | 单行修复，风险低 |
| 2 | 角色权限 | 补齐 keyword/tabType URL 初始化读取 | 模式明确，范围小 |
| 3 | 消耗对账 | 处理无响应导出按钮 | 可选择真实导出或临时移除入口 |
| 4 | 库位管理 | 原生 `confirm` 替换为 `ConfirmDialog` | 组件已存在，适合批量执行 |

## 五、暂不交给另一台的任务

以下任务由主会话处理或等待产品决策:

1. `useProjectsPage` 完整实现。
2. `LocationCards` 组件补齐。
3. 成本分析后端分页。
4. 成本分析同比 `changeRate` 口径。
5. 库位层级配置持久化方案。
6. 角色权限全局统计后端接口。

## 六、执行顺序

1. 另一台修正扫描报告。
2. 主会话处理两个 P0 编译阻断。
3. 主会话验证构建状态。
4. 主会话再分配第二批低风险修复。
5. 另一台按新任务单执行，不自行扩展范围。

## 七、验收标准

本阶段完成标准:

1. 扫描报告数量准确。
2. P0 问题明细完整。
3. 编译阻断进入主会话处理队列。
4. 另一台设备没有修改业务代码。
5. 后续任务边界清楚，不发生文件冲突。
