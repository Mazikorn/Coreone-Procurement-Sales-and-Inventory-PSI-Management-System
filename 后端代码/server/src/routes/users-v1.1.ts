import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { v4 as uuidv4 } from 'uuid'
import { randomBytes } from 'crypto'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { logOperation } from '../utils/operation-logger.js'

const router = Router()

function generateTemporaryPassword() {
  return `Core@${randomBytes(8).toString('base64url')}`
}

function normalizeRequiredText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeOptionalText(value: unknown) {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim()
  return normalized || null
}

function validateStatus(value: unknown) {
  return value === undefined || value === 'active' || value === 'inactive'
}

function validateProvidedPassword(value: unknown) {
  if (value === undefined || value === null || value === '') return true
  return typeof value === 'string' && value.trim().length >= 8
}

function isAssignableRole(db: any, role: string) {
  return Boolean(db.prepare('SELECT 1 FROM roles WHERE code = ? AND status = 1 AND is_deleted = 0').get(role))
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

function buildUserWhere(query: any) {
  const { keyword, role, roleId, status } = query
  let where = 'is_deleted = 0'
  const params: any[] = []
  if (keyword) {
    where += ' AND (username LIKE ? OR real_name LIKE ? OR department LIKE ? OR phone LIKE ? OR email LIKE ?)'
    const like = `%${keyword}%`
    params.push(like, like, like, like, like)
  }
  if (role) {
    where += ' AND role = ?'
    params.push(role)
  }
  if (roleId) {
    where += ' AND role = (SELECT code FROM roles WHERE id = ? AND is_deleted = 0)'
    params.push(roleId)
  }
  if (status === 'active' || status === 'inactive') {
    where += ' AND status = ?'
    params.push(status === 'active' ? 1 : 0)
  }
  return { where, params }
}

function normalizeIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map(id => String(id || '').trim()).filter(Boolean))]
}

function getUsersByIds(db: any, ids: string[]) {
  if (ids.length === 0) return []
  return db.prepare(`
    SELECT *
    FROM users
    WHERE is_deleted = 0 AND id IN (${ids.map(() => '?').join(',')})
  `).all(...ids) as any[]
}

function hasAdminUser(rows: any[]) {
  return rows.some(row => row.username === 'admin' || row.id === 'USER-001')
}

router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query
    const db = getDatabase()
    const { where, params } = buildUserWhere(req.query)

    const count = (db.prepare(`SELECT COUNT(*) as total FROM users WHERE ${where}`).get(...params) as any)?.total || 0
    const pageNum = Math.max(1, Number(page))
    const safePageSize = Math.max(1, Math.min(1000, Number(pageSize)))
    const offset = (pageNum - 1) * safePageSize
    const list = db.prepare(`SELECT id, username, real_name, role, department, phone, email, status, last_login, created_at FROM users WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, safePageSize, offset) as any[]
    const roleRows = db.prepare('SELECT code, permissions, data_scope FROM roles WHERE is_deleted = 0').all() as any[]
    const roleMetaByCode = new Map(roleRows.map(role => [role.code, {
      permissions: parsePermissions(role.permissions),
      dataScope: normalizeDataScope(role.data_scope),
    }]))

    successList(res, list.map((r: any) => ({
      id: r.id, username: r.username, realName: r.real_name,
      role: r.role, department: r.department, phone: r.phone,
      email: r.email, status: r.status === 1 ? 'active' : 'inactive',
      permissions: roleMetaByCode.get(r.role)?.permissions || [],
      dataScope: roleMetaByCode.get(r.role)?.dataScope || (r.role === 'admin' ? 'all' : 'dept'),
      lastLogin: r.last_login || null,
      createdAt: r.created_at,
    })), pageNum, safePageSize, count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/stats', (req, res) => {
  try {
    const db = getDatabase()
    const { where, params } = buildUserWhere(req.query)
    const row = db.prepare(`
      SELECT
        COUNT(*) as totalUsers,
        SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END) as activeUsers,
        SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END) as inactiveUsers,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as adminUsers
      FROM users
      WHERE ${where}
    `).get(...params) as any
    success(res, {
      totalUsers: row?.totalUsers || 0,
      activeUsers: row?.activeUsers || 0,
      inactiveUsers: row?.inactiveUsers || 0,
      adminUsers: row?.adminUsers || 0,
    })
  } catch (err: any) { error(res, err.message) }
})

router.post('/', (req, res) => {
  try {
    const { password, status } = req.body
    const username = normalizeRequiredText(req.body.username)
    const realName = normalizeRequiredText(req.body.realName)
    const role = normalizeRequiredText(req.body.role)
    if (!username || !realName) { error(res, 'Username and realName required', 'INVALID_PARAMETER', 400); return }
    const db = getDatabase()
    if (!role) { error(res, 'Role required', 'INVALID_PARAMETER', 400); return }
    if (!validateStatus(status)) { error(res, 'Invalid status', 'INVALID_PARAMETER', 400); return }
    if (!validateProvidedPassword(password)) { error(res, 'Password must be at least 8 characters', 'INVALID_PARAMETER', 400); return }
    if (!isAssignableRole(db, role)) { error(res, 'Invalid role', 'INVALID_PARAMETER', 400); return }
    const id = uuidv4()
    const initialPassword = password || generateTemporaryPassword()
    const hashedPassword = bcrypt.hashSync(initialPassword, 12)
    db.prepare('INSERT INTO users (id, username, password, real_name, role, department, phone, email, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, username, hashedPassword, realName, role, normalizeOptionalText(req.body.department), normalizeOptionalText(req.body.phone), normalizeOptionalText(req.body.email), status === 'inactive' ? 0 : 1)
    logOperation(db, req, {
      operation: 'create user',
      description: `创建用户 ${username}`,
      requestData: { module: 'user', id, username, realName, role, status: status === 'inactive' ? 'inactive' : 'active' },
      responseData: { id },
    })
    success(res, { id, initialPassword }, 'Created', 201)
  } catch (err: any) {
    if (err.message.includes('UNIQUE')) { error(res, 'Username exists', 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

router.post('/:id/reset-password', (req, res) => {
  try {
    const { id } = req.params
    const { password } = req.body || {}
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM users WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!existing) { error(res, 'Not found', 'NOT_FOUND', 404); return }
    if (!validateProvidedPassword(password)) { error(res, 'Password must be at least 8 characters', 'INVALID_PARAMETER', 400); return }
    const newPassword = password || generateTemporaryPassword()
    db.prepare('UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0')
      .run(bcrypt.hashSync(newPassword, 12), id)
    logOperation(db, req, {
      operation: 'update user password',
      description: `重置用户 ${existing.username} 密码`,
      requestData: { module: 'user', id, username: existing.username },
      responseData: { id },
    })
    success(res, { id, temporaryPassword: newPassword }, 'Password reset')
  } catch (err: any) { error(res, err.message) }
})

router.put('/batch/status', (req, res) => {
  try {
    const ids = normalizeIds(req.body?.ids)
    const status = req.body?.status
    if (ids.length === 0) { error(res, 'ids required', 'INVALID_PARAMETER', 400); return }
    if (status !== 'active' && status !== 'inactive') { error(res, 'Invalid status', 'INVALID_PARAMETER', 400); return }

    const db = getDatabase()
    const rows = getUsersByIds(db, ids)
    if (rows.length !== ids.length) { error(res, 'Some users not found', 'NOT_FOUND', 404); return }
    if (status === 'inactive' && hasAdminUser(rows)) {
      error(res, 'Cannot disable admin account', 'BUSINESS_CONFLICT', 409); return
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        UPDATE users
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE is_deleted = 0 AND id IN (${ids.map(() => '?').join(',')})
      `).run(status === 'active' ? 1 : 0, ...ids)
      db.exec('COMMIT')
      logOperation(db, req, {
        operation: 'update user status',
        description: `批量${status === 'active' ? '启用' : '停用'}用户 ${ids.length} 个`,
        requestData: { module: 'user', ids, status },
        responseData: { updatedCount: ids.length },
      })
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }

    success(res, { updatedCount: ids.length }, 'Batch status updated')
  } catch (err: any) { error(res, err.message) }
})

router.delete('/batch', (req, res) => {
  try {
    const ids = normalizeIds(req.body?.ids)
    if (ids.length === 0) { error(res, 'ids required', 'INVALID_PARAMETER', 400); return }

    const db = getDatabase()
    const rows = getUsersByIds(db, ids)
    if (rows.length !== ids.length) { error(res, 'Some users not found', 'NOT_FOUND', 404); return }
    if (hasAdminUser(rows)) {
      error(res, 'Cannot delete admin account', 'BUSINESS_CONFLICT', 409); return
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        UPDATE users
        SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
        WHERE is_deleted = 0 AND id IN (${ids.map(() => '?').join(',')})
      `).run(...ids)
      db.exec('COMMIT')
      logOperation(db, req, {
        operation: 'delete user',
        description: `批量删除用户 ${ids.length} 个`,
        requestData: { module: 'user', ids },
        responseData: { deletedCount: ids.length },
      })
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }

    success(res, { deletedCount: ids.length }, 'Batch deleted')
  } catch (err: any) { error(res, err.message) }
})

router.put('/:id', (req, res) => {
  try {
    const { id } = req.params
    const data = req.body
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM users WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!existing) { error(res, 'Not found', 'NOT_FOUND', 404); return }
    if (!validateStatus(data.status)) {
      error(res, 'Invalid status', 'INVALID_PARAMETER', 400); return
    }
    if (!validateProvidedPassword(data.password)) {
      error(res, 'Password must be at least 8 characters', 'INVALID_PARAMETER', 400); return
    }
    // 禁止停用 admin 账户
    if ((existing.username === 'admin' || existing.id === 'USER-001') && data.status !== undefined && data.status !== 'active') {
      error(res, 'Cannot disable admin account', 'BUSINESS_CONFLICT', 409); return
    }
    const normalizedRole = data.role !== undefined ? normalizeRequiredText(data.role) : undefined
    if (normalizedRole !== undefined && (!normalizedRole || !isAssignableRole(db, normalizedRole))) {
      error(res, 'Invalid role', 'INVALID_PARAMETER', 400); return
    }
    const fields: string[] = []; const params: any[] = []
    if (data.realName !== undefined) {
      const realName = normalizeRequiredText(data.realName)
      if (!realName) { error(res, 'realName required', 'INVALID_PARAMETER', 400); return }
      fields.push('real_name = ?'); params.push(realName)
    }
    if (normalizedRole !== undefined) { fields.push('role = ?'); params.push(normalizedRole) }
    if (data.department !== undefined) { fields.push('department = ?'); params.push(normalizeOptionalText(data.department)) }
    if (data.phone !== undefined) { fields.push('phone = ?'); params.push(normalizeOptionalText(data.phone)) }
    if (data.email !== undefined) { fields.push('email = ?'); params.push(normalizeOptionalText(data.email)) }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status === 'active' ? 1 : 0) }
    if (data.password) { fields.push('password = ?'); params.push(bcrypt.hashSync(data.password, 12)) }
    if (fields.length > 0) { params.push(id); db.prepare(`UPDATE users SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0`).run(...params) }
    const auditFields = fields.map(field => {
      const fieldName = field.split(' = ')[0]
      return fieldName === 'password' ? 'credential_changed' : fieldName
    })
    logOperation(db, req, {
      operation: 'update user',
      description: `更新用户 ${existing.username}`,
      requestData: { module: 'user', id, fields: auditFields },
      responseData: { id },
    })
    success(res, { id }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM users WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!existing) { error(res, 'Not found', 'NOT_FOUND', 404); return }
    // 禁止删除 admin 账户
    if (existing.username === 'admin' || existing.id === 'USER-001') {
      error(res, 'Cannot delete admin account', 'BUSINESS_CONFLICT', 409); return
    }
    db.prepare('UPDATE users SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    logOperation(db, req, {
      operation: 'delete user',
      description: `删除用户 ${existing.username}`,
      requestData: { module: 'user', id, username: existing.username },
      responseData: { id },
    })
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

export default router
