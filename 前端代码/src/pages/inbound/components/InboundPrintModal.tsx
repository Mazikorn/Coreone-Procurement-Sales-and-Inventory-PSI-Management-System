import { Printer } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { formatCurrency, formatDateTime } from '@/lib/utils'
import type { InboundRecord } from '@/types'
import type { ReactNode } from 'react'

interface InboundPrintModalProps {
  open: boolean
  data: InboundRecord[]
  onClose: () => void
}

export default function InboundPrintModal({ open, data, onClose }: InboundPrintModalProps) {
  if (!open) return null

  const rows = data

  const handlePrint = () => {
    window.print()
  }

  return (
    <Modal onClose={onClose} title="打印入库记录" size="xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-500">共 {rows.length} 条记录</div>
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-500 px-4 text-sm text-white hover:bg-blue-600"
          >
            <Printer className="h-4 w-4" />
            打印
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200 print:border-0">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <Th>入库单号</Th>
                <Th>耗材</Th>
                <Th>批号</Th>
                <Th>数量</Th>
                <Th>金额</Th>
                <Th>供应商</Th>
                <Th>入库时间</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr key={row.id}>
                  <Td>{row.inboundNo}</Td>
                  <Td>{row.materialName}</Td>
                  <Td>{row.batchNo || '-'}</Td>
                  <Td>{row.quantity} {row.unit}</Td>
                  <Td>{formatCurrency(row.amount || row.price * row.quantity)}</Td>
                  <Td>{row.supplierName || '-'}</Td>
                  <Td>{formatDateTime(row.createdAt)}</Td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">暂无可打印数据</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  )
}

function Th({ children }: { children: ReactNode }) {
  return <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">{children}</th>
}

function Td({ children }: { children: ReactNode }) {
  return <td className="px-4 py-3 text-gray-700">{children}</td>
}
