---
name: coreone-conventions
description: COREONE 项目开发约定与技术规范。React + Express + SQLite 全栈应用。
---

# COREONE 开发约定

> 生成自 COREONE 代码库分析，指导 Claude Code 在本项目中的编码行为。

## 技术栈

- **前端**: React 18.3 + TypeScript 5.8 + Vite 5.4 + Tailwind CSS 3.4
- **后端**: Node.js 22 + Express 4.22 + TypeScript 5.9
- **数据库**: SQLite via `node:sqlite` DatabaseSync
- **测试**: Playwright 1.59 (E2E) + Vitest (单元)

## 何时激活

在以下场景中使用此技能：
- 开发新功能或修改现有功能
- 编写前后端代码
- 进行代码审查
- 创建提交消息
- 编写 E2E 测试

## 提交规范

使用 Conventional Commits：

### 前缀

- `feat` — 新功能
- `fix` — Bug 修复
- `docs` — 文档更新
- `test` — 测试相关
- `refactor` — 重构
- `chore` — 构建/依赖
- `ci` — CI/CD 配置

### 消息格式

```
feat(inventory): 添加库存预警阈值设置
fix(auth): 修复 token 过期跳转逻辑
test(e2e): 补充入库流程 E2E 用例
docs: 更新 API 接口文档
```

- 首行简洁，约 50-70 字符
- 使用祈使语气（"添加" 而非 "添加了"）

## 架构

### 项目结构

```
前端代码/
  src/
    api/          API 调用 (axios 封装)
    components/   React 组件
    pages/        页面组件
    hooks/        自定义 hooks
    lib/          工具函数
    types/        TS 类型定义
    styles/       全局样式
  e2e/            Playwright E2E 测试

后端代码/server/
  src/
    app.ts              Express 入口
    database/
      DatabaseManager.ts   SQLite 管理 (node:sqlite)
    middleware/
      auth.ts             JWT 认证 + 角色校验
      errorHandler.ts     全局错误处理
    routes/             API 路由 (v1.1 后缀为当前版本)
    utils/
      response.ts         统一响应格式
  data/               SQLite 数据库文件
```

### 命名约定

| 元素 | 约定 | 示例 |
|------|------|------|
| 文件 | camelCase | `inventoryList.ts` |
| 组件 | PascalCase | `InventoryList.tsx` |
| 函数 | camelCase | `getInventoryList()` |
| 类型 | PascalCase | `InventoryItem` |
| 常量 | SCREAMING_SNAKE_CASE | `MAX_STOCK` |
| 路由 | kebab-case + version | `inventory-v1.1.ts` |

### 导入风格

前端相对导入：
```typescript
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
```

后端相对导入（ESM 需带 .js 扩展名）：
```typescript
import { getDatabase } from '../database/DatabaseManager.js'
import { errorHandler } from './middleware/errorHandler.js'
```

## 代码风格

### 前端

- 函数组件优先，不使用 class 组件
- TypeScript 严格模式，props 和返回值必须带类型
- Tailwind CSS 处理样式，避免内联 `style={{}}`
- React Query 管理服务端状态，不在 useEffect 中直接 fetch
- Zod 校验表单和 API 响应
- 组件文件不超过 400 行

### 后端

- 路由按功能模块拆分
- `node:sqlite` 是唯一数据库接口，禁止混用 sqlite3
- 所有路由必须有 `authenticateToken`（除 auth 和健康检查）
- 权限在路由注册时声明：`requireRole('admin', 'warehouse_manager')`
- express-validator 在路由处理前校验输入
- SQL 使用参数化查询，禁止字符串拼接
- 统一响应格式：`{ success: true, data: ... }` 或 `{ success: false, error: {...} }`

## 错误处理

### 后端模式

```typescript
try {
  const result = riskyOperation()
  res.json({ success: true, data: result })
} catch (error) {
  next(error) // 交给 errorHandler
}
```

### 前端模式

```typescript
try {
  const data = await api.getInventory()
  setInventory(data)
} catch (error) {
  toast.error(error.message || '获取库存失败')
}
```

## 测试

### E2E 测试

```bash
# 运行全部
cd 前端代码 && npx playwright test

# 单个 spec
cd 前端代码 && npx playwright test e2e/inbound.spec.ts

# 特定用例
cd 前端代码 && npx playwright test e2e/auth.spec.ts --grep "AUTH-LOGIN-01"

# UI 调试
cd 前端代码 && npx playwright test e2e/xxx.spec.ts --debug
```

### 单元测试

```bash
# 前端
cd 前端代码 && npm run test

# 后端
cd 后端代码/server && npm run test
```

## 常见工作流

### 功能开发

1. 理解需求 → 如需复杂规划，调用 planner 代理
2. 编写 E2E 测试（如适用）
3. 实现前端页面/组件
4. 实现后端 API
5. 本地验证：`npm run dev`（前后端）
6. 运行 E2E：`npx playwright test`
7. 提交：`git commit -m "feat(xxx): ..."`

### 数据库变更

1. 修改 `DatabaseManager.ts` 中的 `initializeDatabase()`
2. 新增 `CREATE TABLE IF NOT EXISTS` 语句
3. 如需迁移旧数据，添加兼容逻辑（检查列存在性）
4. 重启后端验证
5. **无需独立 migration 文件**（本项目采用启动时自动初始化模式）

### Bug 修复

1. 复现问题
2. 编写失败的测试（如适用）
3. 定位根因并修复
4. 运行相关测试验证
5. 提交：`git commit -m "fix(xxx): ..."`

## 安全要点

- 禁止硬编码密钥、密码、token（使用 `.env`）
- SQL 必须参数化
- 错误消息不暴露内部实现
- 所有 API 返回统一响应格式，不在客户端判断 HTTP status

## 最佳实践

### Do
- 使用 Conventional Commits
- 组件文件不超过 400 行
- 所有异步操作有错误处理
- 使用 React Query 缓存服务端数据

### Don't
- 不写模糊提交消息
- 不在 useEffect 中直接 fetch
- 不混用 sqlite3 和 node:sqlite
- 不在日志中输出密码/token

---

*本技能随代码库演进更新，最新版本以仓库内文件为准。*
