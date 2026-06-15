export interface DashboardStatCardConfig {
  key: string
  title: string
  icon: string
  colorClass: string
  bgClass: string
  subtitle?: string
  navigateTo: string
}

export interface DashboardQuickActionConfig {
  key: string
  label: string
  desc?: string
  icon: string
  colorClass: string
  bgClass: string
  navigateTo: string
}

export interface DashboardRoleConfig {
  statCards: DashboardStatCardConfig[]
  apiCalls: string[]
  quickActions: DashboardQuickActionConfig[]
  showBanner: boolean
  exclusiveSection: 'cost-overview' | 'low-stock-summary' | null
}

const defaultConfig: DashboardRoleConfig = {
  statCards: [
    { key: 'totalMaterials', title: '物料总数', icon: 'Package', colorClass: 'text-blue-500', bgClass: 'bg-blue-50', navigateTo: '/materials' },
    { key: 'alertCount', title: '库存预警', icon: 'AlertTriangle', colorClass: 'text-orange-500', bgClass: 'bg-orange-50', navigateTo: '/alerts' },
    { key: 'inboundCompleted', title: '已完成入库', icon: 'ArrowDownToLine', colorClass: 'text-green-500', bgClass: 'bg-green-50', navigateTo: '/inbound' },
    { key: 'outboundCompleted', title: '已完成出库', icon: 'TrendingUp', colorClass: 'text-purple-500', bgClass: 'bg-purple-50', navigateTo: '/outbound' },
  ],
  apiCalls: ['inventory', 'alerts', 'inbound-stats', 'outbound-stats'],
  quickActions: [
    { key: 'inbound', label: '入库', desc: '登记耗材入库', icon: 'ArrowDownToLine', colorClass: 'text-green-500', bgClass: 'bg-green-50', navigateTo: '/inbound' },
    { key: 'outbound', label: '出库', desc: '创建出库记录', icon: 'TrendingUp', colorClass: 'text-purple-500', bgClass: 'bg-purple-50', navigateTo: '/outbound' },
    { key: 'inventory', label: '库存', desc: '查看库存明细', icon: 'Package', colorClass: 'text-blue-500', bgClass: 'bg-blue-50', navigateTo: '/inventory' },
    { key: 'purchase', label: '采购', desc: '管理采购订单', icon: 'ShoppingCart', colorClass: 'text-orange-500', bgClass: 'bg-orange-50', navigateTo: '/purchase-orders' },
  ],
  showBanner: true,
  exclusiveSection: null,
}

const roleConfigs: Record<string, Partial<DashboardRoleConfig>> = {
  admin: {
    apiCalls: ['inventory', 'alerts', 'inbound-stats', 'outbound-stats', 'abc-dashboard'],
    quickActions: [
      { key: 'inbound', label: '入库', desc: '登记耗材入库', icon: 'ArrowDownToLine', colorClass: 'text-green-500', bgClass: 'bg-green-50', navigateTo: '/inbound' },
      { key: 'outbound', label: '出库', desc: '创建出库记录', icon: 'TrendingUp', colorClass: 'text-purple-500', bgClass: 'bg-purple-50', navigateTo: '/outbound' },
      { key: 'inventory', label: '库存', desc: '查看库存明细', icon: 'Package', colorClass: 'text-blue-500', bgClass: 'bg-blue-50', navigateTo: '/inventory' },
      { key: 'cost', label: '成本', desc: '查看成本驾驶舱', icon: 'BarChart3', colorClass: 'text-indigo-500', bgClass: 'bg-indigo-50', navigateTo: '/abc/dashboard' },
    ],
    exclusiveSection: 'cost-overview',
  },
  finance: {
    apiCalls: ['inventory', 'abc-dashboard'],
    statCards: [
      { key: 'totalCost', title: '总成本', icon: 'BarChart3', colorClass: 'text-indigo-500', bgClass: 'bg-indigo-50', navigateTo: '/abc/dashboard' },
      { key: 'totalFee', title: '总收入', icon: 'ShoppingCart', colorClass: 'text-green-500', bgClass: 'bg-green-50', navigateTo: '/abc/dashboard' },
      { key: 'totalProfit', title: '利润', icon: 'TrendingUp', colorClass: 'text-emerald-500', bgClass: 'bg-emerald-50', navigateTo: '/abc/profitability' },
      { key: 'profitRate', title: '利润率', icon: 'ClipboardCheck', colorClass: 'text-blue-500', bgClass: 'bg-blue-50', navigateTo: '/abc/profitability' },
    ],
    quickActions: [
      { key: 'cost', label: '成本分析', desc: '查看成本结构', icon: 'BarChart3', colorClass: 'text-indigo-500', bgClass: 'bg-indigo-50', navigateTo: '/abc/dashboard' },
      { key: 'budget', label: '预算管理', desc: '维护预算方案', icon: 'ClipboardCheck', colorClass: 'text-blue-500', bgClass: 'bg-blue-50', navigateTo: '/abc/budgets' },
    ],
    showBanner: false,
    exclusiveSection: 'cost-overview',
  },
  warehouse_manager: {
    apiCalls: ['inventory', 'alerts', 'inbound-stats', 'outbound-stats'],
    quickActions: [
      { key: 'inbound', label: '入库', desc: '登记耗材入库', icon: 'ArrowDownToLine', colorClass: 'text-green-500', bgClass: 'bg-green-50', navigateTo: '/inbound' },
      { key: 'outbound', label: '出库', desc: '创建出库记录', icon: 'TrendingUp', colorClass: 'text-purple-500', bgClass: 'bg-purple-50', navigateTo: '/outbound' },
      { key: 'inventory', label: '库存', desc: '查看库存明细', icon: 'Package', colorClass: 'text-blue-500', bgClass: 'bg-blue-50', navigateTo: '/inventory' },
      { key: 'alerts', label: '预警', desc: '处理库存预警', icon: 'Bell', colorClass: 'text-orange-500', bgClass: 'bg-orange-50', navigateTo: '/alerts' },
    ],
    exclusiveSection: 'low-stock-summary',
  },
}

export function getDashboardConfig(role: string | null): DashboardRoleConfig {
  if (!role) return defaultConfig
  const override = roleConfigs[role]
  if (!override) return defaultConfig
  return { ...defaultConfig, ...override }
}
