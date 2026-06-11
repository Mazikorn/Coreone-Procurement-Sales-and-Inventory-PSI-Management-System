import { useState, useEffect, useMemo } from 'react'
import { Download, TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { toast } from 'sonner'
import { abcApi } from '@/api/abc'
import { reportsApi } from '@/api/reports'
import { formatCurrency } from '@/lib/utils'
import { ProfitBadge } from '@/components/ui/ProfitBadge'

interface DashboardSummary {
  totalCost: number
  totalFee: number
  totalProfit: number
  profitRate: number
  caseCount: number
  sampleCount: number
  materialCost: number
  activityCost: number
  costChange: number
  feeChange: number
  profitChange: number
}

interface ProjectProfit {
  projectId: string
  projectName: string
  projectType: string
  caseCount: number
  sampleCount: number
  totalCost: number
  feeAmount: number
  profit: number
  profitRate: number
}

interface CostByActivity {
  activityCenterId: string
  activityCenterName: string
  activityCenterCode: string
  cost: number
  ratio: number
}

interface Alert {
  type: 'loss' | 'no_mapping'
  projectName: string
  profitRate?: number
  message: string
}

interface MonthlyComparison {
  currentMonth: {
    month: string
    totalCost: number
    sampleCount: number
    recordCount: number
    isComplete: boolean
    dataDays: number
  }
  previousMonth: {
    month: string
    totalCost: number
    sampleCount: number
    recordCount: number
    isComplete: boolean
    dataDays: number
  }
  changes: {
    totalChange: number
    totalChangeRate: number
    direction: 'up' | 'down'
    note: string
  }
}

const PIE_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6',
  '#ef4444', '#06b6d4', '#f97316', '#14b8a6',
]

const PROJECT_TYPE_LABELS: Record<string, string> = {
  ihc: '免疫组化',
  he: 'HE染色',
  ss: '特殊染色',
  mp: '分子病理',
  cyto: '细胞病理',
}

export default function CostDashboard() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7))
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<DashboardSummary | null>(null)
  const [profitByProject, setProfitByProject] = useState<ProjectProfit[]>([])
  const [costByActivity, setCostByActivity] = useState<CostByActivity[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [comparison, setComparison] = useState<MonthlyComparison | null>(null)

  useEffect(() => {
    loadDashboard()
    loadComparison()
  }, [month])

  const loadDashboard = async () => {
    try {
      setLoading(true)
      const data = await abcApi.getDashboard(month)
      setSummary(data.summary)
      setProfitByProject(data.profitByProject || [])
      setCostByActivity(data.costByActivity || [])
      setAlerts(data.alerts || [])
    } catch {
      toast.error('加载看板数据失败')
    } finally {
      setLoading(false)
    }
  }

  const loadComparison = async () => {
    try {
      const data = await reportsApi.getCostMonthlyComparison()
      setComparison(data)
    } catch {
      // 月度环比加载失败不影响主看板
    }
  }

  const pieData = useMemo(() =>
    costByActivity.map(a => ({
      name: a.activityCenterName,
      value: a.cost,
    })),
    [costByActivity]
  )

  const getChangeIcon = (change: number) => {
    if (change > 0) return <TrendingUp className="h-3 w-3 text-green-500" />
    if (change < 0) return <TrendingDown className="h-3 w-3 text-red-500" />
    return <Minus className="h-3 w-3 text-gray-400" />
  }

  const getChangeText = (change: number) => {
    if (change === 0) return '持平'
    const sign = change > 0 ? '+' : ''
    return `${sign}${(change * 100).toFixed(1)}%`
  }

  if (loading && !summary) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">成本看板</h1>
            <p className="text-sm text-gray-500 mt-1">加载中...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* 页面头部 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">成本看板</h1>
          <p className="text-sm text-gray-500 mt-1">ABC 作业成本法总览</p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            className="h-10 px-3 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          />
          <button className="h-10 px-4 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors flex items-center gap-2">
            <Download className="h-4 w-4" /> 导出报表
          </button>
        </div>
      </div>

      {/* 月度环比卡片 */}
      {comparison && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">月度环比</h3>
            {comparison.changes?.note && (
              <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                {comparison.changes.note}
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* 当月 */}
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-xs text-blue-600 font-medium mb-1">
                {comparison.currentMonth?.month || '当月'}
                {!comparison.currentMonth?.isComplete && (
                  <span className="ml-1 text-blue-400">(进行中)</span>
                )}
              </div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(comparison.currentMonth?.totalCost)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {comparison.currentMonth?.sampleCount || 0} 片 / {comparison.currentMonth?.recordCount || 0} 条
              </div>
            </div>
            {/* 上月 */}
            <div className="p-3 bg-gray-50 rounded-lg">
              <div className="text-xs text-gray-500 font-medium mb-1">
                {comparison.previousMonth?.month || '上月'}
              </div>
              <div className="text-xl font-bold text-gray-900">{formatCurrency(comparison.previousMonth?.totalCost)}</div>
              <div className="text-xs text-gray-500 mt-1">
                {comparison.previousMonth?.sampleCount || 0} 片 / {comparison.previousMonth?.recordCount || 0} 条
              </div>
            </div>
            {/* 变化 */}
            <div className={`p-3 rounded-lg ${
              comparison.changes?.direction === 'up' ? 'bg-red-50' : 'bg-green-50'
            }`}>
              <div className={`text-xs font-medium mb-1 ${
                comparison.changes?.direction === 'up' ? 'text-red-600' : 'text-green-600'
              }`}>
                环比变化
              </div>
              <div className="flex items-center gap-2">
                {comparison.changes?.direction === 'up' ? (
                  <ArrowUp className="h-5 w-5 text-red-500" />
                ) : (
                  <ArrowDown className="h-5 w-5 text-green-500" />
                )}
                <span className={`text-xl font-bold ${
                  comparison.changes?.direction === 'up' ? 'text-red-600' : 'text-green-600'
                }`}>
                  {comparison.changes?.totalChangeRate?.toFixed(1) || 0}%
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-1">
                {comparison.changes?.totalChange > 0 ? '+' : ''}{formatCurrency(comparison.changes?.totalChange || 0)}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">总成本</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(summary?.totalCost)}</div>
          <div className="flex items-center gap-1 mt-1">
            {getChangeIcon(summary?.costChange || 0)}
            <span className="text-xs text-gray-400">环比 {getChangeText(summary?.costChange || 0)}</span>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">总收入</div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(summary?.totalFee)}</div>
          <div className="flex items-center gap-1 mt-1">
            {getChangeIcon(summary?.feeChange || 0)}
            <span className="text-xs text-gray-400">环比 {getChangeText(summary?.feeChange || 0)}</span>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">总利润</div>
          <div className={`text-2xl font-bold mt-1 ${(summary?.totalProfit || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(summary?.totalProfit)}
          </div>
          <div className="flex items-center gap-1 mt-1">
            {getChangeIcon(summary?.profitChange || 0)}
            <span className="text-xs text-gray-400">环比 {getChangeText(summary?.profitChange || 0)}</span>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="text-sm text-gray-500">平均利润率</div>
          <div className="mt-1">
            <ProfitBadge rate={summary?.profitRate || 0} showPercent />
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {summary?.caseCount || 0} 例 / {summary?.sampleCount || 0} 片
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 项目盈利性排名 */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">项目盈利性排名</h3>
          </div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {profitByProject.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-400 text-sm">暂无数据</div>
            ) : (
              profitByProject.map((item, index) => (
                <div key={item.projectId} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                      index < 3 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">{item.projectName}</div>
                      <div className="text-xs text-gray-400">
                        {PROJECT_TYPE_LABELS[item.projectType] || item.projectType}
                      </div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={`text-sm font-medium ${item.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(item.profit)}
                    </div>
                    <ProfitBadge rate={item.profitRate} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 成本结构饼图 */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900">成本结构</h3>
          </div>
          <div className="p-4">
            {pieData.length === 0 ? (
              <div className="py-8 text-center text-gray-400 text-sm">暂无数据</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => formatCurrency(value)}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb' }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={36}
                    formatter={(value) => <span className="text-xs text-gray-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 异常提醒 */}
      {alerts.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-900">异常提醒</h3>
            <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">{alerts.length}</span>
          </div>
          <div className="divide-y divide-gray-100">
            {alerts.map((alert, index) => (
              <div key={index} className="px-4 py-3 flex items-center gap-3">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  alert.type === 'loss' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {alert.type === 'loss' ? '亏损' : '未映射'}
                </span>
                <span className="text-sm text-gray-600">{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
