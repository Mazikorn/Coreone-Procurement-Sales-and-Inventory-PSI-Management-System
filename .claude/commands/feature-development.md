---
name: feature-development
description: COREONE 标准功能开发工作流。适用于新功能实现、页面开发、API 接口开发。
allowed_tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"]
---

# /feature-development

在 COREONE 项目中开发新功能时使用此工作流。

## 目标

完成从前端到后端的全栈功能开发，包含测试和文档。

## 常用文件

- `前端代码/src/pages/**/*.tsx` — 页面组件
- `前端代码/src/components/**/*.tsx` — 复用组件
- `前端代码/src/api/**/*.ts` — API 调用
- `前端代码/src/types/**/*.ts` — 类型定义
- `前端代码/e2e/**/*.spec.ts` — E2E 测试
- `后端代码/server/src/routes/**/*.ts` — API 路由
- `后端代码/server/src/database/DatabaseManager.ts` — 数据库

## 建议流程

1. **需求理解**
   - 阅读相关需求文档或现有代码
   - 确认涉及的页面、API、数据库表
   - 如需复杂规划，先调用 planner 代理

2. **数据库层**（如需要新表/字段）
   - 修改 `DatabaseManager.ts` 的 `initializeDatabase()`
   - 添加 `CREATE TABLE IF NOT EXISTS` 或字段兼容迁移

3. **后端 API**
   - 在 `后端代码/server/src/routes/` 创建/修改路由文件
   - 使用 express-validator 校验输入
   - 使用 `authenticateToken` + `requireRole` 保护路由
   - 统一响应格式：`{ success: true, data: ... }`

4. **前端 API 层**
   - 在 `前端代码/src/api/` 添加/修改 API 函数
   - 使用 axios，统一错误处理

5. **前端页面/组件**
   - 在 `前端代码/src/pages/` 创建页面
   - 使用 React Query 获取数据
   - 使用 React Hook Form + Zod 处理表单
   - 使用 Tailwind CSS + Radix UI 构建界面

6. **E2E 测试**
   - 在 `前端代码/e2e/` 添加测试用例
   - 覆盖主要用户流程和边界条件
   - 运行 `npx playwright test` 验证

7. **验证**
   - 启动前后端：`npm run dev`
   - 运行 E2E 测试
   - 检查浏览器控制台无错误

8. **提交**
   - 使用 Conventional Commits 格式
   - `feat(module): 描述`

## 典型提交信号

- `feat(inventory): 添加库存预警设置页面`
- `feat(api): 添加库存预警 API 接口`
- `test(e2e): 补充预警功能 E2E 测试`

## 注意事项

- 将此工作流视为脚手架，非硬编码脚本
- 小型功能可跳过某些步骤
- 始终遵循 `coreone-conventions` 技能规范
- 代码修改后主动调用 code-reviewer 代理审查
