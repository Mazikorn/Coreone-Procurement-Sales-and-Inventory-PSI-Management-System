# COREONE 项目接管 / 现状报告

> **版本**: 1.0.0
> **创建日期**: 2026-06-11
> **依据来源**: 当前代码、README、CLAUDE.md、AGENTS.md、session-log、package.json、DatabaseManager.ts、app.ts、playwright.config.ts、vite.config.ts、.github/workflows、docs/FRS、docs/TestScenarios
> **维护者**: Codex（AI 生成，PM 审核确认）

---

## 0. 一句话总结

COREONE 是一个已进入中后期开发阶段的病理免疫组化特染进销存与单张切片成本控制系统（PSI）。前端 React 18 + TypeScript + Vite，后端 Node.js + Express + TypeScript + SQLite（`node:sqlite`/`DatabaseSync`），E2E 测试 Playwright 73 个 spec 约 3540 用例，刚完成 Phase 3 稳定化。ABC 作业成本法是当前开发重点，完成度约 91-94%。

---

## 1. 项目基本信息

| 项目 | 当前事实 |
|------|----------|
| 项目名称 | COREONE — 病理免疫组化特染进销存与单张切片成本控制系统 |
| 系统定位 | B 端实验室耗材管理平台 |
| 当前版本 | 前端 1.0.0 / 后端 1.1.0 |
| 项目阶段 | 中后期治理阶段（非从零开始） |
| 最近重点 | E2E Phase 3 稳定化（2026-06-11 完成，19/19 失败全部修复） |
| 开发重点 | ABC 作业成本法（Phase 1-4，完成度 91-94%） |

---

## 2. 技术栈（当前代码事实，非历史设计稿）

### 2.1 前端

| 层 | 技术 | 版本 |
|----|------|------|
| 框架 | React | ^18.3.1 |
| 构建 | Vite + @vitejs/plugin-react-swc | ^5.4.0 / ^3.11.0 |
| 语言 | TypeScript | ^5.8 |
| 路由 | react-router-dom | ^6.30.1 |
| HTTP | axios | ^1.16.0 |
| 服务端状态 | @tanstack/react-query | ^5.83.0 |
| 表格 | @tanstack/react-table | ^8.21.3 |
| 表单 | react-hook-form + zod | ^7.61.1 / ^3.25.76 |
| UI 基础 | Radix UI Primitives (20+ 组件) | ^1.x~2.x |
| 样式 | Tailwind CSS + tailwind-merge + class-variance-authority | ^3.4.17 |
| 图标 | lucide-react | ^0.462.0 |
| 图表 | recharts | ^2.15.4 |
| 动画 | framer-motion | ^12.36.0 |
| 导出 | xlsx + jsPDF | ^0.18.5 / ^4.2.1 |
| 日期 | date-fns + react-day-picker | ^3.6.0 |
| 测试 | Vitest + @testing-library/react + Playwright | ^3.2.4 / ^16.0.0 / ^1.59.1 |

### 2.2 后端

| 层 | 技术 | 版本 |
|----|------|------|
| 运行时 | Node.js | 22 |
| 框架 | Express | ^4.22.1 |
| 语言 | TypeScript | ^5.9.3 |
| 数据库 | SQLite via `node:sqlite`/`DatabaseSync` | Node.js 内置（⚠️ 不是 sqlite3/Prisma） |
| 认证 | jsonwebtoken + bcryptjs | ^9.0.3 / ^2.4.3 |
| 校验 | express-validator | ^7.3.2 |
| 限流 | express-rate-limit | ^8.5.2 |
| 安全 | helmet | ^8.2.0 |
| 测试 | Vitest + Supertest | ^1.6.1 / ^7.2.2 |

### 2.3 ⚠️ 旧文档中存在但当前代码未使用的技术

| 旧技术 | 来源 | 当前事实 |
|--------|------|----------|
| MySQL | 旧 TECH-SPEC、DATABASE-DESIGN | ❌ 不使用，当前为 SQLite |
| Prisma | 旧 TECH-SPEC | ❌ 不使用，当前为原生 SQL + node:sqlite |
| Ant Design | 旧设计稿 | ❌ 不使用，当前为 Radix UI + Tailwind |

**硬规则**：任何 AI 不得基于以上旧技术修改代码。涉及数据库、ORM、UI 库时必须先读当前代码。

---

## 3. 项目规模

### 3.1 后端规模

| 指标 | 数量 |
|------|------|
| 路由文件 | 29 个（`后端代码/server/src/routes/`） |
| API 端点 | 约 200+ 个（最大文件 abc-v1.1.ts 含 35 个端点） |
| 数据库表 | 42 张（`DatabaseManager.ts`） |
| 中间件 | 5 个（cors、helmet、JSON、认证、错误处理） |
| 种子脚本 | 10+ 个（`scripts/` 目录） |
| 数据库迁移 | PRAGMA table_info 增量迁移（无独立迁移工具） |

### 3.2 前端规模

| 指标 | 数量 |
|------|------|
| 页面模块目录 | 22 个（`前端代码/src/pages/`） |
| 页面组件文件 | 170+ 个 |
| API 文件 | 12 个（`前端代码/src/api/`） |
| 类型定义文件 | 1 个（`src/types/index.ts`，约 768 行） |
| 共享组件 | 布局 3 个 + UI 8 个 |

### 3.3 测试规模

| 指标 | 数量 |
|------|------|
| E2E spec 文件 | 73 个（`前端代码/e2e/`） |
| E2E 用例数 | 约 3540 个（test + test.describe） |
| 场景化测试 | 39 个文件（`e2e/scenarios/`，含 5 角色套件 + 7 业务流程 + 4 日常模拟） |
| 单元测试 | Vitest（前后端各一套） |

### 3.4 文档规模

| 位置 | 数量 | 说明 |
|------|------|------|
| 根目录 .md | 约 30 个 | PRD、技术规格、功能矩阵、验收等 |
| V1.1设计稿/v1.1/ | 约 50+ 文件 | 设计稿、交互规范、HTML 原型 |
| docs/ | 5 个 | 治理框架、执行规划、运维手册、FRS(17份)、TestScenarios(17份) |
| .claude/ | 约 70+ 文件 | session-log、plans、inspection、qa-reports、research |

---

## 4. 架构概述

### 4.1 整体架构

```
┌──────────────────────┐     ┌──────────────────────┐
│   前端 (React/Vite)   │────▶│  后端 (Express/TS)    │
│   端口 8080           │     │   端口 3001           │
│   /api/v1 代理        │     │   /api/v1 路由        │
└──────────────────────┘     └──────────┬───────────┘
                                        │
                              ┌─────────▼──────────┐
                              │  SQLite (node:sqlite) │
                              │  data/coreone.db     │
                              └──────────────────────┘
```

### 4.2 后端关键架构特征

| 特征 | 说明 |
|------|------|
| 单文件路由 | 所有业务逻辑直接写在路由文件中（非控制器/服务分离） |
| 内嵌 SQL | 所有数据库操作直接在路由处理器中执行原生 SQL，无 ORM |
| 增量迁移 | 通过 `PRAGMA table_info` 检查列是否存在，ALTER TABLE ADD COLUMN |
| 软删除 | 多数业务表使用 `is_deleted` 字段 |
| JWT 认证 | Bearer token，支持 refresh token |
| 角色授权 | `requireRole()` 中间件，6 种角色 |
| 版本标记 | 路由文件命名以 `-v1.1` 后缀标识版本 |

### 4.3 前端关键架构特征

| 特征 | 说明 |
|------|------|
| 页面模块化 | 每个业务模块一个目录，含页面组件 + 子组件 + hooks |
| 统一请求层 | axios 封装，Bearer token 自动注入，统一错误处理 |
| TanStack Query | 服务端状态管理，自动缓存和重验证 |
| Zod 校验 | 表单提交前验证 |
| 路径别名 | `@` -> `./src` |

### 4.4 CI/CD

| 文件 | 触发条件 | 内容 |
|------|----------|------|
| `.github/workflows/e2e.yml` | push/PR to main/master | 核心 E2E（auth + supplier-returns），Node 22，单 worker |
| `.github/workflows/e2e-full.yml` | 手动 + 每日 UTC 02:00 | 全量 E2E 回归，6h 超时，上传 artifact |

---

## 5. 业务模块与路由清单

### 5.1 后端路由文件清单（29 个，全部前缀 `/api/v1`）

#### 公开路由（无需认证）

| 路由文件 | 路径前缀 | 功能 |
|----------|----------|------|
| `auth.ts` | `/api/v1/auth` | 登录、令牌刷新、登出 |

#### 管理员专属 (admin)

| 路由文件 | 路径前缀 | 功能 |
|----------|----------|------|
| `users-v1.1.ts` | `/api/v1/users` | 用户管理 CRUD |
| `roles-v1.1.ts` | `/api/v1/roles` | 角色管理 CRUD |
| `logs-v1.1.ts` | `/api/v1/logs` | 操作日志查询 |

#### 主数据（所有已认证角色）

| 路由文件 | 路径前缀 | 功能 |
|----------|----------|------|
| `categories-v1.1.ts` | `/api/v1/categories` | 物料分类（树形） |
| `materials.ts` | `/api/v1/materials` | 物料主数据 |
| `suppliers-v1.1.ts` | `/api/v1/suppliers` | 供应商 CRUD + 评级 |
| `locations-v1.1.ts` | `/api/v1/locations` | 库位管理（树形） |

#### 入库与采购

| 路由文件 | 路径前缀 | 功能 |
|----------|----------|------|
| `inbound-v1.1.ts` | `/api/v1/inbound` | 入库管理（含作废、删除前检查） |
| `purchase-orders-v1.1.ts` | `/api/v1/purchase-orders` | 采购订单（下采、收货、取消） |

#### 库存与仓库操作

| 路由文件 | 路径前缀 | 功能 |
|----------|----------|------|
| `inventory-v1.1.ts` | `/api/v1/inventory` | 库存查询与统计 |
| `outbound-v1.1.ts` | `/api/v1/outbound` | 出库管理（含 BOM 出库） |
| `stocktaking-v1.1.ts` | `/api/v1/stocktaking` | 库存盘点 |
| `returns-v1.1.ts` | `/api/v1/returns` | 退库管理 |
| `scraps-v1.1.ts` | `/api/v1/scraps` | 报废管理 |
| `transfers-v1.1.ts` | `/api/v1/transfers` | 库存调拨 |
| `supplier-returns-v1.1.ts` | `/api/v1/supplier-returns` | 供应商退货 |

#### 项目与 BOM

| 路由文件 | 路径前缀 | 功能 |
|----------|----------|------|
| `projects-v1.1.ts` | `/api/v1/projects` | 检测项目管理 |
| `bom-v1.1.ts` | `/api/v1/boms` | BOM 物料清单（含成本预览） |

#### 设备与工时

| 路由文件 | 路径前缀 | 功能 |
|----------|----------|------|
| `equipment-v1.1.ts` | `/api/v1/equipment` | 设备 CRUD + 折旧 + 使用记录 |
| `equipment-types-v1.1.ts` | `/api/v1/equipment-types` | 设备类型管理 |
| `labor-time-v1.1.ts` | `/api/v1/labor-times` | 标准工时库 |

#### 成本核算

| 路由文件 | 路径前缀 | 功能 |
|----------|----------|------|
| `reports-v1.1.ts` | `/api/v1/reports` | 多维度成本报表（9 个端点） |
| `indirect-cost-v1.1.ts` | `/api/v1/indirect-costs` | 间接成本中心 + 分摊 |
| `abc-v1.1.ts` | `/api/v1/abc` | ABC 作业成本法（35 个端点） |
| `cost-adjustment-v1.1.ts` | `/api/v1/cost-adjustments` | 季度成本调整 |
| `depletion-v1.1.ts` | `/api/v1/depletion` | 批次消耗追踪 |
| `reconciliation-v1.1.ts` | `/api/v1/reconciliation` | 成本对账 + LIS 病例 |

#### 预警

| 路由文件 | 路径前缀 | 功能 |
|----------|----------|------|
| `alerts-v1.1.ts` | `/api/v1/alerts` | 预警规则管理与告警处理 |

### 5.2 前端页面模块清单（22 个模块）

| 模块 | 主页面 | 子组件数 | 业务说明 |
|------|--------|---------|----------|
| dashboard | Dashboard.tsx | 9 | 仪表盘（统计、图表、预警、快捷操作） |
| auth | Login.tsx | 1 | 登录认证 |
| master | Categories/Materials/Suppliers/Locations/Projects | 24 | 主数据管理 |
| bom | BOM.tsx | 12 | BOM 物料清单 |
| inbound | Inbound.tsx | 9 | 入库管理 |
| inventory | InventoryList.tsx | 15 | 库存管理（列表/盘点/消耗） |
| outbound | Outbound.tsx | 9 | 出库管理 |
| purchase | PurchaseOrders.tsx | 1 | 采购订单 |
| returns | Returns.tsx | 1 | 退库管理 |
| scraps | Scraps.tsx | 1 | 报废管理 |
| transfers | Transfers.tsx | 1 | 调拨管理 |
| supplier-returns | SupplierReturns.tsx | 1 | 供应商退货 |
| report | CostAnalysis.tsx | 15 | 成本报表 |
| cost | CostDashboard + 18 页面 | 20 | ABC 作业成本法 |
| cost-center | IndirectCostCenterList.tsx | 4 | 间接成本中心 |
| equipment | EquipmentList/TypeList/DepreciationStats | 7 | 设备管理 |
| labor | LaborTimeList.tsx | 3 | 标准工时 |
| alerts | Alerts.tsx | 7 | 预警中心 |
| reconciliation | Reconciliation.tsx | 9 | LIS 对账 |
| system | Users/Roles/Logs | 16 | 系统管理 |

---

## 6. 数据库表清单（42 张）

### 6.1 基础主数据（4 表）

| 表名 | 说明 |
|------|------|
| `material_categories` | 物料分类（支持层级） |
| `materials` | 物料主数据 |
| `suppliers` | 供应商 |
| `locations` | 库位管理（支持层级） |

### 6.2 库存与批次（3 表）

| 表名 | 说明 |
|------|------|
| `inventory` | 实时库存（material_id UNIQUE） |
| `batches` | 批次管理 |
| `stock_logs` | 库存变动日志 |

### 6.3 入库与出库（3 表）

| 表名 | 说明 |
|------|------|
| `inbound_records` | 入库记录 |
| `outbound_records` | 出库记录 |
| `outbound_items` | 出库明细 |

### 6.4 项目与 BOM（3 + 4 表）

| 表名 | 说明 |
|------|------|
| `projects` | 检测项目 |
| `boms` | BOM 物料清单（含标准成本字段） |
| `bom_items` | BOM 子项 |
| `bom_general_reagents` | BOM 通用试剂 |
| `bom_general_consumables` | BOM 通用耗材 |
| `bom_quality_controls` | BOM 质控品 |
| `bom_equipment_templates` | BOM 设备模板 |

### 6.5 设备管理（3 表）

| 表名 | 说明 |
|------|------|
| `equipment_types` | 设备类型（预置 5 种） |
| `equipment` | 设备主数据 |
| `equipment_usage` | 设备使用记录 |

### 6.6 标准工时与间接成本（3 表）

| 表名 | 说明 |
|------|------|
| `standard_labor_times` | 标准工时库（预置 10 条） |
| `indirect_cost_centers` | 间接成本中心 |
| `indirect_cost_allocations` | 间接成本分摊记录 |

### 6.7 ABC 作业成本法（12 表）

| 表名 | 说明 |
|------|------|
| `abc_activity_centers` | 作业中心 |
| `abc_cost_drivers` | 成本动因 |
| `abc_cost_pools` | 成本池（按月归集） |
| `abc_driver_rates` | 动因费率 |
| `abc_bom_activity_links` | BOM 与作业关联 |
| `outbound_abc_details` | 出库 ABC 成本明细 |
| `slide_cost_snapshots` | 切片成本快照 |
| `case_cost_records` | 病例成本记录 |
| `fee_standards` | 收费标准 |
| `cost_budgets` | 成本预算 |
| `quality_costs` | 质量成本 |
| `cost_alert_rules` / `cost_audit_logs` / `cost_adjustments` | 成本预警/审计/调整 |

### 6.8 项目全成本明细（1 表）

| 表名 | 说明 |
|------|------|
| `project_cost_details` | 项目成本明细 |

### 6.9 预警与通知（2 表）

| 表名 | 说明 |
|------|------|
| `alert_rules` | 预警规则（预置 3 条：低库存/有效期/呆滞） |
| `alerts` | 预警记录 |

### 6.10 用户与权限（4 表）

| 表名 | 说明 |
|------|------|
| `users` | 用户（预置 6 个） |
| `roles` | 角色（预置 6 种） |
| `operation_logs` | 操作日志 |
| `login_attempts` | 登录尝试记录（安全加固） |

### 6.11 盘点、退库、报废与调拨（4 表）

| 表名 | 说明 |
|------|------|
| `stocktaking_records` | 盘点记录 |
| `return_records` | 退库记录 |
| `supplier_returns` | 供应商退货 |
| `scrap_records` | 报废记录 |

### 6.12 采购与批次追踪（3 表）

| 表名 | 说明 |
|------|------|
| `purchase_orders` | 采购订单 |
| `batch_usage_tracking` | 批次使用追踪 |
| `batch_depletion` | 批次消耗记录 |

### 6.13 成本对账（2 表）

| 表名 | 说明 |
|------|------|
| `lis_cases` | LIS 病例数据 |
| `reconciliation_logs` | 对账修正日志 |

---

## 7. 角色与权限体系

### 7.1 预置角色（6 种）

| 角色 | 说明 | 典型权限 |
|------|------|----------|
| `admin` | 系统管理员 | 全部功能 |
| `warehouse_manager` | 仓库管理员 | 入库、出库、盘点、退库、报废、调拨 |
| `technician` | 技术员 | 查看项目、BOM、库存、出库记录 |
| `pathologist` | 病理医生 | 查看项目、成本报表 |
| `procurement` | 采购员 | 采购订单、供应商管理 |
| `finance` | 财务 | 成本报表、ABC 分析、间接成本 |

### 7.2 预置用户（6 个）

| 用户名 | 角色 | 默认密码 |
|--------|------|----------|
| admin | admin | admin123 |
| wangkq | warehouse_manager | CoreOne2026! |
| zhangwei | technician | CoreOne2026! |
| liuyf | pathologist | CoreOne2026! |
| zhaohp | procurement | CoreOne2026! |
| sunli | finance | CoreOne2026! |

### 7.3 权限实现方式

- **后端**: `authenticateToken` 中间件验证 JWT + `requireRole()` 中间件检查角色
- **前端**: `src/lib/permissions.ts` 控制菜单可见性和页面访问
- **E2E**: `e2e/roles.spec.ts` + 各 scenario 套件验证角色权限

---

## 8. 测试现状

### 8.1 E2E 测试结构

```
e2e/
├── 30 个顶层 spec 文件（模块级测试）
└── scenarios/
    ├── admin-suite/         (4 文件)
    ├── finance-suite/       (4 文件)
    ├── procurement-suite/   (4 文件)
    ├── technician-suite/    (7 文件)
    ├── warehouse-manager-suite/ (7 文件)
    ├── flows/               (2 文件)
    ├── 7 个 *-flow/ 目录    (7 个 full-flow.spec.ts)
    ├── 4 个 *-daily-work/   (4 个 full-day.spec.ts)
    └── shared/              (2 文件)
```

### 8.2 最近测试状态

| 指标 | 数值 |
|------|------|
| Phase 2 全量回归 | 870 通过 / 141 失败 / 2572 跳过 (86.1%) |
| Phase 3 修复 | 19/19 失败全部修复 |
| Phase 3 修复内容 | 后端 UNIQUE 约束错误码 + BOM/间接成本 code 长度校验 + categories/inbound/roles 测试断言 |
| 最新状态 | Phase 3 完成（2026-06-11） |

### 8.3 CI 门禁

| 门禁 | 内容 | 触发 |
|------|------|------|
| 核心 E2E | auth + supplier-returns | push/PR |
| 完整 E2E | 全部 73 spec | 手动 + 每日定时 |

---

## 9. 历史资料索引与可信度

### 9.1 当前有效文档（可作为接管基线）

| 文档 | 路径 | 说明 |
|------|------|------|
| README.md | 根目录 | 项目入口 |
| CLAUDE.md | 根目录 | ECC 模式核心配置 |
| PRD-v1.1.md | 根目录 / V1.1设计稿 | 最新产品需求文档 |
| TECH-SPEC-v1.1.md | 根目录 / V1.1设计稿 | 技术规格 |
| API-DESIGN-v1.1.md | 根目录 / V1.1设计稿 | API 设计 |
| DATABASE-DESIGN-v1.1.md | 根目录 / V1.1设计稿 | 数据库设计 |
| DESIGN.md | 根目录 | 设计规范 |
| PROJECT_RULES.md | 根目录 | 项目规则基线 |
| FRS 系列 (17 份) | docs/FRS/ | 功能需求规格 |
| TestScenarios 系列 (17 份) | docs/TestScenarios/ | 测试场景 |
| 功能矩阵-严格评估.md | 根目录 | 功能完成度评估 |
| 开发任务清单.md | 根目录 | 任务拆分 |
| 交互规范总纲 + interaction-specs/ | V1.1设计稿 | 18 页面交互规范 |
| session-log.md + session-log/ | .claude/ | 开发日志 |
| plans/ (36 份) | .claude/plans/ | 实施计划 |
| inspection/ (6 份) | .claude/inspection/ | 六阶段审查报告 |

### 9.2 历史参考文档（已被取代或已完成）

| 文档 | 说明 |
|------|------|
| PRD-v1.0-FINAL.md | 被 v1.1 取代 |
| PROJECT-PLAN-v1.1.md | 计划已大部分执行完毕 |
| COREONE-full-test-checklist.md | v1.0 阶段产物 |
| COREONE-acceptance-report.md | v1.0 验收 |
| COREONE-data-flow-*.md | v1.0 测试/验收 |
| 验收 v1.0/v1.1/V2.0-*.md | 早期验收产物 |
| 验收结果汇总*.md | 早期验收结果 |
| 遗留问题清单V1.1.md | 需核实是否仍有效 |
| AGENTS.md (根目录) | 多会话协作文档（已结束） |
| SESSION-A/B-WORKLOG.md | 会话工作日志（已结束） |
| HANDOFF.md / TEMPLATE.md | Handoff 机制（已结束） |

### 9.3 根目录文档冗余问题

`V1.1设计稿/v1.1/` 下的多个 `.md` 文件与根目录同名文件内容相同（PRD、DESIGN、PROJECT_RULES 等）。**建议以根目录版本为准**，V1.1 设计稿目录保留 HTML 原型和交互规范即可。

### 9.4 待归档文件

| 文件/目录 | 建议 |
|-----------|------|
| 根目录 `验收*.md` (6 份) | 迁移到 `docs/archive/` |
| 根目录 `遗留问题清单V1.1.md` | 核实后迁移到 `docs/11_Bug_Log.md` 或归档 |
| 根目录 `research-package.md` | 迁移到 `docs/archive/` |
| `V1.1设计稿/v1.1/server.log` | 删除（过期日志） |
| `V1.1设计稿/v1.1/库存列表.txt` | 迁移到 `docs/archive/` |
| `.claude/SESSION-A/B-*`、`HANDOFF*` | 迁移到 `docs/archive/` |

---

## 10. 环境配置

### 10.1 后端环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `PORT` | 3001 | 服务端口 |
| `NODE_ENV` | development | 运行环境 |
| `FRONTEND_URL` | http://localhost:5173 | 前端 URL |
| `JWT_SECRET` | your-jwt-secret-key-change-in-production | JWT 密钥 |
| `JWT_EXPIRES_IN` | 8h | JWT 过期时间 |
| `REFRESH_TOKEN_EXPIRES_IN` | 7d | 刷新令牌过期时间 |
| `DATABASE_PATH` | ./data/coreone.db | SQLite 数据库路径 |
| `CORS_ORIGIN` | http://localhost:8080 | CORS 来源 |

### 10.2 前端配置

| 配置 | 值 |
|------|-----|
| 开发端口 | 8080 |
| API 代理 | `/api/v1` -> `http://localhost:3001` |
| 路径别名 | `@` -> `./src` |

### 10.3 启动命令

```bash
# 后端开发
cd 后端代码/server && npm run dev    # 端口 3001

# 前端开发
cd 前端代码 && npm run dev           # 端口 8080

# E2E 测试
cd 前端代码 && npx playwright test

# 单个 spec
cd 前端代码 && npx playwright test e2e/xxx.spec.ts

# 带 UI 调试
cd 前端代码 && npx playwright test e2e/xxx.spec.ts --debug

# 单元测试
cd 前端代码 && npm run test
cd 后端代码/server && npm run test
```

---

## 11. 已知风险与治理问题

| 风险 | 严重度 | 说明 |
|------|--------|------|
| 旧设计文档误导实现 | 高 | 旧文档含 MySQL/Prisma/Ant Design 等旧假设，AI 容易误用 |
| 文档分散 | 高 | 根目录、V1.1设计稿、.claude、docs 四处分散 |
| 根目录文件过多 | 中 | 约 30 个 .md + 设计稿目录，PM 难判断哪里是最终结论 |
| E2E 稳定性 | 中 | Phase 3 刚完成，完整回归尚未重跑验证 |
| 权限矩阵未正式固化 | 高 | 需从 app.ts、前端菜单、E2E 三方核对 |
| 业务规则未正式固化 | 高 | 库存、成本、批次规则散落在代码和历史文档中 |
| 单文件路由过大 | 中 | abc-v1.1.ts 含 35 个端点，后续可考虑拆分 |
| 密钥管理 | 中 | JWT_SECRET、ADMIN_PASSWORD 等在 .env.example 中有默认值 |

---

## 12. 治理下一步

按 `docs/00_Project_Governance_Framework.md` 和 `docs/16_Governance_Execution_Plan.md` 的指导，下一步：

| 顺序 | 任务 | 产出 | 状态 |
|:----:|------|------|:----:|
| 1 | 生成项目接管/现状报告 | 本文件 `14_Project_Resume_Report.md` | ✅ 完成 |
| 2 | 生成环境搭建文档 | `15_Environment_Setup.md` | ⏳ 待执行 |
| 3 | 生成项目章程 | `01_Project_Charter.md` | ⏳ 待执行 |
| 4 | 反推权限矩阵 | `05_Role_Permission_Matrix.md` | ⏳ 待执行 |
| 5 | 反推数据对象清单 | `06_Data_Object_List.md` | ⏳ 待执行 |
| 6 | 反推业务规则 | `04_Business_Rules.md` | ⏳ 待执行 |

---

## 13. PM 审核确认

| 确认项 | PM 判断 |
|--------|---------|
| 项目目标描述是否符合真实业务 | 待确认 |
| 技术栈描述是否准确 | 待确认 |
| 哪些历史文档仍有效 | 待确认 |
| 哪些历史文档应归档 | 待确认 |
| 当前阶段优先级是否正确 | 待确认 |
| 双工作台分工是否符合实际工作方式 | 待确认 |
