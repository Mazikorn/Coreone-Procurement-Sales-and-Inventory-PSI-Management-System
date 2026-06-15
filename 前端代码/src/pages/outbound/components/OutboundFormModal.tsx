import { useState, useEffect } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { Material, Project, BOM } from '@/types'
import { bomApi } from '@/api/master'

export interface OutboundItemForm {
  materialId: string
  quantity: number
}

export interface FormData {
  type: 'project' | 'transfer' | 'scrap'
  projectId: string
  items: OutboundItemForm[]
  remark: string
  bomId?: string
  sampleCount?: number
}

interface OutboundFormModalProps {
  open: boolean
  editRecordId: string | null
  form: FormData
  materials: Material[]
  projects: Project[]
  onClose: () => void
  onSubmit: () => void
  onFormChange: (form: FormData) => void
}

interface CostPreview {
  materialCost: number
  activityCost: number
  totalCost: number
  feeAmount: number
  profit: number
}

export default function OutboundFormModal({
  open,
  editRecordId,
  form,
  materials,
  projects,
  onClose,
  onSubmit,
  onFormChange,
}: OutboundFormModalProps) {
  const [boms, setBoms] = useState<BOM[]>([])
  const [selectedBom, setSelectedBom] = useState<BOM | null>(null)
  const [costPreview, setCostPreview] = useState<CostPreview | null>(null)

  // Load BOM list when modal opens
  useEffect(() => {
    if (!open) return
    bomApi.getList({ page: 1, pageSize: 999, status: 'active' }).then((res: any) => {
      setBoms(res?.list || [])
    }).catch(() => {})
  }, [open])

  // Load BOM detail when bomId changes
  useEffect(() => {
    if (!form.bomId) {
      setSelectedBom(null)
      setCostPreview(null)
      return
    }
    bomApi.getDetail(form.bomId).then((bom: BOM) => {
      setSelectedBom(bom)
    }).catch(() => {
      setSelectedBom(null)
    })
  }, [form.bomId])

  // Calculate cost preview when BOM and sample count are available
  useEffect(() => {
    if (!selectedBom || !form.sampleCount || form.sampleCount <= 0) {
      setCostPreview(null)
      return
    }
    const sc = form.sampleCount
    const materialCost = (selectedBom.standardSlideCost || selectedBom.unitCost || 0) * sc
    const feeAmount = (selectedBom.standardFeePerSlide || 0) * sc
    const activityCost = 0 // Activity cost requires backend calculation; shown as 0 until BOM outbound
    const totalCost = materialCost + activityCost
    const profit = feeAmount - totalCost
    setCostPreview({ materialCost, activityCost, totalCost, feeAmount, profit })
  }, [selectedBom, form.sampleCount])

  if (!open) return null

  const setFormField = <K extends keyof FormData>(field: K, value: FormData[K]) => {
    onFormChange({ ...form, [field]: value })
  }

  const addItem = () =>
    onFormChange({
      ...form,
      items: [...form.items, { materialId: materials[0]?.id || '', quantity: 1 }],
    })

  const removeItem = (idx: number) =>
    onFormChange({
      ...form,
      items: form.items.filter((_, i) => i !== idx),
    })

  const updateItem = (idx: number, field: keyof OutboundItemForm, value: string | number) => {
    onFormChange({
      ...form,
      items: form.items.map((item, i) => (i === idx ? { ...item, [field]: value } : item)),
    })
  }

  const formatCurrency = (v: number) => `¥${v.toFixed(2)}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{editRecordId ? '编辑出库' : '出库登记'}</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors duration-150"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">出库类型</label>
              <SearchableSelect
                value={form.type}
                onChange={val => setFormField('type', val as FormData['type'])}
                options={[
                  { value: 'project', label: '项目出库' },
                  { value: 'transfer', label: '调拨出库' },
                  { value: 'scrap', label: '报废出库' },
                ]}
                placeholder="请选择"
                testId="outbound-type-select"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">关联项目</label>
              <SearchableSelect
                value={form.projectId}
                onChange={val => setFormField('projectId', val)}
                options={projects.map(p => ({ value: p.id, label: p.name }))}
                placeholder="请选择"
                testId="project-select"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">关联BOM</label>
              <SearchableSelect
                value={form.bomId || ''}
                onChange={val => setFormField('bomId', val || undefined)}
                options={boms.map(b => ({ value: b.id, label: `${b.name} (${b.code})` }))}
                placeholder="选择BOM（可选）"
                testId="bom-select"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">样本数</label>
              <input
                type="number"
                min={1}
                value={form.sampleCount || ''}
                onChange={e => setFormField('sampleCount', Number(e.target.value) || undefined)}
                placeholder="填写样本数"
                data-testid="sample-count-input"
                className="w-full h-10 px-3 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Cost Preview Panel */}
          {costPreview && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h4 className="text-sm font-medium text-gray-700">成本预览</h4>
              <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">材料成本</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(costPreview.materialCost)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">作业成本</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(costPreview.activityCost)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">总成本</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(costPreview.totalCost)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">收费金额</span>
                  <span className="text-sm font-medium text-gray-900">{formatCurrency(costPreview.feeAmount)}</span>
                </div>
                <div className="flex items-center justify-between col-span-2 pt-1 border-t border-gray-200">
                  <span className="text-sm text-gray-500">预估利润</span>
                  <span className={`text-sm font-medium ${costPreview.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {costPreview.profit >= 0 ? '+' : ''}{formatCurrency(costPreview.profit)}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">出库明细 *</label>
              <button
                onClick={addItem}
                data-testid="add-item-btn"
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-xs rounded-md hover:bg-blue-600 transition-colors duration-150"
              >
                <Plus className="w-3.5 h-3.5" />
                添加物料
              </button>
            </div>
            <div className="space-y-2">
              {form.items.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 p-3 bg-gray-50 rounded-md">
                  <SearchableSelect
                    value={item.materialId}
                    onChange={val => updateItem(idx, 'materialId', val)}
                    options={materials.map(m => ({ value: m.id, label: `${m.name} (${m.code})` }))}
                    placeholder="选择物料"
                    className="flex-1"
                    testId={`material-select-${idx}`}
                  />
                  <input
                    type="number"
                    placeholder="数量"
                    min={1}
                    value={item.quantity || ''}
                    onChange={e => updateItem(idx, 'quantity', Number(e.target.value))}
                    data-testid={`quantity-input-${idx}`}
                    className="w-24 h-9 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {form.items.length > 1 && (
                    <button
                      onClick={() => removeItem(idx)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors duration-150"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
            <textarea
              value={form.remark}
              onChange={e => setFormField('remark', e.target.value)}
              rows={2}
              placeholder="请输入出库备注信息（可选）"
              data-testid="remark-input"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            data-testid="cancel-btn"
            className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors duration-150"
          >
            取消
          </button>
          <button
            onClick={onSubmit}
            data-testid="submit-btn"
            className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors duration-150"
          >
            {editRecordId ? '确认更新' : '确认出库'}
          </button>
        </div>
      </div>
    </div>
  )
}
