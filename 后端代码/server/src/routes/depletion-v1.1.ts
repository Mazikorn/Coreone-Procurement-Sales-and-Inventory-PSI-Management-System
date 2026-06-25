import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, error } from '../utils/response.js'
import { logOperation } from '../utils/operation-logger.js'
import { requireStrictRole } from '../middleware/auth.js'

const router = Router()
const requireDepletionWrite = requireStrictRole('admin', 'warehouse_manager')

// ===== 获取使用中批次列表 =====
router.get('/tracking', (req, res) => {
  try {
    const db = getDatabase()
    const { status = 'in-use' } = req.query
    const list = db.prepare(`
      SELECT * FROM batch_usage_tracking
      WHERE status = ?
      ORDER BY material_name, created_at DESC
    `).all(status) as any[]

    success(res, { list })
  } catch (err: any) { error(res, err.message) }
})

// ===== 创建使用中记录 =====
router.post('/tracking', requireDepletionWrite, (req, res) => {
  try {
    const db = getDatabase()
    const { material_id, material_name, batch, spec, total_qty, remaining, unit, start_date, expected_days, usage, receiver } = req.body
    const totalQty = Number(total_qty)
    const remainingQty = Number(remaining)
    if (!material_id || !batch || total_qty === undefined || remaining === undefined) {
      error(res, 'material_id, batch, total_qty, remaining 必填', 'INVALID_PARAMETER', 400); return
    }
    if (!Number.isFinite(totalQty) || totalQty <= 0 || !Number.isFinite(remainingQty) || remainingQty < 0) {
      error(res, 'total_qty 和 remaining 必须为非负数且 total_qty > 0', 'INVALID_PARAMETER', 400); return
    }
    if (remainingQty > totalQty) {
      error(res, 'remaining 不能大于领用总量', 'INVALID_PARAMETER', 400); return
    }
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if (start_date && !dateRegex.test(start_date)) {
      error(res, 'start_date 格式必须为 YYYY-MM-DD', 'INVALID_PARAMETER', 400); return
    }

    const id = uuidv4()
    db.prepare(`
      INSERT INTO batch_usage_tracking
      (id, material_id, material_name, batch, spec, total_qty, remaining, unit, start_date, days_used, expected_days, progress, usage, receiver, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 0, ?, ?, 'in-use', datetime('now'), datetime('now'))
    `).run(id, material_id, material_name, batch, spec, totalQty, remainingQty, unit, start_date, expected_days, usage, receiver)

    logOperation(db, req as any, {
      operation: 'POST /depletion/tracking',
      description: '创建使用中批次记录',
      requestData: {
        module: 'depletion',
        materialId: material_id,
        materialName: material_name,
        batchNo: batch,
        spec,
        totalQty,
        remaining: remainingQty,
        unit,
        startDate: start_date,
        expectedDays: expected_days,
        usage,
        receiver,
      },
      responseData: { id, status: 'in-use' },
    })

    success(res, { id })
  } catch (err: any) { error(res, err.message) }
})

// ===== 更新剩余量 =====
router.put('/tracking/:id/remain', requireDepletionWrite, (req, res) => {
  try {
    const db = getDatabase()
    const { id } = req.params
    const { remaining, reason } = req.body
    const remainingQty = Number(remaining)
    if (remaining === undefined || !Number.isFinite(remainingQty) || remainingQty < 0) {
      error(res, 'remaining 必填且必须为非负数', 'INVALID_PARAMETER', 400); return
    }
    if (!String(reason || '').trim()) {
      error(res, '调整原因必填', 'INVALID_PARAMETER', 400); return
    }

    const existing = db.prepare('SELECT * FROM batch_usage_tracking WHERE id = ?').get(id) as any
    if (!existing) { error(res, 'Not found', 'NOT_FOUND', 404); return }
    if (remainingQty > Number(existing.total_qty || 0)) {
      error(res, 'remaining 不能大于领用总量', 'INVALID_PARAMETER', 400); return
    }

    db.prepare(`
      UPDATE batch_usage_tracking
      SET remaining = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(remainingQty, id)

    logOperation(db, req as any, {
      operation: 'PUT /depletion/tracking/:id/remain',
      description: '调整使用中批次剩余量',
      requestData: {
        module: 'depletion',
        trackingId: id,
        materialId: existing.material_id,
        batchNo: existing.batch,
        remaining: remainingQty,
        reason: String(reason).trim(),
      },
      responseData: {
        trackingId: id,
        beforeRemaining: Number(existing.remaining || 0),
        afterRemaining: remainingQty,
        status: existing.status,
      },
    })

    success(res, { id, remaining: remainingQty })
  } catch (err: any) { error(res, err.message) }
})

// ===== 确认耗尽 =====
router.post('/tracking/:id/deplete', requireDepletionWrite, (req, res) => {
  try {
    const db = getDatabase()
    const { id } = req.params
    const { remain_qty, deplete_type, deplete_reason } = req.body
    const operator = (req as any).user?.username || 'system'
    const remainQty = Number(remain_qty)
    if (remain_qty === undefined || !Number.isFinite(remainQty) || remainQty < 0) {
      error(res, 'remain_qty 必填且必须为非负数', 'INVALID_PARAMETER', 400); return
    }
    if (!deplete_type) {
      error(res, 'deplete_type 必填', 'INVALID_PARAMETER', 400); return
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      // 获取当前跟踪记录
      const tracking = db.prepare(`SELECT * FROM batch_usage_tracking WHERE id = ?`).get(id) as any
      if (!tracking) {
        db.exec('ROLLBACK')
        return error(res, '跟踪记录不存在', 'NOT_FOUND', 404)
      }
      if (tracking.status === 'depleted') {
        db.exec('ROLLBACK')
        return error(res, '该跟踪记录已耗尽，不可重复操作', 'ALREADY_DEPLETED', 400)
      }
      if (remainQty > Number(tracking.total_qty || 0)) {
        db.exec('ROLLBACK')
        return error(res, 'remain_qty 不能大于领用总量', 'INVALID_PARAMETER', 400)
      }

      // 计算使用天数
      const today = new Date().toISOString().split('T')[0]
      const startDate = new Date(tracking.start_date)
      const endDate = new Date(today)
      const daysUsed = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

      // 创建耗尽记录
      const depletionId = `DPL-${Date.now()}`
      db.prepare(`
        INSERT INTO batch_depletion
        (id, tracking_id, material_id, material_name, batch, spec, total_qty, remain_qty, unit, start_date, end_date, days_used, actual_days, deplete_type, deplete_reason, operator, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `).run(depletionId, id, tracking.material_id, tracking.material_name, tracking.batch, tracking.spec,
        tracking.total_qty, remainQty, tracking.unit, tracking.start_date, today, daysUsed, tracking.expected_days,
        deplete_type, deplete_reason, operator)

      // 更新跟踪记录状态为耗尽
      db.prepare(`
        UPDATE batch_usage_tracking
        SET status = 'depleted', updated_at = datetime('now')
        WHERE id = ?
      `).run(id)

      // 注意（守恒不变量）：确认耗尽是「领用台账(batch_usage_tracking)」的台面侧生命周期事件，
      // 不得回写仓库批次台账(batches)。仓库 batches.remaining / inventory.stock 已在出库时按领用量结算；
      // 此处若用台面剩余量(remainQty)绝对覆盖 batches.remaining 并置 status=2，会破坏
      // inventory.stock = Σ(status=1 批次 remaining) 守恒（见 inventory-consistency.ts），
      // 制造幽灵库存并触发 INVENTORY_BATCH_MISMATCH。故仅更新 tracking 状态 + 写 batch_depletion 流水。

      logOperation(db, req as any, {
        operation: 'POST /depletion/tracking/:id/deplete',
        description: '确认使用中批次耗尽',
        requestData: {
          module: 'depletion',
          trackingId: id,
          materialId: tracking.material_id,
          batchNo: tracking.batch,
          remainQty,
          depleteType: deplete_type,
          depleteReason: deplete_reason,
        },
        responseData: {
          id: depletionId,
          trackingId: id,
          beforeStatus: tracking.status,
          afterStatus: 'depleted',
          beforeRemaining: Number(tracking.remaining || 0),
          afterRemaining: remainQty,
        },
      })

      db.exec('COMMIT')
      success(res, { id: depletionId })
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

// ===== 获取耗尽记录列表 =====
router.get('/depletion', (req, res) => {
  try {
    const db = getDatabase()
    const list = db.prepare(`
      SELECT * FROM batch_depletion
      ORDER BY created_at DESC
    `).all() as any[]

    success(res, { list })
  } catch (err: any) { error(res, err.message) }
})

// ===== 获取可用批次 =====
router.get('/batches/:materialId', (req, res) => {
  try {
    const db = getDatabase()
    const { materialId } = req.params
    const list = db.prepare(`
      SELECT b.*, m.name as material_name, m.spec, m.unit
      FROM batches b
      JOIN materials m ON b.material_id = m.id AND m.is_deleted = 0
      WHERE b.material_id = ? AND b.status = 1 AND b.remaining > 0
      ORDER BY b.expiry_date ASC
    `).all(materialId) as any[]

    success(res, { list })
  } catch (err: any) { error(res, err.message) }
})

export default router
