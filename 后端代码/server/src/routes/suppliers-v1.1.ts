import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'

const router = Router()

const requireSupplierRead = requireRole('admin', 'warehouse_manager', 'procurement')
const requireSupplierWrite = requireRole('admin', 'procurement')

router.get('/', authenticateToken, requireSupplierRead, (req, res) => {
  try {
    let { page = 1, pageSize = 20, keyword, status } = req.query
    page = Math.max(1, Number(page) || 1)
    pageSize = Math.max(1, Math.min(100, Number(pageSize) || 20))
    const db = getDatabase()
    let where = 'is_deleted = 0'
    const params: any[] = []
    if (keyword) { where += ' AND (name LIKE ? OR code LIKE ?)'; params.push(`%${keyword}%`, `%${keyword}%`) }
    if (status) { where += ' AND status = ?'; params.push(status === 'active' ? 1 : 0) }

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

router.post('/', authenticateToken, requireSupplierWrite, (req, res) => {
  try {
    const { name, contact, phone, email, address } = req.body
    if (!name) { error(res, 'Name required', 'INVALID_PARAMETER', 400); return }
    const db = getDatabase()
    const id = uuidv4()
    const finalCode = generateSupplierCode(db)
    db.prepare('INSERT INTO suppliers (id, code, name, contact, phone, email, address, status) VALUES (?, ?, ?, ?, ?, ?, ?, 1)')
      .run(id, finalCode, name, contact || null, phone || null, email || null, address || null)
    success(res, { id, code: finalCode }, 'Created', 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) { error(res, 'Code exists', 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

router.put('/:id', authenticateToken, requireSupplierWrite, (req, res) => {
  try {
    const { id } = req.params
    const data = req.body
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM suppliers WHERE id = ? AND is_deleted = 0').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    const fields: string[] = []; const params: any[] = []
    if (data.code !== undefined) { fields.push('code = ?'); params.push(data.code) }
    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name) }
    if (data.contact !== undefined) { fields.push('contact = ?'); params.push(data.contact) }
    if (data.phone !== undefined) { fields.push('phone = ?'); params.push(data.phone) }
    if (data.email !== undefined) { fields.push('email = ?'); params.push(data.email) }
    if (data.address !== undefined) { fields.push('address = ?'); params.push(data.address) }
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
    db.prepare('UPDATE suppliers SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

export default router
