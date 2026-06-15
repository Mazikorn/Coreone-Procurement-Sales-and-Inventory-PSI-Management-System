import { X } from 'lucide-react'
import type { Material } from '@/types'

interface Props {
  open: boolean
  row: Material | null
  getCategoryName: (id?: string) => string
  getSupplierName: (id?: string) => string
  statusBadge: (status: string) => React.ReactNode
  onClose: () => void
  onEdit: (row: Material) => void
}

export function MaterialDetailModal({ open, row, getCategoryName, getSupplierName, statusBadge, onClose, onEdit }: Props) {
  if (!open || !row) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h3 className="text-base font-semibold text-gray-900">物料详情</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-6 overflow-y-auto">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">基本信息</h4>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
              <Info label="物料编码" value={row.code} mono />
              <Info label="物料名称" value={row.name} />
              <Info label="物料分类" value={getCategoryName(row.categoryId)} />
              <Info label="规格型号" value={row.spec || '-'} />
              <Info label="计量单位" value={row.unit} />
              <div>
                <div className="text-xs text-gray-500 mb-1">参考单价</div>
                <div className="text-sm font-medium text-blue-600">¥{row.price?.toFixed(2)}</div>
              </div>
              <Info label="供应商" value={getSupplierName(row.supplierId)} />
              <div>
                <div className="text-xs text-gray-500 mb-1">状态</div>
                <div>{statusBadge(row.status)}</div>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">库存配置</h4>
            <div className="grid grid-cols-2 gap-4 bg-gray-50 rounded-lg p-4">
              <Info label="当前库存" value={`${row.stock} ${row.unit}`} />
              <Info label="安全库存" value={`${row.minStock} ${row.unit}`} />
              <Info label="最大库存" value={`${row.maxStock} ${row.unit}`} />
              <Info label="保险库存" value={`${row.safetyStock} ${row.unit}`} />
            </div>
          </div>
          {row.remark && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-3">备注</h4>
              <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700">{row.remark}</div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md border border-gray-300 transition-colors">关闭</button>
          <button onClick={() => { onClose(); onEdit(row) }} className="px-4 py-2 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors">编辑</button>
        </div>
      </div>
    </div>
  )
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-sm text-gray-900 ${mono ? 'font-mono' : 'font-medium'}`}>{value}</div>
    </div>
  )
}
