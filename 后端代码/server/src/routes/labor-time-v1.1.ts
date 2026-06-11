import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'

const router = Router()

// 获取工时列表
router.get('/', (req, res) => {
  try {
    const { page = 1, pageSize = 20, projectType, stepCode, keyword, referenceSource } = req.query
    const db = getDatabase()
    let where = '1=1'
    const params: any[] = []

    if (projectType) {
      where += ' AND project_type = ?'
      params.push(projectType)
    }
    if (stepCode) {
      where += ' AND step_code = ?'
      params.push(stepCode)
    }
    if (keyword) {
      where += ' AND (step_name LIKE ? OR step_code LIKE ?)'
      const like = `%${keyword}%`
      params.push(like, like)
    }
    if (referenceSource) {
      where += ' AND reference_source = ?'
      params.push(referenceSource)
    }

    const count = (db.prepare(`SELECT COUNT(*) as total FROM standard_labor_times WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(`SELECT * FROM standard_labor_times WHERE ${where} ORDER BY sort_order ASC, created_at ASC LIMIT ? OFFSET ?`).all(...params, Number(pageSize), offset) as any[]

    const sourceLabels: Record<string, string> = { supplier: '供应商提供', industry: '行业标准', system: '系统预设' }
    successList(res, list.map((r: any) => ({
      id: r.id,
      stepCode: r.step_code,
      stepName: r.step_name,
      projectType: r.project_type,
      standardMinutes: r.standard_minutes,
      laborRatePerMinute: r.labor_rate_per_minute,
      isEquipmentStep: r.is_equipment_step === 1,
      description: r.description,
      sortOrder: r.sort_order,
      referenceSource: r.reference_source || 'system',
      referenceSourceLabel: sourceLabels[r.reference_source || 'system'] || '系统预设',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

// 按项目类型获取工时模板
router.get('/project-type/:type', (req, res) => {
  try {
    const { type } = req.params
    const db = getDatabase()
    const list = db.prepare(`
      SELECT * FROM standard_labor_times
      WHERE project_type = ? OR project_type = 'all'
      ORDER BY sort_order ASC, created_at ASC
    `).all(type) as any[]

    success(res, list.map((r: any) => ({
      id: r.id,
      stepCode: r.step_code,
      stepName: r.step_name,
      projectType: r.project_type,
      standardMinutes: r.standard_minutes,
      laborRatePerMinute: r.labor_rate_per_minute,
      isEquipmentStep: r.is_equipment_step === 1,
      description: r.description,
      sortOrder: r.sort_order,
      referenceSource: r.reference_source || 'system',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })))
  } catch (err: any) { error(res, err.message) }
})

// 获取工时详情
router.get('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const r = db.prepare('SELECT * FROM standard_labor_times WHERE id = ?').get(id) as any
    if (!r) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    success(res, {
      id: r.id,
      stepCode: r.step_code,
      stepName: r.step_name,
      projectType: r.project_type,
      standardMinutes: r.standard_minutes,
      laborRatePerMinute: r.labor_rate_per_minute,
      isEquipmentStep: r.is_equipment_step === 1,
      description: r.description,
      sortOrder: r.sort_order,
      referenceSource: r.reference_source || 'system',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    })
  } catch (err: any) { error(res, err.message) }
})

// 创建工时定义
router.post('/', (req, res) => {
  try {
    const { stepCode, stepName, projectType, standardMinutes, laborRatePerMinute, isEquipmentStep, description, sortOrder, referenceSource } = req.body
    if (!stepCode || !stepName || !projectType || standardMinutes === undefined) {
      error(res, '缺少必填字段', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const id = uuidv4()
    db.prepare('INSERT INTO standard_labor_times (id, step_code, step_name, project_type, standard_minutes, labor_rate_per_minute, is_equipment_step, description, sort_order, reference_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, stepCode, stepName, projectType, Number(standardMinutes), Number(laborRatePerMinute) || 0, isEquipmentStep ? 1 : 0, description || null, sortOrder || 0, referenceSource || 'system')
    success(res, { id }, 'Created', 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) { error(res, 'Step code exists for this project type', 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

// 更新工时定义
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params
    const { stepCode, stepName, projectType, standardMinutes, laborRatePerMinute, isEquipmentStep, description, sortOrder, referenceSource } = req.body
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM standard_labor_times WHERE id = ?').get(id) as any
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    db.prepare('UPDATE standard_labor_times SET step_code = ?, step_name = ?, project_type = ?, standard_minutes = ?, labor_rate_per_minute = ?, is_equipment_step = ?, description = ?, sort_order = ?, reference_source = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(
        stepCode || existing.step_code,
        stepName || existing.step_name,
        projectType || existing.project_type,
        standardMinutes !== undefined ? Number(standardMinutes) : existing.standard_minutes,
        laborRatePerMinute !== undefined ? Number(laborRatePerMinute) : existing.labor_rate_per_minute,
        isEquipmentStep !== undefined ? (isEquipmentStep ? 1 : 0) : existing.is_equipment_step,
        description !== undefined ? description : existing.description,
        sortOrder !== undefined ? Number(sortOrder) : existing.sort_order,
        referenceSource !== undefined ? referenceSource : (existing.reference_source || 'system'),
        id
      )
    success(res, { id }, 'Updated')
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) { error(res, 'Step code exists for this project type', 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

// 删除工时定义
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM standard_labor_times WHERE id = ?').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    db.prepare('DELETE FROM standard_labor_times WHERE id = ?').run(id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

export default router
