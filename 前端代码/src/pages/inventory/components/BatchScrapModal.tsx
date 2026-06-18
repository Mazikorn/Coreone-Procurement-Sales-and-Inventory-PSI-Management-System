import { Trash2 } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'

interface ScrapItem {
  id: string
  name?: string
  materialName?: string
  code?: string
  materialCode?: string
  batch?: string
  batchNo?: string
  stock?: number
  totalQuantity?: number
  quantity?: number
  unit?: string
}

interface Props {
  open: boolean
  items: ScrapItem[]
  scrapReason: string
  scrapRemark: string
  onClose: () => void
  onConfirm: () => void
  onChangeReason: (v: string) => void
  onChangeRemark: (v: string) => void
}

export function BatchScrapModal({ open, items, scrapReason, scrapRemark, onClose, onConfirm, onChangeReason, onChangeRemark }: Props) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20"
      role="dialog"
      aria-modal="true"
      aria-label="批量报废"
      data-testid="batch-scrap-modal"
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[80vh] flex flex-col">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">批量报废</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          <div className="mb-4">
            <div className="text-sm font-medium text-gray-700 mb-2">选中物料 ({items.length})</div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">物料名称</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">编码</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">批号</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">数量</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => {
                    const materialName = item.materialName || item.name || '-'
                    const materialCode = item.materialCode || item.code || '-'
                    const batchNo = item.batchNo || item.batch || '-'
                    const quantity = item.totalQuantity ?? item.quantity ?? item.stock ?? 0
                    return (
                    <tr key={item.id}>
                      <td className="px-3 py-2 text-gray-900">{materialName}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono text-xs">{materialCode}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono text-xs">{batchNo}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{quantity} {item.unit}</td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              报废原因 <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              testId="batch-scrap-reason"
              value={scrapReason}
              onChange={val => onChangeReason(val)}
              options={[
                { value: 'expired', label: '过期' },
                { value: 'damaged', label: '损坏' },
                { value: 'spoiled', label: '变质' },
                { value: 'other', label: '其他' },
              ]}
              placeholder="请选择"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">备注（可选）</label>
            <textarea
              value={scrapRemark}
              onChange={e => onChangeRemark(e.target.value)}
              rows={2}
              placeholder="请输入备注信息"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 resize-none"
            />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-all duration-150 ease"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            data-testid="batch-scrap-confirm-btn"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-500 text-white rounded-md text-sm font-medium hover:bg-red-600 transition-all duration-150 ease shadow-sm"
          >
            <Trash2 className="w-4 h-4" />
            确认报废
          </button>
        </div>
      </div>
    </div>
  )
}
