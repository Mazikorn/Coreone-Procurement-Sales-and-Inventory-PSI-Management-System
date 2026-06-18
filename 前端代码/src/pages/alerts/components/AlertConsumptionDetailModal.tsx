import React from 'react'
import { X } from 'lucide-react'
import type { AlertItem } from '../hooks/useAlertsPage'

interface Props {
  open: boolean
  alert: AlertItem | null
  onClose: () => void
  onHandle: () => void
  formatDate: (dateStr: string) => string
}

export function AlertConsumptionDetailModal({ open, alert, onClose, onHandle, formatDate }: Props) {
  if (!open || !alert) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">消耗异常详情 - {alert.id}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 transition-colors" aria-label="关闭弹窗">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Info label="物料名称" value={alert.materialName || '-'} />
            <Info label="关联项目" value={alert.projectName || '-'} />
            <Info label="来源规则" value={alert.ruleId || 'RULE-003'} accent />
            <Info label="预警等级" value={alert.level === 'danger' ? '高风险' : alert.level === 'warning' ? '预警' : '提示'} danger={alert.level === 'danger'} />
            <Info label="当前值" value={String(alert.currentStock ?? '-')} />
            <Info label="预警阈值" value={String(alert.threshold ?? '-')} danger />
            <Info label="预警时间" value={formatDate(alert.createdAt)} />
            <Info label="预警状态" value={alert.status === 'pending' ? '待处理' : '已处理'} />
          </div>

          <div className="rounded-lg bg-gray-50 p-4">
            <div className="mb-2 text-sm font-medium text-gray-700">触发说明</div>
            <div className="whitespace-pre-wrap text-sm leading-6 text-gray-600">
              {alert.triggerCondition || alert.message || '暂无触发说明'}
            </div>
          </div>

          {alert.status !== 'pending' && (
            <div className="rounded-lg bg-gray-50 p-4">
              <div className="mb-3 text-sm font-medium text-gray-700">处理记录</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <Info label="处理人" value={alert.handledBy || '-'} />
                <Info label="处理时间" value={alert.handledAt ? formatDate(alert.handledAt) : '-'} />
              </div>
              <div className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{alert.remark || '暂无处理意见'}</div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors">
            关闭
          </button>
          {alert.status === 'pending' && (
            <button onClick={onHandle} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm">
              处理预警
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Info({ label, value, accent = false, danger = false }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className={`text-sm font-medium ${danger ? 'text-red-600' : accent ? 'text-blue-600' : 'text-gray-900'}`}>{value}</div>
    </div>
  )
}
