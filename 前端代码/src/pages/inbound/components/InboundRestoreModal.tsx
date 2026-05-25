import { RotateCcw } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { InboundRecord } from '@/types'

interface InboundRestoreModalProps {
  open: boolean
  record: InboundRecord | null
  onClose: () => void
  onConfirm: () => void
}

export default function InboundRestoreModal({ open, record, onClose, onConfirm }: InboundRestoreModalProps) {
  if (!open || !record) return null

  return (
    <Modal onClose={onClose} title="恢复入库">
      <div className="text-center py-5">
        <RotateCcw className="mx-auto text-blue-500 mb-4 w-16 h-16" />
        <h4 className="text-base font-semibold text-gray-900 mb-2">恢复此入库记录？</h4>
        <p className="text-sm text-gray-500 mb-5">
          入库单号: <span className="font-mono">{record.inboundNo}</span>
        </p>
        <div className="bg-gray-50 rounded-lg p-4 text-left mb-4">
          <div className="flex justify-between mb-2 text-sm">
            <span className="text-gray-500">耗材名称</span>
            <span className="font-medium">{record.materialName}</span>
          </div>
          <div className="flex justify-between mb-2 text-sm">
            <span className="text-gray-500">入库数量</span>
            <span className="font-medium">{record.quantity}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">当前库存</span>
            <span className="font-medium text-green-600">恢复后将重新计入</span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
        <button
          onClick={onClose}
          className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
        <button
          onClick={onConfirm}
          className="px-4 py-2 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
        >
          确认恢复
        </button>
      </div>
    </Modal>
  )
}
