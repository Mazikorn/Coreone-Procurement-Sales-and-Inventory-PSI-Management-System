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
  remainValue: string
  reason: string
  onClose: () => void
  onChangeValue: (value: string) => void
  onChangeReason: (value: string) => void
}

export function EditRemainModal({ open, item, remainValue, reason, onClose, onChangeValue, onChangeReason }: Props) {
  if (!open || !item) return null

  return (
    <Modal title="修改剩余量" onClose={onClose} size="md">
      <div className="space-y-4">
        <div className="rounded-lg bg-gray-50 p-3">
          <div className="text-sm font-medium text-gray-900">{item.materialName}</div>
          <div className="mt-1 text-xs text-gray-500">{item.spec} · 批次: {item.batch}</div>
          <div className="mt-2 text-sm text-gray-700">当前剩余: {item.remaining} {item.unit}</div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">实际剩余量</label>
          <input
            type="number"
            min="0"
            value={remainValue}
            onChange={e => onChangeValue(e.target.value)}
            className="h-10 w-full rounded-md border border-gray-300 px-3 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">调整原因</label>
          <textarea
            value={reason}
            onChange={e => onChangeReason(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
          后端尚未提供剩余量调整接口，本弹窗只记录输入，不提交伪成功。
        </div>
        <div className="flex justify-end border-t border-gray-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            关闭
          </button>
        </div>
      </div>
    </Modal>
  )
}
