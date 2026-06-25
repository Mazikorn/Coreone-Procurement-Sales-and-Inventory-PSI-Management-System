import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { ROLE_PERMISSIONS, SYSTEM_ROLE_CODES } from '../constants/rolePermissions.js'
import { getDatabase } from '../database/DatabaseManager.js'
export { ROLE_PERMISSIONS }

const jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) {
  throw new Error('JWT_SECRET environment variable is required')
}
export const JWT_SECRET = jwtSecret

// 接口路径到权限的映射
function pathToPermission(req: AuthRequest): string {
  const path = req.baseUrl?.replace('/api/v1', '') || req.path
  if (path.startsWith('/users')) return 'users'
  if (path.startsWith('/roles')) return 'roles'
  if (path.startsWith('/inventory')) return 'inventory'
  if (path.startsWith('/inbound')) return 'inbound'
  if (path.startsWith('/outbound')) return 'outbound'
  if (path.startsWith('/stocktaking')) return 'stocktaking'
  if (path.startsWith('/categories')) return 'categories'
  if (path.startsWith('/materials')) return 'materials'
  if (path.startsWith('/suppliers')) return 'suppliers'
  if (path.startsWith('/locations')) return 'locations'
  if (path.startsWith('/projects')) return 'projects'
  if (path.startsWith('/boms')) return 'bom'
  if (path.startsWith('/reports') || path.startsWith('/depletion')) return 'cost_analysis'
  if (path.startsWith('/abc')) return 'cost_analysis'
  if (path.startsWith('/reconciliation')) return 'cost_analysis'
  if (path.startsWith('/indirect-costs')) return 'cost_analysis'
  if (path.startsWith('/cost-adjustments')) return 'cost_analysis'
  if (path.startsWith('/equipment-types')) return 'equipment'
  if (path.startsWith('/equipment')) return 'equipment'
  if (path.startsWith('/labor-times')) return 'labor_times'
  if (path.startsWith('/alerts')) return 'alerts'
  if (path.startsWith('/logs')) return 'logs'
  if (path.startsWith('/purchase-orders')) return 'purchase_orders'
  if (path.startsWith('/returns')) return 'returns'
  if (path.startsWith('/scraps')) return 'scraps'
  if (path.startsWith('/supplier-returns')) return 'supplier_returns'
  if (path.startsWith('/transfers')) return 'transfers'
  return ''
}

function parsePermissions(value: unknown) {
  if (!value || typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getRolePermissions(role: string): string[] {
  try {
    const db = getDatabase()
    const row = db.prepare('SELECT permissions FROM roles WHERE code = ? AND status = 1 AND is_deleted = 0').get(role) as any
    if (row) return parsePermissions(row.permissions)
  } catch {
    // Fall back to static defaults if the database is unavailable during startup or tests.
  }
  return ROLE_PERMISSIONS[role] || []
}

function methodToAction(method: string) {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return 'view'
  if (method === 'POST') return 'add'
  if (method === 'PUT' || method === 'PATCH') return 'edit'
  if (method === 'DELETE') return 'delete'
  return 'view'
}

function hasPermission(userPerms: string[], permission: string, method: string) {
  if (!permission) return true
  if (userPerms.includes('*')) return true
  if (userPerms.includes(permission)) return true
  return userPerms.includes(`${permission}:${methodToAction(method)}`)
}

interface AuthRequest extends Request {
  user?: { userId: string; username: string; role: string }
}

export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization
  const token = authHeader?.split(' ')[1]

  if (!token) {
    res.status(401).json({ success: false, error: { message: 'Access token required', code: 'UNAUTHORIZED' } })
    return
  }

  let decoded: { userId: string; username: string; role: string }
  try {
    decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string; role: string }
  } catch {
    res.status(401).json({ success: false, error: { message: 'Invalid token', code: 'UNAUTHORIZED' } })
    return
  }

  // P0-03 安全：access token 8h 有效；停用/软删账号或改角色后必须即时失效，否则旧 token 在到期前
  // （最长 8h）仍可调用原权限接口，应急收权失效。verify 后轻量回查 users（与 /auth/refresh 的
  // status 校验对齐）：账号停用/删除或角色已变更则拒绝、强制重登。DB 不可用时退回仅签名校验，避免整站鉴权硬瘫。
  try {
    const db = getDatabase()
    const u = db.prepare('SELECT status, is_deleted, role FROM users WHERE id = ?').get(decoded.userId) as any
    if (!u || Number(u.is_deleted) === 1 || Number(u.status) !== 1) {
      res.status(401).json({ success: false, error: { message: '账号已停用或删除，请重新登录', code: 'ACCOUNT_DISABLED' } })
      return
    }
    if (u.role !== decoded.role) {
      res.status(401).json({ success: false, error: { message: '账号角色已变更，请重新登录', code: 'ROLE_CHANGED' } })
      return
    }
  } catch {
    // 仅在数据库不可用时到达（启动/极端情况）：退回仅凭签名校验，不阻断全部已认证请求。
  }

  req.user = decoded
  next()
}

export function requireRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const user = req.user
    if (!user) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } })
      return
    }

    // admin 拥有所有权限
    if (user.role === 'admin') {
      next()
      return
    }

    const permission = pathToPermission(req)
    const userPerms = getRolePermissions(user.role)

    // 检查角色是否在允许列表中；自定义角色可通过数据库权限配置放行。
    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role) && !hasPermission(userPerms, permission, req.method)) {
      res.status(403).json({ success: false, error: { message: 'Forbidden: insufficient permissions', code: 'FORBIDDEN' } })
      return
    }

    // 检查接口权限
    if (permission && !hasPermission(userPerms, permission, req.method)) {
      res.status(403).json({ success: false, error: { message: 'Forbidden: insufficient permissions', code: 'FORBIDDEN' } })
      return
    }

    next()
  }
}

export function requireStrictRole(...allowedRoles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    const user = req.user
    if (!user) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } })
      return
    }

    if (!allowedRoles.includes(user.role)) {
      res.status(403).json({ success: false, error: { message: 'Forbidden: insufficient permissions', code: 'FORBIDDEN' } })
      return
    }

    next()
  }
}

export function requireCostWorkbenchAccess(req: AuthRequest, res: Response, next: NextFunction): void {
  const user = req.user
  if (!user) {
    res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } })
    return
  }

  if (user.role === 'admin' || user.role === 'finance') {
    next()
    return
  }

  const userPerms = getRolePermissions(user.role)
  const isCustomRole = !SYSTEM_ROLE_CODES.includes(user.role)
  if (isCustomRole && (userPerms.includes('*') || userPerms.includes('cost_analysis'))) {
    next()
    return
  }

  res.status(403).json({ success: false, error: { message: 'Forbidden: insufficient permissions', code: 'FORBIDDEN' } })
}
