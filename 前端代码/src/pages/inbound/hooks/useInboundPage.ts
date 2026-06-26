import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { inboundApi, purchaseOrderApi } from '@/api/inventory'
import { materialApi, supplierApi, locationApi } from '@/api/master'
import type { InboundRecord, Material, Supplier, Location, PaginationData } from '@/types'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import { toast } from 'sonner'
import { formatDateTime } from '@/lib/utils'
import { getUserRole } from '@/lib/permissions'
import type { FormData } from '../components/InboundFormModal'

type ModalType = 'create' | 'edit' | 'detail' | 'cancel' | 'restore' | 'scan' | 'import' | 'print' | null
const PAGE_CANCEL_REASON = '页面取消入库'

interface PurchaseOrderOption {
  id: string
  orderNo?: string
  purchaseOrderNo?: string
  materialId?: string
  materialName?: string
  supplierId?: string
  supplierName?: string
  remainingQty?: number
  unitPrice?: number
  unit?: string
}

interface InboundRefs {
  materials: Material[]
  suppliers: Supplier[]
  locations: Location[]
}

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    direct: '直接入库',
    purchase: '采购入库',
    return: '退库入库',
    transfer: '调拨入库',
    surplus: '盘盈入库',
    other: '其他入库',
  }
  return map[type] || type
}

function canAccessPurchaseOrders(role: string | null): boolean {
  return role === 'admin' || role === 'procurement' || role === 'warehouse_manager'
}

function canAccessLocations(role: string | null): boolean {
  return role === 'admin' || role === 'warehouse_manager'
}

function getInboundErrorMessage(error: unknown, fallback: string) {
  const maybeError = error as {
    message?: string
    response?: {
      data?: {
        message?: string
        error?: { message?: string }
      }
    }
  }
  return maybeError.response?.data?.error?.message
    || maybeError.response?.data?.message
    || maybeError.message
    || fallback
}

function buildCreatedInboundRecord(
  payload: Partial<InboundRecord>,
  form: FormData,
  refs: InboundRefs & { purchaseOrders: PurchaseOrderOption[] },
): InboundRecord | null {
  if (!payload.id || !payload.inboundNo) return null

  const materialId = payload.materialId || form.materialId
  const supplierId = payload.supplierId || form.supplierId || undefined
  const locationId = payload.locationId || form.locationId
  const purchaseOrderId = payload.purchaseOrderId || form.purchaseOrderId || undefined
  const material = refs.materials.find(item => item.id === materialId)
  const supplier = refs.suppliers.find(item => item.id === supplierId)
  const location = refs.locations.find(item => item.id === locationId)
  const purchaseOrder = refs.purchaseOrders.find(item => item.id === purchaseOrderId)
  const quantity = Number(payload.quantity ?? form.quantity)
  const price = Number(payload.price ?? form.price ?? 0)

  return {
    id: payload.id,
    inboundNo: payload.inboundNo,
    type: payload.type || form.type,
    materialId,
    materialName: payload.materialName || material?.name || materialId,
    batchNo: payload.batchNo || form.batchNo || undefined,
    quantity,
    unit: payload.unit || material?.unit || '',
    price,
    amount: Number(payload.amount ?? Number((quantity * price).toFixed(2))),
    supplierId,
    supplierName: payload.supplierName || supplier?.name,
    locationId,
    locationName: payload.locationName || location?.name,
    productionDate: payload.productionDate || form.productionDate || undefined,
    expiryDate: payload.expiryDate || form.expiryDate || undefined,
    operator: payload.operator || 'system',
    status: payload.status || 'completed',
    remark: (payload.remark ?? form.remark) || undefined,
    purchaseOrderId,
    purchaseOrderNo: payload.purchaseOrderNo || purchaseOrder?.orderNo || purchaseOrder?.purchaseOrderNo || form.purchaseOrderNo,
    createdAt: payload.createdAt || new Date().toISOString(),
  }
}

function isSameInboundRecord(a: Pick<InboundRecord, 'id' | 'inboundNo'>, b: Pick<InboundRecord, 'id' | 'inboundNo'>): boolean {
  return a.id === b.id || a.inboundNo === b.inboundNo
}

function buildEditedInboundPatch(
  record: InboundRecord,
  payload: Partial<InboundRecord>,
  form: FormData,
  refs: InboundRefs,
): Partial<InboundRecord> {
  const material = refs.materials.find(item => item.id === (payload.materialId || form.materialId || record.materialId))
  const supplierId = payload.supplierId || form.supplierId || record.supplierId
  const locationId = payload.locationId || form.locationId || record.locationId
  const supplier = refs.suppliers.find(item => item.id === supplierId)
  const location = refs.locations.find(item => item.id === locationId)
  const quantity = Number(payload.quantity ?? form.quantity ?? record.quantity)
  const price = Number(payload.price ?? form.price ?? record.price ?? 0)

  return {
    type: payload.type || form.type || record.type,
    materialId: payload.materialId || form.materialId || record.materialId,
    materialName: payload.materialName || material?.name || record.materialName,
    batchNo: payload.batchNo || form.batchNo || record.batchNo,
    quantity,
    unit: payload.unit || material?.unit || record.unit,
    price,
    amount: Number(payload.amount ?? Number((quantity * price).toFixed(2))),
    supplierId,
    supplierName: payload.supplierName || supplier?.name || record.supplierName,
    locationId,
    locationName: payload.locationName || location?.name || record.locationName,
    productionDate: payload.productionDate || form.productionDate || undefined,
    expiryDate: payload.expiryDate || form.expiryDate || undefined,
    remark: (payload.remark ?? form.remark) || undefined,
    purchaseOrderId: payload.purchaseOrderId || form.purchaseOrderId || record.purchaseOrderId,
    purchaseOrderNo: payload.purchaseOrderNo || form.purchaseOrderNo || record.purchaseOrderNo,
    status: payload.status || record.status,
  }
}

function upsertPurchaseOrderOption(
  orders: PurchaseOrderOption[],
  candidate: PurchaseOrderOption | null,
): PurchaseOrderOption[] {
  if (!candidate?.id) return orders
  const index = orders.findIndex(order => order.id === candidate.id)
  if (index < 0) return [candidate, ...orders]
  return orders.map((order, orderIndex) => (
    orderIndex === index ? { ...candidate, ...order } : order
  ))
}

export function useInboundPage() {
  const url = useUrlParams()
  const handledCreateFromQuery = useRef(false)
  const purchaseOrderCandidateFromQuery = useRef<PurchaseOrderOption | null>(null)
  const role = getUserRole()
  const canUsePurchaseOrders = canAccessPurchaseOrders(role)
  const canUseLocations = canAccessLocations(role)

  const initialPage = Math.max(1, url.getNumber('page', 1))
  const initialPageSize = [10, 20, 50, 100].includes(url.getNumber('pageSize', 20))
    ? url.getNumber('pageSize', 20)
    : 20

  // 引用数据
  const [materials, setMaterials] = useState<Material[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [locations, setLocations] = useState<Location[]>([])

  // 筛选状态
  const [searchKeyword, setSearchKeywordRaw] = useState(url.get('keyword', ''))
  const [filterMaterial, setFilterMaterialRaw] = useState(url.get('materialId', ''))
  const [filterStatus, setFilterStatusRaw] = useState(url.get('status', ''))
  const [filterType, setFilterTypeRaw] = useState(url.get('type', ''))
  const [filterStartDate, setFilterStartDateRaw] = useState(url.get('startDate', ''))
  const [filterEndDate, setFilterEndDateRaw] = useState(url.get('endDate', ''))
  const [activeQuickFilter, setActiveQuickFilterRaw] = useState(url.get('quickFilter', 'all'))

  // 选择状态
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // 弹窗状态
  const [modalType, setModalType] = useState<ModalType>(null)
  const [selectedRecord, setSelectedRecord] = useState<InboundRecord | null>(null)
  const [printRecords, setPrintRecords] = useState<InboundRecord[]>([])
  const [createdInboundFallback, setCreatedInboundFallback] = useState<InboundRecord | null>(null)
  const [localInboundPatches, setLocalInboundPatches] = useState<Record<string, Partial<InboundRecord>>>({})
  const [cancelledInboundIds, setCancelledInboundIds] = useState<string[]>([])

  // 自定义确认弹窗状态
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean
    title: string
    message: string
    onConfirm: (() => void) | null
  }>({ open: false, title: '', message: '', onConfirm: null })

  // 表单状态
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrderOption[]>([])
  const [selectedOrderId, setSelectedOrderId] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)

  const [form, setForm] = useState<FormData>({
    type: canUsePurchaseOrders ? 'purchase' : 'direct', materialId: '', batchNo: '', quantity: 0, price: 0,
    supplierId: '', locationId: '', fromLocationId: '', fromLocationName: '',
    productionDate: '', expiryDate: '', remark: '', purchaseOrderId: '', purchaseOrderNo: ''
  })

  // 快速筛选映射为日期范围
  const quickFilterDates = useMemo(() => {
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const weekStart = new Date(now.getTime() - now.getDay() * 86400000).toISOString().split('T')[0]
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`

    switch (activeQuickFilter) {
      case 'today': return { startDate: today, endDate: today }
      case 'week': return { startDate: weekStart, endDate: today }
      case 'month': return { startDate: monthStart, endDate: today }
      default: return { startDate: filterStartDate, endDate: filterEndDate }
    }
  }, [activeQuickFilter, filterStartDate, filterEndDate])

  const effectiveStatus = filterStatus || undefined
  const effectiveType = filterType || undefined
  const effectiveMaterialId = filterMaterial || undefined
  const effectiveKeyword = searchKeyword || undefined
  const effectiveStartDate = quickFilterDates.startDate || undefined
  const effectiveEndDate = quickFilterDates.endDate || undefined

  const fetchFn = useCallback(
    async (params: { page: number; pageSize: number }) => {
      const res = await inboundApi.getList({
        ...params,
        status: effectiveStatus,
        type: effectiveType,
        materialId: effectiveMaterialId,
        keyword: effectiveKeyword,
        startDate: effectiveStartDate,
        endDate: effectiveEndDate,
      }) as unknown as PaginationData<InboundRecord>
      return {
        list: res?.list || [],
        pagination: res?.pagination,
      }
    },
    [
      effectiveStatus,
      effectiveType,
      effectiveMaterialId,
      effectiveKeyword,
      effectiveStartDate,
      effectiveEndDate,
    ]
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
  } = usePagination<InboundRecord>({
    fetchFn,
    initialPage,
    initialPageSize,
    deps: [
      effectiveStatus,
      effectiveType,
      effectiveMaterialId,
      effectiveKeyword,
      effectiveStartDate,
      effectiveEndDate,
    ],
  })

  const { displayedData, displayedTotal } = useMemo(() => {
    let rows = data.map(row => ({
      ...row,
      ...(localInboundPatches[row.id] || {}),
    }))
    let nextTotal = total

    if (cancelledInboundIds.length > 0) {
      const withCancelledStatus = rows.map(row =>
        cancelledInboundIds.includes(row.id)
          ? { ...row, status: 'cancelled' as const, cancelReason: row.cancelReason || PAGE_CANCEL_REASON }
          : row
      )
      rows = filterStatus
        ? withCancelledStatus.filter(row => row.status === filterStatus)
        : withCancelledStatus
      const removedCount = withCancelledStatus.length - rows.length
      if (removedCount > 0) nextTotal = Math.max(0, nextTotal - removedCount)
    }

    if (!createdInboundFallback) return { displayedData: rows, displayedTotal: nextTotal }
    const fallbackRecord = cancelledInboundIds.includes(createdInboundFallback.id)
      ? { ...createdInboundFallback, status: 'cancelled' as const, cancelReason: createdInboundFallback.cancelReason || PAGE_CANCEL_REASON }
      : createdInboundFallback
    if (
      searchKeyword !== fallbackRecord.inboundNo ||
      filterMaterial ||
      (filterStatus && filterStatus !== fallbackRecord.status) ||
      filterType ||
      filterStartDate ||
      filterEndDate ||
      activeQuickFilter !== 'all' ||
      page !== 1
    ) return { displayedData: rows, displayedTotal: nextTotal }
    if (rows.some(row => row.id === fallbackRecord.id || row.inboundNo === fallbackRecord.inboundNo)) {
      return { displayedData: rows, displayedTotal: nextTotal }
    }
    rows = [fallbackRecord, ...rows]
    nextTotal = Math.max(nextTotal + 1, rows.length)
    return { displayedData: rows, displayedTotal: nextTotal }
  }, [
    activeQuickFilter,
    cancelledInboundIds,
    createdInboundFallback,
    data,
    filterEndDate,
    filterMaterial,
    filterStartDate,
    filterStatus,
    filterType,
    localInboundPatches,
    page,
    searchKeyword,
    total,
  ])

  useEffect(() => {
    if (!createdInboundFallback) return
    if (data.some(row => isSameInboundRecord(row, createdInboundFallback))) {
      setCreatedInboundFallback(null)
    }
  }, [createdInboundFallback, data])

  // 筛选变化自动重置页码的包装 setter
  const setSearchKeyword = (v: string) => { setSearchKeywordRaw(v); setPage(1) }
  const setFilterMaterial = (v: string) => { setFilterMaterialRaw(v); setPage(1) }
  const setFilterStatus = (v: string) => { setFilterStatusRaw(v); setPage(1) }
  const setFilterType = (v: string) => { setFilterTypeRaw(v); setPage(1) }
  const setFilterStartDate = (v: string) => { setFilterStartDateRaw(v); setPage(1) }
  const setFilterEndDate = (v: string) => { setFilterEndDateRaw(v); setPage(1) }
  const setActiveQuickFilter = (v: string) => { setActiveQuickFilterRaw(v); setPage(1) }

  // URL 同步
  useEffect(() => {
    url.setMultiple({
      page: page > 1 ? page : null,
      pageSize: pageSize !== 20 ? pageSize : null,
      keyword: searchKeyword || null,
      materialId: filterMaterial || null,
      status: filterStatus || null,
      type: filterType || null,
      startDate: filterStartDate || null,
      endDate: filterEndDate || null,
      quickFilter: activeQuickFilter !== 'all' ? activeQuickFilter : null,
    })
  }, [page, pageSize, searchKeyword, filterMaterial, filterStatus, filterType, filterStartDate, filterEndDate, activeQuickFilter])

  // 统计数据（从后端获取，非当前页计算）
  const [stats, setStats] = useState({
    total: 0,
    monthTotal: 0,
    completed: 0,
    cancelled: 0,
    amount: 0,
    supplierCount: 0,
    pendingOrders: 0,
    quickCounts: { all: 0, today: 0, week: 0, month: 0 },
  })

  const fetchStats = async () => {
    try {
      const res = await inboundApi.getStats()
      const next = (res?.data || res) as Partial<typeof stats>
      setStats(prev => ({
        ...prev,
        ...next,
        quickCounts: next.quickCounts || prev.quickCounts,
      }))
    } catch (e) { console.error(e) }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const quickFilterCounts = stats.quickCounts

  const fetchRefs = async () => {
    try {
      const [mRes, sRes, lRes] = await Promise.all([
        materialApi.getList({ page: 1, pageSize: 999, status: 'active' }),
        supplierApi.getList({ page: 1, pageSize: 999, status: 'active' }),
        canUseLocations
          ? locationApi.getList({ page: 1, pageSize: 999, status: 'active' })
          : Promise.resolve({ list: [], pagination: { total: 0 } }),
      ])
      const materialRes = mRes as unknown as PaginationData<Material>
      const supplierRes = sRes as unknown as PaginationData<Supplier>
      const locationRes = lRes as unknown as PaginationData<Location>
      const refs: InboundRefs = {
        materials: materialRes?.list || [],
        suppliers: supplierRes?.list || [],
        locations: locationRes?.list || [],
      }
      setMaterials(refs.materials)
      setSuppliers(refs.suppliers)
      setLocations(refs.locations)
      return refs
    } catch (e) {
      console.error(e)
      const refs: InboundRefs = { materials: [], suppliers: [], locations: [] }
      setMaterials(refs.materials)
      setSuppliers(refs.suppliers)
      setLocations(refs.locations)
      return refs
    }
  }

  const fetchPurchaseOrders = async () => {
    if (!canUsePurchaseOrders) {
      setPurchaseOrders([])
      return
    }
    try {
      const res = await purchaseOrderApi.getList({ status: 'pending,partial', page: 1, pageSize: 999 }) as unknown as PaginationData<PurchaseOrderOption>
      setPurchaseOrders(upsertPurchaseOrderOption(res?.list || [], purchaseOrderCandidateFromQuery.current))
    } catch (e) {
      setPurchaseOrders(upsertPurchaseOrderOption([], purchaseOrderCandidateFromQuery.current))
    }
  }

  useEffect(() => {
    fetchRefs()
    fetchPurchaseOrders()
  }, [])

  useEffect(() => {
    if (handledCreateFromQuery.current) return
    if (url.get('action', '') !== 'create') return

    const type = url.get('type', 'purchase') as FormData['type']
    const purchaseOrderId = url.get('purchaseOrderId', '')
    const purchaseOrderNo = url.get('purchaseOrderNo', '')
    const materialId = url.get('materialId', '')
    const supplierId = url.get('supplierId', '')
    const supplierName = url.get('supplierName', '')
    const quantity = url.getNumber('quantity', 0)
    const remainingQty = url.getNumber('remainingQty', quantity)
    const price = url.getNumber('price', 0)
    const materialName = url.get('materialName', '')
    const unit = url.get('unit', '')
    const sourceRemark = url.get('remark', '') || (purchaseOrderNo ? `来自采购订单 ${purchaseOrderNo}` : '')

    handledCreateFromQuery.current = true
    if (purchaseOrderId) {
      purchaseOrderCandidateFromQuery.current = {
        id: purchaseOrderId,
        orderNo: purchaseOrderNo,
        purchaseOrderNo,
        materialId,
        materialName,
        supplierId,
        supplierName,
        remainingQty,
        unitPrice: price,
        unit,
      }
      setPurchaseOrders(prev => upsertPurchaseOrderOption(prev, purchaseOrderCandidateFromQuery.current))
    }
    setSelectedOrderId(purchaseOrderId)
    setForm(prev => ({
      ...prev,
      type,
      purchaseOrderId,
      purchaseOrderNo,
      materialId,
      supplierId,
      quantity,
      price,
      locationId: prev.locationId || locations[0]?.id || '',
      remark: sourceRemark || prev.remark,
    }))
    fetchRefs()
    fetchPurchaseOrders()
    setModalType('create')
  }, [locations, url])

  useEffect(() => {
    if (modalType !== 'create') return
    if (form.locationId || !locations[0]?.id) return
    setForm(prev => ({ ...prev, locationId: prev.locationId || locations[0].id }))
  }, [form.locationId, locations, modalType])

  // 选择操作
  const toggleSelectAll = () => {
    if (selectedIds.size === displayedData.length && displayedData.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(displayedData.map(d => d.id)))
    }
  }

  const toggleSelectOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    setSelectedIds(next)
  }

  const clearSelection = () => setSelectedIds(new Set())

  const isAllSelected = displayedData.length > 0 && selectedIds.size === displayedData.length
  const isIndeterminate = selectedIds.size > 0 && selectedIds.size < displayedData.length

  // 确认弹窗
  const openConfirmModal = (title: string, message: string, onConfirm: () => void) => {
    setConfirmModal({ open: true, title, message, onConfirm })
  }

  const closeConfirmModal = () => {
    setConfirmModal(prev => ({ ...prev, open: false, onConfirm: null }))
  }

  // 弹窗操作
  const openCreate = async () => {
    const refs = await fetchRefs()
    setForm({
      type: canUsePurchaseOrders ? 'purchase' : 'direct', materialId: refs.materials[0]?.id || '', batchNo: '', quantity: 0,
      price: 0, supplierId: '', locationId: refs.locations[0]?.id || '', fromLocationId: '', fromLocationName: '',
      productionDate: '', expiryDate: '', remark: '', purchaseOrderId: '', purchaseOrderNo: ''
    })
    setModalType('create')
  }

  const openDetail = (record: InboundRecord) => {
    setSelectedRecord(record)
    setModalType('detail')
  }

  const openEdit = (record: InboundRecord) => {
    setSelectedRecord(record)
    setForm({
      type: record.type || 'purchase',
      materialId: record.materialId || '',
      batchNo: record.batchNo || '',
      quantity: record.quantity || 0,
      price: record.price || 0,
      supplierId: record.supplierId || '',
      locationId: record.locationId || '',
      fromLocationId: '', fromLocationName: '',
      productionDate: record.productionDate || '',
      expiryDate: record.expiryDate || '',
      remark: record.remark || '',
      purchaseOrderId: record.purchaseOrderId || '',
      purchaseOrderNo: record.purchaseOrderNo || '',
    })
    setSelectedOrderId(record.purchaseOrderId || '')
    fetchRefs()
    setModalType('edit')
  }

  const handleDelete = async (record: InboundRecord) => {
    setSelectedRecord(record)
    setModalType('cancel')
  }

  const handleCancelInbound = async () => {
    if (!selectedRecord) return
    try {
      await inboundApi.cancel(selectedRecord.id, PAGE_CANCEL_REASON)
      setCancelledInboundIds(prev => prev.includes(selectedRecord.id) ? prev : [...prev, selectedRecord.id])
      toast.success('取消成功', {
        description: `${selectedRecord.inboundNo || '该入库单'} 已取消，库存、批次、采购收货数量、成本和审计记录已同步回退`,
      })
      closeModal()
      refresh()
    } catch {
      // P2：取消失败原因由全局响应拦截器统一提示后端真实消息，不再重复弹通用文案
    }
  }

  const openRestore = (record: InboundRecord) => {
    setSelectedRecord(record)
    setModalType('restore')
  }

  const closeModal = () => {
    setModalType(null)
    setSelectedRecord(null)
    setPrintRecords([])
    setSelectedOrderId('')
  }

  const selectedOrder = useMemo(() =>
    purchaseOrders.find(o => o.id === selectedOrderId),
    [purchaseOrders, selectedOrderId]
  )

  const focusCreatedInboundRecord = (inboundNo: string) => {
    setSearchKeywordRaw(inboundNo)
    setFilterMaterialRaw('')
    setFilterStatusRaw('')
    setFilterTypeRaw('')
    setFilterStartDateRaw('')
    setFilterEndDateRaw('')
    setActiveQuickFilterRaw('all')
    setPage(1)
  }

  const handleSubmit = async () => {
    if (submitting) return
    if (!form.materialId || form.quantity <= 0) {
      toast.error('请选择耗材并输入数量')
      return
    }
    if (!form.batchNo.trim()) {
      toast.error('请填写批号，库存批次和后续出库需要用它追踪')
      return
    }
    if (!form.locationId) {
      toast.error('请选择入库库位，库存和批次余量需要按库位记录')
      return
    }
    if (!form.expiryDate) {
      toast.error('请填写有效期，系统需要据此生成效期预警')
      return
    }
    const effectivePurchaseOrderId = form.purchaseOrderId || selectedOrderId
    if (form.type === 'purchase' && !effectivePurchaseOrderId) {
      toast.error('采购入库必须关联采购订单；未走采购单请改为直接入库')
      return
    }
    if (
      selectedOrderId &&
      selectedOrder?.remainingQty !== undefined &&
      form.quantity > selectedOrder.remainingQty
    ) {
      toast.error(`入库数量不能超过待入库数量 ${selectedOrder.remainingQty}`)
      return
    }
    if (form.type === 'transfer' && !form.fromLocationId && !form.fromLocationName) {
      toast.error('请选择或输入来源库位')
      return
    }
    setSubmitting(true)
    try {
      if (selectedRecord && modalType === 'edit') {
        const res: any = await inboundApi.update(selectedRecord.id, {
          batchNo: form.batchNo,
          quantity: form.quantity,
          price: form.price,
          supplierId: form.supplierId,
          locationId: form.locationId,
          productionDate: form.productionDate,
          expiryDate: form.expiryDate,
          remark: form.remark,
        })
        const payload = res?.data ?? res
        const currentRecord = displayedData.find(record => record.id === selectedRecord.id)
          || data.find(record => record.id === selectedRecord.id)
          || selectedRecord
        setLocalInboundPatches(prev => ({
          ...prev,
          [selectedRecord.id]: buildEditedInboundPatch(currentRecord, payload || {}, form, { materials, suppliers, locations }),
        }))
        toast.success('更新成功', {
          description: `${selectedRecord.inboundNo || '该入库单'} 已同步库存、批次、库位、成本、效期预警和审计记录`,
        })
      } else if (form.type === 'transfer') {
        const res: any = await inboundApi.createTransfer({
          materialId: form.materialId,
          quantity: form.quantity,
          fromLocationId: form.fromLocationId,
          fromLocationName: form.fromLocationName,
          toLocationId: form.locationId,
          batchNo: form.batchNo,
          operator: 'system',
          remark: form.remark,
        })
        const payload = res?.data ?? res
        toast.success('入库成功', {
          description: payload?.inboundNo
            ? `已生成 ${payload.inboundNo}，来源库位、目标库位、批次、库存流水和审计链路可按单号回看`
            : '来源库位、目标库位、批次、库存流水和审计链路已记录',
        })
      } else {
        const res: any = await inboundApi.create(form)
        const payload = res?.data ?? res
        if (payload?.inboundNo) {
          setCreatedInboundFallback(buildCreatedInboundRecord(payload, form, { materials, suppliers, locations, purchaseOrders }))
          focusCreatedInboundRecord(payload.inboundNo)
        }
        const linkedPurchaseOrderId = selectedOrderId || effectivePurchaseOrderId
        const successDescription = payload?.inboundNo
          ? linkedPurchaseOrderId
            ? `已生成 ${payload.inboundNo}，采购订单、库存、批次、库位、成本和审计链路可按单号回看`
            : `已生成 ${payload.inboundNo}，库存、批次、库位、成本、效期预警和审计链路可按单号回看`
          : linkedPurchaseOrderId
            ? '采购订单、库存、批次、库位、成本和审计链路已记录'
            : '库存、批次、库位、成本、效期预警和审计链路已记录'
        toast.success(linkedPurchaseOrderId ? '入库成功，已更新采购订单收货数量' : '入库成功', {
          description: successDescription,
        })
      }
      closeModal()
      refresh()
    } catch (e) {
      toast.error(getInboundErrorMessage(e, modalType === 'edit' ? '更新失败' : '创建失败'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleRestoreInbound = async () => {
    if (!selectedRecord) return
    try {
      await inboundApi.update(selectedRecord.id, { status: 'completed' })
      setCancelledInboundIds(prev => prev.filter(id => id !== selectedRecord.id))
      toast.success('恢复成功', { description: '入库记录已恢复' })
      closeModal()
      refresh()
    } catch {
      // P2：恢复失败原因由全局响应拦截器统一提示后端真实消息，不再重复弹通用文案
    }
  }

  const handleBatchExport = async () => {
    const exportData = selectedIds.size > 0
      ? displayedData.filter(d => selectedIds.has(d.id))
      : displayedData
    if (exportData.length === 0) {
      toast.error('没有可导出的数据')
      return
    }
    try {
      const XLSX = await import('xlsx')
      const rows = exportData.map(row => ({
        入库单号: row.inboundNo,
        耗材名称: row.materialName,
        批号: row.batchNo || '-',
        入库来源: getTypeLabel(row.type),
        数量: row.quantity,
        单位: row.unit,
        单价: row.price,
        金额: row.amount || row.price * row.quantity,
        供应商: row.supplierName || '-',
        入库时间: formatDateTime(row.createdAt),
        状态: row.status === 'completed' ? '已完成' : '已取消',
        备注: row.remark || '-',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '入库记录')
      const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
      XLSX.writeFile(wb, `入库记录_${dateStr}.xlsx`)
      toast.success('导出成功', { description: `已导出 ${rows.length} 条记录` })
    } catch (e) {
      toast.error('导出失败')
    }
  }

  const handleBatchPrint = () => {
    const records = selectedIds.size > 0
      ? displayedData.filter(d => selectedIds.has(d.id))
      : displayedData
    if (records.length === 0) {
      toast.error('没有可打印的数据')
      return
    }
    setSelectedRecord(null)
    setPrintRecords(records)
    setModalType('print')
  }

  const handlePrintRecord = (record: InboundRecord) => {
    setSelectedRecord(record)
    setPrintRecords([record])
    setModalType('print')
  }

  const handleResetFilters = () => {
    setSearchKeywordRaw('')
    setFilterMaterialRaw('')
    setFilterStatusRaw('')
    setFilterStartDateRaw('')
    setFilterEndDateRaw('')
    setActiveQuickFilterRaw('all')
    setFilterTypeRaw('')
    setPage(1)
  }

  return {
    // 引用数据
    materials, suppliers, locations,
    // 筛选
    searchKeyword, setSearchKeyword,
    filterMaterial, setFilterMaterial,
    filterStatus, setFilterStatus,
    filterType, setFilterType,
    filterStartDate, setFilterStartDate,
    filterEndDate, setFilterEndDate,
    activeQuickFilter, setActiveQuickFilter,
    // 选择
    selectedIds, toggleSelectAll, toggleSelectOne, clearSelection,
    isAllSelected, isIndeterminate,
    // 弹窗
    modalType, setModalType, selectedRecord, setSelectedRecord, printRecords,
    confirmModal, openConfirmModal, closeConfirmModal,
    // 表单
    purchaseOrders, selectedOrderId, setSelectedOrderId,
    form, setForm, submitting, handleSubmit,
    // 数据
    data: displayedData, loading, page, pageSize, total: displayedTotal, setPage, setPageSize,
    refresh: () => { refresh(); fetchStats() },
    // 统计
    stats, quickFilterCounts,
    // 操作
    openCreate, openDetail, openEdit, handleDelete, openRestore, closeModal,
    handleCancelInbound, handleRestoreInbound, handleBatchExport, handleBatchPrint, handlePrintRecord,
    handleResetFilters,
  }
}
