import { Modal } from '@/components/ui/Modal'
import type { InboundRecord, Location, Material, Supplier } from '@/types'
import type { Dispatch, SetStateAction } from 'react'

export type InboundFormType = 'direct' | 'purchase' | 'return' | 'transfer' | 'surplus' | 'other'

export interface FormData {
  type: InboundFormType
  materialId: string
  batchNo: string
  quantity: number
  price: number
  supplierId: string
  locationId: string
  fromLocationId: string
  fromLocationName: string
  productionDate: string
  expiryDate: string
  remark: string
  purchaseOrderId?: string
}

interface PurchaseOrderOption {
  id?: string
  orderNo?: string
  purchaseOrderNo?: string
  materialId?: string
  materialName?: string
  supplierId?: string
  remainingQty?: number
  unitPrice?: number
}

interface InboundFormModalProps {
  open: boolean
  modalType: 'create' | 'edit'
  form: FormData
  setForm: Dispatch<SetStateAction<FormData>>
  materials: Material[]
  locations: Location[]
  suppliers: Supplier[]
  purchaseOrders: PurchaseOrderOption[]
  selectedOrderId: string
  setSelectedOrderId: (id: string) => void
  selectedRecord: InboundRecord | null
  submitting: boolean
  onClose: () => void
  onSubmit: () => void
}

export function applyPurchaseOrderToInboundForm(prev: FormData, order?: PurchaseOrderOption): FormData {
  if (!order?.id) return { ...prev, purchaseOrderId: '', purchaseOrderNo: '' }
  return {
    ...prev,
    purchaseOrderId: order.id,
    purchaseOrderNo: order.orderNo || order.purchaseOrderNo || order.id,
    materialId: order.materialId || prev.materialId,
    supplierId: order.supplierId || prev.supplierId,
    quantity: order.remainingQty !== undefined ? order.remainingQty : prev.quantity,
    price: order.unitPrice !== undefined ? order.unitPrice : prev.price,
  }
}

export default function InboundFormModal({
  open,
  modalType,
  form,
  setForm,
  materials,
  locations,
  suppliers,
  purchaseOrders,
  selectedOrderId,
  setSelectedOrderId,
  selectedRecord,
  submitting,
  onClose,
  onSubmit,
}: InboundFormModalProps) {
  if (!open) return null

  const selectedOrder = purchaseOrders.find(order => order.id === selectedOrderId)
  const selectedMaterial = materials.find(material => material.id === form.materialId)
  const selectedLocation = locations.find(location => location.id === form.locationId)
  const selectedSupplier = suppliers.find(supplier => supplier.id === form.supplierId)
  const selectedOrderNo = selectedOrder?.orderNo || selectedOrder?.purchaseOrderNo || form.purchaseOrderNo || selectedOrder?.id || form.purchaseOrderId
  const quantityUnit = selectedOrder?.unit || selectedMaterial?.unit || ''
  const inboundQuantityText = `${form.quantity || 0}${quantityUnit}`
  const quantityPreviewText = form.type === 'purchase' && selectedOrder?.remainingQty !== undefined
    ? `收货进度 +${inboundQuantityText} / 待入库 ${selectedOrder.remainingQty}${quantityUnit} / 入库后剩余 ${Math.max(0, selectedOrder.remainingQty - (form.quantity || 0))}${quantityUnit}`
    : `入库数量 +${inboundQuantityText}`
  const title = modalType === 'edit' ? '编辑入库记录' : '新增入库记录'
  const isPurchaseOverRemaining = form.type === 'purchase'
    && selectedOrder?.remainingQty !== undefined
    && form.quantity > selectedOrder.remainingQty
  const canSubmit = !submitting && !isPurchaseOverRemaining

  const updateForm = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  const handleTypeChange = (type: FormData['type']) => {
    setForm(prev => ({
      ...prev,
      type,
      purchaseOrderId: type === 'purchase' ? prev.purchaseOrderId : '',
      purchaseOrderNo: type === 'purchase' ? prev.purchaseOrderNo : '',
    }))
    if (type !== 'purchase') {
      setSelectedOrderId('')
    }
  }

  return (
    <Modal onClose={onClose} title={title} size="lg">
      <div className="space-y-5">
        {modalType === 'edit' && selectedRecord && (
          <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
            当前编辑入库单: <span className="font-mono">{selectedRecord.inboundNo}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700">入库类型</span>
            <select
              value={form.type}
              onChange={event => handleTypeChange(event.target.value as FormData['type'])}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
              disabled={modalType === 'edit'}
            >
              <option value="purchase">采购入库</option>
              <option value="direct">直接入库</option>
              <option value="return">退库入库</option>
              <option value="transfer">调拨入库</option>
              <option value="surplus">盘盈入库</option>
              <option value="other">其他入库</option>
            </select>
          </label>

          {form.type === 'purchase' && modalType !== 'edit' && (
            <label className="space-y-1.5">
              <span className="block text-sm font-medium text-gray-700">采购订单 <span className="text-red-500">*</span></span>
              <select
                value={selectedOrderId}
                onChange={event => {
                  const id = event.target.value
                  const order = purchaseOrders.find(item => item.id === id)
                  setSelectedOrderId(id)
                  setForm(prev => applyPurchaseOrderToInboundForm(prev, order))
                }}
                className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
              >
                <option value="">请选择采购订单</option>
                {purchaseOrders.map(order => (
                  <option key={order.id} value={order.id}>
                    {order.orderNo || order.purchaseOrderNo || order.id}
                    {order.materialName ? ` - ${order.materialName}` : ''}
                  </option>
                ))}
              </select>
              {selectedOrder?.remainingQty !== undefined && (
                <span className="text-xs text-gray-500">待入库: {selectedOrder.remainingQty}</span>
              )}
            </label>
          )}

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700">耗材 <span className="text-red-500">*</span></span>
            <select
              value={form.materialId}
              onChange={event => {
                const material = materials.find(item => item.id === event.target.value)
                setForm(prev => ({
                  ...prev,
                  materialId: event.target.value,
                  price: material?.price ?? prev.price,
                }))
              }}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            >
              <option value="">请选择耗材</option>
              {materials.map(material => (
                <option key={material.id} value={material.id}>
                  {material.code} - {material.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700">批号 <span className="text-red-500">*</span></span>
            <input
              value={form.batchNo}
              onChange={event => updateForm('batchNo', event.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
              placeholder="请输入批号"
            />
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700">数量 <span className="text-red-500">*</span></span>
            <input
              type="number"
              min={0.01}
              max={form.type === 'purchase' ? selectedOrder?.remainingQty : undefined}
              step={0.01}
              value={form.quantity}
              onChange={event => updateForm('quantity', Number(event.target.value))}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            />
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700">单价</span>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.price}
              onChange={event => updateForm('price', Number(event.target.value))}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            />
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700">供应商</span>
            <select
              value={form.supplierId}
              onChange={event => updateForm('supplierId', event.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            >
              <option value="">请选择供应商</option>
              {suppliers.map(supplier => (
                <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700">入库库位 <span className="text-red-500">*</span></span>
            <select
              value={form.locationId}
              onChange={event => updateForm('locationId', event.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            >
              <option value="">请选择库位</option>
              {locations.map(location => (
                <option key={location.id} value={location.id}>{location.name}</option>
              ))}
            </select>
          </label>

          {form.type === 'transfer' && (
            <>
              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-gray-700">来源库位</span>
                <select
                  value={form.fromLocationId}
                  onChange={event => updateForm('fromLocationId', event.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                >
                  <option value="">请选择来源库位</option>
                  {locations.map(location => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1.5">
                <span className="block text-sm font-medium text-gray-700">其他来源说明</span>
                <input
                  value={form.fromLocationName}
                  onChange={event => updateForm('fromLocationName', event.target.value)}
                  className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                  placeholder="无法选择来源库位时填写"
                />
              </label>
            </>
          )}

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700">生产日期</span>
            <input
              type="date"
              value={form.productionDate}
              onChange={event => updateForm('productionDate', event.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            />
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-gray-700">有效期至 <span className="text-red-500">*</span></span>
            <input
              type="date"
              value={form.expiryDate}
              onChange={event => updateForm('expiryDate', event.target.value)}
              className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            />
          </label>
        </div>

        <div className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3">
          <div className="mb-2 text-sm font-medium text-emerald-800">入库结果确认</div>
          <div className="grid grid-cols-1 gap-2 text-xs text-emerald-700 md:grid-cols-2">
            <div>采购订单 {form.type === 'purchase' ? (selectedOrderNo || '待选择') : '不关联'}</div>
            <div>耗材 {selectedMaterial?.name || '待选择'}</div>
            <div>批次 {form.batchNo || '待填写'}</div>
            <div>库位 {selectedLocation?.name || '待选择'}</div>
            <div>有效期 {form.expiryDate || '待填写'}</div>
            <div>{quantityPreviewText}</div>
            <div>供应商 {selectedSupplier?.name || '待选择'}</div>
            <div>入库金额 ¥{Number((form.quantity || 0) * (form.price || 0)).toFixed(2)}</div>
          </div>
        </div>

        {isPurchaseOverRemaining && (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            本次入库数量超过待入库数量 {selectedOrder.remainingQty}，请按实收数量修改；如果不是采购收货，请改为直接入库。
          </div>
        )}

        <label className="space-y-1.5">
          <span className="block text-sm font-medium text-gray-700">备注</span>
          <textarea
            value={form.remark}
            onChange={event => updateForm('remark', event.target.value)}
            rows={3}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
            placeholder="请输入备注"
          />
        </label>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-gray-300 bg-white px-4 text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!canSubmit}
            className="h-10 rounded-md bg-blue-500 px-4 text-sm text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? '提交中...' : modalType === 'edit' ? '保存修改' : '确认入库'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
