import { Modal } from '@/components/ui/Modal'
import type { LaborTimeForm } from '../hooks/useLaborTimePage'
import { PROJECT_TYPE_OPTIONS } from '../hooks/useLaborTimePage'

interface Props {
  open: boolean
  type: 'create' | 'edit'
  form: LaborTimeForm
  submitting?: boolean
  onClose: () => void
  onChange: (form: LaborTimeForm) => void
  onSubmit: () => void
}

const REFERENCE_SOURCE_OPTIONS = [
  { value: 'system', label: '系统预设' },
  { value: 'supplier', label: '供应商提供' },
  { value: 'industry', label: '行业标准' },
]

export function LaborTimeFormModal({ open, type, form, submitting, onClose, onChange, onSubmit }: Props) {
  if (!open) return null

  const update = (field: keyof LaborTimeForm, value: string | number | boolean) => {
    onChange({ ...form, [field]: value })
  }

  return (
    <Modal onClose={onClose} title={type === 'edit' ? '编辑工时定义' : '新增工时定义'}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">步骤编号 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.stepCode}
              onChange={e => update('stepCode', e.target.value)}
              placeholder="如：L001"
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">步骤名称 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.stepName}
              onChange={e => update('stepName', e.target.value)}
              placeholder="如：切片"
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">项目类型</label>
          <select
            value={form.projectType}
            onChange={e => update('projectType', e.target.value)}
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
          >
            {PROJECT_TYPE_OPTIONS.filter(o => o.value !== '').map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">标准工时（分钟）</label>
            <input
              type="number"
              min={0}
              step={1}
              value={form.standardMinutes || ''}
              onChange={e => update('standardMinutes', Number(e.target.value))}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">费率（元/分钟）</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.laborRatePerMinute || ''}
              onChange={e => update('laborRatePerMinute', Number(e.target.value))}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">参考值来源</label>
          <select
            value={form.referenceSource}
            onChange={e => update('referenceSource', e.target.value)}
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
          >
            {REFERENCE_SOURCE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="isEquipmentStep"
            checked={form.isEquipmentStep}
            onChange={e => update('isEquipmentStep', e.target.checked)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="isEquipmentStep" className="text-sm text-gray-700">设备步骤</label>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
        <button onClick={onClose} className="h-10 px-4 text-sm text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors">取消</button>
        <button onClick={onSubmit} disabled={!form.stepCode || !form.stepName || submitting} className="h-10 px-4 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50">
          {submitting ? '提交中...' : type === 'edit' ? '保存修改' : '确认创建'}
        </button>
      </div>
    </Modal>
  )
}
