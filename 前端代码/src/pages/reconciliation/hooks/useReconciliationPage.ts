import { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { reconciliationApi } from '@/api/reconciliation'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import { downloadBlobFile } from '@/lib/utils'

export interface SummaryData {
  totalCases: number
  linkedOutbounds: number
  unlinkedOutbounds: number
  projectsWithoutBom: number
}

export interface ProjectReconcile {
  id: string
  code: string
  name: string
  bom_id: string
  type: string
  case_count: number
  outbound_count: number
  hasBom: boolean
  boms: { id: string; code: string; name: string }[]
}

export interface MaterialDiff {
  materialId: string
  materialName: string
  spec: string
  bomUsagePerSample: number
  bomUnit: string
  theoryQty: number
  actualQty: number
  actualUnit: string
  diff: number
  diffRate: number
  status: string
  price: number
  theoryUnit: string
}

export interface MaterialSummary {
  materialId: string
  materialName: string
  spec: string
  unit: string
  projectCount: number
  theoryTotal: number
  actualTotal: number
  diff: number
  diffRate: string
  status: string
  price: number
}

export interface LisCase {
  id: string
  case_no: string
  project_id: string
  project_name: string
  operator: string
  operate_time: string
  status: string
  projectName: string
  hasBom: boolean
}

export interface ReconcileLog {
  id: string
  type: string
  target_id: string
  target_name: string
  field: string
  old_value: string
  new_value: string
  reason: string
  operator: string
  created_at: string
}

export type TabType = 'reconcile' | 'material' | 'case' | 'log'
export type PeriodType = 'week' | 'month' | 'quarter' | 'year'
export type ReconciliationExportFormat = 'csv' | 'xlsx'
export type ReconciliationExportScope = 'filtered' | 'all'

export interface ReconciliationExportOptions {
  format: ReconciliationExportFormat
  scope: ReconciliationExportScope
}

export interface LisImportItem {
  caseNo: string
  projectName: string
  operateTime: string
  operator: string
}

export interface LisImportError {
  row: number
  caseNo?: string
  message: string
}

export interface LisImportPreview {
  total: number
  validCount: number
  failedCount: number
  errors: LisImportError[]
}

const HEADER_ALIASES: Record<keyof LisImportItem, string[]> = {
  caseNo: ['病理号', '病例号', 'caseNo', 'case_no', 'case no'],
  projectName: ['检测项目', '项目名称', 'projectName', 'project_name', 'project name'],
  operateTime: ['操作时间', '检测时间', 'operateTime', 'operate_time', 'operate time'],
  operator: ['操作人', '执行人', 'operator'],
}

function parseDelimitedLine(line: string, delimiter: ',' | '\t') {
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
  const delimiter = line.includes('\t') ? '\t' : ','
  return parseDelimitedLine(line, delimiter)
}

function normalizeHeader(value: string) {
  return value.trim().replace(/^\ufeff/, '').toLowerCase()
}

function findHeaderIndex(headers: string[], key: keyof LisImportItem) {
  const aliases = HEADER_ALIASES[key].map(normalizeHeader)
  return headers.findIndex(header => aliases.includes(normalizeHeader(header)))
}

function looksLikeHeader(cells: string[]) {
  return findHeaderIndex(cells, 'caseNo') >= 0 && findHeaderIndex(cells, 'projectName') >= 0
}

export function parseLisImportData(raw: string): LisImportItem[] {
  const lines = raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  if (lines.length === 0) return []

  const firstCells = parseLisLine(lines[0])
  const hasHeader = looksLikeHeader(firstCells)
  const indexes: Record<keyof LisImportItem, number> = hasHeader
    ? {
        caseNo: findHeaderIndex(firstCells, 'caseNo'),
        projectName: findHeaderIndex(firstCells, 'projectName'),
        operateTime: findHeaderIndex(firstCells, 'operateTime'),
        operator: findHeaderIndex(firstCells, 'operator'),
      }
    : { caseNo: 0, projectName: 1, operateTime: 2, operator: 3 }

  return lines.slice(hasHeader ? 1 : 0)
    .map(line => parseLisLine(line))
    .map(cells => ({
      caseNo: indexes.caseNo >= 0 ? (cells[indexes.caseNo] || '').trim() : '',
      projectName: indexes.projectName >= 0 ? (cells[indexes.projectName] || '').trim() : '',
      operateTime: indexes.operateTime >= 0 ? (cells[indexes.operateTime] || '').trim() : '',
      operator: indexes.operator >= 0 ? (cells[indexes.operator] || '').trim() : '',
    }))
}

export function isValidLisOperateTime(value: string) {
  const text = value.trim()
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
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

export function buildLisImportValidation(items: LisImportItem[]) {
  const validItems: LisImportItem[] = []
  const errors: LisImportError[] = []

  items.forEach((item, index) => {
    const row = index + 1
    if (!item.caseNo.trim()) {
      errors.push({ row, caseNo: item.caseNo, message: '病理号不能为空' })
      return
    }
    if (!item.projectName.trim()) {
      errors.push({ row, caseNo: item.caseNo, message: '检测项目不能为空' })
      return
    }
    if (!item.operateTime.trim()) {
      errors.push({ row, caseNo: item.caseNo, message: '检测时间不能为空' })
      return
    }
    if (!isValidLisOperateTime(item.operateTime)) {
      errors.push({ row, caseNo: item.caseNo, message: '检测时间格式错误，应为 YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss' })
      return
    }
    validItems.push(item)
  })

  return { validItems, errors }
}

export function buildLisImportPreview(raw: string): LisImportPreview {
  const items = parseLisImportData(raw)
  const validation = buildLisImportValidation(items)
  return {
    total: items.length,
    validCount: validation.validItems.length,
    failedCount: validation.errors.length,
    errors: validation.errors,
  }
}

export function buildLisImportTemplateCsv() {
  return [
    '病理号,检测项目,操作时间,操作人',
    'P24050187,HE制片,2026-06-17 09:00:00,张三',
  ].join('\n')
}

export function buildReconciliationExportParams({
  activeTab,
  dateParams,
  caseSearch,
  caseFilterProject,
  caseFilterStatus,
  format,
  scope,
}: {
  activeTab: TabType
  dateParams: { startDate: string; endDate: string }
  caseSearch?: string
  caseFilterProject?: string
  caseFilterStatus?: string
  format?: ReconciliationExportFormat
  scope?: ReconciliationExportScope
}) {
  const typeMap: Record<TabType, string> = {
    reconcile: 'project',
    material: 'material',
    case: 'case',
    log: 'log',
  }

  const exportScope = scope || 'filtered'
  const params = {
    type: typeMap[activeTab],
    ...(format ? { format } : {}),
    ...(scope ? { scope } : {}),
  }

  if (exportScope === 'all') {
    return params
  }

  return {
    ...params,
    ...dateParams,
    ...(activeTab === 'case' && caseSearch ? { search: caseSearch } : {}),
    ...(activeTab === 'case' && caseFilterProject ? { projectId: caseFilterProject } : {}),
    ...(activeTab === 'case' && caseFilterStatus ? { status: caseFilterStatus } : {}),
  }
}

export function buildReconciliationExportFilename(params: { type: string; startDate?: string; endDate?: string }, format: ReconciliationExportFormat) {
  const dateSegment = params.startDate && params.endDate
    ? `${params.startDate}_${params.endDate}`
    : new Date().toISOString().slice(0, 10)
  return `reconciliation-${params.type}-${dateSegment}.${format === 'xlsx' ? 'xlsx' : 'csv'}`
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isValidDateOnly(value: string) {
  if (!value) return true
  if (!DATE_ONLY_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function validateReconciliationDateRange(dateParams: { startDate: string; endDate: string }) {
  const { startDate, endDate } = dateParams
  if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate)) {
    return { valid: false, message: '日期格式必须为 YYYY-MM-DD' }
  }
  if (startDate && endDate && startDate > endDate) {
    return { valid: false, message: '开始日期不能晚于结束日期' }
  }
  return { valid: true, message: '' }
}

export function getLisImportRefreshTargets(activeTab: TabType) {
  return {
    summary: true,
    projects: activeTab === 'reconcile' || activeTab === 'case',
    materials: activeTab === 'material',
    cases: activeTab === 'case',
    clearProjectMaterials: activeTab === 'reconcile',
  }
}

export function useReconciliationPage() {
  const [activeTab, setActiveTab] = useState<TabType>('reconcile')
  const [period, setPeriod] = useState<PeriodType>('month')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [auditingProjectId, setAuditingProjectId] = useState<string | null>(null)

  // 根据 period 动态计算 startDate 和 endDate
  useEffect(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const day = now.getDate()

    let start: Date
    let end: Date

    switch (period) {
      case 'week': {
        // 本周（周一到周日）
        const dayOfWeek = now.getDay()
        start = new Date(now)
        start.setDate(day - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
        end = new Date(start)
        end.setDate(start.getDate() + 6)
        break
      }
      case 'month': {
        // 本月
        start = new Date(year, month, 1)
        end = new Date(year, month + 1, 0)
        break
      }
      case 'quarter': {
        // 本季度
        const quarter = Math.floor(month / 3)
        start = new Date(year, quarter * 3, 1)
        end = new Date(year, quarter * 3 + 3, 0)
        break
      }
      case 'year': {
        // 本年
        start = new Date(year, 0, 1)
        end = new Date(year, 11, 31)
        break
      }
      default: {
        start = new Date(year, month, 1)
        end = new Date(year, month + 1, 0)
      }
    }

    setStartDate(start.toISOString().split('T')[0])
    setEndDate(end.toISOString().split('T')[0])
  }, [period])

  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [projects, setProjects] = useState<ProjectReconcile[]>([])
  const [expandedProject, setExpandedProject] = useState<string | null>(null)
  const [projectMaterials, setProjectMaterials] = useState<Record<string, MaterialDiff[]>>({})
  const [materials, setMaterials] = useState<MaterialSummary[]>([])

  const [caseSearch, setCaseSearch] = useState('')
  const [caseFilterProject, setCaseFilterProject] = useState('')
  const [caseFilterStatus, setCaseFilterStatus] = useState('')

  const [importModalOpen, setImportModalOpen] = useState(false)
  const [fixBomModalOpen, setFixBomModalOpen] = useState(false)
  const [editCaseModalOpen, setEditCaseModalOpen] = useState(false)
  const [importData, setImportData] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importErrors, setImportErrors] = useState<LisImportError[]>([])
  const [fixTarget, setFixTarget] = useState<MaterialDiff | null>(null)
  const [fixTargetProjectId, setFixTargetProjectId] = useState<string | null>(null)
  const [fixNewUsage, setFixNewUsage] = useState<number>(0)
  const [fixNewUnit, setFixNewUnit] = useState<string>('')
  const [fixReason, setFixReason] = useState<string>('')
  const [editCaseTarget, setEditCaseTarget] = useState<LisCase | null>(null)
  const [editCaseProjectId, setEditCaseProjectId] = useState<string>('')
  const [editCaseStatus, setEditCaseStatus] = useState<string>('')

  const dateParams = useMemo(() => ({ startDate, endDate }), [startDate, endDate])
  const dateValidation = useMemo(() => validateReconciliationDateRange(dateParams), [dateParams])

  const fetchSummary = useCallback(async () => {
    if (!dateValidation.valid) return
    try {
      const res = await reconciliationApi.getSummary(dateParams)
      setSummary(res)
    } catch (e) { console.error(e) }
  }, [dateParams, dateValidation.valid])

  const fetchProjects = useCallback(async () => {
    if (!dateValidation.valid) return
    setLoading(true)
    try {
      const res = await reconciliationApi.getProjects(dateParams)
      setProjects(res?.list || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [dateParams, dateValidation.valid])

  const fetchMaterials = useCallback(async () => {
    if (!dateValidation.valid) return
    setLoading(true)
    try {
      const res = await reconciliationApi.getMaterials(dateParams)
      setMaterials(res?.list || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [dateParams, dateValidation.valid])

  const { get, getNumber, setMultiple } = useUrlParams()

  const caseFetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      if (activeTab !== 'case') return { list: [], pagination: { total: 0, page, pageSize } }
      if (!dateValidation.valid) return { list: [], pagination: { total: 0, page, pageSize } }
      const res = await reconciliationApi.getCases({
        page,
        pageSize,
        ...dateParams,
        ...(caseSearch && { search: caseSearch }),
        ...(caseFilterProject && { projectId: caseFilterProject }),
        ...(caseFilterStatus && { status: caseFilterStatus }),
      })
      return { list: res?.list || [], pagination: res?.pagination }
    },
    [activeTab, dateParams, dateValidation.valid, caseSearch, caseFilterProject, caseFilterStatus]
  )

  const casePagination = usePagination<LisCase>({
    fetchFn: caseFetchFn,
    initialPage: Math.max(1, getNumber('cpage', 1)),
    initialPageSize: Math.max(1, Math.min(100, getNumber('cpageSize', 20))),
    deps: [activeTab, caseSearch, caseFilterProject, caseFilterStatus],
  })

  const logFetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      if (activeTab !== 'log') return { list: [], pagination: { total: 0, page, pageSize } }
      if (!dateValidation.valid) return { list: [], pagination: { total: 0, page, pageSize } }
      const res = await reconciliationApi.getLogs({ page, pageSize, ...dateParams })
      return { list: res?.list || [], pagination: res?.pagination }
    },
    [activeTab, dateParams, dateValidation.valid]
  )

  const logPagination = usePagination<ReconcileLog>({
    fetchFn: logFetchFn,
    initialPage: Math.max(1, getNumber('lpage', 1)),
    initialPageSize: Math.max(1, Math.min(100, getNumber('lpageSize', 20))),
    deps: [activeTab, dateParams, dateValidation.valid],
  })

  useEffect(() => {
    fetchSummary()
    if (activeTab === 'reconcile' || activeTab === 'case') fetchProjects()
    if (activeTab === 'material') fetchMaterials()
  }, [activeTab, fetchSummary, fetchProjects, fetchMaterials])

  useEffect(() => {
    setMultiple({
      cpage: casePagination.page === 1 ? null : String(casePagination.page),
      cpageSize: casePagination.pageSize === 20 ? null : String(casePagination.pageSize),
      csearch: caseSearch || null,
      cproject: caseFilterProject || null,
      cstatus: caseFilterStatus || null,
      lpage: logPagination.page === 1 ? null : String(logPagination.page),
      lpageSize: logPagination.pageSize === 20 ? null : String(logPagination.pageSize),
    })
  }, [casePagination.page, casePagination.pageSize, caseSearch, caseFilterProject, caseFilterStatus, logPagination.page, logPagination.pageSize])

  const loadProjectMaterials = async (projectId: string) => {
    if (!dateValidation.valid) {
      toast.error(dateValidation.message)
      return
    }
    if (projectMaterials[projectId]) {
      setExpandedProject(expandedProject === projectId ? null : projectId)
      return
    }
    try {
      const res = await reconciliationApi.getProjectMaterials(projectId, dateParams)
      setProjectMaterials(prev => ({ ...prev, [projectId]: res?.list || [] }))
      setExpandedProject(projectId)
    } catch (e) { toast.error('加载物料明细失败') }
  }

  const handleAuditProject = async (projectId: string) => {
    if (!dateValidation.valid) {
      toast.error(dateValidation.message)
      return
    }
    setAuditingProjectId(projectId)
    try {
      const res = await reconciliationApi.auditProjectMaterials(projectId, dateParams)
      toast.success(`审计完成：新增 ${res?.created || 0}，更新 ${res?.updated || 0}，关闭 ${res?.resolved || 0}`)
      const detail = await reconciliationApi.getProjectMaterials(projectId, dateParams)
      setProjectMaterials(prev => ({ ...prev, [projectId]: detail?.list || [] }))
      fetchSummary()
    } catch (e: any) {
      toast.error(e?.message || '对账审计失败')
    } finally {
      setAuditingProjectId(null)
    }
  }

  const handleExport = async (options: ReconciliationExportOptions = { format: 'csv', scope: 'filtered' }) => {
    if (options.scope === 'filtered' && !dateValidation.valid) {
      toast.error(dateValidation.message)
      return
    }
    setExporting(true)
    try {
      const params = buildReconciliationExportParams({
        activeTab,
        dateParams,
        caseSearch,
        caseFilterProject,
        caseFilterStatus,
        format: options.format,
        scope: options.scope,
      })
      const blob = await reconciliationApi.exportData(params)
      const filename = buildReconciliationExportFilename(params, options.format)
      if (options.format === 'xlsx') {
        const XLSX = await import('xlsx')
        const content = await blob.text()
        const workbook = XLSX.read(content, { type: 'string' })
        XLSX.writeFile(workbook, filename)
      } else {
        downloadBlobFile(blob, filename)
      }
      toast.success('已导出对账数据')
    } catch (e: any) {
      toast.error(e?.message || '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async () => {
    try {
      const raw = importData.trim()
      if (!raw) {
        setImportErrors([])
        toast.error('请先粘贴或选择LIS数据文件')
        return
      }

      const items = parseLisImportData(raw)

      if (items.length === 0) {
        toast.error('未解析到有效病例数据')
        return
      }

      const validation = buildLisImportValidation(items)
      if (validation.errors.length > 0) {
        setImportErrors(validation.errors)
        toast.error(`发现 ${validation.errors.length} 条无效LIS数据，请修正后再导入`)
        return
      }

      const res = importFile
        ? await reconciliationApi.importLisFile(importFile)
        : await reconciliationApi.importCases({ items: validation.validItems })
      const unmatched = Number(res?.unmatched || 0)
      const importedCount = res?.count || res?.imported || items.length
      toast.success(`成功导入 ${importedCount} 条病例数据${unmatched > 0 ? `，${unmatched} 条未匹配项目` : ''}`)
      setImportModalOpen(false)
      setImportData('')
      setImportFile(null)
      setImportErrors([])
      const refreshTargets = getLisImportRefreshTargets(activeTab)
      if (refreshTargets.clearProjectMaterials) {
        setProjectMaterials({})
        setExpandedProject(null)
      }
      await Promise.all([
        refreshTargets.summary ? fetchSummary() : Promise.resolve(),
        refreshTargets.projects ? fetchProjects() : Promise.resolve(),
        refreshTargets.materials ? fetchMaterials() : Promise.resolve(),
      ])
      if (refreshTargets.cases) casePagination.refresh()
    } catch (e: any) {
      toast.error(e?.message || '导入失败')
    }
  }

  const updateImportData = (value: string) => {
    setImportData(value)
    setImportFile(null)
    if (importErrors.length > 0) setImportErrors([])
  }

  const getDiffClass = (status: string) => {
    switch (status) {
      case 'match': return 'text-green-600 bg-green-50'
      case 'warn': return 'text-yellow-600 bg-yellow-50'
      case 'danger': return 'text-red-600 bg-red-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, string> = {
      normal: 'bg-green-50 text-green-600',
      modified: 'bg-yellow-50 text-yellow-600',
      unmatched: 'bg-red-50 text-red-600',
      partial: 'bg-yellow-50 text-yellow-600',
    }
    return map[status] || 'bg-gray-50 text-gray-600'
  }

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      normal: '正常', modified: '已修改', unmatched: '未关联', partial: '部分异常',
    }
    return map[status] || status
  }

  const handleFixBom = async () => {
    if (!fixTarget || !fixTargetProjectId) return
    if (!fixReason.trim()) {
      toast.error('请填写修正原因')
      return
    }
    if (!Number.isFinite(fixNewUsage) || fixNewUsage <= 0) {
      toast.error('修正用量必须大于0')
      return
    }
    if (!fixNewUnit) {
      toast.error('请选择修正单位')
      return
    }
    try {
      await reconciliationApi.createLog({
        type: 'bom_fix',
        targetId: fixTarget.materialId,
        targetName: fixTarget.materialName,
        field: 'usage_per_sample,unit',
        oldValue: `${fixTarget.bomUsagePerSample} ${fixTarget.bomUnit}`,
        newValue: `${fixNewUsage} ${fixNewUnit}`,
        reason: fixReason,
        projectId: fixTargetProjectId,
        materialId: fixTarget.materialId,
        newUsage: fixNewUsage,
        newUnit: fixNewUnit,
      })
      toast.success('BOM用量已修正')
      setFixBomModalOpen(false)
      setFixTarget(null)
      setFixTargetProjectId(null)
      if (activeTab === 'reconcile') {
        const res = await reconciliationApi.getProjectMaterials(fixTargetProjectId, dateParams)
        setProjectMaterials(prev => ({ ...prev, [fixTargetProjectId]: res?.list || [] }))
      }
      if (activeTab === 'material') fetchMaterials()
    } catch (e: any) {
      toast.error(e?.message || '修正失败')
    }
  }

  const handleEditCase = async () => {
    if (!editCaseTarget) return
    try {
      await reconciliationApi.updateCase(editCaseTarget.id, {
        ...(editCaseProjectId && { projectId: editCaseProjectId }),
        ...(editCaseStatus && { status: editCaseStatus }),
      })
      toast.success('病例信息已更新')
      setEditCaseModalOpen(false)
      setEditCaseTarget(null)
      casePagination.refresh()
    } catch (e: any) {
      toast.error(e?.message || '更新失败')
    }
  }

  const openFixBomModal = (mat: MaterialDiff, projectId: string) => {
    setFixTarget(mat)
    setFixTargetProjectId(projectId)
    setFixNewUsage(mat.bomUsagePerSample)
    setFixNewUnit(mat.bomUnit)
    setFixReason('')
    setFixBomModalOpen(true)
  }

  const openEditCaseModal = (c: LisCase) => {
    setEditCaseTarget(c)
    setEditCaseProjectId(c.project_id || '')
    setEditCaseStatus(c.status || '')
    setEditCaseModalOpen(true)
  }

  const resetCaseFilters = () => {
    setCaseSearch('')
    setCaseFilterProject('')
    setCaseFilterStatus('')
    casePagination.setPage(1)
  }

  return {
    activeTab,
    setActiveTab,
    period,
    setPeriod,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    loading,
    exporting,
    auditingProjectId,
    summary,
    projects,
    expandedProject,
    projectMaterials,
    materials,
    caseSearch,
    setCaseSearch,
    caseFilterProject,
    setCaseFilterProject,
    caseFilterStatus,
    setCaseFilterStatus,
    casePagination,
    logPagination,
    importModalOpen,
    setImportModalOpen,
    importFile,
    setImportFile,
    fixBomModalOpen,
    setFixBomModalOpen,
    editCaseModalOpen,
    setEditCaseModalOpen,
    importData,
    setImportData: updateImportData,
    importErrors,
    fixTarget,
    fixTargetProjectId,
    fixNewUsage,
    setFixNewUsage,
    fixNewUnit,
    setFixNewUnit,
    fixReason,
    setFixReason,
    editCaseTarget,
    editCaseProjectId,
    setEditCaseProjectId,
    editCaseStatus,
    setEditCaseStatus,
    loadProjectMaterials,
    handleAuditProject,
    handleExport,
    handleImport,
    handleFixBom,
    handleEditCase,
    getDiffClass,
    getStatusBadge,
    getStatusLabel,
    openFixBomModal,
    openEditCaseModal,
    resetCaseFilters,
    dateParams,
    dateValidation,
    fetchSummary,
    fetchMaterials,
    setProjectMaterials,
  }
}
