import React from 'react'
import { CheckCircle2, Eye, FileSearch, FileText, Plus, RotateCcw, Search, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Pagination } from '@/components/ui/Pagination'
import type {
  AlertItem,
  AlertLevelFilter,
  AlertStatusFilter,
  AlertTypeFilter,
  FilterState,
  ModalState,
} from '../hooks/useAlertsPage'
import { buildAlertAuditEvidenceUrl, buildAlertInventoryEvidenceUrl, buildAlertPurchaseOrderUrl } from '../hooks/useAlertsPage'

interface Props {
  data: AlertItem[]
  loading: boolean
  error?: string | null
  total: number
  page: number
  pageSize: number
  filter: FilterState
  quickFilter: AlertStatusFilter
  selectedIds: Set<string>
  canHandle?: boolean
  canCreatePurchaseOrders?: boolean
  onFilterChange: (filter: FilterState) => void
  onQuickFilterChange: (value: AlertStatusFilter) => void
  onResetFilters: () => void
  onSelect: (id: string) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onRetry?: () => void
  onBatchProcess: () => void
  onOpenModal: (type: ModalState['type'], alert: AlertItem) => void
  onIgnore: (id: string) => void
  getAlertTypeInfo: (type: string) => { label: string; bg: string; text: string }
  getStatusInfo: (status: string) => { label: string; bg: string; text: string }
  isConsumption: (type: string) => boolean
  formatDate: (dateStr: string) => string
}

const typeOptions: Array<{ value: AlertTypeFilter; label: string }> = [
  { value: 'all', label: '全部类型' },
  { value: 'low-stock', label: '库存不足' },
  { value: 'expiry', label: '即将过期' },
  { value: 'stagnant', label: '消耗异常' },
]

const levelOptions: Array<{ value: AlertLevelFilter; label: string }> = [
  { value: 'all', label: '全部级别' },
  { value: 'urgent', label: '紧急' },
  { value: 'important', label: '重要' },
  { value: 'normal', label: '一般' },
]

const quickFilters: Array<{ value: AlertStatusFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'pending', label: '待处理' },
  { value: 'processed', label: '已处理' },
  { value: 'ignored', label: '已忽略' },
  { value: 'history', label: '历史' },
]

export function AlertTable({
  data,
  loading,
  error,
  total,
  page,
  pageSize,
  filter,
  quickFilter,
  selectedIds,
  canHandle = true,
  canCreatePurchaseOrders = false,
  onFilterChange,
  onQuickFilterChange,
  onResetFilters,
  onSelect,
  onSelectAll,
  onClearSelection,
  onPageChange,
  onPageSizeChange,
  onRetry,
  onBatchProcess,
  onOpenModal,
  onIgnore,
  getAlertTypeInfo,
  getStatusInfo,
  isConsumption,
  formatDate,
}: Props) {
  const navigate = useNavigate()
  const allSelected = data.length > 0 && selectedIds.size === data.length

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="p-4 border-b border-gray-200 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              value={filter.keyword}
              onChange={(e) => onFilterChange({ ...filter, keyword: e.target.value })}
              placeholder="搜索物料或预警内容"
              className="w-full h-10 pl-10 pr-4 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={filter.type}
              onChange={(e) => onFilterChange({ ...filter, type: e.target.value as AlertTypeFilter })}
              className="h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
            >
              {typeOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={filter.level}
              onChange={(e) => onFilterChange({ ...filter, level: e.target.value as AlertLevelFilter })}
              className="h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
            >
              {levelOptions.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              type="date"
              value={filter.dateRange[0]}
              onChange={(e) => onFilterChange({ ...filter, dateRange: [e.target.value, filter.dateRange[1]] })}
              className="h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
            />
            <input
              type="date"
              value={filter.dateRange[1]}
              onChange={(e) => onFilterChange({ ...filter, dateRange: [filter.dateRange[0], e.target.value] })}
              className="h-10 px-3 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
            />
            <button
              type="button"
              onClick={onResetFilters}
              className="inline-flex h-10 items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              <RotateCcw className="h-4 w-4" />
              重置
            </button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {quickFilters.map(item => (
              <button
                key={item.value}
                type="button"
                onClick={() => onQuickFilterChange(item.value)}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  quickFilter === item.value
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-700">已选择 {selectedIds.size} 项</span>
              <button onClick={onBatchProcess} className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">
                批量处理
              </button>
              <button onClick={onClearSelection} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-md hover:bg-gray-50">
                取消选择
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {canHandle && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={onSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">物料</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">内容</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">库存/阈值</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">时间</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[280px]">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={canHandle ? 8 : 7} className="px-4 py-12 text-center text-gray-400">加载中...</td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={canHandle ? 8 : 7} className="px-4 py-12 text-center">
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-red-600">预警列表加载失败</div>
                    <div className="text-xs text-gray-500">{error}</div>
                    {onRetry && (
                      <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex h-9 items-center rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        重试
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={canHandle ? 8 : 7} className="px-4 py-12 text-center text-gray-400">暂无预警</td>
              </tr>
            ) : (
              data.map(alert => {
                const typeInfo = getAlertTypeInfo(alert.type)
                const statusInfo = getStatusInfo(alert.status)
                const detailType = isConsumption(alert.type) ? 'consumption-detail' : 'detail'
                const handleType = isConsumption(alert.type) ? 'consumption-handle' : 'handle'
                return (
                  <tr key={alert.id} className="hover:bg-gray-50">
                    {canHandle && (
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(alert.id)}
                          onChange={() => onSelect(alert.id)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{alert.materialName || '-'}</div>
                      <div className="text-xs text-gray-400">{alert.batchNo || alert.projectName || '-'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${typeInfo.bg} ${typeInfo.text}`}>{typeInfo.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 max-w-md">
                      <div className="line-clamp-2">{alert.message}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {alert.currentStock ?? '-'} / {alert.threshold ?? '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs ${statusInfo.bg} ${statusInfo.text}`}>{statusInfo.label}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(alert.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        <button
                          onClick={() => onOpenModal(detailType, alert)}
                          className="px-2 py-1 text-xs text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded inline-flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          详情
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(buildAlertInventoryEvidenceUrl(alert))}
                          className="px-2 py-1 text-xs text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded inline-flex items-center gap-1"
                        >
                          <FileSearch className="w-3.5 h-3.5" />
                          库存证据
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(buildAlertAuditEvidenceUrl(alert))}
                          className="px-2 py-1 text-xs text-gray-600 hover:text-indigo-700 hover:bg-indigo-50 rounded inline-flex items-center gap-1"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          审计证据
                        </button>
                        {canCreatePurchaseOrders && alert.type === 'low-stock' && alert.materialId && (
                          <button
                            type="button"
                            onClick={() => navigate(buildAlertPurchaseOrderUrl(alert))}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-blue-700 hover:bg-blue-50 rounded inline-flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            补采购
                          </button>
                        )}
                        {canHandle && alert.status === 'pending' && (
                          <>
                            <button
                              type="button"
                              onClick={() => onOpenModal(handleType, alert)}
                              className="px-2 py-1 text-xs text-gray-600 hover:text-green-700 hover:bg-green-50 rounded inline-flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              处理
                            </button>
                            <button
                              type="button"
                              onClick={() => onIgnore(alert.id)}
                              className="px-2 py-1 text-xs text-gray-600 hover:text-red-700 hover:bg-red-50 rounded inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              忽略
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
        <span className="text-sm text-gray-500">共 {total} 条记录</span>
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
