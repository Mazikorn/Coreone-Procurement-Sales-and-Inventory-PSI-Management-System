import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  CornerUpLeft,
  X,
  Search,
  Package,
  Truck,
  RotateCcw,
  FileSearch,
  FileText,
  Eye,
  Trash2,
  ChevronRight,
  Clock,
  CheckCircle2,
  CircleDollarSign,
} from 'lucide-react'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { supplierReturnApi, purchaseOrderApi, inboundApi } from '@/api/inventory'
import { materialApi, supplierApi } from '@/api/master'
import type { SupplierReturnRecord, Material, Supplier, PurchaseOrder, InboundRecord, Batch } from '@/types'
import { formatDate, formatCurrency } from '@/lib/utils'
import { getUserRole } from '@/lib/permissions'
import { toast } from 'sonner'

const statusMap: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending: { label: '待发货', color: 'text-amber-700', bg: 'bg-amber-50', icon: Clock },
  shipped: { label: '已发货', color: 'text-blue-700', bg: 'bg-blue-50', icon: Truck },
  received: { label: '已收货', color: 'text-purple-700', bg: 'bg-purple-50', icon: CheckCircle2 },
  refunded: { label: '已退款', color: 'text-green-700', bg: 'bg-green-50', icon: CircleDollarSign },
  cancelled: { label: '已取消', color: 'text-gray-600', bg: 'bg-gray-100', icon: RotateCcw },
}

const reasonOptions = [
  { value: 'quality_issue', label: '质量问题' },
  { value: 'wrong_item', label: '发错货' },
  { value: 'quantity_mismatch', label: '数量不符' },
  { value: 'damaged', label: '破损' },
  { value: 'other', label: '其他' },
]

export interface SupplierReturnFormState {
  materialId: string
  quantity: number
  batchId: string
  supplierId: string
  purchaseOrderId: string
  inboundRecordId: string
  reason: string
  refundAmount: string
  trackingNo: string
  remark: string
}

interface SupplierReturnRefs {
  materials: Material[]
  suppliers: Supplier[]
  batches: Batch[]
  purchaseOrders: PurchaseOrder[]
  inboundRecords: InboundRecord[]
}

function buildCreatedSupplierReturnRecord(
  payload: Partial<SupplierReturnRecord>,
  form: SupplierReturnFormState,
  refs: SupplierReturnRefs,
): SupplierReturnRecord | null {
  if (!payload.id || !payload.returnNo) return null

  const materialId = payload.materialId || form.materialId
  const batchId = payload.batchId || form.batchId || undefined
  const supplierId = payload.supplierId || form.supplierId || undefined
  const purchaseOrderId = payload.purchaseOrderId || form.purchaseOrderId || undefined
  const inboundRecordId = payload.inboundRecordId || form.inboundRecordId || undefined
  const material = refs.materials.find(item => item.id === materialId)
  const batch = refs.batches.find(item => item.id === batchId)
  const supplier = refs.suppliers.find(item => item.id === supplierId)
  const purchaseOrder = refs.purchaseOrders.find(item => item.id === purchaseOrderId)
  const inboundRecord = refs.inboundRecords.find(item => item.id === inboundRecordId)
  const createdAt = payload.createdAt || new Date().toISOString()

  return {
    id: payload.id,
    returnNo: payload.returnNo,
    materialId,
    materialName: payload.materialName || material?.name,
    batchId,
    batchNo: payload.batchNo || batch?.batchNo,
    quantity: Number(payload.quantity ?? form.quantity),
    supplierId,
    supplierName: payload.supplierName || supplier?.name,
    purchaseOrderId,
    purchaseOrderNo: payload.purchaseOrderNo || purchaseOrder?.orderNo,
    inboundRecordId,
    inboundNo: payload.inboundNo || inboundRecord?.inboundNo,
    reason: payload.reason || form.reason,
    refundAmount: payload.refundAmount ?? (form.refundAmount ? Number(form.refundAmount) : undefined),
    trackingNo: payload.trackingNo || form.trackingNo || undefined,
    status: payload.status || 'pending',
    operator: payload.operator || 'system',
    remark: (payload.remark ?? form.remark) || undefined,
    createdAt,
    updatedAt: payload.updatedAt || createdAt,
  }
}

export function validateSupplierReturnForm(
  form: SupplierReturnFormState,
  selectedMaterial: Material | undefined,
  availableBatches: Batch[]
): string | null {
  if (!form.materialId || form.quantity <= 0 || !form.reason) {
    return '请填写物料、退货数量和退货原因'
  }
  if (!form.supplierId) {
    return '请选择退货供应商'
  }
  if (!selectedMaterial) {
    return '请选择有效物料'
  }
  if (form.quantity > selectedMaterial.stock) {
    return '退货数量不能超过当前库存'
  }
  if (availableBatches.length === 0) {
    return '该物料无可用批次，不能创建退货'
  }
  if (!form.batchId) {
    return '请选择退货批次'
  }

  const selectedBatch = availableBatches.find(batch => batch.id === form.batchId)
  if (!selectedBatch) {
    return '请选择有效退货批次'
  }
  if (form.quantity > selectedBatch.remaining) {
    return '退货数量不能超过所选批次剩余量'
  }
  if (!selectedBatch.supplierId) {
    return '所选批次缺少供应商来源，不能创建退货'
  }
  if (selectedBatch.supplierId !== form.supplierId) {
    return '退货批次与供应商不一致'
  }

  return null
}

export function canAccessPurchaseOrders(role: string | null): boolean {
  return role === 'admin' || role === 'procurement' || role === 'warehouse_manager'
}

export default function SupplierReturns() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [materials, setMaterials] = useState<Material[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([])
  const [inboundRecords, setInboundRecords] = useState<InboundRecord[]>([])
  const [materialBatches, setMaterialBatches] = useState<Batch[]>([])

  const [keyword, setKeyword] = useState(searchParams.get('keyword') || '')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '')
  const [supplierFilter, setSupplierFilter] = useState(searchParams.get('supplierId') || '')
  const startDateFilter = searchParams.get('startDate') || ''
  const endDateFilter = searchParams.get('endDate') || ''
  const includeDeleted = searchParams.get('includeDeleted') === 'true'

  const [modalOpen, setModalOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRecord, setDetailRecord] = useState<SupplierReturnRecord | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [recordToDelete, setRecordToDelete] = useState<SupplierReturnRecord | null>(null)
  const [statusCancelConfirmOpen, setStatusCancelConfirmOpen] = useState(false)
  const [recordToCancelStatus, setRecordToCancelStatus] = useState<SupplierReturnRecord | null>(null)
  const [pendingStatusTransition, setPendingStatusTransition] = useState<{
    record: SupplierReturnRecord
    status: SupplierReturnRecord['status']
  } | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [createdSupplierReturnFallback, setCreatedSupplierReturnFallback] = useState<SupplierReturnRecord | null>(null)
  const [updatedSupplierReturnFallback, setUpdatedSupplierReturnFallback] = useState<SupplierReturnRecord | null>(null)
  const [deletedSupplierReturnIds, setDeletedSupplierReturnIds] = useState<string[]>([])
  const previousSuggestedRefundAmountRef = useRef('')

  const [form, setForm] = useState<SupplierReturnFormState>({
    materialId: '',
    quantity: 1,
    batchId: '',
    supplierId: '',
    purchaseOrderId: '',
    inboundRecordId: '',
    reason: '',
    refundAmount: '',
    trackingNo: '',
    remark: '',
  })
  const createDraftHandledRef = useRef(false)

  const fetchRefs = async () => {
    try {
      const allowPurchaseOrders = canAccessPurchaseOrders(getUserRole())
      const [mRes, sRes, poRes, inRes] = await Promise.all([
        materialApi.getList({ page: 1, pageSize: 999, status: 'active' }),
        supplierApi.getList({ page: 1, pageSize: 999, status: 'active' }),
        allowPurchaseOrders
          ? purchaseOrderApi.getList({ page: 1, pageSize: 999 })
          : Promise.resolve({ list: [], pagination: { total: 0 } }),
        inboundApi.getList({ page: 1, pageSize: 999 }),
      ])
      setMaterials((mRes as any)?.list || [])
      setSuppliers((sRes as any)?.list || [])
      setPurchaseOrders((poRes as any)?.list || [])
      setInboundRecords((inRes as any)?.list || [])
    } catch (e) {
      console.error(e)
    }
  }

  useEffect(() => {
    fetchRefs()
  }, [])

  useEffect(() => {
    if (createDraftHandledRef.current) return
    if (searchParams.get('action') !== 'create') return

    createDraftHandledRef.current = true
    const quantity = Number(searchParams.get('quantity') || 1)
    setForm(prev => ({
      ...prev,
      materialId: searchParams.get('materialId') || prev.materialId,
      batchId: searchParams.get('batchId') || prev.batchId,
      supplierId: searchParams.get('supplierId') || prev.supplierId,
      purchaseOrderId: searchParams.get('purchaseOrderId') || prev.purchaseOrderId,
      inboundRecordId: searchParams.get('inboundRecordId') || prev.inboundRecordId,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : prev.quantity,
      reason: searchParams.get('reason') || prev.reason,
      refundAmount: searchParams.get('refundAmount') || prev.refundAmount,
      trackingNo: searchParams.get('trackingNo') || prev.trackingNo,
      remark: searchParams.get('remark') || prev.remark,
    }))
    setModalOpen(true)
  }, [searchParams])

  // 选择物料后获取批次列表
  useEffect(() => {
    if (!form.materialId) {
      setMaterialBatches([])
      return
    }
    const fetchBatches = async () => {
      try {
        const res: any = await materialApi.getDetail(form.materialId)
        const batches = (res?.batches || []).filter((b: Batch) => b.remaining > 0 && b.status === 'normal')
        setMaterialBatches(batches)
        // 如果只剩一个批次，自动选中
        if (batches.length === 1) {
          setForm(prev => ({ ...prev, batchId: batches[0].id }))
        } else if (batches.length === 0) {
          setForm(prev => ({ ...prev, batchId: '' }))
        }
      } catch (e) {
        setMaterialBatches([])
      }
    }
    fetchBatches()
  }, [form.materialId])

  const fetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const res: any = await supplierReturnApi.getList({
        page,
        pageSize,
        keyword: keyword || undefined,
        status: statusFilter || undefined,
        supplierId: supplierFilter || undefined,
        startDate: startDateFilter || undefined,
        endDate: endDateFilter || undefined,
        includeDeleted: includeDeleted || undefined,
      })
      return { list: res.list || [], pagination: res.pagination }
    },
    [endDateFilter, includeDeleted, keyword, startDateFilter, statusFilter, supplierFilter]
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
  } = usePagination<SupplierReturnRecord>({
    fetchFn,
    deps: [keyword, statusFilter, supplierFilter, startDateFilter, endDateFilter, includeDeleted],
  })

  const { displayedData, displayedTotal } = useMemo(() => {
    let rows = data
    let nextTotal = total

    if (!includeDeleted && deletedSupplierReturnIds.length > 0) {
      const filteredRows = rows.filter(row => !deletedSupplierReturnIds.includes(row.id))
      if (filteredRows.length !== rows.length) {
        nextTotal = Math.max(0, nextTotal - (rows.length - filteredRows.length))
        rows = filteredRows
      }
    }

    if (
      createdSupplierReturnFallback &&
      !deletedSupplierReturnIds.includes(createdSupplierReturnFallback.id) &&
      keyword === createdSupplierReturnFallback.returnNo &&
      !statusFilter &&
      !supplierFilter &&
      page === 1 &&
      !rows.some(row => row.id === createdSupplierReturnFallback.id || row.returnNo === createdSupplierReturnFallback.returnNo)
    ) {
      rows = [createdSupplierReturnFallback, ...rows]
      nextTotal = Math.max(nextTotal + 1, rows.length)
    }
    if (
      updatedSupplierReturnFallback &&
      !deletedSupplierReturnIds.includes(updatedSupplierReturnFallback.id) &&
      keyword === updatedSupplierReturnFallback.returnNo &&
      !statusFilter &&
      !supplierFilter &&
      page === 1
    ) {
      const hasUpdatedRow = rows.some(row => row.id === updatedSupplierReturnFallback.id || row.returnNo === updatedSupplierReturnFallback.returnNo)
      rows = hasUpdatedRow
        ? rows.map(row => (row.id === updatedSupplierReturnFallback.id || row.returnNo === updatedSupplierReturnFallback.returnNo ? updatedSupplierReturnFallback : row))
        : [updatedSupplierReturnFallback, ...rows]
      if (!hasUpdatedRow) nextTotal = Math.max(nextTotal + 1, rows.length)
    }
    return { displayedData: rows, displayedTotal: nextTotal }
  }, [
    createdSupplierReturnFallback,
    data,
    deletedSupplierReturnIds,
    includeDeleted,
    keyword,
    page,
    statusFilter,
    supplierFilter,
    total,
    updatedSupplierReturnFallback,
  ])

  const handleSearch = () => {
    const params: Record<string, string> = {}
    if (keyword) params.keyword = keyword
    if (statusFilter) params.status = statusFilter
    if (supplierFilter) params.supplierId = supplierFilter
    if (startDateFilter) params.startDate = startDateFilter
    if (endDateFilter) params.endDate = endDateFilter
    if (includeDeleted) params.includeDeleted = 'true'
    setSearchParams(params)
    setPage(1)
  }

  const handleReset = () => {
    setKeyword('')
    setStatusFilter('')
    setSupplierFilter('')
    setSearchParams({})
    setPage(1)
  }

  const focusCreatedSupplierReturn = (returnNo: string) => {
    setKeyword(returnNo)
    setStatusFilter('')
    setSupplierFilter('')
    setSearchParams({ keyword: returnNo })
    setPage(1)
  }

  const handleCreate = async () => {
    const validationError = validateSupplierReturnForm(form, materials.find((m) => m.id === form.materialId), materialBatches)
    if (validationError) {
      toast.error(validationError)
      return
    }
    setIsSubmitting(true)
    try {
      const res: any = await supplierReturnApi.create({
        materialId: form.materialId,
        quantity: form.quantity,
        batchId: form.batchId || undefined,
        supplierId: form.supplierId || undefined,
        purchaseOrderId: form.purchaseOrderId || undefined,
        inboundRecordId: form.inboundRecordId || undefined,
        reason: form.reason,
        refundAmount: form.refundAmount ? Number(form.refundAmount) : undefined,
        trackingNo: form.trackingNo || undefined,
        remark: form.remark || undefined,
      })
      const created = res?.data ?? res
      if (created?.returnNo) {
        setCreatedSupplierReturnFallback(buildCreatedSupplierReturnRecord(created, form, {
          materials,
          suppliers,
          batches: materialBatches,
          purchaseOrders,
          inboundRecords,
        }))
        focusCreatedSupplierReturn(created.returnNo)
      }
      toast.success('退货记录创建成功')
      setModalOpen(false)
      setForm({
        materialId: '', quantity: 1, batchId: '', supplierId: '', purchaseOrderId: '',
        inboundRecordId: '', reason: '', refundAmount: '', trackingNo: '', remark: '',
      })
      setMaterialBatches([])
      refresh()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '创建失败')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    try {
      await supplierReturnApi.updateStatus(id, status)
      const currentRecord = detailRecord?.id === id
        ? detailRecord
        : displayedData.find(row => row.id === id)
      if (currentRecord) {
        const updatedRecord = {
          ...currentRecord,
          status: status as SupplierReturnRecord['status'],
          updatedAt: new Date().toISOString(),
        }
        setUpdatedSupplierReturnFallback(updatedRecord)
        focusCreatedSupplierReturn(updatedRecord.returnNo)
        if (detailRecord?.id === id) {
          setDetailRecord(updatedRecord)
        }
      }
      toast.success('状态更新成功')
      setStatusCancelConfirmOpen(false)
      setRecordToCancelStatus(null)
      setPendingStatusTransition(null)
      refresh()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '状态更新失败')
    }
  }

  const openDelete = (row: SupplierReturnRecord) => {
    setRecordToDelete(row)
    setDeleteConfirmOpen(true)
  }

  const openStatusCancelConfirm = (row: SupplierReturnRecord) => {
    setRecordToCancelStatus(row)
    setStatusCancelConfirmOpen(true)
  }

  const openStatusTransitionConfirm = (row: SupplierReturnRecord, status: SupplierReturnRecord['status']) => {
    setPendingStatusTransition({ record: row, status })
  }

  const handleDelete = async () => {
    if (!recordToDelete) return
    try {
      await supplierReturnApi.delete(recordToDelete.id)
      setDeletedSupplierReturnIds(prev => prev.includes(recordToDelete.id) ? prev : [...prev, recordToDelete.id])
      toast.success('退货记录已删除')
      setDeleteConfirmOpen(false)
      setRecordToDelete(null)
      refresh()
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '删除失败')
    }
  }

  const openDetail = (row: SupplierReturnRecord) => {
    setDetailRecord(row)
    setDetailOpen(true)
  }

  const openAuditEvidence = (returnNo: string) => {
    navigate(`/logs?keyword=${encodeURIComponent(returnNo)}`)
  }

  const selectedMaterial = materials.find((m) => m.id === form.materialId)
  const selectedBatch = materialBatches.find((b) => b.id === form.batchId)
  const selectedInboundRecord = inboundRecords.find((record) => record.id === form.inboundRecordId)
    || inboundRecords.find((record) => selectedBatch?.inboundId && record.id === selectedBatch.inboundId)
  const selectedPurchaseOrder = purchaseOrders.find((order) => order.id === form.purchaseOrderId)
    || purchaseOrders.find((order) => selectedInboundRecord?.purchaseOrderId && order.id === selectedInboundRecord.purchaseOrderId)
  const selectedSupplier = suppliers.find((supplier) => supplier.id === form.supplierId)
  const supplierScopedBatches = materialBatches.filter((batch) => !form.supplierId || batch.supplierId === form.supplierId)

  useEffect(() => {
    if (form.batchId || !form.inboundRecordId || materialBatches.length === 0) return

    const sourceInboundRecord = inboundRecords.find((record) => record.id === form.inboundRecordId)
    if (!sourceInboundRecord) return

    const matchedBatch = materialBatches.find((batch) => batch.inboundId === sourceInboundRecord.id)
      || materialBatches.find((batch) => sourceInboundRecord.batchNo && batch.batchNo === sourceInboundRecord.batchNo)
    if (!matchedBatch) return

    setForm((prev) => prev.batchId ? prev : ({
      ...prev,
      batchId: matchedBatch.id,
      supplierId: matchedBatch.supplierId || sourceInboundRecord.supplierId || prev.supplierId,
      purchaseOrderId: sourceInboundRecord.purchaseOrderId || prev.purchaseOrderId,
    }))
  }, [form.batchId, form.inboundRecordId, inboundRecords, materialBatches])

  useEffect(() => {
    if (!selectedBatch) return

    setForm((prev) => {
      const sourceInboundRecord = inboundRecords.find((record) => selectedBatch.inboundId && record.id === selectedBatch.inboundId)
      const nextSupplierId = selectedBatch.supplierId || ''
      const nextInboundRecordId = sourceInboundRecord?.id || ''
      const nextPurchaseOrderId = sourceInboundRecord?.purchaseOrderId || ''
      const next = {
        ...prev,
        supplierId: nextSupplierId || prev.supplierId,
        inboundRecordId: nextInboundRecordId || prev.inboundRecordId,
        purchaseOrderId: nextPurchaseOrderId || prev.purchaseOrderId,
      }
      return next.supplierId === prev.supplierId
        && next.inboundRecordId === prev.inboundRecordId
        && next.purchaseOrderId === prev.purchaseOrderId
        ? prev
        : next
    })
  }, [inboundRecords, selectedBatch])

  const suggestedRefundAmount = useMemo(() => {
    if (!selectedBatch) return ''
    const amount = Number(selectedBatch.inboundPrice || 0) * Number(form.quantity || 0)
    return amount > 0 ? amount.toFixed(2) : ''
  }, [form.quantity, selectedBatch])

  const supplierReturnUnit = selectedMaterial?.unit || ''
  const supplierReturnQuantityText = `${form.quantity || 0} ${supplierReturnUnit}`.trim()
  const supplierReturnDeductionText = selectedBatch ? `批次扣减 ${supplierReturnQuantityText}` : `库存扣减 ${supplierReturnQuantityText}`
  const supplierReturnBatchRemainingText = selectedBatch
    ? `批次余量 ${Math.max(0, Number(selectedBatch.remaining || 0) - Number(form.quantity || 0))} ${supplierReturnUnit}`.trim()
    : '-'
  const supplierReturnRefundAmount = Number(form.refundAmount || suggestedRefundAmount || 0)
  const selectedReasonLabel = reasonOptions.find((reason) => reason.value === form.reason)?.label || (form.reason ? form.reason : '待选择')
  const supplierReturnDownstreamFacts = '库存、批次、采购退货、供应商成本净额、退款状态、审计记录'
  const showSupplierReturnPreview = Boolean(selectedMaterial && selectedBatch && form.quantity > 0)
  const supplierReturnValidationMessage = (() => {
    const validationError = validateSupplierReturnForm(form, selectedMaterial, materialBatches)
    if (!validationError) return ''
    if (validationError === '退货数量不能超过所选批次剩余量' && selectedBatch) {
      return `退货数量不能超过所选批次剩余量 ${selectedBatch.remaining} ${supplierReturnUnit}，请按实际退回数量修改。`
    }
    if (validationError === '退货批次与供应商不一致') {
      return '退货批次与供应商不一致，请选择该供应商对应的可退批次。'
    }
    if (validationError === '请选择退货批次') {
      return '请选择退货批次，系统才能扣减正确批次并保留成本来源。'
    }
    if (validationError === '请选择退货供应商') {
      return '请选择退货供应商，系统才能接住供应商成本净额和退款状态。'
    }
    return validationError
  })()
  const canConfirmSupplierReturn = !isSubmitting && !supplierReturnValidationMessage
  const pendingStatusDescription = pendingStatusTransition
    ? [
      `退货单 ${pendingStatusTransition.record.returnNo}`,
      `${statusMap[pendingStatusTransition.record.status]?.label || pendingStatusTransition.record.status} -> ${statusMap[pendingStatusTransition.status]?.label || pendingStatusTransition.status}`,
      `${pendingStatusTransition.record.materialName || pendingStatusTransition.record.materialId} / ${pendingStatusTransition.record.batchNo || '无批次'} / ${pendingStatusTransition.record.supplierName || '未记录供应商'}`,
      pendingStatusTransition.record.refundAmount ? `退款金额 ${formatCurrency(pendingStatusTransition.record.refundAmount)}` : '退款金额待记录',
      '确认后将接住：库存、批次、供应商成本净额、退款状态、审计记录',
    ].join('；')
    : ''

  useEffect(() => {
    const previousSuggestedRefundAmount = previousSuggestedRefundAmountRef.current
    previousSuggestedRefundAmountRef.current = suggestedRefundAmount

    if (!suggestedRefundAmount) return

    setForm((prev) => {
      const userEditedRefundAmount = prev.refundAmount && prev.refundAmount !== previousSuggestedRefundAmount
      if (userEditedRefundAmount || prev.refundAmount === suggestedRefundAmount) return prev
      return { ...prev, refundAmount: suggestedRefundAmount }
    })
  }, [suggestedRefundAmount])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900">退货给供应商</h1>
          <p className="text-sm text-gray-500 mt-1">管理物料退回供应商的完整流程</p>
        </div>
        <button
          onClick={() => { fetchRefs(); setModalOpen(true) }}
          className="inline-flex items-center gap-2 px-4 h-10 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm font-medium transition-colors"
        >
          <CornerUpLeft className="w-4 h-4" />
          新建退货
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col lg:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索退货单号/物料/原因..."
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="w-full h-10 pl-10 pr-4 border border-gray-300 rounded-md text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SearchableSelect
            value={statusFilter}
            onChange={(val) => setStatusFilter(val)}
            options={[
              { value: '', label: '全部状态' },
              { value: 'pending', label: '待发货' },
              { value: 'shipped', label: '已发货' },
              { value: 'received', label: '已收货' },
              { value: 'refunded', label: '已退款' },
              { value: 'cancelled', label: '已取消' },
            ]}
            placeholder="全部状态"
          />
          <SearchableSelect
            value={supplierFilter}
            onChange={(val) => setSupplierFilter(val)}
            options={[
              { value: '', label: '全部供应商' },
              ...suppliers.map((s) => ({ value: s.id, label: s.name })),
            ]}
            placeholder="全部供应商"
            className="w-48"
          />
          <button
            onClick={handleSearch}
            className="h-10 px-4 bg-white text-gray-700 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            查询
          </button>
          <button
            onClick={handleReset}
            className="h-10 px-4 text-gray-500 text-sm font-medium hover:text-gray-700 transition-colors"
          >
            重置
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">退货单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">物料</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">批次</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">供应商</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">数量</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">退货原因</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">退款金额</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作时间</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && displayedData.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    <div className="flex items-center justify-center gap-2">
                      <Clock className="w-5 h-5 animate-spin" />
                      加载中...
                    </div>
                  </td>
                </tr>
              ) : displayedData.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Package className="w-12 h-12 text-gray-300" />
                      <p className="text-sm">暂无退货记录</p>
                      <p className="text-xs text-gray-400">点击"新建退货"开始</p>
                    </div>
                  </td>
                </tr>
              ) : (
                displayedData.map((row) => {
                  const statusInfo = row.isDeleted
                    ? { label: '已删除', color: 'text-red-700', bg: 'bg-red-50', icon: Trash2 }
                    : statusMap[row.status] || statusMap.pending
                  const StatusIcon = statusInfo.icon
                  const reasonLabel = reasonOptions.find((r) => r.value === row.reason)?.label || row.reason
                  return (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.returnNo}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 text-sm">{row.materialName || '-'}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{row.batchNo || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{row.supplierName || '-'}</td>
                      <td className="px-4 py-3 text-right text-gray-700">{row.quantity}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded text-xs bg-orange-50 text-orange-700">{reasonLabel}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {row.refundAmount ? formatCurrency(row.refundAmount) : '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusInfo.bg} ${statusInfo.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(row.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openDetail(row)}
                            className="px-2 py-1 text-gray-500 hover:text-blue-600 text-xs font-medium transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5 inline mr-0.5" />
                            详情
                          </button>
                          <button
                            type="button"
                            aria-label={`审计证据 ${row.returnNo}`}
                            onClick={() => openAuditEvidence(row.returnNo)}
                            className="px-2 py-1 text-gray-500 hover:text-indigo-600 text-xs font-medium transition-colors"
                          >
                            <FileSearch className="w-3.5 h-3.5 inline mr-0.5" />
                            证据
                          </button>
	                          {row.status === 'pending' && !row.isDeleted && (
                            <button
                              onClick={() => openDelete(row)}
                              className="px-2 py-1 text-gray-500 hover:text-red-600 text-xs font-medium transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline mr-0.5" />
                              删除
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
          <span className="text-sm text-gray-500">共 {displayedTotal} 条记录</span>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={displayedTotal}
            onChange={setPage}
            onPageSizeChange={setPageSize}
          />
        </div>
      </div>

      {/* Create Modal */}
      {modalOpen && (
        <Modal onClose={() => setModalOpen(false)} title="新建退货给供应商" size="lg">
          <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  物料 <span className="text-red-500">*</span>
                </label>
                  <SearchableSelect
                    testId="supplier-return-material-select"
                    value={form.materialId}
                    onChange={(val) => setForm({ ...form, materialId: val, batchId: '', quantity: 1, refundAmount: '' })}
                  options={materials.map((m) => ({
                    value: m.id,
                    label: `${m.name} (${m.code}) - 库存 ${m.stock} ${m.unit}`,
                  }))}
                  placeholder="请选择物料"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    退货数量 <span className="text-red-500">*</span>
                  </label>
                  <input
                    data-testid="supplier-return-quantity-input"
                    type="number"
                    min={1}
                    max={selectedBatch?.remaining || selectedMaterial?.stock || undefined}
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) })}
                    className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
                  />
                  {selectedMaterial && (
                    <p className="text-xs text-gray-400 mt-1">
                      最大可退: {selectedBatch?.remaining ?? selectedMaterial.stock}
                      {selectedBatch ? '（按所选批次）' : '（按当前库存）'}
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    退货批次 <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    testId="supplier-return-batch-select"
                    value={form.batchId}
                    onChange={(val) => setForm({ ...form, batchId: val })}
                    options={[
                      { value: '', label: '请选择批次' },
                      ...supplierScopedBatches.map((b) => ({
                        value: b.id,
                        label: `${b.batchNo} (余${b.remaining}${selectedMaterial?.unit || ''} @${formatCurrency(b.inboundPrice)})`,
                      })),
                    ]}
                    placeholder="请选择批次"
                  />
                  {form.batchId && (
                    <p className="text-xs text-gray-400 mt-1">
                      入库单价: {formatCurrency(materialBatches.find(b => b.id === form.batchId)?.inboundPrice || 0)}
                      ，建议退款: {formatCurrency((materialBatches.find(b => b.id === form.batchId)?.inboundPrice || 0) * form.quantity)}
                    </p>
                  )}
                  {form.materialId && materialBatches.length === 0 && (
                    <p className="text-xs text-red-400 mt-1">该物料无可用批次</p>
                  )}
                  {form.materialId && form.supplierId && materialBatches.length > 0 && supplierScopedBatches.length === 0 && (
                    <p className="text-xs text-red-400 mt-1">该供应商下无可退批次</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    供应商 <span className="text-red-500">*</span>
                  </label>
                  <SearchableSelect
                    testId="supplier-return-supplier-select"
                    value={form.supplierId}
                    onChange={(val) => setForm({ ...form, supplierId: val, batchId: '', purchaseOrderId: '', inboundRecordId: '', refundAmount: '' })}
                    options={suppliers.map((s) => ({
                      value: s.id,
                      label: s.name,
                    }))}
                    placeholder="请选择"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">关联采购订单</label>
                  <SearchableSelect
                    value={form.purchaseOrderId}
                    onChange={(val) => setForm({ ...form, purchaseOrderId: val })}
                    options={[
                      { value: '', label: '请选择' },
                      ...purchaseOrders
                        .filter((po) => !form.supplierId || po.supplierId === form.supplierId)
                        .map((po) => ({
                          value: po.id,
                          label: `${po.orderNo} (${po.materialName}) — ${po.status === 'partial' ? '部分收货' : po.status === 'completed' ? '已完成' : po.status === 'pending' ? '待收货' : '已取消'}`,
                        })),
                    ]}
                    placeholder="请选择"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">关联入库记录</label>
                  <SearchableSelect
                    value={form.inboundRecordId}
                    onChange={(val) => setForm({ ...form, inboundRecordId: val })}
                    options={[
                      { value: '', label: '请选择' },
                      ...inboundRecords
                        .filter((ir) => !form.materialId || ir.materialId === form.materialId)
                        .filter((ir) => !form.supplierId || ir.supplierId === form.supplierId)
                        .map((ir) => ({
                          value: ir.id,
                          label: `${ir.inboundNo} (${ir.materialName} × ${ir.quantity}${ir.unit})`,
                        })),
                    ]}
                    placeholder="请选择"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  退货原因 <span className="text-red-500">*</span>
                </label>
                <SearchableSelect
                  testId="supplier-return-reason-select"
                  value={form.reason}
                  onChange={(val) => setForm({ ...form, reason: val })}
                  options={[
                    { value: '', label: '请选择' },
                    ...reasonOptions,
                  ]}
                  placeholder="请选择"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">退款金额</label>
                  <input
                    data-testid="supplier-return-refund-amount-input"
                    type="number"
                    min={0}
                    step={0.01}
                    value={form.refundAmount}
                    onChange={(e) => setForm({ ...form, refundAmount: e.target.value })}
                    placeholder="0.00"
                    className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">物流单号</label>
                  <input
                    type="text"
                    value={form.trackingNo}
                    onChange={(e) => setForm({ ...form, trackingNo: e.target.value })}
                    placeholder="可选"
                    className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>

              {showSupplierReturnPreview && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                    <h4 className="text-sm font-semibold text-gray-900">退货结果确认</h4>
                    <div className="text-xs text-gray-500 mt-0.5">确认后将接住：{supplierReturnDownstreamFacts}</div>
                  </div>
                  <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      { label: '物料', value: selectedMaterial?.name || '-' },
                      { label: '批次', value: selectedBatch?.batchNo || '-' },
                      { label: '供应商', value: selectedSupplier?.name || '-' },
                      { label: '退货数量', value: supplierReturnQuantityText || '-' },
                      { label: '扣减动作', value: supplierReturnDeductionText },
                      { label: '批次余量', value: supplierReturnBatchRemainingText },
                      { label: '预计退款', value: `预计退款 ${formatCurrency(supplierReturnRefundAmount)}` },
                      { label: '退货原因', value: selectedReasonLabel },
                      { label: '采购订单', value: selectedPurchaseOrder?.orderNo || '-' },
                      { label: '入库来源', value: selectedInboundRecord?.inboundNo || '-' },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0">
                        <div className="text-xs text-gray-500 mb-1">{item.label}</div>
                        <div className="text-sm font-medium text-gray-900 truncate">{item.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {supplierReturnValidationMessage && (
                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  {supplierReturnValidationMessage}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">备注</label>
                <textarea
                  value={form.remark}
                  onChange={(e) => setForm({ ...form, remark: e.target.value })}
                  rows={2}
                  placeholder="可选"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors resize-none"
                />
              </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 h-10 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                取消
              </button>
              <button
                data-testid="supplier-return-confirm-btn"
                onClick={handleCreate}
                disabled={!canConfirmSupplierReturn}
                className="px-4 h-10 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? '提交中...' : '确认创建'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {detailOpen && detailRecord && (
        <Modal onClose={() => setDetailOpen(false)} title="退货详情" size="lg">
          <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">退货单号</span>
                <span className="text-sm font-mono text-gray-900">{detailRecord.returnNo}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">物料</span>
                <span className="text-sm text-gray-900">{detailRecord.materialName || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">退货数量</span>
                <span className="text-sm text-gray-900">{detailRecord.quantity}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">退货批次</span>
                <span className="text-sm font-mono text-gray-900">{detailRecord.batchNo || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">供应商</span>
                <span className="text-sm text-gray-900">{detailRecord.supplierName || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">关联采购订单</span>
                <span className="text-sm text-gray-900">{detailRecord.purchaseOrderNo || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">关联入库记录</span>
                <span className="text-sm text-gray-900">{detailRecord.inboundNo || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">退货原因</span>
                <span className="text-sm text-gray-900">
                  {reasonOptions.find((r) => r.value === detailRecord.reason)?.label || detailRecord.reason}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">退款金额</span>
                <span className="text-sm text-gray-900">{detailRecord.refundAmount ? formatCurrency(detailRecord.refundAmount) : '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">物流单号</span>
                <span className="text-sm text-gray-900">{detailRecord.trackingNo || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">操作人</span>
                <span className="text-sm text-gray-900">{detailRecord.operator}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">备注</span>
                <span className="text-sm text-gray-900">{detailRecord.remark || '-'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">当前状态</span>
                {(() => {
                  const detailStatusInfo = detailRecord.isDeleted
                    ? { label: '已删除', color: 'text-red-700', bg: 'bg-red-50', icon: Trash2 }
                    : statusMap[detailRecord.status]
                  const DetailStatusIcon = detailStatusInfo.icon
                  return (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${detailStatusInfo.bg} ${detailStatusInfo.color}`}>
                      <DetailStatusIcon className="w-3 h-3" />
                      {detailStatusInfo.label}
                    </span>
                  )
                })()}
              </div>

              {/* Status Flow */}
              {!detailRecord.isDeleted && detailRecord.status !== 'refunded' && detailRecord.status !== 'cancelled' && (
                <div className="border-t border-gray-200 pt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">状态流转</label>
                  <div className="flex items-center gap-2 flex-wrap">
                    {detailRecord.status === 'pending' && (
                      <button
                        onClick={() => openStatusTransitionConfirm(detailRecord, 'shipped')}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-md hover:bg-blue-700 transition-colors"
                      >
                        标记为已发货
                      </button>
                    )}
                    {detailRecord.status === 'shipped' && (
                      <button
                        onClick={() => openStatusTransitionConfirm(detailRecord, 'received')}
                        className="px-3 py-1.5 bg-purple-600 text-white text-xs rounded-md hover:bg-purple-700 transition-colors"
                      >
                        供应商已收货
                      </button>
                    )}
                    {detailRecord.status === 'received' && (
                      <button
                        onClick={() => openStatusTransitionConfirm(detailRecord, 'refunded')}
                        className="px-3 py-1.5 bg-green-600 text-white text-xs rounded-md hover:bg-green-700 transition-colors"
                      >
                        标记退款完成
                      </button>
                    )}
                    {detailRecord.status !== 'cancelled' && (
                      <button
                        onClick={() => openStatusCancelConfirm(detailRecord)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-md hover:bg-gray-200 transition-colors"
                      >
                        取消退货
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Timeline */}
              <div className="border-t border-gray-200 pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">时间线</label>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-gray-900">创建退货记录</p>
                      <p className="text-xs text-gray-400">{formatDate(detailRecord.createdAt)}</p>
                    </div>
                  </div>
                  {detailRecord.status !== 'pending' && detailRecord.status !== 'cancelled' && (
                    <div className="flex items-start gap-3">
                      <ChevronRight className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-gray-900">状态变更为 {statusMap[detailRecord.status]?.label || detailRecord.status}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
              <button
                onClick={() => setDetailOpen(false)}
                className="px-4 h-10 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={deleteConfirmOpen && !!recordToDelete}
        title="确认删除"
        description={`确定要删除退货记录 ${recordToDelete?.returnNo} 吗？仅待发货状态可删除；删除后将恢复本次退货扣减的库存和批次余量，同步更新供应商成本净额和库存流水，重新触发库存预警检查；审计记录将保留删除动作。`}
        confirmText="确认删除"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => { setDeleteConfirmOpen(false); setRecordToDelete(null) }}
      />

      <ConfirmDialog
        open={statusCancelConfirmOpen && !!recordToCancelStatus}
        title="确认取消退货"
        description={`确定要取消退货记录 ${recordToCancelStatus?.returnNo} 吗？取消后将恢复本次退货扣减的库存和批次余量，同步更新供应商成本净额和库存流水，重新触发库存预警检查；审计记录将保留取消动作。`}
        confirmText="确认取消"
        confirmVariant="danger"
        onConfirm={() => recordToCancelStatus && handleStatusChange(recordToCancelStatus.id, 'cancelled')}
        onCancel={() => { setStatusCancelConfirmOpen(false); setRecordToCancelStatus(null) }}
      />

      <ConfirmDialog
        open={!!pendingStatusTransition}
        title="确认状态流转"
        description={pendingStatusDescription}
        confirmText="确认流转"
        confirmVariant="primary"
        onConfirm={() => pendingStatusTransition && handleStatusChange(pendingStatusTransition.record.id, pendingStatusTransition.status)}
        onCancel={() => setPendingStatusTransition(null)}
      />
    </div>
  )
}
