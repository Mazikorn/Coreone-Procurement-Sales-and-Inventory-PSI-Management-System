import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { body, validationResult } from 'express-validator'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, error } from '../utils/response.js'
import { JWT_SECRET, getRolePermissions } from '../middleware/auth.js'

const router = Router()
const JWT_EXPIRES = '8h'
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + '_refresh'

const isRoleActive = (db: ReturnType<typeof getDatabase>, roleCode: string) => {
  const role = db.prepare('SELECT status FROM roles WHERE code = ? AND is_deleted = 0').get(roleCode) as any
  return !!role && Number(role.status) === 1
}

// 登录速率限制：1 分钟内最多 5 次（本地开发/E2E 测试跳过）
const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 分钟
  max: 5, // 5 次
  message: { success: false, error: { message: '登录尝试过多，请稍后重试', code: 'RATE_LIMIT' } },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    const ip = req.ip || req.socket.remoteAddress || ''
    return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
  },
})

// 登录输入验证
const loginValidation = [
  body('username').notEmpty().withMessage('用户名不能为空').isString().trim(),
  body('password').notEmpty().withMessage('密码不能为空').isString(),
]

router.post('/login', loginLimiter, loginValidation, (req, res) => {
  try {
    // 检查验证结果
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      error(res, errors.array().map(e => e.msg).join(', '), 'INVALID_PARAMETER', 400)
      return
    }

    const { username, password } = req.body

    const db = getDatabase()
    const ip = req.ip || req.socket.remoteAddress || 'unknown'

    // 检查账户锁定（连续 5 次失败后锁定 15 分钟，本地开发跳过）
    const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
    if (!isLocal) {
      const recentFailures = db.prepare(`
        SELECT COUNT(*) as count FROM login_attempts
        WHERE username = ? AND success = 0 AND attempted_at > datetime('now', '-15 minutes')
      `).get(username) as any

      if (recentFailures && recentFailures.count >= 5) {
        error(res, '账户已锁定，请 15 分钟后重试', 'ACCOUNT_LOCKED', 429)
        return
      }
    }

    const user = db.prepare('SELECT * FROM users WHERE username = ? AND status = 1 AND is_deleted = 0').get(username) as any

    const validPassword = user && bcrypt.compareSync(password, user.password)
    const roleActive = validPassword ? isRoleActive(db, user.role) : false

    // 记录登录尝试
    const attemptId = uuidv4()
    db.prepare(`
      INSERT INTO login_attempts (id, username, ip_address, success, attempted_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(attemptId, username, ip, validPassword && roleActive ? 1 : 0)

    // 清理超过 24 小时的记录
    db.prepare("DELETE FROM login_attempts WHERE attempted_at < datetime('now', '-24 hours')").run()

    if (!validPassword) {
      error(res, '用户名或密码错误', 'UNAUTHORIZED', 401)
      return
    }

    if (!roleActive) {
      error(res, '角色已停用，无法登录', 'ROLE_DISABLED', 401)
      return
    }

    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(user.id)

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    )

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      REFRESH_SECRET,
      { expiresIn: '7d' }
    )

    success(res, {
      token,
      refreshToken,
      expiresIn: 28800,
      user: {
        id: user.id,
        username: user.username,
        realName: user.real_name,
        role: user.role,
        permissions: getRolePermissions(user.role),
      },
    }, 'Login success')
  } catch (err: any) {
    error(res, err.message, 'INTERNAL_ERROR', 500)
  }
})

router.post('/refresh', (req, res) => {
  try {
    const { refreshToken } = req.body
    if (!refreshToken) {
      error(res, 'Refresh token required', 'INVALID_PARAMETER', 400)
      return
    }

    const decoded = jwt.verify(refreshToken, REFRESH_SECRET) as { userId: string; type: string }
    if (decoded.type !== 'refresh') {
      error(res, 'Invalid refresh token', 'UNAUTHORIZED', 401)
      return
    }

    const db = getDatabase()
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_deleted = 0').get(decoded.userId) as any

    if (!user || user.status !== 1) {
      error(res, 'User not found or disabled', 'UNAUTHORIZED', 401)
      return
    }

    if (!isRoleActive(db, user.role)) {
      error(res, 'User role disabled', 'ROLE_DISABLED', 401)
      return
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    )

    success(res, { token, expiresIn: 28800 }, 'Refresh success')
  } catch (err: any) {
    error(res, err.message, 'UNAUTHORIZED', 401)
  }
})

router.post('/logout', (_req, res) => {
  success(res, null, 'Logout success')
})

export default router
