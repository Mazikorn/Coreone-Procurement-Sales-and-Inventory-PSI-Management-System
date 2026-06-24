import React from 'react'
import { AlertTriangle, CheckCircle2, Power, Trash2 } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { BOMBatchAction, BOMBatchDeleteResult, BOMBatchStatusResult } from '../hooks/useBOMPage'

interface Props {
  open: boolean
  action: BOMBatchAction | null
  targetsCount: number
  deleteResults: BOMBatchDeleteResult[]
  statusResults: BOMBatchStatusResult[]
  checking: boolean
  submitting: boolean
  onClose: () => void
  onConfirm: () => void
}

function nonZeroSummary(items: Array<{ label: string; value: number }>) {
  const summary = items.filter(item => item.value > 0).map(item => `${item.label} ${item.value}`)
  return summary.length > 0 ? summary.join('，') : '无阻断影响'
}

export function BOMBatchImpactModal({
  open,
  action,
  targetsCount,
  deleteResults,
  statusResults,
  checking,
  submitting,
  onClose,
  onConfirm,
}: Props) {
  if (!open || !action) return null

  const isDelete = action === 'delete'
  const isDisabling = action === 'inactive'
  const deleteBlocked = deleteResults.filter(item => item.error || !item.check || item.check.deletable === false)
  const statusBlocked = statusResults.filter(item => item.error || !item.check || item.check.canChange === false)
  const blockedCount = isDelete ? deleteBlocked.length : statusBlocked.length
  const canConfirm = !checking && !submitting && targetsCount > 0 && blockedCount === 0
  const confirmColor = canConfirm ? (isDelete ? '#ef4444' : '#3b82f6') : '#d1d5db'
  const title = isDelete
    ? blockedCount > 0 ? '无法批量删除BOM' : '批量删除BOM'
    : blockedCount > 0
      ? isDisabling ? '无法批量停用BOM' : '无法批量启用BOM'
      : isDisabling ? '批量停用BOM' : '批量启用BOM'

  return (
    <Modal onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${blockedCount > 0 ? 'bg-amber-50' : 'bg-blue-50'}`}>
            {blockedCount > 0 ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : isDelete ? (
              <Trash2 className="h-5 w-5 text-red-500" />
            ) : (
              <Power className="h-5 w-5 text-blue-500" />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              已选择 {targetsCount} 个BOM，{blockedCount > 0 ? `${blockedCount} 个存在阻断影响` : '未发现阻断影响'}
            </div>
            <div className="mt-1 text-sm text-gray-500">
              {isDelete
                ? '批量删除前会检查检测项目和出库成本明细引用；任一BOM不可删除时整批不执行。'
                : isDisabling
                  ? '批量停用前会检查启用检测项目引用；任一BOM不可停用时整批不执行。'
                  : '批量启用前会检查BOM是否存在且可更新；任一BOM检查失败时整批不执行。'}
            </div>
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto rounded-lg border border-gray-200">
          {checking ? (
            <div className="p-4 text-sm text-gray-500">正在检查批量操作影响...</div>
          ) : isDelete ? (
            <div className="divide-y divide-gray-100">
              {deleteResults.map(item => {
                const impacts = item.check?.impacts
                const summary = impacts ? nonZeroSummary([
                  { label: '检测项目', value: impacts.projectCount },
                  { label: '出库成本明细', value: impacts.outboundDetailCount },
                ]) : item.error || '检查失败'
                const blocked = item.error || !item.check || item.check.deletable === false
                return (
                  <div key={item.bom.id} className="flex items-start justify-between gap-4 p-3">
                    <div>
                      <div className="font-medium text-gray-900">{item.bom.code} {item.bom.name}</div>
                      <div className={`mt-1 text-xs ${blocked ? 'text-amber-700' : 'text-gray-500'}`}>{summary}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${blocked ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                      {blocked ? '阻断' : '可删除'}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {statusResults.map(item => {
                const impacts = item.check?.impacts
                const summary = impacts ? nonZeroSummary([
                  { label: '启用检测项目', value: impacts.activeProjectCount },
                  { label: '核心物料缺失', value: impacts.coreMaterialCount === 0 ? 1 : 0 },
                  { label: '停用物料', value: impacts.inactiveMaterialCount },
                  { label: '未启用设备', value: impacts.inactiveEquipmentCount },
                  { label: '未启用设备类型', value: impacts.inactiveEquipmentTypeCount },
                ]) : item.error || '检查失败'
                const blocked = item.error || !item.check || item.check.canChange === false
                return (
                  <div key={item.bom.id} className="flex items-start justify-between gap-4 p-3">
                    <div>
                      <div className="font-medium text-gray-900">{item.bom.code} {item.bom.name}</div>
                      <div className={`mt-1 text-xs ${blocked ? 'text-amber-700' : 'text-gray-500'}`}>{summary}</div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${blocked ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700'}`}>
                      {blocked ? '阻断' : isDisabling ? '可停用' : '可启用'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {blockedCount > 0 ? (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
            存在阻断项，批量操作不会执行。请先处理对应检测项目引用、成本明细引用或不可用依赖。
          </div>
        ) : (
          <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            {isDelete
              ? '检查通过；删除后这些BOM不会再用于新检测服务绑定、项目出库、LIS对账、ABC成本计算、项目成本归集和审计筛选。'
              : isDisabling
                ? '检查通过；停用后这些BOM不会再用于新检测服务绑定、项目出库、LIS对账、ABC成本计算和项目成本归集，历史成本和审计记录保留。'
                : '检查通过；启用后这些BOM可重新用于新检测服务绑定、项目出库、LIS对账、ABC成本计算和项目成本归集，历史成本和审计记录不变。'}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-md border border-gray-300 bg-white px-4 text-sm text-gray-600 transition-colors hover:bg-gray-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canConfirm}
          style={{
            background: confirmColor,
            backgroundImage: `linear-gradient(${confirmColor}, ${confirmColor})`,
            cursor: canConfirm ? 'pointer' : 'not-allowed',
          }}
          className="inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm text-white transition-colors"
        >
          <CheckCircle2 className="h-4 w-4" />
          {checking ? '检查中...' : submitting ? '处理中...' : isDelete ? '确认删除' : isDisabling ? '确认停用' : '确认启用'}
        </button>
      </div>
    </Modal>
  )
}
