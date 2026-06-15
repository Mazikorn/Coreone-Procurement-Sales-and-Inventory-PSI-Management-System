import { Search } from 'lucide-react'
import type { FullCostReport } from '@/types'
import { formatCurrency } from '@/lib/utils'
import { Pagination } from '@/components/ui/Pagination'

interface Props {
  loading: boolean
  data: FullCostReport['projects']
  total: number
  page: number
  pageSize: number
  searchText: string
  onSearchTextChange: (v: string) => void
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
  onRowClick?: (project: FullCostReport['projects'][number]) => void
}

export function FullCostTable({
  loading,
  data,
  total,
  page,
  pageSize,
  searchText,
  onSearchTextChange,
  onPageChange,
  onPageSizeChange,
  onRowClick,
}: Props) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-200">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索项目名称..."
            className="h-10 pl-9 pr-4 text-sm border border-gray-300 rounded-md bg-white outline-none transition-all focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 w-64"
            value={searchText}
            onChange={e => onSearchTextChange(e.target.value)}
          />
        </div>
        <button
          onClick={() => onSearchTextChange('')}
          className="h-10 px-4 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
        >
          重置
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">检测项目</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">样本数</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">材料成本</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">人工成本</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">设备折旧</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">质控成本</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">间接分摊</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">全成本合计</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">单样本成本</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">加载中...</td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-gray-400">暂无数据</td>
              </tr>
            ) : (
              data.map(p => {
                const total = p.totalCost || 0
                return (
                  <tr
                    key={p.id}
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => onRowClick?.(p)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-semibold text-gray-900">{p.name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{p.type}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-600">{p.sampleCount.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-gray-900">{formatCurrency(p.materialCost)}</div>
                      {total > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {((p.materialCost / total) * 100).toFixed(1)}%
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-gray-900">{formatCurrency(p.laborCost)}</div>
                      {total > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {((p.laborCost / total) * 100).toFixed(1)}%
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-gray-900">{formatCurrency(p.equipmentCost)}</div>
                      {total > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {((p.equipmentCost / total) * 100).toFixed(1)}%
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-gray-900">{formatCurrency(p.qcCost)}</div>
                      {total > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {((p.qcCost / total) * 100).toFixed(1)}%
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="text-gray-900">{formatCurrency(p.indirectCost)}</div>
                      {total > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {((p.indirectCost / total) * 100).toFixed(1)}%
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900">{formatCurrency(p.totalCost)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-600">{formatCurrency(p.unitCost)}</td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {total > 0 && (
        <div className="px-5 py-3 border-t border-gray-200">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onChange={onPageChange}
            onPageSizeChange={onPageSizeChange}
          />
        </div>
      )}
    </div>
  )
}
