import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'

interface EquipmentData {
  id: string
  name: string
  typeName: string
  totalCapacity: number
  usedCapacity: number
  utilizationRate: number
  totalCost: number
  costPerUse: number
}

export default function EquipmentEfficiency() {
  const [data, setData] = useState<EquipmentData[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState('')

  useEffect(() => {
    setTimeout(() => { setData([]); setLoading(false) }, 300)
  }, [])

  const filtered = keyword
    ? data.filter(d => d.name.includes(keyword) || d.typeName.includes(keyword))
    : data

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">设备效率分析</h1>
          <p className="text-sm text-gray-500 mt-1">分析设备利用率和成本效率</p>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-200">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索设备..."
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">设备名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">类型</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">总产能</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">已用产能</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">利用率</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">总成本</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">单次成本</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">加载中...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-gray-400">暂无设备效率数据</td></tr>
              ) : filtered.map(row => (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                  <td className="px-4 py-3 text-gray-600">{row.typeName}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{row.totalCapacity}</td>
                  <td className="px-4 py-3 text-right text-gray-600">{row.usedCapacity}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-medium ${row.utilizationRate >= 0.8 ? 'text-green-600' : row.utilizationRate >= 0.5 ? 'text-yellow-600' : 'text-red-600'}`}>
                      {(row.utilizationRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-900">¥{row.totalCost.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-3 text-right text-gray-600">¥{row.costPerUse.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
