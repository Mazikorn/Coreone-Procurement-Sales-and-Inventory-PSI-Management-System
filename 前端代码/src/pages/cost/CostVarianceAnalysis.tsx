import { useState, useEffect, useMemo } from 'react'
import { Search, TrendingUp, TrendingDown, Minus, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell, LineChart, Line,
} from 'recharts'
import { reportsApi } from '@/api/reports'
import { formatCurrency } from '@/lib/utils'

interface VarianceSummary {
  totalActual: number
  totalStandard: number
  totalVariance: number
  varianceRate: number
}

interface VarianceItem {
  projectId: string
  projectName: string
  materialActual: number
  materialStandard: number
  laborStandard: number
  equipmentStandard: number
  indirectStandard: number
  totalActual: number
  totalStandard: number
  totalVariance: number
  varianceRate: number
  sampleCount: number
  month?: string
}

const VARIANCE_THRESHOLD = 10 // 10% 差异阈值

const COMPARE_TYPES = [
  { value: 'project', label: '按项目' },
  { value: 'month', label: '按月份' },
  { value: 'material', label: '按物料' },
]

export default function CostVarianceAnalysis() {
  const [summary, setSummary] = useState<VarianceSummary | null>(null)
  const [items, setItems] = useState<VarianceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 5)
    return d.toISOString().slice(0, 7)
  })
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 7))
  const [compareType, setCompareType] = useState('project')
  const [searchKeyword, setSearchKeyword] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadData()
  }, [startDate, endDate, compareType])

  const loadData = async () => {
    try {
      setLoading(true)
      const data = await reportsApi.getCostVariance({
        startDate: startDate + '-01',
        endDate: endDate + '-28',
        compareType,
      })
      setSummary(data?.summary || null)
      setItems(data?.items || [])
    } catch {
      toast.error('加载差异分析数据失败')
    } finally {
      setLoading(false)
    }
  }

  const formatPercent = (value: number) => `${value.toFixed(2)}%`

  const getVarianceColor = (rate: number) => {
    if (Math.abs(rate) > VARIANCE_THRESHOLD) return 'text-red-600'
    if (rate > 0) return 'text-amber-600'
    return 'text-green-600'
  }

  const getVarianceBg = (rate: number) => {
    if (Math.abs(rate) > VARIANCE_THRESHOLD) return 'bg-red-50'
    return ''
  }

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredItems = items.filter(v => {
    if (!searchKeyword) return true
    return v.projectName?.includes(searchKeyword)
  })

  // 趋势图数据
  const trendData = useMemo(() => {
    const monthMap = new Map<string, { actual: number; standard: number }>()
    for (const item of items) {
      const m = item.month || ''
      if (!m) continue
      if (!monthMap.has(m)) monthMap.set(m, { actual: 0, standard: 0 })
      const entry = monthMap.get(m)!
      entry.actual += item.totalActual || 0
      entry.standard += item.totalStandard || 0
    }
    return [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => ({
        month,
        actual: vals.actual,
        standard: vals.standard,
        variance: vals.actual - vals.standard,
        varianceRate: vals.standard ? ((vals.actual - vals.standard) / vals.standard * 100) : 0,
      }))
  }, [items])

  const summaryCards = [
    {
      label: '标准成本',
      value: summary?.totalStandard || 0,
      icon: Minus,
      color: 'text-gray-600',
      bgColor: 'bg-gray-50',
    },
    {
      label: '实际成本',
      value: summary?.totalActual || 0,
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
    },
    {
      label: '成本差异',
      value: summary?.totalVariance || 0,
      icon: summary?.totalVariance && summary.totalVariance > 0 ? TrendingUp : TrendingDown,
      color: (summary?.totalVariance || 0) > 0 ? 'text-red-600' : 'text-green-600',
      bgColor: (summary?.totalVariance || 0) > 0 ? 'bg-red-50' : 'bg-green-50',
      isCurrency: true,
    },
    {
      label: '差异率',
      value: summary?.varianceRate || 0,
      icon: (summary?.varianceRate || 0) > 0 ? TrendingUp : TrendingDown,
      color: Math.abs(summary?.varianceRate || 0) > VARIANCE_THRESHOLD ? 'text-red-600' : 'text-green-600',
      bgColor: Math.abs(summary?.varianceRate || 0) > VARIANCE_THRESHOLD ? 'bg-red-50' : 'bg-green-50',
      isPercent: true,
    },
  ]

  return (
    <div className="p-6 space-y-6">
      {/* 页面头部 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">成本差异分析</h1>
          <p className="text-sm text-gray-500 mt-1">标准成本与实际成本对比，识别超支项目</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={compareType}
            onChange={e => setCompareType(e.target.value)}
            className="h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          >
            {COMPARE_TYPES.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <input
            type="month"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            className="h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          />
          <span className="text-gray-400">至</span>
          <input
            type="month"
            value={endDate}
            onChange={e => setEndDate(e.target.value)}
            className="h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          />
        </div>
      </div>

      {/* 差异汇总卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map(card => {
          const Icon = card.icon
          return (
            <div key={card.label} className="bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${card.bgColor}`}>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <span className="text-sm text-gray-500">{card.label}</span>
              </div>
              <div className={`text-2xl font-bold ${card.isPercent || card.isCurrency ? card.color : 'text-gray-900'}`}>
                {card.isPercent
                  ? formatPercent(card.value as number)
                  : formatCurrency(card.value as number)}
              </div>
            </div>
          )
        })}
      </div>

      {/* 阈值提示 */}
      <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
        <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
        <span className="text-sm text-amber-700">
          差异率超过 ±{VARIANCE_THRESHOLD}% 的项目已高亮显示
        </span>
      </div>

      {/* 趋势图 */}
      {trendData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">差异趋势</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* 成本对比柱状图 */}
            <div>
              <h4 className="text-xs text-gray-500 mb-2">标准 vs 实际成本</h4>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} tickFormatter={v => `¥${(v / 10000).toFixed(0)}万`} />
                  <Tooltip
                    formatter={(value: number, name: string) => [
                      formatCurrency(value),
                      name === 'standard' ? '标准成本' : '实际成本',
                    ]}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Legend formatter={v => v === 'standard' ? '标准成本' : '实际成本'} />
                  <Bar dataKey="standard" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="actual" fill="#10b981" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {/* 差异率折线图 */}
            <div>
              <h4 className="text-xs text-gray-500 mb-2">差异率趋势</h4>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip
                    formatter={(value: number) => [`${value.toFixed(2)}%`, '差异率']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="varianceRate"
                    stroke="#ef4444"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* 搜索栏 */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <input
            type="text"
            placeholder="搜索项目名称..."
            value={searchKeyword}
            onChange={e => setSearchKeyword(e.target.value)}
            className="w-full h-10 pl-10 pr-4 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          />
        </div>
      </div>

      {/* 差异明细表格 */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-8"></th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">项目名称</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">样本数</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">标准成本</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">实际成本</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">差异</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">差异率</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">加载中...</td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400">暂无差异数据</td>
              </tr>
            ) : (
              filteredItems.map(item => {
                const isOverThreshold = Math.abs(item.varianceRate) > VARIANCE_THRESHOLD
                const isExpanded = expandedRows.has(item.projectId)
                return (
                  <>
                    <tr
                      key={item.projectId}
                      className={`hover:bg-gray-50 cursor-pointer ${getVarianceBg(item.varianceRate)}`}
                      onClick={() => toggleRow(item.projectId)}
                    >
                      <td className="px-4 py-3">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">
                        <div className="flex items-center gap-2">
                          {item.projectName}
                          {isOverThreshold && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right font-mono">{item.sampleCount}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono">
                        {formatCurrency(item.totalStandard)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono">
                        {formatCurrency(item.totalActual)}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-mono font-medium ${getVarianceColor(item.varianceRate)}`}>
                        {item.totalVariance > 0 ? '+' : ''}{formatCurrency(item.totalVariance)}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-mono font-medium ${getVarianceColor(item.varianceRate)}`}>
                        {item.varianceRate > 0 ? '+' : ''}{formatPercent(item.varianceRate)}
                      </td>
                    </tr>
                    {/* 下钻明细 */}
                    {isExpanded && (
                      <tr key={`${item.projectId}-detail`} className="bg-gray-50">
                        <td colSpan={7} className="px-8 py-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                            <div>
                              <span className="text-gray-500">材料标准:</span>
                              <span className="ml-1 font-mono text-gray-700">{formatCurrency(item.materialStandard)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">人工标准:</span>
                              <span className="ml-1 font-mono text-gray-700">{formatCurrency(item.laborStandard)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">设备标准:</span>
                              <span className="ml-1 font-mono text-gray-700">{formatCurrency(item.equipmentStandard)}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">间接标准:</span>
                              <span className="ml-1 font-mono text-gray-700">{formatCurrency(item.indirectStandard)}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
