import { useEffect } from 'react'
import { Modal } from '@/components/ui/Modal'
import type { InboundRecord, InboundType, Material, Supplier, Location } from '@/types'

export interface FormData {
  type: InboundType
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
  purchaseOrderId: string
}

interface InboundFormModalProps {
  open: boolean
  modalType: 'create' | 'edit'
  form: FormData
  setForm: React.Dispatch<React.SetStateAction<FormData>>
  materials: Material[]
  locations: Location[]
  suppliers: Supplier[]
  purchaseOrders: Record<string, unknown>[]
  selectedOrderId: string
  setSelectedOrderId: (id: string) => void
  selectedRecord: InboundRecord | null
  submitting: boolean
  onClose: () => void
  onSubmit: () => void
}

const TYPE_OPTIONS = [
  { value: 'purchase', label: '采购入库' },
  { value: 'direct', label: '直接入库' },
  { value: 'return', label: '退库入库' },
  { value: 'transfer', label: '调拨入库' },
  { value: 'surplus', label: '盘盈入库' },
  { value: 'other', label: '其他入库' },
]

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
  selectedRecord: _selectedRecord,
  submitting,
  onClose,
  onSubmit,
}: InboundFormModalProps) {
  useEffect(() => {
    if (!open) return
    // 阻止背景滚动
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [open])

  if (!open) return null

  const update = (field: keyof FormData, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const isTransfer = form.type === 'transfer'

  return (
    <Modal onClose={onClose} title={modalType === 'edit' ? '编辑入库' : '新增入库'} size="lg">
      <div className="space-y-4">
        {/* 入库类型 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">入库类型</label>
          <select
            value={form.type}
            onChange={e => update('type', e.target.value)}
            disabled={modalType === 'edit'}
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          >
            {TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* 耗材选择 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">耗材 <span className="text-red-500">*</span></label>
          <select
            value={form.materialId}
            onChange={e => update('materialId', e.target.value)}
            disabled={modalType === 'edit'}
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
          >
            <option value="">请选择耗材</option>
            {materials.map(m => (
              <option key={m.id} value={m.id}>{m.name} ({m.code})</option>
            ))}
          </select>
        </div>

        {/* 采购订单（仅采购入库） */}
        {form.type === 'purchase' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">关联采购订单</label>
            <select
              value={selectedOrderId}
              onChange={e => setSelectedOrderId(e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            >
              <option value="">不关联</option>
              {purchaseOrders.map(o => (
                <option key={o.id as string} value={o.id as string}>
                  {(o.orderNo as string) || (o.id as string)}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {/* 批号 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">批号</label>
            <input
              type="text"
              value={form.batchNo}
              onChange={e => update('batchNo', e.target.value)}
              placeholder="请输入批号"
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>

          {/* 数量 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">数量 <span className="text-red-500">*</span></label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.quantity || ''}
              onChange={e => update('quantity', Number(e.target.value))}
              placeholder="请输入数量"
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* 单价 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">单价</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.price || ''}
              onChange={e => update('price', Number(e.target.value))}
              placeholder="请输入单价"
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>

          {/* 供应商 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">供应商</label>
            <select
              value={form.supplierId}
              onChange={e => update('supplierId', e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            >
              <option value="">请选择供应商</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 来源库位（调拨入库） */}
        {isTransfer && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">来源库位 <span className="text-red-500">*</span></label>
            <select
              value={form.fromLocationId}
              onChange={e => update('fromLocationId', e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            >
              <option value="">请选择来源库位</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* 目标库位 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{isTransfer ? '目标库位' : '库位'}</label>
          <select
            value={form.locationId}
            onChange={e => update('locationId', e.target.value)}
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
          >
            <option value="">请选择库位</option>
            {locations.map(l => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* 生产日期 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">生产日期</label>
            <input
              type="date"
              value={form.productionDate}
              onChange={e => update('productionDate', e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>

          {/* 有效期 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">有效期至</label>
            <input
              type="date"
              value={form.expiryDate}
              onChange={e => update('expiryDate', e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
        </div>

        {/* 备注 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
          <textarea
            value={form.remark}
            onChange={e => update('remark', e.target.value)}
            placeholder="请输入备注"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 resize-none"
          />
        </div>

        {/* 金额预览 */}
        {form.quantity > 0 && form.price > 0 && (
          <div className="bg-gray-50 rounded-lg p-3 text-sm">
            <span className="text-gray-500">预计金额：</span>
            <span className="font-semibold text-gray-900">
              ¥{(form.quantity * form.price).toFixed(2)}
            </span>
          </div>
        )}
      </div>

      {/* 底部按钮 */}
      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
        <button
          onClick={onClose}
          className="h-10 px-4 text-sm text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting || !form.materialId || form.quantity <= 0}
          className="h-10 px-4 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {submitting ? '提交中...' : modalType === 'edit' ? '保存修改' : '确认入库'}
        </button>
      </div>
    </Modal>
  )
}
