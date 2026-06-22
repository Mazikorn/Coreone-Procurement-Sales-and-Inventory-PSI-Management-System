import { Router } from 'express'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { v4 as uuidv4 } from 'uuid'
import { logOperation } from '../utils/operation-logger.js'
import { SYSTEM_ROLE_CODES } from '../constants/rolePermissions.js'

const router = Router()
const SYSTEM_ROLE_CODES_SQL = SYSTEM_ROLE_CODES.map(code => `'${code}'`).join(', ')
const VALID_PERMISSION_MODULES = new Set([
  'dashboard',
  'inventory',
  'inbound',
  'outbound',
  'stocktaking',
  'returns',
  'scraps',
  'transfers',
  'supplier_returns',
  'purchase_orders',
  'projects',
  'bom',
  'categories',
  'materials',
  'suppliers',
  'locations',
  'equipment',
  'labor_times',
  'cost_analysis',
  'alerts',
  'users',
  'roles',
  'logs',
])
const VALID_PERMISSION_ACTIONS = new Set(['view', 'add', 'edit', 'delete'])

function isSystemRoleCode(code: unknown) {
  return typeof code === 'string' && SYSTEM_ROLE_CODES.includes(code)
}

function buildRoleWhere(query: any) {
  const { keyword, type } = query
  let where = 'r.is_deleted = 0'
  const params: any[] = []
  if (keyword) {
    where += ' AND (r.code LIKE ? OR r.name LIKE ? OR r.description LIKE ?)'
    const like = `%${keyword}%`
    params.push(like, like, like)
  }
  if (type === 'system') {
    where += ` AND r.code IN (${SYSTEM_ROLE_CODES_SQL})`
  }
  if (type === 'custom') {
    where += ` AND r.code NOT IN (${SYSTEM_ROLE_CODES_SQL})`
  }
  return { where, params }
}

function roleListSelect(where: string) {
  return `
    SELECT r.*, COALESCE(uc.user_count, 0) as user_count
    FROM roles r
    LEFT JOIN (
      SELECT role, COUNT(*) as user_count
      FROM users
      WHERE is_deleted = 0
      GROUP BY role
    ) uc ON uc.role = r.code
    WHERE ${where}
  `
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

function normalizeDataScope(value: unknown) {
  return value === 'all' || value === 'dept' || value === 'self' ? value : 'dept'
}

function validateDataScope(value: unknown) {
  return value === undefined || value === 'all' || value === 'dept' || value === 'self'
}

function validatePermissions(value: unknown) {
  if (value === undefined) return { ok: true, permissions: undefined as string[] | undefined }
  if (!Array.isArray(value)) return { ok: false, permissions: [] }

  const normalized: string[] = []
  for (const raw of value) {
    if (typeof raw !== 'string') return { ok: false, permissions: [] }
    const permission = raw.trim()
    const parts = permission.split(':')
    if (parts.length > 2 || !permission || permission === '*') return { ok: false, permissions: [] }
    const [module, action] = parts
    if (!VALID_PERMISSION_MODULES.has(module)) return { ok: false, permissions: [] }
    if (action !== undefined && !VALID_PERMISSION_ACTIONS.has(action)) return { ok: false, permissions: [] }
    if (!normalized.includes(permission)) normalized.push(permission)
  }

  return { ok: true, permissions: normalized }
}

router.get('/', (req, res) => {
  const database = getDatabase()
  const page = Math.max(1, Number(req.query.page) || 1)
  const pageSize = Math.max(1, Math.min(1000, Number(req.query.pageSize) || 20))
  const offset = (page - 1) * pageSize
  const { where, params } = buildRoleWhere(req.query)

  const stmt = database.prepare(`
    ${roleListSelect(where)}
    ORDER BY r.created_at DESC
    LIMIT ? OFFSET ?
  `)
  const rows = stmt.all(...params, pageSize, offset) as any[]
  const roleCodes = rows.map((r: any) => r.code)
  const associatedUsersByRole = new Map<string, any[]>()
  if (roleCodes.length > 0) {
    const placeholders = roleCodes.map(() => '?').join(',')
    const userRows = database.prepare(`
      SELECT id, username, real_name, role, department, status, last_login, created_at
      FROM users
      WHERE is_deleted = 0 AND role IN (${placeholders})
      ORDER BY username ASC
    `).all(...roleCodes) as any[]
    for (const user of userRows) {
      const current = associatedUsersByRole.get(user.role) || []
      current.push({
        id: user.id,
        username: user.username,
        realName: user.real_name,
        department: user.department,
        status: user.status === 1 ? 'active' : 'inactive',
        lastLogin: user.last_login || null,
        createdAt: user.created_at,
      })
      associatedUsersByRole.set(user.role, current)
    }
  }

  const list = rows.map((r: any) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    description: r.description,
    status: r.status === 1 ? 'active' : 'inactive',
    userCount: Number(r.user_count) || 0,
    permissions: parsePermissions(r.permissions),
    dataScope: normalizeDataScope(r.data_scope),
    isSystem: isSystemRoleCode(r.code),
    associatedUsers: associatedUsersByRole.get(r.code) || [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }))

  const countStmt = database.prepare(`SELECT COUNT(*) as total FROM roles r WHERE ${where}`)
  const { total } = countStmt.get(...params) as any

  successList(res, list, page, pageSize, total)
})

router.get('/stats', (req, res) => {
  try {
    const database = getDatabase()
    const { where, params } = buildRoleWhere(req.query)
    const rows = database.prepare(roleListSelect(where)).all(...params) as any[]
    success(res, {
      totalRoles: rows.length,
      systemRoles: rows.filter(row => isSystemRoleCode(row.code)).length,
      customRoles: rows.filter(row => !isSystemRoleCode(row.code)).length,
      assignedUsers: rows.reduce((sum, row) => sum + (Number(row.user_count) || 0), 0),
    })
  } catch (err: any) {
    error(res, err.message)
  }
})

router.post('/', (req, res) => {
  try {
    const database = getDatabase()
    const { code, name, description, permissions, status, dataScope } = req.body
    if (!code || !name) { error(res, 'Code and name required', 'INVALID_PARAMETER', 400); return }
    if (isSystemRoleCode(code)) { error(res, 'System role code is reserved', 'FORBIDDEN', 403); return }
    if (!validateDataScope(dataScope)) { error(res, 'Invalid data scope', 'INVALID_PARAMETER', 400); return }
    const permissionValidation = validatePermissions(permissions)
    if (!permissionValidation.ok) { error(res, 'Invalid permissions', 'INVALID_PARAMETER', 400); return }
    const exists = database.prepare('SELECT 1 FROM roles WHERE code = ? AND is_deleted = 0').get(code)
    if (exists) { error(res, 'Role code already exists', 'RESOURCE_CONFLICT', 409); return }
    const id = uuidv4()
    database.prepare('INSERT INTO roles (id, code, name, description, permissions, data_scope, status) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, code, name, description || '', JSON.stringify(permissionValidation.permissions || []), normalizeDataScope(dataScope), status === 'active' ? 1 : 0)
    logOperation(database, req, {
      operation: 'create role',
      description: `创建角色 ${code}`,
      requestData: { module: 'role', id, code, name, permissions: permissionValidation.permissions || [], dataScope: normalizeDataScope(dataScope), status: status === 'active' ? 'active' : 'inactive' },
      responseData: { id },
    })
    success(res, { id }, 'Created')
  } catch (err: any) { error(res, err.message) }
})

router.put('/:id', (req, res) => {
  try {
    const database = getDatabase()
    const { id } = req.params
    const { code, name, description, permissions, status, dataScope } = req.body
    database.exec('BEGIN IMMEDIATE')
    const role = database.prepare('SELECT * FROM roles WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!role) {
      database.exec('ROLLBACK')
      error(res, 'Role not found', 'NOT_FOUND', 404); return
    }
    if (isSystemRoleCode(role.code)) {
      database.exec('ROLLBACK')
      error(res, 'Cannot modify system role', 'FORBIDDEN', 403); return
    }
    if (!validateDataScope(dataScope)) {
      database.exec('ROLLBACK')
      error(res, 'Invalid data scope', 'INVALID_PARAMETER', 400); return
    }
    const permissionValidation = validatePermissions(permissions)
    if (!permissionValidation.ok) {
      database.exec('ROLLBACK')
      error(res, 'Invalid permissions', 'INVALID_PARAMETER', 400); return
    }
    const assignedCount = (database.prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_deleted = 0').get(role.code) as any)?.count || 0
    const fields: string[] = []; const params: any[] = []
    if (code !== undefined) {
      if (code !== role.code) {
        if (assignedCount > 0) {
          database.exec('ROLLBACK')
          error(res, `角色已有 ${assignedCount} 个用户使用，不可修改编码`, 'CONFLICT', 409); return
        }
        const codeExists = database.prepare('SELECT 1 FROM roles WHERE code = ? AND id != ? AND is_deleted = 0').get(code, id)
        if (codeExists) {
          database.exec('ROLLBACK')
          error(res, 'Role code already exists', 'RESOURCE_CONFLICT', 409); return
        }
      }
      fields.push('code = ?'); params.push(code)
    }
    if (name !== undefined) { fields.push('name = ?'); params.push(name) }
    if (description !== undefined) { fields.push('description = ?'); params.push(description || '') }
    if (permissions !== undefined) { fields.push('permissions = ?'); params.push(JSON.stringify(permissionValidation.permissions || [])) }
    if (dataScope !== undefined) { fields.push('data_scope = ?'); params.push(normalizeDataScope(dataScope)) }
    if (status !== undefined) { fields.push('status = ?'); params.push(status === 'active' ? 1 : 0) }
    if (fields.length > 0) {
      params.push(id)
      database.prepare(`UPDATE roles SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...params)
    }
    database.exec('COMMIT')
    logOperation(database, req, {
      operation: 'update role',
      description: `更新角色 ${role.code}`,
      requestData: { module: 'role', id, code: role.code, fields: fields.map(field => field.split(' = ')[0]) },
      responseData: { id },
    })
    success(res, { id }, 'Updated')
  } catch (err: any) {
    try { getDatabase().exec('ROLLBACK') } catch {}
    error(res, err.message)
  }
})

router.delete('/:id', (req, res) => {
  try {
    const database = getDatabase()
    const { id } = req.params
    const existing = database.prepare('SELECT * FROM roles WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    if (isSystemRoleCode(existing.code)) { error(res, 'Cannot delete system role', 'FORBIDDEN', 403); return }
    const assignedCount = (database.prepare('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_deleted = 0').get(existing.code) as any)?.count || 0
    if (assignedCount > 0) {
      error(res, `角色已有 ${assignedCount} 个用户使用，不可删除`, 'CONFLICT', 409)
      return
    }
    database.prepare('UPDATE roles SET is_deleted = 1 WHERE id = ?').run(id)
    logOperation(database, req, {
      operation: 'delete role',
      description: `删除角色 ${existing.code}`,
      requestData: { module: 'role', id, code: existing.code },
      responseData: { id },
    })
    success(res, { id }, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

export default router
