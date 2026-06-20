import React from 'react'
import { AlertTriangle, X } from 'lucide-react'
import type { AlertItem } from '../hooks/useAlertsPage'

interface Props {
  open: boolean
  alert: AlertItem | null
  form: { opinion: string; result: string }
  onClose: () => void
  onChange: (form: { opinion: string; result: string }) => void
  onConfirm: () => void
}

export function AlertConsumptionHandleModal({ open, alert, form, onClose, onChange, onConfirm }: Props) {
  if (!open || !alert) return null
  const canConfirm = form.opinion.trim().length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">处理消耗异常预警</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 transition-colors" aria-label="关闭弹窗">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="bg-red-50 border border-red-100 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <span className="font-semibold text-red-600">消耗异常预警待复核</span>
            </div>
            <div className="text-sm text-gray-600 space-y-2">
              <div><strong>物料：</strong>{alert.materialName || '-'}</div>
              <div><strong>关联项目：</strong>{alert.projectName || '-'}</div>
              <div><strong>来源规则：</strong><span className="text-blue-600">{alert.ruleId || '-'}</span></div>
              <div><strong>当前值/阈值：</strong>{alert.currentStock ?? '-'} / {alert.threshold ?? '-'}</div>
              <div><strong>触发说明：</strong>{alert.triggerCondition || alert.message || '-'}</div>
            </div>
          </div>

          <div className="space-y-4">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm placeholder:text-gray-400 focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 resize-none"
              />
              <div className="mt-1 text-xs text-gray-400 text-right">{form.opinion.length}/500</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">处理结果</label>
              <div className="flex flex-wrap gap-3">
                {[
                  { key: 'normal', label: '标记为正常波动' },
                  { key: 'observe', label: '关注观察，下季度再评估' },
                  { key: 'optimize', label: '已核实，需优化流程' },
                  { key: 'adjust_threshold_suggested', label: '建议调整预警阈值' },
                ].map((opt) => (
                  <label key={opt.key} className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="consumption-result"
                      value={opt.key}
                      checked={form.result === opt.key}
                      onChange={(e) => onChange({ ...form, result: e.target.value })}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
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
