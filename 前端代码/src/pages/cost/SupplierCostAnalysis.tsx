import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'

interface SupplierCost {
  id: string
  name: string
  totalAmount: number
  orderCount: number
  avgPrice: number
  topMaterial: string
}

export default function SupplierCostAnalysis() {
  const [data, setData] = useState<SupplierCost[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    setTimeout(() => { setData([]); setLoading(false) }, 300)
  }, [])

  const filtered = keyword
    ? data.filter(d => d.name.includes(keyword))
    : data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">供应商成本分析</h1>
          <p className="text-sm text-gray-500 mt-1">分析各供应商采购成本分布</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索供应商..."
              value={keyword}
              onChange={e => setKeyword(e.target.value)}
              className="w-full h-10 pl-9 pr-3 border border-gray-300 rounded-md text-sm outline-none focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">供应商</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">采购总额</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">订单数</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">平均单价</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">主要物料</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">加载中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">暂无供应商成本数据</td></tr>
              ) : filtered.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                  <td className="px-4 py-3 text-right text-gray-900">¥{row.totalAmount.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{row.orderCount}</td>
                  <td className="px-4 py-3 text-right text-gray-600">¥{row.avgPrice.toFixed(2)}</td>
                  <td className="px-4 py-3 text-gray-600">{row.topMaterial || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
