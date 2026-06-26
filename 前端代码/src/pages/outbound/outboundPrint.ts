import type { OutboundRecord } from '@/types'

export const escapeHtml = (str: string) => str
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;')

export const buildOutboundPrintDocument = (records: OutboundRecord[]) => {
  const pages = records.map(record => {
    const items = record.items?.map(i => `
        <tr>
          <td>${escapeHtml(i.materialName || '')}</td>
          <td>${escapeHtml(i.batchNo || '-')}</td>
          <td>${i.quantity} ${escapeHtml(i.unit || '')}</td>
          <td>${i.unitCost || 0}</td>
          <td>${i.totalCost || 0}</td>
        </tr>
      `).join('') || ''

    return `
        <section class="print-page">
          <h2>出库单</h2>
          <div class="meta">单号：${escapeHtml(record.outboundNo)} | 项目：${escapeHtml(record.projectName || '-')} | 时间：${new Date(record.createdAt).toLocaleString()}</div>
          <table><thead><tr><th>物料</th><th>批号</th><th>数量</th><th>单价</th><th>金额</th></tr></thead>
          <tbody>${items}</tbody>
          </table>
          <div class="footer">操作人：${escapeHtml(record.operator || '-')} | 备注：${escapeHtml(record.remark || '无')}</div>
          <div class="footer">本单据由 COREONE 系统自动生成</div>
        </section>
      `
  }).join('')

  return `
      <html><head><title>出库单打印</title><style>
        body { font-family: sans-serif; padding: 40px; }
        h2 { text-align: center; margin-bottom: 8px; }
        .meta { text-align: center; color: #666; font-size: 12px; margin-bottom: 24px; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
        th { background: #f5f5f5; }
        .footer { margin-top: 24px; font-size: 12px; color: #999; text-align: center; }
        .print-page { page-break-after: always; }
        .print-page:last-child { page-break-after: auto; }
      </style></head><body>${pages}</body></html>
    `
}
