import React from 'react'
import { AlertTriangle, CheckCircle2, Power } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { ProjectBatchStatusAction, ProjectBatchStatusResult } from '../hooks/useProjectsPage'

interface Props {
  open: boolean
  action: ProjectBatchStatusAction | null
  targetsCount: number
  results: ProjectBatchStatusResult[]
  checking: boolean
  submitting: boolean
  onClose: () => void
  onConfirm: () => void
}

function impactSummary(result: ProjectBatchStatusResult) {
  if (result.error || !result.check) return result.error || '检查失败'
  const impacts = result.check.impacts
  const items = [
    { label: '关联BOM', value: impacts.bomCount },
    { label: '出库记录', value: impacts.outboundCount },
    { label: 'LIS记录', value: impacts.lisCaseCount },
    { label: '不可用BOM', value: impacts.invalidBomCount },
  ].filter(item => item.value > 0)
  if (result.check.reasons.length > 0) return result.check.reasons.join('；')
  if (result.check.warnings.length > 0) return result.check.warnings.join('；')
  return items.length > 0 ? items.map(item => `${item.label} ${item.value}`).join('，') : '无阻断影响'
}

export function ProjectBatchStatusModal({
  open,
  action,
  targetsCount,
  results,
  checking,
  submitting,
  onClose,
  onConfirm,
}: Props) {
  if (!open || !action) return null

  const isDisabling = action === 'inactive'
  const blocked = results.filter(item => item.error || !item.check || item.check.canChange === false)
  const warningCount = results.filter(item => item.check?.warnings?.length).length
  const canConfirm = !checking && !submitting && targetsCount > 0 && blocked.length === 0
  const confirmColor = canConfirm ? '#3b82f6' : '#d1d5db'
  const title = blocked.length > 0
    ? isDisabling ? '无法批量停用检测服务' : '无法批量启用检测服务'
    : isDisabling ? '批量停用检测服务' : '批量启用检测服务'

  return (
    <Modal onClose={onClose} title={title} size="lg">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${blocked.length > 0 ? 'bg-amber-50' : 'bg-blue-50'}`}>
            {blocked.length > 0 ? (
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            ) : (
              <Power className="h-5 w-5 text-blue-500" />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">
              已选择 {targetsCount} 个检测服务，{blocked.length > 0 ? `${blocked.length} 个存在阻断影响` : '未发现阻断影响'}
            </div>
            <div className="mt-1 text-sm text-gray-500">
              {isDisabling
                ? '批量停用前会展示 BOM、出库和 LIS 历史影响；这些记录会保留，但服务停用后不可用于新出库。'
                : '批量启用前会检查关联 BOM 是否仍可用于该服务；任一服务不可启用时整批不执行。'}
            </div>
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto rounded-lg border border-gray-200">
          {checking ? (
            <div className="p-4 text-sm text-gray-500">正在检查批量状态影响...</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {results.map(item => {
                const isBlocked = item.error || !item.check || item.check.canChange === false
                const hasWarning = !isBlocked && Boolean(item.check?.warnings?.length)
                return (
                  <div key={item.project.id} className="flex items-start justify-between gap-4 p-3">
                    <div>
                      <div className="font-medium text-gray-900">{item.project.code} {item.project.name}</div>
                      <div className={`mt-1 text-xs ${isBlocked ? 'text-amber-700' : hasWarning ? 'text-blue-700' : 'text-gray-500'}`}>
                        {impactSummary(item)}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      isBlocked ? 'bg-amber-50 text-amber-700' : hasWarning ? 'bg-blue-50 text-blue-700' : 'bg-green-50 text-green-700'
                    }`}>
                      {isBlocked ? '阻断' : hasWarning ? '有影响' : isDisabling ? '可停用' : '可启用'}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {blocked.length > 0 ? (
          <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
            存在阻断项，批量状态不会更新。请先修正对应检测服务的 BOM 配置。
          </div>
        ) : warningCount > 0 ? (
          <div className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
            存在历史业务影响，确认后会保留原有 BOM、出库和 LIS 记录，仅更新服务状态。
          </div>
        ) : (
          <div className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            检查通过，确认后将通过后端批量接口一次性执行。
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
          {checking ? '检查中...' : submitting ? '处理中...' : isDisabling ? '确认停用' : '确认启用'}
        </button>
      </div>
    </Modal>
  )
}
