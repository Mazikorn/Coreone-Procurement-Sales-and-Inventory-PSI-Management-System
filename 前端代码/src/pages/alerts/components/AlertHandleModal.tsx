import { Modal } from '@/components/ui/Modal'
import type { AlertItem } from '../hooks/useAlertsPage'

interface HandleForm {
  opinion: string
  result: string
}

interface Props {
  open: boolean
  alert: AlertItem | null
  form: HandleForm
  onClose: () => void
  onChange: (form: HandleForm) => void
  onConfirm: () => void
}

export function AlertHandleModal({ open, alert, form, onClose, onChange, onConfirm }: Props) {
  if (!open || !alert) return null

  return (
    <Modal onClose={onClose} title="处理预警">
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-500">物料</span>
              <p className="font-medium text-gray-900">{alert.materialName}</p>
            </div>
            <div>
              <span className="text-gray-500">当前库存</span>
              <p className="font-medium text-gray-900">{alert.currentStock ?? '-'}</p>
            </div>
            <div>
              <span className="text-gray-500">预警阈值</span>
              <p className="font-medium text-gray-900">{alert.threshold ?? '-'}</p>
            </div>
            <div>
              <span className="text-gray-500">预警信息</span>
              <p className="font-medium text-gray-900">{alert.message}</p>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">处理方式</label>
          <select
            value={form.result}
            onChange={e => onChange({ ...form, result: e.target.value })}
            className="w-full h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
          >
            <option value="purchased">已采购</option>
            <option value="transferred">已调拨</option>
            <option value="adjusted">已调整阈值</option>
            <option value="ignored">已忽略</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">处理意见</label>
          <textarea
            value={form.opinion}
            onChange={e => onChange({ ...form, opinion: e.target.value })}
            placeholder="请输入处理意见..."
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 resize-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
        <button
          onClick={onClose}
          className="h-10 px-4 text-sm text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          取消
        </button>
        <button
          onClick={onConfirm}
          className="h-10 px-4 text-sm text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
        >
          确认处理
        </button>
      </div>
    </Modal>
  )
}
