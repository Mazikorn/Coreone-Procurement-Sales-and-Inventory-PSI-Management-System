import { X } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { LaborTimeForm } from '../hooks/useLaborTimePage'
import { PROJECT_TYPE_OPTIONS } from '../hooks/useLaborTimePage'

interface Props {
  open: boolean
  type: 'create' | 'edit'
  form: LaborTimeForm
  onClose: () => void
  onChange: (form: LaborTimeForm) => void
  onSubmit: () => void
}

const sourceOptions = [
  { value: 'system', label: '系统预设' },
  { value: 'supplier', label: '供应商提供' },
  { value: 'industry', label: '行业标准' },
]

export function LaborTimeFormModal({ open, type, form, onClose, onChange, onSubmit }: Props) {
  if (!open) return null

  const updateNumber = (key: keyof LaborTimeForm, value: string) => {
    onChange({ ...form, [key]: Number(value) || 0 })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {type === 'create' ? '新增工时定义' : '编辑工时定义'}
          </h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors" aria-label="关闭弹窗">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">步骤编号 *</label>
              <input
                value={form.stepCode}
                onChange={(e) => onChange({ ...form, stepCode: e.target.value })}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">步骤名称 *</label>
              <input
                value={form.stepName}
                onChange={(e) => onChange({ ...form, stepName: e.target.value })}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">项目类型</label>
              <SearchableSelect
                value={form.projectType}
                onChange={(value) => onChange({ ...form, projectType: value || 'all' })}
                options={PROJECT_TYPE_OPTIONS.filter(item => item.value !== '')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">参考来源</label>
              <SearchableSelect
                value={form.referenceSource}
                onChange={(value) => onChange({ ...form, referenceSource: value as LaborTimeForm['referenceSource'] })}
                options={sourceOptions}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">标准时长</label>
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={form.standardMinutes}
                onChange={(e) => updateNumber('standardMinutes', e.target.value)}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">费率/分钟</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.laborRatePerMinute}
                onChange={(e) => updateNumber('laborRatePerMinute', e.target.value)}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">排序</label>
              <input
                type="number"
                min="0"
                value={form.sortOrder}
                onChange={(e) => updateNumber('sortOrder', e.target.value)}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isEquipmentStep}
              onChange={(e) => onChange({ ...form, isEquipmentStep: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            设备步骤
          </label>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">说明</label>
            <textarea
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 resize-none"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="h-10 px-4 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            className="h-10 px-4 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
