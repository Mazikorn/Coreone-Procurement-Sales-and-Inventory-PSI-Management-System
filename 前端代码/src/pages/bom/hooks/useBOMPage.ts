import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import { bomApi, materialApi } from '@/api/master'
import type { BOM, Material } from '@/types'

export type ModalType =
  | null
  | 'create'
  | 'edit'
  | 'detail'
  | 'copy'
  | 'delete'
  | 'batchDelete'
  | 'import'
  | 'export'

export interface BOMForm {
  code: string
  name: string
  type: string
  version: string
  status: 'active' | 'inactive'
  description: string
  serviceId: string
  feeCategory: string
  standardSlideCost: number
  standardFeePerSlide: number
  supportableSamples: number
  materials: BOMFormMaterial[]
  generalReagents: BOMExtMaterial[]
  generalConsumables: BOMExtMaterial[]
  qualityControls: BOMQualityControlForm[]
}

export interface BOMFormMaterial {
  materialId: string
  name: string
  spec: string
  usagePerSample: number
  unit: string
  groupName: string
}

export interface BOMExtMaterial {
  materialId: string
  name: string
  spec: string
  usagePerSample: number
  unit: string
}

export interface BOMQualityControlForm {
  materialId: string
  name: string
  spec: string
  usagePerBatch: number
  unit: string
  coversSamples: number
}

export interface CopyForm {
  sourceId: string
  newCode: string
  newName: string
  name: string
  copyInfo: boolean
  copyMaterials: boolean
}

const createEmptyForm = (): BOMForm => ({
  code: '',
  name: '',
  type: 'standard',
  version: 'v1.0',
  status: 'active',
  description: '',
  serviceId: '',
  feeCategory: '',
  standardSlideCost: 0,
  standardFeePerSlide: 0,
  supportableSamples: 0,
  materials: [],
  generalReagents: [],
  generalConsumables: [],
  qualityControls: [],
})

function toForm(row?: BOM | null): BOMForm {
  const form = createEmptyForm()
  if (!row) return form

  return {
    ...form,
    code: row.code || '',
    name: row.name || '',
    type: row.type || form.type,
    version: row.version || form.version,
    status: row.status || form.status,
    description: row.description || '',
    serviceId: row.serviceId || '',
    feeCategory: row.feeCategory || '',
    standardSlideCost: row.standardSlideCost || 0,
    standardFeePerSlide: row.standardFeePerSlide || 0,
    supportableSamples: row.supportableSamples || 0,
    materials: (row.materials || []).map((m: any) => ({
      materialId: m.materialId || m.id || '',
      name: m.name || '',
      spec: m.spec || '',
      usagePerSample: m.usagePerSample || 0,
      unit: m.unit || '',
      groupName: m.groupName || '',
    })),
    generalReagents: (row.generalReagents || []).map((m: any) => ({
      materialId: m.materialId || m.id || '',
      name: m.name || '',
      spec: m.spec || '',
      usagePerSample: m.usagePerSample || 0,
      unit: m.unit || '',
    })),
    generalConsumables: (row.generalConsumables || []).map((m: any) => ({
      materialId: m.materialId || m.id || '',
      name: m.name || '',
      spec: m.spec || '',
      usagePerSample: m.usagePerSample || 0,
      unit: m.unit || '',
    })),
    qualityControls: (row.qualityControls || []).map((m: any) => ({
      materialId: m.materialId || m.id || '',
      name: m.name || '',
      spec: m.spec || '',
      usagePerBatch: m.usagePerBatch || 0,
      unit: m.unit || '',
      coversSamples: m.coversSamples || 1,
    })),
  }
}

export function useBOMPage() {
  const url = useUrlParams()

  const initialPage = Math.max(1, url.getNumber('page', 1))
  const initialPageSize = [10, 20, 50, 100].includes(url.getNumber('pageSize', 20))
    ? url.getNumber('pageSize', 20)
    : 20

  const [keyword, setKeyword] = useState(url.get('keyword', ''))
  const [searchInput, setSearchInput] = useState(url.get('keyword', ''))
  const [quickFilter, setQuickFilter] = useState<'all' | 'active' | 'inactive'>(
    (url.get('quickFilter', 'all') as 'all' | 'active' | 'inactive') || 'all'
  )
  const [filterType, setFilterType] = useState(url.get('type', ''))
  const [filterStatus, setFilterStatus] = useState(url.get('status', ''))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [modalType, setModalType] = useState<ModalType>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailBom, setDetailBom] = useState<BOM | null>(null)
  const [detailTab, setDetailTab] = useState<'info' | 'history' | 'usage'>('info')
  const [form, setForm] = useState<BOMForm>(createEmptyForm)
  const [copyForm, setCopyForm] = useState<CopyForm>({
    sourceId: '',
    newCode: '',
    newName: '',
    name: '',
    copyInfo: true,
    copyMaterials: true,
  })
  const [allMaterials, setAllMaterials] = useState<Material[]>([])

  const effectiveStatus =
    filterStatus && filterStatus !== 'all'
      ? filterStatus
      : quickFilter !== 'all'
      ? quickFilter
      : undefined
  const effectiveType = filterType && filterType !== 'all' ? filterType : undefined

  const {
    data,
    loading,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    refresh,
  } = usePagination<BOM>({
    fetchFn: async (params) => {
      const res = await bomApi.getList({
        ...params,
        keyword: keyword || undefined,
        type: effectiveType,
        status: effectiveStatus,
      })
      return {
        list: res?.list || [],
        pagination: res?.pagination,
      }
    },
    initialPage,
    initialPageSize,
    deps: [keyword, effectiveType, effectiveStatus],
  })

  useEffect(() => {
    let cancelled = false
    materialApi.getList({ page: 1, pageSize: 1000, status: 'active' })
      .then((res) => {
        if (!cancelled) setAllMaterials(res?.list || [])
      })
      .catch(() => {
        if (!cancelled) setAllMaterials([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    url.setMultiple({
      page: page > 1 ? page : null,
      pageSize: pageSize !== 20 ? pageSize : null,
      keyword: keyword || null,
      type: effectiveType || null,
      status: filterStatus && filterStatus !== 'all' ? filterStatus : null,
      quickFilter: quickFilter !== 'all' ? quickFilter : null,
    })
  }, [page, pageSize, keyword, effectiveType, filterStatus, quickFilter])

  function getMaterialStatus(bom: BOM): 'sufficient' | 'low' | 'insufficient' | 'missing' {
    if (bom.status === 'inactive') return 'missing'
    if (bom.supportableSamples === undefined || bom.supportableSamples === null) return 'missing'
    if (bom.supportableSamples === 0) return 'insufficient'
    if (bom.supportableSamples < 30) return 'low'
    return 'sufficient'
  }

  const stats = useMemo(() => {
    const sufficient = data.filter((b) => getMaterialStatus(b) === 'sufficient').length
    const low = data.filter((b) => getMaterialStatus(b) === 'low').length
    const insufficient = data.filter((b) => {
      const status = getMaterialStatus(b)
      return status === 'insufficient' || status === 'missing'
    }).length
    return { total: data.length, sufficient, low, insufficient }
  }, [data])

  const isAllSelected = data.length > 0 && selectedIds.size === data.length
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < data.length

  const toggleSelectAll = () => {
    setSelectedIds(isAllSelected ? new Set() : new Set(data.map((d) => d.id)))
  }

  const toggleSelectRow = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const cancelSelection = () => setSelectedIds(new Set())

  const handleSearch = () => {
    setKeyword(searchInput)
    setPage(1)
  }

  const handleReset = () => {
    setSearchInput('')
    setKeyword('')
    setFilterType('')
    setFilterStatus('')
    setQuickFilter('all')
    setPage(1)
  }

  const openCreate = () => {
    setEditingId(null)
    setDetailBom(null)
    setForm(createEmptyForm())
    setModalType('create')
  }

  const openEdit = (row: BOM) => {
    setEditingId(row.id)
    setDetailBom(row)
    setForm(toForm(row))
    setModalType('edit')
  }

  const openDetail = async (row: BOM) => {
    try {
      const res = await bomApi.getDetail(row.id)
      setDetailBom(res || row)
    } catch {
      setDetailBom(row)
    }
    setDetailTab('info')
    setModalType('detail')
  }

  const openCopy = (row: BOM) => {
    setEditingId(row.id)
    setCopyForm({
      sourceId: row.id,
      newCode: '',
      newName: `${row.name}(副本)`,
      name: `${row.name}(副本)`,
      copyInfo: true,
      copyMaterials: true,
    })
    setModalType('copy')
  }

  const openDelete = (row: BOM) => {
    setEditingId(row.id)
    setModalType('delete')
  }

  const openBatchDelete = () => {
    if (selectedIds.size === 0) {
      toast.warning('请先选择要删除的BOM')
      return
    }
    setModalType('batchDelete')
  }

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('请填写必填项')
      return
    }
    try {
      if (editingId) {
        await bomApi.update(editingId, form as unknown as Partial<BOM>)
        toast.success('BOM更新成功')
      } else {
        await bomApi.create(form as unknown as Partial<BOM>)
        toast.success('BOM创建成功')
      }
      setModalType(null)
      refresh()
    } catch {
      toast.error('操作失败')
    }
  }

  const handleDelete = async () => {
    if (!editingId) return
    try {
      await bomApi.delete(editingId)
      toast.success('BOM已删除')
      setModalType(null)
      setEditingId(null)
      refresh()
    } catch {
      toast.error('删除失败')
    }
  }

  const handleBatchDelete = async () => {
    try {
      const ids = Array.from(selectedIds)
      await Promise.all(ids.map((id) => bomApi.delete(id)))
      toast.success(`已删除 ${ids.length} 个BOM`)
      setModalType(null)
      setSelectedIds(new Set())
      refresh()
    } catch {
      toast.error('批量删除失败')
    }
  }

  const handleCopy = async () => {
    if (!editingId || !copyForm.name.trim()) {
      toast.error('请输入新BOM名称')
      return
    }
    try {
      const source = await bomApi.getDetail(editingId)
      const payload = {
        ...source,
        id: undefined,
        code: copyForm.newCode || '',
        name: copyForm.name.trim(),
        version: 'v1.0',
        description: copyForm.copyInfo ? source?.description : '',
        serviceId: copyForm.copyInfo ? source?.serviceId : '',
        materials: copyForm.copyMaterials ? source?.materials : [],
        generalReagents: copyForm.copyMaterials ? source?.generalReagents : [],
        generalConsumables: copyForm.copyMaterials ? source?.generalConsumables : [],
        qualityControls: copyForm.copyMaterials ? source?.qualityControls : [],
        status: 'active',
      }
      await bomApi.create(payload as Partial<BOM>)
      toast.success('BOM复制成功')
      setModalType(null)
      refresh()
    } catch {
      toast.error('复制失败')
    }
  }

  const handleImport = () => {
    toast.info('导入功能开发中')
    setModalType(null)
  }

  const handleExport = () => {
    toast.info('导出功能开发中')
    setModalType(null)
  }

  return {
    keyword,
    setKeyword,
    searchInput,
    setSearchInput,
    quickFilter,
    setQuickFilter,
    filterType,
    setFilterType,
    filterStatus,
    setFilterStatus,
    selectedIds,
    setSelectedIds,
    modalType,
    setModalType,
    editingId,
    setEditingId,
    detailBom,
    setDetailBom,
    detailTab,
    setDetailTab,
    form,
    setForm,
    copyForm,
    setCopyForm,
    allMaterials,
    effectiveStatus,
    data,
    loading,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    refresh,
    stats,
    isAllSelected,
    isIndeterminate,
    getMaterialStatus,
    toggleSelectAll,
    toggleSelectRow,
    cancelSelection,
    handleSearch,
    handleReset,
    openCreate,
    openEdit,
    openDetail,
    openCopy,
    openDelete,
    openBatchDelete,
    handleSubmit,
    handleDelete,
    handleBatchDelete,
    handleCopy,
    handleImport,
    handleExport,
  }
}
