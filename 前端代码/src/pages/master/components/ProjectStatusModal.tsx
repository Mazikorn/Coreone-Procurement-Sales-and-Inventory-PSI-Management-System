import React from 'react'
import { AlertTriangle, Power } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { Project, ProjectStatusCheck } from '@/types'

interface Props {
  open: boolean
  target: Project | null
  targetStatus: 'active' | 'inactive'
  statusCheck: ProjectStatusCheck | null
  checkingStatus: boolean
  updatingStatus: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ProjectStatusModal({
  open,
  target,
  targetStatus,
  statusCheck,
  checkingStatus,
  updatingStatus,
  onClose,
  onConfirm,
}: Props) {
  if (!open || !target) return null

  const isDisabling = targetStatus === 'inactive'
  const disabled = checkingStatus || updatingStatus || !statusCheck || statusCheck.canChange === false
  const impacts = statusCheck?.impacts
  const impactItems = impacts ? [
    { label: '关联BOM', value: impacts.bomCount },
    { label: '出库记录', value: impacts.outboundCount },
    { label: 'LIS记录', value: impacts.lisCaseCount },
    { label: '不可用BOM', value: impacts.invalidBomCount },
  ] : []

  return (
    <Modal
      onClose={onClose}
      title={statusCheck?.canChange === false ? '无法启用检测服务' : isDisabling ? '停用检测服务' : '启用检测服务'}
      size="md"
    >
      <div className="flex flex-col items-center text-center">
        <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-full ${statusCheck?.canChange === false ? 'bg-amber-50' : 'bg-blue-50'}`}>
          {statusCheck?.canChange === false ? (
            <AlertTriangle className="h-6 w-6 text-amber-500" />
          ) : (
            <Power className="h-6 w-6 text-blue-500" />
          )}
        </div>
        <h3 className="text-base font-semibold text-gray-900">
          {statusCheck?.canChange === false
            ? '该检测服务的BOM配置不可用'
            : isDisabling
              ? '确定要停用该检测服务吗？'
              : '确定要启用该检测服务吗？'}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {isDisabling ? '停用前会展示BOM、出库和LIS记录影响' : '启用前会检查关联BOM是否仍可用于该服务'}
        </p>

        <div className="mt-4 w-full rounded-lg bg-gray-50 p-3 text-left">
          <div className="text-xs text-gray-500">待变更服务</div>
          <div className="mt-1 font-semibold text-gray-900">
            {statusCheck?.project.code || target.code} {statusCheck?.project.name || target.name}
          </div>
        </div>

        <div className="mt-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-left">
          {checkingStatus ? (
            <div className="text-sm text-gray-500">正在检查状态变更影响...</div>
          ) : statusCheck ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                {impactItems.map(item => (
                  <div key={item.label} className="rounded-md bg-gray-50 px-3 py-2">
                    <div className="text-xs text-gray-500">{item.label}</div>
                    <div className={`mt-1 text-base font-semibold ${item.value > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
              {statusCheck.reasons.length > 0 ? (
                <div className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  {statusCheck.reasons.join('；')}，请先修正BOM配置后再启用。
                </div>
              ) : statusCheck.warnings.length > 0 ? (
                <div className="mt-3 rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">
                  {statusCheck.warnings.join('；')}。
                </div>
              ) : (
                <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
                  未发现阻断影响，可以{isDisabling ? '停用' : '启用'}。
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-red-600">状态变更影响检查失败，请关闭后重试。</div>
          )}
        </div>
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
          disabled={disabled}
          className="h-10 rounded-md bg-blue-500 px-4 text-sm text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {checkingStatus ? '检查中...' : updatingStatus ? '处理中...' : isDisabling ? '确认停用' : '确认启用'}
        </button>
      </div>
    </Modal>
  )
}
