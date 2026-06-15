import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'

const router = Router()

function generateNo(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const timestamp = Date.now().toString().slice(-6)
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `ST-${date}-${timestamp}-${random}`
}

router.get('/', (req, res) => {
  try {
    let { page = 1, pageSize = 20, keyword } = req.query
    page = Math.max(1, Number(page) || 1)
    pageSize = Math.max(1, Math.min(100, Number(pageSize) || 20))
    const db = getDatabase()
    let where = 'is_deleted = 0'
    const params: any[] = []
    if (keyword) { where += ' AND (stocktaking_no LIKE ? OR material_name LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`) }
    const count = (db.prepare(`SELECT COUNT(*) as total FROM stocktaking_records WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (page - 1) * pageSize
    const list = db.prepare(`SELECT * FROM stocktaking_records WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]
    successList(res, list.map((r: any) => ({
      id: r.id, stocktakingNo: r.stocktaking_no, materialId: r.material_id,
      systemStock: r.system_stock, actualStock: r.actual_stock,
      difference: r.difference, operator: r.operator, status: r.status,
      remark: r.remark, createdAt: r.created_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

router.post('/', (req, res) => {
  try {
    const { materialId, actualStock, remark } = req.body
    const operator = (req as any).user?.username || 'system'
    if (!materialId || actualStock === undefined) { error(res, 'Missing fields', 'INVALID_PARAMETER', 400); return }
    if (isNaN(Number(actualStock))) { error(res, 'Invalid actual stock', 'INVALID_PARAMETER', 400); return }
    if (Number(actualStock) < 0) { error(res, 'actualStock 不能为负数', 'INVALID_PARAMETER', 400); return }
    const db = getDatabase()
    const material = db.prepare('SELECT 1 FROM materials WHERE id = ? AND is_deleted = 0').get(materialId)
    if (!material) { error(res, '物料不存在或已删除', 'NOT_FOUND', 404); return }

    db.exec('BEGIN IMMEDIATE')
    try {
      const systemStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any)?.stock || 0
      const difference = actualStock - systemStock
      const id = uuidv4()
      db.prepare('INSERT INTO stocktaking_records (id, stocktaking_no, material_id, system_stock, actual_stock, difference, operator, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, generateNo(), materialId, systemStock, actualStock, difference, operator || 'system', remark || null)

      if (difference !== 0) {
        db.prepare('UPDATE inventory SET stock = ? WHERE material_id = ?').run(actualStock, materialId)
        // 负库存兜底
        const afterStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(materialId) as any)?.stock
        if (afterStock < 0) {
          db.exec('ROLLBACK')
          error(res, '库存不能为负数', 'STOCK_NEGATIVE', 422)
          return
        }
        const logId = uuidv4()
        db.prepare('INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(logId, 'adjust', materialId, difference, systemStock, actualStock, id, 'stocktaking', operator || 'system')
      }

      db.exec('COMMIT')
      success(res, { id }, 'Stocktaking done')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

// 确认盘点记录
router.post('/:id/confirm', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const record = db.prepare('SELECT * FROM stocktaking_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在或已删除', 'NOT_FOUND', 404); return }
    if (record.status === 'confirmed') { error(res, '盘点已确认', 'BUSINESS_RULE', 400); return }

    db.exec('BEGIN IMMEDIATE')
    try {
      // 更新状态为已确认
      db.prepare('UPDATE stocktaking_records SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('confirmed', id)

      // 如果有差异，更新库存
      if (record.difference !== 0) {
        db.prepare('UPDATE inventory SET stock = ? WHERE material_id = ?')
          .run(record.actual_stock, record.material_id)

        // 检查库存是否为负
        const afterStock = (db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any)?.stock
        if (afterStock < 0) {
          db.exec('ROLLBACK')
          error(res, '库存不能为负数', 'STOCK_NEGATIVE', 422)
          return
        }

        // 记录库存日志
        const logId = uuidv4()
        db.prepare('INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
          .run(logId, 'adjust', record.material_id, record.difference, record.system_stock, record.actual_stock, id, 'stocktaking', (req as any).user?.username || 'system')
      }

      db.exec('COMMIT')
      success(res, { id, status: 'confirmed' }, '盘点已确认')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const record = db.prepare('SELECT * FROM stocktaking_records WHERE id = ? AND is_deleted = 0').get(id) as any
    if (!record) { error(res, '记录不存在或已删除', 'NOT_FOUND', 404); return }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('UPDATE stocktaking_records SET is_deleted = 1 WHERE id = ?').run(id)

      if (record.difference !== 0) {
        const inv = db.prepare('SELECT stock FROM inventory WHERE material_id = ?').get(record.material_id) as any
        const beforeStock = inv?.stock || 0
        const afterStock = record.system_stock
        // 使用相对增量恢复到系统库存
        const diff = record.system_stock - beforeStock

        // 检查恢复后库存是否会变负
        if (afterStock < 0) {
          db.exec('ROLLBACK')
          error(res, `撤销后库存将变为负数（${afterStock}），无法撤销`, 'STOCK_NEGATIVE', 422)
          return
        }

        db.prepare('UPDATE inventory SET stock = stock + ? WHERE material_id = ?').run(diff, record.material_id)

        const logId = uuidv4()
        db.prepare(`
          INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
          VALUES (?, 'cancel', ?, ?, ?, ?, ?, 'stocktaking_cancel', ?, '撤销盘点记录')
        `).run(logId, record.material_id, diff, beforeStock, afterStock, id, (req as any).user?.username || 'system')
      }

      db.exec('COMMIT')
      success(res, null, '盘点记录已撤销')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
