import { Modal } from '@/components/ui/Modal'
import type { EquipmentTypeForm } from '../hooks/useEquipmentTypePage'

interface Props {
  open: boolean
  type: 'create' | 'edit'
  form: EquipmentTypeForm
  submitting?: boolean
  onClose: () => void
  onChange: (form: EquipmentTypeForm) => void
  onSubmit: () => void
}

const DEPRECIATION_METHODS = [
  { value: 'straight_line', label: '直线法' },
  { value: 'units_of_production', label: '工作量法' },
]

const CAPACITY_UNITS = [
  { value: 'minutes', label: '分钟' },
  { value: 'hours', label: '小时' },
  { value: 'cycles', label: '次' },
]

export default function EquipmentTypeFormModal({ open, type, form, submitting = false, onClose, onChange, onSubmit }: Props) {
  if (!open) return null

  const update = (field: keyof EquipmentTypeForm, value: string | number) => {
    onChange({ ...form, [field]: value })
  }

  return (
    <Modal onClose={onClose} title={type === 'edit' ? '编辑设备类型' : '新增设备类型'} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">类型编码 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.code}
              onChange={e => update('code', e.target.value)}
              placeholder="如：H-EQUIP-001"
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">类型名称 <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="如：切片机"
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">描述</label>
          <textarea
            value={form.description}
            onChange={e => update('description', e.target.value)}
            placeholder="设备类型描述..."
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">默认购置价格</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.defaultPurchasePrice || ''}
              onChange={e => update('defaultPurchasePrice', Number(e.target.value))}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">默认折旧年限</label>
            <input
              type="number"
              min={1}
              value={form.defaultDepreciableLifeYears || ''}
              onChange={e => update('defaultDepreciableLifeYears', Number(e.target.value))}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">残值</label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={form.defaultValue || ''}
              onChange={e => update('defaultValue', Number(e.target.value))}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">折旧方法</label>
            <select
              value={form.defaultDepreciationMethod}
              onChange={e => update('defaultDepreciationMethod', e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            >
              {DEPRECIATION_METHODS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">默认总产能</label>
            <input
              type="number"
              min={0}
              value={form.defaultTotalCapacity || ''}
              onChange={e => update('defaultTotalCapacity', Number(e.target.value))}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">产能单位</label>
            <select
              value={form.defaultCapacityUnit}
              onChange={e => update('defaultCapacityUnit', e.target.value)}
              className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
            >
              {CAPACITY_UNITS.map(u => (
                <option key={u.value} value={u.value}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
        <button
          onClick={onClose}
          className="h-10 px-4 text-sm text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
        <button
          onClick={onSubmit}
          disabled={submitting || !form.code || !form.name}
          className="h-10 px-4 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-50"
        >
          {submitting ? '提交中...' : type === 'edit' ? '保存修改' : '确认创建'}
        </button>
      </div>
    </Modal>
  )
}
