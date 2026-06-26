import type { OutboundRecord } from '@/types'
import { formatDateTime } from '@/lib/utils'
import { getOutboundTypeLabel } from './outboundLabels'

export const buildOutboundExportRows = (records: OutboundRecord[]) => records.map(row => ({
  出库单号: row.outboundNo,
  类型: getOutboundTypeLabel(row.type),
  项目: row.projectName || '-',
  物料明细: row.items?.map(i => `${i.materialName}×${i.quantity}`).join(', ') || '-',
  总金额: row.totalCost || 0,
  ABC总成本: row.abcTotalCost || 0,
  收费金额: row.feeAmount || 0,
  利润: row.profit || 0,
  操作人: row.operator || '-',
  出库时间: formatDateTime(row.createdAt),
  状态: row.status === 'completed' ? '已完成' : row.status === 'pending' ? '待出库' : '已取消',
  备注: row.remark || '-',
}))

export const exportOutboundRecordsToXlsx = async (records: OutboundRecord[]) => {
  const XLSX = await import('xlsx')
  const rows = buildOutboundExportRows(records)
  const ws = XLSX.utils.json_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '出库记录')
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  XLSX.writeFile(wb, `出库记录_${dateStr}.xlsx`)
  return rows.length
}
