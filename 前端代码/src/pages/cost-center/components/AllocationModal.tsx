import { X } from 'lucide-react'
import type { IndirectCostCenter, IndirectCostAllocation } from '@/types'
import type { AllocationForm } from '../hooks/useCostCenterPage'

interface Props {
  open: boolean
  row: IndirectCostCenter | null
  allocationForm: AllocationForm
  allocations: IndirectCostAllocation[]
  onClose: () => void
  onChangeForm: (form: AllocationForm) => void
  onSubmit: () => void
}

export function AllocationModal({ open, row, allocationForm, allocations, onClose, onChangeForm, onSubmit }: Props) {
  if (!open || !row) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h3 className="text-lg font-semibold text-gray-900">
            月度分摊录入 — {row.name}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                年月 <span className="text-red-500">*</span>
              </label>
              <input
                type="month"
                value={allocationForm.yearMonth}
                onChange={(e) => onChangeForm({ ...allocationForm, yearMonth: e.target.value })}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                费用总额（元） <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={allocationForm.totalAmount}
                onChange={(e) => onChangeForm({ ...allocationForm, totalAmount: Number(e.target.value) })}
                className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              分摊基础值（{row.allocationBase === 'sample_count' ? '样本数' :
                row.allocationBase === 'revenue' ? '收入' :
                row.allocationBase === 'labor_hours' ? '工时' :
                row.allocationBase === 'area' ? '面积' : row.allocationBase}）
            </label>
            <input
              type="number"
              min={1}
              value={allocationForm.allocationBaseValue}
              onChange={(e) => onChangeForm({ ...allocationForm, allocationBaseValue: Number(e.target.value) })}
              className="w-full h-10 px-3 border border-gray-300 rounded-md text-sm text-gray-700 focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500 transition-colors"
            />
            <p className="text-xs text-gray-400 mt-1">
              单位分摊率 = 费用总额 / 分摊基础值
            </p>
          </div>

          {/* 历史分摊记录 */}
          {allocations.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                历史分摊记录
              </label>
              <div className="border border-gray-200 rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">年月</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">费用总额</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">基础值</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">单位分摊率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {allocations.map((a) => (
                      <tr key={a.id}>
                        <td className="px-3 py-2 text-gray-700">{a.yearMonth}</td>
                        <td className="px-3 py-2 text-gray-700">¥{a.totalAmount?.toFixed(2)}</td>
                        <td className="px-3 py-2 text-gray-700">{a.allocationBaseValue}</td>
                        <td className="px-3 py-2 text-gray-700">¥{a.allocationRate?.toFixed(4)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-md transition-colors border border-gray-200"
          >
            关闭
          </button>
          <button
            onClick={onSubmit}
            className="px-4 h-10 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 transition-colors"
          >
            录入分摊
          </button>
        </div>
      </div>
    </div>
  )
}
