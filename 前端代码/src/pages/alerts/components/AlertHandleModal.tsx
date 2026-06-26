import React from 'react'
import { X, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
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
  const validationMessage = form.opinion.trim().length === 0
    ? '请填写处理意见，系统才能说明预警处理依据并形成审计记录。'
    : ''
  const canConfirm = validationMessage === ''
  const currentStock = Number(alert.currentStock)
  const threshold = Number(alert.threshold)
  const hasStockTarget = Number.isFinite(currentStock) && Number.isFinite(threshold)
  const suggestedAction = alert.type === 'low-stock' && hasStockTarget
    ? `预计补足 ${Math.max(0, threshold - currentStock)}`
    : '记录处理结论'
  const downstreamFacts = alert.type === 'low-stock'
    ? '库存、批次、补货、预警记录、审计记录'
    : '库存、批次、预警记录、审计记录'
  // P1-02：过期预警的头号处置是「去报废核销」，此前预警处理只让填文本、不通向报废，仓管须手动改道重选物料批次。
  // 此处给出一键深链进入报废草稿（带物料/批次/原因），让 过期→报废 贯通。
  const isExpiry = alert.type === 'expiry'
  const scrapUrl = isExpiry && alert.materialId
    ? `/scraps?action=create&materialId=${encodeURIComponent(alert.materialId)}${alert.batchId ? `&batchId=${encodeURIComponent(String(alert.batchId))}` : ''}&reason=expired&remark=${encodeURIComponent('来自过期预警')}`
    : null

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
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-gray-900">处理前确认</h4>
              <div className="text-xs text-blue-700">确认后将接住：{downstreamFacts}</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {[
                { label: '物料', value: alert.materialName || '-' },
                { label: '批次', value: alert.batchNo || '-' },
                { label: '库存/阈值', value: hasStockTarget ? `${currentStock} / ${threshold}` : '-' },
                { label: '建议动作', value: suggestedAction },
              ].map((item) => (
                <div key={item.label} className="min-w-0">
                  <div className="text-xs text-gray-500">{item.label}</div>
                  <div className="mt-0.5 truncate text-sm font-medium text-gray-900">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
          {scrapUrl ? (
            <Link
              to={scrapUrl}
              onClick={onClose}
              className="flex items-center justify-center gap-2 h-10 w-full rounded-md border border-blue-500 bg-blue-50 text-sm font-medium text-blue-700 hover:bg-blue-100 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              去报废核销（已带入物料/批次/过期原因）
            </Link>
          ) : null}
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
          {validationMessage ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {validationMessage}
            </div>
          ) : null}
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
