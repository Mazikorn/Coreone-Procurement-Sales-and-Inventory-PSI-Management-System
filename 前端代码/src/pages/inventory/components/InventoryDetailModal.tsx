import React from 'react'
import { Upload } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import type { InventoryBatchTrace, InventoryItem } from '@/types'

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
  batchTrace?: InventoryBatchTrace | null
  batchTraceLoading?: boolean
}

function formatQuantity(value: number, unit?: string) {
  const rounded = Math.round(Number(value || 0) * 1_000_000) / 1_000_000
  const text = Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/0+$/, '').replace(/\.$/, '')
  return `${rounded > 0 ? '+' : ''}${text}${unit || ''}`
}

export function InventoryDetailModal({
  open,
  item,
  onClose,
  onOutbound,
  canManageInventoryActions = true,
  batchTrace = null,
  batchTraceLoading = false,
}: Props) {
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
        {item.batchId && (
          <div className="rounded-md border border-gray-200">
            <div className="border-b border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-700">批次形成与流转</div>
            {batchTraceLoading ? (
              <div className="px-4 py-6 text-sm text-gray-500">正在加载批次事实...</div>
            ) : batchTrace ? (
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <div className="text-xs text-gray-500">形成单据</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{batchTrace.batch.inboundNo || batchTrace.batch.inboundId || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">来源供应商</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{batchTrace.batch.supplierName || item.supplierName || '-'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">入库库位</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">{batchTrace.batch.locationName || '-'}</div>
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs text-gray-500">当前库位余额</div>
                  {batchTrace.locationBalances.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {batchTrace.locationBalances.map(balance => (
                        <span key={balance.locationId} className="rounded-md bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                          {balance.locationName}: {balance.remaining}{item.unit}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400">无可用库位余额</div>
                  )}
                </div>

                <div>
                  <div className="mb-2 text-xs text-gray-500">批次流转记录</div>
                  <div className="overflow-hidden rounded-md border border-gray-100">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-xs text-gray-500">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">动作</th>
                          <th className="px-3 py-2 text-left font-medium">数量</th>
                          <th className="px-3 py-2 text-left font-medium">库位</th>
                          <th className="px-3 py-2 text-left font-medium">单据</th>
                          <th className="px-3 py-2 text-left font-medium">时间</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {batchTrace.movements.map(movement => (
                          <tr key={movement.id}>
                            <td className="px-3 py-2 text-gray-900">{movement.label}</td>
                            <td className={`px-3 py-2 font-medium ${movement.quantityDelta < 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {formatQuantity(movement.quantityDelta, item.unit)}
                            </td>
                            <td className="px-3 py-2 text-gray-600">{movement.locationName || '-'}</td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-600">{movement.documentNo || movement.relatedId || '-'}</td>
                            <td className="px-3 py-2 text-gray-500">{movement.createdAt || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="px-4 py-6 text-sm text-gray-400">暂无批次形成记录</div>
            )}
          </div>
        )}
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
