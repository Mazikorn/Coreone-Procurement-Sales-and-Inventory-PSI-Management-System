# COREONE v1.2 Phase 1 全面扫描检查报告

> **检查日期**: 2026-06-02
> **检查范围**: 前端 185 文件 + 后端 38 文件 + 数据库 37 张表 + PRD v1.1 全量对照
> **检查方法**: 10 维度矩阵扫描（功能/API/权限/Schema/代码质量/UI/测试/安全/业务逻辑/性能）
> **检查人**: Claude Code 自动化审查

---

## 一、检查概要

| 指标 | 数值 |
|------|------|
| 扫描前端源文件 | 185 个 (.ts/.tsx) |
| 扫描后端源文件 | 38 个 (.ts) |
| 扫描数据库表 | 37 张 |
| 扫描 API 端点 | 130+ 个 |
| 扫描 PRD 用户故事 | 19 个 (US-001 ~ US-019) |
| **发现问题总数** | **30 项** |
| P0 — 阻塞/高危 | 6 项 |
| P1 — 重要 | 11 项 |
| P2 — 中等 | 8 项 |
| P3 — 轻微 | 5 项 |

**验收评分**: 62.75/100（未达及格线 70）

---

## 二、P0 级问题（阻塞/高危）

### P0-1: express-validator 完全未使用 — 重大安全缺陷

- **位置**: 全部 26 个路由文件
- **严重程度**: 🔴🔴🔴
- **问题描述**: PRD 和项目规范明确要求"后端: express-validator 在所有路由入口验证"，但搜索结果显示零个路由文件导入了 express-validator。没有任何 API 端点使用 `body()`/`query()`/`param()` 进行结构化输入验证。各路由中仅散落着手动 if-check（共 128 处），但不统一、不完整，无类型转换保障，无 sanitize。
- **风险示例**:
  - `POST /users`: username 仅检查非空，无长度/格式/特殊字符校验
  - `POST /users`: password 仅检查非空，无长度/复杂度校验
  - `POST /inbound`: quantity 无校验（可为负数或 NaN）
  - `PUT /alerts/rules/:id`: threshold 检查 `isNaN` + >=0，但无上限制
- **修复建议**: 为所有写操作路由（POST/PUT/PATCH）添加 express-validator 校验链

### P0-2: 后端权限映射 `pathToPermission` 缺失 v1.2 新模块 — 权限检查失效

- **位置**: `后端代码/server/src/middleware/auth.ts:35-57`
- **严重程度**: 🔴🔴🔴
- **问题描述**: `pathToPermission()` 函数完全缺失 v1.2 新增模块的映射。当路径为 `/equipment`、`/labor-times`、`/indirect-costs` 时，函数返回空字符串 `''`。由于代码逻辑 `if (permission && ...)` 中 `permission` 为 falsy，二次权限检查被跳过。这意味着 `ROLE_PERMISSIONS` 对这些新模块的精细控制完全失效。
- **受影响模块**: 设备管理、标准工时库、间接成本中心
- **修复建议**: 在 `pathToPermission` 中补充三个新模块的映射

### P0-3: E2E 测试完全缺失

- **位置**: `前端代码/e2e/`
- **严重程度**: 🔴🔴
- **问题描述**: `e2e/` 目录下 0 个 `.spec.ts` 文件。虽然 `playwright.config.ts` 配置完整，但实际零覆盖。PRD 明确要求"E2E 测试覆盖所有关键业务流"。
- **风险**: UI 回归无保护，核心流程无法自动验证

### P0-4: 供应商评级 API 前端无 UI

- **位置**: 后端 `suppliers-v1.1.ts:121-143` / 前端无调用
- **严重程度**: 🔴🔴
- **问题描述**: 后端已实现 `POST /:id/rating` 和 `POST /rating/all`，但前端没有任何调用点。功能实现 50%，用户无法使用。

### P0-5: 前端路由守卫与后端权限错位

- **位置**: `前端代码/src/lib/permissions.ts`
- **严重程度**: 🔴🔴
- **问题描述**:
  - `technician` 后端有 `outbound` 权限，但前端 `ROLE_MENU_MAP` 中无 `/outbound`
  - `pathologist` 后端有 `outbound` 权限，但前端菜单中无 `/outbound`
  - `finance` 后端有 `logs` 权限，但前端菜单中无 `/logs`
- **影响**: 用户直接输入 URL 可访问，但侧边栏看不到入口，造成困惑

### P0-6: 后端既有 TypeScript 编译错误未修复

- **位置**: 4 处
- **严重程度**: 🔴
- **问题描述**:
  - `DatabaseManager.ts:14,16`: `DatabaseSync` 被当作类型使用（2 处）
  - `outbound-v1.1.ts:132,266,275,411`: `BatchAllocation` / `GroupBatchAllocation` 未导入（3 处）
- **影响**: CI 中 TypeScript 检查失败

---

## 三、P1 级问题（重要）

### P1-1: 数据库 Schema 不一致

| 表 | 问题 | 影响 |
|----|------|------|
| `equipment` | 缺少 `is_deleted` 字段 | 无法软删除设备 |
| `equipment_usage` | 缺少 `is_deleted` 字段 | 无法软删除使用记录 |
| `material_categories` | 仍有 `status` 字段（之前说已移除） | 数据与业务逻辑不一致 |
| `users.role` | 默认 `'operator'`，有效角色无此值 | 创建用户时可能使用无效角色 |
| `boms` | `standard_labor_cost` 等字段为"预留" | 字段存在但无业务逻辑使用 |
| `batch_usage_tracking` | 缺少 `is_deleted` 字段 | 与其他业务表不一致 |
| `project_cost_details` | 缺少 `updated_at` 字段 | 审计追踪不完整 |

### P1-2: `auth.ts` 硬编码权限数组

- **位置**: `后端代码/server/src/routes/auth.ts:56-60`
- **问题**: 登录响应返回固定权限 `['inventory:view', 'inventory:edit', 'report:view', 'system:view']`，不基于用户实际角色。前端若依赖此字段做按钮级权限控制会出错。

### P1-3: 登录接口无 Rate Limiting

- **位置**: `后端代码/server/src/routes/auth.ts:11`
- **问题**: `POST /login` 无请求频率限制，存在暴力破解风险。

### P1-4: 前端组件文件超出行数限制

| 文件 | 行数 | 规范上限 |
|------|------|---------|
| `BOMFormModal.tsx` | ~600+ | 400 |
| `CostAnalysis.tsx` | ~400+ | 400 |

### P1-5: 前端 `style={{` 使用面广

- **位置**: 69 个文件
- **问题**: PRD 规范要求"不内联 `style={{}}` 除非动态计算"。大量文件可能违反。

### P1-6: 前端单元测试不覆盖组件

- **位置**: `前端代码/src/test/`
- **问题**: 7 个测试文件全部覆盖 hooks/utils，零个组件测试。

### P1-7: `categories-v1.1.ts` N+1 查询

- **位置**: `后端代码/server/src/routes/categories-v1.1.ts:33`
- **问题**: `buildTree` 递归中每次调用都执行 `SELECT COUNT(*) FROM materials`，树节点数 = 查询次数。

### P1-8: 后端错误处理不一致

- **问题**: 26 个路由文件共 296 个 try-catch，全部使用 `error(res, err.message)`，但部分业务错误返回 500 而非正确的 4xx，错误消息可能暴露 SQL 细节。

### P1-9: `locations-v1.1.ts` 动态字段名拼接

- **位置**: `后端代码/server/src/routes/locations-v1.1.ts:71`
- **问题**: `db.prepare(`UPDATE locations SET ${field} = ?...`)` 中字段名直接拼接，虽然通过白名单过滤，但仍属不良实践。

### P1-10: 前端硬编码颜色值

- **位置**: `AppSidebar.tsx`、`AppLayout.tsx` 等
- **问题**: 多处使用 `bg-[#3b82f6]`、`text-[#111827]` 等硬编码 Tailwind arbitrary values。

### P1-11: `materials.ts` 路由文件未按命名规范

- **问题**: `materials.ts` 缺少版本后缀，其他路由均为 `xxx-v1.1.ts`。

---

## 四、P2 级问题（中等）

### P2-1: 成本计算精度问题

- **位置**: `cost-calculator.ts`
- **问题**: 设备折旧使用 `365 * 24 * 60` 计算年度总分钟数，未考虑闰年、设备实际使用时间、维护停机时间。

### P2-2: `calculateQCCost` 使用标准价而非实际采购价

- **位置**: `cost-calculator.ts:65-79`
- **问题**: 使用 `materials.price`（标准价），而非实际入库批次价格。

### P2-3: PRD P2 功能未实现

| PRD ID | 功能 | 状态 |
|--------|------|------|
| US-010 | 物料价格趋势图 | ❌ 未实现 |
| US-011 | 移动端支持 | ❌ 未实现 |

### P2-4: `operator` 字段 XSS 风险

- **问题**: 多个路由将 `req.body.operator || 'system'` 直接写入数据库，前端若渲染此字段可能存在 XSS。

### P2-5: 后端路由中 `fields.join(', ')` 模式

- **位置**: 9 个路由文件
- **问题**: 动态 UPDATE 字段拼接。虽然值已参数化，但字段名拼接模式存在安全隐患。

### P2-6: `auth.ts` 中 `softDeletedUser` 自动恢复逻辑

- **位置**: `auth.ts:23-30`
- **问题**: 登录时自动恢复被软删除的用户。这是 E2E 测试的 workaround，但生产环境存在安全风险。

### P2-7: `equipment` 表 `location_id` 无外键约束

- **问题**: 与其他主数据表的关联关系不一致。

### P2-8: 部分表缺少 `updated_at` 字段

- **位置**: `equipment_usage`、`batch_usage_tracking`、`project_cost_details`
- **问题**: 审计追踪不完整。

---

## 五、P3 级问题（轻微）

### P3-1: `console.log` 生产环境输出

- **位置**: `app.ts`、`DatabaseManager.ts`
- **问题**: 生产环境下仍有大量 console 输出。

### P3-2: `TopBar.tsx` 未复用 `getUserRole`

- **位置**: `TopBar.tsx:46`
- **问题**: 直接从 `localStorage.getItem('token')` 解析 token。

### P3-3: 部分路由文件名与 API 路径不一致

- **问题**: `purchase-orders-v1.1.ts` vs `purchaseOrders` 等。

### P3-4: `request.ts` 硬编码 `baseURL`

- **位置**: `前端代码/src/api/request.ts`
- **问题**: `baseURL: '/api/v1'` 硬编码，无法通过环境变量配置。

### P3-5: 前端路由守卫仅检查菜单权限

- **问题**: `AppLayout.tsx` 只检查 `location.pathname` 是否在 `ROLE_MENU_MAP` 中，不检查具体操作权限（如删除按钮）。

---

## 六、功能完整性对照（PRD 用户故事）

| ID | 用户故事 | 优先级 | 后端状态 | 前端状态 | 结论 |
|----|---------|-------|---------|---------|------|
| US-001 | 扫码快速入库 | P0 | ✅ | ⚠️ 有图标无实际扫码 | 基本可用 |
| US-002 | 出库关联检测项目 | P0 | ✅ | ✅ | 完成 |
| US-003 | 实时库存查询 | P0 | ✅ | ✅ | 完成 |
| US-004 | 按检测项目查看成本 | P0 | ✅ | ✅ | 完成 |
| US-005 | BOM物料清单配置 | P0 | ✅ | ✅ | 完成 |
| US-006 | 库存预警规则 | P1 | ✅ | ✅ | 完成 |
| US-007 | 库存盘点 | P1 | ✅ | ✅ | 完成 |
| US-008 | 供应商管理 | P1 | ⚠️ 缺价格对比/采购记录 | ⚠️ 缺评级UI | 部分完成 |
| US-009 | 用户权限设置 | P1 | ✅ | ✅ | 完成 |
| US-010 | 物料价格趋势图 | P2 | ❌ | ❌ | 未实现 |
| US-011 | 移动端支持 | P2 | ❌ | ❌ | 未实现 |
| US-012 | BOM通用试剂配额 | P0 | ✅ | ✅ | 完成 |
| US-013 | BOM通用耗材配额 | P0 | ✅ | ✅ | 完成 |
| US-014 | BOM质控品配额 | P0 | ✅ | ✅ | 完成 |
| US-015 | 设备管理与折旧 | P0 | ✅ | ✅ | 完成 |
| US-016 | 标准工时配置 | P0 | ✅ | ✅ | 完成 |
| US-017 | 间接费用录入与分摊 | P1 | ✅ | ✅ | 完成 |
| US-018 | 全成本构成查看 | P0 | ✅ | ✅ | 完成 |
| US-019 | 成本差异分析 | P0 | ✅ | ⚠️ 基础实现 | 基本完成 |

**PRD 功能完成度**: 17/19 = 89.5%（US-010、US-011 未实现）

---

## 七、检查范围声明

本次 Phase 1 检查覆盖以下维度：

| 维度 | 检查方法 | 覆盖度 |
|------|---------|-------|
| 功能完整性 | PRD 用户故事逐条对照 + 代码走查 | 100% |
| API 契约 | 后端路由提取 ↔ 前端 API 模块对照 | 100% |
| 权限矩阵 | `auth.ts` ↔ `permissions.ts` ↔ `AppSidebar.tsx` | 100% |
| 数据库 Schema | `DatabaseManager.ts` 全表提取 | 100% |
| 代码质量 | TS 编译 + grep 扫描 | 100% |
| UI/UX 规范 | DESIGN.md 关键规则 grep 扫描 | 抽样 |
| 测试覆盖 | 测试文件统计 | 100% |
| 安全漏洞 | 输入验证 + SQL 注入 + 权限扫描 | 100% |
| 业务逻辑 | 边界条件 + 异常流 | 抽样 |
| 性能 | N+1 查询 + 大查询扫描 | 抽样 |

**未覆盖/抽样项**: UI/UX 为抽样检查（未逐文件审查），性能为抽样检查，业务逻辑为抽样检查。

---

*报告生成时间: 2026-06-02*
*下一 Phase: Phase 2 — 安全深度审查*
