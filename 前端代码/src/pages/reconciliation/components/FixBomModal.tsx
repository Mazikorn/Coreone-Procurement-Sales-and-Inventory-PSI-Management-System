import React from 'react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { MaterialDiff } from '../hooks/useReconciliationPage'

interface Props {
  open: boolean
  fixTarget: MaterialDiff | null
  fixTargetProjectId: string | null
  fixNewUsage: number
  setFixNewUsage: (v: number) => void
  fixNewUnit: string
  setFixNewUnit: (v: string) => void
  fixReason: string
  setFixReason: (v: string) => void
  onClose: () => void
  onConfirm: () => void
}

export function FixBomModal({
  open,
  fixTarget,
  fixTargetProjectId,
  fixNewUsage,
  setFixNewUsage,
  fixNewUnit,
  setFixNewUnit,
  fixReason,
  setFixReason,
  onClose,
  onConfirm,
}: Props) {
  if (!open || !fixTarget) return null

  const formatNumber = (value: number) => Number(value || 0).toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
  })
  const hasValidUsage = Number.isFinite(fixNewUsage) && fixNewUsage > 0
  const validationMessage = !fixTargetProjectId
    ? '未定位项目，系统无法重新审计项目对账和成本差异，请从项目对账明细重新进入。'
    : !hasValidUsage
      ? '修正用量必须大于 0，系统才能重算 BOM 理论消耗。'
      : !fixNewUnit
        ? '请选择修正单位，系统才能保持 BOM、出库和对账口径一致。'
        : !fixReason.trim()
          ? '请填写修正原因，系统才能解释 BOM 标准变更并形成审计记录。'
          : ''
  const canConfirm = validationMessage === ''

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">修正BOM用量</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-gray-50 p-3 rounded-md">
            <div className="text-xs text-gray-500">当前物料</div>
            <div className="font-semibold text-sm">{fixTarget.materialName}</div>
            <div className="text-xs text-gray-400">{fixTarget.spec}</div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">原用量/例</label>
              <input type="text" value={`${fixTarget.bomUsagePerSample} ${fixTarget.bomUnit}`} disabled className="w-full px-3 py-2 text-sm border rounded-md bg-gray-100" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">建议用量/例</label>
              <input type="text" value={`${(fixTarget.bomUsagePerSample * 1.2).toFixed(2)} ${fixTarget.bomUnit}`} disabled className="w-full px-3 py-2 text-sm border rounded-md bg-gray-100 text-amber-700" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">修正为 <span className="text-red-500">*</span></label>
            <div className="flex gap-2">
              <input type="number" min="0.01" step="0.01" value={fixNewUsage} onChange={e => setFixNewUsage(Number(e.target.value))} className="flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:border-blue-500" />
              <SearchableSelect
                value={fixNewUnit}
                onChange={val => setFixNewUnit(val)}
                options={[
                  { value: 'ml', label: 'ml' },
                  { value: 'μl', label: 'μl' },
                  { value: 'L', label: 'L' },
                  { value: 'g', label: 'g' },
                  { value: 'mg', label: 'mg' },
                  { value: '片', label: '片' },
                  { value: '支', label: '支' },
                ]}
                placeholder="单位"
                className="w-24"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">修正原因 <span className="text-red-500">*</span></label>
            <textarea rows={2} placeholder="请说明修正原因" value={fixReason} onChange={e => setFixReason(e.target.value)} className="w-full px-3 py-2 text-sm border rounded-md focus:outline-none focus:border-blue-500" />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800">
            <strong>提示：</strong>修正后，该BOM的历史对账数据将同步更新，差异记录保留在日志中。
          </div>
          {validationMessage ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {validationMessage}
            </div>
          ) : null}
          <div className="rounded-md border border-emerald-100 bg-emerald-50 px-4 py-3">
            <div className="text-sm font-semibold text-emerald-900">BOM修正结果确认</div>
            <div className="mt-1 text-xs text-emerald-800">
              确认后将接住：BOM标准、理论消耗、项目对账、成本差异、异常台账、审计记录
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-emerald-900 sm:grid-cols-2">
              <div>物料 {fixTarget.materialName}</div>
              <div>当前差异率 {formatNumber(fixTarget.diffRate)}%</div>
              <div>原用量 {formatNumber(fixTarget.bomUsagePerSample)} {fixTarget.bomUnit}/例</div>
              <div>修正为 {formatNumber(fixNewUsage)} {fixNewUnit}/例</div>
              <div className="sm:col-span-2">原因 {fixReason || '待填写'}</div>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">取消</button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm text-white rounded-md ${
              canConfirm ? 'bg-blue-600 hover:bg-blue-700' : 'cursor-not-allowed bg-gray-300'
            }`}
          >
            确认修正
          </button>
        </div>
      </div>
    </div>
  )
}
