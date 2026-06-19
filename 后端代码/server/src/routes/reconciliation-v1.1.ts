import { Router } from 'express'
import { v4 as uuidv4 } from 'uuid'
import multer from 'multer'
import * as XLSX from 'xlsx'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { recordCostException } from '../utils/cost-exceptions.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const dateRegex = /^\d{4}-\d{2}-\d{2}$/
const dateTimeRegex = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/

function isValidDateOnly(value: string) {
  if (!dateRegex.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function validateDateRange(startDate?: string, endDate?: string) {
  if (startDate && !isValidDateOnly(startDate)) return false
  if (endDate && !isValidDateOnly(endDate)) return false
  if (startDate && endDate && startDate > endDate) return false
  return true
}

function parsePaginationParam(value: string | undefined, fallback: number, max = 200) {
  const raw = String(value || fallback).trim()
  if (!/^\d+$/.test(raw)) return null
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) return null
  return parsed
}

function validateLisOperateTime(value: string) {
  const match = value.trim().match(dateTimeRegex)
  if (!match) return false

  const [, yearText, monthText, dayText, hourText = '00', minuteText = '00', secondText = '00'] = match
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  const hour = Number(hourText)
  const minute = Number(minuteText)
  const second = Number(secondText)
  if (hour > 23 || minute > 59 || second > 59) return false

  const date = new Date(year, month - 1, day, hour, minute, second)
  return date.getFullYear() === year
    && date.getMonth() === month - 1
    && date.getDate() === day
    && date.getHours() === hour
    && date.getMinutes() === minute
    && date.getSeconds() === second
}

function badImportResponse(res: any, message: string, errors: any[]) {
  res.status(400).json({
    success: false,
    error: {
      code: 'BAD_REQUEST',
      message,
      details: { errors },
    },
  })
}

function exceptionMonth(startDate?: string, endDate?: string) {
  return String(endDate || startDate || new Date().toISOString()).slice(0, 7)
}

function reconciliationSourceId(projectId: string, materialId: string, startDate?: string, endDate?: string) {
  return `${projectId}:${materialId}:${startDate || 'all'}:${endDate || 'all'}`
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function toCsv(headers: string[], rows: Array<Array<unknown>>) {
  return [
    headers.map(csvEscape).join(','),
    ...rows.map(row => row.map(csvEscape).join(',')),
  ].join('\n')
}

function normalizeExportType(value?: string) {
  const raw = String(value || 'project')
  if (raw === 'reconcile') return 'project'
  return raw
}

function validateExportType(type: string) {
  return ['project', 'material', 'case', 'log'].includes(type)
}

function buildExportPayload(params: Record<string, string>) {
  const db = getDatabase()
  const type = normalizeExportType(params.type || params.tab)
  const { startDate, endDate, search, projectId, status } = params
  if (!validateExportType(type)) {
    throw Object.assign(new Error('Invalid export type'), { statusCode: 400, code: 'INVALID_PARAMETER' })
  }
  if (!validateDateRange(startDate, endDate)) {
    throw Object.assign(new Error('Invalid date format'), { statusCode: 400, code: 'INVALID_PARAMETER' })
  }

  const hasDate = startDate && endDate
  const endDateTime = hasDate ? `${endDate} 23:59:59` : ''
  const dateSegment = hasDate ? `${startDate}_${endDate}` : new Date().toISOString().slice(0, 10)
  let headers: string[] = []
  let rows: Array<Array<unknown>> = []
  let filename = `reconciliation-${type}-${dateSegment}.csv`

  if (type === 'material') {
    headers = ['物料', '规格', '单位', '关联项目数', '理论消耗', '实际出库', '差异', '差异率', '状态']
    rows = getMaterialReconciliationRows(db, startDate, endDate).map((row: any) => [
      row.materialName,
      row.spec,
      row.unit,
      row.projectCount,
      row.theoryTotal,
      row.actualTotal,
      row.diff,
      `${row.diffRate}%`,
      row.status,
    ])
  } else if (type === 'case') {
    const caseFilter = buildCaseFilterClause({ search, projectId, status, startDate, endDate }, 'lc')
    const caseRows = db.prepare(`
      SELECT lc.case_no, COALESCE(p.name, lc.project_name) as project_name,
             lc.operate_time, lc.operator, lc.status,
             CASE WHEN p.bom_id IS NULL OR p.bom_id = '' THEN '否' ELSE '是' END as has_bom
      FROM lis_cases lc
      LEFT JOIN projects p ON lc.project_id = p.id AND p.is_deleted = 0
      ${caseFilter.where}
      ORDER BY lc.operate_time DESC
    `).all(...caseFilter.params) as any[]
    headers = ['病理号', '检测项目', '操作时间', '操作人', '状态', '是否关联BOM']
    rows = caseRows.map(row => [row.case_no, row.project_name, row.operate_time, row.operator, row.status, row.has_bom])
  } else if (type === 'log') {
    const logRows = db.prepare(`
      SELECT type, target_name, field, old_value, new_value, reason, operator, created_at
      FROM reconciliation_logs
      ${hasDate ? 'WHERE created_at >= ? AND created_at <= ?' : ''}
      ORDER BY created_at DESC
    `).all(...(hasDate ? [startDate, endDateTime] : [])) as any[]
    headers = ['类型', '对象', '字段', '旧值', '新值', '原因', '操作人', '时间']
    rows = logRows.map(row => [row.type, row.target_name, row.field, row.old_value, row.new_value, row.reason, row.operator, row.created_at])
  } else {
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
    headers = ['项目编码', '项目名称', '项目类型', 'LIS病例数', '关联出库数', '是否配置BOM', '物料', '理论消耗', '实际出库', '差异', '差异率', '状态']
    rows = projects.flatMap((project: any) => {
      const { rows: materialRows } = getProjectMaterialReconciliation(db, project.id, startDate, endDate)
      if (materialRows.length === 0) {
        return [[project.code, project.name, project.type, project.case_count, project.outbound_count, project.bom_id ? '是' : '否', '', '', '', '', '', '']]
      }
      return materialRows.map(row => [
        project.code,
        project.name,
        project.type,
        project.case_count,
        project.outbound_count,
        project.bom_id ? '是' : '否',
        row.materialName,
        row.theoryQty,
        row.actualQty,
        row.diff,
        `${row.diffRate}%`,
        row.status,
      ])
    })
    filename = `reconciliation-project-${dateSegment}.csv`
  }

  return {
    filename,
    contentType: 'text/csv;charset=utf-8',
    content: toCsv(headers, rows),
    rowCount: rows.length,
  }
}

function normalizePostExportParams(body: any): Record<string, string> {
  const filters = body?.filters || {}
  return {
    type: normalizeExportType(body?.type || body?.tab),
    startDate: String(filters.startDate || body?.startDate || ''),
    endDate: String(filters.endDate || body?.endDate || ''),
    search: String(filters.search || body?.search || ''),
    projectId: String(filters.projectId || body?.projectId || ''),
    status: String(filters.status || body?.status || ''),
  }
}

function buildCaseFilterClause(filters: {
  search?: string
  projectId?: string
  status?: string
  startDate?: string
  endDate?: string
}, alias = '') {
  const prefix = alias ? `${alias}.` : ''
  let where = 'WHERE 1=1'
  const params: any[] = []

  if (filters.search) {
    where += ` AND (${prefix}case_no LIKE ? OR ${prefix}project_name LIKE ?)`
    params.push(`%${filters.search}%`, `%${filters.search}%`)
  }
  if (filters.projectId) {
    where += ` AND ${prefix}project_id = ?`
    params.push(filters.projectId)
  }
  if (filters.status) {
    where += ` AND ${prefix}status = ?`
    params.push(filters.status)
  }
  if (filters.startDate && filters.endDate) {
    where += ` AND ${prefix}operate_time >= ? AND ${prefix}operate_time <= ?`
    params.push(filters.startDate, `${filters.endDate} 23:59:59`)
  }

  return { where, params }
}

function findProjectForImportedCase(projectsById: Map<string, any>, projectsByNameOrCode: Map<string, any>, item: any) {
  const projectId = String(item.projectId || item.project_id || '').trim()
  if (projectId) {
    return projectsById.get(projectId) || null
  }

  const projectName = String(item.projectName || item.project_name || '').trim()
  if (!projectName) return null
  return projectsByNameOrCode.get(projectName.toLowerCase()) || null
}

const lisHeaderAliases: Record<string, string[]> = {
  caseNo: ['病理号', '病例号', 'case_no', 'caseno', 'case no'],
  projectName: ['检测项目', '项目名称', 'project_name', 'projectname', 'project name'],
  operateTime: ['操作时间', '检测时间', 'operate_time', 'operatetime', 'operate time'],
  operator: ['操作人', 'operator'],
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    const next = line[i + 1]
    if (char === '"') {
      if (quoted && next === '"') {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (char === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  cells.push(current.trim())
  return cells
}

function parseLisLine(line: string) {
  return parseDelimitedLine(line, line.includes('\t') ? '\t' : ',')
}

function normalizeHeader(value: string) {
  return value.trim().replace(/^\ufeff/, '').toLowerCase()
}

function findLisHeaderIndex(headers: string[], key: keyof typeof lisHeaderAliases) {
  const aliases = lisHeaderAliases[key].map(normalizeHeader)
  return headers.findIndex(header => aliases.includes(normalizeHeader(header)))
}

function parseLisImportText(raw: string) {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const firstCells = parseLisLine(lines[0])
  const hasHeader = findLisHeaderIndex(firstCells, 'caseNo') >= 0 && findLisHeaderIndex(firstCells, 'projectName') >= 0
  const indexes = hasHeader
    ? {
        caseNo: findLisHeaderIndex(firstCells, 'caseNo'),
        projectName: findLisHeaderIndex(firstCells, 'projectName'),
        operateTime: findLisHeaderIndex(firstCells, 'operateTime'),
        operator: findLisHeaderIndex(firstCells, 'operator'),
      }
    : { caseNo: 0, projectName: 1, operateTime: 2, operator: 3 }

  return lines.slice(hasHeader ? 1 : 0)
    .map(line => parseLisLine(line))
    .map(cells => ({
      caseNo: indexes.caseNo >= 0 ? String(cells[indexes.caseNo] || '').trim() : '',
      projectName: indexes.projectName >= 0 ? String(cells[indexes.projectName] || '').trim() : '',
      operateTime: indexes.operateTime >= 0 ? String(cells[indexes.operateTime] || '').trim() : '',
      operator: indexes.operator >= 0 ? String(cells[indexes.operator] || '').trim() : '',
    }))
}

function parseLisImportFile(file: Express.Multer.File) {
  const ext = file.originalname.split('.').pop()?.toLowerCase()
  if (ext === 'xlsx' || ext === 'xls') {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' })
    const firstSheet = workbook.SheetNames[0]
    if (!firstSheet) return []
    const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(workbook.Sheets[firstSheet], { header: 1, blankrows: false })
    const text = rows
      .map(row => row.map(cell => String(cell ?? '').trim()).join('\t').trim())
      .filter(Boolean)
      .join('\n')
    return parseLisImportText(text)
  }

  return parseLisImportText(file.buffer.toString('utf8'))
}

function importLisItems(items: any[]) {
  const db = getDatabase()
  const importBatch = `IMPORT-${Date.now()}`

  db.exec('BEGIN IMMEDIATE')
  try {
    const projects = db.prepare("SELECT id, code, name FROM projects WHERE is_deleted = 0").all() as any[]
    const projectsById = new Map(projects.map(p => [p.id, p]))
    const projectsByNameOrCode = new Map<string, any>()
    for (const project of projects) {
      if (project.name) projectsByNameOrCode.set(String(project.name).toLowerCase(), project)
      if (project.code) projectsByNameOrCode.set(String(project.code).toLowerCase(), project)
    }

    const stmt = db.prepare(`
      INSERT INTO lis_cases (id, case_no, project_id, project_name, operator, operate_time, import_batch)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(case_no) DO UPDATE SET
        project_id = CASE
          WHEN excluded.project_id IS NOT NULL AND excluded.project_id != '' THEN excluded.project_id
          ELSE lis_cases.project_id
        END,
        project_name = CASE
          WHEN excluded.project_id IS NOT NULL AND excluded.project_id != '' THEN excluded.project_name
          WHEN lis_cases.project_id IS NOT NULL AND lis_cases.project_id != '' THEN lis_cases.project_name
          ELSE excluded.project_name
        END,
        operator = excluded.operator,
        operate_time = excluded.operate_time,
        updated_at = CURRENT_TIMESTAMP
    `)

    let successCount = 0
    let skippedCount = 0
    let unmatchedCount = 0
    const errors: Array<{ row: number; caseNo?: string; message: string }> = []
    for (const [index, item] of items.entries()) {
      const row = index + 1
      const caseNo = String(item.caseNo || item.case_no || '').trim()
      const projectName = String(item.projectName || item.project_name || '').trim()
      const operateTime = String(item.operateTime || item.operate_time || '').trim()
      const operator = String(item.operator || '').trim()
      if (!caseNo || !projectName || !operateTime) {
        errors.push({
          row,
          caseNo,
          message: !caseNo ? '病理号不能为空' : !projectName ? '检测项目不能为空' : '检测时间不能为空',
        })
        skippedCount++
        continue
      }
      if (!validateLisOperateTime(operateTime)) {
        errors.push({ row, caseNo, message: '检测时间格式错误，应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss' })
        skippedCount++
        continue
      }

      const explicitProjectId = String(item.projectId || item.project_id || '').trim()
      const project = findProjectForImportedCase(projectsById, projectsByNameOrCode, { ...item, projectName })
      if (explicitProjectId && !project) {
        errors.push({ row, caseNo, message: '指定检测项目不存在' })
        skippedCount++
        continue
      }
      if (!project) unmatchedCount++
      stmt.run(
        uuidv4(),
        caseNo,
        project?.id || '',
        project?.name || projectName,
        operator,
        operateTime,
        importBatch
      )
      successCount++
    }

    if (successCount === 0) {
      db.exec('ROLLBACK')
      return { ok: false as const, message: '未找到有效病例数据', errors }
    }

    db.exec('COMMIT')
    const message = skippedCount > 0
      ? `成功导入 ${successCount} 条病例数据，跳过 ${skippedCount} 条无效项目`
      : `成功导入 ${successCount} 条病例数据`
    return {
      ok: true as const,
      message,
      data: {
        importBatch,
        count: successCount,
        skipped: skippedCount,
        unmatched: unmatchedCount,
        imported: successCount,
        failed: skippedCount,
        errors,
      },
    }
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

function getProjectMaterialReconciliation(db: any, projectId: string, startDate?: string, endDate?: string) {
  if (!validateDateRange(startDate, endDate)) {
    throw new Error('Invalid date format')
  }

  const hasDate = startDate && endDate
  const dateParams: any[] = hasDate ? [startDate, `${endDate} 23:59:59`] : []

  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND is_deleted = 0').get(projectId) as any
  if (!project) return { project: null, rows: [] }

  const bomItems = db.prepare(`
    SELECT bi.*, m.name as material_name, m.spec, m.unit as material_unit, m.price
    FROM bom_items bi
    JOIN materials m ON bi.material_id = m.id
    WHERE bi.bom_id = ?
  `).all(project.bom_id || '') as any[]

  const caseCount = db.prepare(`
    SELECT COUNT(*) as count FROM lis_cases
    WHERE project_id = ? ${hasDate ? 'AND operate_time >= ? AND operate_time <= ?' : ''}
  `).get(projectId, ...dateParams) as any

  const cases = caseCount?.count || 0

  const actualOutbounds = db.prepare(`
    SELECT oi.material_id, SUM(oi.quantity) as total_qty, m.unit, m.name, m.spec
    FROM outbound_items oi
    JOIN outbound_records o ON oi.outbound_id = o.id
    JOIN materials m ON oi.material_id = m.id
    WHERE o.project_id = ? AND o.status = 'completed' AND o.is_deleted = 0 ${hasDate ? 'AND o.created_at >= ? AND o.created_at <= ?' : ''}
    GROUP BY oi.material_id
  `).all(projectId, ...dateParams) as any[]

  const rows = bomItems.map((bi: any) => {
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

  return { project, rows }
}

function getMaterialReconciliationRows(db: any, startDate?: string, endDate?: string) {
  const hasDate = startDate && endDate
  const endDateTime = hasDate ? `${endDate} 23:59:59` : ''

  const allBomUsages = db.prepare(`
    SELECT bi.material_id, bi.usage_per_sample, bi.unit, p.id as project_id
    FROM bom_items bi
    JOIN projects p ON bi.bom_id = p.bom_id
    WHERE p.is_deleted = 0
  `).all() as any[]

  const bomUsagesByMaterial = new Map<string, any[]>()
  for (const bu of allBomUsages) {
    const existing = bomUsagesByMaterial.get(bu.material_id) || []
    existing.push(bu)
    bomUsagesByMaterial.set(bu.material_id, existing)
  }

  const caseCountsByProject = new Map<string, number>()
  if (hasDate) {
    const rows = db.prepare(`
      SELECT project_id, COUNT(*) as count FROM lis_cases
      WHERE operate_time >= ? AND operate_time <= ?
      GROUP BY project_id
    `).all(startDate, endDateTime) as any[]
    for (const r of rows) caseCountsByProject.set(r.project_id, r.count)
  } else {
    const rows = db.prepare(`
      SELECT project_id, COUNT(*) as count FROM lis_cases
      GROUP BY project_id
    `).all() as any[]
    for (const r of rows) caseCountsByProject.set(r.project_id, r.count)
  }

  const actualOutboundRows = hasDate
    ? (db.prepare(`
        SELECT oi.material_id, SUM(oi.quantity) as total_qty
        FROM outbound_items oi
        JOIN outbound_records o ON oi.outbound_id = o.id
        WHERE o.status = 'completed' AND o.is_deleted = 0 AND o.created_at >= ? AND o.created_at <= ?
        GROUP BY oi.material_id
      `).all(startDate, endDateTime) as any[])
    : (db.prepare(`
        SELECT oi.material_id, SUM(oi.quantity) as total_qty
        FROM outbound_items oi
        JOIN outbound_records o ON oi.outbound_id = o.id
        WHERE o.status = 'completed' AND o.is_deleted = 0
        GROUP BY oi.material_id
      `).all() as any[])

  const actualOutboundsByMaterial = new Map<string, number>()
  for (const row of actualOutboundRows) actualOutboundsByMaterial.set(row.material_id, row.total_qty || 0)

  const materialIdsToExplain = new Set<string>()
  for (const usage of allBomUsages) {
    if ((caseCountsByProject.get(usage.project_id) || 0) > 0) {
      materialIdsToExplain.add(usage.material_id)
    }
  }
  for (const row of actualOutboundRows) {
    if (row.material_id) materialIdsToExplain.add(row.material_id)
  }
  const materialIds = Array.from(materialIdsToExplain)
  const historicalFilter = materialIds.length > 0
    ? ` OR m.id IN (${materialIds.map(() => '?').join(',')})`
    : ''

  const materials = db.prepare(`
    SELECT m.id, m.name, m.spec, m.unit, m.price,
      (SELECT COUNT(DISTINCT p.id) FROM projects p
        JOIN bom_items bi ON bi.bom_id = p.bom_id
        WHERE bi.material_id = m.id AND p.is_deleted = 0
      ) as project_count
    FROM materials m
    WHERE (m.is_deleted = 0 AND m.status = 1)${historicalFilter}
    ORDER BY m.name
  `).all(...materialIds) as any[]

  return materials.map((m: any) => {
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
    if (diff < -theoryTotal * 0.2) status = 'warn'

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
}

/**
 * GET /api/v1/reconciliation/summary
 * 获取对账汇总数据（顶部统计卡片）
 */
router.get('/summary', (req, res) => {
  try {
    const db = getDatabase()
    const { startDate, endDate } = req.query as Record<string, string>

    if (!validateDateRange(startDate, endDate)) {
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
      WHERE o.project_id IS NOT NULL AND o.project_id != '' AND o.status = 'completed' AND o.is_deleted = 0
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
 * GET /api/v1/reconciliation/export
 * 导出对账报表 CSV
 */
router.get('/export', (req, res) => {
  try {
    success(res, buildExportPayload(req.query as Record<string, string>))
  } catch (e: any) {
    error(res, e.message || '导出对账报表失败', e.code, e.statusCode)
  }
})

/**
 * POST /api/v1/reconciliation/export
 * 导出对账报表文件流
 */
router.post('/export', (req, res) => {
  try {
    const payload = buildExportPayload(normalizePostExportParams(req.body || {}))
    res.setHeader('Content-Type', payload.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${payload.filename}"`)
    res.send(`\ufeff${payload.content}`)
  } catch (e: any) {
    error(res, e.message || '导出对账报表失败', e.code, e.statusCode)
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

    if (!validateDateRange(startDate, endDate)) {
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

    if (!validateDateRange(startDate, endDate)) {
      error(res, 'Invalid date format', 'INVALID_PARAMETER', 400); return
    }

    const { project, rows } = getProjectMaterialReconciliation(db, projectId, startDate, endDate)
    if (!project) {
      return error(res, '项目不存在', 'NOT_FOUND', 404)
    }

    successList(res, rows, 1, rows.length, rows.length)
  } catch (e: any) {
    error(res, e.message || '获取项目物料对账失败')
  }
})

/**
 * POST /api/v1/reconciliation/projects/:id/materials/audit
 * 将项目物料对账差异写入成本异常台账
 */
router.post('/projects/:id/materials/audit', (req, res) => {
  try {
    const db = getDatabase()
    const projectId = req.params.id
    const { startDate, endDate } = req.body || {}
    const { project, rows } = getProjectMaterialReconciliation(db, projectId, startDate, endDate)
    if (!project) {
      return error(res, '项目不存在', 'NOT_FOUND', 404)
    }

    const yearMonth = exceptionMonth(startDate, endDate)
    const operator = (req as any).user?.username || 'system'
    let created = 0
    let updated = 0
    let resolved = 0
    const exceptions: any[] = []

    db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of rows) {
        const sourceId = reconciliationSourceId(projectId, row.materialId, startDate, endDate)
        const existing = db.prepare(`
          SELECT * FROM cost_exceptions
          WHERE source_module = 'reconciliation'
            AND source_type = 'project_material'
            AND source_id = ?
            AND exception_type = 'reconciliation_variance'
            AND status = 'open'
        `).get(sourceId) as any

        if (row.status === 'match') {
          if (existing) {
            db.prepare(`
              UPDATE cost_exceptions
              SET status = 'resolved', resolved_by = ?, resolved_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `).run(operator, existing.id)
            resolved += 1
          }
          continue
        }

        const severity = row.status === 'danger' ? 'error' : 'warning'
        const message = `${project.name || project.project_name || '项目'} / ${row.materialName} 对账差异 ${row.diff} ${row.actualUnit || row.bomUnit || ''}`.trim()
        const details = {
          projectId,
          projectName: project.name,
          materialId: row.materialId,
          materialName: row.materialName,
          theoryQty: row.theoryQty,
          actualQty: row.actualQty,
          diff: row.diff,
          diffRate: row.diffRate,
          status: row.status,
          startDate: startDate || null,
          endDate: endDate || null,
        }

        if (existing) {
          db.prepare(`
            UPDATE cost_exceptions
            SET severity = ?, message = ?, details = ?, year_month = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(severity, message, JSON.stringify(details), yearMonth, existing.id)
          updated += 1
          exceptions.push({ id: existing.id, exceptionNo: existing.exception_no, materialId: row.materialId, status: row.status })
        } else {
          const record = recordCostException(db, {
            sourceModule: 'reconciliation',
            sourceType: 'project_material',
            sourceId,
            projectId,
            bomId: project.bom_id || null,
            yearMonth,
            exceptionType: 'reconciliation_variance',
            severity,
            message,
            details,
          })
          created += 1
          exceptions.push({ ...record, materialId: row.materialId, status: row.status })
        }
      }
      db.exec('COMMIT')
    } catch (innerErr) {
      db.exec('ROLLBACK')
      throw innerErr
    }

    success(res, {
      total: rows.length,
      warningCount: rows.filter(row => row.status === 'warn').length,
      dangerCount: rows.filter(row => row.status === 'danger').length,
      created,
      updated,
      resolved,
      exceptions,
    }, '对账差异审计完成')
  } catch (e: any) {
    if (e.message === 'Invalid date format') {
      error(res, 'Invalid date format', 'INVALID_PARAMETER', 400); return
    }
    error(res, e.message || '对账差异审计失败')
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
    if (!validateDateRange(startDate, endDate)) {
      error(res, 'Invalid date format', 'INVALID_PARAMETER', 400); return
    }
    const result = getMaterialReconciliationRows(db, startDate, endDate)

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
    const { page = '1', pageSize = '20', search, projectId, status, startDate, endDate } = req.query as Record<string, string>
    if (!validateDateRange(startDate, endDate)) {
      error(res, 'Invalid date format', 'INVALID_PARAMETER', 400); return
    }

    const pageNum = parsePaginationParam(page, 1)
    const safePageSize = parsePaginationParam(pageSize, 20)
    if (!pageNum || !safePageSize) {
      error(res, 'Invalid pagination parameter', 'INVALID_PARAMETER', 400); return
    }
    const offset = (pageNum - 1) * safePageSize
    const filters = { search, projectId, status, startDate, endDate }
    const plainFilter = buildCaseFilterClause(filters)
    const joinFilter = buildCaseFilterClause(filters, 'lc')

    const list = db.prepare(`
      SELECT lc.*, p.name as joined_project_name, p.bom_id as joined_bom_id
      FROM lis_cases lc
      LEFT JOIN projects p ON lc.project_id = p.id AND p.is_deleted = 0
      ${joinFilter.where}
      ORDER BY lc.operate_time DESC
      LIMIT ? OFFSET ?
    `).all(...joinFilter.params, safePageSize, offset) as any[]

    const count = (db.prepare(`SELECT COUNT(*) as count FROM lis_cases ${plainFilter.where}`).get(...plainFilter.params) as any)?.count || 0

    const result = list.map((c: any) => {
      return {
        ...c,
        caseNo: c.case_no,
        projectId: c.project_id,
        projectName: c.joined_project_name || c.project_name || '-',
        bomId: c.joined_bom_id || null,
        hasBom: !!c.joined_bom_id,
        operateTime: c.operate_time,
        importBatch: c.import_batch,
        createdAt: c.created_at,
      }
    })

    successList(res, result, pageNum, safePageSize, count)
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
    const { items } = req.body as { items: any[] }

    if (!Array.isArray(items) || items.length === 0) {
      return error(res, '导入数据为空', 'BAD_REQUEST', 400)
    }

    const result = importLisItems(items)
    if (!result.ok) {
      return badImportResponse(res, result.message, result.errors)
    }
    success(res, result.data, result.message)
  } catch (e: any) {
    error(res, e.message || '导入失败')
  }
})

/**
 * POST /api/v1/reconciliation/import-lis
 * 上传 LIS 文件并导入病例数据
 */
router.post('/import-lis', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return error(res, '请上传LIS数据文件', 'BAD_REQUEST', 400)
    }
    const items = parseLisImportFile(req.file)
    if (items.length === 0) {
      return badImportResponse(res, '未找到有效病例数据', [])
    }
    const result = importLisItems(items)
    if (!result.ok) {
      return badImportResponse(res, result.message, result.errors)
    }
    success(res, result.data, result.message)
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
    let nextProjectName = projectName
    if (projectId) {
      const project = db.prepare('SELECT id, name FROM projects WHERE id = ? AND is_deleted = 0').get(projectId) as any
      if (!project) { error(res, '项目不存在', 'NOT_FOUND', 404); return }
      nextProjectName = projectName || project.name
    }

    db.prepare(`
      UPDATE lis_cases SET
        project_id = COALESCE(?, project_id),
        project_name = COALESCE(?, project_name),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(projectId, nextProjectName, status, id)

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
    const { page = '1', pageSize = '20', startDate, endDate } = req.query as Record<string, string>
    if (!validateDateRange(startDate, endDate)) {
      error(res, 'Invalid date format', 'INVALID_PARAMETER', 400); return
    }

    const pageNum = parsePaginationParam(page, 1)
    const safePageSize = parsePaginationParam(pageSize, 20)
    if (!pageNum || !safePageSize) {
      error(res, 'Invalid pagination parameter', 'INVALID_PARAMETER', 400); return
    }

    const offset = (pageNum - 1) * safePageSize
    const hasDate = startDate && endDate
    const where = hasDate ? 'WHERE created_at >= ? AND created_at <= ?' : ''
    const params = hasDate ? [startDate, `${endDate} 23:59:59`] : []

    const list = db.prepare(`
      SELECT * FROM reconciliation_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, safePageSize, offset) as any[]

    const count = db.prepare(`SELECT COUNT(*) as count FROM reconciliation_logs ${where}`).get(...params) as any

    successList(res, list, pageNum, safePageSize, count?.count || 0)
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
    const { type, targetId, targetName, field, oldValue, newValue, reason, projectId, materialId, newUsage, newUnit } = req.body

    db.exec('BEGIN IMMEDIATE')
    try {
      // 如果提供了projectId、materialId和newUsage，先更新bom_items
      if (projectId && materialId && newUsage !== undefined) {
        const usage = Number(newUsage)
        if (!Number.isFinite(usage) || usage <= 0) {
          db.exec('ROLLBACK')
          error(res, 'newUsage 必须大于0', 'INVALID_PARAMETER', 400); return
        }
        const project = db.prepare('SELECT bom_id FROM projects WHERE id = ? AND is_deleted = 0').get(projectId) as any
        if (!project?.bom_id) {
          db.exec('ROLLBACK')
          error(res, '项目未关联BOM', 'INVALID_PARAMETER', 400); return
        }
        const result = db.prepare(`
          UPDATE bom_items
          SET usage_per_sample = ?, unit = COALESCE(?, unit)
          WHERE bom_id = ? AND material_id = ?
        `).run(usage, newUnit || null, project.bom_id, materialId)
        if (result.changes === 0) {
          db.exec('ROLLBACK')
          error(res, 'BOM物料不存在', 'NOT_FOUND', 404); return
        }
      }

      const id = uuidv4()
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
