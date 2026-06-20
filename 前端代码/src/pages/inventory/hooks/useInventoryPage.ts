import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { bomApi, categoryApi, locationApi, materialApi, projectApi, userApi } from '@/api/master'
import { depletionApi, inventoryApi, outboundApi, scrapApi } from '@/api/inventory'
import type { BOM, BOMMaterial, Category, InventoryConsistencyCheck, InventoryItem, InventoryStats, Location, Material, Project } from '@/types'
import { getUserRole } from '@/lib/permissions'
import { useUrlParams } from '@/hooks/useUrlParams'

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
  batchId?: string
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

function getCurrentUserOption() {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}')
    const name = user.realName || user.real_name || user.name || user.username || '当前用户'
    return {
      id: user.id || user.userId || user.username || 'current-user',
      real_name: name,
      realName: name,
      username: user.username || '',
    }
  } catch {
    return { id: 'current-user', real_name: '当前用户', realName: '当前用户', username: '' }
  }
}

function canAccessProjects(role: string | null): boolean {
  return role === 'admin' || role === 'warehouse_manager' || role === 'technician' || role === 'pathologist'
}

function canAccessLocations(role: string | null): boolean {
  return role === 'admin' || role === 'warehouse_manager'
}

function toRowId(seed: unknown) {
  const text = String(seed ?? Date.now())
  return Math.abs(text.split('').reduce((sum, char) => ((sum << 5) - sum) + char.charCodeAt(0), 0))
}

function toInventoryRow(item: any): InventoryRow {
  return {
    ...item,
    stock: Number(item.stock ?? item.quantity ?? item.availableStock ?? 0),
    totalStock: Number(item.totalStock ?? item.stock ?? item.quantity ?? item.availableStock ?? 0),
    availableStock: Number(item.availableStock ?? item.stock ?? item.quantity ?? 0),
    minStock: Number(item.minStock ?? 0),
    maxStock: Number(item.maxStock ?? 0),
    batch: item.batch ?? item.batchNo ?? item.batchCode ?? '-',
    batchId: item.batchId ?? undefined,
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
    batchId: anyRow.batchId ?? undefined,
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
  const url = useUrlParams()
  const filterMaterialId = url.get('materialId', '')
  const [activeTab, setActiveTab] = useState<ActiveTab>('in-stock')
  const [data, setData] = useState<InventoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [keyword, setKeyword] = useState('')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [category, setCategory] = useState('')
  const [location, setLocation] = useState('')
  const [categoryOptions, setCategoryOptions] = useState<Array<{ value: string; label: string }>>([{ value: '', label: '全部分类' }])
  const [locationOptions, setLocationOptions] = useState<Array<{ value: string; label: string }>>([{ value: '', label: '全部库位' }])
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>('all')
  const [inventoryStats, setInventoryStats] = useState<InventoryStats | null>(null)
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
  const [consistencyModalOpen, setConsistencyModalOpen] = useState(false)
  const [consistencyLoading, setConsistencyLoading] = useState(false)
  const [consistencyResult, setConsistencyResult] = useState<InventoryConsistencyCheck | null>(null)
  const canAccessDepletion = useMemo(() => {
    const role = getUserRole()
    return role === 'admin' || role === 'pathologist' || role === 'finance'
  }, [])
  const canManageInventoryActions = useMemo(() => {
    const role = getUserRole()
    return role === 'admin' || role === 'warehouse_manager'
  }, [])

  const loadInventory = useCallback(async () => {
    setLoading(true)
    try {
      const res = await inventoryApi.getList({
        page,
        pageSize,
        keyword: searchKeyword || undefined,
        materialId: filterMaterialId || undefined,
        categoryId: category || undefined,
        locationId: location || undefined,
        status: quickFilter !== 'all' ? quickFilter : undefined,
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
  }, [category, filterMaterialId, location, page, pageSize, quickFilter, searchKeyword, sortDirection, sortField])

  const loadInventoryStats = useCallback(async () => {
    try {
      const res = await inventoryApi.getStats({
        keyword: searchKeyword || undefined,
        materialId: filterMaterialId || undefined,
        categoryId: category || undefined,
        locationId: location || undefined,
      })
      setInventoryStats((res as any)?.data ?? res as InventoryStats)
    } catch {
      setInventoryStats(null)
    }
  }, [category, filterMaterialId, location, searchKeyword])

  const fetchRefs = useCallback(async () => {
    const role = getUserRole()
    const [projectsRes, categoriesRes, locationsRes] = await Promise.all([
      canAccessProjects(role)
        ? projectApi.getList({ page: 1, pageSize: 999, status: 'active' } as any).catch(() => null)
        : Promise.resolve(null),
      categoryApi.getList({ page: 1, pageSize: 999 }).catch(() => null),
      canAccessLocations(role)
        ? locationApi.getList({ page: 1, pageSize: 999, status: 'active' }).catch(() => null)
        : Promise.resolve(null),
    ])

    setProjectList(projectsRes ? readList<Project>(projectsRes) : [])
    setCategoryOptions([
      { value: '', label: '全部分类' },
      ...(categoriesRes ? readList<Category>(categoriesRes).map(category => ({ value: category.id, label: category.name })) : []),
    ])
    setLocationOptions([
      { value: '', label: '全部库位' },
      ...(locationsRes ? readList<Location>(locationsRes).map(location => ({ value: location.id, label: location.name })) : []),
    ])

    if (getUserRole() === 'admin') {
      try {
        const usersRes = await userApi.getList({ page: 1, pageSize: 100 })
        setUserList(readList<any>(usersRes).map(user => ({
          ...user,
          real_name: user.real_name ?? user.realName ?? user.name ?? user.username ?? '',
        })))
      } catch {
        setUserList([getCurrentUserOption()])
      }
      return
    }

    setUserList([getCurrentUserOption()])
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
        depletionApi.getTracking({ status: 'in-use' }),
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

  const runConsistencyCheck = useCallback(async () => {
    setConsistencyModalOpen(true)
    setConsistencyLoading(true)
    try {
      const res = await inventoryApi.getConsistencyCheck()
      setConsistencyResult((res as any)?.data ?? res as InventoryConsistencyCheck)
    } catch {
      setConsistencyResult(null)
      toast.error('数据诊断失败')
    } finally {
      setConsistencyLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInventory()
  }, [loadInventory])

  useEffect(() => {
    loadInventoryStats()
  }, [loadInventoryStats])

  useEffect(() => {
    fetchRefs()
    if (canAccessDepletion) loadDepletion()
  }, [canAccessDepletion, fetchRefs, loadDepletion])

  useEffect(() => {
    if (!canAccessDepletion && activeTab !== 'in-stock') {
      setActiveTab('in-stock')
    }
  }, [activeTab, canAccessDepletion])

  useEffect(() => {
    if (materialSelectorOpen) fetchMaterialList()
  }, [fetchMaterialList, materialSelectorOpen])

  const quickFilterCounts = useMemo<Record<QuickFilterType, number>>(() => ({
    all: Number(inventoryStats?.totalStockCount || 0),
    'low-stock': Number(inventoryStats?.lowStockCount || 0),
    'expiring-soon': Number(inventoryStats?.expiringSoonCount || 0),
    'expiring-month': Number(inventoryStats?.expiringCount || 0),
    expired: Number(inventoryStats?.expiredCount || 0),
    'out-of-stock': Number(inventoryStats?.outOfStockCount || 0),
  }), [inventoryStats])

  const computedStats = useMemo(() => ({
    total: Number(inventoryStats?.totalQuantity || 0),
    normal: Number(inventoryStats?.normalCount || 0),
    low: Number(inventoryStats?.lowStockCount || 0),
    warning: Number(inventoryStats?.expiringCount || 0),
    expired: Number(inventoryStats?.expiredCount || 0),
    outOfStock: Number(inventoryStats?.outOfStockCount || 0),
  }), [inventoryStats])

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
    setCategory('')
    setLocation('')
    setQuickFilter('all')
    setPage(1)
  }

  const toggleSelectAll = () => {
    setSelectedIds(prev => (
      prev.size === data.length
        ? new Set()
        : new Set(data.map(item => item.id))
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
    if (!canManageInventoryActions) {
      toast.error('当前角色只能查看库存')
      return
    }
    if (item) {
      setOutboundMaterials([toOutboundMaterial(item)])
    }
    setOutboundModalOpen(true)
  }

  const openBatchOutbound = () => {
    if (!canManageInventoryActions) {
      toast.error('当前角色只能查看库存')
      return
    }
    setBatchOutboundModalOpen(true)
  }

  const openBatchScrap = () => {
    if (!canManageInventoryActions) {
      toast.error('当前角色只能查看库存')
      return
    }
    setBatchScrapModalOpen(true)
  }

  const confirmBatchOutboundOnly = () => {
    if (!canManageInventoryActions) {
      toast.error('当前角色只能查看库存')
      return
    }
    const items = data.filter(item => selectedIds.has(item.id)).map(item => toOutboundMaterial(item))
    setOutboundMaterials(items)
    setBatchOutboundModalOpen(false)
    setOutboundModalOpen(true)
  }

  const openMaterialSelector = () => {
    if (!canManageInventoryActions) {
      toast.error('当前角色只能查看库存')
      return
    }
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
    if (!canManageInventoryActions) {
      toast.error('当前角色只能查看库存')
      return
    }
    if (outboundMaterials.length === 0) {
      toast.error('请先选择出库物料')
      return
    }
    const invalid = outboundMaterials.some(item => item.quantity <= 0 || item.quantity > item.stock)
    if (invalid) {
      toast.error('出库数量必须大于 0 且不超过库存')
      return
    }
    const missingUser = outboundMaterials.some(item => !item.user.trim())
    if (missingUser) {
      toast.error('请选择领用人')
      return
    }
    const missingExternalReceiver = outboundMaterials.some(item => item.usage === 'external' && !item.receiver.trim())
    if (missingExternalReceiver) {
      toast.error('外给用途必须填写接收方')
      return
    }
    try {
      await outboundApi.create({
        type: 'project',
        projectId: projectList.find(project => project.name === outboundMaterials.find(item => item.project)?.project)?.id,
        items: outboundMaterials.map(item => ({
          materialId: item.materialId,
          batchId: item.batchId,
          quantity: item.quantity,
          usage: item.usage,
          receiver: item.usage === 'external' ? item.receiver.trim() : item.user.trim(),
        })),
        remark: outboundRemark || undefined,
      })
      toast.success('出库登记成功')
      setOutboundModalOpen(false)
      setOutboundMaterials([])
      setOutboundRemark('')
      clearSelection()
      loadInventory()
      loadInventoryStats()
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
    if (!canManageInventoryActions) {
      toast.error('当前角色只能查看库存')
      return
    }
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
    if (!canManageInventoryActions) {
      toast.error('当前角色只能查看库存')
      return
    }
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
      const result = await scrapApi.batchCreate(items.map(item => ({
        materialId: item.materialId,
        batchId: item.batchId,
        quantity: item.stock,
        reason: scrapReason,
        remark: scrapRemark || undefined,
      })))
      toast.success('报废登记成功', { description: `已报废 ${result.createdCount} 项物料` })
      setBatchScrapModalOpen(false)
      setScrapReason('')
      setScrapRemark('')
      clearSelection()
      loadInventory()
      loadInventoryStats()
    } catch {
      toast.error('报废登记失败')
    }
  }

  const confirmEditRemain = async () => {
    if (!selectedDepletionItem) return
    const remaining = Number(editRemainValue)
    if (!Number.isFinite(remaining) || remaining < 0) {
      toast.error('剩余量必须为非负数')
      return
    }
    if (remaining > selectedDepletionItem.totalQty) {
      toast.error('剩余量不能大于领用总量')
      return
    }
    if (!editRemainReason.trim()) {
      toast.error('请填写调整原因')
      return
    }
    try {
      await depletionApi.updateRemain(selectedDepletionItem.id, {
        remaining,
        reason: editRemainReason.trim(),
      })
      toast.success('剩余量已更新')
      setEditRemainModalOpen(false)
      setSelectedDepletionItem(null)
      setEditRemainValue('')
      setEditRemainReason('')
      loadDepletion()
    } catch {
      toast.error('剩余量更新失败')
    }
  }

  const confirmDeplete = async () => {
    if (!selectedDepletionItem) return
    const remainQty = Number(depleteRemainValue)
    if (!Number.isFinite(remainQty) || remainQty < 0) {
      toast.error('实际剩余量必须为非负数')
      return
    }
    if (remainQty > selectedDepletionItem.totalQty) {
      toast.error('实际剩余量不能大于领用总量')
      return
    }
    const reason = expiredReason.trim() || expiredRemark.trim()
    if (depleteType !== 'normal' && !reason) {
      toast.error('请填写耗尽原因')
      return
    }
    try {
      await depletionApi.deplete(selectedDepletionItem.id, {
        remain_qty: remainQty,
        deplete_type: depleteType,
        deplete_reason: reason || undefined,
      })
      toast.success('已确认耗尽')
      setConfirmDepleteModalOpen(false)
      setSelectedDepletionItem(null)
      setDepleteType('normal')
      setDepleteRemainValue('0')
      setExpiredReason('')
      setExpiredRemark('')
      loadDepletion()
      loadInventory()
      loadInventoryStats()
    } catch {
      toast.error('确认耗尽失败')
    }
  }

  return {
    activeTab,
    setActiveTab,
    canAccessDepletion,
    canManageInventoryActions,
    data,
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
    categoryOptions,
    locationOptions,
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
    openBatchScrap,
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
    confirmEditRemain,
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
    confirmDeplete,
    consistencyModalOpen,
    setConsistencyModalOpen,
    consistencyLoading,
    consistencyResult,
    runConsistencyCheck,
  }
}
