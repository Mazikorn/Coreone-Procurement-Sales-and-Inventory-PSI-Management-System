import React from 'react'

interface Props {
  open: boolean
  selectedCount: number
  onClose: () => void
  onConfirm: () => void
}

export function BatchOutboundModal({ open, selectedCount, onClose, onConfirm }: Props) {
  if (!open) return null

  const canContinue = selectedCount > 0

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">批量出库</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-2xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-6">
          <div className="space-y-3 text-sm text-gray-700">
            <div className="font-medium text-gray-900">已选择 {selectedCount} 个批次</div>
            {canContinue ? (
              <>
                <div>下一步：进入出库登记，补齐检测项目、领用人和用途后再确认出库。</div>
                <div className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-800">
                  确认后将接住：库存、批次、项目成本、项目消耗对账、审计记录
                </div>
              </>
            ) : (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                请先在库存列表勾选需要出库的批次。
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-all duration-150 ease"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={!canContinue}
            data-testid="batch-outbound-confirm-btn"
            className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 ease shadow-sm"
          >
            进入出库登记
          </button>
        </div>
      </div>
    </div>
  )
}
