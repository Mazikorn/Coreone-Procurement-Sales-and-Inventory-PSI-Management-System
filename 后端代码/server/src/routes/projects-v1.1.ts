import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { requireStrictRole } from '../middleware/auth.js'
import { calculateBomSupportableSamples } from '../utils/bom-support.js'
import { normalizeDisplayText, requireValidText, type TextGuardResult } from '../utils/text-guard.js'

const router = Router()

// 项目写入权限：仅 admin 可操作
const requireProjectWrite = requireStrictRole('admin')
const PROJECT_TYPES = new Set(['he', 'ihc', 'ss', 'mp', 'cyto'])

function normalizeIds(ids: unknown): string[] {
  if (!Array.isArray(ids)) return []
  return Array.from(new Set(ids.map(id => String(id || '').trim()).filter(Boolean)))
}

function normalizeProjectType(type: unknown): string {
  return String(type || '').trim().toLowerCase()
}

function sendTextError(res: any, result: TextGuardResult): result is Extract<TextGuardResult, { ok: false }> {
  if ('message' in result) {
    error(res, result.message, result.code, result.status)
    return true
  }
  return false
}

function validateProjectBom(db: any, bomId: unknown, projectType: string) {
  const id = String(bomId || '').trim()
  if (!id) return { ok: true }

  const bom = db.prepare('SELECT id, type, status FROM boms WHERE id = ? AND is_deleted = 0').get(id) as any
  if (!bom) return { ok: false, status: 404, message: 'BOM not found', code: 'NOT_FOUND' }
  if (Number(bom.status) !== 1) {
    return { ok: false, status: 409, message: '停用BOM不能关联到检测服务', code: 'CONFLICT' }
  }
  if (bom.type !== projectType && bom.type !== 'project') {
    return { ok: false, status: 422, message: '所选BOM类型与检测服务类型不一致', code: 'BOM_PROJECT_TYPE_MISMATCH' }
  }
  const coreMaterialCount = (db.prepare('SELECT COUNT(*) as count FROM bom_items WHERE bom_id = ?').get(id) as any)?.count || 0
  if (Number(coreMaterialCount) <= 0) {
    return { ok: false, status: 422, message: '所选BOM缺少核心物料', code: 'BOM_CORE_MATERIAL_REQUIRED' }
  }
  return { ok: true }
}

function buildProjectWhere(query: any, alias = '') {
  const { type, status, keyword, bomFilter } = query
  const col = (name: string) => alias ? `${alias}.${name}` : name
  let where = `${col('is_deleted')} = 0`
  const params: any[] = []
  if (type) { where += ` AND ${col('type')} = ?`; params.push(type) }
  if (status === 'active' || status === 'inactive') { where += ` AND ${col('status')} = ?`; params.push(status === 'active' ? 1 : 0) }
  if (keyword) {
    where += ` AND (${col('name')} LIKE ? OR ${col('code')} LIKE ? OR COALESCE(${col('manager')}, '') LIKE ?)`
    const like = `%${keyword}%`
    params.push(like, like, like)
  }
  if (bomFilter === 'configured') { where += ` AND ${col('bom_id')} IS NOT NULL` }
  if (bomFilter === 'unconfigured') { where += ` AND ${col('bom_id')} IS NULL` }
  return { where, params }
}

function validateProjectFilters(query: any) {
  const type = String(query.type || '').trim()
  const status = String(query.status || '').trim()
  const bomFilter = String(query.bomFilter || '').trim()

  if (type && !PROJECT_TYPES.has(type)) {
    return { ok: false, message: 'Invalid type' }
  }
  if (status && status !== 'all' && status !== 'active' && status !== 'inactive') {
    return { ok: false, message: 'Invalid status' }
  }
  if (bomFilter && bomFilter !== 'configured' && bomFilter !== 'unconfigured') {
    return { ok: false, message: 'Invalid BOM filter' }
  }

  return { ok: true }
}

function buildProjectDeleteCheck(db: any, id: string) {
  const existing = db.prepare('SELECT id, code, name, bom_id FROM projects WHERE id = ? AND is_deleted = 0').get(id) as any
  if (!existing) return null

  const directBomCount = existing.bom_id
    ? ((db.prepare('SELECT COUNT(*) as count FROM boms WHERE id = ? AND is_deleted = 0').get(existing.bom_id) as any)?.count || 0)
    : 0
  const serviceBomCount = (db.prepare('SELECT COUNT(*) as count FROM boms WHERE service_id = ? AND is_deleted = 0').get(id) as any)?.count || 0
  const bomRows = db.prepare(`
    SELECT id
    FROM boms
    WHERE is_deleted = 0
      AND (id = ? OR service_id = ?)
  `).all(existing.bom_id || '', id) as any[]
  const outboundCount = (db.prepare('SELECT COUNT(*) as count FROM outbound_records WHERE project_id = ? AND is_deleted = 0').get(id) as any)?.count || 0
  const lisCaseCount = (db.prepare('SELECT COUNT(*) as count FROM lis_cases WHERE project_id = ?').get(id) as any)?.count || 0
  const bomCount = bomRows.length
  const reasons: string[] = []

  if (bomCount > 0) reasons.push(`关联 BOM ${bomCount} 个`)
  if (outboundCount > 0) reasons.push(`关联出库记录 ${outboundCount} 条`)
  if (lisCaseCount > 0) reasons.push(`关联 LIS 检测记录 ${lisCaseCount} 条`)

  return {
    project: {
      id: existing.id,
      code: existing.code,
      name: existing.name,
    },
    deletable: reasons.length === 0,
    impacts: {
      bomCount,
      directBomCount,
      serviceBomCount,
      outboundCount,
      lisCaseCount,
    },
    reasons,
  }
}

function getProjectReferenceCounts(db: any, project: any) {
  const directBomRows = project.bom_id
    ? db.prepare('SELECT id FROM boms WHERE id = ? AND is_deleted = 0').all(project.bom_id) as any[]
    : []
  const serviceBomRows = db.prepare('SELECT id FROM boms WHERE service_id = ? AND is_deleted = 0').all(project.id) as any[]
  const bomIds = new Set<string>([
    ...directBomRows.map(row => row.id),
    ...serviceBomRows.map(row => row.id),
  ])
  const outboundCount = (db.prepare('SELECT COUNT(*) as count FROM outbound_records WHERE project_id = ? AND is_deleted = 0').get(project.id) as any)?.count || 0
  const lisCaseCount = (db.prepare('SELECT COUNT(*) as count FROM lis_cases WHERE project_id = ?').get(project.id) as any)?.count || 0
  return {
    bomCount: bomIds.size,
    directBomCount: directBomRows.length,
    serviceBomCount: serviceBomRows.length,
    outboundCount: Number(outboundCount),
    lisCaseCount: Number(lisCaseCount),
  }
}

function getProjectHistoryCounts(db: any, projectId: string) {
  const outboundCount = (db.prepare('SELECT COUNT(*) as count FROM outbound_records WHERE project_id = ? AND is_deleted = 0').get(projectId) as any)?.count || 0
  const lisCaseCount = (db.prepare('SELECT COUNT(*) as count FROM lis_cases WHERE project_id = ?').get(projectId) as any)?.count || 0
  return {
    outboundCount: Number(outboundCount),
    lisCaseCount: Number(lisCaseCount),
  }
}

function buildProjectStatusCheck(db: any, id: string, targetStatus: 'active' | 'inactive') {
  const project = db.prepare('SELECT id, code, name, type, bom_id FROM projects WHERE id = ? AND is_deleted = 0').get(id) as any
  if (!project) return null

  const impacts = {
    ...getProjectReferenceCounts(db, project),
    invalidBomCount: 0,
  }
  const reasons: string[] = []
  const warnings: string[] = []

  if (targetStatus === 'active' && project.bom_id) {
    const bomValidation = validateProjectBom(db, project.bom_id, project.type)
    if (!bomValidation.ok) {
      impacts.invalidBomCount = 1
      reasons.push(bomValidation.message)
    }
  }

  if (targetStatus === 'inactive') {
    warnings.push('停用后该检测服务不能用于新出库')
    if (impacts.outboundCount > 0) warnings.push('已有历史出库记录会保留')
    if (impacts.lisCaseCount > 0) warnings.push('已有LIS检测记录会保留')
    if (impacts.bomCount > 0) warnings.push('已关联BOM会保留绑定关系')
  }

  return {
    project: {
      id: project.id,
      code: project.code,
      name: project.name,
    },
    targetStatus,
    canChange: reasons.length === 0,
    impacts,
    reasons,
    warnings,
  }
}

router.get('/', (req, res) => {
  try {
    const filterValidation = validateProjectFilters(req.query)
    if (!filterValidation.ok) {
      error(res, filterValidation.message, 'INVALID_PARAMETER', 400); return
    }
    let { page = 1, pageSize = 20 } = req.query
    page = Math.max(1, Number(page) || 1)
    pageSize = Math.max(1, Math.min(1000, Number(pageSize) || 20))
    const db = getDatabase()
    const { where, params } = buildProjectWhere(req.query)
    const { where: listWhere } = buildProjectWhere(req.query, 'p')

    const count = (db.prepare(`SELECT COUNT(*) as total FROM projects WHERE ${where}`).get(...params) as any)?.total || 0
    const offset = (Number(page) - 1) * Number(pageSize)
    const list = db.prepare(`
      SELECT p.*, b.name as bom_name, b.version as bom_version
      FROM projects p
      LEFT JOIN boms b ON p.bom_id = b.id AND b.is_deleted = 0
      WHERE ${listWhere}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, Number(pageSize), offset) as any[]

    successList(res, list.map((r: any) => ({
      id: r.id, code: r.code, name: r.name, type: r.type, cycle: r.cycle,
      bomId: r.bom_id, bomName: r.bom_name || null, bomVersion: r.bom_version || null,
      supportableSamples: calculateBomSupportableSamples(db, r.bom_id),
      status: r.status === 1 ? 'active' : 'inactive', manager: r.manager,
      description: r.description, createdAt: r.created_at,
    })), Number(page), Number(pageSize), count)
  } catch (err: any) { error(res, err.message) }
})

router.get('/stats', (req, res) => {
  try {
    const filterValidation = validateProjectFilters(req.query)
    if (!filterValidation.ok) {
      error(res, filterValidation.message, 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const { where, params } = buildProjectWhere(req.query)
    const row = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 1 THEN 1 ELSE 0 END), 0) as active,
        COALESCE(SUM(CASE WHEN status = 0 THEN 1 ELSE 0 END), 0) as inactive,
        COALESCE(SUM(CASE WHEN bom_id IS NULL THEN 1 ELSE 0 END), 0) as noBom
      FROM projects
      WHERE ${where}
    `).get(...params) as any
    success(res, {
      total: row?.total || 0,
      active: row?.active || 0,
      inactive: row?.inactive || 0,
      noBom: row?.noBom || 0,
    })
  } catch (err: any) { error(res, err.message) }
})

router.get('/:id/check-deletable', requireProjectWrite, (req, res) => {
  try {
    const db = getDatabase()
    const check = buildProjectDeleteCheck(db, req.params.id)
    if (!check) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    success(res, check)
  } catch (err: any) { error(res, err.message) }
})

router.get('/:id/check-status', requireProjectWrite, (req, res) => {
  try {
    const status = String(req.query.status || '').trim()
    if (status !== 'active' && status !== 'inactive') {
      error(res, 'Invalid status', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const check = buildProjectStatusCheck(db, req.params.id, status)
    if (!check) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    success(res, check)
  } catch (err: any) { error(res, err.message) }
})

router.get('/:id', (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const row = db.prepare(`
      SELECT p.*, b.name as bom_name, b.version as bom_version
      FROM projects p
      LEFT JOIN boms b ON p.bom_id = b.id AND b.is_deleted = 0
      WHERE p.id = ? AND p.is_deleted = 0
    `).get(id) as any
    if (!row) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    const costStats = db.prepare(`
      SELECT SUM(total_cost) as total_cost, SUM(COALESCE(sample_count, 1)) as sample_count
      FROM outbound_records WHERE project_id = ? AND status = 'completed' AND is_deleted = 0
    `).get(id) as any

    success(res, {
      id: row.id, code: row.code, name: row.name, type: row.type, cycle: row.cycle,
      bomId: row.bom_id, bomName: row.bom_name || null, bomVersion: row.bom_version || null,
      supportableSamples: calculateBomSupportableSamples(db, row.bom_id),
      status: row.status === 1 ? 'active' : 'inactive', manager: row.manager,
      description: row.description,
      costStats: {
        totalCost: costStats?.total_cost || 0,
        sampleCount: costStats?.sample_count || 0,
        unitCost: costStats?.sample_count > 0 ? (costStats.total_cost / costStats.sample_count) : 0,
      },
      createdAt: row.created_at,
    })
  } catch (err: any) { error(res, err.message) }
})

router.post('/', requireProjectWrite, (req, res) => {
  try {
    const { code, name, type, cycle, manager, description, bomId, status } = req.body
    const normalizedType = normalizeProjectType(type)
    if (!normalizedType) { error(res, 'Code, name and type required', 'INVALID_PARAMETER', 400); return }
    const codeText = requireValidText(code, '项目编码', 60)
    if (sendTextError(res, codeText)) return
    const nameText = requireValidText(name, '项目名称')
    if (sendTextError(res, nameText)) return
    const cycleText = normalizeDisplayText(cycle, '周期', { maxLength: 80 })
    if (sendTextError(res, cycleText)) return
    const managerText = normalizeDisplayText(manager, '负责人', { maxLength: 80 })
    if (sendTextError(res, managerText)) return
    const descriptionText = normalizeDisplayText(description, '项目描述', { maxLength: 500 })
    if (sendTextError(res, descriptionText)) return
    if (!PROJECT_TYPES.has(normalizedType)) {
      error(res, 'Invalid type', 'INVALID_PARAMETER', 400); return
    }
    if (status !== undefined && status !== 'active' && status !== 'inactive') {
      error(res, 'Invalid status', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()

    if (bomId) {
      const bomValidation = validateProjectBom(db, bomId, normalizedType)
      if (!bomValidation.ok) { error(res, bomValidation.message, bomValidation.code, bomValidation.status); return }
    }

    const id = uuidv4()
    db.prepare('INSERT INTO projects (id, code, name, type, cycle, manager, description, status, bom_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, codeText.value, nameText.value, normalizedType, cycleText.value, managerText.value, descriptionText.value, status === 'inactive' ? 0 : 1, bomId || null)
    const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any
    success(res, {
      id: row.id, code: row.code, name: row.name, type: row.type, cycle: row.cycle,
      bomId: row.bom_id, supportableSamples: row.supportable_samples,
      status: row.status === 1 ? 'active' : 'inactive', manager: row.manager,
      description: row.description, createdAt: row.created_at,
    }, 'Created', 201)
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) { error(res, 'Code exists', 'RESOURCE_CONFLICT', 409); return }
    error(res, err.message)
  }
})

router.patch('/batch-status', requireProjectWrite, (req, res) => {
  try {
    const ids = normalizeIds(req.body?.ids)
    const { status } = req.body
    if (ids.length === 0 || !['active', 'inactive'].includes(status)) {
      error(res, '项目和状态必填', 'INVALID_PARAMETER', 400); return
    }
    const db = getDatabase()
    const placeholders = ids.map(() => '?').join(',')
    const existing = db.prepare(`
      SELECT id, type, bom_id
      FROM projects
      WHERE is_deleted = 0 AND id IN (${placeholders})
    `).all(...ids) as any[]
    if (existing.length !== ids.length) {
      error(res, '存在不存在或已删除的项目，批量状态未更新', 'NOT_FOUND', 404); return
    }
    if (status === 'active') {
      for (const project of existing) {
        if (!project.bom_id) continue
        const bomValidation = validateProjectBom(db, project.bom_id, project.type)
        if (!bomValidation.ok) {
          error(res, '存在绑定不可用BOM的项目，批量启用未执行', bomValidation.code, bomValidation.status); return
        }
      }
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare(`
        UPDATE projects
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

router.put('/:id', requireProjectWrite, (req, res) => {
  try {
    const { id } = req.params
    const data = req.body
    const db = getDatabase()
    const existing = db.prepare('SELECT * FROM projects WHERE id = ? AND is_deleted = 0').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    if (data.code === null || data.code === undefined ||
        data.name === null || data.name === undefined ||
        data.type === '' || data.type === null || data.type === undefined) {
      error(res, 'Code, name and type cannot be empty', 'INVALID_PARAMETER', 400); return
    }
    const codeText = data.code !== undefined ? requireValidText(data.code, '项目编码', 60) : null
    let normalizedCode: string | null = null
    if (codeText) {
      if (sendTextError(res, codeText)) return
      normalizedCode = codeText.value
    }
    const nameText = data.name !== undefined ? requireValidText(data.name, '项目名称') : null
    let normalizedName: string | null = null
    if (nameText) {
      if (sendTextError(res, nameText)) return
      normalizedName = nameText.value
    }
    const cycleText = data.cycle !== undefined ? normalizeDisplayText(data.cycle, '周期', { maxLength: 80 }) : null
    let normalizedCycle: string | null = null
    if (cycleText) {
      if (sendTextError(res, cycleText)) return
      normalizedCycle = cycleText.value
    }
    const managerText = data.manager !== undefined ? normalizeDisplayText(data.manager, '负责人', { maxLength: 80 }) : null
    let normalizedManager: string | null = null
    if (managerText) {
      if (sendTextError(res, managerText)) return
      normalizedManager = managerText.value
    }
    const descriptionText = data.description !== undefined ? normalizeDisplayText(data.description, '项目描述', { maxLength: 500 }) : null
    let normalizedDescription: string | null = null
    if (descriptionText) {
      if (sendTextError(res, descriptionText)) return
      normalizedDescription = descriptionText.value
    }
    const normalizedType = data.type === undefined ? undefined : normalizeProjectType(data.type)
    if (normalizedType !== undefined && !PROJECT_TYPES.has(normalizedType)) {
      error(res, 'Invalid type', 'INVALID_PARAMETER', 400); return
    }
    if (data.status !== undefined && data.status !== 'active' && data.status !== 'inactive') {
      error(res, 'Invalid status', 'INVALID_PARAMETER', 400); return
    }
    const effectiveType = normalizedType || (existing as any).type
    const effectiveBomId = data.bomId !== undefined ? data.bomId : (existing as any).bom_id
    if (effectiveBomId) {
      const bomValidation = validateProjectBom(db, effectiveBomId, effectiveType)
      if (!bomValidation.ok) { error(res, bomValidation.message, bomValidation.code, bomValidation.status); return }
    }
    if (data.bomId !== undefined) {
      const currentBomId = String((existing as any).bom_id || '').trim()
      const nextBomId = String(data.bomId || '').trim()
      if (currentBomId !== nextBomId) {
        const history = getProjectHistoryCounts(db, id)
        if (history.outboundCount > 0 || history.lisCaseCount > 0) {
          const reasons: string[] = []
          if (history.outboundCount > 0) reasons.push(`已有出库记录 ${history.outboundCount} 条`)
          if (history.lisCaseCount > 0) reasons.push(`已有LIS检测记录 ${history.lisCaseCount} 条`)
          error(res, `检测项目已有历史业务，不可直接更换BOM：${reasons.join('；')}`, 'PROJECT_BOM_CHANGE_BLOCKED', 409)
          return
        }
      }
    }
    if (data.type !== undefined && normalizedType !== (existing as any).type) {
      const history = getProjectHistoryCounts(db, id)
      if (history.outboundCount > 0 || history.lisCaseCount > 0) {
        const reasons: string[] = []
        if (history.outboundCount > 0) reasons.push(`已有出库记录 ${history.outboundCount} 条`)
        if (history.lisCaseCount > 0) reasons.push(`已有LIS检测记录 ${history.lisCaseCount} 条`)
        error(res, `检测项目已有历史业务，不可直接更换服务类型：${reasons.join('；')}`, 'PROJECT_TYPE_CHANGE_BLOCKED', 409)
        return
      }
    }
    if (normalizedCode !== null && normalizedCode !== (existing as any).code) {
      const history = getProjectHistoryCounts(db, id)
      if (history.outboundCount > 0 || history.lisCaseCount > 0) {
        const reasons: string[] = []
        if (history.outboundCount > 0) reasons.push(`已有出库记录 ${history.outboundCount} 条`)
        if (history.lisCaseCount > 0) reasons.push(`已有LIS检测记录 ${history.lisCaseCount} 条`)
        error(res, `检测项目已有历史业务，不可直接更换服务编号：${reasons.join('；')}`, 'PROJECT_CODE_CHANGE_BLOCKED', 409)
        return
      }
    }
    const fields: string[] = []; const params: any[] = []
    if (normalizedCode !== null) { fields.push('code = ?'); params.push(normalizedCode) }
    if (normalizedName !== null) { fields.push('name = ?'); params.push(normalizedName) }
    if (data.type !== undefined) { fields.push('type = ?'); params.push(normalizedType) }
    if (cycleText) { fields.push('cycle = ?'); params.push(normalizedCycle) }
    if (managerText) { fields.push('manager = ?'); params.push(normalizedManager) }
    if (descriptionText) { fields.push('description = ?'); params.push(normalizedDescription) }
    if (data.status !== undefined) { fields.push('status = ?'); params.push(data.status === 'active' ? 1 : 0) }
    if (data.bomId !== undefined) { fields.push('bom_id = ?'); params.push(data.bomId || null) }
    if (fields.length > 0) { params.push(id); db.prepare(`UPDATE projects SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND is_deleted = 0`).run(...params) }
    success(res, { id }, 'Updated')
  } catch (err: any) { error(res, err.message) }
})

router.delete('/:id', requireProjectWrite, (req, res) => {
  try {
    const { id } = req.params
    const db = getDatabase()
    const check = buildProjectDeleteCheck(db, id)
    if (!check) { error(res, '记录不存在', 'NOT_FOUND', 404); return }
    if (!check.deletable) {
      error(res, `检测项目存在业务引用，不可删除：${check.reasons.join('；')}`, 'PROJECT_REFERENCED', 409)
      return
    }

    db.prepare('UPDATE projects SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
    success(res, null, 'Deleted')
  } catch (err: any) { error(res, err.message) }
})

export default router
