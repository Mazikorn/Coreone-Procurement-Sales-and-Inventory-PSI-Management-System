# COREONE 环境搭建与测试运行说明

> **版本**: 1.0.0
> **创建日期**: 2026-06-11
> **依据来源**: README.md、package.json、vite.config.ts、playwright.config.ts、.github/workflows、docker-compose*.yml、Dockerfile
> **维护者**: Codex（AI 生成，mimo 验证）

---

## 0. 一句话说明

COREONE 是前后端分离项目。后端 Node.js 22 + Express + TypeScript + SQLite，端口 3001。前端 React 18 + Vite + TypeScript，端口 8080，通过 Vite 代理 `/api/v1` 到后端。E2E 测试 Playwright，webServer 自动启动前后端。

---

## 1. 前置条件

| 依赖 | 版本要求 | 说明 |
|------|----------|------|
| Node.js | 22.x | CI 和 Dockerfile 均使用 node:22 |
| npm | 10+ | 随 Node.js 22 自带 |
| Git | 任意 | 版本控制 |
| Chromium | Playwright 自带 | E2E 测试用，`npx playwright install` 自动下载 |

**不需要**：MySQL、Prisma、Docker（本地开发可选）、Python。

---

## 2. 本地开发环境搭建

### 2.1 克隆与安装

```bash
# 克隆仓库
git clone <repo-url>
cd 最新代码

# 安装后端依赖
cd 后端代码/server
npm install

# 安装前端依赖
cd ../../前端代码
npm install

# 安装 Playwright 浏览器（仅 E2E 测试需要）
npx playwright install --with-deps chromium
```

### 2.2 后端环境变量

后端需要 `.env` 文件。从模板复制：

```bash
cd 后端代码/server
cp .env.example .env
```

`.env.example` 内容：

```env
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:5173
JWT_SECRET=your-jwt-secret-key-change-in-production
JWT_EXPIRES_IN=8h
REFRESH_TOKEN_EXPIRES_IN=7d
DATABASE_PATH=./data/coreone.db
```

**注意**：
- `JWT_SECRET` 必须修改，不能使用默认值
- `DATABASE_PATH` 默认为 `./data/coreone.db`，首次启动自动创建
- 代码中还使用 `ADMIN_PASSWORD`（默认 `admin123`）和 `TEST_PASSWORD`（默认 `CoreOne2026!`），可选配置

### 2.3 启动后端

```bash
cd 后端代码/server
npm run dev
```

- 使用 `tsx watch` 启动，支持热重载
- 首次启动自动调用 `initializeDatabase()` 创建 42 张表
- 健康检查：`GET http://localhost:3001/api/health` 返回 `{ success: true, data: { status: 'ok' } }`

### 2.4 启动前端

```bash
cd 前端代码
npm run dev
```

- Vite 开发服务器，端口 8080
- API 请求通过代理 `/api/v1` -> `http://localhost:3001`
- 浏览器访问 `http://localhost:8080`

### 2.5 登录

默认用户（密码见 `.env` 或代码默认值）：

| 用户名 | 角色 | 默认密码 |
|--------|------|----------|
| admin | 系统管理员 | admin123 |
| wangkq | 仓库管理员 | CoreOne2026! |
| zhangwei | 技术员 | CoreOne2026! |
| liuyf | 病理医生 | CoreOne2026! |
| zhaohp | 采购员 | CoreOne2026! |
| sunli | 财务 | CoreOne2026! |

---

## 3. 测试运行

### 3.1 后端单元/集成测试

```bash
cd 后端代码/server
npm run test
```

- 使用 Vitest
- 测试文件位于 `src/` 下（与源码同目录或 `__tests__/`）

### 3.2 前端单元测试

```bash
cd 前端代码
npm run test
```

- 使用 Vitest + @testing-library/react
- 测试文件位于 `src/` 下

### 3.3 E2E 测试（Playwright）

```bash
cd 前端代码

# 运行全部 E2E
npx playwright test

# 运行单个 spec
npx playwright test e2e/auth.spec.ts

# 带 UI 调试
npx playwright test e2e/auth.spec.ts --debug

# CI 模式（list reporter）
npx playwright test --reporter=list --workers=1
```

**E2E 配置要点**：
- `workers: 1` — 避免 SQLite 写锁导致 ECONNRESET
- `timeout: 90000` — 90 秒超时
- `webServer` — 自动启动后端（端口 3001）和前端（端口 8080）
- 仅使用 Chromium 浏览器
- 失败时自动截图和 trace

### 3.4 E2E 测试结构

```
前端代码/e2e/
├── 30 个顶层 spec 文件（模块级测试）
└── scenarios/
    ├── admin-suite/         (4 文件)
    ├── finance-suite/       (4 文件)
    ├── procurement-suite/   (4 文件)
    ├── technician-suite/    (7 文件)
    ├── warehouse-manager-suite/ (7 文件)
    ├── flows/               (2 文件)
    ├── 7 个 *-flow/ 目录    (完整业务流程)
    ├── 4 个 *-daily-work/   (角色日常模拟)
    └── shared/              (共享工具)
```

---

## 4. 构建

### 4.1 前端构建

```bash
cd 前端代码

# 生产构建
npm run build

# 开发构建
npm run build:dev
```

- 输出到 `前端代码/dist/`
- 构建产物文件名带时间戳，禁用缓存
- 手动分包：xlsx/jspdf -> vendor-export，recharts -> vendor-charts，lucide-react -> vendor-icons，framer-motion -> vendor-animation

### 4.2 后端构建

```bash
cd 后端代码/server
npm run build
```

- TypeScript 编译到 `dist/`
- 生产运行：`node dist/app.js`

---

## 5. Docker 部署

### 5.1 生产环境

```bash
# 需要先创建 .env 文件，设置 JWT_SECRET
echo "JWT_SECRET=your-production-secret" > .env

# 构建并启动
docker compose up -d

# 访问：http://localhost:8080
```

服务：
- `coreone-backend` — 后端，端口 3001（内部）
- `coreone-frontend` — 前端 nginx，端口 8080（可通过 `COREONE_PORT` 环境变量修改）
- 数据卷 `coreone-data` 持久化 SQLite 数据库

### 5.2 开发环境

```bash
docker compose -f docker-compose.dev.yml up -d
```

- 源码挂载到容器内，支持热重载
- 后端端口 3001 直接暴露
- 前端端口 8080

### 5.3 测试环境

```bash
docker compose -f docker-compose.test.yml up -d
```

- 使用独立数据库 `coreone-test-db`
- 内置测试密码配置
- 前端依赖后端健康检查通过后才启动

---

## 6. CI/CD

### 6.1 核心 E2E（`.github/workflows/e2e.yml`）

- **触发**：push/PR to main/master
- **内容**：`auth.spec.ts` + `supplier-returns.spec.ts`
- **超时**：4 小时
- **Node**：22
- **Worker**：1

### 6.2 完整 E2E 回归（`.github/workflows/e2e-full.yml`）

- **触发**：手动 + 每日 UTC 02:00
- **内容**：全部 73 个 spec
- **超时**：6 小时
- **产出**：上传 `e2e-report` artifact

### 6.3 CI 环境变量

| 变量 | 说明 |
|------|------|
| `CI=true` | Playwright 启用 forbidOnly + 重试 |
| `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` | 消除 Node.js 20 弃用警告 |

---

## 7. 常见问题排查

### 7.1 后端启动失败

| 症状 | 原因 | 解决 |
|------|------|------|
| `MODULE_NOT_FOUND` | 依赖未安装 | `npm install` |
| `SQLITE_ERROR` | 数据库文件损坏 | 删除 `data/coreone.db` 重启 |
| `EADDRINUSE` | 端口 3001 被占用 | 修改 `.env` 中 `PORT` 或关闭占用进程 |
| `JWT_SECRET not set` | 未配置 .env | 从 `.env.example` 复制 |

### 7.2 前端启动失败

| 症状 | 原因 | 解决 |
|------|------|------|
| `ECONNREFUSED` | 后端未启动 | 先启动后端 |
| API 请求 404 | 代理配置错误 | 检查 `vite.config.ts` 中 proxy 配置 |
| 白屏 | TypeScript 编译错误 | 检查终端报错 |

### 7.3 E2E 测试失败

| 症状 | 原因 | 解决 |
|------|------|------|
| `ECONNRESET` | SQLite 写锁 | 确保 `workers: 1` |
| 超时 | 前后端未启动 | Playwright webServer 配置会自动启动 |
| `browserType.launch` 失败 | Chromium 未安装 | `npx playwright install --with-deps chromium` |
| 登录失败 | 测试密码不匹配 | 检查 `ADMIN_PASSWORD` / `TEST_PASSWORD` 环境变量 |

---

## 8. 关键路径速查

| 用途 | 路径 |
|------|------|
| 后端入口 | `后端代码/server/src/app.ts` |
| 后端路由 | `后端代码/server/src/routes/` (29 文件) |
| 后端数据库 | `后端代码/server/src/database/DatabaseManager.ts` |
| 后端中间件 | `后端代码/server/src/middleware/` |
| 后端数据文件 | `后端代码/server/data/coreone.db` |
| 后端 .env 模板 | `后端代码/server/.env.example` |
| 前端入口 | `前端代码/src/main.tsx` |
| 前端路由 | `前端代码/src/App.tsx` |
| 前端页面 | `前端代码/src/pages/` (22 模块) |
| 前端 API 层 | `前端代码/src/api/` (12 文件) |
| 前端类型定义 | `前端代码/src/types/index.ts` |
| 前端配置 | `前端代码/vite.config.ts` |
| E2E 配置 | `前端代码/playwright.config.ts` |
| E2E 测试 | `前端代码/e2e/` (73 spec) |
| CI 核心 | `.github/workflows/e2e.yml` |
| CI 完整 | `.github/workflows/e2e-full.yml` |
| Docker 生产 | `docker-compose.yml` |
| Docker 开发 | `docker-compose.dev.yml` |
| Docker 测试 | `docker-compose.test.yml` |

---

## 9. PM 审核确认

| 确认项 | PM 判断 |
|--------|---------|
| 环境搭建步骤是否可执行 | 待确认 |
| 默认密码是否需要修改 | 待确认 |
| Docker 部署是否是生产部署方式 | 待确认 |
| CI 门禁范围是否足够 | 待确认 |
