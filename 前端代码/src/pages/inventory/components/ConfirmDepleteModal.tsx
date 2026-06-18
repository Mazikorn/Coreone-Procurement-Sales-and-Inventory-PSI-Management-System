import { Modal } from '@/components/ui/Modal'

interface DepletionItem {
  id: string
  materialName: string
  spec: string
  batch: string
  remaining: number
  unit: string
}

interface Props {
  open: boolean
  item: DepletionItem | null
  depleteType: string
  remainValue: string
  expiredReason: string
  expiredRemark: string
  onClose: () => void
  onChangeType: (value: string) => void
  onChangeRemainValue: (value: string) => void
  onChangeExpiredReason: (value: string) => void
  onChangeExpiredRemark: (value: string) => void
  onConfirm: () => void
}

export function ConfirmDepleteModal({
  open,
  item,
  depleteType,
  remainValue,
  expiredReason,
  expiredRemark,
  onClose,
  onChangeType,
  onChangeRemainValue,
  onChangeExpiredReason,
  onChangeExpiredRemark,
  onConfirm,
}: Props) {
  if (!open || !item) return null

  return (
    <Modal title="确认耗尽" onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="text-sm font-medium text-gray-900">{item.materialName}</div>
          <div className="mt-1 text-xs text-gray-500">{item.spec} · 批次: {item.batch}</div>
          <div className="mt-2 text-sm text-gray-700">当前剩余: {item.remaining} {item.unit}</div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">耗尽类型</label>
          <select
            value={depleteType}
            onChange={e => onChangeType(e.target.value)}
            className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none"
          >
            <option value="normal">正常用完</option>
            <option value="expired">过期耗尽</option>
            <option value="abnormal">异常耗尽</option>
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">实际剩余量</label>
          <input
            type="number"
            min="0"
            value={remainValue}
            onChange={e => onChangeRemainValue(e.target.value)}
            className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">原因</label>
          <input
            value={expiredReason}
            onChange={e => onChangeExpiredReason(e.target.value)}
            className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">备注</label>
          <textarea
            value={expiredRemark}
            onChange={e => onChangeExpiredRemark(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            取消
          </button>
          <button type="button" onClick={onConfirm} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
            确认耗尽
          </button>
        </div>
      </div>
    </Modal>
  )
}
