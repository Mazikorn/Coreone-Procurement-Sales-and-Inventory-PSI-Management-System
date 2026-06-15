import { useRef } from 'react'
import { Printer, Download } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { InboundRecord } from '@/types'
import { formatDateTime, formatCurrency } from '@/lib/utils'

interface InboundPrintModalProps {
  open: boolean
  data: InboundRecord[]
  selectedRecord: InboundRecord | null
  onClose: () => void
}

export default function InboundPrintModal({
  open,
  data,
  selectedRecord,
  onClose,
}: InboundPrintModalProps) {
  const printRef = useRef<HTMLDivElement>(null)

  if (!open) return null

  const printData = selectedRecord ? [selectedRecord] : data

  const handlePrint = () => {
    const content = printRef.current
    if (!content) return
    const printWindow = window.open('', '_blank', 'width=800,height=600')
    if (!printWindow) return
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>入库记录</title>
        <style>
          body { font-family: "Microsoft YaHei", sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; }
          th, td { border: 1px solid #e5e7eb; padding: 6px 8px; text-align: left; }
          th { background: #f9fafb; font-weight: 600; }
          h3 { font-size: 16px; margin-bottom: 12px; }
          .meta { font-size: 12px; color: #6b7280; margin-bottom: 16px; }
        </style>
      </head>
      <body>
        <h3>入库记录打印</h3>
        <div class="meta">打印时间：${new Date().toLocaleString('zh-CN')}</div>
        ${content.innerHTML}
      </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print(); printWindow.close() }, 300)
  }

  const handleExport = async () => {
    try {
      const XLSX = await import('xlsx')
      const rows = printData.map(row => ({
        入库单号: row.inboundNo,
        耗材名称: row.materialName,
        批号: row.batchNo || '-',
        数量: row.quantity,
        单价: row.price,
        金额: row.amount || row.price * row.quantity,
        供应商: row.supplierName || '-',
        库位: row.locationName || '-',
        入库时间: formatDateTime(row.createdAt),
        备注: row.remark || '-',
      }))
      const ws = XLSX.utils.json_to_sheet(rows)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '入库记录')
      XLSX.writeFile(wb, `入库记录_${new Date().toISOString().slice(0, 10)}.xlsx`)
    } catch {
      // export failed silently
    }
  }

  return (
    <Modal onClose={onClose} title="打印入库记录" size="xl">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {selectedRecord ? `单条记录：${selectedRecord.inboundNo}` : `共 ${printData.length} 条记录`}
          </span>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
            >
              <Download className="w-3.5 h-3.5" /> 导出 Excel
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-white bg-blue-500 rounded-md hover:bg-blue-600 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> 打印
            </button>
          </div>
        </div>

        <div
          ref={printRef}
          className="border border-gray-200 rounded-lg overflow-auto max-h-[60vh]"
        >
          <table className="w-full text-xs">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-500">入库单号</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">耗材</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">批号</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500">数量</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500">单价</th>
                <th className="px-3 py-2 text-right font-medium text-gray-500">金额</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">供应商</th>
                <th className="px-3 py-2 text-left font-medium text-gray-500">入库时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {printData.map(row => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-900">{row.inboundNo}</td>
                  <td className="px-3 py-2 text-gray-900">{row.materialName}</td>
                  <td className="px-3 py-2 font-mono text-gray-600">{row.batchNo || '-'}</td>
                  <td className="px-3 py-2 text-right text-gray-900">{row.quantity} {row.unit || ''}</td>
                  <td className="px-3 py-2 text-right text-gray-600">{formatCurrency(row.price)}</td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900">
                    {formatCurrency(row.amount || row.price * row.quantity)}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{row.supplierName || '-'}</td>
                  <td className="px-3 py-2 text-gray-600">{formatDateTime(row.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 底部按钮 */}
      <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
        <button
          onClick={onClose}
          className="h-10 px-4 text-sm text-gray-600 bg-white border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          关闭
        </button>
      </div>
    </Modal>
  )
}
