import type { InboundRecord } from '@/types'
import { Modal } from '@/components/ui/Modal'

interface InboundCancelModalProps {
  open: boolean
  record: InboundRecord | null
  onClose: () => void
  onConfirm: () => void
}

export default function InboundCancelModal({ open, record, onClose, onConfirm }: InboundCancelModalProps) {
  if (!open || !record) return null

  return (
    <Modal onClose={onClose} title="取消入库">
      <div className="rounded-lg bg-red-50 p-4">
        <h4 className="mb-2 text-base font-semibold text-gray-900">取消此入库记录？</h4>
        <p className="text-sm text-gray-600">
          入库单 {record.inboundNo} 取消后会同步扣减库存、回退采购订单收货数量，并保留记录用于后续恢复。
        </p>
      </div>

      <div className="mt-6 flex justify-end gap-3 border-t border-gray-200 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="h-10 rounded-md border border-gray-300 bg-white px-4 text-sm text-gray-600 hover:bg-gray-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="h-10 rounded-md bg-red-500 px-4 text-sm text-white hover:bg-red-600"
        >
          确认取消
        </button>
      </div>
    </Modal>
  )
}
