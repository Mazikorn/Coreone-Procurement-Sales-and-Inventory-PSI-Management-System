interface Props {
  open: boolean
  selectedCount: number
  onClose: () => void
  onConfirm: () => void
}

export function BatchOutboundModal({ open, selectedCount, onClose, onConfirm }: Props) {
  if (!open) return null

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
          <p className="text-sm text-gray-600">确认对选中的 <strong>{selectedCount}</strong> 项物料进行批量出库操作？</p>
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
            className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm font-medium hover:bg-blue-600 transition-all duration-150 ease shadow-sm"
          >
            确认出库
          </button>
        </div>
      </div>
    </div>
  )
}
