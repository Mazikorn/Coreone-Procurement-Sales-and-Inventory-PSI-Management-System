# 第十七批 P1 API Schema 修复报告

> 日期：2026-06-15 14:23 CST
> 执行分支：`codex/master-aligned-integration-2026-06-15`
> 任务类型：主设备修复

## 一、输入

第二台设备第十六批报告确认：

- 样式丢失未复现。
- dev server 和 preview server 页面样式均正常。
- `/api/v1/reports/cost-by-material` 已恢复 200。
- `/api/v1/inbound/stats` 仍返回 500，错误为 `no such column: is_deleted`。
- `/api/v1/purchase-orders` 仍返回 500，错误为 `no such column: is_deleted`。

## 二、根因

数据库兼容迁移存在时序缺口：

- `purchase_orders.is_deleted` 的兼容迁移位于 `purchase_orders` 建表之前。
- 新库初始化时迁移会被跳过，随后建表语句又未包含 `is_deleted`。
- 旧库若缺少 `inbound_records.is_deleted`，现有迁移也没有统一兜底。
- 因此页面入口 API 在真实数据库上可能出现 `no such column: is_deleted`。

## 三、修复

已完成：

- `purchase_orders` 建表语句新增 `is_deleted INTEGER NOT NULL DEFAULT 0`。
- 统一 schema 兜底中新增：
  - `ensureColumn('inbound_records', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0')`
  - `ensureColumn('purchase_orders', 'is_deleted', 'INTEGER NOT NULL DEFAULT 0')`
- 全成本集成测试增加两个页面入口 API 回归断言：
  - `/api/v1/inbound/stats`
  - `/api/v1/purchase-orders`

保留上一批已加入的断言：

- `/api/v1/reports/cost-by-material`

## 四、验证

后端：

- `npm run build`：通过
- `npm test`：通过
  - 8 个 test files
  - 87 个 tests
  - 测试服务器正常关闭
- 真实服务启动：通过
- 登录后真实请求：
  - `/api/v1/inbound/stats`：200
  - `/api/v1/purchase-orders`：200
  - `/api/v1/reports/cost-by-material`：200

前端：

- `npx tsc --noEmit`：通过
- `npm run build`：通过
  - Vite chunk size warning 仍存在，与前几批一致，不作为阻断。

## 五、当前判断

第十六批报告中的两个剩余 P1 API 已修复。

样式丢失在主设备和第二台设备均未复现，当前不再作为已确认阻断，但仍要求合并前做一次最终截图复核。

下一步建议第二台设备执行第十八批最终轻量复核：

- 基于最新 `origin/codex/master-aligned-integration-2026-06-15`。
- 只验证三个 P1 API、前端构建、dev/preview 样式截图。
- 若全部通过，可进入 PR / 合并准备。

---

*执行者：主设备*
