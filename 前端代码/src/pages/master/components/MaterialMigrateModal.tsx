import React, { useEffect, useState } from 'react'
import { X, ArrowRightLeft } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { Category, Material } from '@/types'

interface Props {
  open: boolean
  material: Material | null
  currentCategory: Category | null
  categories: Category[]
  onClose: () => void
  onConfirm: (materialId: string, targetCategoryId: string) => void
}

export function MaterialMigrateModal({
  open,
  material,
  currentCategory,
  categories,
  onClose,
  onConfirm,
}: Props) {
  const [targetCategoryId, setTargetCategoryId] = useState('')

  useEffect(() => {
    if (open) setTargetCategoryId('')
  }, [open, material?.id])

  if (!open || !material) return null

  const availableTargets = categories.filter(c =>
    c.id !== material.categoryId &&
    c.status !== 'inactive' &&
    !(c.children && c.children.length > 0)
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">迁移物料</h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-md transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6">
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <div className="text-xs text-gray-500 mb-1">待迁移物料</div>
            <div className="font-semibold text-sm text-gray-900">{material.name}</div>
            <div className="text-xs text-gray-500 mt-1">编码: {material.code}</div>
            {currentCategory && (
              <div className="text-xs text-gray-500 mt-1">当前分类: {currentCategory.name}</div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              <span className="inline-flex items-center gap-1.5">
                <ArrowRightLeft className="w-4 h-4 text-gray-400" />
                迁移到分类 <span className="text-red-500">*</span>
              </span>
            </label>
            <SearchableSelect
              value={targetCategoryId}
              onChange={val => setTargetCategoryId(val || '')}
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
              迁移后，该物料将归属于目标末级分类。
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={onClose} className="h-10 px-4 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors">取消</button>
          <button
            onClick={() => onConfirm(material.id, targetCategoryId)}
            disabled={!targetCategoryId}
            className="h-10 px-4 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            确认迁移
          </button>
        </div>
      </div>
    </div>
  )
}
