import { Edit2, Loader2, MapPin, Power, Trash2 } from 'lucide-react'
import type { Location } from '@/types'
import { getTypeIcon, getTypeLabel } from '../hooks/useLocationsPage'

interface Props {
  loading: boolean
  data: Location[]
  selectedNodeName: string
  onEdit: (row: Location) => void
  onDelete: (id: string) => void
  onToggleStatus: (row: Location) => void
  levelConfigs: Record<string, string[]>
}

function getLocationPath(row: Location, levelConfigs: Record<string, string[]>) {
  const labels = levelConfigs[row.type || 'shelf'] || ['库区', '货架', '库位']
  const values = [row.zone, row.shelf, row.position]
  return values
    .map((value, index) => value ? `${labels[index] || ''}: ${value}` : '')
    .filter(Boolean)
    .join(' / ')
}

function getUtilization(row: Location) {
  if (!row.capacity || row.capacity <= 0) return 0
  return Math.min(100, Math.round((row.used / row.capacity) * 100))
}

function getUtilizationColor(value: number) {
  if (value >= 90) return 'bg-red-500'
  if (value >= 70) return 'bg-amber-500'
  return 'bg-green-500'
}

export function LocationCards({
  loading,
  data,
  selectedNodeName,
  onEdit,
  onDelete,
  onToggleStatus,
  levelConfigs,
}: Props) {
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        加载库位中...
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center text-gray-400">
        <MapPin className="mb-3 h-10 w-10 text-gray-300" />
        <div className="text-sm">{selectedNodeName ? '当前节点下暂无库位' : '暂无库位数据'}</div>
        <div className="mt-1 text-xs text-gray-400">点击“新建库位”添加库位</div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-2 2xl:grid-cols-3">
      {data.map(row => {
        const utilization = getUtilization(row)
        const locationPath = getLocationPath(row, levelConfigs)

        return (
          <div
            key={row.id}
            className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getTypeIcon(row.type)}</span>
                  <span className="truncate font-semibold text-gray-900">{row.name}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-gray-400">{row.code}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                row.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
              }`}>
                {row.status === 'active' ? '已启用' : '已停用'}
              </span>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">类型</span>
                <span className="font-medium text-gray-700">{getTypeLabel(row.type)}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">层级</span>
                <span className="truncate text-right text-gray-700" title={locationPath}>
                  {locationPath || '-'}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-gray-500">容量</span>
                <span className="font-medium text-gray-700">
                  {row.used.toLocaleString()} / {row.capacity.toLocaleString()}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                <span>使用率</span>
                <span>{utilization}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className={`h-full rounded-full ${getUtilizationColor(utilization)}`}
                  style={{ width: `${utilization}%` }}
                />
              </div>
            </div>

            <div className="mt-4 flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
              <button
                type="button"
                onClick={() => onToggleStatus(row)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <Power className="h-3.5 w-3.5" />
                {row.status === 'active' ? '停用' : '启用'}
              </button>
              <button
                type="button"
                onClick={() => onEdit(row)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-blue-50 hover:text-blue-600"
              >
                <Edit2 className="h-3.5 w-3.5" />
                编辑
              </button>
              <button
                type="button"
                onClick={() => onDelete(row.id)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3.5 w-3.5" />
                删除
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
