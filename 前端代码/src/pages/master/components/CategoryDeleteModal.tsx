import { X, AlertTriangle } from 'lucide-react'
import type { Category } from '@/types'

interface Props {
  open: boolean
  target: Category | null
  onClose: () => void
  onConfirm: () => void
}

export function CategoryDeleteModal({ open, target, onClose, onConfirm }: Props) {
  if (!open || !target) return null

  const hasChildren = target.children && target.children.length > 0
  const hasMaterials = (target.count || 0) > 0
  const blocked = hasChildren || hasMaterials

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{blocked ? '无法删除' : '确认删除'}</h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-md transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-2">
            {blocked ? '该分类暂不能删除' : '确定要删除该分类吗？'}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {hasChildren
              ? '该分类下还有子分类，请先调整或删除子分类后再删除。'
              : hasMaterials
                ? '该分类下有关联物料，请先在分类详情中迁移物料后再删除。'
                : '此操作不可恢复。'
            }
          </p>
          <div className="bg-gray-50 rounded-lg p-3 text-left">
            <div className="text-xs text-gray-500 mb-1">待删除分类</div>
            <div className="font-semibold text-sm text-gray-900">{target.name}</div>
            {hasChildren && (
              <div className="text-xs text-gray-500 mt-1">子分类: {target.children!.length} 个</div>
            )}
            {target.count ? (
              <div className="text-xs text-gray-500 mt-1">关联物料: {target.count} 个</div>
            ) : null}
          </div>

        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="h-10 px-4 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">
            {blocked ? '知道了' : '取消'}
          </button>
          {!blocked && (
            <button
              onClick={onConfirm}
              className="h-10 px-4 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors"
            >
              确认删除
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
