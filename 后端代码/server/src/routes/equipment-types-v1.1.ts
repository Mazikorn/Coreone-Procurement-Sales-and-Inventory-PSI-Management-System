import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'

const router = Router()

// 获取设备类型列表
router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20, keyword, status } = req.query
    const db = getDatabase()
    let where = '1=1'
    const params: any[] = []

    if (keyword) {
      where += ' AND (code LIKE ? OR name LIKE ?)'
      const like = `%${keyword}%`
      params.push(like, like)
    }
    if (status !== undefined && status !== '') {
      where += ' AND status = ?'
      params.push(status === 'active' ? 1 : 0)
    }

    const count = (db.prepare(`SELECT COUNT(*) as total FROM equipment_types WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(`SELECT * FROM equipment_types WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, Number(pageSize), offset) as any[]

    // 统计每个类型下的设备数量
    const eqCounts = db.prepare(`
      SELECT type_id, COUNT(*) as cnt FROM equipment WHERE type_id IS NOT NULL GROUP BY type_id
    `).all() as any[]
    const countMap = new Map(eqCounts.map((c: any) => [c.type_id, c.cnt]))

    successList(res, list.map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      defaultPurchasePrice: r.default_purchase_price,
      defaultDepreciableLifeYears: r.default_depreciable_life_years,
      defaultValue: r.default_residual_value,
      defaultDepreciationMethod: r.default_depreciation_method,
      defaultTotalCapacity: r.default_total_capacity,
      defaultCapacityUnit: r.default_capacity_unit,
      status: r.status === 1 ? 'active' : 'inactive',
      equipmentCount: countMap.get(r.id) || 0,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

// 获取设备类型详情
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const r = db.prepare('SELECT * FROM equipment_types WHERE id = ?').get(id) as any
    if (!r) { error(res, '设备类型不存在', 'NOT_FOUND', 404); return }

    // 统计设备数量
    const eqCount = (db.prepare('SELECT COUNT(*) as cnt FROM equipment WHERE type_id = ?').get(id) as any)?.cnt || 0

    success(res, {
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      defaultPurchasePrice: r.default_purchase_price,
      defaultDepreciableLifeYears: r.default_depreciable_life_years,
      defaultValue: r.default_residual_value,
      defaultDepreciationMethod: r.default_depreciation_method,
      defaultTotalCapacity: r.default_total_capacity,
      defaultCapacityUnit: r.default_capacity_unit,
      status: r.status === 1 ? 'active' : 'inactive',
      equipmentCount: eqCount,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })
  } catch (err: any) { error(res, err.message) }
})

// 创建设备类型
router.post('/', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { code, name, description, defaultPurchasePrice, defaultDepreciableLifeYears, defaultValue, defaultDepreciationMethod, defaultTotalCapacity, defaultCapacityUnit } = req.body
    if (!code || !name) {
      error(res, '缺少必填字段（code, name）', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const id = uuidv4()

    db.prepare(`INSERT INTO equipment_types (id, code, name, description, default_purchase_price, default_depreciable_life_years, default_residual_value, default_depreciation_method, default_total_capacity, default_capacity_unit, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`)
      .run(id, code, name, description || null, defaultPurchasePrice || 0, defaultDepreciableLifeYears || 5, defaultValue || 0, defaultDepreciationMethod || 'straight_line', defaultTotalCapacity || 0, defaultCapacityUnit || 'minutes')

    success(res, { id }, 'Created', 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) { error(res, `类型编码 ${req.body.code} 已存在`, 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

// 更新设备类型
router.put('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { id } = req.params
    const { name, description, defaultPurchasePrice, defaultDepreciableLifeYears, defaultValue, defaultDepreciationMethod, defaultTotalCapacity, defaultCapacityUnit, status } = req.body
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM equipment_types WHERE id = ?').get(id) as any
    if (!existing) { error(res, '设备类型不存在', 'NOT_FOUND', 404); return }

    db.prepare(`UPDATE equipment_types SET name = ?, description = ?, default_purchase_price = ?, default_depreciable_life_years = ?, default_residual_value = ?, default_depreciation_method = ?, default_total_capacity = ?, default_capacity_unit = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(
        name || existing.name,
        description !== undefined ? description : existing.description,
        defaultPurchasePrice !== undefined ? defaultPurchasePrice : existing.default_purchase_price,
        defaultDepreciableLifeYears !== undefined ? defaultDepreciableLifeYears : existing.default_depreciable_life_years,
        defaultValue !== undefined ? defaultValue : existing.default_residual_value,
        defaultDepreciationMethod || existing.default_depreciation_method,
        defaultTotalCapacity !== undefined ? defaultTotalCapacity : existing.default_total_capacity,
        defaultCapacityUnit || existing.default_capacity_unit,
        status === 'inactive' ? 0 : 1,
        id
      )

    success(res, { id }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

// 删除设备类型
router.delete('/:id', authenticateToken, requireRole('admin'), (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM equipment_types WHERE id = ?').get(id)
    if (!existing) { error(res, '设备类型不存在', 'NOT_FOUND', 404); return }

    // 检查是否有设备关联
    const eqCount = (db.prepare('SELECT COUNT(*) as count FROM equipment WHERE type_id = ?').get(id) as any)?.count || 0
    if (eqCount > 0) {
      error(res, `该类型下有 ${eqCount} 台设备，无法删除。请先将设备转移到其他类型`, 'CONFLICT', 409)
      return
    }

    db.prepare('DELETE FROM equipment_types WHERE id = ?').run(id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

export default router
