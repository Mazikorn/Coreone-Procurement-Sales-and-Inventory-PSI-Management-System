import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Clock, AlertTriangle, TrendingUp, Package, ArrowDownToLine, BarChart3, ShoppingCart, ClipboardCheck, Bell } from 'lucide-react'
import { useDashboardPage, formatNumber, formatCurrency, formatPercent } from './dashboard/hooks/useDashboardPage'
import { StatCard } from './dashboard/components/StatCard'
import { QuickAction } from './dashboard/components/QuickAction'
import { ActivityItem } from './dashboard/components/ActivityItem'
import { AlertBanner } from './dashboard/components/AlertBanner'

export default function Dashboard() {
  const navigate = useNavigate()
  const page = useDashboardPage()

  if (page.loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: page.config.statCards.length || 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  const { config } = page

  // 根据 key 获取统计值（H-5: 使用 completed 字段）
  const getStatValue = (key: string): string | number => {
    switch (key) {
      case 'totalMaterials':
        return page.inventoryStats?.totalMaterials ?? 0
      case 'inboundCompleted':
        return page.inboundStats?.completed ?? 0
      case 'outboundCompleted':
        return page.outboundStats?.completed ?? 0
      case 'alertCount':
        return page.alertCount
      case 'totalCost':
        return formatCurrency(page.costSummary?.totalCost)
      case 'totalFee':
        return formatCurrency(page.costSummary?.totalFee)
      case 'totalProfit':
        return formatCurrency(page.costSummary?.totalProfit)
      case 'profitRate':
        return formatPercent(page.costSummary?.profitRate)
      case 'caseCount':
        return page.costSummary?.caseCount ?? 0
      default:
        return '—'
    }
  }

  // 动态颜色（利润为负时变红）
  const getCardColor = (card: typeof config.statCards[0]): { colorClass: string; bgClass: string } => {
    if (card.key === 'totalProfit' && page.costSummary && page.costSummary.totalProfit < 0) {
      return { colorClass: 'text-red-500', bgClass: 'bg-red-50' }
    }
    if (card.key === 'profitRate' && page.costSummary) {
      if (page.costSummary.profitRate < 0) return { colorClass: 'text-red-500', bgClass: 'bg-red-50' }
      if (page.costSummary.profitRate < 0.2) return { colorClass: 'text-yellow-500', bgClass: 'bg-yellow-50' }
    }
    if (card.key === 'alertCount' && page.alertCount > 0) {
      return { colorClass: 'text-orange-500', bgClass: 'bg-orange-50' }
    }
    return { colorClass: card.colorClass, bgClass: card.bgClass }
  }

  const roleLabel: Record<string, string> = {
    admin: '系统管理员',
    warehouse_manager: '仓库管理员',
    technician: '技术员',
    pathologist: '病理医师',
    procurement: '采购员',
    finance: '财务人员',
    manager: '管理者',
  }

  return (
    <div className="space-y-6">
      {/* 问候语 + 日期 + 角色标识 */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight leading-tight">
            {page.today.greeting}，{roleLabel[page.role || ''] || '用户'}
          </h1>
          <p className="text-sm text-gray-500 mt-1.5">
            {page.today.date} · 欢迎使用 COREONE 实验室耗材管理系统
          </p>
        </div>
      </div>

      {/* 预警横幅（有 pending 预警时显示） */}
      {config.showBanner && (
        <AlertBanner alerts={page.pendingAlerts} />
      )}

      {/* 统计卡片 + 最近活动 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 左侧：统计卡片 */}
        <div className="lg:col-span-2">
          <div className={`grid gap-4 ${
            config.statCards.length <= 3
              ? 'grid-cols-1 sm:grid-cols-3'
              : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'
          }`}>
            {config.statCards.map(card => {
              const colors = getCardColor(card)
              return (
                <StatCard
                  key={card.key}
                  title={card.title}
                  value={getStatValue(card.key)}
                  icon={card.icon}
                  colorClass={colors.colorClass}
                  bgClass={colors.bgClass}
                  subtitle={card.key === 'alertCount' && page.alertCount > 0 ? '需立即处理' : card.subtitle}
                  onClick={() => navigate(card.navigateTo)}
                />
              )
            })}
          </div>
        </div>

        {/* 右侧：最近活动 */}
        <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900">最近活动</h3>
            {config.activityLinks.length > 0 && (
              <div className="flex flex-wrap items-center justify-end gap-2">
                {config.activityLinks.map(link => (
                  <button
                    key={link.path}
                    onClick={() => navigate(link.path)}
                    className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
                  >
                    {link.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {page.activities.length > 0 ? (
            <div className="divide-y divide-gray-100">
              {page.activities.map(item => (
                <ActivityItem key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">暂无最近活动</p>
            </div>
          )}
        </div>
      </div>

      {/* 待办事项 */}
      {page.role && ['admin', 'warehouse_manager', 'procurement'].includes(page.role) && (
        <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 mb-4">待办事项</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {page.pendingAlerts.length > 0 && (
              <button
                onClick={() => navigate('/alerts?quick=pending')}
                className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors text-left"
              >
                <Bell className="w-5 h-5 text-orange-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-orange-700">{page.pendingAlerts.length} 条预警待处理</p>
                  <p className="text-xs text-orange-500 mt-0.5">进入后可处理、忽略并回看留痕</p>
                </div>
              </button>
            )}
            {page.inboundStats && page.inboundStats.pendingOrders > 0 && (
              <button
                onClick={() => navigate('/purchase-orders?status=pending,partial')}
                className="flex items-center gap-3 p-3 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors text-left"
              >
                <ShoppingCart className="w-5 h-5 text-blue-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-700">{page.inboundStats.pendingOrders} 个采购单待收货</p>
                  <p className="text-xs text-blue-500 mt-0.5">进入后可按采购单收货并生成入库单</p>
                </div>
              </button>
            )}
            {page.inventoryStats && page.inventoryStats.lowStockCount > 0 && (
              <button
                onClick={() => navigate('/inventory?quick=low-stock')}
                className="flex items-center gap-3 p-3 rounded-lg bg-red-50 hover:bg-red-100 transition-colors text-left"
              >
                <Package className="w-5 h-5 text-red-500 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-red-700">{page.inventoryStats.lowStockCount} 种物料库存不足</p>
                  <p className="text-xs text-red-500 mt-0.5">进入后可按物料补采购或发起盘点</p>
                </div>
              </button>
            )}
            {page.pendingAlerts.length === 0 &&
             (!page.inboundStats || page.inboundStats.pendingOrders === 0) &&
             (!page.inventoryStats || page.inventoryStats.lowStockCount === 0) && (
              <div className="col-span-3 flex items-center gap-3 p-3 rounded-lg bg-green-50">
                <ClipboardCheck className="w-5 h-5 text-green-500 flex-shrink-0" />
                <p className="text-sm text-green-700">所有事项已处理完毕，系统运行正常</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 快捷操作 */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-4">快捷操作</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {config.quickActions.map(action => (
            <QuickAction
              key={action.navigateTo}
              label={action.label}
              desc={action.desc}
              icon={action.icon}
              colorClass={action.colorClass}
              bgClass={action.bgClass}
              onClick={() => navigate(action.navigateTo)}
            />
          ))}
        </div>
      </div>

      {/* 角色专属区块 */}
      {config.exclusiveSection === 'cost-overview' && page.costSummary && (
        <CostOverviewSection costSummary={page.costSummary} onNavigate={navigate} />
      )}
      {config.exclusiveSection === 'low-stock-summary' && page.inventoryStats && (
        <LowStockSummarySection stats={page.inventoryStats} onNavigate={navigate} />
      )}
    </div>
  )
}

/** 成本概览区块（admin/finance） */
function CostOverviewSection({ costSummary, onNavigate }: {
  costSummary: { totalCost: number; totalFee: number; totalProfit: number; profitRate: number; caseCount: number }
  onNavigate: (path: string) => void
}) {
  return (
    <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">成本概览</h3>
        <button
          onClick={() => onNavigate('/abc/dashboard')}
          className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
        >
          查看详情
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="text-center p-3 rounded-lg bg-gray-50">
          <p className="text-xs text-gray-500 mb-1">总成本</p>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(costSummary.totalCost)}</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-gray-50">
          <p className="text-xs text-gray-500 mb-1">总收入</p>
          <p className="text-lg font-bold text-gray-900">{formatCurrency(costSummary.totalFee)}</p>
        </div>
        <div className="text-center p-3 rounded-lg bg-gray-50">
          <p className="text-xs text-gray-500 mb-1">利润</p>
          <p className={`text-lg font-bold ${costSummary.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(costSummary.totalProfit)}
          </p>
        </div>
        <div className="text-center p-3 rounded-lg bg-gray-50">
          <p className="text-xs text-gray-500 mb-1">利润率</p>
          <p className={`text-lg font-bold ${costSummary.profitRate >= 0.2 ? 'text-green-600' : costSummary.profitRate >= 0 ? 'text-yellow-600' : 'text-red-600'}`}>
            {formatPercent(costSummary.profitRate)}
          </p>
        </div>
      </div>
    </div>
  )
}

/** 低库存摘要区块（warehouse_manager） */
function LowStockSummarySection({ stats, onNavigate }: {
  stats: { lowStockCount: number; expiringCount: number; expiredCount: number; outOfStockCount: number }
  onNavigate: (path: string) => void
}) {
  const total = stats.lowStockCount + stats.expiringCount + stats.expiredCount + stats.outOfStockCount
  if (total === 0) return null

  return (
    <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold text-gray-900">库存预警摘要</h3>
        <button
          onClick={() => onNavigate('/alerts?quick=pending')}
          className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors"
        >
          查看全部
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.outOfStockCount > 0 && (
          <button
            type="button"
            onClick={() => onNavigate('/inventory?quick=out-of-stock')}
            className="flex items-center gap-3 p-3 rounded-lg bg-red-50 text-left transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-200"
          >
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-lg font-bold text-red-600">{stats.outOfStockCount}</p>
              <p className="text-xs text-gray-500">已缺货</p>
            </div>
          </button>
        )}
        {stats.lowStockCount > 0 && (
          <button
            type="button"
            onClick={() => onNavigate('/inventory?quick=low-stock')}
            className="flex items-center gap-3 p-3 rounded-lg bg-orange-50 text-left transition-colors hover:bg-orange-100 focus:outline-none focus:ring-2 focus:ring-orange-200"
          >
            <Package className="w-5 h-5 text-orange-500 flex-shrink-0" />
            <div>
              <p className="text-lg font-bold text-orange-600">{stats.lowStockCount}</p>
              <p className="text-xs text-gray-500">库存不足</p>
            </div>
          </button>
        )}
        {stats.expiringCount > 0 && (
          <button
            type="button"
            onClick={() => onNavigate('/inventory?quick=expiring-month')}
            className="flex items-center gap-3 p-3 rounded-lg bg-yellow-50 text-left transition-colors hover:bg-yellow-100 focus:outline-none focus:ring-2 focus:ring-yellow-200"
          >
            <Clock className="w-5 h-5 text-yellow-500 flex-shrink-0" />
            <div>
              <p className="text-lg font-bold text-yellow-600">{stats.expiringCount}</p>
              <p className="text-xs text-gray-500">即将过期</p>
            </div>
          </button>
        )}
        {stats.expiredCount > 0 && (
          <button
            type="button"
            onClick={() => onNavigate('/inventory?quick=expired')}
            className="flex items-center gap-3 p-3 rounded-lg bg-red-50 text-left transition-colors hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-200"
          >
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div>
              <p className="text-lg font-bold text-red-600">{stats.expiredCount}</p>
              <p className="text-xs text-gray-500">已过期</p>
            </div>
          </button>
        )}
      </div>
    </div>
  )
}
