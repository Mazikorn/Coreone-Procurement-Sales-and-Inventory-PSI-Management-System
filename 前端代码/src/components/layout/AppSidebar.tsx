import { useState, useEffect, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { getAllowedPaths, getUserRole } from '@/lib/permissions'
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  ClipboardCheck,
  FlaskConical,
  ClipboardList,
  BarChart3,
  Clock,
  Coins,
  FolderTree,
  Boxes,
  Bell,
  Activity,
  Wrench,
  Truck,
  MapPin,
  Users,
  Shield,
  FileText,
  ChevronLeft,
  ChevronRight,
  PanelLeft,
  PanelRight,
  ShoppingCart,
  Undo2,
  Trash2,
  ArrowRightLeft,
  CornerUpLeft,
  Calculator,
  TrendingUp,
  Layers,
  Settings,
  Receipt,
  LineChart,
  Database,
} from 'lucide-react'

interface MenuItem {
  label: string
  path: string
  icon: React.ElementType
}

interface MenuGroup {
  title: string
  items: MenuItem[]
}

const ALL_MENU_GROUPS: MenuGroup[] = [
  {
    title: '概览',
    items: [
      { label: '仪表盘', path: '/', icon: LayoutDashboard },
      { label: '预警中心', path: '/alerts', icon: Bell },
    ],
  },
  {
    title: '库存作业',
    items: [
      { label: '入库管理', path: '/inbound', icon: ArrowDownToLine },
      { label: '库存列表', path: '/inventory', icon: Package },
      { label: '出库管理', path: '/outbound', icon: ArrowUpFromLine },
      { label: '退库管理', path: '/returns', icon: Undo2 },
      { label: '退货给供应商', path: '/supplier-returns', icon: CornerUpLeft },
      { label: '调拨管理', path: '/transfers', icon: ArrowRightLeft },
      { label: '报废管理', path: '/scraps', icon: Trash2 },
      { label: '库存盘点', path: '/stocktaking', icon: ClipboardCheck },
    ],
  },
  {
    title: '成本管理',
    items: [
      { label: '成本看板', path: '/abc/dashboard', icon: BarChart3 },
      { label: '切片成本', path: '/abc/slide-cost', icon: Layers },
      { label: '盈利分析', path: '/abc/profitability', icon: TrendingUp },
      { label: '收费对照', path: '/abc/fee-comparison', icon: Receipt },
      { label: '收费映射', path: '/abc/fee-mappings', icon: Settings },
      { label: '成本趋势', path: '/abc/trend', icon: LineChart },
      { label: '成本池', path: '/abc/cost-pools', icon: Database },
      { label: '消耗对账', path: '/reconciliation', icon: Activity },
      { label: 'ABC配置', path: '/abc/activity-centers', icon: Settings },
    ],
  },
  {
    title: '采购管理',
    items: [
      { label: '采购订单', path: '/purchase-orders', icon: ShoppingCart },
      { label: '供应商管理', path: '/suppliers', icon: Truck },
    ],
  },
  {
    title: '基础数据',
    items: [
      { label: '物料管理', path: '/materials', icon: Boxes },
      { label: '物料分类', path: '/categories', icon: FolderTree },
      { label: '库位管理', path: '/locations', icon: MapPin },
      { label: '检测项目', path: '/projects', icon: FlaskConical },
      { label: 'BOM清单', path: '/bom', icon: ClipboardList },
      { label: '设备管理', path: '/equipment', icon: Wrench },
      { label: '标准工时库', path: '/labor-times', icon: Clock },
    ],
  },
  {
    title: '系统设置',
    items: [
      { label: '用户管理', path: '/users', icon: Users },
      { label: '角色权限', path: '/roles', icon: Shield },
      { label: '操作日志', path: '/logs', icon: FileText },
    ],
  },
]

function getRoleLabel(role: string | null): string {
  const labels: Record<string, string> = {
    admin: '系统管理员',
    warehouse_manager: '仓库管理员',
    technician: '技术员',
    procurement: '采购员',
    finance: '财务人员',
    pathologist: '病理医生',
  }
  return labels[role || ''] || '用户'
}

export default function AppSidebar() {
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  const role = useMemo(() => getUserRole(), [location.pathname])
  const allowedPaths = useMemo(() => {
    if (!role) return ALL_MENU_GROUPS.flatMap(g => g.items.map(m => m.path))
    return getAllowedPaths(role)
  }, [role])

  const visibleGroups = useMemo(() => {
    return ALL_MENU_GROUPS
      .map(group => ({
        ...group,
        items: group.items.filter(item => allowedPaths.includes(item.path)),
      }))
      .filter(group => group.items.length > 0)
  }, [allowedPaths])

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname === path || location.pathname.startsWith(`${path}/`)
  }

  const Logo = () => (
    <div className="flex items-center gap-3 px-4">
      <div className="w-8 h-8 rounded-lg bg-[#3b82f6] flex items-center justify-center flex-shrink-0">
        <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M8 16L14 10L20 16L14 22L8 16Z" fill="white"/>
          <path d="M14 16L20 10L26 16L20 22L14 16Z" fill="white" opacity="0.6"/>
        </svg>
      </div>
      {!collapsed && (
        <div className="flex flex-col">
          <span className="text-base font-bold text-[#111827] leading-tight tracking-tight">COREONE</span>
          <span className="text-[11px] text-gray-400 leading-tight">病理实验室耗材管理</span>
        </div>
      )}
    </div>
  )

  const NavItem = ({ item }: { item: MenuItem }) => {
    const Icon = item.icon
    const active = isActive(item.path)

    return (
      <Link
        to={item.path}
        className={cn(
          'flex items-center gap-3 px-4 py-2.5 mx-2 rounded-md transition-all duration-150 ease-out',
          active
            ? 'bg-[#eff6ff] text-[#3b82f6]'
            : 'text-[#6b7280] hover:bg-gray-50 hover:text-[#374151]',
          collapsed && 'justify-center px-2 mx-1'
        )}
        title={collapsed ? item.label : undefined}
      >
        <Icon className={cn('w-5 h-5 flex-shrink-0', active && 'text-[#3b82f6]')} />
        {!collapsed && (
          <span className="text-sm font-medium truncate">{item.label}</span>
        )}
      </Link>
    )
  }

  const NavDivider = () => (
    <div className="mx-4 my-2 h-px bg-[#e5e7eb]" />
  )

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile toggle button */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden w-10 h-10 bg-white rounded-lg shadow-md flex items-center justify-center text-gray-600 hover:text-[#3b82f6] transition-colors"
      >
        {mobileOpen ? <PanelRight className="w-5 h-5" /> : <PanelLeft className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          'bg-white border-r border-[#e5e7eb] flex flex-col transition-all duration-300 ease-out z-40',
          'fixed lg:static inset-y-0 left-0',
          collapsed ? 'w-[72px]' : 'w-64',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        )}
      >
        {/* Logo area */}
        <div className="h-16 flex items-center border-b border-[#e5e7eb] flex-shrink-0">
          <Logo />
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
          {visibleGroups.map((group, groupIndex) => (
            <div key={group.title}>
              {!collapsed && (
                <div className="px-4 pt-3 pb-1 text-xs font-medium text-gray-400 uppercase tracking-wider">
                  {group.title}
                </div>
              )}
              {group.items.map(item => (
                <NavItem key={item.path} item={item} />
              ))}
              {groupIndex < visibleGroups.length - 1 && <NavDivider />}
            </div>
          ))}
        </nav>

        {/* Bottom user info */}
        <div className="p-3 border-t border-[#e5e7eb] flex-shrink-0">
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg p-2 transition-all duration-150',
              !collapsed && 'hover:bg-gray-50'
            )}
          >
            <div className="w-8 h-8 rounded-full bg-[#3b82f6]/10 flex items-center justify-center flex-shrink-0">
              <Users className="w-4 h-4 text-[#3b82f6]" />
            </div>
            {!collapsed && (
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-medium text-[#111827] truncate">{getRoleLabel(role)}</span>
                <span className="text-xs text-[#6b7280] truncate">{role || '用户'}</span>
              </div>
            )}
          </div>

          {/* Collapse toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'mt-2 flex items-center gap-2 w-full p-2 rounded-md text-[#6b7280] hover:bg-gray-50 hover:text-[#374151] transition-all duration-150 text-sm',
              collapsed && 'justify-center'
            )}
            title={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            {!collapsed && <span>收起侧边栏</span>}
          </button>
        </div>
      </aside>
    </>
  )
}
