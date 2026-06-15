import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { authenticateToken, requireRole } from '../middleware/auth.js'

const router = Router()

// 获取季度调整建议（自动计算）
router.get('/suggestions', authenticateToken, requireRole('admin', 'finance'), (req, res) => {
  try {
    const { yearQuarter } = req.query
    const db = getDatabase()

    if (!yearQuarter || !/^\d{4}-Q[1-4]$/.test(yearQuarter as string)) {
      error(res, '季度格式应为 YYYY-QN（如 2026-Q2）', 'INVALID_PARAMETER', 400); return
    }

    // 解析季度对应的月份
    const year = parseInt((yearQuarter as string).split('-')[0])
    const quarter = parseInt((yearQuarter as string).split('-Q')[1])
    const startMonth = (quarter - 1) * 3 + 1
    const months = [
      `${year}-${String(startMonth).padStart(2, '0')}`,
      `${year}-${String(startMonth + 1).padStart(2, '0')}`,
      `${year}-${String(startMonth + 2).padStart(2, '0')}`,
    ]

    // 检查季度是否结束
    const now = new Date()
    const quarterEndDate = new Date(year, startMonth + 2, 0)
    const isQuarterEnd = now > quarterEndDate

    // 查询成本中心
    const centers = db.prepare(`
      SELECT * FROM indirect_cost_centers WHERE status = 1
    `).all() as any[]

    // 查询已有调整记录
    const existingAdjustments = db.prepare(`
      SELECT cost_center_id FROM cost_adjustments WHERE year_quarter = ?
    `).all(yearQuarter) as any[]
    const existingSet = new Set(existingAdjustments.map((a: any) => a.cost_center_id))

    const suggestions = centers
      .filter(c => !existingSet.has(c.id))
      .map(center => {
        // 计算预提金额（该季度3个月的分摊总和）
        const monthPlaceholders = months.map(() => '?').join(',')
        const allocRows = db.prepare(`
          SELECT SUM(total_amount) as total, SUM(allocation_rate) as rate_sum
          FROM indirect_cost_allocations
          WHERE cost_center_id = ? AND year_month IN (${monthPlaceholders})
        `).get(center.id, ...months) as any

        const preProvisionAmount = allocRows?.total || 0

        return {
          costCenterId: center.id,
          costCenterName: center.name,
          costCenterCode: center.code,
          costType: center.cost_type,
          yearQuarter,
          preProvisionAmount: Math.round(preProvisionAmount * 100) / 100,
          actualAmount: 0,
          adjustmentAmount: 0,
          isQuarterEnd,
        }
      })

    success(res, { suggestions, isQuarterEnd })
  } catch (err: any) { error(res, err.message) }
})

// 创建调整记录
router.post('/', authenticateToken, requireRole('admin', 'finance'), (req, res) => {
  try {
    const { costCenterId, yearQuarter, actualAmount, adjustmentReason } = req.body
    if (!costCenterId || !yearQuarter || actualAmount === undefined) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()

    // 验证成本中心存在
    const center = db.prepare('SELECT * FROM indirect_cost_centers WHERE id = ?').get(costCenterId) as any
    if (!center) { error(res, '成本中心不存在', 'NOT_FOUND', 404); return }

    // 计算预提金额
    const year = parseInt(yearQuarter.split('-')[0])
    const quarter = parseInt(yearQuarter.split('-Q')[1])
    const startMonth = (quarter - 1) * 3 + 1
    const months = [
      `${year}-${String(startMonth).padStart(2, '0')}`,
      `${year}-${String(startMonth + 1).padStart(2, '0')}`,
      `${year}-${String(startMonth + 2).padStart(2, '0')}`,
    ]

    const monthPlaceholders = months.map(() => '?').join(',')
    const allocRows = db.prepare(`
      SELECT SUM(total_amount) as total
      FROM indirect_cost_allocations
      WHERE cost_center_id = ? AND year_month IN (${monthPlaceholders})
    `).get(costCenterId, ...months) as any

    const preProvisionAmount = allocRows?.total || 0
    const adjustmentAmount = actualAmount - preProvisionAmount
    const userId = (req as any).user?.id

    const id = uuidv4()
    db.prepare(`
      INSERT INTO cost_adjustments (id, cost_center_id, year_quarter, pre_provision_amount, actual_amount, adjustment_amount, adjustment_reason, submitted_by, submitted_at, review_status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'pending')
    `).run(id, costCenterId, yearQuarter, preProvisionAmount, actualAmount, adjustmentAmount, adjustmentReason || null, userId)

    success(res, { id, adjustmentAmount: Math.round(adjustmentAmount * 100) / 100 }, 'Created', 201)
  } catch (err: any) { error(res, err.message) }
})

// 审核调整
router.post('/:id/review', authenticateToken, requireRole('admin', 'finance'), (req, res) => {
  try {
    const { id } = req.params
    const { status, reason } = req.body
    if (!status || !['approved', 'rejected'].includes(status)) {
      error(res, '状态应为 approved 或 rejected', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const userId = (req as any).user?.id

    const existing = db.prepare('SELECT * FROM cost_adjustments WHERE id = ?').get(id) as any
    if (!existing) { error(res, '调整记录不存在', 'NOT_FOUND', 404); return }
    if (existing.review_status !== 'pending') {
      error(res, '该调整已审核', 'CONFLICT', 409); return
    }
    if (existing.submitted_by === userId) {
      error(res, '不能审核自己提交的调整', 'FORBIDDEN', 403); return
    }

    // 乐观锁：仅当状态仍为 pending 时更新
    const result = db.prepare(`
      UPDATE cost_adjustments
      SET review_status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, review_reason = ?
      WHERE id = ? AND review_status = 'pending'
    `).run(status, userId, reason || null, id)

    if (result.changes === 0) {
      error(res, '审核冲突，请刷新后重试', 'CONFLICT', 409); return
    }

    success(res, { id, status }, 'Reviewed')
  } catch (err: any) { error(res, err.message) }
})

// 获取调整记录列表
router.get('/', authenticateToken, requireRole('admin', 'finance'), (req, res) => {
  try {
    const { page = 1, pageSize = 20, yearQuarter, costCenterId, reviewStatus } = req.query
    const db = getDatabase()
    let where = '1=1'
    const params: any[] = []

    if (yearQuarter) { where += ' AND ca.year_quarter = ?'; params.push(yearQuarter) }
    if (costCenterId) { where += ' AND ca.cost_center_id = ?'; params.push(costCenterId) }
    if (reviewStatus) { where += ' AND ca.review_status = ?'; params.push(reviewStatus) }

    const count = (db.prepare(`SELECT COUNT(*) as total FROM cost_adjustments ca WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(`
      SELECT ca.*, icc.name as cost_center_name, icc.code as cost_center_code,
        u1.real_name as submitted_by_name, u2.real_name as reviewed_by_name
      FROM cost_adjustments ca
      LEFT JOIN indirect_cost_centers icc ON ca.cost_center_id = icc.id
      LEFT JOIN users u1 ON ca.submitted_by = u1.id
      LEFT JOIN users u2 ON ca.reviewed_by = u2.id
      WHERE ${where}
      ORDER BY ca.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), offset) as any[]

    successList(res, list.map((r: any) => ({
      id: r.id,
      costCenterId: r.cost_center_id,
      costCenterName: r.cost_center_name,
      costCenterCode: r.cost_center_code,
      yearQuarter: r.year_quarter,
      preProvisionAmount: r.pre_provision_amount,
      actualAmount: r.actual_amount,
      adjustmentAmount: r.adjustment_amount,
      adjustmentReason: r.adjustment_reason,
      submittedBy: r.submitted_by,
      submittedByName: r.submitted_by_name,
      submittedAt: r.submitted_at,
      reviewStatus: r.review_status,
      reviewedBy: r.reviewed_by,
      reviewedByName: r.reviewed_by_name,
      reviewedAt: r.reviewed_at,
      reviewReason: r.review_reason,
      createdAt: r.created_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

export default router
