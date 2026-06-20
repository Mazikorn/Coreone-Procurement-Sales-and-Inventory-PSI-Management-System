import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { generateNo } from '../utils/generateNo.js'
import { adjustInventoryLocationStock, getInventoryLocationStock, syncInventoryPrimaryLocation } from '../utils/inventory-locations.js'

const router = Router()

// 获取调拨记录列表
router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20 } = req.query
    const normalizedPage = Math.max(1, Number(page) || 1)
    const normalizedPageSize = Math.min(Math.max(1, Number(pageSize) || 20), 1000)
    const db = getDatabase()
    const count = (db.prepare("SELECT COUNT(*) as total FROM inbound_records WHERE type = 'transfer' AND is_deleted = 0").get() as any)?.total || 0
    const offset = (normalizedPage - 1) * normalizedPageSize
    const list = db.prepare(`
      SELECT
        i.*,
        m.name as material_name,
        target_l.name as to_location_name,
        source_l.name as from_location_lookup_name
      FROM inbound_records i
      LEFT JOIN materials m ON i.material_id = m.id AND m.is_deleted = 0
      LEFT JOIN locations target_l ON i.location_id = target_l.id AND target_l.is_deleted = 0
      LEFT JOIN locations source_l ON i.from_location_id = source_l.id AND source_l.is_deleted = 0
      WHERE i.type = 'transfer' AND i.is_deleted = 0
      ORDER BY i.created_at DESC
      LIMIT ? OFFSET ?
    `).all(normalizedPageSize, offset) as any[]
    successList(res, list.map((r: any) => ({
      id: r.id, inboundNo: r.inbound_no, materialId: r.material_id, materialName: r.material_name,
      batchNo: r.batch_no, quantity: r.quantity,
      fromLocationId: r.from_location_id,
      fromLocationName: r.from_location_lookup_name || r.from_location_name,
      toLocationId: r.location_id,
      toLocationName: r.to_location_name,
      locationId: r.location_id,
      locationName: r.to_location_name,
      operator: r.operator, status: r.status, remark: r.remark, createdAt: r.created_at,
    })), normalizedPage, normalizedPageSize, count)
  } catch (err: any) { error(res, err.message) }
})

// 新增调拨（同一物料在不同库位间转移，总库存不变）
router.post('/inbound', (req, res) => {
  try {
    const { materialId, batchNo, quantity, fromLocationId, fromLocationName, toLocationId, remark } = req.body
    const operator = (req as any).user?.username || 'system'
    const transferQuantity = Number(quantity)
    if (!materialId || !toLocationId || quantity === undefined || quantity === null || !Number.isFinite(transferQuantity) || transferQuantity <= 0) {
      error(res, '物料、目标库位和数量必填', 'INVALID_PARAMETER', 400)
      return
    }
    if (!fromLocationId) {
      error(res, '来源库位ID必填', 'INVALID_PARAMETER', 400)
      return
    }
    if (fromLocationId && fromLocationId === toLocationId) {
      error(res, '来源库位和目标库位不能相同', 'INVALID_PARAMETER', 400)
      return
    }
    const db = getDatabase()

    // 校验物料和库位是否存在且启用
    const material = db.prepare('SELECT * FROM materials WHERE id = ? AND is_deleted = 0').get(materialId) as any
    if (!material) { error(res, '物料不存在或已删除', 'NOT_FOUND', 404); return }
    if (Number(material.status) !== 1) { error(res, '物料已停用，不能创建调拨记录', 'CONFLICT', 409); return }
    const normalizedBatchNo = String(batchNo || '').trim()
    const activeBatchCount = (db.prepare(`
      SELECT COUNT(*) as count
      FROM batches
      WHERE material_id = ? AND status = 1 AND remaining > 0
    `).get(materialId) as any)?.count || 0
    if (!normalizedBatchNo && activeBatchCount > 0) {
      error(res, '请选择调拨批次', 'BATCH_REQUIRED', 422)
      return
    }
    if (normalizedBatchNo) {
      const batch = db.prepare(`
        SELECT id, status, remaining
        FROM batches
        WHERE material_id = ? AND batch_no = ?
      `).get(materialId, normalizedBatchNo) as any
      if (!batch) { error(res, '调拨批次不存在或不属于该物料', 'BATCH_NOT_FOUND', 404); return }
      if (Number(batch.status) !== 1) {
        error(res, '调拨批次已停用或无可用余量', 'BATCH_UNAVAILABLE', 409)
        return
      }
      if (Number(batch.remaining || 0) < transferQuantity) {
        error(res, '调拨批次库存不足', 'BATCH_STOCK_INSUFFICIENT', 422)
        return
      }
    }
    if (fromLocationId) {
      const sourceLocation = db.prepare('SELECT * FROM locations WHERE id = ? AND is_deleted = 0').get(fromLocationId) as any
      if (!sourceLocation) { error(res, '来源库位不存在或已删除', 'NOT_FOUND', 404); return }
      if (Number(sourceLocation.status) !== 1) { error(res, '来源库位已停用，不能创建调拨记录', 'CONFLICT', 409); return }
    }
    const location = db.prepare('SELECT * FROM locations WHERE id = ? AND is_deleted = 0').get(toLocationId) as any
    if (!location) { error(res, '目标库位不存在或已删除', 'NOT_FOUND', 404); return }
    if (Number(location.status) !== 1) { error(res, '目标库位已停用，不能创建调拨记录', 'CONFLICT', 409); return }

    db.exec('BEGIN IMMEDIATE')
    try {
      // 创建调拨记录
      const inboundNo = generateNo('TF')
      const id = uuidv4()
      db.prepare(`
        INSERT INTO inbound_records (id, inbound_no, type, material_id, batch_no, quantity, unit, location_id, from_location_id, from_location_name, operator, status, remark)
        VALUES (?, ?, 'transfer', ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)
      `).run(id, inboundNo, materialId, normalizedBatchNo || null, transferQuantity, material.unit || '个', toLocationId, fromLocationId || null, fromLocationName || null, operator || 'system', remark || '')

      // 调拨不改变总库存，只变更库位
      const existingInv = db.prepare('SELECT * FROM inventory WHERE material_id = ?').get(materialId) as any
      if (!existingInv) {
        db.exec('ROLLBACK')
        error(res, '物料无库存记录，无法调拨', 'STOCK_INSUFFICIENT', 422)
        return
      }

      const currentStock = Number(existingInv.stock || 0)
      const sourceStock = fromLocationId ? getInventoryLocationStock(db, materialId, fromLocationId) : currentStock

      if (sourceStock < transferQuantity) {
        db.exec('ROLLBACK')
        error(res, '库存不足', 'STOCK_INSUFFICIENT', 422)
        return
      }

      const beforeStock = currentStock
      if (fromLocationId) {
        adjustInventoryLocationStock(db, materialId, fromLocationId, -transferQuantity)
      }
      adjustInventoryLocationStock(db, materialId, toLocationId, transferQuantity)
      syncInventoryPrimaryLocation(db, materialId)

      // 记录 stock_logs（调拨记录，数量为 0 表示库位变更）
      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
        VALUES (?, 'transfer', ?, 0, ?, ?, ?, 'transfer', ?, ?)
      `).run(logId, materialId, beforeStock, beforeStock, id, operator || 'system', `从 ${fromLocationName || fromLocationId} 调拨至 ${location.name}`)

      db.exec('COMMIT')
      success(res, { id, inboundNo, materialId, quantity: transferQuantity, fromLocationId, fromLocationName, toLocationId }, 'Transfer created')
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

      // 调拨不改总库存，撤销时回滚库位明细
      const inv = db.prepare('SELECT stock, location_id FROM inventory WHERE material_id = ?').get(record.material_id) as any
      if (!inv) {
        db.exec('ROLLBACK')
        error(res, '物料无库存记录', 'NOT_FOUND', 404)
        return
      }

      const beforeStock = inv.stock
      const restoreLocationId = record.from_location_id
      if (restoreLocationId) {
        const sourceLocation = db.prepare('SELECT id FROM locations WHERE id = ? AND is_deleted = 0').get(restoreLocationId) as any
        if (!sourceLocation) {
          db.exec('ROLLBACK')
          error(res, '来源库位不存在或已删除，无法撤销调拨', 'INVALID_PARAMETER', 400)
          return
        }
        const targetStock = getInventoryLocationStock(db, record.material_id, record.location_id)
        if (targetStock < Number(record.quantity || 0)) {
          db.exec('ROLLBACK')
          error(res, '目标库位库存不足，无法撤销调拨', 'STOCK_INSUFFICIENT', 422)
          return
        }
        adjustInventoryLocationStock(db, record.material_id, record.location_id, -Number(record.quantity || 0))
        adjustInventoryLocationStock(db, record.material_id, restoreLocationId, Number(record.quantity || 0))
        syncInventoryPrimaryLocation(db, record.material_id)
      }

      // 记录 stock_logs（调拨撤销，库存不变）
      const logId = uuidv4()
      db.prepare(`
        INSERT INTO stock_logs (id, type, material_id, quantity, before_stock, after_stock, related_id, related_type, operator, remark)
        VALUES (?, 'cancel', ?, 0, ?, ?, ?, 'transfer_cancel', ?, ?)
      `).run(logId, record.material_id, beforeStock, beforeStock, id, (req as any).user?.username || 'system', restoreLocationId ? `撤销调拨记录，恢复至 ${restoreLocationId}` : '撤销调拨记录')

      db.exec('COMMIT')
      success(res, null, '调拨记录已撤销')
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
