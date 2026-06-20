import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { requireStrictRole } from '../middleware/auth.js'
import { normalizeDisplayText, requireValidText, type TextGuardResult } from '../utils/text-guard.js'

const router = Router()

// 物料分类写入权限：仅 admin 可操作（与 E2E 权限矩阵一致）
const requireCategoryWrite = requireStrictRole('admin')

router.get('/tree', (_req, res) => {
  try {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT
        id,
        code,
        name,
        parent_id as parentId,
        level,
        sort_order as sortOrder,
        status,
        created_at as createdAt,
        updated_at as updatedAt
      FROM material_categories
      WHERE is_deleted = 0
      ORDER BY level, sort_order, created_at
    `).all() as any[]

    // 批量获取所有分类的物料数量，避免 N+1 查询
    const countRows = db.prepare(`
      SELECT category_id, COUNT(*) as count FROM materials WHERE is_deleted = 0 GROUP BY category_id
    `).all() as any[]
    const countMap = new Map<string, number>(countRows.map((r: any) => [r.category_id, r.count]))

    // 按 parentId 索引，避免每次 filter 遍历全部 rows
    const childrenMap = new Map<string | null, any[]>()
    for (const r of rows) {
      const key = r.parentId || null
      if (!childrenMap.has(key)) childrenMap.set(key, [])
      childrenMap.get(key)!.push(r)
    }

    const buildTree = (parentId: string | null): any[] => {
      return (childrenMap.get(parentId) || []).map((r: any) => {
        const children = buildTree(r.id)
        return {
          id: r.id,
          code: r.code,
          name: r.name,
          parentId: r.parentId || null,
          level: r.level,
          sortOrder: r.sortOrder,
          status: r.status === 1 ? 'active' : 'inactive',
          children,
          isLeaf: children.length === 0,
          count: countMap.get(r.id) || 0,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }
      })
    }

    success(res, buildTree(null))
  } catch (err: any) {
    error(res, err.message)
  }
})

router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, status } = req.query
    const db = getDatabase()
    let sql = 'SELECT * FROM material_categories WHERE is_deleted = 0'
    const params: any[] = []
    const countParams: any[] = []

    if (keyword) {
      sql += ' AND (name LIKE ? OR code LIKE ?)'
      params.push(`%${keyword}%`, `%${keyword}%`)
      countParams.push(`%${keyword}%`, `%${keyword}%`)
    }
    if (status === 'active' || status === 'inactive') {
      sql += ' AND status = ?'
      params.push(status === 'active' ? 1 : 0)
      countParams.push(status === 'active' ? 1 : 0)
    }

    sql += ' ORDER BY level, sort_order, created_at'

    const countWhere = [
      'is_deleted = 0',
      keyword ? '(name LIKE ? OR code LIKE ?)' : '',
      status === 'active' || status === 'inactive' ? 'status = ?' : '',
    ].filter(Boolean).join(' AND ')
    const count = (db.prepare(`SELECT COUNT(*) as total FROM material_categories WHERE ${countWhere}`).get(...countParams) as any)?.total || 0

    const offset = (Number(page) - 1) * Number(pageSize)
    sql += ' LIMIT ? OFFSET ?'
    params.push(Number(pageSize), offset)

    const list = db.prepare(sql).all(...params) as any[]

    successList(res, list.map((row: any) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      parentId: row.parent_id,
      level: row.level,
      sortOrder: row.sort_order,
      status: row.status === 1 ? 'active' : 'inactive',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) {
    error(res, err.message)
  }
})

function generateCategoryCode(db: any, parentId: string | null, level: number): string {
  if (!parentId) {
    const max = db.prepare('SELECT MAX(CAST(code AS INTEGER)) as max FROM material_categories WHERE parent_id IS NULL').get() as any
    // 确保一级编码为100的整数倍
    return String(Math.ceil(((max?.max || 0) + 1) / 100) * 100)
  } else {
    const parent = db.prepare('SELECT code FROM material_categories WHERE id = ? AND is_deleted = 0').get(parentId) as any
    if (!parent) {
      // 父分类不存在时回退到一级编码逻辑
      return generateCategoryCode(db, null, 1)
    }
    const prefix = Math.floor(Number(parent.code) / 100) * 100
    const max = db.prepare('SELECT MAX(CAST(code AS INTEGER)) as max FROM material_categories WHERE parent_id = ? AND CAST(code AS INTEGER) < ?').get(parentId, prefix + 100) as any
    return String((max?.max || prefix) + 1)
  }
}

function getDescendantIds(db: any, categoryId: string): Set<string> {
  const descendants = new Set<string>()
  let frontier = [categoryId]
  while (frontier.length > 0) {
    const placeholders = frontier.map(() => '?').join(',')
    const rows = db.prepare(`
      SELECT id
      FROM material_categories
      WHERE is_deleted = 0 AND parent_id IN (${placeholders})
    `).all(...frontier) as any[]
    frontier = rows.map(row => row.id)
    for (const id of frontier) descendants.add(id)
  }
  return descendants
}

function resolveParentAndLevel(db: any, parentId: string | null) {
  if (!parentId) return { parent: null, level: 1 }
  const parent = db.prepare('SELECT * FROM material_categories WHERE id = ? AND is_deleted = 0').get(parentId) as any
  if (!parent) return { error: { message: '上级分类不存在', code: 'NOT_FOUND', status: 404 } }
  const level = Number(parent.level || 0) + 1
  if (level > 3) return { error: { message: '最多支持三级分类', code: 'INVALID_PARAMETER', status: 400 } }
  return { parent, level }
}

function updateDescendantLevels(db: any, rootId: string, levelDelta: number) {
  if (levelDelta === 0) return
  const descendants = Array.from(getDescendantIds(db, rootId))
  if (descendants.length === 0) return
  const placeholders = descendants.map(() => '?').join(',')
  db.prepare(`
    UPDATE material_categories
    SET level = level + ?, updated_at = CURRENT_TIMESTAMP
    WHERE id IN (${placeholders}) AND is_deleted = 0
  `).run(levelDelta, ...descendants)
}

function getMaxSubtreeLevel(db: any, rootId: string, rootLevel: number): number {
  const descendants = Array.from(getDescendantIds(db, rootId))
  if (descendants.length === 0) return rootLevel
  const placeholders = descendants.map(() => '?').join(',')
  const row = db.prepare(`
    SELECT MAX(level) as maxLevel
    FROM material_categories
    WHERE id IN (${placeholders}) AND is_deleted = 0
  `).get(...descendants) as any
  return Math.max(rootLevel, Number(row?.maxLevel || rootLevel))
}

function sendTextError(res: any, result: TextGuardResult): result is Extract<TextGuardResult, { ok: false }> {
  if ('message' in result) {
    error(res, result.message, result.code, result.status)
    return true
  }
  return false
}

router.post('/', requireCategoryWrite, (req, res) => {
  try {
    const { name, parentId, level, sortOrder = 0 } = req.body
    const nameText = requireValidText(name, '分类名称')
    if (sendTextError(res, nameText)) return
    const codeText = normalizeDisplayText(req.body.code, '分类编码', { maxLength: 40 })
    if (sendTextError(res, codeText)) return

    const db = getDatabase()
    const parentInfo = resolveParentAndLevel(db, parentId || null)
    if ('error' in parentInfo) {
      error(res, parentInfo.error.message, parentInfo.error.code, parentInfo.error.status)
      return
    }
    if (level !== undefined && Number(level) !== parentInfo.level) {
      error(res, '分类层级必须与上级分类匹配', 'INVALID_PARAMETER', 400)
      return
    }
    const id = uuidv4()
    // 若用户传入 code 则尊重用户输入，否则自动生成
    const finalCode = codeText.value || generateCategoryCode(db, parentId || null, parentInfo.level)

    // 预检查 code 唯一性，避免 SQLite 异常
    const codeExists = db.prepare('SELECT 1 FROM material_categories WHERE code = ? AND is_deleted = 0').get(finalCode)
    if (codeExists) {
      error(res, 'Code already exists', 'RESOURCE_CONFLICT', 409)
      return
    }

    db.prepare(`
      INSERT INTO material_categories (id, code, name, parent_id, level, sort_order, status)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, finalCode, nameText.value, parentId || null, parentInfo.level, sortOrder)

    success(res, { id, code: finalCode, name: nameText.value, parentId, level: parentInfo.level }, 'Created', 201)
  } catch (err: any) {
    if (err.message.includes('UNIQUE constraint failed')) {
      error(res, 'Code already exists', 'RESOURCE_CONFLICT', 409)
      return
    }
    error(res, err.message)
  }
})

router.put('/:id', requireCategoryWrite, (req, res) => {
  try {
    const { id } = req.params
    const { code, name, parentId, level, sortOrder } = req.body

    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM material_categories WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!existing) {
      error(res, '记录不存在', 'NOT_FOUND', 404)
      return
    }

    const codeText = code !== undefined ? requireValidText(code, '分类编码', 40) : null
    if (codeText) {
      if (sendTextError(res, codeText)) return
      // code 由系统自动生成；真实页面会带回只读 code，允许相同值但拒绝变更。
      if (codeText.value !== existing.code) {
        error(res, 'Code cannot be modified', 'INVALID_PARAMETER', 400)
        return
      }
    }
    const nameText = name !== undefined ? requireValidText(name, '分类名称') : null
    let normalizedName: string | null = null
    if (nameText) {
      if (sendTextError(res, nameText)) return
      normalizedName = nameText.value
    }

    const nextParentId = parentId !== undefined ? (parentId || null) : existing.parent_id
    const parentInfo = resolveParentAndLevel(db, nextParentId)
    if ('error' in parentInfo) {
      error(res, parentInfo.error.message, parentInfo.error.code, parentInfo.error.status)
      return
    }
    if (nextParentId === id) { error(res, 'Cannot set parent to self', 'INVALID_PARAMETER', 400); return }
    if (nextParentId && getDescendantIds(db, id).has(nextParentId)) {
      error(res, 'Cannot set parent to descendant category', 'INVALID_PARAMETER', 400)
      return
    }

    const fields: string[] = []
    const params: any[] = []
    const nextLevel = parentId !== undefined ? parentInfo.level : (level !== undefined ? Number(level) : Number(existing.level))
    if (level !== undefined && parentId === undefined && Number(level) !== Number(existing.level)) {
      error(res, '分类层级由上级分类决定，不能单独修改', 'INVALID_PARAMETER', 400)
      return
    }
    const levelDelta = nextLevel - Number(existing.level)
    if (getMaxSubtreeLevel(db, id, Number(existing.level)) + levelDelta > 3) {
      error(res, '移动后子分类将超过三级', 'INVALID_PARAMETER', 400)
      return
    }

    if (normalizedName !== null) { fields.push('name = ?'); params.push(normalizedName) }
    if (parentId !== undefined) { fields.push('parent_id = ?'); params.push(nextParentId) }
    if (parentId !== undefined) { fields.push('level = ?'); params.push(nextLevel) }
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); params.push(sortOrder) }

    if (fields.length > 0) {
      db.exec('BEGIN IMMEDIATE')
      try {
        params.push(id)
        db.prepare(`UPDATE material_categories SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0`).run(...params)
        updateDescendantLevels(db, id, levelDelta)
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    }

    success(res, { id }, 'Updated')
  } catch (err: any) {
    if (err.message.includes('UNIQUE constraint failed')) {
      error(res, 'Code already exists', 'RESOURCE_CONFLICT', 409)
      return
    }
    error(res, err.message)
  }
})

router.delete('/:id', requireCategoryWrite, (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()

    const existing = db.prepare('SELECT * FROM material_categories WHERE id = ? AND is_deleted = 0').get(id)
    if (!existing) {
      error(res, '记录不存在', 'NOT_FOUND', 404)
      return
    }

    const childCount = (db.prepare('SELECT COUNT(*) as count FROM material_categories WHERE parent_id = ? AND is_deleted = 0').get(id) as any)?.count || 0
    const materialCount = (db.prepare('SELECT COUNT(*) as count FROM materials WHERE category_id = ? AND is_deleted = 0').get(id) as any)?.count || 0

    if (childCount > 0) {
      error(res, 'Has children', 'CONFLICT', 409)
      return
    }
    if (materialCount > 0) {
      error(res, 'Has materials', 'CONFLICT', 409)
      return
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE material_categories SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)

      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }

    success(res, null, 'Deleted')
  } catch (err: any) {
    error(res, err.message)
  }
})

export default router
