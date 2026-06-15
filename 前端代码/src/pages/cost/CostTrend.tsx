import { useState, useEffect, useMemo } from 'react'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { abcApi } from '@/api/abc'
import { reportsApi } from '@/api/reports'
import { formatCurrency } from '@/lib/utils'

interface TrendItem {
  month: string
  bomId: string
  bomName: string
  projectType: string
  costPerSlide: number
  materialCost: number
  activityCost: number
  feeAmount: number
  marginRate: number
}

interface ReportsTrendItem {
  period: string
  cost: number
  recordCount: number
  isComplete?: boolean
}

const PROJECT_TYPE_OPTIONS = [
  { value: 'all', label: '全部类型' },
  { value: 'ihc', label: '免疫组化' },
  { value: 'he', label: 'HE染色' },
  { value: 'ss', label: '特殊染色' },
  { value: 'mp', label: '分子病理' },
  { value: 'cyto', label: '细胞病理' },
]

const MONTHS_OPTIONS = [
  { value: 6, label: '近 6 个月' },
  { value: 12, label: '近 12 个月' },
  { value: 24, label: '近 24 个月' },
]

const LINE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4']

export default function CostTrend() {
  const [loading, setLoading] = useState(true)
  const [trend, setTrend] = useState<TrendItem[]>([])
  const [projectType, setProjectType] = useState('all')
  const [months, setMonths] = useState(12)
  const [dimension, setDimension] = useState<'monthly' | 'quarterly'>('monthly')
  const [quarterlyData, setQuarterlyData] = useState<ReportsTrendItem[]>([])

  useEffect(() => {
    loadData()
  }, [projectType, months])

  useEffect(() => {
    if (dimension === 'quarterly') {
      loadQuarterlyData()
    }
  }, [dimension])

  const loadData = async () => {
    try {
      setLoading(true)
      const params: Record<string, string | number> = { months }
      if (projectType !== 'all') params.projectType = projectType
      const res = await abcApi.getSlideCostTrend(params)
      setTrend(res?.trend || [])
    } catch {
      toast.error('加载趋势数据失败')
    } finally {
      setLoading(false)
    }
  }

  const loadQuarterlyData = async () => {
    try {
      const res = await reportsApi.getCostTrend({ dimension: 'quarterly' })
      setQuarterlyData(res?.trend || [])
    } catch {
      toast.error('加载季度数据失败')
    }
  }

  // 按 BOM 分组，每组按月排序
  const bomGroups = useMemo(() => {
    const groups = new Map<string, TrendItem[]>()
    for (const item of trend) {
      const key = item.bomId || item.bomName
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    for (const [, items] of groups) {
      items.sort((a, b) => a.month.localeCompare(b.month))
    }
    return groups
  }, [trend])

  // 获取所有月份（去重排序）
  const allMonths = useMemo(() => {
    const monthsSet = new Set(trend.map(t => t.month))
    return [...monthsSet].sort()
  }, [trend])

  // 切片成本趋势数据（按月聚合，每个 BOM 一条线）
  const costTrendData = useMemo(() => {
    return allMonths.map(month => {
      const row: Record<string, string | number> = { month }
      for (const [bomKey, items] of bomGroups) {
        const found = items.find(i => i.month === month)
        row[bomKey] = found?.costPerSlide || 0
      }
      return row
    })
  }, [allMonths, bomGroups])

  // 利润率趋势数据（按月聚合，取所有 BOM 的平均利润率）
  const marginTrendData = useMemo(() => {
    return allMonths.map(month => {
      const itemsForMonth = trend.filter(t => t.month === month)
      const avgMargin = itemsForMonth.length > 0
        ? itemsForMonth.reduce((s, t) => s + t.marginRate, 0) / itemsForMonth.length
        : 0
      return {
        month,
        marginRate: Math.round(avgMargin * 10000) / 100,
      }
    })
  }, [allMonths, trend])

  // 季度成本数据
  const quarterlyChartData = useMemo(() => {
    return quarterlyData.map(item => ({
      period: item.period,
      cost: item.cost,
      recordCount: item.recordCount,
      isComplete: item.isComplete,
    }))
  }, [quarterlyData])

  const bomKeys = useMemo(() => [...bomGroups.keys()], [bomGroups])

  return (
    <div className="p-6 space-y-6">
      {/* 页面头部 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">成本趋势</h1>
          <p className="text-sm text-gray-500 mt-1">切片成本与利润率的时间序列分析</p>
        </div>
        <button data-testid="export-btn" className="h-10 px-4 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2 self-start">
          <Download className="h-4 w-4" /> 导出
        </button>
      </div>

      {/* 筛选栏 */}
      <div data-testid="filter-bar" className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex flex-wrap gap-4">
          {/* 月度/季度切换 */}
          <div data-testid="period-toggle" className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setDimension('monthly')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                dimension === 'monthly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              月度
            </button>
            <button
              onClick={() => setDimension('quarterly')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                dimension === 'quarterly' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              季度
            </button>
          </div>
          <select
            value={projectType}
            onChange={e => setProjectType(e.target.value)}
            className="h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          >
            {PROJECT_TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          {dimension === 'monthly' && (
            <select
              value={months}
              onChange={e => setMonths(Number(e.target.value))}
              className="h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
            >
              {MONTHS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* 月度视图 */}
      {dimension === 'monthly' && (
        <>
          {/* 切片成本趋势折线图 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">切片成本趋势</h3>
            {loading ? (
              <div className="h-80 flex items-center justify-center text-gray-400">加载中...</div>
            ) : costTrendData.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-gray-400">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={costTrendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={false}
                    tickFormatter={(v) => `¥${v}`}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [formatCurrency(value), name]}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Legend
                    formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
                  />
                  {bomKeys.map((key, index) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={LINE_COLORS[index % LINE_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 利润率趋势柱状图 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">利润率趋势</h3>
            {loading ? (
              <div className="h-64 flex items-center justify-center text-gray-400">加载中...</div>
            ) : marginTrendData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-gray-400">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={marginTrendData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={false}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value}%`, '平均利润率']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Bar
                    dataKey="marginRate"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    name="平均利润率"
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}

      {/* 季度视图 */}
      {dimension === 'quarterly' && (
        <>
          {/* 季度成本柱状图 */}
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">季度成本趋势</h3>
            {quarterlyChartData.length === 0 ? (
              <div className="h-80 flex items-center justify-center text-gray-400">暂无季度数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={quarterlyChartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis
                    dataKey="period"
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: '#6b7280' }}
                    tickLine={false}
                    tickFormatter={(v) => `¥${(v / 10000).toFixed(0)}万`}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      const label = name === 'cost' ? '总成本' : '出库记录数'
                      return [name === 'cost' ? formatCurrency(value) : `${value} 条`, label]
                    }}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Legend formatter={v => v === 'cost' ? '总成本' : '出库记录数'} />
                  <Bar
                    dataKey="cost"
                    fill="#3b82f6"
                    radius={[4, 4, 0, 0]}
                    name="cost"
                  />
                  <Bar
                    dataKey="recordCount"
                    fill="#10b981"
                    radius={[4, 4, 0, 0]}
                    name="recordCount"
                    opacity={0.6}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* 季度明细表格 */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">季度明细</h3>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">季度</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">总成本</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">出库记录数</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">数据状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {quarterlyChartData.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-gray-400">暂无数据</td>
                  </tr>
                ) : (
                  quarterlyChartData.map(item => (
                    <tr key={item.period} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.period}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono">{formatCurrency(item.cost)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right font-mono">{item.recordCount}</td>
                      <td className="px-4 py-3">
                        {item.isComplete === false ? (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                            进行中
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                            完整
                          </span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
