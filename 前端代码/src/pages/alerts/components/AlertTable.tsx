import { Search } from 'lucide-react'
import { Pagination } from '@/components/ui/Pagination'
import type { AlertItem, FilterState, AlertStatusFilter } from '../hooks/useAlertsPage'

interface Props {
  data: AlertItem[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  filter: FilterState
  quickFilter: AlertStatusFilter
  selectedIds: Set<string>
  onFilterChange: (f: FilterState) => void
  onQuickFilterChange: (v: AlertStatusFilter) => void
  onSelect: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
  onBatchProcess: () => void
  onOpenModal: (type: 'handle' | 'consumption-handle' | 'consumption-detail' | 'detail', alert: AlertItem) => void
  onIgnore: (id: string) => void
  getAlertTypeInfo: (type: string) => { label: string; bg: string; text: string }
  getStatusInfo: (status: string) => { label: string; bg: string; text: string }
  isConsumption: (type: string) => boolean
  formatDate: (dateStr: string) => string
}

const QUICK_FILTERS: { key: AlertStatusFilter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待处理' },
  { key: 'processed', label: '已处理' },
  { key: 'ignored', label: '已忽略' },
]

export function AlertTable({
  data, loading, total, page, pageSize,
  filter, quickFilter, selectedIds,
  onFilterChange, onQuickFilterChange, onSelect, onSelectAll,
  onPageChange, onPageSizeChange, onBatchProcess, onOpenModal, onIgnore,
  getAlertTypeInfo, getStatusInfo, isConsumption, formatDate,
}: Props) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索预警..."
            value={filter.keyword}
            onChange={e => onFilterChange({ ...filter, keyword: e.target.value })}
            className="w-48 h-10 pl-9 pr-3 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
          />
        </div>
        <select
          value={filter.type}
          onChange={e => onFilterChange({ ...filter, type: e.target.value as FilterState['type'] })}
          className="h-10 px-3 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500"
        >
          <option value="all">全部类型</option>
          <option value="low-stock">库存不足</option>
          <option value="expiry">即将过期</option>
          <option value="stagnant">消耗异常</option>
        </select>
        {selectedIds.size > 0 && (
          <button
            onClick={onBatchProcess}
            className="h-10 px-4 text-sm font-medium text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
          >
            批量处理 ({selectedIds.size})
          </button>
        )}
      </div>

      {/* 快速筛选 */}
      <div className="flex gap-2 px-5 py-3 border-b border-gray-100">
        {QUICK_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => onQuickFilterChange(f.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              quickFilter === f.key
                ? 'bg-blue-50 text-blue-600 border-blue-200'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={data.length > 0 && selectedIds.size === data.length}
                  onChange={onSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">类型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">物料</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">信息</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">时间</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 w-32">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">加载中...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">暂无预警</td></tr>
            ) : data.map(alert => {
              const typeInfo = getAlertTypeInfo(alert.type)
              const statusInfo = getStatusInfo(alert.status)
              return (
                <tr key={alert.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(alert.id)}
                      onChange={() => onSelect(alert.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeInfo.bg} ${typeInfo.text}`}>
                      {typeInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{alert.materialName}</td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate">{alert.message}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusInfo.bg} ${statusInfo.text}`}>
                      {statusInfo.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{formatDate(alert.createdAt)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      {alert.status === 'pending' && (
                        <>
                          <button
                            onClick={() => onOpenModal(isConsumption(alert.type) ? 'consumption-handle' : 'handle', alert)}
                            className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          >
                            处理
                          </button>
                          <button
                            onClick={() => onIgnore(alert.id)}
                            className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded transition-colors"
                          >
                            忽略
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => onOpenModal(isConsumption(alert.type) ? 'consumption-detail' : 'detail', alert)}
                        className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 rounded transition-colors"
                      >
                        详情
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="px-5 py-3 border-t border-gray-100">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onChangePage={onPageChange}
          onChangePageSize={onPageSizeChange}
        />
      </div>
    </div>
  )
}
