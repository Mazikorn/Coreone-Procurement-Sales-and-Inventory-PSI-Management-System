import React, { useEffect, useState } from 'react'
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
  { value: '30', label: '30 天前', description: '清理一个月以前的历史日志' },
  { value: '90', label: '90 天前', description: '保留最近一个季度的日志' },
  { value: '180', label: '180 天前', description: '保留最近半年的日志' },
  { value: 'all', label: '全部日志', description: '清理所有操作日志记录' },
]

export function LogCleanModal({ open, range, beforeDate, onClose, onChange, onConfirm }: Props) {
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    if (open) setConfirmText('')
  }, [open, range])

  if (!open) return null

  const requiresAllConfirm = range === 'all'
  const canConfirm = !requiresAllConfirm || confirmText === '清理全部日志'

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
          {range === 'all'
            ? '将清理全部操作日志。'
            : `将清理 ${beforeDate} 之前的操作日志。`}
        </div>

        {requiresAllConfirm && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">
              输入“清理全部日志”以确认
            </label>
            <input
              value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              placeholder="清理全部日志"
              className="h-10 w-full rounded-md border border-red-200 px-3 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-[3px] focus:ring-red-500/10"
            />
          </div>
        )}

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
            disabled={!canConfirm}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            确认清理
          </button>
        </div>
      </div>
    </Modal>
  )
}
