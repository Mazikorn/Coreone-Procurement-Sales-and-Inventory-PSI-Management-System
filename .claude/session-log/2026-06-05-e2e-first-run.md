# 2026-06-05 场景化E2E首次全量运行

## 工作概述

基于 session-log 中记录的 37 个场景化测试文件（859 个用例），执行首次全量 E2E 测试运行。

## 执行步骤

### 1. 环境准备
- 检查前后端运行状态：后端 3001 ✅，前端 8080 ✅
- 运行 `seed-all.ts` 导入种子数据：7 步全部成功，耗时 13.6s

### 2. 根因排查
首次运行测试时发现大量超时（每个用例 1 分钟），排查发现：
- **InboundTable.tsx 第 105-118 行**存在重复的解构代码，导致 TypeScript 语法错误
- 该错误导致整个 React 应用无法渲染，Playwright 无法找到任何页面元素
- 修复：删除重复的解构代码块

### 3. 测试选择器批量修复
发现测试文件中的选择器与实际页面不匹配：
- 实际页面：`<input type="text" placeholder="请输入用户名">`（无 `name` 属性）
- 测试代码：`input[name="username"]`（找不到元素）

修复 6 个文件：
- `admin-suite/login.spec.ts`
- `finance-suite/login.spec.ts`
- `procurement-suite/login.spec.ts`
- `warehouse-manager-suite/login.spec.ts`
- `technician-suite/login.spec.ts`
- `admin-suite/user-management.spec.ts`

修复内容：
- `input[name="username"]` → `input[placeholder="请输入用户名"]`
- `input[name="password"]` → `input[placeholder="请输入密码"]`
- `button:has-text("登录")` → `button[type="submit"]`
- `timeout: 5000` → `timeout: 15000`
- 添加 `await usernameInput.waitFor({ state: 'visible', timeout: 15000 })`

### 4. 全量测试运行
```
npx playwright test e2e/scenarios/ --reporter=list,html
```

结果：
| 指标 | 数值 |
|------|------|
| 总用例 | 859 |
| 通过 | 460（53.5%） |
| 失败 | 347（40.4%） |
| 跳过 | 52（6.1%） |
| 耗时 | 2.5 小时 |

## 失败根因分类

### A. UI 选择器不匹配（约 100+ 用例）
典型表现：`点击新增按钮`、`选择物料`、`选择供应商`、`选择库位` 超时 16-60s
- 仓管员入库操作（purchase-inbound/direct-inbound/transfer-inbound）
- 仓管员出库审批（outbound-approval）
- 仓管员盘点（stocktaking）
- 技术员出库（project-outbound）

### B. 页面导航超时（约 50 用例）
典型表现：`进入XX页面` 耗时 17-22s
- 部分页面路由可能未正确配置
- 页面加载时间过长

### C. 侧边栏菜单验证（约 30 用例）
典型表现：`验证XX菜单可见` 超时 8-11s
- 菜单文本与选择器不完全匹配
- 可能需要使用更精确的选择器

### D. API 数据结构断言（约 20 用例）
典型表现：`验证API返回数据结构` 失败
- 实际返回字段与预期不符
- 需要更新断言逻辑

## 通过率最高的模块

- ✅ 成本分析流程 — 登录+页面导航+API 验证大部分通过
- ✅ 财务导出报表 — API 层测试全部通过
- ✅ 管理员登录 — 修复后 28/28 登录相关测试通过
- ✅ 管理员用户管理 — 编辑/删除用户 API 测试通过

## 修改的文件

1. `前端代码/src/pages/inbound/components/InboundTable.tsx` — 删除重复解构代码
2. `前端代码/e2e/scenarios/shared/auth.ts` — 修复 loginAs 函数选择器
3. `前端代码/e2e/scenarios/admin-suite/login.spec.ts` — 修复选择器
4. `前端代码/e2e/scenarios/finance-suite/login.spec.ts` — 修复选择器
5. `前端代码/e2e/scenarios/procurement-suite/login.spec.ts` — 修复选择器
6. `前端代码/e2e/scenarios/warehouse-manager-suite/login.spec.ts` — 修复选择器
7. `前端代码/e2e/scenarios/technician-suite/login.spec.ts` — 修复选择器
8. `前端代码/e2e/scenarios/admin-suite/user-management.spec.ts` — 修复选择器
9. `docker-compose.test.yml` — 新增测试环境 Docker 配置（未使用）

## 建议下一步

1. **修复仓管员入库 UI 选择器** — 可提升通过率至 70%+
2. **执行 Plan 7** — 性能优化
3. **执行 Plan 8** — 测试覆盖
