import React, { useState } from 'react'
import { X, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { TYPE_OPTIONS } from '../constants'
import type { BOMForm } from '../hooks/useBOMPage'
import type { Material, Project, Equipment } from '@/types'

interface Props {
  open: boolean
  type: 'create' | 'edit'
  form: BOMForm
  allMaterials: Material[]
  allProjects: Project[]
  allEquipment?: Equipment[]
  onClose: () => void
  onChange: (form: BOMForm) => void
  onSubmit: () => void
}

export function BOMFormModal({
  open,
  type,
  form,
  allMaterials,
  allProjects,
  allEquipment = [],
  onClose,
  onChange,
  onSubmit,
}: Props) {
  // P1-15：所有 Hook 必须在任何 early return 之前调用（Rules of Hooks）。
  const [activeTab, setActiveTab] = useState<'materials' | 'reagents' | 'consumables' | 'qc' | 'equipment'>('materials')
  if (!open) return null

  const serviceOptions = allProjects
    .filter(project => project.type === form.type && (!project.bomId || project.id === form.serviceId))
    .map(project => ({
      value: project.id,
      label: `${project.code} - ${project.name}`,
    }))
  const selectedService = allProjects.find(project => project.id === form.serviceId)
  const materialPriceById = new Map(allMaterials.map(material => [material.id, Number(material.price || 0)]))
  const getMaterialPrice = (materialId: string) => materialPriceById.get(materialId) || 0
  const coreMaterialCost = form.materials.reduce(
    (sum, item) => sum + Number(item.usagePerSample || 0) * getMaterialPrice(item.materialId),
    0,
  )
  const generalReagentCost = form.generalReagents.reduce(
    (sum, item) => sum + Number(item.usagePerSample || 0) * getMaterialPrice(item.materialId),
    0,
  )
  const generalConsumableCost = form.generalConsumables.reduce(
    (sum, item) => sum + Number(item.usagePerSample || 0) * getMaterialPrice(item.materialId),
    0,
  )
  const qualityControlCost = form.qualityControls.reduce((sum, item) => {
    const coversSamples = Number(item.coversSamples || 0)
    if (coversSamples <= 0) return sum
    return sum + (Number(item.usagePerBatch || 0) / coversSamples) * getMaterialPrice(item.materialId)
  }, 0)
  const estimatedSampleMaterialCost =
    coreMaterialCost + generalReagentCost + generalConsumableCost + qualityControlCost
  const extensionItemCount =
    form.generalReagents.length + form.generalConsumables.length + form.qualityControls.length
  const typeLabel = TYPE_OPTIONS.find(item => item.value === form.type)?.label || '待选择'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">
            {type === 'create' ? '新建BOM' : '编辑BOM'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* 基本信息 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                BOM名称 <span className="text-red-500">*</span>
              </label>
              <input
                value={form.name}
                onChange={(e) => onChange({ ...form, name: e.target.value })}
                placeholder="请输入BOM名称"
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                BOM编号 <span className="text-red-500">*</span>
              </label>
              <input
                value={form.code}
                onChange={(e) => {
                  if (type === 'create') onChange({ ...form, code: e.target.value })
                }}
                placeholder="请输入BOM编号"
                readOnly={type === 'edit'}
                className={`w-full h-10 px-3 border border-gray-300 rounded-md text-sm placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors ${
                  type === 'edit' ? 'bg-gray-50 text-gray-400' : 'text-gray-700'
                }`}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                关联检测服务
              </label>
              <SearchableSelect
                value={form.serviceId}
                onChange={(val) => onChange({ ...form, serviceId: val })}
                options={[
                  { value: '', label: '不关联检测服务' },
                  ...serviceOptions,
                ]}
                placeholder="请选择检测服务"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                BOM类型
              </label>
              <SearchableSelect
                value={form.type}
                onChange={(val) => {
                  const currentService = allProjects.find(project => project.id === form.serviceId)
                  onChange({
                    ...form,
                    type: val,
                    serviceId: currentService && currentService.type !== val ? '' : form.serviceId,
                  })
                }}
                options={TYPE_OPTIONS.filter((o) => o.value).map((o) => ({ value: o.value, label: o.label }))}
                placeholder="请选择"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                {type === 'create' ? '初始版本' : '当前版本'}
              </label>
              <input
                value={form.version}
                readOnly
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm bg-gray-50 text-gray-400 transition-colors"
              />
              {type === 'create' && (
                <p className="text-xs text-gray-400 mt-1">
                  新建BOM默认版本号为 v1.0
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                状态
              </label>
              <SearchableSelect
                value={form.status}
                onChange={(val) =>
                  onChange({
                    ...form,
                    status: val as 'active' | 'inactive',
                  })
                }
                options={[
                  { value: 'active', label: '已启用' },
                  { value: 'inactive', label: '已停用' },
                ]}
                placeholder="请选择"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              可支撑样本数
            </label>
            <input
              type="number"
              value={form.supportableSamples}
              readOnly
              className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm bg-gray-50 text-gray-400 focus:outline-none transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              BOM描述
            </label>
            <textarea
              value={form.description}
              onChange={(e) => onChange({ ...form, description: e.target.value })}
              rows={2}
              placeholder="请输入BOM描述"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors resize-none"
            />
          </div>

          {/* Tab 导航 */}
          <div className="border-b border-gray-200">
            <div className="flex gap-1">
              {[
                { key: 'materials' as const, label: '特异性试剂' },
                { key: 'reagents' as const, label: '通用试剂' },
                { key: 'consumables' as const, label: '通用耗材' },
                { key: 'qc' as const, label: '质控品' },
                { key: 'equipment' as const, label: '设备模板' },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setActiveTab(t.key)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === t.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* 特异性试剂 Tab */}
          {activeTab === 'materials' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  物料清单
                </label>
                <span className="text-xs text-gray-400">
                  {form.materials.length} 项物料
                </span>
              </div>
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-10">序号</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">物料</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-28">用量/样本</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16">单位</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-28">分组</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-12">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {form.materials.length > 0 ? (
                      form.materials.map((m, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <SearchableSelect
                              value={m.materialId}
                              onChange={(val) => {
                                const mat = allMaterials.find((am) => am.id === val)
                                const next = [...form.materials]
                                next[idx] = {
                                  ...next[idx],
                                  materialId: val,
                                  name: mat?.name || '',
                                  spec: mat?.spec || '',
                                  unit: mat?.unit || '',
                                }
                                onChange({ ...form, materials: next })
                              }}
                              options={allMaterials.map((am) => ({
                                value: am.id,
                                label: `${am.name} (${am.spec || '无规格'})`,
                              }))}
                              placeholder="选择物料"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0.01}
                              step="0.01"
                              value={m.usagePerSample}
                              onChange={(e) => {
                                const next = [...form.materials]
                                next[idx] = { ...next[idx], usagePerSample: Number(e.target.value) }
                                onChange({ ...form, materials: next })
                              }}
                              className="w-full h-9 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[2px] focus:ring-blue-500/10 focus:border-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-gray-500">{m.unit || '-'}</td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={m.groupName || ''}
                              onChange={(e) => {
                                const next = [...form.materials]
                                next[idx] = { ...next[idx], groupName: e.target.value }
                                onChange({ ...form, materials: next })
                              }}
                              placeholder="如：Ki-67"
                              className="w-full h-9 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[2px] focus:ring-blue-500/10 focus:border-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => {
                                const next = form.materials.filter((_, i) => i !== idx)
                                onChange({ ...form, materials: next })
                              }}
                              className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                          <p className="text-xs">暂无物料，请点击下方按钮添加</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => {
                  onChange({
                    ...form,
                    materials: [
                      ...form.materials,
                      { materialId: '', name: '', spec: '', usagePerSample: 1, unit: '', groupName: '' },
                    ],
                  })
                }}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md border border-blue-200 transition-colors"
              >
                <Plus className="w-4 h-4" />添加物料
              </button>
            </div>
          )}

          {/* 通用试剂 Tab */}
          {activeTab === 'reagents' && (
            <BOMExtTable
              title="通用试剂配额"
              items={form.generalReagents}
              allMaterials={allMaterials}
              onChange={(items) => onChange({ ...form, generalReagents: items })}
              defaultUnit="ml"
              showAllocationType={false}
            />
          )}

          {/* 通用耗材 Tab */}
          {activeTab === 'consumables' && (
            <BOMExtTable
              title="通用耗材配额"
              items={form.generalConsumables}
              allMaterials={allMaterials}
              onChange={(items) => onChange({ ...form, generalConsumables: items })}
              defaultUnit="个"
              showAllocationType={false}
            />
          )}

          {/* 质控品 Tab */}
          {activeTab === 'qc' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">
                  质控品配额
                </label>
                <span className="text-xs text-gray-400">
                  {form.qualityControls.length} 项质控品
                </span>
              </div>
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-10">序号</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">质控品</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-28">用量/批次</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16">单位</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-24">覆盖样本数</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-12">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {form.qualityControls.length > 0 ? (
                      form.qualityControls.map((m, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <SearchableSelect
                              value={m.materialId}
                              onChange={(val) => {
                                const mat = allMaterials.find((am) => am.id === val)
                                const next = [...form.qualityControls]
                                next[idx] = {
                                  ...next[idx],
                                  materialId: val,
                                  name: mat?.name || '',
                                  spec: mat?.spec || '',
                                  unit: mat?.unit || '片',
                                }
                                onChange({ ...form, qualityControls: next })
                              }}
                              options={allMaterials.map((am) => ({
                                value: am.id,
                                label: `${am.name} (${am.spec || '无规格'})`,
                              }))}
                              placeholder="选择质控品"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0.01}
                              step="0.01"
                              value={m.usagePerBatch}
                              onChange={(e) => {
                                const next = [...form.qualityControls]
                                next[idx] = { ...next[idx], usagePerBatch: Number(e.target.value) }
                                onChange({ ...form, qualityControls: next })
                              }}
                              className="w-full h-9 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[2px] focus:ring-blue-500/10 focus:border-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-gray-500">{m.unit || '-'}</td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={1}
                              value={m.coversSamples}
                              onChange={(e) => {
                                const next = [...form.qualityControls]
                                next[idx] = { ...next[idx], coversSamples: Number(e.target.value) }
                                onChange({ ...form, qualityControls: next })
                              }}
                              className="w-full h-9 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[2px] focus:ring-blue-500/10 focus:border-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => {
                                const next = form.qualityControls.filter((_, i) => i !== idx)
                                onChange({ ...form, qualityControls: next })
                              }}
                              className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                          <p className="text-xs">暂无质控品，请点击下方按钮添加</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => {
                  onChange({
                    ...form,
                    qualityControls: [
                      ...form.qualityControls,
                      { materialId: '', name: '', spec: '', usagePerBatch: 1, unit: '片', coversSamples: 50 },
                    ],
                  })
                }}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md border border-blue-200 transition-colors"
              >
                <Plus className="w-4 h-4" />添加质控品
              </button>
            </div>
          )}

          {/* 设备模板 Tab（P1-07：此前 UI 不可配置、只能脚本播种；设备成本是 BR-BM-014/018 标准成本五要素之一） */}
          {activeTab === 'equipment' && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">设备使用模板</label>
                <span className="text-xs text-gray-400">{form.equipmentTemplates.length} 项设备</span>
              </div>
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-10">序号</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">设备</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-32">每样本使用分钟</th>
                      <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-12">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {form.equipmentTemplates.length > 0 ? (
                      form.equipmentTemplates.map((t, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                          <td className="px-3 py-2">
                            <SearchableSelect
                              value={t.equipmentId || ''}
                              onChange={(val) => {
                                const eq = allEquipment.find((e) => e.id === val)
                                const next = [...form.equipmentTemplates]
                                next[idx] = { ...next[idx], equipmentId: val, equipmentName: eq?.name || '' }
                                onChange({ ...form, equipmentTemplates: next })
                              }}
                              options={allEquipment.map((e) => ({ value: e.id, label: `${e.code} - ${e.name}` }))}
                              placeholder="选择设备"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0.01}
                              step="0.01"
                              value={t.usageMinutes}
                              onChange={(e) => {
                                const next = [...form.equipmentTemplates]
                                next[idx] = { ...next[idx], usageMinutes: Number(e.target.value) }
                                onChange({ ...form, equipmentTemplates: next })
                              }}
                              className="w-full h-9 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[2px] focus:ring-blue-500/10 focus:border-blue-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <button
                              onClick={() => {
                                const next = form.equipmentTemplates.filter((_, i) => i !== idx)
                                onChange({ ...form, equipmentTemplates: next })
                              }}
                              className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                          <p className="text-xs">暂无设备模板，请点击下方按钮添加（设备使用分钟用于折旧与 ABC 设备成本）</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => {
                  onChange({
                    ...form,
                    equipmentTemplates: [
                      ...form.equipmentTemplates,
                      { equipmentId: '', equipmentName: '', usageMinutes: 1 } as any,
                    ],
                  })
                }}
                className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md border border-blue-200 transition-colors"
              >
                <Plus className="w-4 h-4" />添加设备
              </button>
            </div>
          )}

          <div className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="text-sm font-semibold text-emerald-900">BOM结果确认</div>
            <div className="mt-1 text-xs text-emerald-800">
              确认后将接住：BOM、检测服务、自动出库、LIS对账、项目成本、审计记录
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-emerald-900 sm:grid-cols-3">
              <div>BOM {form.name || '待填写'}</div>
              <div>关联服务 {selectedService?.name || '未关联'}</div>
              <div>类型 {typeLabel}</div>
              <div>核心物料 {form.materials.length}项</div>
              <div>扩展项 {extensionItemCount}项</div>
              <div>预估单样本材料成本 ¥{estimatedSampleMaterialCost.toFixed(2)}</div>
            </div>
          </div>
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
            {type === 'create' ? '创建BOM' : '保存修改'}
          </button>
        </div>
      </div>
    </div>
  )
}

// 通用扩展配额表格组件
interface ExtTableProps {
  title: string
  items: Array<{ materialId: string; name: string; spec: string; usagePerSample: number; unit: string }>
  allMaterials: Material[]
  onChange: (items: Array<{ materialId: string; name: string; spec: string; usagePerSample: number; unit: string }>) => void
  defaultUnit: string
  showAllocationType?: boolean
}

function BOMExtTable({ title, items, allMaterials, onChange, defaultUnit }: ExtTableProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="block text-sm font-medium text-gray-700">{title}</label>
        <span className="text-xs text-gray-400">{items.length} 项</span>
      </div>
      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-10">序号</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">物料</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-28">用量/样本</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 w-16">单位</th>
              <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 w-12">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.length > 0 ? (
              items.map((m, idx) => (
                <tr key={idx}>
                  <td className="px-3 py-2 text-gray-500">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <SearchableSelect
                      value={m.materialId}
                      onChange={(val) => {
                        const mat = allMaterials.find((am) => am.id === val)
                        const next = [...items]
                        next[idx] = {
                          ...next[idx],
                          materialId: val,
                          name: mat?.name || '',
                          spec: mat?.spec || '',
                          unit: mat?.unit || defaultUnit,
                        }
                        onChange(next)
                      }}
                      options={allMaterials.map((am) => ({
                        value: am.id,
                        label: `${am.name} (${am.spec || '无规格'})`,
                      }))}
                      placeholder="选择物料"
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min={0.01}
                      step="0.01"
                      value={m.usagePerSample}
                      onChange={(e) => {
                        const next = [...items]
                        next[idx] = { ...next[idx], usagePerSample: Number(e.target.value) }
                        onChange(next)
                      }}
                      className="w-full h-9 px-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[2px] focus:ring-blue-500/10 focus:border-blue-500"
                    />
                  </td>
                  <td className="px-3 py-2 text-gray-500">{m.unit || '-'}</td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => {
                        onChange(items.filter((_, i) => i !== idx))
                      }}
                      className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                  <p className="text-xs">暂无数据，请点击下方按钮添加</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <button
        onClick={() => {
          onChange([
            ...items,
            { materialId: '', name: '', spec: '', usagePerSample: 1, unit: defaultUnit },
          ])
        }}
        className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-md border border-blue-200 transition-colors"
      >
        <Plus className="w-4 h-4" />添加
      </button>
    </div>
  )
}
