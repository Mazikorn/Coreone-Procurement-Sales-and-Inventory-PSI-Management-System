import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { generateNo } from '../utils/generateNo.js'

const router = Router()

// 获取调拨记录列表
router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query
    const db = getDatabase()
    const count = (db.prepare("SELECT COUNT(*) as total FROM inbound_records WHERE type = 'transfer' AND is_deleted = 0").get() as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(`
      SELECT i.*, m.name as material_name, l.name as location_name
      FROM inbound_records i
      LEFT JOIN materials m ON i.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN locations l ON i.location_id = l.id AND l.is_deleted = 0
      WHERE i.type = 'transfer' AND i.is_deleted = 0
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `).all(Number(pageSize), offset) as any[]
    successList(res, list.map((r: any) => ({
      id: r.id, inboundNo: r.inbound_no, materialId: r.material_id, materialName: r.material_name,
      batchNo: r.batch_no, quantity: r.quantity, locationId: r.location_id, locationName: r.location_name,
      operator: r.operator, status: r.status, remark: r.remark, createdAt: r.created_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

// 新增调拨（同一物料在不同库位间转移，总库存不变）
router.post('/inbound', (req, res) => {
  try {
    const { materialId, batchNo, quantity, fromLocationId, fromLocationName, toLocationId, remark } = req.body
    const operator = (req as any).user?.username || 'system'
    if (!materialId || !toLocationId || quantity === undefined || quantity === null || isNaN(Number(quantity)) || Number(quantity) <= 0) {
      error(res, '物料、目标库位和数量必填', 'INVALID_PARAMETER', 400)
      return
    }
    if (!fromLocationId && !fromLocationName) {
      error(res, '来源库位或来源库位名称必填', 'INVALID_PARAMETER', 400)
      return
    }
    const db = getDatabase()

    // 校验物料和目标库位是否存在且未删除
    const material = db.prepare('SELECT * FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
    if (!material) { error(res, '物料不存在或已删除', 'NOT_FOUND', 404); return }
    const location = db.prepare('SELECT * FROM locations WHERE id = ? AND is_deleted = 0').get(toLocationId) as any
    if (!location) { error(res, '目标库位不存在或已删除', 'NOT_FOUND', 404); return }

    db.exec('BEGIN IMMEDIATE')
    try {
      // 创建调拨记录
      const inboundNo = generateNo('TF')
      const id = uuidv4()
      db.prepare(`
        INSERT INTO inbound_records (id, inbound_no, type, material_id, batch_no, quantity, unit, location_id, operator, status, remark)
        VALUES (?, ?, 'transfer', ?, ?, ?, ?, ?, ?, 'completed', ?)
      `).run(id, inboundNo, materialId, batchNo || null, quantity, material.unit || '个', toLocationId, operator || 'system', remark || '')

      // 调拨不改变总库存，只变更库位
      const existingInv = db.prepare('SELECT * FROM inventory WHERE material_id = ?').get(materialId) as any
      if (!existingInv) {
        db.exec('ROLLBACK')
        error(res, '物料无库存记录，无法调拨', 'STOCK_INSUFFICIENT', 422)
        return
      }

      // 检查来源库位是否有足够库存
      if (existingInv.location_id !== fromLocationId) {
        db.exec('ROLLBACK')
        error(res, '来源库位与当前库存库位不匹配', 'INVALID_PARAMETER', 400)
        return
      }

      if (existingInv.stock < quantity) {
        db.exec('ROLLBACK')
        error(res, '库存不足', 'STOCK_INSUFFICIENT', 422)
        return
      }

      const beforeStock = existingInv.stock
      // 调拨：库存数量不变，只变更库位
      db.prepare("UPDATE inventory SET location_id = ?, update_time = CURRENT_TIMESTAMP WHERE material_id = ?")
        .run(toLocationId, materialId)

      // 记录 stock_logs（调拨记录，数量为 0 表示库位变更）
      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
        VALUES (?, 'transfer', ?, 0, ?, ?, ?, 'transfer', ?, ?)
      `).run(logId, materialId, beforeStock, beforeStock, id, operator || 'system', `从 ${fromLocationName || fromLocationId} 调拨至 ${location.name}`)

      db.exec('COMMIT')
      success(res, { id, inboundNo, materialId, quantity, fromLocationId, fromLocationName, toLocationId }, 'Transfer created')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

// 撤销调拨记录
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const record = db.prepare("SELECT * FROM inbound_records WHERE id = ? AND type = 'transfer' AND is_deleted = 0").get(id) as any
    if (!record) { error(res, '记录不存在或已删除', 'NOT_FOUND', 404); return }

    db.exec('BEGIN IMMEDIATE')
    try {
      // 软删除调拨记录
      db.prepare('UPDATE inbound_records SET is_deleted = 1 WHERE id = ?').run(id)

      // 调拨只改库位不改库存，撤销时只恢复库位
      const inv = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?').get(record.material_id) as any
      if (!inv) {
        db.exec('ROLLBACK')
        error(res, '物料无库存记录', 'NOT_FOUND', 404)
        return
      }

      // 从 stock_logs 中找到调拨前的库位（如果有记录）
      const transferLog = db.prepare(`
        SELECT remark FROM stock_logs WHERE related_id = ? AND type = 'transfer' ORDER BY created_at DESC LIMIT 1
      `).get(id) as any

      // 恢复库位（如果有原始库位信息）
      // 注意：当前调拨记录没有存储 from_location_id，需要从 remark 中解析或补充字段
      // 暂时只记录日志，不改变库位（因为调拨记录没有保存原始库位）
      const beforeStock = inv.stock

      // 记录 stock_logs（调拨撤销，库存不变）
      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
        VALUES (?, 'cancel', ?, 0, ?, ?, ?, 'transfer_cancel', ?, '撤销调拨记录')
      `).run(logId, record.material_id, beforeStock, beforeStock, id, (req as any).user?.username || 'system')

      db.exec('COMMIT')
      success(res, null, '调拨记录已撤销')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
