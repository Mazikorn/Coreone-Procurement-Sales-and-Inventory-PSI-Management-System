import { AlertTriangle, Download, FileSearch, GitCompare, Printer, X } from 'lucide-react'
import { Pagination } from '@/components/ui/Pagination'
import type { OutboundRecord } from '@/types'
import { formatDate } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'
import { getOutboundTypeLabel } from '../outboundLabels'

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  completed: { label: '已完成', bg: 'bg-green-50', text: 'text-green-600' },
  pending: { label: '待出库', bg: 'bg-yellow-50', text: 'text-yellow-600' },
  cancelled: { label: '已取消', bg: 'bg-red-50', text: 'text-red-600' },
}

const costStatusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending_cost: { label: '待核算', bg: 'bg-gray-100', text: 'text-gray-600' },
  costed: { label: '已核算', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  cost_exception: { label: '成本异常', bg: 'bg-red-50', text: 'text-red-700' },
  recalculated: { label: '已重算', bg: 'bg-blue-50', text: 'text-blue-700' },
}

interface OutboundTableProps {
  loading: boolean
  data: OutboundRecord[]
  selectedIds: Set<string>
  selectAll: boolean
  total: number
  page: number
  pageSize: number
  onToggleSelectAll: () => void
  onToggleSelectRow: (id: string) => void
  onClearSelection: () => void
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  onOpenDetail: (record: OutboundRecord) => void
  onOpenEdit: (record: OutboundRecord) => void
  onOpenDelete: (record: OutboundRecord) => void
  onOpenCancel: (record: OutboundRecord) => void
  onPrintRecord: (record: OutboundRecord) => void
  onBatchExport: () => void
  onBatchPrint: () => void
}

export default function OutboundTable({
  loading,
  data,
  selectedIds,
  selectAll,
  total,
  page,
  pageSize,
  onToggleSelectAll,
  onToggleSelectRow,
  onClearSelection,
  onPageChange,
  onPageSizeChange,
  onOpenDetail,
  onOpenEdit,
  onOpenDelete,
  onOpenCancel,
  onPrintRecord,
  onBatchExport,
  onBatchPrint,
}: OutboundTableProps) {
  const navigate = useNavigate()
  return (
    <>
      {/* Batch Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
          <div className="text-sm text-blue-700">
            已选择 <strong>{selectedIds.size}</strong> 项
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onBatchExport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-white rounded-md transition-colors duration-150"
            >
              <Download className="w-3.5 h-3.5" />
              导出
            </button>
            <button
              onClick={onBatchPrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-white rounded-md transition-colors duration-150"
            >
              <Printer className="w-3.5 h-3.5" />
              打印
            </button>
            <button
              onClick={onClearSelection}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-white rounded-md transition-colors duration-150"
            >
              <X className="w-3.5 h-3.5" />
              取消选择
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={selectAll}
                  onChange={onToggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">出库单号</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">耗材名称</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">批号</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">出库类型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">数量</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">领用项目</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">领用人</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">出库时间</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ABC总成本</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">成本状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">收费金额</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">利润</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[180px]">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={15} className="px-4 py-8 text-center text-gray-400">加载中...</td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-8 text-center text-gray-400">暂无数据</td>
              </tr>
            ) : (
              data.map(row => {
                const firstItem = row.items?.[0]
                const cfg = statusConfig[row.status] || statusConfig.completed
                const costCfg = costStatusConfig[row.costStatus || 'pending_cost'] || costStatusConfig.pending_cost
                const canEdit = row.type === 'project'
                const canDeleteFromOutbound = row.type === 'project' || row.type === 'bom'
                return (
                  <tr
                    key={row.id}
                    className={`hover:bg-gray-50 transition-colors duration-150 ${
                      selectedIds.has(row.id) ? 'bg-blue-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(row.id)}
                        onChange={() => onToggleSelectRow(row.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-600">{row.outboundNo}</td>
                    <td className="px-4 py-3">
                      <strong
                        className="text-gray-900 hover:text-blue-600 cursor-pointer transition-colors"
                        onClick={(e) => { e.stopPropagation(); navigate(`/materials?keyword=${encodeURIComponent(firstItem?.materialName || '')}`) }}
                      >
                        {firstItem?.materialName || '-'}
                      </strong>
                      {(row.items?.length || 0) > 1 && (
                        <span className="text-xs text-gray-400 ml-1">等{row.items?.length}项</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-500">{firstItem?.batchNo || '-'}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-purple-50 text-purple-700">
                        {getOutboundTypeLabel(row.type)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {Number((row.items?.reduce((sum, i) => sum + i.quantity, 0) || 0).toFixed(2))} {firstItem?.unit || '件'}
                    </td>
                    <td className="px-4 py-3">
                      {row.projectName ? (
                        <span
                          className="text-gray-700 hover:text-blue-600 cursor-pointer transition-colors"
                          onClick={(e) => { e.stopPropagation(); navigate(`/projects?keyword=${encodeURIComponent(row.projectName)}`) }}
                        >
                          {row.projectName}
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-700">{row.operator}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3 text-gray-900">
                      {row.abcTotalCost ? `¥${row.abcTotalCost.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${costCfg.bg} ${costCfg.text}`}>
                          {row.costStatus === 'cost_exception' && <AlertTriangle className="h-3 w-3" />}
                          {costCfg.label}
                        </span>
                        {row.costStatus === 'cost_exception' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/abc/alerts?outboundId=${encodeURIComponent(row.id)}`)
                            }}
                            className="text-xs text-blue-600 hover:text-blue-700"
                          >
                            查看
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-900">
                      {row.feeAmount ? `¥${row.feeAmount.toFixed(2)}` : '-'}
                    </td>
                    <td className="px-4 py-3">
                      {row.profit !== undefined && row.profit !== 0 ? (
                        <span className={row.profit > 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                          {row.profit > 0 ? '+' : ''}{row.profit.toFixed(2)}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onOpenDetail(row)}
                          className="px-2 py-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors duration-150"
                        >
                          详情
                        </button>
                        <button
                          onClick={() => onPrintRecord(row)}
                          className="px-2 py-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors duration-150"
                        >
                          打印
                        </button>
                        <button
                          type="button"
                          aria-label={`审计证据 ${row.outboundNo}`}
                          title="审计证据"
                          onClick={() => navigate(`/logs?keyword=${encodeURIComponent(row.outboundNo)}`)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 transition-colors duration-150 hover:bg-blue-50 hover:text-blue-600"
                        >
                          <FileSearch className="h-4 w-4" />
                        </button>
                        {row.projectId && (
                          <button
                            type="button"
                            aria-label={`项目对账 ${row.projectName || row.projectId}`}
                            title="项目对账"
                            onClick={() => navigate(`/reconciliation?projectId=${encodeURIComponent(row.projectId || '')}`)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-500 transition-colors duration-150 hover:bg-blue-50 hover:text-blue-600"
                          >
                            <GitCompare className="h-4 w-4" />
                          </button>
                        )}
                        {row.status === 'completed' && (
                          <>
                            {canEdit && (
                              <button
                                onClick={() => onOpenEdit(row)}
                                className="px-2 py-1 text-xs text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors duration-150"
                              >
                                编辑
                              </button>
                            )}
                            {canDeleteFromOutbound && (
                              <button
                                onClick={() => onOpenDelete(row)}
                                className="px-2 py-1 text-xs text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors duration-150"
                              >
                                删除
                              </button>
                            )}
                          </>
                        )}
                        {row.status === 'pending' && (
                          <button
                            onClick={() => onOpenCancel(row)}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-red-600 hover:bg-red-50 rounded transition-colors duration-150"
                          >
                            取消出库
                          </button>
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

      {/* Pagination */}
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
    </>
  )
}
