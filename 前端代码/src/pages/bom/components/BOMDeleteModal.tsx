import { X, AlertTriangle } from 'lucide-react'
import type { BOM } from '@/types'

interface Props {
  open: boolean
  editingId: string | null
  data: BOM[]
  onClose: () => void
  onConfirm: () => void
}

export function BOMDeleteModal({ open, editingId, data, onClose, onConfirm }: Props) {
  if (!open) return null

  const target = data.find((d) => d.id === editingId)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">确认删除</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-6">
          <div className="flex flex-col items-center text-center py-4">
            <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h4 className="text-base font-semibold text-gray-900 mb-1">确定要删除该BOM吗？</h4>
            <p className="text-sm text-gray-500 mb-4">删除后将无法恢复，关联的检测服务将解除关联</p>
            <div className="w-full bg-gray-50 p-3 rounded-lg text-left">
              <div className="text-xs text-gray-500 mb-1">待删除BOM</div>
              <div className="font-semibold text-gray-900">
                {target?.code} {target?.name}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors border border-gray-200"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
          >
            确认删除
          </button>
        </div>
      </div>
    </div>
  )
}
