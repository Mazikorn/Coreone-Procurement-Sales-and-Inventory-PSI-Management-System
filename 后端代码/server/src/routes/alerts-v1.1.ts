import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'

const router = Router()

function canHandleAlerts(req: any) {
  const role = req.user?.role
  return role === 'admin' || role === 'warehouse_manager'
}

function normalizeRemark(remark: unknown) {
  return typeof remark === 'string' ? remark.trim() : ''
}

function updateAlertStatus(db: any, id: string, status: 'processed' | 'ignored', operator: string, remark?: unknown) {
  const existing = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as any
  if (!existing) return { ok: false, code: 'NOT_FOUND', message: '记录不存在', statusCode: 404 }
  if (existing.status !== 'pending') {
    return { ok: false, code: 'ALREADY_HANDLED', message: '预警已处理，不可重复操作', statusCode: 400 }
  }
  const normalizedRemark = normalizeRemark(remark)
  if (status === 'processed' && !normalizedRemark) {
    return { ok: false, code: 'INVALID_PARAMETER', message: '处理意见必填', statusCode: 400 }
  }
  db.prepare('UPDATE alerts SET status = ?, handled_by = ?, remark = ?, handled_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, operator, normalizedRemark, id)
  return { ok: true }
}

function appendStatusFilter(where: string, params: any[], status: unknown) {
  if (!status) return where
  const statuses = String(status)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

  if (statuses.length === 0) return where
  const placeholders = statuses.map(() => '?').join(', ')
  params.push(...statuses)
  return `${where} AND status IN (${placeholders})`
}

function buildAlertWhere(query: any) {
  const { status, type, keyword, startDate, endDate } = query
  let where = '1=1'
  const params: any[] = []
  where = appendStatusFilter(where, params, status)
  if (type) { where += ' AND type = ?'; params.push(type) }
  if (keyword) {
    where += ' AND (material_name LIKE ? OR message LIKE ? OR id LIKE ?)'
    const like = `%${keyword}%`
    params.push(like, like, like)
  }
  if (startDate) { where += ' AND created_at >= ?'; params.push(startDate) }
  if (endDate) { where += ' AND created_at <= ?'; params.push(endDate + ' 23:59:59') }
  return { where, params }
}

router.get('/rules', (_req, res) => {
  try {
    const db = getDatabase()
    const rows = db.prepare('SELECT * FROM alert_rules ORDER BY created_at').all() as any[]
    success(res, {
      rules: rows.map((r: any) => ({
        id: r.id, type: r.type, name: r.name,
        threshold: r.threshold, thresholdDays: r.threshold_days,
        enabled: r.enabled === 1,
      })),
    })
  } catch (err: any) { error(res, err.message) }
})

router.put('/rules/:id', (req, res) => {
  try {
    const user = (req as any).user
    if (!user || user.role !== 'admin') {
      return error(res, '权限不足', 'FORBIDDEN', 403)
    }
    const { id } = req.params
    const { threshold, thresholdDays, enabled } = req.body
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    const fields: string[] = []; const params: any[] = []
    if (threshold !== undefined) {
      const normalizedThreshold = Number(threshold)
      if (!Number.isFinite(normalizedThreshold) || normalizedThreshold < 0) {
        error(res, 'Invalid threshold', 'INVALID_PARAMETER', 400); return
      }
      fields.push('threshold = ?'); params.push(normalizedThreshold)
    }
    if (thresholdDays !== undefined) {
      const normalizedThresholdDays = Number(thresholdDays)
      if (!Number.isFinite(normalizedThresholdDays) || normalizedThresholdDays < 0) {
        error(res, 'Invalid thresholdDays', 'INVALID_PARAMETER', 400); return
      }
      fields.push('threshold_days = ?'); params.push(normalizedThresholdDays)
    }
    if (enabled !== undefined) { fields.push('enabled = ?'); params.push(enabled ? 1 : 0) }
    if (fields.length > 0) { params.push(id); db.prepare(`UPDATE alert_rules SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...params) }
    success(res, { id }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

router.get('/', (req, res) => {
  try {
    let { page = 1, pageSize = 20 } = req.query
    page = Math.max(1, Number(page) || 1) as any
    pageSize = Math.max(1, Math.min(100, Number(pageSize) || 20)) as any
    const db = getDatabase()
    const { where, params } = buildAlertWhere(req.query)

    const count = (db.prepare(`SELECT COUNT(*) as total FROM alerts WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(`SELECT * FROM alerts WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, Number(pageSize), offset) as any[]

    successList(res, list.map((r: any) => ({
      id: r.id, type: r.type, level: r.level, materialId: r.material_id,
      materialName: r.material_name, currentStock: r.current_stock,
      threshold: r.threshold, message: r.message, status: r.status,
      createdAt: r.created_at,
      handledBy: r.handled_by,
      handledAt: r.handled_at,
      remark: r.remark,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/stats', (req, res) => {
  try {
    const db = getDatabase()
    const { where, params } = buildAlertWhere(req.query)
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
        COALESCE(SUM(CASE WHEN status IN ('processed', 'auto_resolved', 'handled') THEN 1 ELSE 0 END), 0) as processed,
        COALESCE(SUM(CASE WHEN status IN ('ignored', 'dismissed') THEN 1 ELSE 0 END), 0) as ignored,
        COALESCE(SUM(CASE WHEN date(created_at, 'localtime') = date('now', 'localtime') THEN 1 ELSE 0 END), 0) as today,
        COALESCE(SUM(CASE WHEN strftime('%Y-%m', created_at, 'localtime') = strftime('%Y-%m', 'now', 'localtime') THEN 1 ELSE 0 END), 0) as month
      FROM alerts
      WHERE ${where}
    `).get(...params) as any
    success(res, {
      total: row?.total || 0,
      pending: row?.pending || 0,
      processed: row?.processed || 0,
      ignored: row?.ignored || 0,
      today: row?.today || 0,
      month: row?.month || 0,
    })
  } catch (err: any) { error(res, err.message) }
})

router.post('/batch/handle', (req, res) => {
  try {
    if (!canHandleAlerts(req)) {
      error(res, 'Forbidden: insufficient permissions', 'FORBIDDEN', 403)
      return
    }
    const ids = Array.from(new Set((Array.isArray(req.body?.ids) ? req.body.ids : []).map((id: any) => String(id || '').trim()).filter(Boolean)))
    const { action = 'processed', remark } = req.body
    if (ids.length === 0 || !['processed', 'ignored'].includes(action)) {
      error(res, '预警和处理动作必填', 'INVALID_PARAMETER', 400)
      return
    }
    const db = getDatabase()
    const operator = (req as any).user?.username || 'system'

    db.exec('BEGIN IMMEDIATE')
    try {
      for (const id of ids) {
        const result = updateAlertStatus(db, id as string, action, operator, remark)
        if (!result.ok) {
          db.exec('ROLLBACK')
          error(res, result.message, result.code, result.statusCode)
          return
        }
      }
      db.exec('COMMIT')
      success(res, { handledCount: ids.length }, 'Handled')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

router.post('/:id/handle', (req, res) => {
  try {
    // 处理预警仅限 admin 和 warehouse_manager
    if (!canHandleAlerts(req)) {
      error(res, 'Forbidden: insufficient permissions', 'FORBIDDEN', 403)
      return
    }
    const { id } = req.params
    const { action, remark } = req.body
    const db = getDatabase()
    const normalizedAction = action === 'ignored' ? 'ignored' : 'processed'
    const result = updateAlertStatus(db, id, normalizedAction, (req as any).user?.username || 'system', remark)
    if (!result.ok) { error(res, result.message, result.code, result.statusCode); return }
    success(res, null, 'Handled')
  } catch (err: any) { error(res, err.message) }
})

router.post('/:id/process', (req, res) => {
  try {
    if (!canHandleAlerts(req)) {
      error(res, 'Forbidden: insufficient permissions', 'FORBIDDEN', 403)
      return
    }
    const db = getDatabase()
    const result = updateAlertStatus(db, req.params.id, 'processed', (req as any).user?.username || 'system', req.body?.remark)
    if (!result.ok) { error(res, result.message, result.code, result.statusCode); return }
    success(res, null, 'Processed')
  } catch (err: any) { error(res, err.message) }
})

router.post('/:id/ignore', (req, res) => {
  try {
    if (!canHandleAlerts(req)) {
      error(res, 'Forbidden: insufficient permissions', 'FORBIDDEN', 403)
      return
    }
    const db = getDatabase()
    const result = updateAlertStatus(db, req.params.id, 'ignored', (req as any).user?.username || 'system', req.body?.remark)
    if (!result.ok) { error(res, result.message, result.code, result.statusCode); return }
    success(res, null, 'Ignored')
  } catch (err: any) { error(res, err.message) }
})

router.post('/generate', (req, res) => {
  try {
    if (!canHandleAlerts(req)) {
      error(res, 'Forbidden: insufficient permissions', 'FORBIDDEN', 403)
      return
    }
    const db = getDatabase()
    let count = 0

    const lowStockRule = db.prepare("SELECT * FROM alert_rules WHERE type = 'low-stock' AND enabled = 1").get() as any
    if (lowStockRule) {
      const lowItems = db.prepare(`
        SELECT m.id, m.name, i.stock, m.safety_stock
        FROM materials m
        JOIN inventory i ON m.id = i.material_id
        WHERE m.status = 1 AND m.is_deleted = 0
        AND i.stock <= m.safety_stock AND m.safety_stock > 0
      `).all() as any[]

      for (const item of lowItems) {
        const exists = db.prepare("SELECT COUNT(*) as c FROM alerts WHERE material_id = ? AND type = ? AND status = 'pending'").get(item.id, 'low-stock') as any
        if (exists.c === 0) {
          db.prepare("INSERT INTO alerts (id, type, level, material_id, material_name, current_stock, threshold, message, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')")
            .run(uuidv4(), 'low-stock', 'warning', item.id, item.name, item.stock, item.safety_stock, `Low stock: current ${item.stock}, safety ${item.safety_stock}`)
          count++
        }
      }
    }

    const expiryRule = db.prepare("SELECT * FROM alert_rules WHERE type = 'expiry' AND enabled = 1").get() as any
    if (expiryRule && expiryRule.threshold_days != null) {
      // 计算预警截止日期，避免SQL字符串插值
      const thresholdDate = new Date()
      thresholdDate.setDate(thresholdDate.getDate() + Number(expiryRule.threshold_days))
      const thresholdStr = thresholdDate.toISOString().split('T')[0]

      const expItems = db.prepare(`
        SELECT b.id as batch_id, m.id, m.name, b.batch_no, b.expiry_date
        FROM batches b
        JOIN materials m ON b.material_id = m.id AND m.is_deleted = 0
        WHERE b.status = 1 AND b.expiry_date <= ?
      `).all(thresholdStr) as any[]

      for (const item of expItems) {
        const exists = db.prepare("SELECT COUNT(*) as c FROM alerts WHERE material_id = ? AND type = ? AND status = 'pending'").get(item.id, 'expiry') as any
        if (exists.c === 0) {
          db.prepare("INSERT INTO alerts (id, type, level, material_id, material_name, threshold, message, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')")
            .run(uuidv4(), 'expiry', 'danger', item.id, item.name, expiryRule.threshold_days, `Batch ${item.batch_no} expires at ${item.expiry_date}`)
          count++
        }
      }
    }

    success(res, { generatedCount: count }, `Generated ${count} alerts`)
  } catch (err: any) { error(res, err.message) }
})

export default router
