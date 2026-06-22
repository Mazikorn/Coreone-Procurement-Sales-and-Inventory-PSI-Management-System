# COREONE 角色权限矩阵

> **版本**: 1.0.0
> **创建日期**: 2026-06-11
> **依据来源**: `后端代码/server/src/app.ts`、`后端代码/server/src/middleware/auth.ts`、`后端代码/server/src/routes/` 当前可见路由文件、`前端代码/src/lib/permissions.ts`、`前端代码/src/components/layout/AppSidebar.tsx`、`前端代码/src/components/layout/AppLayout.tsx`、`前端代码/e2e/roles.spec.ts`
> **维护者**: Codex（从代码反推，PM 审核确认）

---

## 0. 当前核对结论

2026-06-11 核对结论：权限矩阵只能作为“设计与代码核对表”，不能单独证明权限已闭环。目标分支合并前必须同时核对 `app.ts`、`routes/` 实际文件、前端 `ROLE_MENU_MAP`、页面路由守卫和角色 E2E 结果。

2026-06-16 PR #1 E2E 结论：PR 已 Ready for review，head SHA `d97efa991fee4797a7ccc8c3a6d684925d584da7`；GitHub Actions `E2E Tests / e2e` 已通过，`mergeStateStatus=CLEAN`。此前 technician `/outbound` 页面访问失败项已不再阻断：前端 `ROLE_MENU_MAP` 不给 technician `/outbound`，E2E 已验证页面拦截。PM 已确认权限口径按建议处理：默认采用最小权限原则，后续应将后端 `/api/v1/outbound` 只读权限收敛到与前端页面口径一致；除非 PM 后续提出明确业务场景，否则不为 technician/pathologist 保留出库 API 只读权限。

2026-06-20 角色故事 006 复核结论：后端 `/api/v1/outbound` 已改为严格 `admin, warehouse_manager`，与前端 `/outbound` 入口一致；technician/pathologist 不再保留出库 API 只读权限。退库、供应商退货、普通出库和 BOM 出库均补充操作日志和库存预警联动验证。

2026-06-20 角色故事 009 复核结论：finance 已补齐 `/projects`、`/bom` 前端只读入口，以及项目/BOM/物料后端只读权限，用于承接技术建模上下文；finance 写项目/BOM/物料仍拒绝。ABC 作业中心、成本动因、成本池和 BOM 收费映射写操作已补齐审计；收费标准启用状态兼容历史 `active`、`1`、数字 `1`。

2026-06-20 角色故事 013 复核结论：新增 `manager` 管理者只读经营洞察角色和标准账号 `guanli`。manager 仅可进入 `/`, `/alerts`, `/inventory`, `/abc/dashboard`, `/abc/trend`, `/abc/profitability`，后端只授予 `inventory:view`, `alerts:view`, `cost_analysis:view`，不能处理预警、执行出入库、维护系统用户/角色、消耗对账或写 ABC 配置。

2026-06-21 自定义成本只读角色复核结论：前后端已区分 `cost_analysis:view` 和 `cost_analysis`。`cost_analysis:view` 只承接成本看板、切片成本、盈利分析、收费对照和成本趋势等只读洞察；不会显示或读取消耗对账、间接成本中心、作业中心、成本动因、成本池、收费映射或收费标准等财务执行/配置工作台。裸 `cost_analysis` 仍保留完整财务成本作业入口，用于真正承担对账、配置和成本归集的自定义财务岗位。

2026-06-22 病理医生只读洞察复核结论：pathologist 不再直接读取 `/api/v1/materials` 物料主数据接口；医生继续通过项目、BOM、设备、工时、库存和成本洞察页接收必要上下文，避免医生角色绕过页面进入仓储/主数据事实维护面。finance 仍保留 `materials:view` 后端只读能力，用于收费映射和成本口径解释。

2026-06-22 使用中批次/耗尽复核结论：`/api/v1/depletion` 已明确为 admin、warehouse_manager、pathologist、finance 可读；写入动作（创建使用中记录、调整剩余量、确认耗尽）仅 admin、warehouse_manager 可执行。前端库存页中 warehouse_manager 可在“使用中/已耗尽”完成批次余量调整和耗尽确认，pathologist/finance 只读回看，不显示执行按钮。

2026-06-22 管理者成本洞察口径复核结论：manager 仍保持只读经营洞察边界，不读取财务配置工作台；`/api/v1/abc/dashboard`、`/api/v1/abc/profitability` 和 `/api/v1/abc/slide-cost-trend` 已返回 `insightQuality`，盈利性分析额外返回 `insightQualityByMonth` 支撑跨月口径审阅，页面会提示未关账、开放异常、未补算和成本快照覆盖情况，避免管理者把过程数据当最终经营口径。

2026-06-22 管理员归档治理复核结论：admin 清理操作日志前生成的外部归档包会记录外部存储治理状态；未配置、配置无效、已声明、留存期限不足会被区分展示。若 `retentionUntil` 已过期，后端返回 `storageGovernance.status=insufficient_retention`，日志页显示“留存期限不足”，避免管理员把过期留存锁/WORM 声明当作合格审计证据。

## 0.1 权限控制架构

COREONE 采用 **后端双层 + 前端三层** 的权限控制架构：

```
后端第一层: app.ts 路由注册时 requireRole(...roles) 做角色白名单或模块权限兜底；requireStrictRole(...) 做严格角色白名单
后端第二层: 路由文件内部端点级 requireRole()/requireStrictRole() 控制读写边界
前端第一层: AppLayout.tsx 路由守卫 — ROLE_MENU_MAP 路径白名单精确匹配
前端第二层: AppSidebar.tsx 侧边栏菜单过滤 — 只显示有权限的菜单
前端第三层: permissions.ts ROLE_MENU_MAP 角色-路径映射表
```

**admin 特殊规则**：admin 角色在后端 `auth.ts` 中直接放行（`user.role === 'admin'` 时跳过权限检查并记录审计日志）。

**自定义角色成本权限规则**：`cost_analysis:view` 表示“查看成本结果与洞察”，不表示“执行财务成本作业”。因此前端只给 `/abc/dashboard`、`/abc/slide-cost`、`/abc/profitability`、`/abc/fee-comparison`、`/abc/trend`；后端也拒绝其读取间接成本中心、作业中心、成本动因、成本池、收费映射和收费标准等配置工作台。需要消耗对账、间接成本、收费映射或 ABC 配置入口时，应授予模块级 `cost_analysis` 或使用标准 `finance` 角色。

---

## 1. 系统角色列表

| 角色代码 | 角色名称 | 业务职责 |
|----------|----------|----------|
| `admin` | 系统管理员 | 全部功能 |
| `warehouse_manager` | 仓库管理员 | 入库、出库、盘点、退库、报废、调拨、库位管理；BOM 出库时只读选择项目/BOM |
| `technician` | 技术员 | 维护项目、BOM、设备和工时；查看库存、消耗对账和切片成本；不直接执行或读取仓库出库台账，不维护财务配置 |
| `pathologist` | 病理医生 | 查看项目、成本报表、全成本分析 |
| `procurement` | 采购员 | 采购订单、供应商管理 |
| `finance` | 财务 | 成本报表、ABC 分析、间接成本、成本对账；只读接收项目/BOM/物料上下文用于收费映射 |
| `manager` | 管理者 | 只读查看首页、库存、预警、成本看板、成本趋势和盈利分析，用于发现经营风险 |

---

## 2. 前端页面权限矩阵（ROLE_MENU_MAP）

以下为 `前端代码/src/lib/permissions.ts` 中 `ROLE_MENU_MAP` 的完整映射。Y = 可访问，- = 不可访问。

### 2.1 ROLE_MENU_MAP 路径映射

| 功能模块 | 路径 | admin | warehouse_manager | technician | procurement | finance | pathologist | manager |
|----------|------|:-----:|:-----------------:|:----------:|:-----------:|:-------:|:-----------:|:-------:|
| 仪表盘 | `/` | Y | Y | Y | Y | Y | Y | Y |
| 预警中心 | `/alerts` | Y | Y | Y | Y | Y | Y | Y |
| 入库管理 | `/inbound` | Y | Y | - | - | - | - | - |
| 库存列表 | `/inventory` | Y | Y | Y | Y | - | Y | Y |
| 出库管理 | `/outbound` | Y | Y | - | - | - | - | - |
| 退库管理 | `/returns` | Y | Y | - | - | - | - | - |
| 退货给供应商 | `/supplier-returns` | Y | Y | - | Y | - | - | - |
| 调拨管理 | `/transfers` | Y | Y | - | - | - | - | - |
| 报废管理 | `/scraps` | Y | Y | - | - | - | - | - |
| 库存盘点 | `/stocktaking` | Y | Y | - | - | - | - | - |
| 成本看板 | `/abc/dashboard` | Y | - | - | - | Y | Y | Y |
| 切片成本 | `/abc/slide-cost` | Y | - | Y | - | Y | Y | - |
| 盈利分析 | `/abc/profitability` | Y | - | - | - | Y | Y | Y |
| 收费对照 | `/abc/fee-comparison` | Y | - | - | - | Y | Y | - |
| 收费映射 | `/abc/fee-mappings` | Y | - | - | - | Y | - | - |
| 成本趋势 | `/abc/trend` | Y | - | - | - | Y | Y | Y |
| 成本池 | `/abc/cost-pools` | Y | - | - | - | Y | - | - |
| 消耗对账 | `/reconciliation` | Y | - | Y | - | Y | - | - |
| 物料成本分析 | `/cost-analysis` | - | - | - | - | - | - | - |
| ABC 配置 | `/abc/activity-centers` | Y | - | - | - | Y | - | - |
| 采购订单 | `/purchase-orders` | Y | Y | - | Y | - | - | - |
| 供应商管理 | `/suppliers` | Y | Y | - | Y | - | - | - |
| 物料管理 | `/materials` | Y | Y | Y | Y | - | - | - |
| 物料分类 | `/categories` | Y | Y | Y | Y | Y | Y | - |
| 库位管理 | `/locations` | Y | Y | - | - | - | - | - |
| 检测项目 | `/projects` | Y | - | Y | - | Y | Y | - |
| BOM 清单 | `/bom` | Y | - | Y | - | Y | Y | - |
| 设备管理 | `/equipment` | Y | - | Y | - | - | Y | - |
| 标准工时库 | `/labor-times` | Y | - | Y | - | Y | Y | - |
| 用户管理 | `/users` | Y | - | - | - | - | - | - |
| 角色权限 | `/roles` | Y | - | - | - | - | - | - |
| 操作日志 | `/logs` | Y | - | - | - | Y | - | - |

### 2.1.1 manager 只读经营洞察增量

`manager` 是 2026-06-20 角色故事 013 新增的只读管理者角色。上表已纳入 manager，本节补充其职责边界:

| 路径 | manager | 说明 |
|------|:-------:|------|
| `/` | Y | 首页经营风险概览 |
| `/alerts` | Y | 只读查看预警，不处理/忽略/生成预警 |
| `/inventory` | Y | 只读查看库存和批次风险 |
| `/abc/dashboard` | Y | 只读查看 ABC 成本看板，并回看期间状态、异常、未补算和快照覆盖情况 |
| `/abc/trend` | Y | 只读查看成本趋势，页面提示未关账或异常月份的过程口径 |
| `/abc/profitability` | Y | 只读查看盈利分析，页面提示当前月份是否可作为最终经营判断 |
| `/users`, `/roles`, `/logs`, `/inbound`, `/outbound`, `/stocktaking`, `/reconciliation`, `/abc/fee-mappings`, `/abc/activity-centers`, `/abc/cost-pools` | - | 不承担系统管理、仓储执行、消耗对账或财务配置职责 |

### 2.2 隐藏页面（URL 直接访问，不在侧边栏显示）

| 路径 | admin | finance | pathologist | 说明 |
|------|:-----:|:-------:|:-----------:|------|
| `/abc/cost-drivers` | Y | Y | - | 成本动因 |
| `/abc/budgets` | Y | Y | - | 预算管理 |
| `/abc/quality-costs` | Y | Y | - | 质量成本 |
| `/abc/variance` | Y | Y | - | 差异分析 |
| `/abc/quarterly-adjustment` | Y | Y | - | 季度调整 |
| `/abc/alerts` | Y | Y | - | 成本预警 |
| `/abc/audit` | Y | Y | - | 审计日志 |
| `/abc/personnel-efficiency` | Y | Y | - | 人员效率 |
| `/abc/model-validation` | Y | Y | Y | 模型验证 |
| `/equipment/types` | Y | - | - | 设备类型 |
| `/equipment/depreciation` | Y | - | - | 折旧统计 |
| `/indirect-costs` | Y | Y | - | 间接成本中心 |

> 说明: `/abc/forecast`、`/abc/supplier-cost`、`/abc/equipment-efficiency` 已从 `ROLE_MENU_MAP`、`TopBar` 标题映射、成本页导出和操作手册中清理。当前 `App.tsx` 没有这些路由，且 `src/pages/cost/` 下没有对应页面文件；后续如需恢复，必须先补齐真实页面和路由再纳入权限矩阵。

---

## 3. 后端 API 权限矩阵

### 3.1 公开路由（无需认证）

| 路由文件 | 路径前缀 | 端点 | 权限 |
|----------|----------|------|------|
| `auth.ts` | `/api/v1/auth` | POST /login, /refresh, /logout | 公开 |

### 3.2 管理员专属

| 路由文件 | 路径前缀 | 端点 | 权限 |
|----------|----------|------|------|
| `users-v1.1.ts` | `/api/v1/users` | 待目标分支核对 | admin |
| `roles-v1.1.ts` | `/api/v1/roles` | GET /, POST /, PUT /:id, DELETE /:id | admin |
| `logs-v1.1.ts` | `/api/v1/logs` | GET /, GET /operation；清理端点二次限制 admin | admin, finance(读) |

### 3.3 分模块权限明细

#### 主数据

| 路由文件 | 路径前缀 | 读权限 | 写权限 |
|----------|----------|--------|--------|
| `categories-v1.1.ts` | `/api/v1/categories` | 所有已认证用户 | admin |
| `materials.ts` | `/api/v1/materials` | admin, warehouse_manager, technician, pathologist, procurement, finance | admin |
| `suppliers-v1.1.ts` | `/api/v1/suppliers` | admin, warehouse_manager, procurement | admin, procurement |
| `locations-v1.1.ts` | `/api/v1/locations` | admin, warehouse_manager | admin, warehouse_manager |

#### 入库与采购

| 路由文件 | 路径前缀 | 读权限 | 写权限 |
|----------|----------|--------|--------|
| `inbound-v1.1.ts` | `/api/v1/inbound` | admin, warehouse_manager, procurement | admin, warehouse_manager |
| `purchase-orders-v1.1.ts` | `/api/v1/purchase-orders` | admin, warehouse_manager, procurement | admin, procurement |

#### 库存与仓库操作

| 路由文件 | 路径前缀 | 权限 |
|----------|----------|------|
| `inventory-v1.1.ts` | `/api/v1/inventory` | admin, warehouse_manager, technician, pathologist, procurement, manager(只读) |
| `outbound-v1.1.ts` | `/api/v1/outbound` | admin, warehouse_manager（严格角色守卫；普通/BOM 创建、编辑、删除写操作日志并刷新预警） |
| `stocktaking-v1.1.ts` | `/api/v1/stocktaking` | admin, warehouse_manager |
| `returns-v1.1.ts` | `/api/v1/returns` | admin, warehouse_manager（创建/撤销写操作日志并刷新预警） |
| `scraps-v1.1.ts` | `/api/v1/scraps` | admin, warehouse_manager |
| `transfers-v1.1.ts` | `/api/v1/transfers` | admin, warehouse_manager |
| `supplier-returns-v1.1.ts` | `/api/v1/supplier-returns` | admin, warehouse_manager, procurement（创建/删除/状态流转有审计；库存变动刷新预警） |

#### 项目与 BOM

| 路由文件 | 路径前缀 | 读权限 | 写权限 |
|----------|----------|--------|--------|
| `projects-v1.1.ts` | `/api/v1/projects` | admin, warehouse_manager, technician, pathologist, finance | admin, technician |
| `bom-v1.1.ts` | `/api/v1/boms` | admin, warehouse_manager, technician, pathologist, finance | admin, technician |

#### 设备与工时

| 路由文件 | 路径前缀 | 读权限 | 写权限 |
|----------|----------|--------|--------|
| `equipment-v1.1.ts` | `/api/v1/equipment` | admin, technician, pathologist | admin, technician |
| `equipment-types-v1.1.ts` | `/api/v1/equipment-types` | admin, technician, pathologist | admin, technician |
| `labor-time-v1.1.ts` | `/api/v1/labor-times` | admin, technician, pathologist, finance | admin, technician, finance |

#### 成本核算

| 路由文件 | 路径前缀 | 权限 |
|----------|----------|------|
| `reports-v1.1.ts` | `/api/v1/reports` | admin, pathologist, finance |
| `depletion-v1.1.ts` | `/api/v1/depletion` | 读: admin, warehouse_manager, pathologist, finance；写: admin, warehouse_manager |
| `reconciliation-v1.1.ts` | `/api/v1/reconciliation` | admin, technician, finance |
| `indirect-cost-v1.1.ts` | `/api/v1/indirect-costs` | admin, finance；自定义角色需模块级 `cost_analysis` |
| `cost-adjustment-v1.1.ts` | `/api/v1/cost-adjustments` | admin, finance；自定义角色需模块级 `cost_analysis` |
| `abc-v1.1.ts` | `/api/v1/abc` | 待目标分支核对 |

#### 预警

| 路由文件 | 路径前缀 | 权限 |
|----------|----------|------|
| `alerts-v1.1.ts` | `/api/v1/alerts` | admin, warehouse_manager, technician, pathologist, procurement, finance, manager(只读) |

### 3.4 ABC 端点级权限详情

旧文档记录 ABC 端点权限分化最复杂；以下内容作为目标分支复核清单，需以实际 `abc-v1.1.ts` 和测试结果确认：

| 端点类型 | 权限 | 端点列表 |
|----------|------|----------|
| 结果读取类 | admin, finance, pathologist, technician, manager(部分结果页), 自定义 `cost_analysis:view` | GET /dashboard, /profitability, /fee-comparison, /slide-cost-trend 等成本结果接口；成本看板可读取 periods/cost-runs/adjustments 作为本期口径解释；技术员前端默认仅暴露 `/abc/slide-cost`；manager 前端默认仅暴露 `/abc/dashboard`, `/abc/trend`, `/abc/profitability` |
| 财务配置读取类 | admin, finance；自定义角色需模块级 `cost_analysis` | GET /activity-centers, /cost-drivers, /cost-pools, /bom-fee-mappings/audit, /bom-fee-mappings/:bomId, /fee-standards；`cost_analysis:view`、technician、pathologist、manager 均不读取这些配置工作台 |
| 写入类 | admin, finance；自定义角色需模块级 `cost_analysis` | POST/PUT/DELETE activity-centers, cost-drivers, cost-pools (含 sync/auto-collect/recalculate), bom-links, budgets, quality-costs, alert-rules；`cost_analysis:view`、technician、pathologist、manager 均不可写 |
| 导出 | admin, finance | GET /export |

---

## 4. 权限对比速查表（后端 API 视角）

| 模块 | 读 | 写（创建/编辑/删除） |
|------|-----|----------------------|
| 用户管理 | admin | admin |
| 角色管理 | admin | admin |
| 操作日志 | admin, finance | — (只读；清理仅 admin) |
| 物料分类 | 所有已认证 | admin |
| 物料管理 | admin, wm, tech, path, proc | admin |
| 供应商 | admin, wm, proc | admin, proc |
| 库位 | admin, wm | admin |
| 入库 | admin, wm, proc | admin, wm |
| 采购订单 | admin, proc | admin, proc |
| 库存查询 | admin, wm, tech, path, proc, manager | — (只读) |
| 出库 | admin, wm | admin, wm |
| 盘点 | admin, wm | admin, wm |
| 退库 | admin, wm | admin, wm |
| 报废 | admin, wm | admin, wm |
| 调拨 | admin, wm | admin, wm |
| 供应商退货 | admin, wm, proc | admin, wm, proc |
| 检测项目 | admin, wm, tech, path, finance | admin, tech |
| BOM | admin, wm, tech, path, finance | admin, tech |
| 设备 | admin, tech, path | admin (类型); admin, tech, path (设备/工时) |
| 成本报表 | admin, path, finance | — (只读) |
| 消耗追踪/对账 | admin, tech, finance | admin, tech, finance（BOM 修正仅 admin/tech） |
| 间接成本 | admin, finance；自定义角色需模块级 `cost_analysis` | admin, finance；自定义角色需模块级 `cost_analysis` |
| ABC 读取 | admin, finance, path, tech(部分) | — |
| ABC 写入 | admin, finance；自定义角色需模块级 `cost_analysis` | admin, finance；自定义角色需模块级 `cost_analysis` |
| ABC 导出 | admin, finance | — |
| 成本调整 | admin, finance | admin, finance |
| 预警 | 全部角色 | admin, warehouse_manager 可处理；manager 只读 |

> 缩写: wm=warehouse_manager, tech=technician, path=pathologist, proc=procurement

---

## 5. 前后端权限一致性核对

### 5.1 已确认一致

| 模块 | 前端 | 后端 | 一致 |
|------|------|------|:----:|
| 用户/角色 | 仅 admin 可见 | 仅 admin 可访问 | ✅ |
| 操作日志 | admin、finance 可见 | admin、finance 可读；清理仅 admin | ✅ |
| 入库 | admin, wm, proc 可见 | admin, wm, proc 可读 | ✅ |
| 出库 | admin, wm 可见 | admin, wm | ✅ |
| 盘点/退库/报废/调拨 | admin, wm 可见 | admin, wm | ✅ |
| 采购订单 | admin, proc 可见 | admin, proc | ✅ |
| 供应商 | admin, wm, proc 可见 | admin, wm, proc | ✅ |
| 库位 | admin, wm 可见 | admin, wm | ✅ |
| 成本管理 | admin, tech, path, finance, manager(部分) 可见 | 结果页 admin/finance/path/tech/manager 可按职责读取；财务配置工作台仅 admin/finance/模块级自定义成本角色 | ✅ |
| 物料管理 | admin, wm, tech, proc 可见 | admin, wm, tech, proc；finance 可通过 `materials:view` 只读承接收费映射上下文；pathologist 403 | ✅ |
| 财务项目/BOM上下文 | finance 可见 `/projects`, `/bom` 且隐藏写按钮 | finance 可读项目/BOM/物料，写项目/BOM/物料返回 403 | ✅ |
| 预警 | 全部角色可见 | 全部角色 | ✅ |

### 5.2 待确认差异

> **2026-06-15 复核更新**：目标 PR 分支已补回菜单/权限中可达但 `App.tsx` 缺失的页面路由，路由一致性检查结果为 `missing: []`。本节剩余内容不再是“路由缺失”，而是“前端菜单策略、后端 API 读写权限、角色业务意图是否一致”的 PM 决策问题。

| 差异点 | 前端 | 后端 | 需 PM 确认 |
|--------|------|------|:----------:|
| 物料管理 pathologist | pathologist 不可见 | pathologist 不能直接读 `/api/v1/materials` | 已按只读洞察边界收敛 |
| 物料管理 finance | finance 不可见 | finance 可读，用于 ABC 收费映射上下文 | 已按角色故事 009 确认 |
| 成本预测/供应商成本/设备效率 | 已从前端权限、标题和操作手册清理 | `App.tsx` 无路由且页面文件不存在 | 后续如需恢复，需先补真实页面 |
| 检测项目 pathologist/finance | 前端可见 | 后端可读 | ✅ 一致 |
| BOM pathologist/finance | 前端可见 | 后端可读 | ✅ 一致 |

> **说明**：前端 `ROLE_MENU_MAP` 和后端 API 权限可能存在有意的差异化设计，但出库读权限已按 PM 确认的最小权限原则收敛，不再作为待确认差异。

---

## 6. 角色功能总结

### 6.1 admin（系统管理员）
- **全功能访问**，约 46 条前端路径
- 管理用户、角色、操作日志
- 所有写操作的最终审批者

### 6.2 warehouse_manager（仓库管理员）
- **库存作业核心角色**，14 条前端路径
- 入库、出库、盘点、退库、报废、调拨的执行者
- 不可见成本管理和系统设置

### 6.3 technician（技术员）
- **技术建模和消耗对账角色**
- 维护项目、BOM、设备、工时，查看库存、消耗对账和切片成本
- 可把对账差异交给成本异常台账，但不可见财务配置入口
- 不可见采购管理、仓库出库执行和系统设置

### 6.4 pathologist（病理医生）
- **成本分析角色**，13 条前端路径
- 查看项目、BOM、设备、工时、库存和成本洞察
- 可查看成本报表和 ABC 分析（只读）
- 不直接读取物料主数据 API，不进入采购、仓储执行、消耗对账、财务配置和系统设置

### 6.5 procurement（采购员）
- **采购执行角色**，9 条前端路径
- 管理采购订单和供应商
- 可查看入库和库存
- 不可见成本管理和系统设置

### 6.6 finance（财务人员）
- **成本核算角色**，约 29 条前端路径（含隐藏 ABC/间接成本页面和操作日志）
- 成本报表、ABC 分析、间接成本、成本对账的全权访问
- 可只读查看项目、BOM、物料上下文，用于配置收费映射和解释成本口径
- 可写 ABC 财务配置；不可写项目、BOM、物料等技术/主数据
- 不可见采购管理、用户管理和角色权限；可读操作日志用于成本/审计追溯

### 6.7 manager（管理者）
- **只读经营洞察角色**，6 条前端路径
- 查看首页、预警、库存、成本看板、成本趋势和盈利分析
- 不可执行仓储作业、消耗对账、系统管理或 ABC 配置

---

## 7. E2E 权限测试覆盖

### 7.1 已覆盖

| 测试文件 | 覆盖内容 |
|----------|----------|
| `e2e/roles.spec.ts` | 角色 CRUD 权限隔离（TC-PERM-ROLE-01~10） |
| `e2e/roles.spec.ts` | 前端 UI 权限（菜单可见性、页面访问拦截） |
| `e2e/auth.spec.ts` | 登录认证、Token 刷新、权限菜单验证 |
| 各 scenario 套件 | 按角色的业务流程验证（admin-suite, finance-suite 等） |

### 7.2 待补充

| 缺口 | 说明 |
|------|------|
| 跨模块 API 权限测试 | 当前仅覆盖 `/roles` 模块的 API 权限，其他模块（入库、成本等）仍缺少跨角色 API 权限测试；出库已补 technician/pathologist 后端拒绝测试 |
| 端点级写权限测试 | 后端有读写分离的模块（如 inbound）缺少非写角色尝试写入的测试；outbound 已覆盖 procurement 写入拒绝 |
| 隐藏页面访问测试 | admin 和 finance 的隐藏 ABC 页面仍缺少完整 E2E 验证；`/abc/forecast`、`/abc/supplier-cost`、`/abc/equipment-efficiency` 已清理，当前不作为可访问页面 |
| technician/pathologist 出库 API 只读权限收敛 | 已于 2026-06-20 收敛，`outbound.test.ts` 覆盖 technician/pathologist 读取 `/api/v1/outbound` 返回 403 |

---

## 8. PM 审核确认

| 确认项 | PM 判断 |
|--------|---------|
| 7 种角色定义是否符合实际业务 | 待确认 |
| 出库页面 technician/pathologist 不可见、后端出库 API 后续不保留只读权限 | PM 已确认按建议处理 |
| 物料管理 pathologist 是否应可见 | 已按只读洞察边界处理：前端不可见，后端 `/api/v1/materials` 返回 403 |
| 成本管理 technician 可见是否符合业务意图 | 待确认 |
| finance 的隐藏 ABC 页面是否需要在侧边栏显示 | PM 已确认多数高级 ABC 页面暂不放入侧边栏；成本池已作为当前可见导航入口 |
| 是否需要新增角色或合并角色 | 待确认 |
| 自定义成本只读角色是否只看洞察页、不承接财务执行/配置入口 | 已按前后端最小权限处理 |
