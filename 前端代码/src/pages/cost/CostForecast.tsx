import { useState, useEffect } from 'react'
import { TrendingUp } from 'lucide-react'

export default function CostForecast() {
  const [period, setPeriod] = useState('quarter')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setTimeout(() => setLoading(false), 300)
  }, [])

  if (loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="h-64 bg-gray-200 rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 leading-tight">成本预测</h1>
          <p className="text-sm text-gray-500 mt-1">基于历史数据预测未来成本趋势</p>
        </div>
        <select
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
        >
          <option value="month">本月</option>
          <option value="quarter">本季度</option>
          <option value="year">本年度</option>
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-8 text-center">
        <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500">成本预测功能需要更多历史数据支撑</p>
        <p className="text-xs text-gray-400 mt-1">当系统积累足够的业务数据后，将自动生成预测分析</p>
      </div>
    </div>
  )
}
