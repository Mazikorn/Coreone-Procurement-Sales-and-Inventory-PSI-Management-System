# 任务单: 另一台设备只读扫描

> 日期: 2026-06-12
> 执行方: 另一台设备
> 任务类型: 只读扫描
> 修改权限: 禁止修改代码

## 目标

扫描 5 个待确认页面，确认它们是否存在共性前端问题，为下一批批量修复提供依据。

## 扫描范围

只扫描以下页面相关文件:

| 页面 | 建议路径 |
|:---|:---|
| 库位管理 | `前端代码/src/pages/locations/` |
| 检测项目 | `前端代码/src/pages/projects/` |
| 消耗对账 | `前端代码/src/pages/reconciliation/` |
| 物料成本分析 | `前端代码/src/pages/cost-analysis/` |
| 角色权限 | `前端代码/src/pages/roles/` |

如果某个目录不存在，用 `rg --files 前端代码/src/pages | rg '关键字'` 搜索实际路径。

## 检查项

每个页面检查以下问题:

1. 是否仍是前端分页，而不是后端分页。
2. 筛选条件是否没有同步到 URL。
3. 删除或危险操作是否使用浏览器原生 `confirm`。
4. 导入、导出、打印、扫码是否只是模拟功能。
5. 是否存在硬编码统计数字、演示数据或 fallback 数据。
6. 是否存在按钮只 `toast`，但没有调用真实 API。
7. 是否存在明显的空函数或 TODO。

## 禁止修改

禁止修改以下范围:

| 路径 | 原因 |
|:---|:---|
| `后端代码/server/src/routes/*` | 后端路由归主会话或会话A审核 |
| `前端代码/src/components/layout/*` | 权限和布局组件已由会话A维护 |
| `.github/workflows/*` | CI 配置不在本任务范围 |
| `前端代码/src/pages/inbound/Inbound.tsx` | 当前由主会话审核 |
| `前端代码/src/pages/outbound/Outbound.tsx` | 当前由主会话审核 |
| `前端代码/src/pages/inventory/InventoryList.tsx` | 当前由主会话审核 |

## 建议命令

```bash
rg -n "confirm\\(|window.confirm|toast\\.|TODO|FIXME|export|导出|打印|扫码|mock|demo|hardcode|\\|\\| [0-9]" 前端代码/src/pages/locations 前端代码/src/pages/projects 前端代码/src/pages/reconciliation 前端代码/src/pages/cost-analysis 前端代码/src/pages/roles
```

```bash
rg -n "slice\\(|pageSize|currentPage|URLSearchParams|useSearchParams|setSearchParams" 前端代码/src/pages/locations 前端代码/src/pages/projects 前端代码/src/pages/reconciliation 前端代码/src/pages/cost-analysis 前端代码/src/pages/roles
```

## 交付格式

按 `docs/collaboration-workflow/templates/scan-report-template.md` 填写报告。

报告必须包含:

1. 扫描时间。
2. 扫描页面。
3. 每个问题的文件位置。
4. 严重级别。
5. 建议修复方式。
6. 未确认项。

## 完成标准

主会话能够根据报告直接决定:

1. 哪些页面可以交给另一台设备批量修复。
2. 哪些页面必须由主会话处理。
3. 哪些问题暂时不进入今天范围。
