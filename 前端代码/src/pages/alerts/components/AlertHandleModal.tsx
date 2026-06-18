import { X } from 'lucide-react'
import type { AlertItem } from '../hooks/useAlertsPage'

interface Props {
  open: boolean
  alert: AlertItem | null
  form: { opinion: string; result: string }
  onClose: () => void
  onChange: (form: { opinion: string; result: string }) => void
  onConfirm: () => void
}

export function AlertHandleModal({ open, alert, form, onClose, onChange, onConfirm }: Props) {
  if (!open || !alert) return null
  const canConfirm = form.opinion.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">处理预警</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 transition-colors" aria-label="关闭弹窗">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="rounded-lg bg-gray-50 p-4">
            <div className="text-sm font-medium text-gray-900">{alert.materialName || '-'}</div>
            <div className="text-sm text-gray-600 mt-1">{alert.message}</div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">处理结果</label>
            <select
              value={form.result}
              onChange={(e) => onChange({ ...form, result: e.target.value })}
              className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
            >
              <option value="purchase_followed">采购跟进中</option>
              <option value="no_action_needed">已核实无需处理</option>
              <option value="other">其他处理</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              处理意见 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.opinion}
              onChange={(e) => onChange({ ...form, opinion: e.target.value })}
              maxLength={500}
              placeholder="请输入处理意见..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 resize-none"
            />
            <div className="mt-1 text-xs text-gray-400 text-right">{form.opinion.length}/500</div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors">
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
          >
            确认处理
          </button>
        </div>
      </div>
    </div>
  )
}
