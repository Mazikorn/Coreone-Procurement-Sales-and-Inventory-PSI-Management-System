import { useState, useEffect, useMemo, useCallback } from 'react'
import { toast } from 'sonner'
import { reconciliationApi } from '@/api/reconciliation'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'

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

export function useReconciliationPage() {
  const [activeTab, setActiveTab] = useState<TabType>('reconcile')
  const [period, setPeriod] = useState<PeriodType>('month')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [loading, setLoading] = useState(false)

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
  const [fixTarget, setFixTarget] = useState<MaterialDiff | null>(null)
  const [fixTargetProjectId, setFixTargetProjectId] = useState<string | null>(null)
  const [fixNewUsage, setFixNewUsage] = useState<number>(0)
  const [fixNewUnit, setFixNewUnit] = useState<string>('')
  const [fixReason, setFixReason] = useState<string>('')
  const [editCaseTarget, setEditCaseTarget] = useState<LisCase | null>(null)
  const [editCaseProjectId, setEditCaseProjectId] = useState<string>('')
  const [editCaseStatus, setEditCaseStatus] = useState<string>('')

  const dateParams = useMemo(() => ({ startDate, endDate }), [startDate, endDate])

  const fetchSummary = useCallback(async () => {
    try {
      const res = await reconciliationApi.getSummary(dateParams)
      setSummary(res)
    } catch (e) { console.error(e) }
  }, [dateParams])

  const fetchProjects = useCallback(async () => {
    setLoading(true)
    try {
      const res = await reconciliationApi.getProjects(dateParams)
      setProjects(res?.list || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [dateParams])

  const fetchMaterials = useCallback(async () => {
    setLoading(true)
    try {
      const res = await reconciliationApi.getMaterials(dateParams)
      setMaterials(res?.list || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }, [dateParams])

  const { getNumber, setMultiple } = useUrlParams()

  const caseFetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      if (activeTab !== 'case') return { list: [], pagination: { total: 0, page, pageSize } }
      const res = await reconciliationApi.getCases({
        page,
        pageSize,
        ...(caseSearch && { search: caseSearch }),
        ...(caseFilterProject && { projectId: caseFilterProject }),
        ...(caseFilterStatus && { status: caseFilterStatus }),
      })
      return { list: res?.list || [], pagination: res?.pagination }
    },
    [activeTab, caseSearch, caseFilterProject, caseFilterStatus]
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
      const res = await reconciliationApi.getLogs({ page, pageSize })
      return { list: res?.list || [], pagination: res?.pagination }
    },
    [activeTab]
  )

  const logPagination = usePagination<ReconcileLog>({
    fetchFn: logFetchFn,
    initialPage: Math.max(1, getNumber('lpage', 1)),
    initialPageSize: Math.max(1, Math.min(100, getNumber('lpageSize', 20))),
    deps: [activeTab],
  })

  useEffect(() => {
    fetchSummary()
    if (activeTab === 'reconcile') fetchProjects()
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

  const handleImport = async () => {
    try {
      const lines = importData.trim().split('\n')
      const items = lines.map(line => {
        const [caseNo, projectName, operateTime, operator] = line.split(/[,\t]/)
        return { caseNo: caseNo?.trim(), projectName: projectName?.trim(), operateTime: operateTime?.trim(), operator: operator?.trim() }
      }).filter(i => i.caseNo)

      await reconciliationApi.importCases({ items })
      toast.success(`成功导入 ${items.length} 条病例数据`)
      setImportModalOpen(false)
      setImportData('')
      fetchSummary()
      if (activeTab === 'case') casePagination.refresh()
    } catch (e: any) {
      toast.error(e?.message || '导入失败')
    }
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
    try {
      await reconciliationApi.createLog({
        type: 'bom_fix',
        targetId: fixTarget.materialId,
        targetName: fixTarget.materialName,
        field: 'usage_per_sample',
        oldValue: String(fixTarget.bomUsagePerSample),
        newValue: String(fixNewUsage),
        reason: fixReason,
        projectId: fixTargetProjectId,
        materialId: fixTarget.materialId,
        newUsage: fixNewUsage,
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
    fixBomModalOpen,
    setFixBomModalOpen,
    editCaseModalOpen,
    setEditCaseModalOpen,
    importData,
    setImportData,
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
    fetchSummary,
    fetchMaterials,
    setProjectMaterials,
  }
}
