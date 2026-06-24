import React from 'react'
import { X } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { OutboundRecord } from '@/types'

interface OutboundCancelModalProps {
  open: boolean
  record: OutboundRecord | null
  cancelReason: string
  cancelRemark: string
  onReasonChange: (value: string) => void
  onRemarkChange: (value: string) => void
  onCancel: () => void
  onClose: () => void
}

export default function OutboundCancelModal({
  open,
  record,
  cancelReason,
  cancelRemark,
  onReasonChange,
  onRemarkChange,
  onCancel,
  onClose,
}: OutboundCancelModalProps) {
  if (!open || !record) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">取消出库</h3>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors duration-150"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-sm font-semibold text-amber-900">取消结果确认</div>
            <div className="mt-1 text-sm text-amber-800">
              确认后将接住：库存恢复、批次余量、成本回退、项目消耗对账口径、审计记录
            </div>
            <div className="mt-2 text-sm text-amber-900">出库单 {record.outboundNo}</div>
            <div className="mt-1 text-xs text-amber-800">
              当前列表将移除该出库单，可在审计记录中按单号回看取消原因。
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              取消原因 <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              value={cancelReason}
              onChange={val => onReasonChange(val)}
              options={[
                { value: '', label: '请选择原因' },
                { value: 'request', label: '申请人取消需求' },
                { value: 'stock', label: '库存不足' },
                { value: 'error', label: '录入错误' },
                { value: 'other', label: '其他原因' },
              ]}
              placeholder="请选择原因"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
            <textarea
              value={cancelRemark}
              onChange={e => onRemarkChange(e.target.value)}
              rows={2}
              placeholder="可选填"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors duration-150"
          >
            取消
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-white bg-red-500 rounded-md hover:bg-red-600 transition-colors duration-150"
          >
            确认取消
          </button>
        </div>
      </div>
    </div>
  )
}
