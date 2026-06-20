import { Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { InventoryItem } from '@/types'

type InventoryRow = InventoryItem & {
  batch?: string
  expiry?: string
}

interface Props {
  open: boolean
  item: InventoryRow | null
  onClose: () => void
  onOutbound: () => void
  canManageInventoryActions?: boolean
}

export function InventoryDetailModal({ open, item, onClose, onOutbound, canManageInventoryActions = true }: Props) {
  if (!open || !item) return null

  const rows = [
    ['物料编码', item.code],
    ['物料名称', item.name],
    ['规格型号', item.spec || '-'],
    ['批次号', item.batch || '-'],
    ['当前库存', `${item.stock} ${item.unit}`],
    ['可用库存', `${item.availableStock ?? item.stock} ${item.unit}`],
    ['最低库存', `${item.minStock} ${item.unit}`],
    ['最高库存', `${item.maxStock} ${item.unit}`],
    ['库位', item.locationName || item.locationId || '-'],
    ['供应商', item.supplierName || item.supplierId || '-'],
    ['有效期', item.expiry || '-'],
    ['最近入库', item.lastInbound || '-'],
    ['最近出库', item.lastOutbound || '-'],
  ]

  return (
    <Modal title="库存详情" onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          {rows.map(([label, value]) => (
            <div key={label} className="border-b border-gray-100 pb-2">
              <div className="text-xs text-gray-500">{label}</div>
              <div className="mt-1 text-sm font-medium text-gray-900">{value}</div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4">
          <button type="button" onClick={onClose} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            关闭
          </button>
          {canManageInventoryActions && (
            <button type="button" onClick={onOutbound} className="inline-flex items-center gap-1.5 rounded-md bg-blue-500 px-4 py-2 text-sm font-medium text-white hover:bg-blue-600">
              <Upload className="h-4 w-4" />
              出库
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
