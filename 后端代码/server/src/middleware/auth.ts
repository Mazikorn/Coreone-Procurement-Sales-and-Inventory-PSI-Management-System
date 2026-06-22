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

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; username: string; role: string }
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ success: false, error: { message: 'Invalid token', code: 'UNAUTHORIZED' } })
  }
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
