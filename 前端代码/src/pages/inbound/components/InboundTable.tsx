import { Edit2, Eye, Printer, RotateCcw, Trash2 } from 'lucide-react'
import { Pagination } from '@/components/ui/Pagination'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { InboundRecord } from '@/types'
import type { ReactNode } from 'react'

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
  return (
    <div>
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between border-b border-blue-100 bg-blue-50 px-5 py-3">
          <span className="text-sm text-blue-700">已选择 {selectedIds.size} 条记录</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onBatchExport} className="rounded-md bg-white px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100">
              导出所选
            </button>
            <button type="button" onClick={onBatchPrint} className="rounded-md bg-white px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100">
              打印所选
            </button>
            <button type="button" onClick={onClearSelection} className="rounded-md px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-100">
              清空
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  ref={input => {
                    if (input) input.indeterminate = isIndeterminate
                  }}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300"
                  aria-label="选择全部入库记录"
                />
              </th>
              <Th>入库单号</Th>
              <Th>耗材</Th>
              <Th>批号</Th>
              <Th>类型</Th>
              <Th>数量</Th>
              <Th>金额</Th>
              <Th>供应商</Th>
              <Th>状态</Th>
              <Th>入库时间</Th>
              <Th>操作</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-gray-400">加载中...</td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-10 text-center text-gray-400">暂无入库记录</td>
              </tr>
            ) : (
              data.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => onToggleSelectOne(row.id)}
                      className="h-4 w-4 rounded border-gray-300"
                      aria-label={`选择入库记录 ${row.inboundNo}`}
                    />
                  </td>
                  <Td mono>{row.inboundNo}</Td>
                  <Td>{row.materialName}</Td>
                  <Td>{row.batchNo || '-'}</Td>
                  <Td>{getTypeLabel(row.type)}</Td>
                  <Td>{row.quantity} {row.unit}</Td>
                  <Td>{formatCurrency(row.amount || row.price * row.quantity)}</Td>
                  <Td>{row.supplierName || '-'}</Td>
                  <Td>
                    <span className={row.status === 'completed' ? 'rounded-full bg-green-50 px-2 py-1 text-xs text-green-700' : 'rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600'}>
                      {row.status === 'completed' ? '已完成' : '已取消'}
                    </span>
                  </Td>
                  <Td>{formatDateTime(row.createdAt)}</Td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <IconButton label="查看" onClick={() => onDetail(row)}><Eye className="h-4 w-4" /></IconButton>
                      {row.status === 'completed' && (
                        <>
                          <IconButton label="编辑" onClick={() => onEdit(row)}><Edit2 className="h-4 w-4" /></IconButton>
                          <IconButton label="取消" onClick={() => onDelete(row)} danger><Trash2 className="h-4 w-4" /></IconButton>
                        </>
                      )}
                      {row.status === 'cancelled' && (
                        <IconButton label="恢复" onClick={() => onRestore(row)}><RotateCcw className="h-4 w-4" /></IconButton>
                      )}
                      <IconButton label="打印" onClick={() => onPrint(row)}><Printer className="h-4 w-4" /></IconButton>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4">
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

function Th({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">{children}</th>
}

function Td({ children, mono = false }: { children: ReactNode; mono?: boolean }) {
  return <td className={`px-4 py-3 text-gray-700 ${mono ? 'font-mono' : ''}`}>{children}</td>
}

function IconButton({
  label,
  onClick,
  children,
  danger = false,
}: {
  label: string
  onClick: () => void
  children: ReactNode
  danger?: boolean
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${
        danger ? 'text-red-500 hover:bg-red-50' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    direct: '直接入库',
    purchase: '采购入库',
    return: '退库入库',
    transfer: '调拨入库',
    surplus: '盘盈入库',
    other: '其他入库',
  }
  return map[type] || type
}
