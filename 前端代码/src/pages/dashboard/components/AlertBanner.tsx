import React from 'react'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { AlertItem } from '../hooks/useDashboardPage'

interface Props {
  alerts: AlertItem[]
}

const LEVEL_STYLES = {
  danger: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-500', dot: 'bg-red-500' },
  warning: { bg: 'bg-yellow-50', border: 'border-yellow-200', icon: 'text-yellow-500', dot: 'bg-yellow-500' },
} as const

const TYPE_LABELS: Record<string, string> = {
  'low-stock': '库存不足',
  'expiry': '即将过期',
  'expired': '已过期',
}

const ALERT_TYPE_URL: Record<string, string> = {
  'low-stock': 'stock_low',
  'expiry': 'expiring',
  'expired': 'expiring',
  stagnant: 'consumption_anomaly',
}

export function buildDashboardAlertUrl(alert: AlertItem) {
  const params = new URLSearchParams()
  const keyword = String(alert.materialName || alert.message || alert.id || '').trim()
  const type = ALERT_TYPE_URL[alert.type]
  if (keyword) params.set('keyword', keyword)
  if (type) params.set('type', type)
  params.set('quick', 'pending')
  return `/alerts?${params.toString()}`
}

export function AlertBanner({ alerts }: Props) {
  const navigate = useNavigate()

  if (alerts.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* 横幅头部 */}
      <div className="flex items-center justify-between px-5 py-3 bg-orange-50 border-b border-orange-100">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5" />
          <div>
            <span className="text-sm font-semibold text-gray-900">
              待处理预警 ({alerts.length})
            </span>
            <p className="text-xs text-orange-600 mt-0.5">进入后可处理、忽略并回看留痕</p>
          </div>
        </div>
        <button
          onClick={() => navigate('/alerts?quick=pending')}
          className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
        >
          查看全部
          <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {/* 预警列表（最多 3 条） */}
      <div className="divide-y divide-gray-100">
        {alerts.slice(0, 3).map(alert => {
          const style = LEVEL_STYLES[alert.level as keyof typeof LEVEL_STYLES] || LEVEL_STYLES.warning
          const typeLabel = TYPE_LABELS[alert.type] || alert.type

          return (
            <div
              key={alert.id}
              className={`flex items-center gap-3 px-5 py-3 ${style.bg} cursor-pointer hover:brightness-95 transition-all`}
              onClick={() => navigate(buildDashboardAlertUrl(alert))}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 truncate">
                  {alert.materialName}
                </span>
                <span className="text-xs text-gray-500 ml-2">
                  {typeLabel}
                  {alert.type === 'low-stock' && alert.currentStock != null
                    ? ` (剩余${alert.currentStock}，安全库存${alert.threshold})`
                    : ''}
                </span>
              </div>
              <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
            </div>
          )
        })}
      </div>
    </div>
  )
}
