import { Router } from 'express'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'

const router = Router()

function parseJsonField(value: unknown) {
  if (!value || typeof value !== 'string') return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

const MODULE_PATTERNS: Record<string, string[]> = {
  inventory: ['inventory', '库存'],
  inbound: ['inbound', '/inbound', '入库'],
  outbound: ['outbound', '/outbound', '出库'],
  stocktaking: ['stocktaking', '/stocktaking', '盘点'],
  returns: ['/returns', 'return_records', '退库'],
  scraps: ['scraps', '/scraps', 'scrap', '报废'],
  transfers: ['transfers', '/transfers', 'transfer', '调拨'],
  supplier_returns: ['supplier_return', 'supplier-returns', '/supplier-returns', '供应商退货'],
  purchase_orders: ['purchase-orders', 'purchase_order', '采购订单'],
  suppliers: ['suppliers', '/suppliers', 'supplier_update', '供应商'],
  categories: ['categories', '/categories', 'category', '分类'],
  materials: ['materials', '/materials', 'material', '物料', '耗材'],
  locations: ['locations', '/locations', 'location', '库位'],
  projects: ['projects', '/projects', 'project', '检测项目'],
  bom: ['boms', '/boms', 'bom', '清单'],
  alerts: ['alerts', '/alerts', 'alert', '预警'],
  reconciliation: ['reconciliation', '/reconciliation', '对账'],
  equipment: ['equipment-types', 'equipment', '/equipment', '设备'],
  labor: ['labor-times', 'labor', '工时'],
  indirect_costs: ['indirect-costs', 'indirect_cost', '间接成本'],
  user: ['users', '/users', 'user', '用户'],
  role: ['roles', '/roles', 'role', '角色'],
  cost: ['abc', '/abc', 'cost', '成本'],
  system: ['system', '系统'],
}

const MODULE_MATCH_ORDER = [
  'supplier_returns',
  'purchase_orders',
  'indirect_costs',
  'stocktaking',
  'reconciliation',
  'equipment',
  'materials',
  'locations',
  'categories',
  'transfers',
  'returns',
  'scraps',
  'inbound',
  'outbound',
  'inventory',
  'suppliers',
  'projects',
  'alerts',
  'labor',
  'user',
  'role',
  'bom',
  'cost',
  'system',
]

function textMatchesAny(text: string, patterns: string[]) {
  return patterns.some(pattern => text.includes(pattern))
}

function inferModule(row: any) {
  const requestData = parseJsonField(row.request_data)
  const explicit = requestData?.module || requestData?.sourceModule
  if (explicit) return String(explicit)

  const operation = String(row.operation || '').toLowerCase()
  const description = String(row.description || '').toLowerCase()
  const text = `${operation} ${description}`
  for (const moduleName of MODULE_MATCH_ORDER) {
    if (textMatchesAny(text, MODULE_PATTERNS[moduleName] || [])) return moduleName
  }
  return 'system'
}

function inferType(operation: string) {
  const lower = String(operation || '').toLowerCase()
  if (lower.includes('login')) return 'login'
  if (lower.includes('logout')) return 'logout'
  if (lower.includes('create') || lower.includes('add') || lower.startsWith('post ')) return 'create'
  if (lower.includes('update') || lower.includes('edit') || lower.includes('status') || lower.startsWith('put ') || lower.startsWith('patch ')) return 'update'
  if (lower.includes('delete') || lower.includes('remove') || lower.startsWith('delete ')) return 'delete'
  if (lower.includes('export')) return 'export'
  if (lower.includes('import')) return 'import'
  return 'other'
}

function mapLogRow(row: any) {
  const requestData = parseJsonField(row.request_data)
  const responseData = parseJsonField(row.response_data)
  const module = inferModule(row)
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    operation: row.operation,
    operationType: inferType(row.operation),
    module,
    description: row.description,
    requestData,
    responseData,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  }
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isValidDateOnly(value: string) {
  if (!DATE_ONLY_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
}

function validateDateRangeInput(source: any) {
  const startDate = String(source?.startDate || '').trim()
  const endDate = String(source?.endDate || '').trim()
  if (startDate && !isValidDateOnly(startDate)) {
    return { valid: false, message: '开始日期格式必须为 YYYY-MM-DD' }
  }
  if (endDate && !isValidDateOnly(endDate)) {
    return { valid: false, message: '结束日期格式必须为 YYYY-MM-DD' }
  }
  if (startDate && endDate && startDate > endDate) {
    return { valid: false, message: '开始日期不能晚于结束日期' }
  }
  return { valid: true, message: '' }
}

function buildLogWhere(query: any, includeDate = true) {
  const { startDate, endDate, userId, username, keyword, type, module } = query
  let where = '1=1'
  const params: any[] = []
  if (includeDate && startDate) { where += ' AND created_at >= ?'; params.push(startDate) }
  if (includeDate && endDate) { where += ' AND created_at <= ?'; params.push(`${endDate}T23:59:59`) }
  if (userId) { where += ' AND user_id = ?'; params.push(userId) }
  if (username) { where += ' AND username = ?'; params.push(username) }
  if (keyword) {
    where += ' AND (operation LIKE ? OR description LIKE ? OR username LIKE ? OR request_data LIKE ? OR response_data LIKE ?)'
    const like = `%${keyword}%`
    params.push(like, like, like, like, like)
  }
  if (type) {
    const patterns: Record<string, string[]> = {
      login: ['%login%'],
      logout: ['%logout%'],
      create: ['%create%', '%add%', 'post %'],
      update: ['%update%', '%edit%', '%status%', 'put %', 'patch %'],
      delete: ['%delete%', '%remove%', 'delete %'],
      export: ['%export%'],
      import: ['%import%'],
    }
    const values = patterns[String(type)] || []
    if (values.length > 0) {
      where += ` AND (${values.map(() => 'LOWER(operation) LIKE ?').join(' OR ')})`
      params.push(...values)
    }
  }
  if (module) {
    const value = String(module)
    if (value === 'suppliers') {
      where += `
        AND (LOWER(operation) LIKE ? OR description LIKE ? OR request_data LIKE ?)
        AND LOWER(operation) NOT LIKE ?
        AND description NOT LIKE ?
        AND request_data NOT LIKE ?
      `
      params.push('%supplier%', '%供应商%', '%"module":"suppliers"%', '%supplier_return%', '%供应商退货%', '%supplier_return%')
      return { where, params }
    }
    const values = (MODULE_PATTERNS[value] || [value]).map(pattern => `%${pattern}%`)
    where += ` AND (${values.map(() => '(LOWER(operation) LIKE ? OR description LIKE ? OR request_data LIKE ?)').join(' OR ')})`
    params.push(...values.flatMap(pattern => [pattern, pattern, pattern]))
  }
  return { where, params }
}

function csvEscape(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function truthyExportOption(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback
  if (typeof value === 'boolean') return value
  return String(value) === 'true'
}

function getExportOptions(input: any) {
  return {
    includeBasic: truthyExportOption(input.includeBasic, true),
    includeDetail: truthyExportOption(input.includeDetail, true),
    includeIP: truthyExportOption(input.includeIP, true),
    includeDiff: truthyExportOption(input.includeDiff, true),
  }
}

function toCsv(rows: any[], options = getExportOptions({})) {
  const columns: Array<{ header: string; value: (row: any) => unknown }> = []
  if (options.includeBasic) {
    columns.push(
      { header: '操作时间', value: row => row.createdAt },
      { header: '用户', value: row => row.username },
      { header: '操作类型', value: row => row.operationType },
      { header: '模块', value: row => row.module },
    )
  }
  if (options.includeDetail) {
    columns.push(
      { header: '操作', value: row => row.operation },
      { header: '描述', value: row => row.description },
    )
  }
  if (options.includeIP) {
    columns.push(
      { header: 'IP地址', value: row => row.ip },
      { header: '设备信息', value: row => row.userAgent },
    )
  }
  if (options.includeDiff) {
    columns.push(
      { header: '请求数据', value: row => row.requestData ? JSON.stringify(row.requestData) : '' },
      { header: '响应数据', value: row => row.responseData ? JSON.stringify(row.responseData) : '' },
    )
  }
  if (columns.length === 0) {
    columns.push({ header: '操作时间', value: row => row.createdAt })
  }

  const headers = columns.map(column => column.header)
  const body = rows.map(row => columns.map(column => column.value(row)))
  return [headers, ...body].map(line => line.map(csvEscape).join(',')).join('\n')
}

function exportFilename() {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `logs_${date}_${time}.csv`
}

function getOperationLogs(req: any, res: any) {
  try {
    const { page = 1, pageSize = 20 } = req.query
    const dateValidation = validateDateRangeInput(req.query)
    if (!dateValidation.valid) {
      error(res, dateValidation.message, 'INVALID_PARAMETER', 400)
      return
    }

    const db = getDatabase()
    const { where, params } = buildLogWhere(req.query)

    const count = (db.prepare(`SELECT COUNT(*) as total FROM operation_logs WHERE ${where}`).get(...params) as any)?.total || 0
    const pageNum = Math.max(1, Number(page))
    const safePageSize = Math.max(1, Math.min(10000, Number(pageSize)))
    const offset = (pageNum - 1) * safePageSize
    const list = db.prepare(`SELECT * FROM operation_logs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, safePageSize, offset) as any[]

    successList(res, list.map(mapLogRow), pageNum, safePageSize, count)
  } catch (err: any) { error(res, err.message) }
}

router.get('/', getOperationLogs)
router.get('/operation', getOperationLogs)

router.get('/stats', (req, res) => {
  try {
    const db = getDatabase()
    const today = new Date().toISOString().slice(0, 10)
    const todayOps = (db.prepare("SELECT COUNT(*) as total FROM operation_logs WHERE created_at >= ?").get(today) as any)?.total || 0
    const loginCount = (db.prepare("SELECT COUNT(*) as total FROM operation_logs WHERE LOWER(operation) LIKE '%login%'").get() as any)?.total || 0
    const dataChanges = (db.prepare(`
      SELECT COUNT(*) as total FROM operation_logs
      WHERE LOWER(operation) LIKE '%create%'
         OR LOWER(operation) LIKE '%add%'
         OR LOWER(operation) LIKE 'post %'
         OR LOWER(operation) LIKE '%update%'
         OR LOWER(operation) LIKE '%edit%'
         OR LOWER(operation) LIKE 'put %'
         OR LOWER(operation) LIKE 'patch %'
         OR LOWER(operation) LIKE '%delete%'
         OR LOWER(operation) LIKE '%remove%'
         OR LOWER(operation) LIKE 'delete %'
         OR LOWER(operation) LIKE '%status%'
    `).get() as any)?.total || 0
    const activeUsers = (db.prepare('SELECT COUNT(DISTINCT username) as total FROM operation_logs WHERE username IS NOT NULL AND username != ?').get('') as any)?.total || 0
    success(res, { todayOps, loginCount, dataChanges, activeUsers })
  } catch (err: any) { error(res, err.message) }
})

function exportLogs(req: any, res: any, source: any) {
  try {
    const dateValidation = validateDateRangeInput(source)
    if (!dateValidation.valid) {
      error(res, dateValidation.message, 'INVALID_PARAMETER', 400)
      return
    }

    const db = getDatabase()
    const { where, params } = buildLogWhere(source)
    const rows = db.prepare(`SELECT * FROM operation_logs WHERE ${where} ORDER BY created_at DESC LIMIT 10000`).all(...params) as any[]
    const content = `\ufeff${toCsv(rows.map(mapLogRow), getExportOptions(source))}`
    res.setHeader('Content-Type', 'text/csv;charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${exportFilename()}"`)
    res.send(content)
  } catch (err: any) { error(res, err.message) }
}

router.get('/export', (req, res) => {
  exportLogs(req, res, req.query)
})

router.post('/export', (req, res) => {
  exportLogs(req, res, req.body || {})
})

router.delete('/', (req: any, res) => {
  try {
    if (req.user?.role !== 'admin') {
      error(res, 'Forbidden: admin only', 'FORBIDDEN', 403)
      return
    }

    const beforeDate = String(req.query.beforeDate || '').trim()
    if (!beforeDate || !isValidDateOnly(beforeDate)) {
      error(res, 'beforeDate required and must be YYYY-MM-DD', 'INVALID_PARAMETER', 400)
      return
    }

    const db = getDatabase()
    db.exec('BEGIN IMMEDIATE')
    try {
      const result = db.prepare('DELETE FROM operation_logs WHERE created_at < ?').run(`${beforeDate}T00:00:00`)
      db.exec('COMMIT')
      success(res, { deletedCount: Number(result.changes || 0), beforeDate }, 'Logs cleaned')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
