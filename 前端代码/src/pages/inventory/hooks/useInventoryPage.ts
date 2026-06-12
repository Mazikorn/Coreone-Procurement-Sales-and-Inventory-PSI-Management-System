import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { bomApi, materialApi, projectApi, userApi } from '@/api/master'
import { depletionApi, inventoryApi, outboundApi, scrapApi } from '@/api/inventory'
import type { BOM, BOMMaterial, InventoryItem, Material, Project } from '@/types'

type ActiveTab = 'in-stock' | 'in-use' | 'depleted'
type SortField = 'quantity' | 'expiry' | null
type SortDirection = 'asc' | 'desc'
type QuickFilterType = 'all' | 'low-stock' | 'expiring-soon' | 'expiring-month' | 'expired' | 'out-of-stock'
type MaterialSelectorTab = 'material' | 'bom'

type InventoryRow = InventoryItem & {
  batch?: string
  expiry?: string
}

type OutboundUsage = 'self' | 'external'

type OutboundMaterial = {
  rowId: number
  materialId: string
  name: string
  spec: string
  batch?: string
  stock: number
  quantity: number
  unit: string
  project: string
  user: string
  usage: OutboundUsage
  receiver: string
}

type DepletionItem = {
  id: string
  materialName: string
  spec: string
  batch: string
  status: string
  totalQty: number
  remaining: number
  unit: string
  daysUsed: number
  expectedDays: number
  progress: number
}

type DepletedRecord = {
  id: string
  materialName: string
  spec: string
  batch: string
  depleteType: string
  totalQty: number
  remainQty: number
  unit: string
  startDate: string
  endDate: string
  actualDays: number
}

function readPage<T>(res: unknown): { list: T[]; total: number } {
  const data = res as any
  const payload = data?.data ?? data
  const list = Array.isArray(payload) ? payload : payload?.list ?? []
  const total = payload?.pagination?.total ?? payload?.total ?? list.length
  return { list, total }
}

function readList<T>(res: unknown): T[] {
  return readPage<T>(res).list
}

function toRowId(seed: unknown) {
  const text = String(seed ?? Date.now())
  return Math.abs(text.split('').reduce((sum, char) => ((sum << 5) - sum) + char.charCodeAt(0), 0))
}

function toInventoryRow(item: any): InventoryRow {
  return {
    ...item,
    stock: Number(item.stock ?? item.quantity ?? item.availableStock ?? 0),
    availableStock: Number(item.availableStock ?? item.stock ?? item.quantity ?? 0),
    minStock: Number(item.minStock ?? 0),
    maxStock: Number(item.maxStock ?? 0),
    batch: item.batch ?? item.batchNo ?? item.batchCode ?? '-',
    expiry: item.expiry ?? item.expiryDate ?? item.expiredAt ?? undefined,
  }
}

function isExpired(row: InventoryRow) {
  if (!row.expiry || row.expiry === '-') return false
  return new Date(row.expiry).getTime() < Date.now()
}

function daysUntilExpiry(row: InventoryRow) {
  if (!row.expiry || row.expiry === '-') return Number.POSITIVE_INFINITY
  return Math.ceil((new Date(row.expiry).getTime() - Date.now()) / 86400000)
}

function toOutboundMaterial(row: InventoryRow | Material | BOMMaterial, fallbackStock = 0): OutboundMaterial {
  const anyRow = row as any
  const materialId = anyRow.materialId ?? anyRow.id
  return {
    rowId: toRowId(anyRow.rowId ?? anyRow.id ?? materialId),
    materialId,
    name: anyRow.name ?? anyRow.materialName ?? '-',
    spec: anyRow.spec ?? '-',
    batch: anyRow.batch ?? anyRow.batchNo,
    stock: Number(anyRow.stock ?? anyRow.availableStock ?? fallbackStock ?? 0),
    quantity: Math.max(1, Number(anyRow.usagePerSample ?? anyRow.quantity ?? 1)),
    unit: anyRow.unit ?? '',
    project: '',
    user: '',
    usage: 'self',
    receiver: '',
  }
}

function mapDepletionItem(row: any): DepletionItem {
  const totalQty = Number(row.totalQty ?? row.totalQuantity ?? row.quantity ?? 0)
  const remaining = Number(row.remaining ?? row.remainQty ?? row.remainingQty ?? 0)
  const progress = totalQty > 0 ? Math.min(100, Math.round(((totalQty - remaining) / totalQty) * 100)) : 0
  return {
    id: String(row.id ?? row.materialId ?? row.batchNo),
    materialName: row.materialName ?? row.name ?? '-',
    spec: row.spec ?? '-',
    batch: row.batch ?? row.batchNo ?? '-',
    status: row.status ?? (progress > 90 ? 'warning' : 'active'),
    totalQty,
    remaining,
    unit: row.unit ?? '',
    daysUsed: Number(row.daysUsed ?? row.usedDays ?? 0),
    expectedDays: Number(row.expectedDays ?? row.planDays ?? row.daysUsed ?? 0),
    progress,
  }
}

function mapDepletedRecord(row: any): DepletedRecord {
  return {
    id: String(row.id ?? row.materialId ?? row.batchNo),
    materialName: row.materialName ?? row.name ?? '-',
    spec: row.spec ?? '-',
    batch: row.batch ?? row.batchNo ?? '-',
    depleteType: row.depleteType ?? row.typeName ?? '正常用完',
    totalQty: Number(row.totalQty ?? row.totalQuantity ?? row.quantity ?? 0),
    remainQty: Number(row.remainQty ?? row.remaining ?? 0),
    unit: row.unit ?? '',
    startDate: row.startDate ?? '-',
    endDate: row.endDate ?? row.createdAt ?? '-',
    actualDays: Number(row.actualDays ?? row.daysUsed ?? 0),
  }
}

export function useInventoryPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('in-stock')
  const [data, setData] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [category, setCategory] = useState('全部分类')
  const [location, setLocation] = useState('全部库位')
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>('all')
  const [sortField, setSortField] = useState<SortField>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [selectedItem, setSelectedItem] = useState<InventoryRow | null>(null)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [outboundModalOpen, setOutboundModalOpen] = useState(false)
  const [outboundMaterials, setOutboundMaterials] = useState<OutboundMaterial[]>([])
  const [outboundRemark, setOutboundRemark] = useState('')
  const [projectList, setProjectList] = useState<Project[]>([])
  const [userList, setUserList] = useState<any[]>([])
  const [materialSelectorOpen, setMaterialSelectorOpen] = useState(false)
  const [materialSelectorTab, setMaterialSelectorTab] = useState<MaterialSelectorTab>('material')
  const [materialList, setMaterialList] = useState<Material[]>([])
  const [materialLoading, setMaterialLoading] = useState(false)
  const [materialKeyword, setMaterialKeyword] = useState('')
  const [checkedMaterialIds, setCheckedMaterialIds] = useState<Set<string>>(new Set())
  const [selectedMaterials, setSelectedMaterials] = useState<OutboundMaterial[]>([])
  const [bomList, setBomList] = useState<BOM[]>([])
  const [selectedBomId, setSelectedBomId] = useState('')
  const [bomMaterials, setBomMaterials] = useState<BOMMaterial[]>([])
  const [bomLoading, setBomLoading] = useState(false)
  const [batchOutboundModalOpen, setBatchOutboundModalOpen] = useState(false)
  const [batchScrapModalOpen, setBatchScrapModalOpen] = useState(false)
  const [scrapReason, setScrapReason] = useState('')
  const [scrapRemark, setScrapRemark] = useState('')
  const [depletionTracking, setDepletionTracking] = useState<DepletionItem[]>([])
  const [depletedRecords, setDepletedRecords] = useState<DepletedRecord[]>([])
  const [selectedDepletionItem, setSelectedDepletionItem] = useState<DepletionItem | null>(null)
  const [editRemainValue, setEditRemainValue] = useState('')
  const [editRemainReason, setEditRemainReason] = useState('')
  const [editRemainModalOpen, setEditRemainModalOpen] = useState(false)
  const [confirmDepleteModalOpen, setConfirmDepleteModalOpen] = useState(false)
  const [depleteType, setDepleteType] = useState('normal')
  const [depleteRemainValue, setDepleteRemainValue] = useState('0')
  const [expiredReason, setExpiredReason] = useState('')
  const [expiredRemark, setExpiredRemark] = useState('')

  const loadInventory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await inventoryApi.getList({
        page,
        pageSize,
        keyword: searchKeyword || undefined,
        sortField: sortField === 'quantity' ? 'stock' : sortField || undefined,
        sortOrder: sortDirection,
      } as any)
      const pageData = readPage<InventoryItem>(res)
      setData(pageData.list.map(toInventoryRow))
      setTotal(pageData.total)
    } catch (error) {
      toast.error('库存数据加载失败')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, searchKeyword, sortDirection, sortField])

  const fetchRefs = useCallback(async () => {
    try {
      const [projectsRes, usersRes] = await Promise.all([
        projectApi.getList({ page: 1, pageSize: 100, status: 'active' } as any),
        userApi.getList({ page: 1, pageSize: 100 }),
      ])
      setProjectList(readList<Project>(projectsRes))
      setUserList(readList<any>(usersRes).map(user => ({
        ...user,
        real_name: user.real_name ?? user.realName ?? user.name ?? user.username ?? '',
      })))
    } catch {
      setProjectList([])
      setUserList([])
    }
  }, [])

  const fetchMaterialList = useCallback(async () => {
    setMaterialLoading(true)
    try {
      const res = await materialApi.getList({
        page: 1,
        pageSize: 50,
        keyword: materialKeyword || undefined,
        status: 'active',
      })
      setMaterialList(readList<Material>(res))
    } catch {
      toast.error('物料列表加载失败')
    } finally {
      setMaterialLoading(false)
    }
  }, [materialKeyword])

  const fetchBomList = useCallback(async () => {
    try {
      const res = await bomApi.getList({ page: 1, pageSize: 50, type: 'project' } as any)
      setBomList(readList<BOM>(res))
    } catch {
      toast.error('BOM 列表加载失败')
    }
  }, [])

  const loadBomDetail = useCallback(async (id: string) => {
    if (!id) {
      setBomMaterials([])
      return
    }
    setBomLoading(true)
    try {
      const res = await bomApi.getDetail(id)
      const bom = (res as any)?.data ?? res as any
      setBomMaterials(bom?.materials ?? [])
    } catch {
      toast.error('BOM 明细加载失败')
    } finally {
      setBomLoading(false)
    }
  }, [])

  const loadDepletion = useCallback(async () => {
    try {
      const [trackingRes, depletedRes] = await Promise.all([
        depletionApi.getTracking({ status: 'active' }),
        depletionApi.getDepletion(),
      ])
      const trackingPayload = (trackingRes as any)?.data ?? trackingRes as any
      const depletedPayload = (depletedRes as any)?.data ?? depletedRes as any
      setDepletionTracking((trackingPayload?.list ?? []).map(mapDepletionItem))
      setDepletedRecords((depletedPayload?.list ?? []).map(mapDepletedRecord))
    } catch {
      setDepletionTracking([])
      setDepletedRecords([])
    }
  }, [])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  useEffect(() => {
    fetchRefs()
    loadDepletion()
  }, [fetchRefs, loadDepletion])

  useEffect(() => {
    if (materialSelectorOpen) fetchMaterialList()
  }, [fetchMaterialList, materialSelectorOpen])

  const filteredData = useMemo(() => {
    return data.filter(row => {
      if (category !== '全部分类' && !(row as any).categoryName?.includes(category)) return false
      if (location !== '全部库位' && !(row.locationName ?? row.locationId ?? '').includes(location)) return false
      if (quickFilter === 'low-stock') return row.stock > 0 && row.stock <= row.minStock
      if (quickFilter === 'expiring-soon') return daysUntilExpiry(row) >= 0 && daysUntilExpiry(row) <= 7
      if (quickFilter === 'expiring-month') return daysUntilExpiry(row) >= 0 && daysUntilExpiry(row) <= 30
      if (quickFilter === 'expired') return isExpired(row)
      if (quickFilter === 'out-of-stock') return row.stock <= 0
      return true
    })
  }, [category, data, location, quickFilter])

  const quickFilterCounts = useMemo<Record<QuickFilterType, number>>(() => ({
    all: data.length,
    'low-stock': data.filter(row => row.stock > 0 && row.stock <= row.minStock).length,
    'expiring-soon': data.filter(row => daysUntilExpiry(row) >= 0 && daysUntilExpiry(row) <= 7).length,
    'expiring-month': data.filter(row => daysUntilExpiry(row) >= 0 && daysUntilExpiry(row) <= 30).length,
    expired: data.filter(isExpired).length,
    'out-of-stock': data.filter(row => row.stock <= 0).length,
  }), [data])

  const computedStats = useMemo(() => ({
    total: data.reduce((sum, row) => sum + Number(row.stock || 0), 0),
    normal: data.filter(row => row.stock > row.minStock && !isExpired(row)).length,
    low: quickFilterCounts['low-stock'],
    warning: quickFilterCounts['expiring-month'],
    expired: quickFilterCounts.expired,
    outOfStock: quickFilterCounts['out-of-stock'],
  }), [data, quickFilterCounts])

  const filteredMaterialList = useMemo(() => {
    const value = materialKeyword.trim().toLowerCase()
    if (!value) return materialList
    return materialList.filter(item =>
      item.name.toLowerCase().includes(value) ||
      item.code.toLowerCase().includes(value) ||
      (item.spec ?? '').toLowerCase().includes(value)
    )
  }, [materialKeyword, materialList])

  const handleQuickFilter = (filter: QuickFilterType) => {
    setQuickFilter(filter)
    setPage(1)
    setSelectedIds(new Set())
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const handleSearch = () => {
    setSearchKeyword(keyword.trim())
    setPage(1)
  }

  const handleReset = () => {
    setKeyword('')
    setSearchKeyword('')
    setCategory('全部分类')
    setLocation('全部库位')
    setQuickFilter('all')
    setPage(1)
  }

  const toggleSelectAll = () => {
    setSelectedIds(prev => (
      prev.size === filteredData.length
        ? new Set()
        : new Set(filteredData.map(item => item.id))
    ))
  }

  const toggleSelectOne = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      next.has(name) ? next.delete(name) : next.add(name)
      return next
    })
  }

  const viewDetail = (item: InventoryRow) => {
    setSelectedItem(item)
    setDetailModalOpen(true)
  }

  const openOutboundModal = (item?: InventoryRow) => {
    if (item) {
      setOutboundMaterials([toOutboundMaterial(item)])
    }
    setOutboundModalOpen(true)
  }

  const openBatchOutbound = () => {
    setBatchOutboundModalOpen(true)
  }

  const confirmBatchOutboundOnly = () => {
    const items = data.filter(item => selectedIds.has(item.id)).map(item => toOutboundMaterial(item))
    setOutboundMaterials(items)
    setBatchOutboundModalOpen(false)
    setOutboundModalOpen(true)
  }

  const openMaterialSelector = () => {
    setMaterialSelectorOpen(true)
    setMaterialSelectorTab('material')
    setCheckedMaterialIds(new Set())
    setSelectedMaterials([])
  }

  const removeOutboundItem = (rowId: number) => {
    setOutboundMaterials(prev => prev.filter(item => item.rowId !== rowId))
  }

  const updateOutboundQuantity = (rowId: number, value: string) => {
    setOutboundMaterials(prev => prev.map(item => item.rowId === rowId ? { ...item, quantity: Number(value) } : item))
  }

  const updateOutboundProject = (rowId: number, project: string) => {
    setOutboundMaterials(prev => prev.map(item => item.rowId === rowId ? { ...item, project } : item))
  }

  const updateOutboundUser = (rowId: number, user: string) => {
    setOutboundMaterials(prev => prev.map(item => item.rowId === rowId ? { ...item, user } : item))
  }

  const updateOutboundUsage = (rowId: number, usage: OutboundUsage) => {
    setOutboundMaterials(prev => prev.map(item => item.rowId === rowId ? { ...item, usage } : item))
  }

  const updateOutboundReceiver = (rowId: number, receiver: string) => {
    setOutboundMaterials(prev => prev.map(item => item.rowId === rowId ? { ...item, receiver } : item))
  }

  const confirmOutbound = async () => {
    if (outboundMaterials.length === 0) {
      toast.error('请先选择出库物料')
      return
    }
    const invalid = outboundMaterials.some(item => item.quantity <= 0 || item.quantity > item.stock)
    if (invalid) {
      toast.error('出库数量必须大于 0 且不超过库存')
      return
    }
    try {
      await outboundApi.create({
        type: 'project',
        projectId: projectList.find(project => project.name === outboundMaterials.find(item => item.project)?.project)?.id,
        items: outboundMaterials.map(item => ({ materialId: item.materialId, quantity: item.quantity })),
        remark: outboundRemark || undefined,
      })
      toast.success('出库登记成功')
      setOutboundModalOpen(false)
      setOutboundMaterials([])
      setOutboundRemark('')
      clearSelection()
      loadInventory()
    } catch {
      toast.error('出库登记失败')
    }
  }

  const toggleCheckMaterial = (id: string) => {
    setCheckedMaterialIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleCheckAllMaterials = () => {
    setCheckedMaterialIds(prev => (
      prev.size === filteredMaterialList.length
        ? new Set()
        : new Set(filteredMaterialList.map(item => item.id))
    ))
  }

  const addCheckedToSelected = () => {
    const rows = filteredMaterialList.filter(item => checkedMaterialIds.has(item.id)).map(item => toOutboundMaterial(item))
    setSelectedMaterials(prev => {
      const seen = new Set(prev.map(item => item.materialId))
      return [...prev, ...rows.filter(item => !seen.has(item.materialId))]
    })
    setCheckedMaterialIds(new Set())
  }

  const removeSelectedMaterial = (rowId: number) => {
    setSelectedMaterials(prev => prev.filter(item => item.rowId !== rowId))
  }

  const confirmAddMaterials = () => {
    const items = materialSelectorTab === 'bom'
      ? bomMaterials.map(item => toOutboundMaterial(item))
      : selectedMaterials
    if (items.length === 0) {
      toast.error('请先选择物料')
      return
    }
    setOutboundMaterials(prev => {
      const seen = new Set(prev.map(item => item.materialId))
      return [...prev, ...items.filter(item => !seen.has(item.materialId))]
    })
    setMaterialSelectorOpen(false)
  }

  const confirmBatchScrap = async () => {
    const items = data.filter(item => selectedIds.has(item.id))
    if (items.length === 0) {
      toast.error('请先选择报废物料')
      return
    }
    if (!scrapReason) {
      toast.error('请选择报废原因')
      return
    }
    try {
      await Promise.all(items.map(item => scrapApi.create({
        materialId: item.materialId,
        quantity: item.stock,
        reason: scrapReason,
        remark: scrapRemark || undefined,
      })))
      toast.success('报废登记成功')
      setBatchScrapModalOpen(false)
      setScrapReason('')
      setScrapRemark('')
      clearSelection()
      loadInventory()
    } catch {
      toast.error('报废登记失败')
    }
  }

  return {
    activeTab,
    setActiveTab,
    data: filteredData,
    loading,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    keyword,
    setKeyword,
    category,
    setCategory,
    location,
    setLocation,
    quickFilter,
    sortField,
    sortDirection,
    selectedIds,
    expandedGroups,
    computedStats,
    quickFilterCounts,
    handleQuickFilter,
    handleSort,
    handleSearch,
    handleReset,
    toggleSelectAll,
    toggleSelectOne,
    clearSelection,
    toggleGroup,
    viewDetail,
    openOutboundModal,
    openBatchOutbound,
    setOutboundModalOpen,
    outboundModalOpen,
    outboundMaterials,
    outboundRemark,
    setOutboundRemark,
    projectList,
    userList,
    openMaterialSelector,
    removeOutboundItem,
    updateOutboundQuantity,
    updateOutboundProject,
    updateOutboundUser,
    updateOutboundUsage,
    updateOutboundReceiver,
    confirmOutbound,
    materialSelectorOpen,
    setMaterialSelectorOpen,
    materialSelectorTab,
    setMaterialSelectorTab,
    fetchBomList,
    materialList,
    materialLoading,
    materialKeyword,
    setMaterialKeyword,
    checkedMaterialIds,
    selectedMaterials,
    bomList,
    selectedBomId,
    setSelectedBomId,
    bomMaterials,
    bomLoading,
    loadBomDetail,
    toggleCheckMaterial,
    toggleCheckAllMaterials,
    removeSelectedMaterial,
    addCheckedToSelected,
    confirmAddMaterials,
    filteredMaterialList,
    detailModalOpen,
    setDetailModalOpen,
    selectedItem,
    batchOutboundModalOpen,
    setBatchOutboundModalOpen,
    confirmBatchOutboundOnly,
    batchScrapModalOpen,
    setBatchScrapModalOpen,
    scrapReason,
    setScrapReason,
    scrapRemark,
    setScrapRemark,
    confirmBatchScrap,
    depletionTracking,
    setSelectedDepletionItem,
    setEditRemainValue,
    setEditRemainReason,
    setEditRemainModalOpen,
    depletedRecords,
    selectedDepletionItem,
    editRemainValue,
    editRemainReason,
    editRemainModalOpen,
    setConfirmDepleteModalOpen,
    setDepleteType,
    setDepleteRemainValue,
    setExpiredReason,
    setExpiredRemark,
    confirmDepleteModalOpen,
    depleteType,
    depleteRemainValue,
    expiredReason,
    expiredRemark,
  }
}
