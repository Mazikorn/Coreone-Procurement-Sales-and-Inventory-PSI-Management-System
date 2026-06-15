# 第十五批样式异常与 P1 API 跟进报告

> 日期：2026-06-15 13:55 CST
> 执行分支：`codex/master-aligned-integration-2026-06-15`
> 任务类型：主设备修复与合并前风险复核

## 一、背景

第二台设备第十四批回归结论为：分支关系正确，后端验证通过，前端验证通过，8/10 页面完全通过，2 个页面存在非阻断 500，建议进入 PR / 合并准备。

用户随后补充关键现象：前端页面打开后组件样式全部丢失。

该现象影响真实可用性，不能按普通非阻断项处理。在未复现或明确排除前，PR / 合并准备需暂停。

## 二、样式异常复核

主设备使用本地浏览器分别检查：

- 前端 dev server：`http://127.0.0.1:8080`
- 前端 preview server：`http://127.0.0.1:4173`

检查页面：

- 登录页
- Dashboard

主设备结果：

- 登录页背景、表单、按钮、间距均正常。
- Dashboard 侧边栏、导航高亮、卡片、布局均正常。
- CSS 规则已加载，Tailwind utility class 生效。
- 本机未复现“组件样式全部丢失”。

当前判断：

- 样式问题仍视为合并前风险。
- 需要第二台设备记录更完整复现信息：分支 SHA、打开方式、URL、是否 dev / preview / 静态文件、浏览器截图、控制台和 Network 中 CSS 状态。
- 若第二台仍能稳定复现，则必须先修样式链路，再进入 PR / 合并。

## 三、P1 API 修复

第二台报告的 P1 接口：

- `/api/v1/inbound/stats`
- `/api/v1/purchase-orders`
- `/api/v1/reports/cost-by-material`

主设备真实服务复测：

- `/api/v1/inbound/stats`：200
- `/api/v1/purchase-orders`：200
- `/api/v1/reports/cost-by-material`：修复前可复现 500，修复后 200

已定位根因：

- `reports/cost-by-material` 查询 `return_records.total_cost`。
- 新建库的 `return_records` 建表语句缺少 `unit_cost`、`total_cost`、`is_deleted`。
- 旧库迁移也缺少对应列补齐。
- 测试环境使用新库路径，因此能暴露该问题。

已完成修复：

- 新建库建表时为 `return_records` 增加 `unit_cost`、`total_cost`、`is_deleted`。
- 为旧库迁移补齐 `return_records` 的 `unit_cost`、`total_cost`、`is_deleted`。
- 顺手补齐 `stocktaking_records`、`scrap_records` 的 `is_deleted`，避免同类软删除字段在新库和旧库之间不一致。
- 在全成本集成测试中增加 `/api/v1/reports/cost-by-material` 200 回归断言。

## 四、验证结果

后端：

- `npm run build`：通过
- `npm test`：通过
  - 8 个 test files
  - 87 个 tests
- 真实后端服务启动：通过
- 登录后请求：
  - `/api/v1/inbound/stats`：200
  - `/api/v1/purchase-orders`：200
  - `/api/v1/reports/cost-by-material`：200

前端：

- `npx tsc --noEmit`：通过
- `npm run build`：通过
  - Vite chunk size warning 与前几批一致，不作为本批阻断。

## 五、当前结论

代码侧 P1 API 已修复并通过回归。

但用户观察到的样式丢失尚未在主设备复现，仍是 PR / 合并前必须关闭的风险项。

进入 PR / 合并准备的条件调整为：

1. 第二台基于最新 `origin/codex/master-aligned-integration-2026-06-15` 重新回归。
2. 三个 P1 API 均返回 200。
3. 前端 dev 和 preview 至少各截图一次，确认组件样式未丢失。
4. 若样式仍丢失，第二台必须提交可复现证据，不建议合并。

---

*执行者：主设备*
