import React from 'react'
import { X, CheckCircle, ArrowLeft, ArrowRight, Loader2, BarChart3 } from 'lucide-react'
import { toast } from 'sonner'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { Material } from '@/types'
import type { CreatedStocktakingRecord, FormData, StocktakingScopeRow, StocktakingScopeType } from '../hooks/useStocktakingPage'

interface Props {
  open: boolean
  form: FormData
  createStep: number
  materials: Material[]
  inventoryRows: StocktakingScopeRow[]
  createdRecord?: CreatedStocktakingRecord | null
  isSubmitting: boolean
  onClose: () => void
  onChange: (form: FormData) => void
  onSetCreateStep: (s: number) => void
  onSubmit: () => void
  onOpenAuditEvidence?: (stocktakingNo: string) => void
}

export function StocktakingCreateModal({
  open, form, createStep, materials, inventoryRows, createdRecord, isSubmitting,
  onClose, onChange, onSetCreateStep, onSubmit, onOpenAuditEvidence,
}: Props) {
  if (!open) return null
  const selectedMaterial = materials.find(m => m.id === form.materialId)
  const selectedRows = selectedMaterial ? [selectedMaterial] : []
  const scopeType = form.scopeType || 'material'
  const locationOptions = Array.from(inventoryRows.reduce((map, row) => {
    if (!row.locationId) return map
    const existing = map.get(row.locationId)
    map.set(row.locationId, {
      locationId: row.locationId,
      locationName: row.locationName || row.locationId,
      stock: (existing?.stock || 0) + Number(row.stock || 0),
    })
    return map
  }, new Map<string, { locationId: string; locationName: string; stock: number }>()).values())
  const batchRows = inventoryRows.filter(row =>
    row.batchId && (!form.locationId || row.locationId === form.locationId)
  )
  const selectedLocation = locationOptions.find(item => item.locationId === form.locationId)
  const selectedBatchRow = batchRows.find(row => row.batchId === form.batchId)
  const scopeLabel = scopeType === 'batch' ? '批次库位盘点' : scopeType === 'location' ? '库位盘点' : '整物料盘点'
  const hasActualStock = form.actualStock !== ''
  const difference = hasActualStock ? Number(form.actualStock) - form.systemStock : 0
  const unit = selectedMaterial?.unit || ''
  const differenceText = hasActualStock ? `${difference > 0 ? '+' : ''}${difference}${unit}` : '-'
  const downstreamAdjustment = '库存、库位/批次、预警、库存流水和审计记录'
  const setScopeType = (nextScopeType: StocktakingScopeType) => {
    const nextStock = nextScopeType === 'material' ? Number(selectedMaterial?.stock || 0) : 0
    onChange({ ...form, scopeType: nextScopeType, locationId: '', batchId: '', systemStock: nextStock })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">新建盘点</h3>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        {/* Step indicator */}
        <div className="px-6 py-4 border-b border-gray-200 shrink-0">
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3].map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                  s === createStep ? 'bg-blue-500 text-white' : s < createStep ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'
                }`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${
                    s === createStep ? 'bg-white text-blue-600' : s < createStep ? 'bg-blue-500 text-white' : 'bg-gray-300 text-white'
                  }`}>{s < createStep ? <CheckCircle className="w-3 h-3" /> : s}</span>
                  {s === 1 ? '基本信息' : s === 2 ? '确认清单' : '创建完成'}
                </div>
                {i < 2 && <div className={`w-8 h-0.5 ${s < createStep ? 'bg-blue-500' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
        </div>
        <div className="p-6 overflow-y-auto">
          {createStep === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">物料 <span className="text-red-500">*</span></label>
                  <SearchableSelect
                    value={form.materialId}
                    onChange={val => {
                      const mat = materials.find(m => m.id === val)
                      onChange({ ...form, materialId: val, scopeType: 'material', locationId: '', batchId: '', systemStock: mat?.stock || 0 })
                    }}
                    options={materials.map(m => ({ value: m.id, label: `${m.name} (${m.code})` }))}
                    placeholder="请选择物料"
                    testId="material-select"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">实盘数量 <span className="text-red-500">*</span></label>
                  <input
                    type="number"
                    min={0}
                    value={form.actualStock}
                    onChange={e => onChange({ ...form, actualStock: e.target.value === '' ? '' : Number(e.target.value) })}
                    placeholder="请输入实盘数量"
                    data-testid="actual-stock-input"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">盘点粒度</label>
                <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="盘点粒度">
                  {[
                    { value: 'material' as const, label: '整物料', help: '按物料总库存盘点', testId: 'material-scope-btn' },
                    { value: 'location' as const, label: '按库位', help: '盘某个库位的余量', testId: 'location-scope-btn' },
                    { value: 'batch' as const, label: '按批次库位', help: '盘某库位某批次', testId: 'batch-scope-btn' },
                  ].map(item => (
                    <button
                      key={item.value}
                      type="button"
                      data-testid={item.testId}
                      onClick={() => setScopeType(item.value)}
                      className={`text-left px-3 py-2 border rounded-md transition-colors ${
                        scopeType === item.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 hover:border-gray-300 text-gray-700'
                      }`}
                    >
                      <div className="text-sm font-medium">{item.label}</div>
                      <div className="text-xs mt-0.5 text-gray-500">{item.help}</div>
                    </button>
                  ))}
                </div>
              </div>
              {scopeType !== 'material' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">盘点库位 <span className="text-red-500">*</span></label>
                    <SearchableSelect
                      value={form.locationId}
                      onChange={val => {
                        const location = locationOptions.find(item => item.locationId === val)
                        onChange({ ...form, locationId: val, batchId: '', systemStock: scopeType === 'location' ? Number(location?.stock || 0) : 0 })
                      }}
                      options={locationOptions.map(item => ({
                        value: item.locationId,
                        label: `${item.locationName} · ${item.stock}${selectedMaterial?.unit || ''}`,
                      }))}
                      placeholder="请选择盘点库位"
                      testId="location-select"
                    />
                  </div>
                  <div>
                    {scopeType === 'batch' ? (
                      <>
                        <label className="block text-sm font-medium text-gray-700 mb-1">盘点批次 <span className="text-red-500">*</span></label>
                        <SearchableSelect
                          value={form.batchId}
                          onChange={val => {
                            const row = batchRows.find(item => item.batchId === val)
                            onChange({
                              ...form,
                              locationId: row?.locationId || form.locationId,
                              batchId: val,
                              systemStock: Number(row?.stock || 0),
                            })
                          }}
                          options={batchRows.map(row => ({
                            value: row.batchId || '',
                            label: `${row.batchNo || row.batchId} · ${row.locationName || row.locationId || '-'} · ${row.stock}${row.unit || selectedMaterial?.unit || ''}`,
                          }))}
                          placeholder={form.locationId ? '请选择盘点批次' : '先选库位或直接选批次'}
                          testId="batch-select"
                        />
                      </>
                    ) : (
                      <>
                        <label className="block text-sm font-medium text-gray-700 mb-1">账面库位数量</label>
                        <div className="h-10 px-3 py-2 border border-gray-200 rounded-md bg-gray-50 text-sm text-gray-700">
                          {selectedLocation ? `${selectedLocation.stock}${selectedMaterial?.unit || ''}` : '-'}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea value={form.remark} onChange={e => onChange({ ...form, remark: e.target.value })} rows={3} placeholder="请输入备注" data-testid="remark-input" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500" />
              </div>
            </div>
          )}
          {createStep === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-start gap-3">
                <BarChart3 className="w-5 h-5 text-blue-500 mt-0.5" />
                <div>
                  <div className="text-sm font-medium text-blue-900">盘点范围预览</div>
                  <div className="text-xs text-blue-700 mt-0.5">{scopeLabel}，共 {selectedRows.length} 种</div>
                </div>
              </div>
              <div className="overflow-x-auto max-h-80 border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">物料编码</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">物料名称</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">分类</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">库位</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">批次</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">账面数量</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedRows.map(m => (
                      <tr key={m.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-600 text-xs">{m.code}</td>
                        <td className="px-3 py-2">{m.name}</td>
                        <td className="px-3 py-2 text-gray-500">{m.categoryPath || '-'}</td>
                        <td className="px-3 py-2 text-gray-500">{selectedBatchRow?.locationName || selectedLocation?.locationName || m.locationName || '-'}</td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{selectedBatchRow?.batchNo || '-'}</td>
                        <td className="px-3 py-2">{form.systemStock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between px-2">
                <span className="text-sm text-gray-500">已选择 <strong>{selectedRows.length}</strong> 种物料</span>
                <span className={`text-sm font-medium ${difference === 0 ? 'text-gray-500' : difference > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  差异: {differenceText}
                </span>
              </div>
              <div className="border border-amber-200 bg-amber-50 rounded-lg p-4">
                <div className="mb-2 text-sm font-semibold text-amber-900">盘点结果确认</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                  {[
                    { label: '当前动作', value: '创建后只记录盘点差异，不会立即调整库存。' },
                    { label: '差异结果', value: differenceText },
                    { label: '下一步', value: difference === 0 ? '无差异时可直接按单号回看审计记录。' : `处理差异后才调整${downstreamAdjustment}` },
                  ].map(item => (
                    <div key={item.label} className="min-w-0">
                      <div className="text-xs text-amber-700 mb-1">{item.label}</div>
                      <div className="text-sm font-medium text-amber-950">{item.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          {createStep === 3 && (
            <div className="text-center py-10">
              <CheckCircle className="w-14 h-14 mx-auto mb-4 text-green-500" />
              <h3 className="text-lg font-semibold text-gray-900 mb-2">盘点任务创建成功</h3>
              <div className="bg-gray-50 rounded-lg p-4 text-left space-y-2 max-w-sm mx-auto mb-6">
                <div className="flex justify-between text-sm"><span className="text-gray-500">盘点编号</span><span className="font-mono text-gray-900">{createdRecord?.stocktakingNo || '-'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">盘点物料</span><span>{selectedMaterial?.name || '-'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">盘点范围</span><span>{scopeLabel}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">库位</span><span>{selectedBatchRow?.locationName || selectedLocation?.locationName || selectedMaterial?.locationName || '-'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">批次</span><span>{selectedBatchRow?.batchNo || '-'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">账面数量</span><span>{form.systemStock}{selectedMaterial?.unit || ''}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">实盘数量</span><span>{hasActualStock ? `${form.actualStock}${selectedMaterial?.unit || ''}` : '-'}</span></div>
                <div className="flex justify-between text-sm"><span className="text-gray-500">差异</span><span>{hasActualStock ? `${difference > 0 ? '+' : ''}${difference}${selectedMaterial?.unit || ''}` : '-'}</span></div>
              </div>
              <div className="flex items-center justify-center gap-3">
                {createdRecord?.stocktakingNo && onOpenAuditEvidence && (
                  <button
                    type="button"
                    onClick={() => onOpenAuditEvidence(createdRecord.stocktakingNo!)}
                    className="px-4 py-2 bg-blue-500 text-white rounded-md text-sm hover:bg-blue-600"
                  >
                    查看审计记录
                  </button>
                )}
                <button onClick={onClose} className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md text-sm hover:bg-gray-50">返回列表</button>
              </div>
            </div>
          )}
        </div>
        {createStep < 3 && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 shrink-0">
            <button onClick={onClose} data-testid="cancel-btn" className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md border border-gray-300">取消</button>
            {createStep > 1 && <button onClick={() => onSetCreateStep(createStep - 1)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md border border-gray-300 flex items-center gap-1"><ArrowLeft className="w-4 h-4" />上一步</button>}
            <button data-testid="next-step-btn" onClick={() => {
              if (createStep === 1) {
                if (!form.materialId || form.actualStock === '') { toast.error('请选择物料并填写实盘数量'); return }
                if (scopeType === 'location' && !form.locationId) { toast.error('请选择盘点库位'); return }
                if (scopeType === 'batch' && !form.batchId) { toast.error('请选择盘点批次'); return }
                onSetCreateStep(2)
              } else if (createStep === 2) {
                onSubmit()
              }
            }} disabled={isSubmitting} className="px-4 py-2 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 disabled:opacity-50 flex items-center gap-1">
              {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : createStep === 2 ? '创建盘点' : <>下一步<ArrowRight className="w-4 h-4" /></>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
