import type { OutboundType } from '@/types'

export const OUTBOUND_TYPE_LABELS: Record<OutboundType, string> = {
  project: '项目出库',
  transfer: '调拨出库',
  scrap: '报废出库',
  bom: 'BOM出库',
}

export function getOutboundTypeLabel(type?: string | null) {
  if (!type) return '-'
  return OUTBOUND_TYPE_LABELS[type as OutboundType] || type
}
