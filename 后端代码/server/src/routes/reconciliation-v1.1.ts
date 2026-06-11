import { Router } from 'express'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'

const router = Router()

/**
 * GET /api/v1/reconciliation/summary
 * 获取对账汇总数据（顶部统计卡片）
 */
router.get('/summary', (req, res) => {
  try {
    const db = getDatabase()
    const { startDate, endDate } = req.query as Record<string, string>

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if ((startDate && !dateRegex.test(startDate)) || (endDate && !dateRegex.test(endDate))) {
      error(res, 'Invalid date format', 'INVALID_PARAMETER', 400); return
    }

    let dateFilter = ''
    const dateParams: any[] = []
    if (startDate && endDate) {
      dateFilter = 'AND operate_time >= ? AND operate_time <= ?'
      dateParams.push(startDate, `${endDate} 23:59:59`)
    }

    // LIS病例总数
    const totalCases = db.prepare(`
      SELECT COUNT(*) as count FROM lis_cases WHERE 1=1 ${dateFilter}
    `).get(...dateParams) as any

    const outDateFilter = startDate && endDate ? 'AND o.created_at >= ? AND o.created_at <= ?' : ''
    const outDateParams = startDate && endDate ? [startDate, `${endDate} 23:59:59`] : []

    // 关联出库数（通过 outbound_items 关联 project_id 的出库记录）
    const linkedOutbounds = db.prepare(`
      SELECT COUNT(DISTINCT o.id) as count
      FROM outbound_records o
      WHERE o.project_id IS NOT NULL AND o.project_id != '' AND o.is_deleted = 0
      ${outDateFilter}
    `).get(...outDateParams) as any

    // 未关联出库数
    const unlinkedOutbounds = db.prepare(`
      SELECT COUNT(DISTINCT o.id) as count
      FROM outbound_records o
      WHERE (o.project_id IS NULL OR o.project_id = '') AND o.status = 'completed' AND o.is_deleted = 0
      ${outDateFilter}
    `).get(...outDateParams) as any

    // 未关联BOM的项目数
    const projectsWithoutBom = db.prepare(`
      SELECT COUNT(*) as count FROM projects WHERE (bom_id IS NULL OR bom_id = '') AND is_deleted = 0
    `).get() as any

    success(res, {
      totalCases: totalCases?.count || 0,
      linkedOutbounds: linkedOutbounds?.count || 0,
      unlinkedOutbounds: unlinkedOutbounds?.count || 0,
      projectsWithoutBom: projectsWithoutBom?.count || 0,
    })
  } catch (e: any) {
    error(res, e.message || '获取对账汇总失败')
  }
})

/**
 * GET /api/v1/reconciliation/projects
 * 按项目对账列表
 */
router.get('/projects', (req, res) => {
  try {
    const db = getDatabase()
    const { startDate, endDate } = req.query as Record<string, string>

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if ((startDate && !dateRegex.test(startDate)) || (endDate && !dateRegex.test(endDate))) {
      error(res, 'Invalid date format', 'INVALID_PARAMETER', 400); return
    }

    const hasDate = startDate && endDate
    const endDateTime = hasDate ? `${endDate} 23:59:59` : ''

    const projects = db.prepare(`
      SELECT p.id, p.code, p.name, p.bom_id, p.type,
        (SELECT COUNT(*) FROM lis_cases WHERE project_id = p.id
          ${hasDate ? 'AND operate_time >= ? AND operate_time <= ?' : ''}
        ) as case_count,
        (SELECT COUNT(DISTINCT o.id) FROM outbound_records o
          WHERE o.project_id = p.id AND o.status = 'completed' AND o.is_deleted = 0
          ${hasDate ? 'AND o.created_at >= ? AND o.created_at <= ?' : ''}
        ) as outbound_count
      FROM projects p
      WHERE p.is_deleted = 0 AND p.status = 1
      ORDER BY case_count DESC
    `).all(...(hasDate ? [startDate, endDateTime, startDate, endDateTime] : [])) as any[]

    // Batch BOM lookup: collect all bom_ids and project_ids, single query
    const bomIds = projects.map((p: any) => p.bom_id).filter(Boolean)
    const projectIds = projects.map((p: any) => p.id).filter(Boolean)
    let allBoms: any[] = []
    const bomConditions: string[] = []
    const bomQueryParams: any[] = []
    if (bomIds.length > 0) {
      bomConditions.push(`id IN (${bomIds.map(() => '?').join(',')})`)
      bomQueryParams.push(...bomIds)
    }
    if (projectIds.length > 0) {
      bomConditions.push(`service_id IN (${projectIds.map(() => '?').join(',')})`)
      bomQueryParams.push(...projectIds)
    }
    if (bomConditions.length > 0) {
      allBoms = db.prepare(`
        SELECT id, code, name, service_id FROM boms
        WHERE (${bomConditions.join(' OR ')}) AND is_deleted = 0
      `).all(...bomQueryParams) as any[]
    }

    // Group BOMs by project id (matched via bom_id or service_id)
    const bomsByServiceId = new Map<string, any[]>()
    const bomsById = new Map<string, any>()
    for (const bom of allBoms) {
      bomsById.set(bom.id, bom)
      if (bom.service_id) {
        const existing = bomsByServiceId.get(bom.service_id) || []
        existing.push(bom)
        bomsByServiceId.set(bom.service_id, existing)
      }
    }

    const result = projects.map((p: any) => {
      // Collect BOMs: by service_id match + by direct bom_id match (deduplicated)
      const serviceBoms = bomsByServiceId.get(p.id) || []
      const directBom = p.bom_id ? bomsById.get(p.bom_id) : null
      const seen = new Set(serviceBoms.map((b: any) => b.id))
      const boms = [...serviceBoms]
      if (directBom && !seen.has(directBom.id)) {
        boms.push(directBom)
      }
      return {
        ...p,
        hasBom: !!p.bom_id && p.bom_id !== '',
        boms: boms.map((b: any) => ({ id: b.id, code: b.code, name: b.name })),
      }
    })

    successList(res, result, 1, result.length, result.length)
  } catch (e: any) {
    error(res, e.message || '获取项目对账失败')
  }
})

/**
 * GET /api/v1/reconciliation/projects/:id/materials
 * 某个项目的物料对账明细
 */
router.get('/projects/:id/materials', (req, res) => {
  try {
    const db = getDatabase()
    const projectId = req.params.id
    const { startDate, endDate } = req.query as Record<string, string>

    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    if ((startDate && !dateRegex.test(startDate)) || (endDate && !dateRegex.test(endDate))) {
      error(res, 'Invalid date format', 'INVALID_PARAMETER', 400); return
    }

    const hasDate = startDate && endDate
    const dateParams: any[] = hasDate ? [startDate, `${endDate} 23:59:59`] : []

    const project = db.prepare('SELECT * FROM projects WHERE id = ? AND is_deleted = 0').get(projectId) as any
    if (!project) {
      return error(res, '项目不存在', 'NOT_FOUND', 404)
    }

    // 获取BOM items
    const bomItems = db.prepare(`
      SELECT bi.*, m.name as material_name, m.spec, m.unit as material_unit, m.price
      FROM bom_items bi
      JOIN materials m ON bi.material_id = m.id
      WHERE bi.bom_id = ? AND m.is_deleted = 0
    `).all(project.bom_id || '') as any[]

    // LIS病例数
    const caseCount = db.prepare(`
      SELECT COUNT(*) as count FROM lis_cases
      WHERE project_id = ? ${hasDate ? 'AND operate_time >= ? AND operate_time <= ?' : ''}
    `).get(projectId, ...dateParams) as any

    const cases = caseCount?.count || 0

    // 实际出库量
    const actualOutbounds = db.prepare(`
      SELECT oi.material_id, SUM(oi.quantity) as total_qty, m.unit, m.name, m.spec
      FROM outbound_items oi
      JOIN outbound_records o ON oi.outbound_id = o.id
      JOIN materials m ON oi.material_id = m.id
      WHERE o.project_id = ? AND o.status = 'completed' AND o.is_deleted = 0 ${hasDate ? 'AND o.created_at >= ? AND o.created_at <= ?' : ''}
      GROUP BY oi.material_id
    `).all(projectId, ...dateParams) as any[]

    const result = bomItems.map((bi: any) => {
      const theoryQty = cases * (bi.usage_per_sample || 0)
      const actual = actualOutbounds.find((a: any) => a.material_id === bi.material_id)
      const actualQty = actual?.total_qty || 0
      const diff = actualQty - theoryQty
      const diffRate = theoryQty > 0 ? ((diff / theoryQty) * 100).toFixed(1) : '0'

      let status = 'match'
      if (diff > theoryQty * 0.2) status = 'warn'
      if (diff > theoryQty * 0.5) status = 'danger'
      if (diff < -theoryQty * 0.2) status = 'warn'

      return {
        materialId: bi.material_id,
        materialName: bi.material_name,
        spec: bi.spec,
        bomUsagePerSample: bi.usage_per_sample,
        bomUnit: bi.unit,
        theoryQty,
        theoryUnit: bi.unit,
        actualQty,
        actualUnit: actual?.unit || bi.unit,
        diff,
        diffRate: parseFloat(diffRate),
        status,
        price: bi.price || 0,
      }
    })

    successList(res, result, 1, result.length, result.length)
  } catch (e: any) {
    error(res, e.message || '获取项目物料对账失败')
  }
})

/**
 * GET /api/v1/reconciliation/materials
 * 按物料维度汇总对账
 */
router.get('/materials', (req, res) => {
  try {
    const db = getDatabase()
    const { startDate, endDate } = req.query as Record<string, string>
    const hasDate = startDate && endDate
    const dateParams: any[] = hasDate ? [startDate, `${endDate} 23:59:59`] : []

    const materials = db.prepare(`
      SELECT m.id, m.name, m.spec, m.unit, m.price,
        (SELECT COUNT(DISTINCT p.id) FROM projects p
          JOIN bom_items bi ON bi.bom_id = p.bom_id
          WHERE bi.material_id = m.id AND p.is_deleted = 0
        ) as project_count
      FROM materials m
      WHERE m.is_deleted = 0 AND m.status = 1
      ORDER BY m.name
    `).all() as any[]

    // Batch 1: All BOM usages for all materials (replaces per-material query)
    const allBomUsages = db.prepare(`
      SELECT bi.material_id, bi.usage_per_sample, bi.unit, p.id as project_id
      FROM bom_items bi
      JOIN projects p ON bi.bom_id = p.bom_id
      WHERE p.is_deleted = 0
    `).all() as any[]

    // Group BOM usages by material_id
    const bomUsagesByMaterial = new Map<string, any[]>()
    for (const bu of allBomUsages) {
      const existing = bomUsagesByMaterial.get(bu.material_id) || []
      existing.push(bu)
      bomUsagesByMaterial.set(bu.material_id, existing)
    }

    // Batch 2: All case counts by project (replaces per-project-per-material query)
    const caseCountsByProject = new Map<string, number>()
    if (hasDate) {
      const rows = db.prepare(`
        SELECT project_id, COUNT(*) as count FROM lis_cases
        WHERE operate_time >= ? AND operate_time <= ?
        GROUP BY project_id
      `).all(startDate, `${endDate} 23:59:59`) as any[]
      for (const r of rows) caseCountsByProject.set(r.project_id, r.count)
    } else {
      const rows = db.prepare(`
        SELECT project_id, COUNT(*) as count FROM lis_cases
        GROUP BY project_id
      `).all() as any[]
      for (const r of rows) caseCountsByProject.set(r.project_id, r.count)
    }

    // Batch 3: All actual outbound quantities by material (replaces per-material query)
    const actualOutboundsByMaterial = new Map<string, number>()
    const actualOutboundRows = hasDate
      ? (db.prepare(`
          SELECT oi.material_id, SUM(oi.quantity) as total_qty
          FROM outbound_items oi
          JOIN outbound_records o ON oi.outbound_id = o.id
          WHERE o.status = 'completed' AND o.is_deleted = 0 AND o.created_at >= ? AND o.created_at <= ?
          GROUP BY oi.material_id
        `).all(startDate, `${endDate} 23:59:59`) as any[])
      : (db.prepare(`
          SELECT oi.material_id, SUM(oi.quantity) as total_qty
          FROM outbound_items oi
          JOIN outbound_records o ON oi.outbound_id = o.id
          WHERE o.status = 'completed' AND o.is_deleted = 0
          GROUP BY oi.material_id
        `).all() as any[])
    for (const r of actualOutboundRows) actualOutboundsByMaterial.set(r.material_id, r.total_qty || 0)

    const result = materials.map((m: any) => {
      const bomUsages = bomUsagesByMaterial.get(m.id) || []

      let theoryTotal = 0
      for (const bu of bomUsages) {
        const caseCount = caseCountsByProject.get(bu.project_id) || 0
        theoryTotal += caseCount * (bu.usage_per_sample || 0)
      }

      const actualTotal = actualOutboundsByMaterial.get(m.id) || 0
      const diff = actualTotal - theoryTotal

      let status = 'match'
      if (diff > theoryTotal * 0.2) status = 'warn'
      if (diff > theoryTotal * 0.5) status = 'danger'

      return {
        materialId: m.id,
        materialName: m.name,
        spec: m.spec,
        unit: m.unit,
        projectCount: m.project_count,
        theoryTotal,
        actualTotal,
        diff,
        diffRate: theoryTotal > 0 ? ((diff / theoryTotal) * 100).toFixed(1) : '0',
        status,
        price: m.price || 0,
      }
    })

    successList(res, result, 1, result.length, result.length)
  } catch (e: any) {
    error(res, e.message || '获取物料对账失败')
  }
})

/**
 * GET /api/v1/reconciliation/cases
 * 按病理号查看列表
 */
router.get('/cases', (req, res) => {
  try {
    const db = getDatabase()
    const { page = '1', pageSize = '20', search, projectId, status } = req.query as Record<string, string>
    const pageNum = Math.max(1, parseInt(page))
    const offset = (pageNum - 1) * parseInt(pageSize)

    let where = 'WHERE 1=1'
    const params: any[] = []
    if (search) { where += ' AND (case_no LIKE ? OR project_name LIKE ?)'; params.push(`%${search}%`, `%${search}%`) }
    if (projectId) { where += ' AND project_id = ?'; params.push(projectId) }
    if (status) { where += ' AND status = ?'; params.push(status) }

    // For JOIN query, qualify column names with table alias
    let joinWhere = 'WHERE 1=1'
    if (search) { joinWhere += ' AND (lc.case_no LIKE ? OR lc.project_name LIKE ?)' }
    if (projectId) { joinWhere += ' AND lc.project_id = ?' }
    if (status) { joinWhere += ' AND lc.status = ?' }

    const list = db.prepare(`
      SELECT lc.*, p.name as joined_project_name, p.bom_id as joined_bom_id
      FROM lis_cases lc
      LEFT JOIN projects p ON lc.project_id = p.id AND p.is_deleted = 0
      ${joinWhere}
      ORDER BY lc.operate_time DESC
      LIMIT ? OFFSET ?
    `).all(...params, parseInt(pageSize), offset) as any[]

    const count = (db.prepare(`SELECT COUNT(*) as count FROM lis_cases ${where}`).get(...params) as any)?.count || 0

    const result = list.map((c: any) => {
      return {
        ...c,
        projectName: c.joined_project_name || c.project_name || '-',
        hasBom: !!c.joined_bom_id,
      }
    })

    successList(res, result, pageNum, parseInt(pageSize), count)
  } catch (e: any) {
    error(res, e.message || '获取病例列表失败')
  }
})

/**
 * POST /api/v1/reconciliation/cases/import
 * 批量导入LIS病例数据
 */
router.post('/cases/import', (req, res) => {
  try {
    const db = getDatabase()
    const { items } = req.body as { items: any[] }

    if (!Array.isArray(items) || items.length === 0) {
      return error(res, '导入数据为空', 'BAD_REQUEST', 400)
    }

    const importBatch = `IMPORT-${Date.now()}`

    db.exec('BEGIN IMMEDIATE')
    try {
      // 预加载有效项目 ID 集合
      const validProjects = new Set(
        (db.prepare("SELECT id FROM projects WHERE is_deleted = 0").all() as any[]).map(p => p.id)
      )

      const stmt = db.prepare(`
        INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, import_batch)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(case_no) DO UPDATE SET
          project_id = excluded.project_id,
          project_name = excluded.project_name,
          operator = excluded.operator,
          operate_time = excluded.operate_time
      `)

      let successCount = 0
      let skippedCount = 0
      for (const item of items) {
        const projectId = item.projectId || item.project_id || ''
        // 验证 project_id 是否存在
        if (projectId && !validProjects.has(projectId)) {
          skippedCount++
          continue
        }
        const id = `LC-${Date.now()}-${Math.floor(Math.random() * 10000)}`
        stmt.run(
          id,
          item.caseNo || item.case_no || '',
          projectId,
          item.projectName || item.project_name || '',
          item.operator || '',
          item.operateTime || item.operate_time || null,
          importBatch
        )
        successCount++
      }

      db.exec('COMMIT')
      const msg = skippedCount > 0
        ? `成功导入 ${successCount} 条病例数据，跳过 ${skippedCount} 条无效项目`
        : `成功导入 ${successCount} 条病例数据`
      success(res, { importBatch, count: successCount, skipped: skippedCount }, msg)
    } catch (e: any) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (e: any) {
    error(res, e.message || '导入失败')
  }
})

/**
 * PUT /api/v1/reconciliation/cases/:id
 * 修改病例信息（关联项目等）
 */
router.put('/cases/:id', (req, res) => {
  try {
    const db = getDatabase()
    const { id } = req.params
    const { projectId, projectName, status } = req.body

    const existing = db.prepare('SELECT * FROM lis_cases WHERE id = ?').get(id)
    if (!existing) { error(res, '记录不存在', 'NOT_FOUND', 404); return }

    db.prepare(`
      UPDATE lis_cases SET
        project_id = COALESCE(?, project_id),
        project_name = COALESCE(?, project_name),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(projectId, projectName, status, id)

    success(res, null, '病例信息已更新')
  } catch (e: any) {
    error(res, e.message || '更新失败')
  }
})

/**
 * GET /api/v1/reconciliation/logs
 * 获取修正日志
 */
router.get('/logs', (req, res) => {
  try {
    const db = getDatabase()
    const { page = '1', pageSize = '20' } = req.query as Record<string, string>
    const offset = (parseInt(page) - 1) * parseInt(pageSize)

    const list = db.prepare(`
      SELECT * FROM reconciliation_logs
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(parseInt(pageSize), offset) as any[]

    const count = db.prepare('SELECT COUNT(*) as count FROM reconciliation_logs').get() as any

    successList(res, list, parseInt(page), parseInt(pageSize), count?.count || 0)
  } catch (e: any) {
    error(res, e.message || '获取日志失败')
  }
})

/**
 * POST /api/v1/reconciliation/logs
 * 记录修正日志，同时更新BOM用量（如果提供了projectId和materialId）
 */
router.post('/logs', (req, res) => {
  try {
    const db = getDatabase()
    const { type, targetId, targetName, field, oldValue, newValue, reason, projectId, materialId, newUsage } = req.body

    db.exec('BEGIN IMMEDIATE')
    try {
      // 如果提供了projectId、materialId和newUsage，先更新bom_items
      if (projectId && materialId && newUsage !== undefined) {
        const usage = Number(newUsage)
        if (isNaN(usage) || usage < 0) {
          db.exec('ROLLBACK')
          error(res, 'newUsage 必须为非负数', 'INVALID_PARAMETER', 400); return
        }
        const project = db.prepare('SELECT bom_id FROM projects WHERE id = ? AND is_deleted = 0').get(projectId) as any
        if (project?.bom_id) {
          db.prepare('UPDATE bom_items SET usage_per_sample = ? WHERE bom_id = ? AND material_id = ?')
            .run(usage, project.bom_id, materialId)
        }
      }

      const id = `LOG-${Date.now()}-${Math.floor(Math.random() * 1000)}`
      db.prepare(`
        INSERT INTO reconciliation_logs (id, type, target_id, target_name, field, old_value, new_value, reason, operator, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `).run(id, type || 'bom_fix', targetId, targetName, field, oldValue, newValue, reason, (req as any).user?.username || 'system')

      db.exec('COMMIT')
      success(res, { id }, 'BOM修正已生效，日志已记录')
    } catch (innerErr: any) {
      db.exec('ROLLBACK')
      throw innerErr
    }
  } catch (e: any) {
    error(res, e.message || '记录日志失败')
  }
})

export default router
