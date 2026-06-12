import { useCallback, useEffect, useMemo, useState } from 'react'
import { bomApi, projectApi } from '@/api/master'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import type { BOM, Project } from '@/types'
import { toast } from 'sonner'

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

export type ProjectModalType = 'create' | 'edit' | 'copy' | 'delete' | 'import' | null

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

export function useProjectsPage() {
  const { get, getNumber, setMultiple } = useUrlParams()

  const [keyword, setKeyword] = useState(get('keyword') || '')
  const [typeFilter, setTypeFilter] = useState(get('type') || '')
  const [statusFilter, setStatusFilter] = useState(getValidStatus(get('status')))
  const [bomFilter, setBomFilter] = useState(get('bom') === 'configured' || get('bom') === 'unconfigured' ? get('bom')! : '')

  const [boms, setBoms] = useState<BOM[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [modalType, setModalType] = useState<ProjectModalType>(null)
  const [editingRow, setEditingRow] = useState<Project | null>(null)
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
      const params: Record<string, string | number> = { page, pageSize }
      if (keyword.trim()) params.keyword = keyword.trim()
      if (typeFilter) params.type = typeFilter
      if (statusFilter) params.status = statusFilter

      const res = await projectApi.getList(params)
      let list = res.list || []
      if (bomFilter === 'configured') {
        list = list.filter(project => Boolean(project.bomId))
      }
      if (bomFilter === 'unconfigured') {
        list = list.filter(project => !project.bomId)
      }
      return { list, pagination: res.pagination }
    },
    [keyword, typeFilter, statusFilter, bomFilter]
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
    deps: [keyword, typeFilter, statusFilter, bomFilter],
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
      const [projectRes, bomRes] = await Promise.all([
        projectApi.getList({ page: 1, pageSize: 1000 }),
        bomApi.getList({ page: 1, pageSize: 1000 }),
      ])
      setAllProjects(projectRes.list || [])
      setBoms(bomRes.list || [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    fetchRefs()
  }, [fetchRefs])

  const stats = useMemo(() => ({
    total: allProjects.length,
    active: allProjects.filter(project => project.status === 'active').length,
    inactive: allProjects.filter(project => project.status === 'inactive').length,
    noBom: allProjects.filter(project => !project.bomId).length,
  }), [allProjects])

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
    setEditingRow(null)
    resetForm()
    setModalType('create')
  }

  const openEdit = (row: Project) => {
    setEditingRow(row)
    fillForm(row)
    setEditTab('basic')
    setModalType('edit')
  }

  const openCopy = (row: Project) => {
    setEditingRow(row)
    fillForm({
      ...row,
      code: `${row.code}-COPY-${Date.now().toString().slice(-4)}`,
      name: `${row.name} 副本`,
    })
    setModalType('copy')
  }

  const openDelete = (row: Project) => {
    setEditingRow(row)
    setModalType('delete')
  }

  const closeModal = () => {
    setModalType(null)
    setEditingRow(null)
    resetForm()
  }

  const buildPayload = () => ({
    type: form.type,
    code: form.code.trim(),
    name: form.name.trim(),
    cycle: form.cycle.trim(),
    manager: form.manager.trim(),
    status: form.status,
    description: form.description.trim(),
    bomId: form.bomId || undefined,
  })

  const handleSubmit = async () => {
    if (!form.type || !form.code.trim() || !form.name.trim()) {
      toast.error('请填写必填字段')
      return
    }

    setIsSubmitting(true)
    try {
      const payload = buildPayload()
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
    } catch (e) {
      toast.error('操作失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteConfirm = async () => {
    if (!editingRow) return
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
    } catch (e) {
      toast.error('删除失败')
    } finally {
      setIsSubmitting(false)
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
    if (selectedIds.size === 0) return
    try {
      await Promise.all([...selectedIds].map(id => projectApi.update(id, { status })))
      toast.success(status === 'active' ? '批量启用成功' : '批量停用成功')
      setSelectedIds(new Set())
      refresh()
      fetchRefs()
    } catch (e) {
      toast.error('批量操作失败')
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
    handleSubmit,
    handleDeleteConfirm,
    toggleSelectAll,
    toggleSelectOne,
    batchEnable: () => batchSetStatus('active'),
    batchDisable: () => batchSetStatus('inactive'),
  }
}
