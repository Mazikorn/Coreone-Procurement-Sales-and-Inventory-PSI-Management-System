import React from 'react'
import { X } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { EquipmentForm } from '../hooks/useEquipmentPage'

interface Props {
  open: boolean
  type: 'create' | 'edit'
  form: EquipmentForm
  typeOptions?: Array<{ value: string; label: string }>
  onClose: () => void
  onChange: (form: EquipmentForm) => void
  onSubmit: () => void
}

export function EquipmentFormModal({ open, type, form, typeOptions = [], onClose, onChange, onSubmit }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">
            {type === 'create' ? '新增设备' : '编辑设备'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                设备编号 <span className="text-red-500">*</span>
              </label>
              <input
                value={form.code}
                onChange={(e) => {
                  if (type === 'create') onChange({ ...form, code: e.target.value })
                }}
                placeholder="请输入设备编号"
                readOnly={type === 'edit'}
                className={`w-full h-10 px-3 border border-gray-300 rounded-md text-sm placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors ${
                  type === 'edit' ? 'bg-gray-50 text-gray-400' : 'text-gray-700'
                }`}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                设备名称 <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                placeholder="请输入设备名称"
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">设备类型</label>
              <SearchableSelect
                value={form.typeId}
                onChange={(val) => onChange({ ...form, typeId: val })}
                options={[{ value: '', label: '未分类' }, ...typeOptions]}
                placeholder="选择设备类型"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">型号</label>
              <input
                value={form.model}
                onChange={(e) => onChange({ ...form, model: e.target.value })}
                placeholder="请输入型号"
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">制造商</label>
              <input
                value={form.manufacturer}
                onChange={(e) => onChange({ ...form, manufacturer: e.target.value })}
                placeholder="请输入制造商"
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">购置价格</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.purchasePrice}
                onChange={(e) => onChange({ ...form, purchasePrice: Number(e.target.value) })}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">购置日期</label>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={(e) => onChange({ ...form, purchaseDate: e.target.value })}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">折旧年限（年）</label>
              <input
                type="number"
                min={1}
                value={form.depreciableLifeYears}
                onChange={(e) => onChange({ ...form, depreciableLifeYears: Number(e.target.value) })}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">残值</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.residualValue}
                onChange={(e) => onChange({ ...form, residualValue: Number(e.target.value) })}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">折旧方式</label>
              <SearchableSelect
                value={form.depreciationMethod}
                onChange={(val) => onChange({ ...form, depreciationMethod: val as 'straight_line' | 'units_of_production' })}
                options={[
                  { value: 'straight_line', label: '直线法' },
                  { value: 'units_of_production', label: '工作量法' },
                ]}
                placeholder="请选择"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">状态</label>
              <SearchableSelect
                value={form.status}
                onChange={(val) => onChange({ ...form, status: val as 'active' | 'inactive' | 'scrapped' })}
                options={[
                  { value: 'active', label: '已启用' },
                  { value: 'inactive', label: '已停用' },
                  { value: 'scrapped', label: '已报废' },
                ]}
                placeholder="请选择"
              />
            </div>
          </div>
          {form.depreciationMethod === 'units_of_production' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">总工作量</label>
                <input
                  type="number"
                  min={1}
                  value={form.totalCapacity}
                  onChange={(e) => onChange({ ...form, totalCapacity: Number(e.target.value) })}
                  placeholder="总工作量（小时/张数）"
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">工作量单位</label>
                <input
                  value={form.capacityUnit}
                  onChange={(e) => onChange({ ...form, capacityUnit: e.target.value })}
                  placeholder="如：小时、张数、批次"
                  className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors border border-gray-200"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors shadow-sm"
          >
            {type === 'create' ? '创建设备' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  )
}
