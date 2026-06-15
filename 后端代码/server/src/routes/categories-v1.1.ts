import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { requireRole } from '../middleware/auth.js'

const router = Router()

// 物料分类写入权限：仅 admin 可操作（与 E2E 权限矩阵一致）
const requireCategoryWrite = requireRole('admin')

router.get('/tree', (_req, res) => {
  try {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT id, code, name, parent_id as parentId, level, sort_order as sortOrder
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
          level: r.level,
          sortOrder: r.sortOrder,
          children,
          isLeaf: children.length === 0,
          count: countMap.get(r.id) || 0,
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
    const { page = 1, pageSize = 20, keyword } = req.query
    const db = getDatabase()
    let sql = 'SELECT * FROM material_categories WHERE is_deleted = 0'
    const params: any[] = []

    if (keyword) {
      sql += ' AND (name LIKE ? OR code LIKE ?)'
      params.push(`%${keyword}%`, `%${keyword}%`)
    }

    sql += ' ORDER BY level, sort_order, created_at'

    const count = (db.prepare(`SELECT COUNT(*) as total FROM material_categories WHERE is_deleted = 0${keyword ? ' AND (name LIKE ? OR code LIKE ?)' : ''}`).get(...params) as any)?.total || 0

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

router.post('/', requireCategoryWrite, (req, res) => {
  try {
    const { name, parentId, level, sortOrder = 0 } = req.body
    if (!name || !level) {
      error(res, 'Name and level required', 'INVALID_PARAMETER', 400)
      return
    }

    const db = getDatabase()
    const id = uuidv4()
    // 若用户传入 code 则尊重用户输入，否则自动生成
    const finalCode = req.body.code || generateCategoryCode(db, parentId || null, level)

    // 预检查 code 唯一性，避免 SQLite 异常
    const codeExists = db.prepare('SELECT 1 FROM material_categories WHERE code = ? AND is_deleted = 0').get(finalCode)
    if (codeExists) {
      error(res, 'Code already exists', 'RESOURCE_CONFLICT', 409)
      return
    }

    db.prepare(`
      INSERT INTO material_categories (id, code, name, parent_id, level, sort_order, status)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(id, finalCode, name, parentId || null, level, sortOrder)

    success(res, { id, code: finalCode, name, parentId, level }, 'Created', 201)
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

    // code 由系统自动生成，不允许修改
    if (code !== undefined) {
      error(res, 'Code cannot be modified', 'INVALID_PARAMETER', 400)
      return
    }

    // 防止循环引用：parentId 不能等于自身 id
    if (parentId !== undefined && parentId === id) {
      error(res, 'Cannot set parent to self', 'INVALID_PARAMETER', 400)
      return
    }

    const fields: string[] = []
    const params: any[] = []

    if (name !== undefined) { fields.push('name = ?'); params.push(name) }
    if (parentId !== undefined) { fields.push('parent_id = ?'); params.push(parentId || null) }
    if (level !== undefined) { fields.push('level = ?'); params.push(level) }
    if (sortOrder !== undefined) { fields.push('sort_order = ?'); params.push(sortOrder) }

    if (fields.length > 0) {
      params.push(id)
      db.prepare(`UPDATE material_categories SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0`).run(...params)
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
    const { targetCategoryId } = req.query
    const db = getDatabase()

    const existing = db.prepare('SELECT * FROM material_categories WHERE id = ? AND is_deleted = 0').get(id)
    if (!existing) {
      error(res, '记录不存在', 'NOT_FOUND', 404)
      return
    }

    const materialCount = (db.prepare('SELECT COUNT(*) as count FROM materials WHERE category_id = ? AND is_deleted = 0').get(id) as any)?.count || 0

    if (materialCount > 0) {
      if (!targetCategoryId) {
        error(res, 'Has materials', 'CONFLICT', 409)
        return
      }
      // 验证目标分类存在且不是自身
      const target = db.prepare('SELECT * FROM material_categories WHERE id = ? AND is_deleted = 0').get(targetCategoryId) as any
      if (!target) {
        error(res, 'Target category not found', 'NOT_FOUND', 404)
        return
      }
      if (target.id === id) {
        error(res, 'Cannot migrate to self', 'INVALID_PARAMETER', 400)
        return
      }
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      if (materialCount > 0) {
        // 批量迁移物料
        db.prepare('UPDATE materials SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE category_id = ? AND is_deleted = 0').run(targetCategoryId, id)
      }

      // 将子分类的 parent_id 提升为被删除分类的 parent_id，level 减 1
      const existingParentId = (existing as any).parent_id
      db.prepare('UPDATE material_categories SET parent_id = ?, level = level - 1, updated_at = CURRENT_TIMESTAMP WHERE parent_id = ? AND is_deleted = 0').run(existingParentId, id)

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
