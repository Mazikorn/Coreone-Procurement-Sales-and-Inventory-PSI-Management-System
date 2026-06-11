# Plan 6: 安全加固 — 详细实施计划

> **优先级**: P0
> **预估工时**: 20h
> **问题来源**: 安全渗透审查 + 后端深度审查
> **PM-QA-001 审查**: ✅ 已补充

---

## 一、VibeContract

### 业务意图
作为**系统管理员**，我希望**系统有基本的安全防护**，以便**防止暴力破解、权限提升和数据泄露**。

### 数据契约

| 指标 | 目标值 | 当前值 |
|------|--------|--------|
| 登录速率限制 | 5次/分钟/IP | 无限制 |
| Token 存储 | httpOnly Cookie | localStorage |
| Refresh Token Secret | 独立 Secret | 与 Access Token 相同 |
| 安全 HTTP 头 | helmet 全套 | 无 |

### 边界契约
- **速率限制**: 超限返回 429，不泄露账户是否存在
- **Token 安全**: Refresh Token 可独立撤销
- **输入验证**: 所有用户输入经过 express-validator

### 异常契约

| 场景 | 状态码 | 错误消息 |
|------|--------|---------|
| 登录超限 | 429 | "登录尝试过多，请稍后重试" |
| Token 过期 | 401 | "登录已过期，请重新登录" |
| 权限不足 | 403 | "无权执行此操作" |

### 验收标准
- [ ] 登录接口 5 次/分钟/IP 速率限制
- [ ] 连续失败 5 次后账户锁定 15 分钟
- [ ] Token 存储在 httpOnly Cookie
- [ ] Refresh Token 使用独立 Secret
- [ ] helmet 安全头已启用
- [ ] 所有写入操作有 express-validator 验证

---

## 二、对抗性提示

### 边界 1: 速率限制被分布式 IP 绕过
**风险**: 攻击者使用多个 IP 绕过单 IP 限制
**测试**: 验证账户级锁定（同一账户不同 IP 也触发锁定）

### 边界 2: httpOnly Cookie 被 CSRF 攻击
**风险**: Cookie 自动发送，CSRF 攻击可冒用身份
**测试**: 验证 SameSite=Strict 或 CSRF Token 机制

### 边界 3: helmet 与现有 CORS 冲突
**风险**: helmet 的 CSP 头可能阻止前端资源加载
**测试**: 添加 helmet 后验证前端正常加载

---

## 二-B、Red-Green-Refactor 测试要求

### 测试代码示例

```typescript
import { describe, it, expect } from 'vitest'

describe('安全加固', () => {
  describe('登录速率限制', () => {
    it('1 分钟内超过 5 次登录返回 429', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'wrong' })
      }
      const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'wrong' })
      expect(res.status).toBe(429)
      expect(res.body.error.message).toContain('过多')
    })
  })

  describe('Token 安全', () => {
    it('登录响应设置 httpOnly Cookie', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' })
      const cookies = res.headers['set-cookie']
      expect(cookies.some(c => c.includes('httpOnly'))).toBe(true)
    })
  })

  describe('输入验证', () => {
    it('空用户名返回 400', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ username: '', password: 'test' })
      expect(res.status).toBe(400)
    })
  })
})
```

### 执行顺序

| Step | 操作 | 预期 |
|------|------|------|
| 1 | 写上述测试 | 测试失败（无速率限制） |
| 2 | 运行测试 | 确认失败 |
| 3 | 实现速率限制 | 测试通过 |
| 4 | 运行全量测试 | 无回归 |

---

## 三、任务清单

### 任务 6.1: 添加登录速率限制 (3h)

**文件**: `后端代码/server/src/routes/auth.ts`

```typescript
import rateLimit from 'express-rate-limit'

const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 5, // 5 次
  message: { success: false, error: { message: '登录尝试过多，请稍后重试', code: 'RATE_LIMIT' } },
  standardHeaders: true,
  legacyHeaders: false,
})

router.post('/login', loginLimiter, (req, res) => {
  // ... 现有逻辑
})
```

**验收标准**:
- [ ] 1 分钟内超过 5 次登录返回 429
- [ ] 不同 IP 独立计数

---

### 任务 6.2: 实现账户锁定机制 (4h)

**文件**: `后端代码/server/src/routes/auth.ts` + `DatabaseManager.ts`

**新增表**:
```sql
CREATE TABLE IF NOT EXISTS login_attempts (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  success INTEGER NOT NULL DEFAULT 0,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
)
CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username, attempted_at)
```

**验收标准**:
- [ ] 连续 5 次失败后锁定 15 分钟
- [ ] 锁定期间返回 429 + 锁定剩余时间

---

### 任务 6.3: 改进 Token 存储方式 (5h)

**前端**: `前端代码/src/api/request.ts` — 从 Cookie 读取 Token
**后端**: `后端代码/server/src/routes/auth.ts` — 设置 httpOnly Cookie

```typescript
// 后端设置 Cookie
res.cookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 8 * 60 * 60 * 1000, // 8 小时
})
```

**验收标准**:
- [ ] Token 存储在 httpOnly Cookie
- [ ] 前端不再从 localStorage 读取 Token
- [ ] XSS 无法读取 Token

---

### 任务 6.4: 为 Refresh Token 使用独立 Secret (2h)

**文件**: `后端代码/server/src/routes/auth.ts`

```typescript
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + '_refresh'

const refreshToken = jwt.sign(
  { userId: user.id, type: 'refresh' },
  REFRESH_SECRET,
  { expiresIn: '7d' }
)
```

**验收标准**:
- [ ] Refresh Token 使用独立 Secret
- [ ] Access Token 泄露不影响 Refresh Token

---

### 任务 6.5: 添加 helmet 安全头 (2h)

**文件**: `后端代码/server/src/app.ts`

```typescript
import helmet from 'helmet'

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
    },
  },
}))
```

**验收标准**:
- [ ] 响应包含 X-Content-Type-Options: nosniff
- [ ] 响应包含 X-Frame-Options: DENY
- [ ] 前端正常加载

---

### 任务 6.6: 添加 express-validator 输入验证 (4h)

**文件**: 核心路由（入库、出库、退库、BOM）

```typescript
import { body, validationResult } from 'express-validator'

router.post('/',
  body('materialId').notEmpty().withMessage('物料ID不能为空'),
  body('quantity').isFloat({ min: 0.01 }).withMessage('数量必须大于0'),
  body('batchNo').optional().isString(),
  (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return error(res, 400, errors.array().map(e => e.msg).join(', '))
    }
    // ... 现有逻辑
  }
)
```

**验收标准**:
- [ ] 核心路由有输入验证
- [ ] 验证失败返回中文错误消息

---

### 任务 6.7: 完善角色权限检查 (2h)

**问题**: admin 角色绕过所有权限检查，缺少细粒度控制

**文件**: `后端代码/server/src/middleware/auth.ts`

**改动**: 添加操作审计日志，记录 admin 的敏感操作

**验收标准**:
- [ ] admin 操作有审计日志

---

### 任务 6.8: 添加 .env 安全处理 (3h)

**问题**: .env 文件被 git 跟踪，泄露 JWT Secret 和密码

**文件**: `.gitignore` + `后端代码/server/.env` + `前端代码/.env`

**改动**:
1. `.gitignore` 添加 `后端代码/server/.env` 和 `前端代码/.env`
2. `git rm --cached` 移除已跟踪的文件
3. 创建 `前端代码/.env.example`
4. docker-compose.yml 移除硬编码默认值

**验收标准**:
- [ ] .env 文件不再被 git 跟踪
- [ ] .env.example 模板存在
- [ ] docker-compose 强制要求设置环境变量

---

## 四、变更影响面报告

### 改动范围
- 修改文件: ~8 个（auth.ts, app.ts, request.ts, 核心路由）
- 新增文件: 1 个（login_attempts 表）
- 新增依赖: helmet, express-rate-limit

### 回滚方案

| 任务 | 回滚方式 | 影响 |
|------|---------|------|
| 6.1 速率限制 | 移除 loginLimiter 中间件 | 恢复无限制登录 |
| 6.2 账户锁定 | 删除 login_attempts 表 | 恢复无锁定 |
| 6.3 Token 存储 | 恢复 localStorage | 恢复 XSS 风险 |
| 6.4 Refresh Secret | 恢复同 Secret | 恢复密钥风险 |
| 6.5 helmet | 移除 app.use(helmet()) | 恢复无安全头 |
| 6.6 express-validator | 移除验证中间件 | 恢复无输入验证 |

---

## 五、PM 黑盒验收清单

- [ ] 连续 5 次错误密码后账户锁定 15 分钟
- [ ] 不同 IP 对同一账户的尝试也触发锁定
- [ ] Token 不在 localStorage 中
- [ ] 浏览器开发者工具看不到 Token 值（httpOnly）
- [ ] 响应头包含安全相关字段
- [ ] 输入非法数据时返回中文错误提示
