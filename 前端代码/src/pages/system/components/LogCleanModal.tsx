import React from 'react'
import { Trash2 } from 'lucide-react'
import type { LogCleanRange } from '../hooks/useLogsPage'
import { Modal } from '@/components/ui/Modal'

interface Props {
  open: boolean
  range: LogCleanRange
  beforeDate: string
  onClose: () => void
  onChange: (range: LogCleanRange) => void
  onConfirm: () => void
}

const options: Array<{ value: LogCleanRange; label: string; description: string }> = [
  { value: '180', label: '180 天前', description: '仅清理保留期外的操作日志' },
]

export function LogCleanModal({ open, range, beforeDate, onClose, onChange, onConfirm }: Props) {
  if (!open) return null

  return (
    <Modal title="清理历史日志" size="md" onClose={onClose}>
      <div className="space-y-5">
        <div className="space-y-2">
          {options.map(option => (
            <label
              key={option.value}
              className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50"
            >
              <input
                type="radio"
                name="cleanRange"
                value={option.value}
                checked={range === option.value}
                onChange={() => onChange(option.value)}
                className="mt-1 h-4 w-4 text-red-600 focus:ring-red-500"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">{option.label}</span>
                <span className="block text-sm text-gray-500">{option.description}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          <p>将清理 {beforeDate} 之前的操作日志。</p>
          <p className="mt-1">清理前会生成归档内容哈希和链式哈希；库存流水、批次库位流水、成本审计和对账修正等业务事实不会被清理。</p>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-md border border-gray-300 bg-white px-4 text-sm text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700"
          >
            <Trash2 className="h-4 w-4" />
            确认清理
          </button>
        </div>
      </div>
    </Modal>
  )
}
