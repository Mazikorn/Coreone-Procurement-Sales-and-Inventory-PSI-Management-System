import React from 'react'
import { FileSearch, Plus, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { AlertItem } from '../hooks/useAlertsPage'
import { ALERT_TYPE_MAP, buildAlertAuditEvidenceUrl, buildAlertInventoryEvidenceUrl, buildAlertPurchaseOrderUrl } from '../hooks/useAlertsPage'

interface Props {
  open: boolean
  alert: AlertItem | null
  onClose: () => void
  onHandle: () => void
  canHandle?: boolean
  canCreatePurchaseOrders?: boolean
  formatDate: (dateStr: string) => string
}

export function AlertDetailModal({ open, alert, onClose, onHandle, canHandle = true, canCreatePurchaseOrders = false, formatDate }: Props) {
  const navigate = useNavigate()

  if (!open || !alert) return null

  const typeInfo = ALERT_TYPE_MAP[alert.type] || { label: alert.type, bg: 'bg-gray-50', text: 'text-gray-600' }
  const currentStock = Number(alert.currentStock)
  const threshold = Number(alert.threshold)
  const hasStockTarget = Number.isFinite(currentStock) && Number.isFinite(threshold)
  const suggestedRestockQty = hasStockTarget ? Math.max(0, threshold - currentStock) : 0
  const showLowStockNextAction = alert.status === 'pending' && alert.type === 'low-stock'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">预警详情 - {alert.id}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">物料名称</div>
              <div className="text-sm font-medium text-gray-900">{alert.materialName || '-'}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">批次号</div>
              <div className="text-sm font-medium text-gray-900">{alert.batchNo || '-'}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">当前库存</div>
              <div className="text-sm font-medium text-gray-900">{alert.currentStock ?? '-'}</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">预警阈值</div>
              <div className="text-sm font-bold text-red-600">{alert.threshold ?? '-'}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">来源规则</div>
              <div className="text-sm font-medium text-blue-600">{alert.ruleId || '-'}</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-xs text-gray-500 mb-1">预警时间</div>
              <div className="text-sm font-medium text-gray-900">{formatDate(alert.createdAt)}</div>
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="text-sm font-medium text-gray-700 mb-2">触发条件</div>
            <div className="text-sm text-gray-600">
              {alert.triggerCondition || alert.message || '-'}
            </div>
          </div>
          {showLowStockNextAction && (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-gray-900">下一步建议</div>
                <div className="text-xs font-medium text-blue-700">
                  {hasStockTarget ? `建议补足 ${suggestedRestockQty}` : '先核对库存'}
                </div>
              </div>
              <div className="mt-2 space-y-1.5 text-sm text-blue-800">
                <div>先看库存证据确认批次与库存，再补采购或处理预警。</div>
                {canCreatePurchaseOrders && alert.materialId ? (
                  <div>可直接补采购，系统会带入物料、建议数量和预警来源备注。</div>
                ) : (
                  <div>无法直接补采购时，请处理预警并记录采购跟进人或无需处理原因。</div>
                )}
              </div>
            </div>
          )}
          {alert.status !== 'pending' && (
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm font-medium text-gray-700 mb-3">处理记录</div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <div className="text-xs text-gray-500 mb-1">处理人</div>
                  <div className="text-sm font-medium text-gray-900">{alert.handledBy || '-'}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">处理时间</div>
                  <div className="text-sm font-medium text-gray-900">{alert.handledAt ? formatDate(alert.handledAt) : '-'}</div>
                </div>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-6 text-gray-700">{alert.remark || '暂无处理意见'}</div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50">
          {alert.status !== 'pending' && (
            <button
              type="button"
              onClick={() => navigate(buildAlertAuditEvidenceUrl(alert))}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors"
            >
              <FileSearch className="w-4 h-4" />
              审计证据
            </button>
          )}
          {canCreatePurchaseOrders && alert.type === 'low-stock' && alert.materialId && (
            <button
              type="button"
              onClick={() => navigate(buildAlertPurchaseOrderUrl(alert))}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors"
            >
              <Plus className="w-4 h-4" />
              补采购
            </button>
          )}
          <button
            type="button"
            onClick={() => navigate(buildAlertInventoryEvidenceUrl(alert))}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors"
          >
            <FileSearch className="w-4 h-4" />
            库存证据
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors">
            关闭
          </button>
          {canHandle && alert.status === 'pending' && (
            <button type="button" onClick={onHandle} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors shadow-sm">
              处理预警
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
