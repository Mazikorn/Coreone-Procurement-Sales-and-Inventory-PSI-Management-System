import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { authenticateToken, requireRole, requireStrictRole } from '../middleware/auth.js'
import { normalizeDisplayText, requireValidText, type TextGuardResult } from '../utils/text-guard.js'

const router = Router()

const requireLocationRead = requireRole('admin', 'warehouse_manager')
const requireLocationWrite = requireStrictRole('admin')

function buildLocationWhere(query: any) {
  const { zone, status, type, keyword } = query
  const includeDeleted = query?.includeDeleted === true || query?.includeDeleted === 'true'
  let where = includeDeleted ? '1 = 1' : 'is_deleted = 0'
  const params: any[] = []
  if (keyword) {
    where += ' AND (id LIKE ? OR code LIKE ? OR name LIKE ? OR zone LIKE ? OR COALESCE(shelf, \'\') LIKE ? OR COALESCE(position, \'\') LIKE ?)'
    const like = `%${keyword}%`
    params.push(like, like, like, like, like, like)
  }
  if (zone) { where += ' AND zone = ?'; params.push(zone) }
  if (type) { where += ' AND type = ?'; params.push(type) }
  if (status === 'active' || status === 'inactive') { where += ' AND status = ?'; params.push(status === 'active' ? 1 : 0) }
  return { where, params }
}

router.get('/', authenticateToken, requireLocationRead, (req, res) => {
  try {
    let { page = 1, pageSize = 20 } = req.query
    page = Math.max(1, Number(page) || 1)
    pageSize = Math.max(1, Math.min(1000, Number(pageSize) || 20))
    const db = getDatabase()
    const { where, params } = buildLocationWhere(req.query)

    const count = (db.prepare(`SELECT COUNT(*) as total FROM locations WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(`SELECT * FROM locations WHERE ${where} ORDER BY zone, name LIMIT ? OFFSET ?`).all(...params, Number(pageSize), offset) as any[]

    successList(res, list.map((r: any) => ({
      id: r.id, code: r.code, name: r.name, type: r.type, parentId: r.parent_id, zone: r.zone, shelf: r.shelf, position: r.position,
      capacity: r.capacity, used: r.used, status: r.status === 1 ? 'active' : 'inactive',
      isDeleted: Number(r.is_deleted || 0) !== 0,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/stats', authenticateToken, requireLocationRead, (req, res) => {
  try {
    const db = getDatabase()
    const { where, params } = buildLocationWhere(req.query)
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END), 0) as inactive,
        COALESCE(AVG(CASE WHEN capacity > 0 THEN (COALESCE(used, 0) * 100.0 / capacity) ELSE 0 END), 0) as avgUtilization
      FROM locations
      WHERE ${where}
    `).get(...params) as any
    success(res, {
      total: row?.total || 0,
      active: row?.active || 0,
      inactive: row?.inactive || 0,
      avgUtilization: Math.round(Number(row?.avgUtilization || 0)),
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/tree', authenticateToken, requireLocationRead, (_req, res) => {
  try {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT id, code, name, type, parent_id as parentId, zone, shelf, position, capacity, used, status
      FROM locations
      WHERE is_deleted = 0
      ORDER BY zone, name
    `).all() as any[]

    const buildTree = (parentId: string | null, depth = 1, path: string[] = []): any[] => {
      return rows
        .filter((r: any) => (r.parentId || null) === parentId)
        .map((r: any) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          type: r.type,
          parentId: r.parentId || null,
          zone: r.zone,
          shelf: r.shelf,
          position: r.position,
          capacity: Number(r.capacity || 0),
          used: Number(r.used || 0),
          status: Number(r.status) === 1 ? 'active' : 'inactive',
          depth,
          fullPath: [...path, r.name].join(' / '),
          children: buildTree(r.id, depth + 1, [...path, r.name]),
          isLeaf: !rows.some((child: any) => child.parentId === r.id),
        }))
    }

    success(res, buildTree(null))
  } catch (err: any) { error(res, err.message) }
})

function generateLocationCode(db: any): string {
  const max = db.prepare("SELECT MAX(CAST(SUBSTR(code, 5) AS INTEGER)) as max FROM locations WHERE code LIKE 'LOC-%'").get() as any
  const num = (Number(max?.max) || 0) + 1
  return `LOC-${String(num).padStart(5, '0')}`
}

function sendTextError(res: any, result: TextGuardResult): result is Extract<TextGuardResult, { ok: false }> {
  if ('message' in result) {
    error(res, result.message, result.code, result.status)
    return true
  }
  return false
}

function normalizeCapacity(value: unknown, fallback = 999999) {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback }
  const capacity = Number(value)
  if (!Number.isFinite(capacity) || capacity < 0) {
    return { ok: false, status: 400, message: '容量限制必须为大于等于 0 的数字', code: 'INVALID_PARAMETER' }
  }
  return { ok: true, value: capacity }
}

function getLocationReferences(db: any, locationId: string) {
  const check = buildLocationDeleteCheck(db, locationId)
  if (!check) return []
  return [
    { label: '下级库位', count: check.impacts.childLocationCount },
    { label: '物料默认库位', count: check.impacts.materialCount },
    { label: '库存记录', count: check.impacts.inventoryCount },
    { label: '多库位库存明细', count: check.impacts.inventoryLocationCount },
    { label: '入库记录', count: check.impacts.inboundCount },
    { label: '调拨记录', count: check.impacts.transferCount },
  ].filter(item => item.count > 0)
}

function buildLocationDeleteCheck(db: any, locationId: string) {
  const location = db.prepare('SELECT code, name FROM locations WHERE id = ?').get(locationId) as any
  if (!location) return null
  const locationName = location?.name || ''
  const checks = [
    {
      label: '下级库位',
      count: (db.prepare('SELECT COUNT(*) as count FROM locations WHERE parent_id = ? AND is_deleted = 0').get(locationId) as any)?.count || 0,
    },
    {
      label: '物料默认库位',
      count: (db.prepare('SELECT COUNT(*) as count FROM materials WHERE location_id = ? AND is_deleted = 0').get(locationId) as any)?.count || 0,
    },
    {
      label: '库存记录',
      count: (db.prepare('SELECT COUNT(*) as count FROM inventory WHERE location_id = ? AND COALESCE(stock, 0) > 0').get(locationId) as any)?.count || 0,
    },
    {
      label: '多库位库存明细',
      count: (db.prepare('SELECT COUNT(*) as count FROM inventory_locations WHERE location_id = ? AND COALESCE(stock, 0) > 0').get(locationId) as any)?.count || 0,
    },
    {
      label: '入库记录',
      count: (db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE location_id = ? AND is_deleted = 0').get(locationId) as any)?.count || 0,
    },
    {
      label: '调拨记录',
      count: (db.prepare(`
        SELECT COUNT(*) as count
        FROM inbound_records
        WHERE is_deleted = 0
          AND type = 'transfer'
          AND (location_id = ? OR from_location_id = ? OR from_location_name = ?)
      `).get(locationId, locationId, locationName) as any)?.count || 0,
    },
  ]
  const reasons = checks
    .filter(item => item.count > 0)
    .map(item => `存在 ${item.count} ${item.label === '下级库位' ? '个' : '条'}${item.label}引用`)

  return {
    location: {
      id: locationId,
      code: location.code,
      name: location.name,
    },
    deletable: reasons.length === 0,
    impacts: {
      childLocationCount: checks[0].count,
      materialCount: checks[1].count,
      inventoryCount: checks[2].count,
      inventoryLocationCount: checks[3].count,
      inboundCount: checks[4].count,
      transferCount: checks[5].count,
    },
    reasons,
  }
}

function buildLocationStatusCheck(db: any, locationId: string, targetStatus: 'active' | 'inactive') {
  const location = db.prepare('SELECT id, code, name, parent_id FROM locations WHERE id = ? AND is_deleted = 0').get(locationId) as any
  if (!location) return null

  if (targetStatus === 'active') {
    const reasons: string[] = []
    if (location.parent_id) {
      const parentValidation = validateLocationParent(db, location.parent_id, locationId)
      if (!parentValidation.ok) reasons.push(parentValidation.message)
    }
    return {
      location: {
        id: location.id,
        code: location.code,
        name: location.name,
      },
      targetStatus,
      canChange: reasons.length === 0,
      impacts: {
        activeChildLocationCount: 0,
        activeMaterialCount: 0,
        inventoryCount: 0,
        inventoryLocationCount: 0,
      },
      reasons,
    }
  }

  const checks = [
    {
      label: '启用下级库位',
      count: (db.prepare('SELECT COUNT(*) as count FROM locations WHERE parent_id = ? AND is_deleted = 0 AND status = 1').get(locationId) as any)?.count || 0,
    },
    {
      label: '启用物料默认库位',
      count: (db.prepare('SELECT COUNT(*) as count FROM materials WHERE location_id = ? AND is_deleted = 0 AND status = 1').get(locationId) as any)?.count || 0,
    },
    {
      label: '当前库存',
      count: (db.prepare('SELECT COUNT(*) as count FROM inventory WHERE location_id = ? AND COALESCE(stock, 0) > 0').get(locationId) as any)?.count || 0,
    },
    {
      label: '多库位库存明细',
      count: (db.prepare('SELECT COUNT(*) as count FROM inventory_locations WHERE location_id = ? AND COALESCE(stock, 0) > 0').get(locationId) as any)?.count || 0,
    },
  ]
  const reasons = checks
    .filter(item => item.count > 0)
    .map(item => `存在 ${item.count} ${item.label === '启用下级库位' ? '个' : '条'}${item.label}引用`)

  return {
    location: {
      id: location.id,
      code: location.code,
      name: location.name,
    },
    targetStatus,
    canChange: reasons.length === 0,
    impacts: {
      activeChildLocationCount: checks[0].count,
      activeMaterialCount: checks[1].count,
      inventoryCount: checks[2].count,
      inventoryLocationCount: checks[3].count,
    },
    reasons,
  }
}

function validateLocationParent(db: any, parentId: unknown, currentId?: string) {
  const id = String(parentId || '').trim()
  if (!id) return { ok: true }
  if (currentId && id === currentId) {
    return { ok: false, status: 400, message: '库位不能选择自己作为父级', code: 'INVALID_PARAMETER' }
  }

  const parent = db.prepare('SELECT id, parent_id, status FROM locations WHERE id = ? AND is_deleted = 0').get(id) as any
  if (!parent) return { ok: false, status: 404, message: '父级库位不存在', code: 'NOT_FOUND' }
  if (Number(parent.status) !== 1) {
    return { ok: false, status: 409, message: '停用库位不能作为父级库位', code: 'CONFLICT' }
  }

  let nextParentId = parent.parent_id
  let depth = 0
  while (nextParentId) {
    if (currentId && nextParentId === currentId) {
      return { ok: false, status: 400, message: '库位父级不能选择自己的下级库位', code: 'INVALID_PARAMETER' }
    }
    const next = db.prepare('SELECT id, parent_id FROM locations WHERE id = ? AND is_deleted = 0').get(nextParentId) as any
    if (!next) break
    nextParentId = next.parent_id
    depth += 1
    if (depth > 100) {
      return { ok: false, status: 400, message: '库位层级存在循环', code: 'INVALID_PARAMETER' }
    }
  }

  return { ok: true }
}

router.post('/', authenticateToken, requireLocationWrite, (req, res) => {
  try {
    const { name, type, parentId, zone, shelf, position, capacity } = req.body
    const nameText = requireValidText(name, '库位名称')
    if (sendTextError(res, nameText)) return
    const zoneText = requireValidText(zone, '区域')
    if (sendTextError(res, zoneText)) return
    const typeText = normalizeDisplayText(type, '库位类型', { maxLength: 40 })
    if (sendTextError(res, typeText)) return
    const shelfText = normalizeDisplayText(shelf, '货架', { maxLength: 80 })
    if (sendTextError(res, shelfText)) return
    const positionText = normalizeDisplayText(position, '位置', { maxLength: 80 })
    if (sendTextError(res, positionText)) return
    const db = getDatabase()
    const parentValidation = validateLocationParent(db, parentId)
    if (!parentValidation.ok) { error(res, parentValidation.message, parentValidation.code, parentValidation.status); return }
    const capacityValue = normalizeCapacity(capacity)
    if (!capacityValue.ok) { error(res, capacityValue.message, capacityValue.code, capacityValue.status); return }
    const id = uuidv4()
    const finalCode = generateLocationCode(db)
    db.prepare('INSERT INTO locations (id, code, name, type, parent_id, zone, shelf, position, capacity, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)')
      .run(id, finalCode, nameText.value, typeText.value || 'shelf', parentId || null, zoneText.value, shelfText.value, positionText.value, capacityValue.value)
    success(res, { id, code: finalCode }, 'Created', 201)
  } catch (err: any) {
    if (err.message.includes('UNIQUE')) { error(res, 'Code exists', 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

router.put('/:id', authenticateToken, requireLocationWrite, (req, res) => {
  try {
    const { id } = req.params
    const data = req.body
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM locations WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!existing) { error(res, 'Not found', 'NOT_FOUND', 404); return }
    if (data.status !== undefined && data.status !== 'active' && data.status !== 'inactive') {
      error(res, 'Invalid status', 'INVALID_PARAMETER', 400); return
    }
    if (data.parentId !== undefined || (data.status === 'active' && existing.parent_id)) {
      const parentValidation = validateLocationParent(
        db,
        data.parentId !== undefined ? data.parentId : existing.parent_id,
        id,
      )
      if (!parentValidation.ok) { error(res, parentValidation.message, parentValidation.code, parentValidation.status); return }
    }
    if (data.status === 'inactive') {
      const check = buildLocationStatusCheck(db, id, 'inactive')
      if (check && !check.canChange) {
        error(res, '库位仍被启用子库位、物料或当前库存使用，不可停用', 'LOCATION_IN_USE', 409, check); return
      }
    }
    const fields: string[] = []; const params: any[] = []
    if (data.code !== undefined) {
      const codeText = requireValidText(data.code, '库位编码', 40)
      if (sendTextError(res, codeText)) return
      if (codeText.value !== existing.code) {
        error(res, '库位编码由系统生成，不允许修改', 'INVALID_PARAMETER', 400)
        return
      }
    }
    if (data.name !== undefined) {
      const nameText = requireValidText(data.name, '库位名称')
      if (sendTextError(res, nameText)) return
      fields.push('name = ?'); params.push(nameText.value)
    }
    if (data.type !== undefined) {
      const typeText = requireValidText(data.type, '库位类型', 40)
      if (sendTextError(res, typeText)) return
      fields.push('type = ?'); params.push(typeText.value)
    }
    if (data.parentId !== undefined) { fields.push('parent_id = ?'); params.push(data.parentId || null) }
    if (data.zone !== undefined) {
      const zoneText = requireValidText(data.zone, '区域')
      if (sendTextError(res, zoneText)) return
      fields.push('zone = ?'); params.push(zoneText.value)
    }
    if (data.shelf !== undefined) {
      const shelfText = normalizeDisplayText(data.shelf, '货架', { maxLength: 80 })
      if (sendTextError(res, shelfText)) return
      fields.push('shelf = ?'); params.push(shelfText.value)
    }
    if (data.position !== undefined) {
      const positionText = normalizeDisplayText(data.position, '位置', { maxLength: 80 })
      if (sendTextError(res, positionText)) return
      fields.push('position = ?'); params.push(positionText.value)
    }
    if (data.capacity !== undefined) {
      const capacityValue = normalizeCapacity(data.capacity, existing.capacity)
      if (!capacityValue.ok) { error(res, capacityValue.message, capacityValue.code, capacityValue.status); return }
      fields.push('capacity = ?'); params.push(capacityValue.value)
    }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status === 'active' ? 1 : 0) }
    if (fields.length > 0) { params.push(id); db.prepare(`UPDATE locations SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0`).run(...params) }
    success(res, { id }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

router.get('/:id/check-status', authenticateToken, requireLocationWrite, (req, res) => {
  try {
    const status = req.query.status
    if (status !== 'active' && status !== 'inactive') {
      error(res, 'Invalid status', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const check = buildLocationStatusCheck(db, req.params.id, status)
    if (!check) { error(res, 'Not found', 'NOT_FOUND', 404); return }
    success(res, check)
  } catch (err: any) { error(res, err.message) }
})

router.get('/:id/check-deletable', authenticateToken, requireLocationWrite, (req, res) => {
  try {
    const db = getDatabase()
    const check = buildLocationDeleteCheck(db, req.params.id)
    if (!check) { error(res, 'Not found', 'NOT_FOUND', 404); return }
    success(res, check)
  } catch (err: any) { error(res, err.message) }
})

router.delete('/:id', authenticateToken, requireLocationWrite, (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM locations WHERE id = ? AND is_deleted = 0').get(id)
    if (!existing) { error(res, 'Not found', 'NOT_FOUND', 404); return }
    const references = getLocationReferences(db, id)
    if (references.length > 0) {
      error(res, '库位已被库存或业务记录引用，不可删除', 'CONFLICT', 409)
      return
    }
    db.prepare('UPDATE locations SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

export default router
