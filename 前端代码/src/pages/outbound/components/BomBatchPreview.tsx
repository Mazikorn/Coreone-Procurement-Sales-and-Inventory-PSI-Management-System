import React from 'react'
import { formatQuantity, type BomBatchPreviewRow } from './bomBatchPreviewUtils'

interface BomBatchPreviewProps {
  rows: BomBatchPreviewRow[]
}

export function BomBatchPreview({ rows }: BomBatchPreviewProps) {
  if (rows.length === 0) return null

  return (
    <div data-testid="bom-batch-preview" className="overflow-hidden rounded-md border border-gray-200">
      <div className="px-3 py-2 bg-gray-50 text-sm font-medium text-gray-700">预计批次扣减</div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">来源</th>
              <th className="px-3 py-2 text-left font-medium">物料</th>
              <th className="px-3 py-2 text-left font-medium">应扣数量</th>
              <th className="px-3 py-2 text-left font-medium">预计批次</th>
              <th className="px-3 py-2 text-left font-medium">状态</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map(row => (
              <tr key={row.key}>
                <td className="px-3 py-2 text-gray-500">{row.source}</td>
                <td className="px-3 py-2 text-gray-900">{row.label}</td>
                <td className="px-3 py-2 text-gray-600">{formatQuantity(row.requiredQuantity)}{row.unit}</td>
                <td className="px-3 py-2 text-gray-600">
                  {row.allocations.length > 0 ? (
                    <div className="space-y-1">
                      {row.allocations.map(allocation => (
                        <div key={`${row.key}-${allocation.batchId}`}>
                          {row.showMaterialName && allocation.materialName ? `${allocation.materialName} / ` : ''}
                          {allocation.batchNo} × {formatQuantity(allocation.quantity)}{row.unit}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <span className="text-red-600">无可用批次</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {row.insufficient ? (
                    <span className="text-red-600">
                      批次库存不足：需要 {formatQuantity(row.requiredQuantity)}{row.unit}，可用 {formatQuantity(row.availableQuantity)}{row.unit}
                    </span>
                  ) : (
                    <span className="text-green-600">可出库</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
