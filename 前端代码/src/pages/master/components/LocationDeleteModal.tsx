import { AlertTriangle } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { Location, LocationDeleteCheck } from '@/types'

interface Props {
  open: boolean
  target: Location | null
  deleteCheck: LocationDeleteCheck | null
  checkingDelete: boolean
  deleting: boolean
  onClose: () => void
  onConfirm: () => void
}

export function LocationDeleteModal({
  open,
  target,
  deleteCheck,
  checkingDelete,
  deleting,
  onClose,
  onConfirm,
}: Props) {
  if (!open || !target) return null

  const disabled = checkingDelete || deleting || !deleteCheck || deleteCheck.deletable === false
  const impacts = deleteCheck?.impacts
  const impactItems = impacts ? [
    { label: '下级库位', value: impacts.childLocationCount },
    { label: '默认物料', value: impacts.materialCount },
    { label: '库存总账', value: impacts.inventoryCount },
    { label: '库位库存', value: impacts.inventoryLocationCount },
    { label: '入库记录', value: impacts.inboundCount },
    { label: '调拨记录', value: impacts.transferCount },
  ] : []

  return (
    <Modal
      onClose={onClose}
      title={deleteCheck?.deletable === false ? '无法删除库位' : '删除库位'}
      size="md"
    >
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <AlertTriangle className="h-6 w-6 text-red-500" />
        </div>
        <h3 className="text-base font-semibold text-gray-900">
          {deleteCheck?.deletable === false ? '该库位已被业务数据引用' : '确定要删除该库位吗？'}
        </h3>
        <p className="mt-1 text-sm text-gray-500">删除前会检查子库位、物料、库存、入库和调拨引用</p>

        <div className="mt-4 w-full rounded-lg bg-gray-50 p-3 text-left">
          <div className="text-xs text-gray-500">待删除库位</div>
          <div className="mt-1 font-semibold text-gray-900">
            {deleteCheck?.location.code || target.code} {deleteCheck?.location.name || target.name}
          </div>
        </div>

        <div className="mt-3 w-full rounded-lg border border-gray-200 bg-white p-3 text-left">
          {checkingDelete ? (
            <div className="text-sm text-gray-500">正在检查删除影响...</div>
          ) : deleteCheck ? (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {impactItems.map(item => (
                  <div key={item.label} className="rounded-md bg-gray-50 px-3 py-2">
                    <div className="text-xs text-gray-500">{item.label}</div>
                    <div className={`mt-1 text-base font-semibold ${item.value > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {item.value}
                    </div>
                  </div>
                ))}
              </div>
              {deleteCheck.reasons.length > 0 ? (
                <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                  {deleteCheck.reasons.join('；')}，请先解除引用后再删除。
                </div>
              ) : (
                <div className="mt-3 rounded-md bg-green-50 px-3 py-2 text-xs text-green-700">
                  未发现业务引用，可以删除。
                </div>
              )}
            </>
          ) : (
            <div className="text-sm text-red-600">删除影响检查失败，请关闭后重试。</div>
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
          className="h-10 rounded-md bg-red-500 px-4 text-sm text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {checkingDelete ? '检查中...' : deleting ? '删除中...' : '确认删除'}
        </button>
      </div>
    </Modal>
  )
}
