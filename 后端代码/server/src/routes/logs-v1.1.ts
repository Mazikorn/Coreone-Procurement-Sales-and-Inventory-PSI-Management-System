import { Router } from 'express'
import { createHash, createHmac, randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { getDatabase } from '../database/DatabaseManager.js'
import { success, successList, error } from '../utils/response.js'
import { logOperation } from '../utils/operation-logger.js'

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
  equipment_types: ['equipment-types', '/equipment/types', '设备类型'],
  equipment: ['equipment', '/equipment', '设备'],
  labor: ['labor-times', 'labor', '工时'],
  indirect_costs: ['indirect-costs', 'indirect_cost', '间接成本'],
  budget: ['budget', 'budgets', '成本预算', '预算'],
  quality_cost: ['quality_cost', 'quality-costs', 'quality cost', '质量成本'],
  user: ['users', '/users', 'user', '用户'],
  role: ['roles', '/roles', 'role', '角色'],
  logs: ['logs', '/logs', 'operation_logs', '操作日志'],
  cost: ['abc', '/abc', 'cost', '成本'],
  system: ['system', '系统'],
}

const LOG_TYPES = new Set(['login', 'logout', 'create', 'update', 'delete', 'export', 'import'])
const LOG_MODULES = new Set(Object.keys(MODULE_PATTERNS))
const UNIFIED_SOURCE_TYPES = new Set(['all', 'operation', 'stock', 'batch_location', 'abc', 'reconciliation'])
const LOG_CLEAN_MIN_RETENTION_DAYS = 180
const ARCHIVE_REPORT_SIGNATURE_ALGORITHM = 'HMAC-SHA256'
const ARCHIVE_REPORT_HASH_PAYLOAD = 'JSON.stringify({ reportType, generatedAt, generatedBy, retentionPolicy, verification, archives })'
const BUSINESS_ROUTE_BY_MODULE: Record<string, string> = {
  inventory: '/inventory',
  inbound: '/inbound',
  outbound: '/outbound',
  stocktaking: '/stocktaking',
  returns: '/returns',
  scraps: '/scraps',
  transfers: '/transfers',
  supplier_returns: '/supplier-returns',
  purchase_orders: '/purchase-orders',
  suppliers: '/suppliers',
  categories: '/categories',
  materials: '/materials',
  locations: '/locations',
  projects: '/projects',
  bom: '/bom',
  reconciliation: '/reconciliation',
  cost: '/abc/audit',
  abc_cost_pools: '/abc/cost-pools',
  cost_pool: '/abc/cost-pools',
  activity_center: '/abc/activity-centers',
  cost_driver: '/abc/cost-drivers',
  bom_fee_mapping: '/abc/fee-mappings',
  exception: '/abc/alerts',
  cost_adjustment: '/abc/dashboard',
  cost_run: '/abc/dashboard',
  period: '/abc/dashboard',
  budget: '/abc/budgets',
  quality_cost: '/abc/quality-costs',
  equipment_types: '/equipment/types',
  equipment: '/equipment',
  labor: '/labor-times',
  user: '/users',
  role: '/roles',
  logs: '/logs',
}

const MODULE_MATCH_ORDER = [
  'supplier_returns',
  'purchase_orders',
  'indirect_costs',
  'stocktaking',
  'reconciliation',
  'equipment_types',
  'equipment',
  'quality_cost',
  'budget',
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
  'logs',
  'bom',
  'cost',
  'system',
]

const MODULE_ALIASES: Record<string, string> = {
  inbound_records: 'inbound',
  outbound_records: 'outbound',
  stocktaking_records: 'stocktaking',
  return_records: 'returns',
  scrap_records: 'scraps',
  supplier_return: 'supplier_returns',
  supplier_return_cancel: 'supplier_returns',
  supplier_returns: 'supplier_returns',
  purchase_order: 'purchase_orders',
  purchase_orders: 'purchase_orders',
}

const BUSINESS_DOCUMENT_FIELDS = [
  'documentNo',
  'inboundNo',
  'outboundNo',
  'stocktakingNo',
  'returnNo',
  'scrapNo',
  'orderNo',
  'purchaseOrderNo',
  'adjustmentNo',
  'exceptionNo',
  'runId',
]

function textMatchesAny(text: string, patterns: string[]) {
  return patterns.some(pattern => text.includes(pattern))
}

function normalizeLogModule(value: unknown) {
  const moduleName = String(value || '').trim()
  return MODULE_ALIASES[moduleName] || moduleName
}

function inferModule(row: any) {
  const requestData = parseJsonField(row.request_data)
  const explicit = requestData?.module || requestData?.sourceModule
  if (explicit) return normalizeLogModule(explicit)

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
  if (lower.includes('create') || lower.includes('add') || lower.includes('inbound') || lower.startsWith('post ')) return 'create'
  if (lower.includes('update') || lower.includes('edit') || lower.includes('status') || lower.includes('adjust') || lower.includes('stocktaking') || lower.includes('recalculate') || lower.startsWith('put ') || lower.startsWith('patch ')) return 'update'
  if (lower.includes('delete') || lower.includes('remove') || lower.startsWith('delete ')) return 'delete'
  if (lower.includes('export')) return 'export'
  if (lower.includes('import')) return 'import'
  return 'other'
}

function buildBusinessUrl(module: string, businessId: unknown, detail?: any, options?: { includeDeleted?: boolean }) {
  const route = BUSINESS_ROUTE_BY_MODULE[module]
  const value = String(businessId || '').trim()
  if (!route || !value) return ''
  if (module === 'cost_adjustment' || module === 'cost_run') {
    const month = String(detail?.yearMonth || detail?.year_month || '').slice(0, 7)
    const params = new URLSearchParams()
    if (month) params.set('month', month)
    params.set('keyword', value)
    return `${route}?${params.toString()}`
  }
  if (module === 'period') {
    const month = String(detail?.yearMonth || detail?.year_month || value || '').slice(0, 7)
    const params = new URLSearchParams()
    if (month) params.set('month', month)
    return params.toString() ? `${route}?${params.toString()}` : route
  }
  const params = new URLSearchParams()
  params.set('keyword', value)
  if (options?.includeDeleted) params.set('includeDeleted', 'true')
  return `${route}?${params.toString()}`
}

function buildAuditEvent(input: {
  sourceType: string
  evidenceSource: string
  module: string
  operationType: string
  actor?: unknown
  businessId?: unknown
  businessUrl?: string
  affectedBusinessIds?: string[]
  affectedBusinessUrls?: string[]
  summary?: unknown
  occurredAt?: unknown
}) {
  const sourceType = String(input.sourceType || 'operation')
  const module = String(input.module || 'system')
  const action = String(input.operationType || 'other')
  const actor = String(input.actor || '')
  const businessId = String(input.businessId || '')
  const subjectType = module
  const subjectId = businessId
  return {
    eventCode: `${sourceType}.${module}.${action}`,
    action,
    subjectType,
    subjectId,
    businessId,
    businessUrl: input.businessUrl || '',
    affectedSubjectIds: input.affectedBusinessIds || (businessId ? [businessId] : []),
    affectedBusinessIds: input.affectedBusinessIds || (businessId ? [businessId] : []),
    affectedBusinessUrls: input.affectedBusinessUrls || (input.businessUrl ? [input.businessUrl] : []),
    actor,
    responsibility: actor ? `${actor} 对 ${subjectType} 的 ${action} 事件负责` : '未记录责任人',
    evidenceSource: input.evidenceSource,
    occurredAt: input.occurredAt || '',
    summary: String(input.summary || ''),
  }
}

function normalizeBusinessIds(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)))
}

function getFirstBusinessDocumentId(...sources: any[]) {
  for (const source of sources) {
    if (!source) continue
    for (const field of BUSINESS_DOCUMENT_FIELDS) {
      const value = source[field]
      if (value !== undefined && value !== null && String(value).trim()) {
        return String(value).trim()
      }
    }
  }
  return ''
}

function getOperationLogBusinessIds(row: any, requestData: any, responseData: any) {
  const method = String(requestData?.method || '').toUpperCase()
  const batchIds = normalizeBusinessIds(requestData?.body?.ids || requestData?.ids)
  if (batchIds.length > 0) return batchIds
  if (requestData?.businessId) return [String(requestData.businessId)]
  if (requestData?.documentNo) return [String(requestData.documentNo)]
  if (requestData?.body?.businessId) return [String(requestData.body.businessId)]
  if (requestData?.body?.documentNo) return [String(requestData.body.documentNo)]
  const businessDocumentId = getFirstBusinessDocumentId(requestData, responseData, requestData?.body, responseData?.body)
  if (businessDocumentId) return [businessDocumentId]
  if (method === 'POST') {
    if (requestData?.body?.code) return [String(requestData.body.code)]
    if (requestData?.body?.barcode) return [String(requestData.body.barcode)]
    if (requestData?.body?.name) return [String(requestData.body.name)]
  }
  if (requestData?.params?.id) return [String(requestData.params.id)]
  if (requestData?.id) return [String(requestData.id)]
  if (responseData?.id) return [String(responseData.id)]
  return [String(row.id)]
}

function mapLogRow(row: any) {
  const requestData = parseJsonField(row.request_data)
  const responseData = parseJsonField(row.response_data)
  const module = inferModule(row)
  const affectedBusinessIds = getOperationLogBusinessIds(row, requestData, responseData)
  const businessId = affectedBusinessIds[0] || row.id
  const operationType = inferType(row.operation)
  const businessUrl = buildBusinessUrl(module, businessId, undefined, { includeDeleted: operationType === 'delete' })
  const affectedBusinessUrls = affectedBusinessIds
    .map(id => buildBusinessUrl(module, id, undefined, { includeDeleted: operationType === 'delete' }))
    .filter(Boolean)
  return {
    id: row.id,
    userId: row.user_id,
    username: row.username,
    operation: row.operation,
    operationType,
    module,
    description: row.description,
    requestData,
    responseData,
    sourceType: 'operation',
    sourceLabel: '操作日志',
    businessId,
    businessUrl,
    affectedBusinessIds,
    affectedBusinessUrls,
    auditEvent: buildAuditEvent({
      sourceType: 'operation',
      evidenceSource: 'operation_logs',
      module,
      operationType,
      actor: row.username,
      businessId,
      businessUrl,
      affectedBusinessIds,
      affectedBusinessUrls,
      summary: row.description,
      occurredAt: row.created_at,
    }),
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  }
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const LOG_CREATED_AT_EXPR = "REPLACE(created_at, 'T', ' ')"

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

function validateLogFilters(source: any) {
  const type = String(source?.type || '').trim()
  if (type && !LOG_TYPES.has(type)) {
    return { valid: false, message: '操作类型筛选无效' }
  }

  const module = String(source?.module || '').trim()
  if (module && !LOG_MODULES.has(module)) {
    return { valid: false, message: '操作模块筛选无效' }
  }

  return { valid: true, message: '' }
}

function validateUnifiedFilters(source: any) {
  const base = validateLogFilters(source)
  if (!base.valid) return base

  const sourceType = String(source?.sourceType || source?.source || 'all').trim()
  if (sourceType && !UNIFIED_SOURCE_TYPES.has(sourceType)) {
    return { valid: false, message: '日志来源筛选无效' }
  }

  return { valid: true, message: '' }
}

function buildLogWhere(query: any, includeDate = true) {
  const { startDate, endDate, userId, username, keyword, type, module } = query
  let where = '1=1'
  const params: any[] = []
  if (includeDate && startDate) { where += ` AND ${LOG_CREATED_AT_EXPR} >= ?`; params.push(`${startDate} 00:00:00`) }
  if (includeDate && endDate) { where += ` AND ${LOG_CREATED_AT_EXPR} <= ?`; params.push(`${endDate} 23:59:59`) }
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
      { header: '审计来源', value: row => row.sourceLabel || '操作日志' },
      { header: '业务单据', value: row => row.businessId || '' },
      { header: '业务链接', value: row => row.businessUrl || '' },
      { header: '标准事件', value: row => row.auditEvent?.eventCode || '' },
      { header: '事件对象', value: row => row.auditEvent?.subjectId || row.businessId || '' },
      { header: '责任人', value: row => row.auditEvent?.actor || row.username || '' },
      { header: '证据来源', value: row => row.auditEvent?.evidenceSource || row.sourceType || '' },
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

function parseLogPagination(query: any) {
  const page = query.page === undefined || query.page === null || query.page === ''
    ? 1
    : Number(query.page)
  const pageSize = query.pageSize === undefined || query.pageSize === null || query.pageSize === ''
    ? 20
    : Number(query.pageSize)
  if (!Number.isInteger(page) || page < 1) {
    return { valid: false, message: 'page 必须为正整数' }
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 10000) {
    return { valid: false, message: 'pageSize 必须为 1-10000 的整数' }
  }
  return { valid: true, page, pageSize }
}

function dateOnlyDaysAgo(days: number) {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().slice(0, 10)
}

function countRowsBefore(db: any, table: string, beforeDate: string) {
  return Number((db.prepare(`SELECT COUNT(*) as total FROM ${table} WHERE REPLACE(created_at, 'T', ' ') < ?`).get(`${beforeDate} 00:00:00`) as any)?.total || 0)
}

function getProtectedFactCounts(db: any, beforeDate: string) {
  return {
    stock: countRowsBefore(db, 'stock_logs', beforeDate),
    batchLocation: countRowsBefore(db, 'batch_location_adjustments', beforeDate),
    abc: countRowsBefore(db, 'abc_audit_logs', beforeDate),
    reconciliation: countRowsBefore(db, 'reconciliation_logs', beforeDate),
  }
}

function createOperationLogArchive(db: any, beforeDate: string, createdBy: string) {
  const rows = db.prepare(`
    SELECT id, user_id, username, operation, description, request_data, response_data, ip, user_agent, created_at
    FROM operation_logs
    WHERE ${LOG_CREATED_AT_EXPR} < ?
    ORDER BY ${LOG_CREATED_AT_EXPR} ASC, id ASC
  `).all(`${beforeDate} 00:00:00`) as any[]
  const protectedCounts = getProtectedFactCounts(db, beforeDate)
  const content = {
    sourceType: 'operation',
    beforeDate,
    retentionDays: LOG_CLEAN_MIN_RETENTION_DAYS,
    rowCount: rows.length,
    rows,
  }
  const contentJson = JSON.stringify(content)
  const contentHash = createHash('sha256').update(contentJson).digest('hex')
  const previousArchive = db.prepare(`
    SELECT chain_hash, content_sha256
    FROM audit_log_archives
    ORDER BY created_at DESC, archive_no DESC
    LIMIT 1
  `).get() as any
  const previousChainHash = previousArchive?.chain_hash || previousArchive?.content_sha256 || null
  const chainPayload = buildArchiveChainPayload({
    previousChainHash,
    sourceType: 'operation',
    beforeDate,
    retentionDays: LOG_CLEAN_MIN_RETENTION_DAYS,
    rowCount: rows.length,
    contentHash,
    protectedCounts,
    createdBy,
  })
  const chainHash = createHash('sha256').update(chainPayload).digest('hex')
  const archiveId = randomUUID()
  const archiveNo = `LOG-ARCH-${Date.now()}-${archiveId.slice(0, 8)}`
  const externalArchive = createExternalArchivePackage({
    archiveId,
    archiveNo,
    sourceType: 'operation',
    beforeDate,
    retentionDays: LOG_CLEAN_MIN_RETENTION_DAYS,
    rowCount: rows.length,
    contentHash,
    previousChainHash,
    chainHash,
    protectedCounts,
    createdBy,
    content,
  })

  db.prepare(`
    INSERT INTO audit_log_archives (
      id, archive_no, source_type, before_date, retention_days,
      row_count, content_sha256, previous_chain_hash, chain_hash,
      content_json, protected_counts, external_archive_json, created_by
    )
    VALUES (?, ?, 'operation', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    archiveId,
    archiveNo,
    beforeDate,
    LOG_CLEAN_MIN_RETENTION_DAYS,
    rows.length,
    contentHash,
    previousChainHash,
    chainHash,
    contentJson,
    JSON.stringify(protectedCounts),
    JSON.stringify(externalArchive),
    createdBy,
  )

  return { archiveId, archiveNo, archiveHash: contentHash, archiveChainHash: chainHash, previousArchiveChainHash: previousChainHash, rowCount: rows.length, protectedCounts, externalArchive }
}

function createExternalArchivePackage(input: {
  archiveId: string
  archiveNo: string
  sourceType: string
  beforeDate: string
  retentionDays: number
  rowCount: number
  contentHash: string
  previousChainHash: string | null
  chainHash: string
  protectedCounts: any
  createdBy: string | null
  content: any
}) {
  const configuredDir = String(process.env.COREONE_ARCHIVE_EXPORT_DIR || '').trim()
  if (!configuredDir) {
    return {
      status: 'not_configured',
      storageType: 'not_configured',
      packageHashAlgorithm: 'SHA-256',
      uri: null,
      packageHash: null,
      missingReason: 'COREONE_ARCHIVE_EXPORT_DIR_NOT_CONFIGURED',
    }
  }

  const storageGovernance = getExternalArchiveStorageGovernance()
  const exportDir = resolve(configuredDir)
  mkdirSync(exportDir, { recursive: true })
  const exportedAt = new Date().toISOString()
  const archivePackage = {
    packageType: 'operation_log_archive_external_package',
    packageVersion: 1,
    exportedAt,
    archiveId: input.archiveId,
    archiveNo: input.archiveNo,
    sourceType: input.sourceType,
    beforeDate: input.beforeDate,
    retentionDays: input.retentionDays,
    rowCount: input.rowCount,
    contentHash: input.contentHash,
    previousChainHash: input.previousChainHash,
    chainHash: input.chainHash,
    protectedCounts: input.protectedCounts,
    storageGovernance,
    createdBy: input.createdBy,
    content: input.content,
  }
  const packageJson = JSON.stringify(archivePackage, null, 2)
  const packageHash = createHash('sha256').update(packageJson).digest('hex')
  const filename = `${input.archiveNo}.${packageHash.slice(0, 12)}.archive.json`
  const packagePath = join(exportDir, filename)
  const tempPath = join(exportDir, `.${filename}.${process.pid}.${Date.now()}.tmp`)

  if (existsSync(packagePath)) {
    throw new Error('External archive package already exists')
  }

  try {
    writeFileSync(tempPath, packageJson, { encoding: 'utf8', flag: 'wx' })
    renameSync(tempPath, packagePath)
  } catch (err) {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath)
    } catch (_cleanupErr) {
      // Best effort cleanup only; the original write error is more useful.
    }
    throw err
  }

  return {
    status: 'exported',
    storageType: 'filesystem',
    uri: packagePath,
    packageHashAlgorithm: 'SHA-256',
    packageHash,
    exportedAt,
    storageGovernance,
    immutability: 'COREONE records the external package hash, path, and storage governance declaration; retention lock or WORM immutability must be enforced by the configured storage.',
  }
}

function getExternalArchiveStorageGovernance() {
  const mode = String(process.env.COREONE_ARCHIVE_STORAGE_GOVERNANCE_MODE || '').trim()
  const retentionUntil = String(process.env.COREONE_ARCHIVE_STORAGE_RETENTION_UNTIL || '').trim()
  const evidenceUri = String(process.env.COREONE_ARCHIVE_STORAGE_EVIDENCE_URI || '').trim()
  const requiredRetentionUntil = formatDateOnlyUtc(new Date())
  if (!mode && !retentionUntil && !evidenceUri) {
    return {
      status: 'not_configured',
      mode: null,
      retentionUntil: null,
      requiredRetentionUntil,
      evidenceUri: null,
      enforcement: 'external_storage',
      missingReason: 'COREONE_ARCHIVE_STORAGE_GOVERNANCE_NOT_CONFIGURED',
      warning: 'COREONE has not received a retention lock or WORM storage declaration for this external archive package.',
    }
  }

  if (!['retention_lock', 'worm'].includes(mode) || !parseDateOnlyUtc(retentionUntil) || !evidenceUri) {
    return {
      status: 'invalid_configuration',
      mode: mode || null,
      retentionUntil: retentionUntil || null,
      requiredRetentionUntil,
      evidenceUri: evidenceUri || null,
      enforcement: 'external_storage',
      missingReason: 'COREONE_ARCHIVE_STORAGE_GOVERNANCE_INVALID',
      warning: 'COREONE cannot interpret the external storage governance declaration; configure mode, retention-until date, and evidence URI together.',
    }
  }

  const retentionUntilDate = parseDateOnlyUtc(retentionUntil)!
  const requiredRetentionDate = parseDateOnlyUtc(requiredRetentionUntil)!
  if (retentionUntilDate.getTime() < requiredRetentionDate.getTime()) {
    return {
      status: 'insufficient_retention',
      mode,
      retentionUntil,
      requiredRetentionUntil,
      evidenceUri,
      enforcement: 'external_storage',
      missingReason: 'COREONE_ARCHIVE_STORAGE_RETENTION_INSUFFICIENT',
      warning: `COREONE received a retention lock or WORM declaration, but retentionUntil ${retentionUntil} does not cover the required retention date ${requiredRetentionUntil}.`,
    }
  }

  return {
    status: 'declared',
    mode,
    retentionUntil,
    requiredRetentionUntil,
    evidenceUri,
    enforcement: 'external_storage',
    warning: 'COREONE records this declaration for audit handoff; actual retention lock or WORM enforcement must be provided by the external storage service.',
  }
}

function cleanupExternalArchivePackage(externalArchive: any) {
  if (externalArchive?.status !== 'exported' || !externalArchive?.uri) return
  try {
    if (existsSync(externalArchive.uri)) unlinkSync(externalArchive.uri)
  } catch (_err) {
    // Cleanup is best effort; the transaction error should remain the reported failure.
  }
}

function buildArchiveChainPayload(input: {
  previousChainHash: string | null
  sourceType: string
  beforeDate: string
  retentionDays: number
  rowCount: number
  contentHash: string
  protectedCounts: any
  createdBy: string | null
}) {
  return JSON.stringify({
    previousChainHash: input.previousChainHash,
    sourceType: input.sourceType,
    beforeDate: input.beforeDate,
    retentionDays: input.retentionDays,
    rowCount: input.rowCount,
    contentHash: input.contentHash,
    protectedCounts: input.protectedCounts,
    createdBy: input.createdBy,
  })
}

function mapArchiveCredentialRow(row: any) {
  const protectedFactCounts = parseJsonField(row.protected_counts) || {}
  const externalArchive = parseJsonField(row.external_archive_json) || {
    status: 'not_configured',
    storageType: 'not_configured',
    packageHashAlgorithm: 'SHA-256',
    uri: null,
    packageHash: null,
    missingReason: 'COREONE_ARCHIVE_EXPORT_DIR_NOT_CONFIGURED',
  }
  const content = parseJsonField(row.content_json) || {}
  const rows = Array.isArray(content.rows) ? content.rows : []
  return {
    id: row.id,
    archiveNo: row.archive_no,
    sourceType: row.source_type,
    beforeDate: row.before_date,
    retentionDays: Number(row.retention_days || 0),
    rowCount: Number(row.row_count || 0),
    contentHash: row.content_sha256,
    previousChainHash: row.previous_chain_hash || null,
    chainHash: row.chain_hash || row.content_sha256,
    protectedFactCounts,
    externalArchive,
    contentPreview: {
      sourceType: content.sourceType || row.source_type,
      beforeDate: content.beforeDate || row.before_date,
      rowCount: Number(content.rowCount ?? row.row_count ?? 0),
      firstLogIds: rows.slice(0, 5).map((item: any) => item.id).filter(Boolean),
    },
    createdBy: row.created_by,
    createdAt: row.created_at,
  }
}

function verifyArchiveChainRows(rows: any[]) {
  let previousChainHash: string | null = null
  let latestArchiveNo: string | null = null
  let latestChainHash: string | null = null
  let externalArchiveCheckedCount = 0

  for (const row of rows) {
    const contentHash = createHash('sha256').update(row.content_json || '').digest('hex')
    if (contentHash !== row.content_sha256) {
      return {
        valid: false,
        checkedCount: rows.length,
        externalArchiveCheckedCount,
        latestArchiveNo,
        latestChainHash,
        brokenArchiveNo: row.archive_no,
        brokenReason: 'CONTENT_HASH_MISMATCH',
      }
    }

    const storedPrevious = row.previous_chain_hash || null
    if (storedPrevious !== previousChainHash) {
      return {
        valid: false,
        checkedCount: rows.length,
        externalArchiveCheckedCount,
        latestArchiveNo,
        latestChainHash,
        brokenArchiveNo: row.archive_no,
        brokenReason: 'PREVIOUS_CHAIN_MISMATCH',
      }
    }

    const protectedCounts = parseJsonField(row.protected_counts) || {}
    const expectedChainHash = createHash('sha256').update(buildArchiveChainPayload({
      previousChainHash,
      sourceType: row.source_type,
      beforeDate: row.before_date,
      retentionDays: Number(row.retention_days || 0),
      rowCount: Number(row.row_count || 0),
      contentHash,
      protectedCounts,
      createdBy: row.created_by || null,
    })).digest('hex')
    const storedChainHash = row.chain_hash || row.content_sha256
    if (row.chain_hash && storedChainHash !== expectedChainHash) {
      return {
        valid: false,
        checkedCount: rows.length,
        externalArchiveCheckedCount,
        latestArchiveNo,
        latestChainHash,
        brokenArchiveNo: row.archive_no,
        brokenReason: 'CHAIN_HASH_MISMATCH',
      }
    }

    const externalArchive = parseJsonField(row.external_archive_json) || {}
    if (externalArchive.status === 'exported') {
      externalArchiveCheckedCount += 1
      if (!externalArchive.uri || !existsSync(externalArchive.uri)) {
        return {
          valid: false,
          checkedCount: rows.length,
          externalArchiveCheckedCount,
          latestArchiveNo,
          latestChainHash,
          brokenArchiveNo: row.archive_no,
          brokenReason: 'EXTERNAL_ARCHIVE_MISSING',
        }
      }
      const externalArchiveHash = createHash('sha256').update(readFileSync(externalArchive.uri, 'utf8')).digest('hex')
      if (externalArchiveHash !== externalArchive.packageHash) {
        return {
          valid: false,
          checkedCount: rows.length,
          externalArchiveCheckedCount,
          latestArchiveNo,
          latestChainHash,
          brokenArchiveNo: row.archive_no,
          brokenReason: 'EXTERNAL_ARCHIVE_HASH_MISMATCH',
        }
      }
    }

    previousChainHash = storedChainHash
    latestArchiveNo = row.archive_no
    latestChainHash = storedChainHash
  }

  return {
    valid: true,
    checkedCount: rows.length,
    externalArchiveCheckedCount,
    latestArchiveNo,
    latestChainHash,
    brokenArchiveNo: null,
    brokenReason: null,
  }
}

function buildArchiveVerificationReport(rows: any[], generatedBy: string) {
  const verification = verifyArchiveChainRows(rows)
  const retentionPolicy = getArchiveReportRetentionPolicy()
  const archives = rows.map(mapArchiveCredentialRow).map((archive: any) => ({
    archiveNo: archive.archiveNo,
    sourceType: archive.sourceType,
    beforeDate: archive.beforeDate,
    retentionDays: archive.retentionDays,
    rowCount: archive.rowCount,
    contentHash: archive.contentHash,
    previousChainHash: archive.previousChainHash,
    chainHash: archive.chainHash,
    protectedFactCounts: archive.protectedFactCounts,
    externalArchive: archive.externalArchive,
    createdBy: archive.createdBy,
    createdAt: archive.createdAt,
  }))
  const reportBody = {
    reportType: 'operation_log_archive_chain_verification',
    generatedAt: new Date().toISOString(),
    generatedBy,
    retentionPolicy,
    verification,
    archives,
  }
  const reportHash = createHash('sha256').update(JSON.stringify(reportBody)).digest('hex')
  const signature = signArchiveVerificationReport(reportHash)
  return { ...reportBody, reportHash, signature, verificationInstructions: getArchiveReportVerificationInstructions() }
}

function getArchiveReportRetentionPolicy() {
  return {
    sourceTable: 'operation_logs',
    sourceType: 'operation',
    minRetentionDays: LOG_CLEAN_MIN_RETENTION_DAYS,
    cleanupBoundary: 'Only operation_logs rows older than beforeDate are deleted after the archive credential is recorded.',
    protectedFactTables: [
      {
        sourceType: 'stock',
        table: 'stock_logs',
        reason: 'Inventory movement facts are retained for stock traceability and are not deleted by operation log cleanup.',
      },
      {
        sourceType: 'batchLocation',
        table: 'batch_location_adjustments',
        reason: 'Batch-location movement facts are retained for batch and location traceability and are not deleted by operation log cleanup.',
      },
      {
        sourceType: 'abc',
        table: 'abc_audit_logs',
        reason: 'ABC cost audit facts are retained for cost recalculation and explanation and are not deleted by operation log cleanup.',
      },
      {
        sourceType: 'reconciliation',
        table: 'reconciliation_logs',
        reason: 'Reconciliation correction facts are retained for LIS/BOM/cost explanation and are not deleted by operation log cleanup.',
      },
    ],
  }
}

function getArchiveReportVerificationInstructions() {
  return {
    chainVerification: 'Recompute each archive contentHash, previousChainHash, and chainHash in ascending archive order before trusting this report.',
    reportHashPayload: ARCHIVE_REPORT_HASH_PAYLOAD,
    signaturePayload: 'reportHash',
    signatureAlgorithm: ARCHIVE_REPORT_SIGNATURE_ALGORITHM,
    signatureCheck: 'When signature.status is signed, compute HMAC-SHA256(reportHash, shared signing secret) and compare it with signature.value.',
    externalArchiveCheck: 'When externalArchive.status is exported, read externalArchive.uri, compute SHA-256 of the file content, and compare it with externalArchive.packageHash before accepting the external package.',
    externalStorageGovernance: 'externalArchive.storageGovernance describes whether retention lock or WORM status is an external storage declaration; COREONE records the declaration and evidence URI but does not enforce external storage immutability itself. Governance is declared only when retentionUntil is not expired and covers requiredRetentionUntil.',
    unsignedBehavior: 'When signature.status is unsigned, treat the report as hash-verifiable only, not externally signed.',
  }
}

function signArchiveVerificationReport(reportHash: string) {
  const status = getArchiveReportSignatureStatus()
  if (status.status !== 'signed') {
    return { ...status, value: null }
  }

  return {
    ...status,
    value: createHmac('sha256', String(process.env.COREONE_ARCHIVE_REPORT_SIGNING_SECRET || '').trim()).update(reportHash).digest('hex'),
  }
}

function getArchiveReportSignatureStatus() {
  const secret = String(process.env.COREONE_ARCHIVE_REPORT_SIGNING_SECRET || '').trim()
  const signedPayload = 'reportHash'
  if (!secret) {
    return {
      status: 'unsigned',
      algorithm: ARCHIVE_REPORT_SIGNATURE_ALGORITHM,
      keyId: 'not-configured',
      signedPayload,
      value: null,
      missingReason: 'COREONE_ARCHIVE_REPORT_SIGNING_SECRET_NOT_CONFIGURED',
      keyGovernance: getArchiveReportSigningKeyGovernance(false),
    }
  }

  const keyId = String(process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_ID || '').trim() || 'default'
  return {
    status: 'signed',
    algorithm: ARCHIVE_REPORT_SIGNATURE_ALGORITHM,
    keyId,
    signedPayload,
    keyGovernance: getArchiveReportSigningKeyGovernance(true),
  }
}

function getArchiveReportSigningKeyGovernance(secretConfigured: boolean) {
  const missingReason = 'COREONE_ARCHIVE_REPORT_SIGNING_KEY_GOVERNANCE_NOT_CONFIGURED'
  if (!secretConfigured) {
    return {
      status: 'not_configured',
      keyCreatedAt: null,
      rotationDays: null,
      rotationDueAt: null,
      missingReason,
    }
  }

  const keyCreatedAt = String(process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_CREATED_AT || '').trim()
  const rotationDaysRaw = String(process.env.COREONE_ARCHIVE_REPORT_SIGNING_KEY_ROTATION_DAYS || '').trim()
  if (!keyCreatedAt || !rotationDaysRaw) {
    return {
      status: 'not_configured',
      keyCreatedAt: keyCreatedAt || null,
      rotationDays: rotationDaysRaw ? Number(rotationDaysRaw) : null,
      rotationDueAt: null,
      missingReason,
    }
  }

  const rotationDays = Number(rotationDaysRaw)
  const createdAtDate = parseDateOnlyUtc(keyCreatedAt)
  if (!createdAtDate || !Number.isInteger(rotationDays) || rotationDays < 1) {
    return {
      status: 'invalid_configuration',
      keyCreatedAt,
      rotationDays: Number.isFinite(rotationDays) ? rotationDays : null,
      rotationDueAt: null,
      missingReason: 'COREONE_ARCHIVE_REPORT_SIGNING_KEY_GOVERNANCE_INVALID',
    }
  }

  const rotationDueAt = formatDateOnlyUtc(addUtcDays(createdAtDate, rotationDays))
  const rotationDueEnd = new Date(`${rotationDueAt}T23:59:59.999Z`)
  return {
    status: Date.now() > rotationDueEnd.getTime() ? 'rotation_due' : 'active',
    keyCreatedAt,
    rotationDays,
    rotationDueAt,
  }
}

function parseDateOnlyUtc(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const date = new Date(`${value}T00:00:00.000Z`)
  return formatDateOnlyUtc(date) === value ? date : null
}

function addUtcDays(date: Date, days: number) {
  const next = new Date(date.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

function formatDateOnlyUtc(date: Date) {
  return date.toISOString().slice(0, 10)
}

function moduleFromRelatedType(relatedType: unknown) {
  const value = String(relatedType || '').trim().toLowerCase()
  const aliases: Record<string, string> = {
    inbound_record: 'inbound',
    inbound: 'inbound',
    outbound_record: 'outbound',
    outbound: 'outbound',
    stocktaking: 'stocktaking',
    scraps: 'scraps',
    scrap: 'scraps',
    returns: 'returns',
    return: 'returns',
    supplier_return: 'supplier_returns',
    supplier_return_cancel: 'supplier_returns',
    supplier_returns: 'supplier_returns',
    transfers: 'transfers',
    transfer: 'transfers',
  }
  return aliases[value] || 'inventory'
}

function inferStockLogType(type: unknown, relatedType: unknown) {
  const value = String(type || '').trim().toLowerCase()
  const related = String(relatedType || '').trim().toLowerCase()
  if (value.includes('stock_update')) return 'update'
  if (value.includes('cancel') || related.includes('cancel')) return 'delete'
  if (['inbound', 'inbound_batch', 'outbound', 'return', 'supplier_return', 'scrap', 'transfer'].includes(related)) return 'create'
  return inferType(value || related)
}

function mapStockLogRow(row: any) {
  const requestData = {
    materialId: row.material_id,
    quantity: Number(row.quantity || 0),
    beforeStock: Number(row.before_stock || 0),
    afterStock: Number(row.after_stock || 0),
    relatedId: row.related_id,
    relatedDocumentNo: row.related_document_no || null,
    relatedType: row.related_type,
    remark: row.remark,
  }
  const module = moduleFromRelatedType(row.related_type)
  const businessId = row.related_document_no || row.related_id || row.material_id || row.id
  const operationType = inferStockLogType(row.type, row.related_type)
  const businessUrl = buildBusinessUrl(module, businessId, undefined, { includeDeleted: operationType === 'delete' })
  return {
    id: row.id,
    userId: row.operator,
    username: row.operator,
    operation: row.type,
    operationType,
    module,
    description: row.remark || `库存流水：${row.type}`,
    requestData,
    responseData: null,
    sourceType: 'stock',
    sourceLabel: '库存流水',
    businessId,
    businessUrl,
    auditEvent: buildAuditEvent({
      sourceType: 'stock',
      evidenceSource: 'stock_logs',
      module,
      operationType,
      actor: row.operator,
      businessId,
      businessUrl,
      summary: row.remark || `库存流水：${row.type}`,
      occurredAt: row.created_at,
    }),
    ip: '',
    userAgent: '',
    createdAt: row.created_at,
  }
}

function mapBatchLocationAdjustmentRow(row: any) {
  const quantityDelta = Number(row.quantity_delta || 0)
  const requestData = {
    relatedType: row.related_type,
    relatedId: row.related_id,
    relatedDocumentNo: row.related_document_no || null,
    batchId: row.batch_id,
    batchNo: row.batch_no,
    materialId: row.material_id,
    materialCode: row.material_code,
    materialName: row.material_name,
    locationId: row.location_id,
    locationName: row.location_name,
    quantityDelta,
    operator: row.operator || null,
  }
  const direction = quantityDelta >= 0 ? '增加' : '扣减'
  const batchLabel = row.batch_no || row.batch_id
  const locationLabel = row.location_name || row.location_id
  const module = moduleFromRelatedType(row.related_type)
  const businessId = row.related_document_no || row.related_id || row.id
  const isCancelRelated = String(row.related_type || '').toLowerCase().includes('cancel')
  const businessUrl = buildBusinessUrl(module, businessId, undefined, { includeDeleted: isCancelRelated })
  return {
    id: row.id,
    userId: row.operator || '',
    username: row.operator || '',
    operation: row.related_type,
    operationType: 'update',
    module,
    description: `批次库位${direction}: ${batchLabel} @ ${locationLabel} ${quantityDelta}`,
    requestData,
    responseData: null,
    sourceType: 'batch_location',
    sourceLabel: '批次库位流水',
    businessId,
    businessUrl,
    auditEvent: buildAuditEvent({
      sourceType: 'batch_location',
      evidenceSource: 'batch_location_adjustments',
      module,
      operationType: 'update',
      actor: row.operator,
      businessId,
      businessUrl,
      summary: `批次库位${direction}: ${batchLabel} @ ${locationLabel} ${quantityDelta}`,
      occurredAt: row.created_at,
    }),
    ip: '',
    userAgent: '',
    createdAt: row.created_at,
  }
}

function mapAbcAuditRow(row: any) {
  const detail = parseJsonField(row.detail) || (row.detail ? { detail: row.detail } : {})
  const module = row.module || 'cost'
  const businessId = module === 'exception'
    ? (detail.exceptionNo || row.target_id || row.id)
    : module === 'cost_adjustment'
      ? (detail.adjustmentNo || row.target_id || row.id)
    : module === 'period'
      ? (detail.yearMonth || detail.year_month || row.target_id || row.id)
    : (row.target_id || row.id)
  const businessUrl = buildBusinessUrl(module, businessId, detail)
  const operationType = inferType(row.action)
  const description = typeof detail?.reason === 'string' ? detail.reason : `成本审计：${row.action}`
  return {
    id: row.id,
    userId: row.operator,
    username: row.operator,
    operation: row.action,
    operationType,
    module,
    description,
    requestData: detail,
    responseData: null,
    sourceType: 'abc',
    sourceLabel: '成本审计',
    businessId,
    businessUrl,
    auditEvent: buildAuditEvent({
      sourceType: 'abc',
      evidenceSource: 'abc_audit_logs',
      module,
      operationType,
      actor: row.operator,
      businessId,
      businessUrl,
      summary: description,
      occurredAt: row.created_at,
    }),
    ip: '',
    userAgent: '',
    createdAt: row.created_at,
  }
}

function mapReconciliationRow(row: any) {
  const oldSnapshot = parseJsonField(row.old_value)
  const newSnapshot = parseJsonField(row.new_value)
  const requestData = {
    type: row.type,
    targetId: row.target_id,
    targetName: row.target_name,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    oldSnapshot,
    newSnapshot,
    reason: row.reason,
  }
  const businessId = row.type === 'case_edit'
    ? (newSnapshot?.caseNo || oldSnapshot?.caseNo || row.target_name || row.target_id || row.id)
    : (row.target_id || row.id)
  const businessUrl = buildBusinessUrl('reconciliation', businessId)
  const operationType = inferType(row.type)
  const description = row.reason || `对账修正：${row.field || row.type}`
  return {
    id: row.id,
    userId: row.operator,
    username: row.operator,
    operation: row.type,
    operationType,
    module: 'reconciliation',
    description,
    requestData,
    responseData: null,
    sourceType: 'reconciliation',
    sourceLabel: '对账修正',
    businessId,
    businessUrl,
    auditEvent: buildAuditEvent({
      sourceType: 'reconciliation',
      evidenceSource: 'reconciliation_logs',
      module: 'reconciliation',
      operationType,
      actor: row.operator,
      businessId,
      businessUrl,
      summary: description,
      occurredAt: row.created_at,
    }),
    ip: '',
    userAgent: '',
    createdAt: row.created_at,
  }
}

function normalizeDateText(value: unknown) {
  return String(value || '').replace('T', ' ')
}

function unifiedText(row: any) {
  return [
    row.id,
    row.username,
    row.operation,
    row.operationType,
    row.module,
    row.description,
    row.sourceLabel,
    row.businessId,
    row.auditEvent?.eventCode,
    row.auditEvent?.subjectId,
    row.auditEvent?.actor,
    row.auditEvent?.evidenceSource,
    JSON.stringify(row.requestData || {}),
    JSON.stringify(row.responseData || {}),
  ].join(' ').toLowerCase()
}

function filterUnifiedRows(rows: any[], query: any) {
  const start = query.startDate ? `${query.startDate} 00:00:00` : ''
  const end = query.endDate ? `${query.endDate} 23:59:59` : ''
  const sourceType = String(query.sourceType || query.source || 'all').trim()
  const username = String(query.username || '').trim()
  const keyword = String(query.keyword || '').trim().toLowerCase()
  const type = String(query.type || '').trim()
  const moduleName = String(query.module || '').trim()

  return rows.filter(row => {
    const createdAt = normalizeDateText(row.createdAt)
    if (start && createdAt < start) return false
    if (end && createdAt > end) return false
    if (sourceType && sourceType !== 'all' && row.sourceType !== sourceType) return false
    if (username && row.username !== username) return false
    if (type && row.operationType !== type) return false
    if (moduleName && row.module !== moduleName) return false
    if (keyword && !unifiedText(row).includes(keyword)) return false
    return true
  })
}

function getUnifiedAuditRows(db: any) {
  const operationRows = (db.prepare('SELECT * FROM operation_logs').all() as any[]).map(mapLogRow)
  const stockRows = (db.prepare(`
    SELECT sl.*,
           COALESCE(
             ir.inbound_no,
             obr.outbound_no,
             st.stocktaking_no,
             rr.return_no,
             sr.return_no,
             scr.scrap_no
           ) as related_document_no
    FROM stock_logs sl
    LEFT JOIN inbound_records ir ON ir.id = sl.related_id
      AND sl.related_type IN ('inbound', 'inbound_batch', 'transfer', 'transfer_cancel')
      AND ir.is_deleted = 0
    LEFT JOIN outbound_records obr ON obr.id = sl.related_id
      AND sl.related_type = 'outbound'
      AND obr.is_deleted = 0
    LEFT JOIN stocktaking_records st ON st.id = sl.related_id
      AND sl.related_type IN ('stocktaking', 'stocktaking_cancel')
      AND st.is_deleted = 0
    LEFT JOIN return_records rr ON rr.id = sl.related_id
      AND sl.related_type IN ('return', 'return_cancel')
      AND rr.is_deleted = 0
    LEFT JOIN supplier_returns sr ON sr.id = sl.related_id
      AND sl.related_type IN ('supplier_return', 'supplier_return_cancel')
    LEFT JOIN scrap_records scr ON scr.id = sl.related_id
      AND sl.related_type = 'scrap'
      AND scr.is_deleted = 0
  `).all() as any[]).map(mapStockLogRow)
  const batchLocationRows = (db.prepare(`
    SELECT bla.*,
           b.batch_no,
           m.code as material_code,
           m.name as material_name,
           COALESCE(l.name, bla.location_id) as location_name,
           COALESCE(
             bla.operator,
             ir.operator,
             obr.operator,
             st.operator,
             rr.operator,
             sr.operator,
             scr.operator
           ) as operator,
           COALESCE(
             ir.inbound_no,
             obr.outbound_no,
             st.stocktaking_no,
             rr.return_no,
             sr.return_no,
             scr.scrap_no
           ) as related_document_no
    FROM batch_location_adjustments bla
    LEFT JOIN batches b ON b.id = bla.batch_id
    LEFT JOIN materials m ON m.id = bla.material_id AND m.is_deleted = 0
    LEFT JOIN locations l ON l.id = bla.location_id AND l.is_deleted = 0
    LEFT JOIN inbound_records ir ON ir.id = bla.related_id
      AND bla.related_type IN ('inbound', 'transfer', 'transfer_cancel')
      AND ir.is_deleted = 0
    LEFT JOIN outbound_records obr ON obr.id = bla.related_id
      AND bla.related_type = 'outbound'
      AND obr.is_deleted = 0
    LEFT JOIN stocktaking_records st ON st.id = bla.related_id
      AND bla.related_type IN ('stocktaking', 'stocktaking_cancel')
      AND st.is_deleted = 0
    LEFT JOIN return_records rr ON rr.id = bla.related_id
      AND bla.related_type IN ('return', 'return_cancel')
      AND rr.is_deleted = 0
    LEFT JOIN supplier_returns sr ON sr.id = bla.related_id
      AND bla.related_type IN ('supplier_return', 'supplier_return_cancel')
    LEFT JOIN scrap_records scr ON scr.id = bla.related_id
      AND bla.related_type = 'scrap'
      AND scr.is_deleted = 0
  `).all() as any[]).map(mapBatchLocationAdjustmentRow)
  const abcRows = (db.prepare('SELECT * FROM abc_audit_logs').all() as any[]).map(mapAbcAuditRow)
  const reconciliationRows = (db.prepare('SELECT * FROM reconciliation_logs').all() as any[]).map(mapReconciliationRow)

  return [
    ...operationRows,
    ...stockRows,
    ...batchLocationRows,
    ...abcRows,
    ...reconciliationRows,
  ].sort((a, b) => normalizeDateText(b.createdAt).localeCompare(normalizeDateText(a.createdAt)))
}

router.get('/unified', (req, res) => {
  try {
    const dateValidation = validateDateRangeInput(req.query)
    if (!dateValidation.valid) {
      error(res, dateValidation.message, 'INVALID_PARAMETER', 400)
      return
    }
    const filterValidation = validateUnifiedFilters(req.query)
    if (!filterValidation.valid) {
      error(res, filterValidation.message, 'INVALID_PARAMETER', 400)
      return
    }
    const pagination = parseLogPagination(req.query)
    if (!pagination.valid) {
      error(res, pagination.message, 'INVALID_PARAMETER', 400)
      return
    }

    const db = getDatabase()
    const filtered = filterUnifiedRows(getUnifiedAuditRows(db), req.query)

    const pageNum = pagination.page as number
    const pageSize = pagination.pageSize as number
    const offset = (pageNum - 1) * pageSize
    successList(res, filtered.slice(offset, offset + pageSize), pageNum, pageSize, filtered.length)
  } catch (err: any) { error(res, err.message) }
})

router.get('/archives', (req, res) => {
  try {
    const pagination = parseLogPagination(req.query)
    if (!pagination.valid) {
      error(res, pagination.message, 'INVALID_PARAMETER', 400)
      return
    }

    const db = getDatabase()
    const pageNum = pagination.page as number
    const pageSize = pagination.pageSize as number
    const offset = (pageNum - 1) * pageSize
    const count = (db.prepare('SELECT COUNT(*) as total FROM audit_log_archives').get() as any)?.total || 0
    const rows = db.prepare(`
      SELECT *
      FROM audit_log_archives
      ORDER BY created_at DESC, archive_no DESC
      LIMIT ? OFFSET ?
    `).all(pageSize, offset) as any[]

    successList(res, rows.map(mapArchiveCredentialRow), pageNum, pageSize, count, {
      reportSignature: getArchiveReportSignatureStatus(),
    })
  } catch (err: any) { error(res, err.message) }
})

router.post('/archives/verify', (req, res) => {
  try {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT *
      FROM audit_log_archives
      ORDER BY created_at ASC, archive_no ASC
    `).all() as any[]
    const result = verifyArchiveChainRows(rows)

    logOperation(db, req as any, {
      operation: 'POST /logs/archives/verify',
      description: '验证操作日志归档链',
      requestData: { module: 'logs' },
      responseData: result,
    })
    success(res, result, 'Archive chain verified')
  } catch (err: any) { error(res, err.message) }
})

router.get('/archives/verification-report', (req, res) => {
  try {
    const db = getDatabase()
    const rows = db.prepare(`
      SELECT *
      FROM audit_log_archives
      ORDER BY created_at ASC, archive_no ASC
    `).all() as any[]
    const generatedBy = (req as any).user?.username || (req as any).user?.id || 'system'
    const report = buildArchiveVerificationReport(rows, generatedBy)
    const filename = `archive_chain_verification_${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}.json`

    logOperation(db, req as any, {
      operation: 'GET /logs/archives/verification-report',
      description: '导出操作日志归档链验证报告',
      requestData: { module: 'logs' },
      responseData: {
        reportType: report.reportType,
        reportHash: report.reportHash,
        signature: {
          status: report.signature.status,
          keyId: report.signature.keyId,
        },
        verification: report.verification,
        archiveCount: report.archives.length,
      },
    })

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.status(200).send(JSON.stringify(report, null, 2))
  } catch (err: any) { error(res, err.message) }
})

function getOperationLogs(req: any, res: any) {
  try {
    const dateValidation = validateDateRangeInput(req.query)
    if (!dateValidation.valid) {
      error(res, dateValidation.message, 'INVALID_PARAMETER', 400)
      return
    }
    const filterValidation = validateLogFilters(req.query)
    if (!filterValidation.valid) {
      error(res, filterValidation.message, 'INVALID_PARAMETER', 400)
      return
    }
    const pagination = parseLogPagination(req.query)
    if (!pagination.valid) {
      error(res, pagination.message, 'INVALID_PARAMETER', 400)
      return
    }

    const db = getDatabase()
    const { where, params } = buildLogWhere(req.query)

    const count = (db.prepare(`SELECT COUNT(*) as total FROM operation_logs WHERE ${where}`).get(...params) as any)?.total || 0
    const pageNum = pagination.page as number
    const pageSize = pagination.pageSize as number
    const offset = (pageNum - 1) * pageSize
    const list = db.prepare(`SELECT * FROM operation_logs WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, pageSize, offset) as any[]

    successList(res, list.map(mapLogRow), pageNum, pageSize, count)
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
    const hasSourceFilter = source?.sourceType !== undefined || source?.source !== undefined
    const filterValidation = hasSourceFilter ? validateUnifiedFilters(source) : validateLogFilters(source)
    if (!filterValidation.valid) {
      error(res, filterValidation.message, 'INVALID_PARAMETER', 400)
      return
    }

    const db = getDatabase()
    let rows: any[]
    if (hasSourceFilter) {
      rows = filterUnifiedRows(getUnifiedAuditRows(db), source).slice(0, 10000)
    } else {
      const { where, params } = buildLogWhere(source)
      rows = (db.prepare(`SELECT * FROM operation_logs WHERE ${where} ORDER BY created_at DESC LIMIT 10000`).all(...params) as any[]).map(mapLogRow)
    }
    const content = `\ufeff${toCsv(rows, getExportOptions(source))}`
    logOperation(db, req, {
      operation: 'export logs',
      description: hasSourceFilter ? '导出统一审计日志' : '导出操作日志',
      requestData: { module: 'logs', filters: source, rowCount: rows.length },
      responseData: { rowCount: rows.length },
    })
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
    const retentionCutoff = dateOnlyDaysAgo(LOG_CLEAN_MIN_RETENTION_DAYS)
    if (beforeDate > retentionCutoff) {
      error(res, `日志至少保留 ${LOG_CLEAN_MIN_RETENTION_DAYS} 天，不能清理 ${retentionCutoff} 之后的操作日志`, 'INVALID_PARAMETER', 400)
      return
    }

    const db = getDatabase()
    db.exec('BEGIN IMMEDIATE')
    let archive: ReturnType<typeof createOperationLogArchive>
    let committed = false
    try {
      archive = createOperationLogArchive(db, beforeDate, req.user?.username || req.user?.id || 'admin')
      const result = db.prepare(`DELETE FROM operation_logs WHERE ${LOG_CREATED_AT_EXPR} < ?`).run(`${beforeDate} 00:00:00`)
      db.exec('COMMIT')
      committed = true
      logOperation(db, req, {
        operation: 'delete logs',
        description: `清理 ${beforeDate} 之前的操作日志`,
        requestData: { module: 'logs', beforeDate, archiveId: archive.archiveId, archiveHash: archive.archiveHash, archiveChainHash: archive.archiveChainHash },
        responseData: {
          deletedCount: Number(result.changes || 0),
          beforeDate,
          archiveId: archive.archiveId,
          archiveNo: archive.archiveNo,
          archiveHash: archive.archiveHash,
          archiveChainHash: archive.archiveChainHash,
          previousArchiveChainHash: archive.previousArchiveChainHash,
          protectedFactCounts: archive.protectedCounts,
          externalArchive: archive.externalArchive,
        },
      })
      success(res, {
        deletedCount: Number(result.changes || 0),
        beforeDate,
        archiveId: archive.archiveId,
        archiveNo: archive.archiveNo,
        archiveHash: archive.archiveHash,
        archiveChainHash: archive.archiveChainHash,
        previousArchiveChainHash: archive.previousArchiveChainHash,
        protectedFactCounts: archive.protectedCounts,
        externalArchive: archive.externalArchive,
      }, 'Logs cleaned')
    } catch (e) {
      if (!committed) {
        db.exec('ROLLBACK')
        cleanupExternalArchivePackage(archive?.externalArchive)
      }
      throw e
    }
  } catch (err: any) { error(res, err.message) }
})

export default router
