import React from 'react'
import { X } from 'lucide-react'
import type { LogFormData } from '../hooks/useLogsPage'

interface Props {
  open: boolean
  form: LogFormData
  filterSummary?: string[]
  dateError?: string
  contentError?: string
  onClose: () => void
  onChange: (form: LogFormData) => void
  onExport: () => void
}

const CONTENT_LABELS: Array<{ key: keyof Pick<LogFormData, 'includeBasic' | 'includeDetail' | 'includeIP' | 'includeDiff'>; label: string }> = [
  { key: 'includeBasic', label: '基本信息' },
  { key: 'includeDetail', label: '操作详情' },
  { key: 'includeIP', label: 'IP地址和设备信息' },
  { key: 'includeDiff', label: '变更前后数据对比' },
]

export function LogExportModal({ open, form, filterSummary = [], dateError = '', contentError = '', onClose, onChange, onExport }: Props) {
  if (!open) return null
  const selectedContent = CONTENT_LABELS
    .filter(item => form[item.key])
    .map(item => item.label)
  const rangeText = `${form.startDate || '不限'} 至 ${form.endDate || '不限'}`
  const scopeText = filterSummary.length ? filterSummary.join(' / ') : '全部统一审计记录'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">导出日志</h3>
          <button onClick={onClose} className="w-9 h-9 flex items-center justify-center text-gray-500 hover:bg-gray-100 hover:text-gray-900 rounded-md transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 overflow-y-auto">
          <div className="mb-5">
            <label className="block text-[13px] font-medium text-gray-700 mb-1.5">导出时间范围</label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={form.startDate}
                onChange={e => onChange({ ...form, startDate: e.target.value })}
                aria-invalid={Boolean(dateError)}
                aria-describedby={dateError ? 'logs-export-date-error' : undefined}
                className="flex-1 h-10 px-3 text-sm text-gray-900 bg-white border border-gray-300 rounded-md outline-none transition-all focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 aria-[invalid=true]:border-red-500"
              />
              <span className="text-gray-500">至</span>
              <input
                type="date"
                value={form.endDate}
                onChange={e => onChange({ ...form, endDate: e.target.value })}
                aria-invalid={Boolean(dateError)}
                aria-describedby={dateError ? 'logs-export-date-error' : undefined}
                className="flex-1 h-10 px-3 text-sm text-gray-900 bg-white border border-gray-300 rounded-md outline-none transition-all focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 aria-[invalid=true]:border-red-500"
              />
            </div>
            {dateError && (
              <p id="logs-export-date-error" role="alert" className="mt-2 text-sm text-red-600">
                {dateError}
              </p>
            )}
          </div>

          <div className="mb-5">
            <label className="block text-[13px] font-medium text-gray-700 mb-2">导出格式</label>
            <div className="rounded-lg border-2 border-blue-500 bg-blue-50 p-3 text-sm text-gray-900">
              CSV (.csv)
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-gray-700 mb-2">导出内容</label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer">
                <input type="checkbox" checked={form.includeBasic} onChange={e => onChange({ ...form, includeBasic: e.target.checked })} aria-describedby={contentError ? 'logs-export-content-error' : undefined} className="rounded border-gray-300 text-blue-500 focus:ring-blue-500 w-4 h-4" />
                基本信息（时间、用户、类型、模块）
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer">
                <input type="checkbox" checked={form.includeDetail} onChange={e => onChange({ ...form, includeDetail: e.target.checked })} aria-describedby={contentError ? 'logs-export-content-error' : undefined} className="rounded border-gray-300 text-blue-500 focus:ring-blue-500 w-4 h-4" />
                操作详情
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer">
                <input type="checkbox" checked={form.includeIP} onChange={e => onChange({ ...form, includeIP: e.target.checked })} aria-describedby={contentError ? 'logs-export-content-error' : undefined} className="rounded border-gray-300 text-blue-500 focus:ring-blue-500 w-4 h-4" />
                IP地址和设备信息
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-900 cursor-pointer">
                <input type="checkbox" checked={form.includeDiff} onChange={e => onChange({ ...form, includeDiff: e.target.checked })} aria-describedby={contentError ? 'logs-export-content-error' : undefined} className="rounded border-gray-300 text-blue-500 focus:ring-blue-500 w-4 h-4" />
                变更前后数据对比
              </label>
            </div>
            {contentError && (
              <p id="logs-export-content-error" role="alert" className="mt-2 text-sm text-red-600">
                {contentError}
              </p>
            )}
          </div>

          <div className="mt-5 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-3">
            <div className="text-sm font-semibold text-emerald-950">导出结果确认</div>
            <div className="mt-1 text-xs leading-5 text-emerald-700">
              导出后用于审计交接、问题复核和外部留痕；当前页面筛选会一起带到导出请求。
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-emerald-700">
              <div>筛选范围 {scopeText}</div>
              <div>时间范围 {rangeText}</div>
              <div>导出内容 {selectedContent.length ? selectedContent.join('、') : '待选择'}</div>
            </div>
            <div className="mt-3 text-xs text-emerald-700">
              建议保留基本信息和操作详情，否则外部接收人可能无法按单号、用户和动作回看证据。
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="h-10 px-4 text-sm text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm transition-all">取消</button>
          <button onClick={onExport} className="h-10 px-4 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 shadow-sm transition-all">导出</button>
        </div>
      </div>
    </div>
  )
}
