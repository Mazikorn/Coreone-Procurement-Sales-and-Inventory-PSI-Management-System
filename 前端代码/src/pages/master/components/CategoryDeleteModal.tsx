import { useState } from 'react'
import { X, AlertTriangle, Package } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { Category } from '@/types'

interface Props {
  open: boolean
  target: Category | null
  flatList: Category[]
  onClose: () => void
  onConfirm: (targetCategoryId?: string) => void
}

export function CategoryDeleteModal({ open, target, flatList, onClose, onConfirm }: Props) {
  const [migrateTo, setMigrateTo] = useState('')

  if (!open || !target) return null

  const hasChildren = target.children && target.children.length > 0
  const hasMaterials = (target.count || 0) > 0

  const availableTargets = flatList.filter(c => c.id !== target.id)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">确认删除</h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-md transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <h3 className="text-base font-semibold text-gray-900 mb-2">确定要删除该分类吗？</h3>
          <p className="text-sm text-gray-500 mb-4">
            {hasMaterials
              ? '该分类下有关联物料，删除前请选择目标分类进行迁移。'
              : hasChildren
                ? `删除后，该分类下的 ${target.children!.length} 个子分类将自动上移一级。`
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

          {hasMaterials && (
            <div className="mt-4 text-left">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                <span className="inline-flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-gray-400" />
                  迁移到分类 <span className="text-red-500">*</span>
                </span>
              </label>
              <SearchableSelect
                value={migrateTo}
                onChange={val => setMigrateTo(val || '')}
                options={[
                  { value: '', label: '请选择目标分类' },
                  ...availableTargets.map(c => ({
                    value: c.id,
                    label: `${c.name} (${c.code})`,
                  })),
                ]}
                placeholder="请选择目标分类"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                选择后，该分类下的 {target.count} 个物料将迁移到目标分类。
              </p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="h-10 px-4 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">取消</button>
          <button
            onClick={() => onConfirm(hasMaterials ? migrateTo : undefined)}
            disabled={hasMaterials && !migrateTo}
            className="h-10 px-4 text-sm font-medium text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {hasMaterials ? '迁移并删除' : '确认删除'}
          </button>
        </div>
      </div>
    </div>
  )
}
