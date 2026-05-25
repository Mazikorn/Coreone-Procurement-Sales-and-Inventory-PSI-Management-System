import type { InventoryItem } from '@/types'

interface Props {
  open: boolean
  item: InventoryItem | null
  onClose: () => void
  onOutbound: () => void
}

export function InventoryDetailModal({ open, item, onClose, onOutbound }: Props) {
  if (!open || !item) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">库存详情</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500">物料名称</label>
              <div className="text-sm font-medium text-gray-900 mt-0.5">{item.name}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500">物料编码</label>
              <div className="text-sm font-mono text-gray-900 mt-0.5">{item.code}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500">规格</label>
              <div className="text-sm text-gray-900 mt-0.5">{item.spec || '-'}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500">单位</label>
              <div className="text-sm text-gray-900 mt-0.5">{item.unit}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500">库存数量</label>
              <div className="text-sm font-medium text-gray-900 mt-0.5">{item.stock}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500">安全库存</label>
              <div className="text-sm text-gray-900 mt-0.5">{item.minStock}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500">库位</label>
              <div className="text-sm text-gray-900 mt-0.5">{item.locationName || '-'}</div>
            </div>
            <div>
              <label className="text-xs text-gray-500">供应商</label>
              <div className="text-sm text-gray-900 mt-0.5">{item.supplierName || '-'}</div>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-all duration-150 ease"
          >
            关闭
          </button>
          <button
            onClick={() => { onClose(); onOutbound() }}
            className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-all duration-150 ease shadow-sm"
          >
            出库
          </button>
        </div>
      </div>
    </div>
  )
}
