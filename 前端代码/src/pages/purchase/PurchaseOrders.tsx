import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileSearch, Plus, Search } from 'lucide-react'
import { usePagination } from '@/hooks/usePagination'
import { Pagination } from '@/components/ui/Pagination'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { purchaseOrderApi } from '@/api/inventory'
import { materialApi, supplierApi } from '@/api/master'
import type { PurchaseOrder, Material, Supplier } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { getUserRole } from '@/lib/permissions'
import { toast } from 'sonner'

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: '待收货', bg: 'bg-yellow-50', text: 'text-yellow-600' },
  partial: { label: '部分收货', bg: 'bg-blue-50', text: 'text-blue-600' },
  completed: { label: '已完成', bg: 'bg-green-50', text: 'text-green-600' },
  cancelled: { label: '已取消', bg: 'bg-red-50', text: 'text-red-600' },
}

const DEFAULT_PURCHASE_FORM: PurchaseOrderForm = {
  materialId: '',
  supplierId: '',
  orderedQty: 1,
  unitPrice: 0,
  unit: '个',
  expectedDate: '',
  remark: '',
}

export interface PurchaseOrderForm {
  materialId: string
  supplierId: string
  orderedQty: number
  unitPrice: number
  unit: string
  expectedDate: string
  remark: string
}

interface CreateDraft {
  materialId?: string
  orderedQty?: number
  remark?: string
}

interface PurchaseOrderRefs {
  materials: Material[]
  suppliers: Supplier[]
}

export function applySelectedMaterialToPurchaseForm(form: PurchaseOrderForm, material?: Material): PurchaseOrderForm {
  if (!material) return form
  return {
    ...form,
    materialId: material.id,
    supplierId: material.supplierId || form.supplierId,
    unit: material.unit || form.unit,
    unitPrice: Number(material.price || 0),
  }
}

export function canWritePurchaseOrders(role: string | null): boolean {
  return role === 'admin' || role === 'procurement'
}

export function canReceivePurchaseOrders(role: string | null): boolean {
  return role === 'admin' || role === 'warehouse_manager'
}

export function canEditPurchaseOrder(role: string | null, order: Pick<PurchaseOrder, 'status' | 'receivedQty'>): boolean {
  return canWritePurchaseOrders(role) && order.status === 'pending' && Number(order.receivedQty || 0) === 0
}

export function purchaseOrderToForm(order: PurchaseOrder): PurchaseOrderForm {
  return {
    materialId: order.materialId,
    supplierId: order.supplierId || '',
    orderedQty: order.orderedQty,
    unitPrice: order.unitPrice,
    unit: order.unit,
    expectedDate: order.expectedDate || '',
    remark: order.remark || '',
  }
}

function getPurchaseOrderErrorMessage(error: unknown, fallback: string) {
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

function buildCreatedPurchaseOrderRecord(
  payload: Partial<PurchaseOrder>,
  form: PurchaseOrderForm,
  refs: PurchaseOrderRefs,
): PurchaseOrder | null {
  if (!payload.id || !payload.orderNo) return null

  const materialId = payload.materialId || form.materialId
  const supplierId = payload.supplierId || form.supplierId || undefined
  const material = refs.materials.find(item => item.id === materialId)
  const supplier = refs.suppliers.find(item => item.id === supplierId)
  const orderedQty = Number(payload.orderedQty ?? form.orderedQty)
  const receivedQty = Number(payload.receivedQty ?? 0)
  const unitPrice = Number(payload.unitPrice ?? form.unitPrice ?? 0)
  const createdAt = payload.createdAt || new Date().toISOString()

  return {
    id: payload.id,
    orderNo: payload.orderNo,
    materialId,
    materialName: payload.materialName || material?.name || materialId,
    supplierId,
    supplierName: payload.supplierName || supplier?.name,
    orderedQty,
    receivedQty,
    remainingQty: Number(payload.remainingQty ?? Math.max(0, orderedQty - receivedQty)),
    unit: payload.unit || form.unit || material?.unit || '',
    unitPrice,
    totalAmount: Number(payload.totalAmount ?? Number((orderedQty * unitPrice).toFixed(2))),
    expectedDate: payload.expectedDate || form.expectedDate || undefined,
    status: payload.status || 'pending',
    remark: (payload.remark ?? form.remark) || undefined,
    createdAt,
    updatedAt: payload.updatedAt || createdAt,
  }
}

function isSamePurchaseOrder(a: Pick<PurchaseOrder, 'id' | 'orderNo'>, b: Pick<PurchaseOrder, 'id' | 'orderNo'>): boolean {
  return a.id === b.id || a.orderNo === b.orderNo
}

function getInitialStatusFilter(): string {
  const status = new URLSearchParams(window.location.search).get('status') || ''
  const allowed = new Set(['', 'pending', 'partial', 'pending,partial', 'completed', 'cancelled'])
  return allowed.has(status) ? status : ''
}

function getCreateDraftFromUrl(): CreateDraft {
  const params = new URLSearchParams(window.location.search)
  const orderedQty = Number(params.get('orderedQty') || '')
  return {
    materialId: params.get('materialId') || undefined,
    orderedQty: Number.isFinite(orderedQty) && orderedQty > 0 ? orderedQty : undefined,
    remark: params.get('remark') || undefined,
  }
}

export default function PurchaseOrders() {
  const navigate = useNavigate()
  const role = getUserRole()
  const canWrite = canWritePurchaseOrders(role)
  const canReceive = canReceivePurchaseOrders(role)
  const handledCreateFromQuery = useRef(false)
  const initialKeyword = new URLSearchParams(window.location.search).get('keyword') || ''
  const [materials, setMaterials] = useState<Material[]>([])
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [searchText, setSearchText] = useState(initialKeyword)
  const [statusFilter, setStatusFilter] = useState(getInitialStatusFilter)

  const [modalOpen, setModalOpen] = useState(false)
  const [receiveModalOpen, setReceiveModalOpen] = useState(false)
  const [detailModalOpen, setDetailModalOpen] = useState(false)
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null)
  const [orderToCancel, setOrderToCancel] = useState<PurchaseOrder | null>(null)
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null)
  const [receiveQty, setReceiveQty] = useState(0)
  const [createdPurchaseOrderFallback, setCreatedPurchaseOrderFallback] = useState<PurchaseOrder | null>(null)
  const [cancelledPurchaseOrderFallback, setCancelledPurchaseOrderFallback] = useState<PurchaseOrder | null>(null)

  const [form, setForm] = useState<PurchaseOrderForm>(DEFAULT_PURCHASE_FORM)

  const fetchRefs = async () => {
    try {
      const [mRes, sRes]: any = await Promise.all([
        materialApi.getList({ page: 1, pageSize: 999, status: 'active' }),
        supplierApi.getList({ page: 1, pageSize: 999, status: 'active' }),
      ])
      const refs = { materials: mRes?.list || [], suppliers: sRes?.list || [] }
      setMaterials(refs.materials)
      setSuppliers(refs.suppliers)
      return refs
    } catch (e) {
      console.error(e)
      const refs = { materials: [], suppliers: [] }
      setMaterials(refs.materials)
      setSuppliers(refs.suppliers)
      return refs
    }
  }

  useEffect(() => { fetchRefs() }, [])

  const fetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const res: any = await purchaseOrderApi.getList({
        page, pageSize,
        status: statusFilter || undefined,
        keyword: searchText || undefined,
      })
      return { list: res.list || [], pagination: res.pagination }
    },
    [statusFilter, searchText]
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
  } = usePagination<PurchaseOrder>({
    fetchFn,
    deps: [statusFilter, searchText],
  })

  const { displayedData, displayedTotal } = useMemo(() => {
    let rows = data
    let nextTotal = total

    if (
      createdPurchaseOrderFallback &&
      searchText === createdPurchaseOrderFallback.orderNo &&
      !statusFilter &&
      page === 1 &&
      !rows.some(row => row.id === createdPurchaseOrderFallback.id || row.orderNo === createdPurchaseOrderFallback.orderNo)
    ) {
      rows = [createdPurchaseOrderFallback, ...rows]
      nextTotal = Math.max(nextTotal + 1, rows.length)
    }

    if (
      cancelledPurchaseOrderFallback &&
      searchText === cancelledPurchaseOrderFallback.orderNo &&
      statusFilter === 'cancelled' &&
      page === 1
    ) {
      const hasCancelledRow = rows.some(row => row.id === cancelledPurchaseOrderFallback.id || row.orderNo === cancelledPurchaseOrderFallback.orderNo)
      rows = hasCancelledRow
        ? rows.map(row => (row.id === cancelledPurchaseOrderFallback.id || row.orderNo === cancelledPurchaseOrderFallback.orderNo ? cancelledPurchaseOrderFallback : row))
        : [cancelledPurchaseOrderFallback, ...rows]
      if (!hasCancelledRow) nextTotal = Math.max(nextTotal + 1, rows.length)
    }

    return { displayedData: rows, displayedTotal: nextTotal }
  }, [cancelledPurchaseOrderFallback, createdPurchaseOrderFallback, data, page, searchText, statusFilter, total])

  useEffect(() => {
    if (!createdPurchaseOrderFallback) return
    if (data.some(row => isSamePurchaseOrder(row, createdPurchaseOrderFallback))) {
      setCreatedPurchaseOrderFallback(null)
    }
  }, [createdPurchaseOrderFallback, data])

  useEffect(() => {
    if (!cancelledPurchaseOrderFallback) return
    if (data.some(row => isSamePurchaseOrder(row, cancelledPurchaseOrderFallback) && row.status === 'cancelled')) {
      setCancelledPurchaseOrderFallback(null)
    }
  }, [cancelledPurchaseOrderFallback, data])

  const resetForm = () => {
    setForm(DEFAULT_PURCHASE_FORM)
    setEditingOrder(null)
  }

  const openCreateModal = async (draft: CreateDraft = {}) => {
    const refs = await fetchRefs()
    setEditingOrder(null)
    const baseForm: PurchaseOrderForm = {
      ...DEFAULT_PURCHASE_FORM,
      materialId: draft.materialId || '',
      orderedQty: draft.orderedQty || DEFAULT_PURCHASE_FORM.orderedQty,
      remark: draft.remark || '',
    }
    const material = refs.materials.find((item: Material) => item.id === draft.materialId)
    setForm(applySelectedMaterialToPurchaseForm(baseForm, material))
    setModalOpen(true)
  }

  useEffect(() => {
    if (handledCreateFromQuery.current) return
    if (new URLSearchParams(window.location.search).get('action') !== 'create') return

    handledCreateFromQuery.current = true
    if (canWrite) {
      void openCreateModal(getCreateDraftFromUrl())
    }
  }, [canWrite])

  const openEditModal = (order: PurchaseOrder) => {
    if (!canEditPurchaseOrder(role, order)) {
      toast.error('只有未收货的待收货订单可以编辑')
      return
    }
    fetchRefs()
    setEditingOrder(order)
    setForm(purchaseOrderToForm(order))
    setModalOpen(true)
  }

  const closeFormModal = () => {
    setModalOpen(false)
    resetForm()
  }

  const focusCreatedPurchaseOrder = (orderNo: string) => {
    setSearchText(orderNo)
    setStatusFilter('')
    setPage(1)
  }

  const focusCancelledPurchaseOrder = (orderNo: string) => {
    setSearchText(orderNo)
    setStatusFilter('cancelled')
    setPage(1)
  }

  const handleSave = async () => {
    if (!canWrite) {
      toast.error(editingOrder ? '当前角色不能编辑采购订单' : '当前角色不能创建采购订单')
      return
    }
    if (!form.materialId || !form.supplierId || form.orderedQty <= 0) {
      toast.error('请选择物料、供应商并填写采购数量')
      return
    }
    const mat = materials.find(m => m.id === form.materialId)
    try {
      const payload = {
        ...form,
        materialName: mat?.name || '',
        unitPrice: form.unitPrice,
      }
      if (editingOrder) {
        await purchaseOrderApi.update(editingOrder.id, payload)
        toast.success('采购订单已更新', {
          description: '后续收货会按最新订单信息进入入库、库存和审计链路',
        })
      } else {
        const res: any = await purchaseOrderApi.create(payload)
        const created = res?.data ?? res
        if (created?.orderNo) {
          setCreatedPurchaseOrderFallback(buildCreatedPurchaseOrderRecord(created, form, { materials, suppliers }))
          focusCreatedPurchaseOrder(created.orderNo)
        }
        toast.success('采购订单创建成功', {
          description: created?.orderNo
            ? `已生成 ${created.orderNo}，后续收货会进入入库、库存、预警记录和审计链路`
            : '后续收货会进入入库、库存、预警记录和审计链路',
        })
      }
      closeFormModal()
      refresh()
    } catch (e) {
      toast.error(getPurchaseOrderErrorMessage(e, editingOrder ? '编辑失败' : '创建失败'))
    }
  }

  const handleReceive = async () => {
    if (!selectedOrder || receiveQty <= 0) return
    if (receiveQty > selectedOrder.remainingQty) {
      toast.error('收货数量不能超过剩余数量')
      return
    }
    const params = new URLSearchParams({
      action: 'create',
      type: 'purchase',
      purchaseOrderId: selectedOrder.id,
      purchaseOrderNo: selectedOrder.orderNo,
      materialId: selectedOrder.materialId,
      quantity: String(receiveQty),
      remainingQty: String(selectedOrder.remainingQty),
      price: String(selectedOrder.unitPrice || 0),
    })
    if (selectedOrder.supplierId) params.set('supplierId', selectedOrder.supplierId)
    if (selectedOrder.materialName) params.set('materialName', selectedOrder.materialName)
    if (selectedOrder.supplierName) params.set('supplierName', selectedOrder.supplierName)
    if (selectedOrder.unit) params.set('unit', selectedOrder.unit)
    setReceiveModalOpen(false)
    setSelectedOrder(null)
    navigate(`/inbound?${params.toString()}`)
  }

  const openAuditEvidence = (orderNo: string) => {
    navigate(`/logs?keyword=${encodeURIComponent(orderNo)}`)
  }

  const openCancelConfirm = (order: PurchaseOrder) => {
    setOrderToCancel(order)
    setCancelConfirmOpen(true)
  }

  const closeCancelConfirm = () => {
    setCancelConfirmOpen(false)
    setOrderToCancel(null)
  }

  const handleCancel = async () => {
    if (!orderToCancel) return
    if (!canWrite) {
      toast.error('当前角色不能取消采购订单')
      closeCancelConfirm()
      return
    }
    try {
      await purchaseOrderApi.cancel(orderToCancel.id)
      setCancelledPurchaseOrderFallback({
        ...orderToCancel,
        status: 'cancelled',
        updatedAt: new Date().toISOString(),
      })
      focusCancelledPurchaseOrder(orderToCancel.orderNo)
      toast.success('订单已取消', {
        description: `${orderToCancel.orderNo} 的待入库数量已从入库候选移除；库存、批次和成本不产生回退，审计记录可按单号回看`,
      })
      closeCancelConfirm()
      refresh()
    } catch (e) {
      toast.error('取消失败')
    }
  }

  const selectedFormMaterial = materials.find(item => item.id === form.materialId)
  const selectedFormSupplier = suppliers.find(item => item.id === form.supplierId)
  const purchaseCreateAmount = Number(form.orderedQty || 0) * Number(form.unitPrice || 0)
  const purchaseCreateExpectedDateText = form.expectedDate || '待补充'
  const purchaseCreateNextStepText = form.expectedDate
    ? '到货后进入入库收货队列'
    : '补充预计到货后，仓库可按计划收货入库'
  const purchaseCreateDownstreamFacts = '采购订单、入库、库存、预警记录、审计记录'
  const purchaseReceiveDownstreamFacts = '采购订单、入库单、库存批次、库位、成本、审计记录'
  const receiveValidationMessage = selectedOrder
    ? receiveQty <= 0
      ? '请输入本次实际收货数量，系统会把它带入入库单。'
      : receiveQty > selectedOrder.remainingQty
        ? `本次收货数量超过剩余可收货 ${selectedOrder.remainingQty}，请按实收数量修改。`
        : ''
    : ''
  const canNavigateToInbound = !receiveValidationMessage

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900">采购订单</h1>
          <p className="text-sm text-gray-500 mt-1">管理物料采购订单及收货进度</p>
        </div>
        {canWrite && (
          <button
            onClick={() => void openCreateModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 text-sm font-medium transition-all duration-150"
          >
            <Plus className="w-4 h-4" />
            新建采购订单
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-[0_1px_3px_rgba(0,0,0,0.1)] overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 p-4 border-b border-gray-200">
          <span className="text-base font-medium text-gray-900">采购订单</span>
          <div className="flex-1 flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索订单号/物料名称..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                className="pl-9 pr-3 h-10 w-64 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <SearchableSelect
              value={statusFilter}
              onChange={val => setStatusFilter(val)}
              options={[
                { value: '', label: '全部状态' },
                { value: 'pending,partial', label: '待收货/部分收货' },
                { value: 'pending', label: '待收货' },
                { value: 'partial', label: '部分收货' },
                { value: 'completed', label: '已完成' },
                { value: 'cancelled', label: '已取消' },
              ]}
              placeholder="全部状态"
              className="w-32"
            />
            <button
              onClick={() => { setSearchText(''); setStatusFilter(''); setPage(1) }}
              className="h-10 px-4 text-gray-500 rounded-md text-sm hover:text-gray-700 hover:bg-gray-50 transition-all duration-150"
            >
              重置
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">订单号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">物料</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">供应商</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">采购数量</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">已收货</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">单价</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">总金额</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[180px]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
              ) : displayedData.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">暂无数据</td></tr>
              ) : (
                displayedData.map(row => {
                  const cfg = statusConfig[row.status] || statusConfig.pending
                  const supplier = suppliers.find(s => s.id === row.supplierId)
                  return (
                    <tr key={row.id} className="hover:bg-gray-50 transition-colors duration-150">
                      <td className="px-4 py-3 font-mono text-gray-600">{row.orderNo}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{row.materialName}</td>
                      <td className="px-4 py-3 text-gray-600">{row.supplierName || supplier?.name || '-'}</td>
                      <td className="px-4 py-3 text-right">{row.orderedQty} {row.unit}</td>
                      <td className="px-4 py-3 text-right">{row.receivedQty} {row.unit}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.unitPrice)}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(row.totalAmount)}</td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setSelectedOrder(row); setDetailModalOpen(true) }}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors duration-150"
                          >
                            详情
                          </button>
                          <button
                            type="button"
                            aria-label={`审计证据 ${row.orderNo}`}
                            onClick={() => openAuditEvidence(row.orderNo)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors duration-150"
                          >
                            <FileSearch className="h-3.5 w-3.5" />
                            证据
                          </button>
                          {canReceive && (row.status === 'pending' || row.status === 'partial') && (
                            <button
                              onClick={() => { setSelectedOrder(row); setReceiveQty(row.remainingQty); setReceiveModalOpen(true) }}
                              className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors duration-150"
                            >
                              收货
                            </button>
                          )}
                          {canEditPurchaseOrder(role, row) && (
                            <button
                              onClick={() => openEditModal(row)}
                              className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors duration-150"
                            >
                              编辑
                            </button>
                          )}
                          {canWrite && row.status === 'pending' && (
                            <button
                              onClick={() => openCancelConfirm(row)}
                              className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors duration-150"
                            >
                              取消
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
          <Pagination page={page} pageSize={pageSize} total={displayedTotal} onChangePage={setPage} onChangePageSize={setPageSize} />
        </div>
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <Modal onClose={closeFormModal} title={editingOrder ? '编辑采购订单' : '新建采购订单'} size="lg">
          <div className="space-y-4">
            {editingOrder && (
              <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
                仅未收货订单可更正；保存后会记录前后值，仓管入库时使用更正后的数量、单价和供应商。
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">物料 <span className="text-red-500">*</span></label>
              <SearchableSelect
                value={form.materialId}
                onChange={val => setForm(applySelectedMaterialToPurchaseForm(form, materials.find(m => m.id === val)))}
                options={materials.map(m => ({
                  value: m.id,
                  label: `${m.name} (${m.code})`,
                }))}
                placeholder="请选择"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">供应商 <span className="text-red-500">*</span></label>
                <SearchableSelect
                  value={form.supplierId}
                  onChange={val => setForm({ ...form, supplierId: val })}
                  options={suppliers.map(s => ({
                    value: s.id,
                    label: s.name,
                  }))}
                  placeholder="请选择"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">采购数量 <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min={1}
                  value={form.orderedQty}
                  onChange={e => setForm({ ...form, orderedQty: Number(e.target.value) })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">单价</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.unitPrice}
                  onChange={e => setForm({ ...form, unitPrice: Number(e.target.value) })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">单位</label>
                <input
                  type="text"
                  value={form.unit}
                  onChange={e => setForm({ ...form, unit: e.target.value })}
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">预计到货日期</label>
              <input
                type="date"
                value={form.expectedDate}
                onChange={e => setForm({ ...form, expectedDate: e.target.value })}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
              <textarea
                value={form.remark}
                onChange={e => setForm({ ...form, remark: e.target.value })}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {!editingOrder && form.materialId && (
              <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-semibold text-emerald-900">采购创建确认</h4>
                  <div className="text-xs text-emerald-700">确认后将接住：{purchaseCreateDownstreamFacts}</div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-emerald-700 sm:grid-cols-2">
                  <div>物料 {selectedFormMaterial?.name || '-'}</div>
                  <div>供应商 {selectedFormSupplier?.name || '待选择'}</div>
                  <div>采购数量 {form.orderedQty || 0} {form.unit || selectedFormMaterial?.unit || ''}</div>
                  <div>预计金额 {formatCurrency(purchaseCreateAmount)}</div>
                  <div>预计到货 {purchaseCreateExpectedDateText}</div>
                  <div>{purchaseCreateNextStepText}</div>
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button onClick={closeFormModal} className="px-4 h-10 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">取消</button>
            <button onClick={handleSave} className="px-4 h-10 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors">{editingOrder ? '保存更正' : '确认创建'}</button>
          </div>
        </Modal>
      )}

      {/* Detail Modal */}
      {detailModalOpen && selectedOrder && (
        <Modal onClose={() => setDetailModalOpen(false)} title="采购订单详情" size="lg">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">订单号</span>
              <span className="font-mono text-sm font-medium">{selectedOrder.orderNo}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">物料</span>
              <span className="text-sm font-medium">{selectedOrder.materialName}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">供应商</span>
              <span className="text-sm font-medium">{selectedOrder.supplierName || suppliers.find(s => s.id === selectedOrder.supplierId)?.name || '-'}</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-xs text-gray-500">采购数量</div>
                <div className="text-lg font-semibold">{selectedOrder.orderedQty} {selectedOrder.unit}</div>
              </div>
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-xs text-gray-500">已收货</div>
                <div className="text-lg font-semibold">{selectedOrder.receivedQty} {selectedOrder.unit}</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-xs text-gray-500">剩余待收</div>
                <div className="text-lg font-semibold">{selectedOrder.remainingQty} {selectedOrder.unit}</div>
              </div>
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-xs text-gray-500">总金额</div>
                <div className="text-lg font-semibold">{formatCurrency(selectedOrder.totalAmount)}</div>
              </div>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">单价</span>
              <span className="text-sm">{formatCurrency(selectedOrder.unitPrice)}</span>
            </div>
            {selectedOrder.expectedDate && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">预计到货</span>
                <span className="text-sm">{selectedOrder.expectedDate}</span>
              </div>
            )}
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">状态</span>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusConfig[selectedOrder.status]?.bg} ${statusConfig[selectedOrder.status]?.text}`}>
                {statusConfig[selectedOrder.status]?.label}
              </span>
            </div>
            {selectedOrder.remark && (
              <div className="bg-gray-50 rounded-md p-3">
                <div className="text-xs text-gray-500 mb-1">备注</div>
                <div className="text-sm">{selectedOrder.remark}</div>
              </div>
            )}
            <div className="flex justify-between items-center text-xs text-gray-400">
              <span>创建时间: {selectedOrder.createdAt}</span>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => openAuditEvidence(selectedOrder.orderNo)}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-4 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
            >
              <FileSearch className="h-4 w-4" />
              审计证据
            </button>
            <button onClick={() => setDetailModalOpen(false)} className="px-4 h-10 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">关闭</button>
          </div>
        </Modal>
      )}

      {/* Receive Modal */}
      {receiveModalOpen && selectedOrder && (
        <Modal onClose={() => setReceiveModalOpen(false)} title="采购收货" size="md">
          <div className="space-y-4">
            <div className="bg-gray-50 p-3 rounded-md">
              <div className="text-xs text-gray-500">订单号</div>
              <div className="font-mono text-sm">{selectedOrder.orderNo}</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-gray-500">采购数量</div>
                <div className="text-sm font-medium">{selectedOrder.orderedQty} {selectedOrder.unit}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500">已收货</div>
                <div className="text-sm font-medium">{selectedOrder.receivedQty} {selectedOrder.unit}</div>
              </div>
            </div>
            <div>
              <label htmlFor="purchase-receive-qty" className="block text-sm font-medium text-gray-700 mb-1">本次收货数量 <span className="text-red-500">*</span></label>
              <input
                id="purchase-receive-qty"
                type="number"
                min={1}
                max={selectedOrder.remainingQty}
                value={receiveQty}
                onChange={e => setReceiveQty(Number(e.target.value))}
                aria-describedby="purchase-receive-qty-help"
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p id="purchase-receive-qty-help" className="text-xs text-gray-400 mt-1">剩余可收货：{selectedOrder.remainingQty} {selectedOrder.unit}</p>
            </div>
            {receiveValidationMessage && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {receiveValidationMessage}
              </div>
            )}
            <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
              收货需要创建入库记录并填写批号、库位和有效期；确认后将跳转到入库页面，库存和采购订单收货数量会在入库成功后同步更新。
            </div>
            <div className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2">
              <div className="mb-2 text-sm font-medium text-emerald-800">入库带入确认</div>
              <div className="mb-2 text-xs text-emerald-700">确认后将接住：{purchaseReceiveDownstreamFacts}</div>
              <div className="grid grid-cols-1 gap-2 text-xs text-emerald-700 sm:grid-cols-2">
                <div>物料 {selectedOrder.materialName}</div>
                <div>供应商 {selectedOrder.supplierName || '待补充'}</div>
                <div>本次入库 {receiveQty || 0} {selectedOrder.unit}</div>
                <div>入库单价 ¥{Number(selectedOrder.unitPrice || 0).toFixed(2)}</div>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button onClick={() => setReceiveModalOpen(false)} className="px-4 h-10 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">取消</button>
            <button
              onClick={handleReceive}
              disabled={!canNavigateToInbound}
              className="px-4 h-10 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
            >
              去入库
            </button>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={cancelConfirmOpen && !!orderToCancel}
        title="确认取消采购订单"
        description={`确定要取消采购订单 ${orderToCancel?.orderNo} 吗？取消后该订单将不再作为入库收货候选。`}
        confirmText="确认取消"
        confirmVariant="danger"
        onConfirm={handleCancel}
        onCancel={closeCancelConfirm}
      />
    </div>
  )
}
