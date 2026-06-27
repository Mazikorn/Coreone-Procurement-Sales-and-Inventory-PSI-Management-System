import { useNavigate } from 'react-router-dom'
import {
  Package, AlertTriangle, ArrowDownToLine, ArrowUpFromLine,
  ClipboardCheck, BarChart3, Clock, FlaskConical, ShoppingCart,
  Activity, TrendingUp, Wallet,
} from 'lucide-react'
import { useDashboardPage } from './dashboard/hooks/useDashboardPage'
import { StatCard } from './dashboard/components/StatCard'
import { QuickAction } from './dashboard/components/QuickAction'
import { ActivityItem } from './dashboard/components/ActivityItem'
import { SimpleBarChart } from './dashboard/components/SimpleBarChart'
import { AlertPanel } from './dashboard/components/AlertPanel'
import { CategoryDistribution } from './dashboard/components/CategoryDistribution'
import { canAccess, canSeeCost } from '@/lib/permissions'

const yuan = (n: number) => `¥${(n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`

export default function Dashboard() {
  const navigate = useNavigate()
  const page = useDashboardPage()

  // 能力驱动：每张卡片/操作/板块按当前用户权限显隐（数据驱动 RBAC，多角色按并集，
  // 自然产出按角色差异化的仪表盘——病理极简无成本、技术员库存+对账、采购采购单、财务成本、主任全局）。
  const showInventory = canAccess('inventory', 'R')
  const showCost = canSeeCost()

  if (page.loading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-200 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  // ---- KPI 卡片（按能力过滤）----
  const kpiCards = [
    showInventory && {
      key: 'inventory', title: '库存物料', value: page.stats?.totalMaterials || 0,
      icon: Package, colorClass: 'text-blue-500', bgClass: 'bg-blue-50',
      subtitle: '库存物料种类', onClick: () => navigate('/inventory'),
    },
    canAccess('projects', 'R') && {
      key: 'projects', title: '检测项目数', value: page.projectCount ?? 0,
      icon: FlaskConical, colorClass: 'text-purple-500', bgClass: 'bg-purple-50',
      subtitle: '在用检测项目', onClick: () => navigate('/projects'),
    },
    canAccess('inbound', 'R') && {
      key: 'inbound', title: '本月入库', value: page.stats?.monthlyInbound || 0,
      icon: ArrowDownToLine, colorClass: 'text-green-500', bgClass: 'bg-green-50',
      subtitle: '本月累计入库', onClick: () => navigate('/inbound'),
    },
    canAccess('outbound', 'R') && {
      key: 'outbound', title: '本月出库', value: page.stats?.monthlyOutbound || 0,
      icon: ArrowUpFromLine, colorClass: 'text-blue-500', bgClass: 'bg-blue-50',
      subtitle: '本月领用消耗', onClick: () => navigate('/outbound'),
    },
    canAccess('purchase_orders', 'R') && {
      key: 'po', title: '采购订单数', value: page.poCount ?? 0,
      icon: ShoppingCart, colorClass: 'text-indigo-500', bgClass: 'bg-indigo-50',
      subtitle: '采购订单总数', onClick: () => navigate('/purchase-orders'),
    },
    showCost && {
      key: 'cost', title: '本月成本', value: yuan(page.costSummary?.totalCost || 0),
      icon: Wallet, colorClass: 'text-rose-500', bgClass: 'bg-rose-50',
      subtitle: '本月 ABC 核算成本', onClick: () => navigate('/abc/dashboard'),
    },
    showCost && {
      key: 'profit', title: '利润率', value: `${page.costSummary?.profitRate ?? 0}%`,
      icon: TrendingUp, colorClass: 'text-emerald-500', bgClass: 'bg-emerald-50',
      subtitle: `利润 ${yuan(page.costSummary?.totalProfit || 0)}`, onClick: () => navigate('/abc/profitability'),
    },
    canAccess('alerts', 'R') && {
      key: 'alerts', title: '预警数量', value: page.stats?.alertCount || 0,
      icon: AlertTriangle, colorClass: 'text-orange-500', bgClass: 'bg-orange-50',
      subtitle: '需关注处理', onClick: () => navigate('/alerts'),
    },
  ].filter(Boolean) as Array<{ key: string; title: string; value: string | number; icon: React.ElementType; colorClass: string; bgClass: string; subtitle: string; onClick: () => void }>

  // ---- 快捷操作（按写权限/能力过滤）----
  const quickActions = [
    canAccess('inbound', 'W') && { key: 'inbound', label: '入库登记', desc: '录入新到耗材批次', icon: ArrowDownToLine, colorClass: 'text-green-500', bgClass: 'bg-green-50', onClick: () => navigate('/inbound') },
    canAccess('outbound', 'W') && { key: 'outbound', label: '出库领用', desc: '记录耗材消耗', icon: ArrowUpFromLine, colorClass: 'text-blue-500', bgClass: 'bg-blue-50', onClick: () => navigate('/outbound') },
    canAccess('stocktaking', 'W') && { key: 'stocktaking', label: '库存盘点', desc: '核对实际库存', icon: ClipboardCheck, colorClass: 'text-purple-500', bgClass: 'bg-purple-50', onClick: () => navigate('/stocktaking') },
    canAccess('reconciliation', 'R') && { key: 'reconciliation', label: '消耗对账', desc: '实际消耗 vs 标准', icon: Activity, colorClass: 'text-cyan-500', bgClass: 'bg-cyan-50', onClick: () => navigate('/reconciliation') },
    canAccess('purchase_orders', 'W') && { key: 'po', label: '采购订单', desc: '创建/跟进采购', icon: ShoppingCart, colorClass: 'text-indigo-500', bgClass: 'bg-indigo-50', onClick: () => navigate('/purchase-orders') },
    canAccess('projects', 'R') && { key: 'projects', label: '检测项目', desc: '查看/维护项目', icon: FlaskConical, colorClass: 'text-fuchsia-500', bgClass: 'bg-fuchsia-50', onClick: () => navigate('/projects') },
    showCost && { key: 'cost', label: '成本看板', desc: '查看 ABC 成本', icon: BarChart3, colorClass: 'text-rose-500', bgClass: 'bg-rose-50', onClick: () => navigate('/abc/dashboard') },
  ].filter(Boolean) as Array<{ key: string; label: string; desc: string; icon: React.ElementType; colorClass: string; bgClass: string; onClick: () => void }>

  const showConsumeTrend = canAccess('outbound', 'R')
  const showActivity = canAccess('inbound', 'R') || canAccess('outbound', 'R')

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-semibold text-gray-900 tracking-tight leading-tight">仪表盘</h1>
          <p className="text-sm text-gray-500 mt-1.5">
            {page.today} · 欢迎使用 COREONE 实验室耗材管理系统
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      {kpiCards.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpiCards.map(c => (
            <StatCard key={c.key} title={c.title} value={c.value} icon={c.icon} colorClass={c.colorClass} bgClass={c.bgClass} subtitle={c.subtitle} onClick={c.onClick} />
          ))}
        </div>
      )}

      {/* Quick Actions */}
      {quickActions.length > 0 && (
        <div>
          <h2 className="text-base font-semibold text-gray-900 mb-4">快捷操作</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map(a => (
              <QuickAction key={a.key} label={a.label} desc={a.desc} icon={a.icon} colorClass={a.colorClass} bgClass={a.bgClass} onClick={a.onClick} />
            ))}
          </div>
        </div>
      )}

      {/* Charts + Activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {showInventory && (
          <div className="lg:col-span-2">
            <SimpleBarChart title="库存趋势（近6个月）" data={page.stockTrend} color="#3b82f6" />
          </div>
        )}

        {showActivity && (
          <div className={`bg-white rounded-lg p-5 border border-gray-200 shadow-sm ${showInventory ? '' : 'lg:col-span-3'}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-gray-900">最近活动</h3>
              {canAccess('logs', 'R') && (
                <button onClick={() => navigate('/logs')} className="text-xs text-blue-500 hover:text-blue-600 font-medium transition-colors">查看全部</button>
              )}
            </div>
            {page.activities.length > 0 ? (
              <div className="divide-y divide-gray-100">
                {page.activities.map(item => (<ActivityItem key={item.id} item={item} />))}
              </div>
            ) : (
              <div className="py-8 text-center">
                <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">暂无最近活动</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Row（按能力显隐；病理/财务等无库存管理则隐藏，避免空板块） */}
      {showInventory && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {showConsumeTrend && (
            <div className="lg:col-span-1">
              <SimpleBarChart title="消耗趋势（近6个月）" data={page.consumeTrend} color="#22c55e" />
            </div>
          )}
          <CategoryDistribution stats={page.stats} />
          <AlertPanel stats={page.stats} onViewAll={() => navigate('/alerts')} />
        </div>
      )}
    </div>
  )
}
