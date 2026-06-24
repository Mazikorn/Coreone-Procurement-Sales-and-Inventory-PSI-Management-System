import type { ElementType } from 'react'
import {
  AlertTriangle,
  ArrowDownToLine,
  Activity,
  BarChart3,
  ClipboardList,
  Bell,
  Package,
  PackageSearch,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react'

type ApiCall = 'inventory' | 'alerts' | 'inbound-stats' | 'outbound-stats' | 'abc-dashboard'
type RecentActivitySource = 'inbound' | 'outbound'

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

export interface DashboardActivityLink {
  label: string
  path: string
}

export interface DashboardRoleConfig {
  apiCalls: ApiCall[]
  statCards: DashboardCardConfig[]
  quickActions: DashboardQuickAction[]
  recentActivitySources: RecentActivitySource[]
  activityLinks: DashboardActivityLink[]
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
  navigateTo: '/alerts?quick=pending',
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
    desc: '登记批号、库位并形成库存批次',
    icon: ArrowDownToLine,
    colorClass: 'text-green-500',
    bgClass: 'bg-green-50',
    navigateTo: '/inbound?action=create&type=direct',
  },
  {
    label: '项目出库',
    desc: '按项目扣减批次并进入成本对账',
    icon: PackageSearch,
    colorClass: 'text-purple-500',
    bgClass: 'bg-purple-50',
    navigateTo: '/outbound?action=create',
  },
  {
    label: '采购订单',
    desc: '按采购单收货并生成入库单',
    icon: ShoppingCart,
    colorClass: 'text-blue-500',
    bgClass: 'bg-blue-50',
    navigateTo: '/purchase-orders?status=pending,partial',
  },
]

const purchaseCreateAction: DashboardQuickAction = {
  label: '新建采购订单',
  desc: '按补货需求建单，后续接入入库',
  icon: ShoppingCart,
  colorClass: 'text-blue-500',
  bgClass: 'bg-blue-50',
  navigateTo: '/purchase-orders?action=create',
}

const purchaseReceivingAction: DashboardQuickAction = {
  label: '待收货订单',
  desc: '查看交付进度，仓库收货入库',
  icon: ShoppingCart,
  colorClass: 'text-blue-500',
  bgClass: 'bg-blue-50',
  navigateTo: '/purchase-orders?status=pending,partial',
}

const reconciliationAction: DashboardQuickAction = {
  label: '消耗对账',
  desc: '核对 LIS 与系统消耗',
  icon: Activity,
  colorClass: 'text-orange-500',
  bgClass: 'bg-orange-50',
  navigateTo: '/reconciliation',
}

const slideCostAction: DashboardQuickAction = {
  label: '切片成本',
  desc: '查看单张切片成本',
  icon: BarChart3,
  colorClass: 'text-indigo-500',
  bgClass: 'bg-indigo-50',
  navigateTo: '/abc/slide-cost',
}

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
  desc: '按批次盘点并记录库存差异',
  icon: ClipboardList,
  colorClass: 'text-orange-500',
  bgClass: 'bg-orange-50',
  navigateTo: '/stocktaking?action=create',
}

const managerQuickActions: DashboardQuickAction[] = [
  {
    label: '预警中心',
    desc: '查看库存和成本风险',
    icon: Bell,
    colorClass: 'text-orange-500',
    bgClass: 'bg-orange-50',
    navigateTo: '/alerts?quick=pending',
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
  recentActivitySources: ['inbound', 'outbound'],
  activityLinks: [
    { label: '入库记录', path: '/inbound' },
    { label: '出库记录', path: '/outbound' },
  ],
  showBanner: true,
}

const roleConfigs: Record<string, DashboardRoleConfig> = {
  admin: {
    apiCalls: ['inventory', 'alerts', 'inbound-stats', 'outbound-stats', 'abc-dashboard'],
    statCards: costCards,
    quickActions: [costQuickAction, ...baseQuickActions],
    recentActivitySources: ['inbound', 'outbound'],
    activityLinks: [
      { label: '入库记录', path: '/inbound' },
      { label: '出库记录', path: '/outbound' },
      { label: '操作日志', path: '/logs' },
    ],
    showBanner: true,
    exclusiveSection: 'cost-overview',
  },
  finance: {
    apiCalls: ['abc-dashboard', 'alerts'],
    statCards: costCards,
    quickActions: [costQuickAction],
    recentActivitySources: [],
    activityLinks: [{ label: '操作日志', path: '/logs' }],
    showBanner: true,
    exclusiveSection: 'cost-overview',
  },
  warehouse_manager: {
    apiCalls: ['inventory', 'alerts', 'inbound-stats', 'outbound-stats'],
    statCards: [inventoryCard, inboundCard, outboundCard, alertCard],
    quickActions: [...baseQuickActions, inventoryQuickAction],
    recentActivitySources: ['inbound', 'outbound'],
    activityLinks: [
      { label: '入库记录', path: '/inbound' },
      { label: '出库记录', path: '/outbound' },
    ],
    showBanner: true,
    exclusiveSection: 'low-stock-summary',
  },
  procurement: {
    apiCalls: ['inventory', 'alerts', 'inbound-stats'],
    statCards: [inventoryCard, inboundCard, alertCard],
    quickActions: [
      purchaseCreateAction,
      purchaseReceivingAction,
    ],
    recentActivitySources: [],
    activityLinks: [{ label: '采购订单', path: '/purchase-orders' }],
    showBanner: true,
  },
  technician: {
    apiCalls: ['inventory', 'alerts'],
    statCards: [inventoryCard, alertCard],
    quickActions: [reconciliationAction, slideCostAction],
    recentActivitySources: [],
    activityLinks: [],
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
    recentActivitySources: [],
    activityLinks: [],
    showBanner: false,
  },
  manager: {
    apiCalls: ['inventory', 'alerts', 'abc-dashboard'],
    statCards: [alertCard, inventoryCard, costCards[0], costCards[2], costCards[3]],
    quickActions: managerQuickActions,
    recentActivitySources: [],
    activityLinks: [],
    showBanner: true,
    exclusiveSection: 'cost-overview',
  },
}

export function getDashboardConfig(role: string | null): DashboardRoleConfig {
  return role ? roleConfigs[role] || defaultConfig : defaultConfig
}
