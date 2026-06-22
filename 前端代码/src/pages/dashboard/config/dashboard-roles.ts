import type { ElementType } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  BarChart3,
  ClipboardList,
  Bell,
  Package,
  PackageSearch,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react'

type ApiCall = 'inventory' | 'alerts' | 'inbound-stats' | 'outbound-stats' | 'abc-dashboard'

export interface DashboardCardConfig {
  key: string
  title: string
  subtitle?: string
  icon: ElementType
  colorClass: string
  bgClass: string
  navigateTo: string
}

export interface DashboardQuickAction {
  label: string
  desc?: string
  icon: ElementType
  colorClass: string
  bgClass: string
  navigateTo: string
}

export interface DashboardRoleConfig {
  apiCalls: ApiCall[]
  statCards: DashboardCardConfig[]
  quickActions: DashboardQuickAction[]
  showBanner: boolean
  exclusiveSection?: 'cost-overview' | 'low-stock-summary'
}

const inventoryCard: DashboardCardConfig = {
  key: 'totalMaterials',
  title: '物料总数',
  subtitle: '基础物料档案',
  icon: Package,
  colorClass: 'text-blue-500',
  bgClass: 'bg-blue-50',
  navigateTo: '/materials',
}

const inboundCard: DashboardCardConfig = {
  key: 'inboundCompleted',
  title: '已入库',
  subtitle: '入库记录',
  icon: ArrowDownToLine,
  colorClass: 'text-green-500',
  bgClass: 'bg-green-50',
  navigateTo: '/inbound',
}

const outboundCard: DashboardCardConfig = {
  key: 'outboundCompleted',
  title: '已出库',
  subtitle: '出库记录',
  icon: PackageSearch,
  colorClass: 'text-purple-500',
  bgClass: 'bg-purple-50',
  navigateTo: '/outbound',
}

const alertCard: DashboardCardConfig = {
  key: 'alertCount',
  title: '库存预警',
  subtitle: '待处理事项',
  icon: AlertTriangle,
  colorClass: 'text-orange-500',
  bgClass: 'bg-orange-50',
  navigateTo: '/alerts',
}

const costCards: DashboardCardConfig[] = [
  {
    key: 'totalCost',
    title: '总成本',
    icon: BarChart3,
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-50',
    navigateTo: '/abc/dashboard',
  },
  {
    key: 'totalFee',
    title: '总收入',
    icon: TrendingUp,
    colorClass: 'text-green-500',
    bgClass: 'bg-green-50',
    navigateTo: '/abc/dashboard',
  },
  {
    key: 'totalProfit',
    title: '总利润',
    icon: TrendingUp,
    colorClass: 'text-green-500',
    bgClass: 'bg-green-50',
    navigateTo: '/abc/dashboard',
  },
  {
    key: 'profitRate',
    title: '利润率',
    icon: BarChart3,
    colorClass: 'text-indigo-500',
    bgClass: 'bg-indigo-50',
    navigateTo: '/abc/dashboard',
  },
]

const baseQuickActions: DashboardQuickAction[] = [
  {
    label: '新增入库',
    desc: '登记耗材入库',
    icon: ArrowDownToLine,
    colorClass: 'text-green-500',
    bgClass: 'bg-green-50',
    navigateTo: '/inbound',
  },
  {
    label: '项目出库',
    desc: '记录项目领用',
    icon: PackageSearch,
    colorClass: 'text-purple-500',
    bgClass: 'bg-purple-50',
    navigateTo: '/outbound',
  },
  {
    label: '采购订单',
    desc: '查看采购进度',
    icon: ShoppingCart,
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-50',
    navigateTo: '/purchase-orders',
  },
]

const costQuickAction: DashboardQuickAction = {
  label: '成本核算',
  desc: '查看 ABC 核算',
  icon: BarChart3,
  colorClass: 'text-indigo-500',
  bgClass: 'bg-indigo-50',
  navigateTo: '/abc/dashboard',
}

const inventoryQuickAction: DashboardQuickAction = {
  label: '库存盘点',
  desc: '维护批次库存',
  icon: ClipboardList,
  colorClass: 'text-orange-500',
  bgClass: 'bg-orange-50',
  navigateTo: '/stocktaking',
}

const managerQuickActions: DashboardQuickAction[] = [
  {
    label: '预警中心',
    desc: '查看库存和成本风险',
    icon: Bell,
    colorClass: 'text-orange-500',
    bgClass: 'bg-orange-50',
    navigateTo: '/alerts',
  },
  {
    label: '库存风险',
    desc: '查看库存余量和批次',
    icon: Package,
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-50',
    navigateTo: '/inventory',
  },
  {
    label: '成本看板',
    desc: '查看可信成本汇总',
    icon: BarChart3,
    colorClass: 'text-indigo-500',
    bgClass: 'bg-indigo-50',
    navigateTo: '/abc/dashboard',
  },
  {
    label: '成本趋势',
    desc: '查看月度和季度趋势',
    icon: TrendingUp,
    colorClass: 'text-green-500',
    bgClass: 'bg-green-50',
    navigateTo: '/abc/trend',
  },
  {
    label: '盈利分析',
    desc: '查看项目利润表现',
    icon: TrendingUp,
    colorClass: 'text-emerald-500',
    bgClass: 'bg-emerald-50',
    navigateTo: '/abc/profitability',
  },
]

const defaultConfig: DashboardRoleConfig = {
  apiCalls: ['inventory', 'alerts', 'inbound-stats', 'outbound-stats'],
  statCards: [inventoryCard, inboundCard, outboundCard, alertCard],
  quickActions: baseQuickActions,
  showBanner: true,
}

const roleConfigs: Record<string, DashboardRoleConfig> = {
  admin: {
    apiCalls: ['inventory', 'alerts', 'inbound-stats', 'outbound-stats', 'abc-dashboard'],
    statCards: costCards,
    quickActions: [costQuickAction, ...baseQuickActions],
    showBanner: true,
    exclusiveSection: 'cost-overview',
  },
  finance: {
    apiCalls: ['abc-dashboard', 'alerts'],
    statCards: costCards,
    quickActions: [costQuickAction],
    showBanner: true,
    exclusiveSection: 'cost-overview',
  },
  warehouse_manager: {
    apiCalls: ['inventory', 'alerts', 'inbound-stats', 'outbound-stats'],
    statCards: [inventoryCard, inboundCard, outboundCard, alertCard],
    quickActions: [...baseQuickActions, inventoryQuickAction],
    showBanner: true,
    exclusiveSection: 'low-stock-summary',
  },
  procurement: {
    apiCalls: ['inventory', 'alerts', 'inbound-stats'],
    statCards: [inventoryCard, inboundCard, alertCard],
    quickActions: [
      baseQuickActions[0],
      baseQuickActions[2],
    ],
    showBanner: true,
  },
  technician: {
    apiCalls: ['inventory', 'alerts', 'outbound-stats'],
    statCards: [inventoryCard, outboundCard, alertCard],
    quickActions: [baseQuickActions[1]],
    showBanner: true,
  },
  pathologist: {
    apiCalls: ['inventory', 'abc-dashboard'],
    statCards: [inventoryCard, ...costCards.slice(0, 2)],
    quickActions: [
      {
        label: '库存风险',
        desc: '查看库存余量和批次',
        icon: Package,
        colorClass: 'text-blue-500',
        bgClass: 'bg-blue-50',
        navigateTo: '/inventory',
      },
      costQuickAction,
    ],
    showBanner: false,
  },
  manager: {
    apiCalls: ['inventory', 'alerts', 'abc-dashboard'],
    statCards: [alertCard, inventoryCard, costCards[0], costCards[2], costCards[3]],
    quickActions: managerQuickActions,
    showBanner: true,
    exclusiveSection: 'cost-overview',
  },
}

export function getDashboardConfig(role: string | null): DashboardRoleConfig {
  return role ? roleConfigs[role] || defaultConfig : defaultConfig
}
