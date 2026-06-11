import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'

const router = Router()

const COST_TYPE_LABELS: Record<string, string> = {
  rent: '房租',
  utilities: '水电',
  maintenance: '维护',
  admin: '管理费',
  it: 'IT费用',
  other: '其他',
}

// 获取成本中心列表
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
    if (status) {
      where += ' AND status = ?'
      params.push(status === 'active' ? 1 : 0)
    }

    const count = (db.prepare(`SELECT COUNT(*) as total FROM indirect_cost_centers WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(`SELECT * FROM indirect_cost_centers WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, Number(pageSize), offset) as any[]

    successList(res, list.map((r: any) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      costType: r.cost_type,
      costTypeLabel: COST_TYPE_LABELS[r.cost_type] || r.cost_type,
      monthlyAmount: r.monthly_amount,
      allocationBase: r.allocation_base,
      description: r.description,
      status: r.status === 1 ? 'active' : 'inactive',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

// 获取成本中心详情
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const r = db.prepare('SELECT * FROM indirect_cost_centers WHERE id = ?').get(id) as any
    if (!r) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    success(res, {
      id: r.id,
      code: r.code,
      name: r.name,
      costType: r.cost_type,
      costTypeLabel: COST_TYPE_LABELS[r.cost_type] || r.cost_type,
      monthlyAmount: r.monthly_amount,
      allocationBase: r.allocation_base,
      description: r.description,
      status: r.status === 1 ? 'active' : 'inactive',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })
  } catch (err: any) { error(res, err.message) }
})

// 创建成本中心
router.post('/', (req, res) => {
  try {
    const { code, name, costType, monthlyAmount, allocationBase, description, status } = req.body
    if (!code || !name || !costType) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }
    if (code.length > 100) {
      error(res, '编码长度不能超过100个字符', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const id = uuidv4()
    db.prepare('INSERT INTO indirect_cost_centers (id, code, name, cost_type, monthly_amount, allocation_base, description, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, code, name, costType, monthlyAmount || 0, allocationBase || 'sample_count', description || null, status === 'inactive' ? 0 : 1)
    success(res, { id }, 'Created', 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) { error(res, 'Code exists', 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

// 更新成本中心
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params
    const { name, costType, monthlyAmount, allocationBase, description, status } = req.body
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM indirect_cost_centers WHERE id = ?').get(id) as any
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    db.prepare('UPDATE indirect_cost_centers SET name = ?, cost_type = ?, monthly_amount = ?, allocation_base = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(
        name || existing.name,
        costType || existing.cost_type,
        monthlyAmount !== undefined ? monthlyAmount : existing.monthly_amount,
        allocationBase || existing.allocation_base,
        description !== undefined ? description : existing.description,
        status === 'inactive' ? 0 : 1,
        id
      )
    success(res, { id }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

// 删除成本中心
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM indirect_cost_centers WHERE id = ?').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM indirect_cost_centers WHERE id = ?').run(id)
      db.prepare('DELETE FROM indirect_cost_allocations WHERE cost_center_id = ?').run(id)
      db.exec('COMMIT')
    } catch (innerErr: any) {
      db.exec('ROLLBACK')
      throw innerErr
    }
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

// 获取成本中心分摊记录
router.get('/:id/allocations', (req, res) => {
  try {
    const { id } = req.params
    const { page = 1, pageSize = 20 } = req.query
    const db = getDatabase()
    const count = (db.prepare('SELECT COUNT(*) as total FROM indirect_cost_allocations WHERE cost_center_id = ?').get(id) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare('SELECT * FROM indirect_cost_allocations WHERE cost_center_id = ? ORDER BY year_month DESC LIMIT ? OFFSET ?').all(id, Number(pageSize), offset) as any[]

    successList(res, list.map((a: any) => ({
      id: a.id,
      costCenterId: a.cost_center_id,
      yearMonth: a.year_month,
      totalAmount: a.total_amount,
      allocationBaseValue: a.allocation_base_value,
      allocationRate: a.allocation_rate,
      createdAt: a.created_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

// 录入月度分摊
router.post('/:id/allocations', (req, res) => {
  try {
    const { id } = req.params
    const { yearMonth, totalAmount, allocationBaseValue } = req.body
    if (!yearMonth || totalAmount === undefined) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()

    const costCenter = db.prepare('SELECT * FROM indirect_cost_centers WHERE id = ?').get(id) as any
    if (!costCenter) { error(res, 'Cost center not found', 'NOT_FOUND', 404); return }

    const baseValue = Number(allocationBaseValue) || 1
    const rate = baseValue > 0 ? Number(totalAmount) / baseValue : 0

    const existing = db.prepare('SELECT * FROM indirect_cost_allocations WHERE cost_center_id = ? AND year_month = ?').get(id, yearMonth) as any

    if (existing) {
      db.prepare('UPDATE indirect_cost_allocations SET total_amount = ?, allocation_base_value = ?, allocation_rate = ? WHERE id = ?')
        .run(Number(totalAmount), baseValue, rate, existing.id)
      success(res, { id: existing.id, rate }, 'Updated')
    } else {
      const allocId = uuidv4()
      db.prepare('INSERT INTO indirect_cost_allocations (id, cost_center_id, year_month, total_amount, allocation_base_value, allocation_rate) VALUES (?, ?, ?, ?, ?, ?)')
        .run(allocId, id, yearMonth, Number(totalAmount), baseValue, rate)
      success(res, { id: allocId, rate }, 'Created', 201)
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
