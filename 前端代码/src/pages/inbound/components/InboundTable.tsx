import { Eye, Edit, Trash2, RotateCcw, Printer } from 'lucide-react'
import { Pagination } from '@/components/ui/Pagination'
import type { InboundRecord } from '@/types'
import { formatDateTime, formatCurrency } from '@/lib/utils'

interface InboundTableProps {
  data: InboundRecord[]
  loading: boolean
  selectedIds: Set<string>
  onToggleSelectAll: () => void
  onToggleSelectOne: (id: string) => void
  isAllSelected: boolean
  isIndeterminate: boolean
  onClearSelection: () => void
  onDetail: (record: InboundRecord) => void
  onEdit: (record: InboundRecord) => void
  onDelete: (record: InboundRecord) => void
  onRestore: (record: InboundRecord) => void
  onPrint: (record: InboundRecord) => void
  onBatchExport: () => void
  onBatchPrint: () => void
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

const TYPE_LABELS: Record<string, string> = {
  direct: '直接入库',
  purchase: '采购入库',
  return: '退库入库',
  transfer: '调拨入库',
  surplus: '盘盈入库',
  other: '其他入库',
}

export default function InboundTable({
  data,
  loading,
  selectedIds,
  onToggleSelectAll,
  onToggleSelectOne,
  isAllSelected,
  isIndeterminate,
  onClearSelection,
  onDetail,
  onEdit,
  onDelete,
  onRestore,
  onPrint,
  onBatchExport,
  onBatchPrint,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: InboundTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-blue-500" />
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-sm text-gray-500">暂无入库记录</p>
      </div>
    )
  }

  return (
    <div>
      {/* 批量操作栏 */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-blue-50 border-b border-blue-100 text-sm">
          <span className="text-blue-700">已选 {selectedIds.size} 项</span>
          <button
            onClick={onBatchExport}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            导出选中
          </button>
          <button
            onClick={onBatchPrint}
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            打印选中
          </button>
          <button
            onClick={onClearSelection}
            className="text-gray-500 hover:text-gray-700 ml-auto"
          >
            取消选择
          </button>
        </div>
      )}

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 w-10">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={el => { if (el) el.indeterminate = isIndeterminate }}
                  onChange={onToggleSelectAll}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">入库单号</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">耗材</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">数量</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">金额</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">供应商</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">入库时间</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-32">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.map(row => (
              <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(row.id)}
                    onChange={() => onToggleSelectOne(row.id)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => onDetail(row)}
                    className="font-mono text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {row.inboundNo}
                  </button>
                </td>
                <td className="px-4 py-3 text-gray-900">{row.materialName}</td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    {TYPE_LABELS[row.type] || row.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {row.quantity} {row.unit || ''}
                </td>
                <td className="px-4 py-3 text-right text-gray-900">
                  {formatCurrency(row.amount || row.price * row.quantity)}
                </td>
                <td className="px-4 py-3 text-gray-600">{row.supplierName || '-'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    row.status === 'completed'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {row.status === 'completed' ? '已完成' : '已取消'}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 text-xs">{formatDateTime(row.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => onDetail(row)}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                      title="查看详情"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    {row.status === 'completed' && (
                      <>
                        <button
                          onClick={() => onEdit(row)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          title="编辑"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onDelete(row)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                    {row.status === 'cancelled' && (
                      <button
                        onClick={() => onRestore(row)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-md transition-colors"
                        title="恢复"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => onPrint(row)}
                      className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
                      title="打印"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      <div className="px-4 py-3 border-t border-gray-100">
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
