import React from 'react'
import { AlertTriangle, Power } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { Location, LocationStatusCheck } from '@/types'

interface Props {
  open: boolean
  target: Location | null
  targetStatus: 'active' | 'inactive'
  statusCheck: LocationStatusCheck | null
  checkingStatus: boolean
  updatingStatus: boolean
  onClose: () => void
  onConfirm: () => void
}

export function LocationStatusModal({
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
    { label: '启用子库位', value: impacts.activeChildLocationCount },
    { label: '默认物料', value: impacts.activeMaterialCount },
    { label: '库存总账', value: impacts.inventoryCount },
    { label: '库位库存', value: impacts.inventoryLocationCount },
  ] : []

  return (
    <Modal
      onClose={onClose}
      title={statusCheck?.canChange === false ? '无法停用库位' : isDisabling ? '停用库位' : '启用库位'}
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
            ? '该库位仍被业务数据使用'
            : isDisabling
              ? '确定要停用该库位吗？'
              : '确定要启用该库位吗？'}
        </h3>
        <p className="mt-1 text-sm text-gray-500">
          {isDisabling ? '停用前会检查子库位、默认物料、库存总账和库位库存' : '启用前会检查父级库位是否可用'}
        </p>

        <div className="mt-4 w-full rounded-lg bg-gray-50 p-3 text-left">
          <div className="text-xs text-gray-500">待变更库位</div>
          <div className="mt-1 font-semibold text-gray-900">
            {statusCheck?.location.code || target.code} {statusCheck?.location.name || target.name}
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
                  {statusCheck.reasons.join('；')}，请先解除引用后再停用。
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
