import { useCallback, useEffect, useState } from 'react'
import { bomApi, projectApi } from '@/api/master'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import type { BOM, Project, ProjectDeleteCheck, ProjectStatusCheck } from '@/types'
import { toast } from 'sonner'
import { getUserPermissions, getUserRole } from '@/lib/permissions'

export interface FormData {
  type: string
  code: string
  name: string
  cycle: string
  manager: string
  status: 'active' | 'inactive'
  description: string
  bomId: string
}

export interface ProjectImportRow {
  type: string
  code: string
  name: string
  cycle?: string
  manager?: string
  status: 'active' | 'inactive'
  description?: string
  bomId?: string
}

export type ProjectModalType = 'create' | 'edit' | 'copy' | 'delete' | 'import' | null

interface ProjectStats {
  total: number
  active: number
  inactive: number
  noBom: number
}

export type ProjectBatchStatusAction = 'active' | 'inactive'

export interface ProjectBatchStatusResult {
  project: Project
  check: ProjectStatusCheck | null
  error?: string
}

const defaultForm: FormData = {
  type: 'he',
  code: '',
  name: '',
  cycle: '',
  manager: '',
  status: 'active',
  description: '',
  bomId: '',
}

const getValidStatus = (value: string | null) =>
  value === 'active' || value === 'inactive' ? value : ''

function canManageProjects(role: string | null, permissions: string[]): boolean {
  return (
    role === 'admin' ||
    role === 'technician' ||
    permissions.includes('*') ||
    permissions.includes('projects') ||
    permissions.includes('projects:add') ||
    permissions.includes('projects:edit') ||
    permissions.includes('projects:delete')
  )
}

export function useProjectsPage() {
  const { get, getNumber, setMultiple } = useUrlParams()
  const canWrite = canManageProjects(getUserRole(), getUserPermissions())

  const [keyword, setKeyword] = useState(get('keyword') || '')
  const [typeFilter, setTypeFilter] = useState(get('type') || '')
  const [statusFilter, setStatusFilter] = useState(getValidStatus(get('status')))
  const [bomFilter, setBomFilter] = useState(get('bom') === 'configured' || get('bom') === 'unconfigured' ? get('bom')! : '')
  const includeDeleted = get('includeDeleted') === 'true'

  const [boms, setBoms] = useState<BOM[]>([])
  const [stats, setStats] = useState<ProjectStats>({
    total: 0,
    active: 0,
    inactive: 0,
    noBom: 0,
  })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [modalType, setModalType] = useState<ProjectModalType>(null)
  const [editingRow, setEditingRow] = useState<Project | null>(null)
  const [deleteCheck, setDeleteCheck] = useState<ProjectDeleteCheck | null>(null)
  const [checkingDelete, setCheckingDelete] = useState(false)
  const [statusTarget, setStatusTarget] = useState<Project | null>(null)
  const [statusTargetStatus, setStatusTargetStatus] = useState<'active' | 'inactive'>('inactive')
  const [statusCheck, setStatusCheck] = useState<ProjectStatusCheck | null>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [pendingEditStatusPayload, setPendingEditStatusPayload] = useState<ReturnType<typeof buildPayload> | null>(null)
  const [batchStatusAction, setBatchStatusAction] = useState<ProjectBatchStatusAction | null>(null)
  const [batchStatusTargets, setBatchStatusTargets] = useState<Project[]>([])
  const [batchStatusResults, setBatchStatusResults] = useState<ProjectBatchStatusResult[]>([])
  const [checkingBatchStatus, setCheckingBatchStatus] = useState(false)
  const [submittingBatchStatus, setSubmittingBatchStatus] = useState(false)
  const [form, setForm] = useState<FormData>(defaultForm)
  const [createStep, setCreateStep] = useState(1)
  const [editTab, setEditTab] = useState<'basic' | 'bom'>('basic')
  const [bomOption, setBomOption] = useState<'select' | 'create' | 'skip'>('select')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const urlPage = Math.max(1, getNumber('page', 1))
  const urlPageSize = [10, 20, 50, 100].includes(getNumber('pageSize', 20))
    ? getNumber('pageSize', 20)
    : 20

  const fetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const params: Record<string, string | number | boolean> = { page, pageSize }
      if (keyword.trim()) params.keyword = keyword.trim()
      if (typeFilter) params.type = typeFilter
      if (statusFilter) params.status = statusFilter
      if (bomFilter) params.bomFilter = bomFilter
      if (includeDeleted) params.includeDeleted = true

      const res = await projectApi.getList(params)
      return { list: res.list || [], pagination: res.pagination }
    },
    [keyword, typeFilter, statusFilter, bomFilter, includeDeleted]
  )

  const {
    data,
    loading,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    refresh,
  } = usePagination<Project>({
    fetchFn,
    initialPage: urlPage,
    initialPageSize: urlPageSize,
    deps: [keyword, typeFilter, statusFilter, bomFilter, includeDeleted],
  })

  useEffect(() => {
    setMultiple({
      page: page > 1 ? page : null,
      pageSize: pageSize !== 20 ? pageSize : null,
      keyword: keyword || null,
      type: typeFilter || null,
      status: statusFilter || null,
      bom: bomFilter || null,
    })
  }, [page, pageSize, keyword, typeFilter, statusFilter, bomFilter, setMultiple])

  const fetchRefs = useCallback(async () => {
    try {
      const [bomRes] = await Promise.all([
        bomApi.getList({ page: 1, pageSize: 1000, status: 'active' }),
      ])
      setBoms(bomRes.list || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    fetchRefs()
  }, [fetchRefs])

  const loadStats = useCallback(async () => {
    try {
      const params: { keyword?: string; type?: string; status?: string; bomFilter?: string; includeDeleted?: boolean } = {}
      if (keyword.trim()) params.keyword = keyword.trim()
      if (typeFilter) params.type = typeFilter
      if (statusFilter) params.status = statusFilter
      if (bomFilter) params.bomFilter = bomFilter
      if (includeDeleted) params.includeDeleted = true
      const res = await projectApi.getStats(params)
      setStats({
        total: Number(res.total || 0),
        active: Number(res.active || 0),
        inactive: Number(res.inactive || 0),
        noBom: Number(res.noBom || 0),
      })
    } catch (e) {
      console.error(e)
    }
  }, [keyword, typeFilter, statusFilter, bomFilter, includeDeleted])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const resetForm = () => {
    setForm(defaultForm)
    setBomOption('select')
    setCreateStep(1)
    setEditTab('basic')
  }

  const fillForm = (row: Project) => {
    setForm({
      type: row.type || 'he',
      code: row.code || '',
      name: row.name || '',
      cycle: row.cycle || '',
      manager: row.manager || '',
      status: row.status || 'active',
      description: row.description || '',
      bomId: row.bomId || '',
    })
  }

  const openCreate = () => {
    if (!canWrite) {
      toast.error('当前角色只能查看检测服务')
      return
    }
    setEditingRow(null)
    resetForm()
    setModalType('create')
  }

  const openEdit = (row: Project) => {
    if (!canWrite) {
      toast.error('当前角色只能查看检测服务')
      return
    }
    setEditingRow(row)
    fillForm(row)
    setEditTab('basic')
    setModalType('edit')
  }

  const openCopy = (row: Project) => {
    if (!canWrite) {
      toast.error('当前角色只能查看检测服务')
      return
    }
    setEditingRow(row)
    fillForm({
      ...row,
      code: `${row.code}-COPY-${Date.now().toString().slice(-4)}`,
      name: `${row.name} 副本`,
    })
    setModalType('copy')
  }

  const openDelete = async (row: Project) => {
    if (!canWrite) {
      toast.error('当前角色只能查看检测服务')
      return
    }
    setEditingRow(row)
    setDeleteCheck(null)
    setModalType('delete')
    setCheckingDelete(true)
    try {
      const check = await projectApi.checkDeletable(row.id)
      setDeleteCheck(check)
    } catch (e) {
      toast.error('删除影响检查失败')
    } finally {
      setCheckingDelete(false)
    }
  }

  const closeModal = () => {
    setModalType(null)
    setEditingRow(null)
    setDeleteCheck(null)
    setCheckingDelete(false)
    resetForm()
  }

  function buildPayload() {
    return {
    type: form.type,
    code: form.code.trim(),
    name: form.name.trim(),
    cycle: form.cycle.trim(),
    manager: form.manager.trim(),
    status: form.status,
    description: form.description.trim(),
    bomId: form.bomId || undefined,
    }
  }

  const handleSubmit = async () => {
    if (!canWrite) {
      toast.error('当前角色只能查看检测服务')
      return
    }
    if (!form.type || !form.code.trim() || !form.name.trim()) {
      toast.error('请填写必填字段')
      return
    }

    const payload = buildPayload()
    if ((modalType === 'edit' || modalType === 'copy') && editingRow && modalType === 'edit') {
      payload.code = editingRow.code
    }
    if (modalType === 'edit' && editingRow && payload.status !== editingRow.status) {
      setPendingEditStatusPayload(payload)
      setStatusTarget({
        ...editingRow,
        ...payload,
        bomId: payload.bomId || '',
      })
      setStatusTargetStatus(payload.status)
      setStatusCheck(null)
      setCheckingStatus(true)
      try {
        const check = await projectApi.checkStatus(editingRow.id, payload.status)
        setStatusCheck(check)
      } catch (e) {
        toast.error('状态变更影响检查失败')
      } finally {
        setCheckingStatus(false)
      }
      return
    }

    setIsSubmitting(true)
    try {
      if (modalType === 'edit' && editingRow) {
        await projectApi.update(editingRow.id, payload)
        toast.success('检测服务更新成功')
      } else {
        await projectApi.create(payload)
        toast.success(modalType === 'copy' ? '检测服务复制成功' : '检测服务创建成功')
      }
      setSelectedIds(new Set())
      closeModal()
      refresh()
      fetchRefs()
      loadStats()
    } catch (e) {
      toast.error('操作失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!canWrite) {
      toast.error('当前角色只能查看检测服务')
      return
    }
    if (!editingRow) return
    if (deleteCheck && !deleteCheck.deletable) {
      toast.error('该检测服务存在业务引用，不能删除')
      return
    }
    setIsSubmitting(true)
    try {
      await projectApi.delete(editingRow.id)
      toast.success('检测服务删除成功')
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(editingRow.id)
        return next
      })
      closeModal()
      refresh()
      fetchRefs()
      loadStats()
    } catch (e) {
      toast.error('删除失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  const openStatus = async (row: Project) => {
    if (!canWrite) {
      toast.error('当前角色只能查看检测服务')
      return
    }
    const targetStatus = row.status === 'active' ? 'inactive' : 'active'
    setStatusTarget(row)
    setStatusTargetStatus(targetStatus)
    setStatusCheck(null)
    setCheckingStatus(true)
    try {
      const check = await projectApi.checkStatus(row.id, targetStatus)
      setStatusCheck(check)
    } catch (e) {
      toast.error('状态变更影响检查失败')
    } finally {
      setCheckingStatus(false)
    }
  }

  const closeStatusModal = () => {
    if (updatingStatus) return
    setStatusTarget(null)
    setStatusCheck(null)
    setCheckingStatus(false)
    setPendingEditStatusPayload(null)
  }

  const handleStatusConfirm = async () => {
    if (!canWrite) {
      toast.error('当前角色只能查看检测服务')
      return
    }
    if (!statusTarget || !statusCheck?.canChange) return
    setUpdatingStatus(true)
    try {
      if (pendingEditStatusPayload) {
        await projectApi.update(statusTarget.id, pendingEditStatusPayload)
        toast.success('检测服务更新成功')
        closeModal()
      } else {
        await projectApi.update(statusTarget.id, {
          code: statusTarget.code,
          name: statusTarget.name,
          type: statusTarget.type,
          status: statusTargetStatus,
        })
        toast.success(statusTargetStatus === 'active' ? '检测服务已启用' : '检测服务已停用')
      }
      setStatusTarget(null)
      setStatusCheck(null)
      setPendingEditStatusPayload(null)
      setSelectedIds(prev => {
        const next = new Set(prev)
        next.delete(statusTarget.id)
        return next
      })
      refresh()
      fetchRefs()
      loadStats()
    } catch (e) {
      toast.error('操作失败')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const toggleSelectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(data.map(project => project.id)) : new Set())
  }

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const batchSetStatus = async (status: 'active' | 'inactive') => {
    if (!canWrite) {
      toast.error('当前角色只能查看检测服务')
      return
    }
    if (selectedIds.size === 0) return
    const targets = data.filter(project => selectedIds.has(project.id))
    setBatchStatusAction(status)
    setBatchStatusTargets(targets)
    setBatchStatusResults([])
    setCheckingBatchStatus(true)
    try {
      const results = await Promise.all(targets.map(async project => {
        try {
          const check = await projectApi.checkStatus(project.id, status)
          return { project, check }
        } catch {
          return { project, check: null, error: '状态影响检查失败' }
        }
      }))
      setBatchStatusResults(results)
    } finally {
      setCheckingBatchStatus(false)
    }
  }

  const closeBatchStatusModal = () => {
    if (submittingBatchStatus) return
    setBatchStatusAction(null)
    setBatchStatusTargets([])
    setBatchStatusResults([])
    setCheckingBatchStatus(false)
  }

  const confirmBatchStatus = async () => {
    if (!canWrite) {
      toast.error('当前角色只能查看检测服务')
      return
    }
    if (!batchStatusAction || batchStatusTargets.length === 0) return
    setSubmittingBatchStatus(true)
    try {
      await projectApi.batchStatus(batchStatusTargets.map(project => project.id), batchStatusAction)
      toast.success(batchStatusAction === 'active' ? '批量启用成功' : '批量停用成功')
      setSelectedIds(new Set())
      setBatchStatusAction(null)
      setBatchStatusTargets([])
      setBatchStatusResults([])
      refresh()
      fetchRefs()
      loadStats()
    } catch (e) {
      toast.error('批量操作失败')
    } finally {
      setSubmittingBatchStatus(false)
    }
  }

  const handleImportProjects = async (rows: ProjectImportRow[]) => {
    if (!canWrite) {
      toast.error('当前角色只能查看检测服务')
      return { success: 0, failed: rows.length }
    }
    setIsSubmitting(true)
    let success = 0
    let failed = 0

    try {
      for (const row of rows) {
        try {
          await projectApi.create({
            type: row.type,
            code: row.code.trim(),
            name: row.name.trim(),
            cycle: row.cycle?.trim() || undefined,
            manager: row.manager?.trim() || undefined,
            status: row.status,
            description: row.description?.trim() || undefined,
            bomId: row.bomId || undefined,
          })
          success += 1
        } catch {
          failed += 1
        }
      }

      if (success > 0) {
        setModalType(null)
        refresh()
        fetchRefs()
        loadStats()
      }

      if (failed === 0) {
        toast.success('导入成功', { description: `已创建 ${success} 个检测服务` })
      } else {
        toast.warning('导入完成', { description: `成功 ${success} 条，失败 ${failed} 条` })
      }

      return { success, failed }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleQuery = () => {
    setPage(1)
    refresh()
  }

  const handleReset = () => {
    setKeyword('')
    setTypeFilter('')
    setStatusFilter('')
    setBomFilter('')
    setSelectedIds(new Set())
    setPage(1)
  }

  return {
    data,
    canWrite,
    loading,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    refresh,
    keyword,
    setKeyword,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    bomFilter,
    setBomFilter,
    selectedIds,
    setSelectedIds,
    modalType,
    setModalType,
    editingRow,
    setEditingRow,
    deleteCheck,
    checkingDelete,
    statusTarget,
    statusTargetStatus,
    statusCheck,
    checkingStatus,
    updatingStatus,
    batchStatusAction,
    batchStatusTargets,
    batchStatusResults,
    checkingBatchStatus,
    submittingBatchStatus,
    form,
    setForm,
    createStep,
    setCreateStep,
    editTab,
    setEditTab,
    bomOption,
    setBomOption,
    boms,
    isSubmitting,
    stats,
    handleQuery,
    handleReset,
    openCreate,
    openEdit,
    openCopy,
    openDelete,
    openStatus,
    closeModal,
    closeStatusModal,
    closeBatchStatusModal,
    handleSubmit,
    handleDeleteConfirm,
    handleStatusConfirm,
    confirmBatchStatus,
    toggleSelectAll,
    toggleSelectOne,
    batchEnable: () => batchSetStatus('active'),
    batchDisable: () => batchSetStatus('inactive'),
    handleImportProjects,
  }
}
