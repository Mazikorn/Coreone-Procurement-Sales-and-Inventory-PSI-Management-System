import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'
import { normalizeDisplayText, requireValidText, type TextGuardResult } from '../utils/text-guard.js'

const router = Router()

const requireSupplierRead = requireRole('admin', 'warehouse_manager', 'procurement')
const requireSupplierWrite = requireRole('admin', 'procurement')

function buildSupplierWhere(query: any) {
  const { keyword, status } = query
  let where = 'is_deleted = 0'
  const params: any[] = []
  if (keyword) {
    where += ' AND (name LIKE ? OR code LIKE ? OR contact LIKE ? OR phone LIKE ?)'
    const like = `%${keyword}%`
    params.push(like, like, like, like)
  }
  if (status === 'active' || status === 'inactive') {
    where += ' AND status = ?'
    params.push(status === 'active' ? 1 : 0)
  }
  return { where, params }
}

router.get('/', authenticateToken, requireSupplierRead, (req, res) => {
  try {
    let { page = 1, pageSize = 20 } = req.query
    page = Math.max(1, Number(page) || 1)
    pageSize = Math.max(1, Math.min(1000, Number(pageSize) || 20))
    const db = getDatabase()
    const { where, params } = buildSupplierWhere(req.query)

    const count = (db.prepare(`SELECT COUNT(*) as total FROM suppliers WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(`SELECT * FROM suppliers WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, Number(pageSize), offset) as any[]

    successList(res, list.map((r: any) => ({
      id: r.id, code: r.code, name: r.name, contact: r.contact, phone: r.phone,
      email: r.email, address: r.address, status: r.status === 1 ? 'active' : 'inactive',
      cooperationCount: r.cooperation_count, totalAmount: r.total_amount, rating: r.rating,
      createdAt: r.created_at, updatedAt: r.updated_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/stats', authenticateToken, requireSupplierRead, (req, res) => {
  try {
    const db = getDatabase()
    const { where, params } = buildSupplierWhere(req.query)
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END), 0) as inactive,
        COALESCE(SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END), 0) as newThisMonth
      FROM suppliers
      WHERE ${where}
    `).get(monthStart, ...params) as any
    success(res, {
      total: row?.total || 0,
      active: row?.active || 0,
      inactive: row?.inactive || 0,
      newThisMonth: row?.newThisMonth || 0,
    })
  } catch (err: any) { error(res, err.message) }
})

function generateSupplierCode(db: any): string {
  const max = db.prepare("SELECT MAX(CAST(SUBSTR(code, 4) AS INTEGER)) as max FROM suppliers WHERE code LIKE 'SUP-%'").get() as any
  let num = (Number(max?.max) || 0) + 1
  if (num <= 0) num = 11
  let code = `SUP-${String(num).padStart(5, '0')}`
  while (db.prepare('SELECT 1 FROM suppliers WHERE code = ?').get(code)) {
    num++
    code = `SUP-${String(num).padStart(5, '0')}`
  }
  return code
}

function normalizeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return Array.from(new Set(ids.map(id => String(id || '').trim()).filter(Boolean)))
}

function sendTextError(res: any, result: TextGuardResult): result is Extract<TextGuardResult, { ok: false }> {
  if ('message' in result) {
    error(res, result.message, result.code, result.status)
    return true
  }
  return false
}

function getSupplierReferences(db: any, supplierId: string) {
  const checks = [
    {
      label: '物料',
      count: (db.prepare('SELECT COUNT(*) as count FROM materials WHERE supplier_id = ? AND is_deleted = 0').get(supplierId) as any)?.count || 0,
    },
    {
      label: '采购订单',
      count: (db.prepare('SELECT COUNT(*) as count FROM purchase_orders WHERE supplier_id = ? AND is_deleted = 0').get(supplierId) as any)?.count || 0,
    },
    {
      label: '入库记录',
      count: (db.prepare('SELECT COUNT(*) as count FROM inbound_records WHERE supplier_id = ? AND is_deleted = 0').get(supplierId) as any)?.count || 0,
    },
    {
      label: '库存批次',
      count: (db.prepare('SELECT COUNT(*) as count FROM batches WHERE supplier_id = ?').get(supplierId) as any)?.count || 0,
    },
    {
      label: '供应商退货',
      count: (db.prepare('SELECT COUNT(*) as count FROM supplier_returns WHERE supplier_id = ? AND is_deleted = 0').get(supplierId) as any)?.count || 0,
    },
  ]
  return checks.filter(item => item.count > 0)
}

function getDeletableSuppliers(db: any, ids: string[]) {
  const existing = db.prepare(`
    SELECT id, name
    FROM suppliers
    WHERE is_deleted = 0 AND id IN (${ids.map(() => '?').join(',')})
  `).all(...ids) as any[]
  const existingIds = new Set(existing.map(row => row.id))
  const missingIds = ids.filter(id => !existingIds.has(id))
  const blocked = existing
    .map(row => ({ ...row, references: getSupplierReferences(db, row.id) }))
    .filter(row => row.references.length > 0)

  return { existing, missingIds, blocked }
}

function getSupplierStatusBlockers(db: any, supplierId: string) {
  const checks = [
    {
      label: '启用物料',
      count: (db.prepare('SELECT COUNT(*) as count FROM materials WHERE supplier_id = ? AND is_deleted = 0 AND status = 1').get(supplierId) as any)?.count || 0,
    },
    {
      label: '待收采购订单',
      count: (db.prepare(`
        SELECT COUNT(*) as count
        FROM purchase_orders
        WHERE supplier_id = ?
          AND is_deleted = 0
          AND status IN ('pending', 'partial')
      `).get(supplierId) as any)?.count || 0,
    },
  ]
  return checks.filter(item => item.count > 0)
}

function validateSupplierStatusChange(db: any, supplierId: string, status: 'active' | 'inactive') {
  if (status === 'inactive') {
    const blockers = getSupplierStatusBlockers(db, supplierId)
    if (blockers.length > 0) {
      return { ok: false, status: 409, message: '供应商仍被启用物料或待收采购订单使用，不可停用', code: 'SUPPLIER_IN_USE' }
    }
  }
  return { ok: true }
}

router.post('/', authenticateToken, requireSupplierWrite, (req, res) => {
  try {
    const { name, contact, phone, email, address } = req.body
    const nameText = requireValidText(name, '供应商名称')
    if (sendTextError(res, nameText)) return
    const contactText = normalizeDisplayText(contact, '联系人')
    if (sendTextError(res, contactText)) return
    const phoneText = normalizeDisplayText(phone, '联系电话')
    if (sendTextError(res, phoneText)) return
    const emailText = normalizeDisplayText(email, '邮箱')
    if (sendTextError(res, emailText)) return
    const addressText = normalizeDisplayText(address, '地址', { maxLength: 240 })
    if (sendTextError(res, addressText)) return
    const db = getDatabase()
    const id = uuidv4()
    const finalCode = generateSupplierCode(db)
    db.prepare('INSERT INTO suppliers (id, code, name, contact, phone, email, address, status) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
      .run(id, finalCode, nameText.value, contactText.value, phoneText.value, emailText.value, addressText.value)
    success(res, { id, code: finalCode }, 'Created', 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) { error(res, 'Code exists', 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

router.patch('/batch-status', authenticateToken, requireSupplierWrite, (req, res) => {
  try {
    const ids = normalizeIds(req.body?.ids)
    const { status } = req.body
    if (ids.length === 0 || !['active', 'inactive'].includes(status)) {
      error(res, '供应商和状态必填', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const placeholders = ids.map(() => '?').join(',')
    const existing = db.prepare(`
      SELECT id
      FROM suppliers
      WHERE is_deleted = 0 AND id IN (${placeholders})
    `).all(...ids) as any[]
    if (existing.length !== ids.length) {
      error(res, '存在不存在或已删除的供应商，批量状态未更新', 'NOT_FOUND', 404); return
    }
    for (const supplier of existing) {
      const statusValidation = validateSupplierStatusChange(db, supplier.id, status)
      if (!statusValidation.ok) {
        error(res, '存在仍被启用物料或待收采购订单使用的供应商，批量停用未执行', statusValidation.code, statusValidation.status); return
      }
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        UPDATE suppliers
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${placeholders}) AND is_deleted = 0
      `).run(status === 'active' ? 1 : 0, ...ids)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    success(res, { updatedCount: ids.length }, '批量状态已更新')
  } catch (err: any) { error(res, err.message) }
})

router.delete('/batch', authenticateToken, requireSupplierWrite, (req, res) => {
  try {
    const ids = normalizeIds(req.body?.ids)
    if (ids.length === 0) { error(res, '请选择供应商', 'INVALID_PARAMETER', 400); return }
    const db = getDatabase()
    const { missingIds, blocked } = getDeletableSuppliers(db, ids)
    if (missingIds.length > 0) {
      error(res, '存在不存在或已删除的供应商，批量删除未执行', 'NOT_FOUND', 404); return
    }
    if (blocked.length > 0) {
      error(res, '存在已被业务数据引用的供应商，批量删除未执行', 'CONFLICT', 409); return
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        UPDATE suppliers
        SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP
        WHERE id IN (${ids.map(() => '?').join(',')})
      `).run(...ids)
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
    success(res, { deletedCount: ids.length }, '批量删除成功')
  } catch (err: any) { error(res, err.message) }
})

router.put('/:id', authenticateToken, requireSupplierWrite, (req, res) => {
  try {
    const { id } = req.params
    const data = req.body
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ? AND is_deleted = 0').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    if (data.status !== undefined && data.status !== 'active' && data.status !== 'inactive') {
      error(res, 'Invalid status', 'INVALID_PARAMETER', 400); return
    }
    if (data.status !== undefined) {
      const statusValidation = validateSupplierStatusChange(db, id, data.status)
      if (!statusValidation.ok) {
        error(res, statusValidation.message, statusValidation.code, statusValidation.status); return
      }
    }
    const fields: string[] = []; const params: any[] = []
    if (data.code !== undefined) {
      const codeText = requireValidText(data.code, '供应商编码', 40)
      if (sendTextError(res, codeText)) return
      fields.push('code = ?'); params.push(codeText.value)
    }
    if (data.name !== undefined) {
      const nameText = requireValidText(data.name, '供应商名称')
      if (sendTextError(res, nameText)) return
      fields.push('name = ?'); params.push(nameText.value)
    }
    if (data.contact !== undefined) {
      const contactText = normalizeDisplayText(data.contact, '联系人')
      if (sendTextError(res, contactText)) return
      fields.push('contact = ?'); params.push(contactText.value)
    }
    if (data.phone !== undefined) {
      const phoneText = normalizeDisplayText(data.phone, '联系电话')
      if (sendTextError(res, phoneText)) return
      fields.push('phone = ?'); params.push(phoneText.value)
    }
    if (data.email !== undefined) {
      const emailText = normalizeDisplayText(data.email, '邮箱')
      if (sendTextError(res, emailText)) return
      fields.push('email = ?'); params.push(emailText.value)
    }
    if (data.address !== undefined) {
      const addressText = normalizeDisplayText(data.address, '地址', { maxLength: 240 })
      if (sendTextError(res, addressText)) return
      fields.push('address = ?'); params.push(addressText.value)
    }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status === 'active' ? 1 : 0) }
    if (fields.length > 0) { params.push(id); db.prepare(`UPDATE suppliers SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0`).run(...params) }
    success(res, { id }, 'Updated')
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) { error(res, 'Code exists', 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

/** 自动计算供应商评级 */
function calculateSupplierRating(db: any, supplierId: string): number {
  // 1. 总采购金额评分（40%）
  const purchaseStats = db.prepare(`
    SELECT COALESCE(SUM(total_amount), 0) as total, COUNT(*) as count
    FROM purchase_orders
    WHERE supplier_id = ? AND is_deleted = 0 AND status = 'completed'
  `).get(supplierId) as any
  const totalAmount = purchaseStats?.total || 0
  const orderCount = purchaseStats?.count || 0

  // 2. 退货率评分（30%）- 退货金额占比越低越好
  const returnStats = db.prepare(`
    SELECT COALESCE(SUM(refund_amount), 0) as total_return
    FROM supplier_returns
    WHERE supplier_id = ? AND is_deleted = 0
  `).get(supplierId) as any
  const totalReturn = returnStats?.total_return || 0
  const returnRate = totalAmount > 0 ? totalReturn / totalAmount : 0

  // 3. 合作频次评分（30%）
  const scoreAmount = Math.min(totalAmount / 100000, 1) * 40 // 10万满分
  const scoreReturn = Math.max(0, (1 - returnRate * 5)) * 30 // 退货率20%为0分
  const scoreFreq = Math.min(orderCount / 20, 1) * 30 // 20次满分

  const totalScore = scoreAmount + scoreReturn + scoreFreq
  // 映射到 1-5 星
  if (totalScore >= 80) return 5
  if (totalScore >= 60) return 4
  if (totalScore >= 40) return 3
  if (totalScore >= 20) return 2
  return 1
}

router.post('/:id/rating', authenticateToken, requireSupplierWrite, (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ? AND is_deleted = 0').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    const rating = calculateSupplierRating(db, id)
    db.prepare('UPDATE suppliers SET rating = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(rating, id)
    success(res, { id, rating })
  } catch (err: any) { error(res, err.message) }
})

router.post('/rating/all', authenticateToken, requireSupplierWrite, (req, res) => {
  try {
    const db = getDatabase()
    const suppliers = db.prepare('SELECT id FROM suppliers WHERE is_deleted = 0').all() as any[]

    db.exec('BEGIN IMMEDIATE')
    try {
      let updated = 0
      for (const s of suppliers) {
        const rating = calculateSupplierRating(db, s.id)
        db.prepare('UPDATE suppliers SET rating = ? WHERE id = ?').run(rating, s.id)
        updated++
      }
      db.exec('COMMIT')
      success(res, { updatedCount: updated }, `Updated ${updated} suppliers`)
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

router.delete('/:id', authenticateToken, requireSupplierWrite, (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ? AND is_deleted = 0').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    const references = getSupplierReferences(db, id)
    if (references.length > 0) {
      error(res, '供应商已被业务数据引用，不可删除', 'CONFLICT', 409)
      return
    }
    db.prepare('UPDATE suppliers SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

export default router
