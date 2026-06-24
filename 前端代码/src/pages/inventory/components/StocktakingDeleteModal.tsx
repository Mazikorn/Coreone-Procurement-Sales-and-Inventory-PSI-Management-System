import { X } from 'lucide-react'
import React from 'react'
import type { StocktakingRecord } from '../hooks/useStocktakingPage'

interface Props {
  open: boolean
  row: StocktakingRecord | null
  onClose: () => void
  onConfirm: () => void
}

export function StocktakingDeleteModal({ open, row, onClose, onConfirm }: Props) {
  if (!open || !row) return null
  const isConfirmed = row.status === 'confirmed'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">确认撤销</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600">
            确定要撤销盘点记录 <span className="font-mono font-medium">{row.stocktakingNo}</span> 吗？
          </p>
          <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-sm font-semibold text-amber-900">撤销影响确认</div>
            <div className="mt-1 space-y-1 text-xs text-amber-800">
              {isConfirmed ? (
                <p>撤销后会回退已确认的库存、库位/批次、预警和库存流水。</p>
              ) : (
                <p>该盘点尚未确认，撤销只关闭差异记录，不会改动库存、批次、预警或成本。</p>
              )}
              <p>审计记录可按单号回看。</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md border border-gray-300 transition-colors">
            取消
          </button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-500 text-white text-sm rounded-md hover:bg-red-600 transition-colors">
            确认撤销
          </button>
        </div>
      </div>
    </div>
  )
}
