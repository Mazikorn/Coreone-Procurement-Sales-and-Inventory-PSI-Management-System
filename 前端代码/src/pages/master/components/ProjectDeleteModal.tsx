import { X, AlertTriangle } from 'lucide-react'
import type { Project, ProjectDeleteCheck } from '@/types'

interface Props {
  open: boolean
  editingRow: Project | null
  deleteCheck: ProjectDeleteCheck | null
  checkingDelete: boolean
  isSubmitting: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ProjectDeleteModal({ open, editingRow, deleteCheck, checkingDelete, isSubmitting, onClose, onConfirm }: Props) {
  if (!open || !editingRow) return null
  const disabled = checkingDelete || isSubmitting || !deleteCheck || deleteCheck.deletable === false
  const impacts = deleteCheck?.impacts
  const impactItems = impacts ? [
    { label: '关联BOM', value: impacts.bomCount },
    { label: '出库记录', value: impacts.outboundCount },
    { label: 'LIS记录', value: impacts.lisCaseCount },
  ] : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">确认删除</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-base font-semibold text-gray-900 mb-2">确定要删除该检测服务吗？</h3>
          <p className="text-sm text-gray-500 mb-4">删除前会检查BOM、LIS检测记录和出库记录引用</p>
          <div className="bg-gray-50 rounded-lg p-3 text-left">
            <div className="text-xs text-gray-500">待删除服务</div>
            <div className="font-semibold text-sm">{editingRow.code} {editingRow.name}</div>
          </div>
          <div className="mt-3 rounded-lg border border-gray-200 bg-white p-3 text-left">
            {checkingDelete ? (
              <div className="text-sm text-gray-500">正在检查删除影响...</div>
            ) : deleteCheck ? (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {impactItems.map(item => (
                    <div key={item.label} className="rounded-md bg-gray-50 px-2 py-2">
                      <div className="text-xs text-gray-500">{item.label}</div>
                      <div className={`mt-1 text-base font-semibold ${item.value > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
                {deleteCheck.reasons.length > 0 ? (
                  <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                    {deleteCheck.reasons.join('；')}，请先解除引用后再删除。
                  </div>
                ) : (
                  <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
                    未发现业务引用，可以删除。
                  </div>
                )}
              </>
            ) : (
              <div className="text-sm text-red-600">删除影响检查失败，请关闭后重试。</div>
            )}
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md border border-gray-300">
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={disabled}
            className="px-4 py-2 bg-red-500 text-white text-sm rounded-md hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {checkingDelete ? '检查中...' : isSubmitting ? '删除中...' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  )
}
