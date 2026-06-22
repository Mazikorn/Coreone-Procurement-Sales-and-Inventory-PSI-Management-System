import React, { useState, useRef, useEffect, useMemo } from 'react'
import { Bell, User, LogOut, Search, ChevronRight, Settings, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useLocation, useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { alertsApi } from '@/api/alerts'
import { getAllowedPaths, getUserRole } from '@/lib/permissions'

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return ''
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diff = now - then
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}小时前`
  return `${Math.floor(diff / 86_400_000)}天前`
}

const breadcrumbMap: Record<string, string> = {
  '/': '仪表盘',
  '/inventory': '库存列表',
  '/inbound': '入库记录',
  '/outbound': '出库记录',
  '/stocktaking': '库存盘点',
  '/categories': '物料分类',
  '/materials': '物料管理',
  '/suppliers': '供应商管理',
  '/locations': '库位管理',
  '/projects': '检测项目',
  '/bom': 'BOM清单',
  '/reconciliation': '消耗对账',
  '/alerts': '预警中心',
  '/purchase-orders': '采购订单',
  '/returns': '退库管理',
  '/scraps': '报废管理',
  '/transfers': '调拨管理',
  '/users': '用户管理',
  '/roles': '角色权限',
  '/logs': '操作日志',
  // ABC 成本分析
  '/abc/dashboard': '成本看板',
  '/abc/slide-cost': '切片成本',
  '/abc/profitability': '盈利分析',
  '/abc/fee-comparison': '收费对照',
  '/abc/trend': '成本趋势',
  '/abc/activity-centers': '作业中心',
  '/abc/cost-drivers': '成本动因',
  '/abc/cost-pools': '成本池',
  '/abc/budgets': '预算管理',
  '/abc/quality-costs': '质量成本',
  '/abc/variance': '差异分析',
  '/abc/alerts': '成本预警',
  '/abc/audit': '审计追踪',
  '/abc/quarterly-adjustment': '季度调整',
  '/abc/personnel-efficiency': '人员效率',
  '/abc/model-validation': '模型验证',
  // 设备与成本中心
  '/equipment': '设备管理',
  '/equipment/types': '设备类型',
  '/equipment/depreciation': '折旧统计',
  '/indirect-costs': '间接成本中心',
  '/labor-times': '标准工时库',
  '/supplier-returns': '退货给供应商',
}

interface NotificationItem {
  id: string
  title: string
  message: string
  time: string
  unread: boolean
  level?: string
}

interface SearchRouteItem {
  label: string
  path: string
  keywords: string
}

const globalSearchItems: SearchRouteItem[] = [
  { label: '仪表盘', path: '/', keywords: '首页 概览 dashboard' },
  { label: '预警中心', path: '/alerts', keywords: '通知 库存预警 效期预警 alerts' },
  { label: '入库管理', path: '/inbound', keywords: '入库 采购入库 扫码 inbound' },
  { label: '库存列表', path: '/inventory', keywords: '库存 批次 余量 inventory' },
  { label: '出库管理', path: '/outbound', keywords: '出库 领用 BOM outbound' },
  { label: '退库管理', path: '/returns', keywords: '退库 退回 returns' },
  { label: '退货给供应商', path: '/supplier-returns', keywords: '供应商退货 采购退货 supplier returns' },
  { label: '调拨管理', path: '/transfers', keywords: '调拨 移库 transfers' },
  { label: '报废管理', path: '/scraps', keywords: '报废 scraps' },
  { label: '库存盘点', path: '/stocktaking', keywords: '盘点 差异 stocktaking' },
  { label: '采购订单', path: '/purchase-orders', keywords: '采购 PO purchase' },
  { label: '供应商管理', path: '/suppliers', keywords: '供应商 suppliers' },
  { label: '物料管理', path: '/materials', keywords: '耗材 试剂 materials' },
  { label: '物料分类', path: '/categories', keywords: '分类 category' },
  { label: '库位管理', path: '/locations', keywords: '库位 货架 locations' },
  { label: '检测项目', path: '/projects', keywords: '项目 服务 project' },
  { label: 'BOM清单', path: '/bom', keywords: 'BOM 配方 用量' },
  { label: '消耗对账', path: '/reconciliation', keywords: 'LIS 对账 病例 reconciliation' },
  { label: '设备管理', path: '/equipment', keywords: '设备 台账 equipment' },
  { label: '设备类型', path: '/equipment/types', keywords: '设备类型 折旧默认值' },
  { label: '折旧统计', path: '/equipment/depreciation', keywords: '设备折旧 depreciation' },
  { label: '标准工时库', path: '/labor-times', keywords: '工时 人工 labor' },
  { label: '间接成本中心', path: '/indirect-costs', keywords: '间接成本 公共成本' },
  { label: '用户管理', path: '/users', keywords: '用户 账号 users' },
  { label: '角色权限', path: '/roles', keywords: '角色 权限 roles' },
  { label: '操作日志', path: '/logs', keywords: '日志 审计 logs' },
  { label: '成本看板', path: '/abc/dashboard', keywords: 'ABC 成本 看板 dashboard' },
  { label: '切片成本', path: '/abc/slide-cost', keywords: 'ABC 切片 单张成本' },
  { label: '盈利分析', path: '/abc/profitability', keywords: 'ABC 盈利 毛利' },
  { label: '收费对照', path: '/abc/fee-comparison', keywords: 'ABC 收费 对照' },
  { label: '收费映射', path: '/abc/fee-mappings', keywords: 'ABC 收费 映射' },
  { label: '成本趋势', path: '/abc/trend', keywords: 'ABC 趋势' },
  { label: '作业中心', path: '/abc/activity-centers', keywords: 'ABC 作业中心 配置' },
  { label: '成本动因', path: '/abc/cost-drivers', keywords: 'ABC 动因 driver' },
  { label: '成本池', path: '/abc/cost-pools', keywords: 'ABC 成本池 pool' },
  { label: '预算管理', path: '/abc/budgets', keywords: 'ABC 预算 budget' },
  { label: '质量成本', path: '/abc/quality-costs', keywords: 'ABC 质量成本' },
  { label: '差异分析', path: '/abc/variance', keywords: 'ABC 差异 variance' },
  { label: '成本预警', path: '/abc/alerts', keywords: 'ABC 成本预警' },
  { label: '审计追踪', path: '/abc/audit', keywords: 'ABC 审计 audit' },
  { label: '季度调整', path: '/abc/quarterly-adjustment', keywords: 'ABC 季度调整' },
  { label: '人员效率', path: '/abc/personnel-efficiency', keywords: 'ABC 人员效率' },
  { label: '模型验证', path: '/abc/model-validation', keywords: 'ABC 模型验证' },
]

export default function TopBar() {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const location = useLocation()
  const navigate = useNavigate()

  // Fetch real alerts from API
  useEffect(() => {
    let cancelled = false
    async function fetchAlerts() {
      try {
        const token = localStorage.getItem('token')
        if (!token) return
        const res = await alertsApi.getList({ status: 'pending', page: 1, pageSize: 5 })
        if (cancelled) return
        const items = (res?.data?.items || res?.data || []).map((a: Record<string, unknown>) => ({
          id: a.id as string,
          title: (a.type as string) === 'low_stock' ? '库存预警' : (a.type as string) === 'expiry' ? '效期预警' : '预警通知',
          message: (a.message as string) || `${a.material_name} - 当前库存: ${a.current_stock}`,
          time: formatTimeAgo(a.created_at as string),
          unread: (a.status as string) === 'pending',
          level: a.level as string,
        }))
        setNotifications(items)
        setUnreadCount(items.filter((n: NotificationItem) => n.unread).length)
      } catch {
        // silent fail - notifications are non-critical
      }
    }
    fetchAlerts()
    const interval = setInterval(fetchAlerts, 60000) // refresh every minute
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  function decodeBase64Url(str: string): string {
    const padding = '='.repeat((4 - (str.length % 4)) % 4)
    const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding
    return atob(base64)
  }

  function getUserInfo() {
    try {
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const user = JSON.parse(userStr)
        return {
          realName: user.realName || user.username || '用户',
          role: user.role || '',
          username: user.username || '',
        }
      }

      const token = localStorage.getItem('token')
      if (token) {
        const payload = JSON.parse(decodeBase64Url(token.split('.')[1]))
        return {
          realName: payload.realName || payload.username || '用户',
          role: payload.role || '',
          username: payload.username || '',
        }
      }
    } catch { /* ignore */ }
    return { realName: '用户', role: '', username: '' }
  }

  const roleLabels: Record<string, string> = {
    admin: '系统管理员',
    warehouse_manager: '仓库管理员',
    technician: '技术员',
    procurement: '采购员',
    finance: '财务人员',
    pathologist: '病理医生',
  }

  const userInfo = getUserInfo()
  const displayName = userInfo.realName
  const displayRole = roleLabels[userInfo.role] || userInfo.role || '用户'

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false)
      }
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setNotificationOpen(false)
      }
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const allowedSearchPaths = useMemo(() => {
    const role = getUserRole()
    if (!role) return new Set(globalSearchItems.map(item => item.path))
    return new Set(getAllowedPaths(role))
  }, [location.pathname])

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return []
    return globalSearchItems
      .filter(item => allowedSearchPaths.has(item.path))
      .filter(item => `${item.label} ${item.path} ${item.keywords}`.toLowerCase().includes(query))
      .slice(0, 8)
  }, [allowedSearchPaths, searchQuery])

  const userMenuLinks = useMemo(() => [
    { label: '用户管理', path: '/users', icon: User },
    { label: '角色权限', path: '/roles', icon: Settings },
    { label: '操作日志', path: '/logs', icon: FileText },
  ].filter(item => allowedSearchPaths.has(item.path)), [allowedSearchPaths])

  const handleLogout = () => {
    localStorage.removeItem('token')
    toast.success('已退出登录')
    window.location.href = '/login'
  }

  const goToSearchResult = (path: string) => {
    navigate(path)
    setSearchQuery('')
    setSearchOpen(false)
  }

  // Generate breadcrumbs
  const generateBreadcrumbs = () => {
    const path = location.pathname
    const crumbs: { label: string; path?: string }[] = []

    if (path === '/') {
      crumbs.push({ label: '仪表盘' })
      return crumbs
    }

    crumbs.push({ label: '首页', path: '/' })

    const segments = path.split('/').filter(Boolean)
    let currentPath = ''

    segments.forEach((segment, index) => {
      currentPath += `/${segment}`
      const isLast = index === segments.length - 1
      const label = breadcrumbMap[currentPath] || segment

      if (isLast) {
        crumbs.push({ label })
      } else {
        crumbs.push({ label, path: currentPath })
      }
    })

    return crumbs
  }

  const breadcrumbs = generateBreadcrumbs()

  return (
    <header className="h-16 bg-white border-b border-[#e5e7eb] flex items-center justify-between px-6 flex-shrink-0">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <div key={index} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="w-4 h-4 text-gray-300" />}
            {crumb.path ? (
              <a
                href={crumb.path}
                className="text-[#6b7280] hover:text-[#3b82f6] transition-colors duration-150"
              >
                {crumb.label}
              </a>
            ) : (
              <span className="text-[#111827] font-medium">{crumb.label}</span>
            )}
          </div>
        ))}
      </nav>

      {/* Right section */}
      <div className="flex items-center gap-3">
        {/* Search */}
        <div className="relative hidden sm:block" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={event => {
              setSearchQuery(event.target.value)
              setSearchOpen(true)
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={event => {
              if (event.key === 'Enter' && searchResults[0]) {
                event.preventDefault()
                goToSearchResult(searchResults[0].path)
              }
              if (event.key === 'Escape') {
                setSearchOpen(false)
              }
            }}
            placeholder="全局搜索..."
            className="w-64 pl-10 pr-4 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-md text-sm text-[#374151] placeholder:text-gray-400 focus:outline-none focus:border-[#3b82f6] focus:ring-3 focus:ring-[rgba(59,130,246,0.1)] transition-all duration-150"
          />
          {searchOpen && searchQuery.trim() && (
            <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-lg border border-[#e5e7eb] bg-white py-1 shadow-lg">
              {searchResults.length > 0 ? (
                searchResults.map(item => (
                  <button
                    key={item.path}
                    type="button"
                    onClick={() => goToSearchResult(item.path)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="font-medium text-gray-900">{item.label}</span>
                    <span className="font-mono text-xs text-gray-400">{item.path}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-4 text-center text-sm text-gray-400">
                  无匹配功能
                </div>
              )}
            </div>
          )}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setNotificationOpen(!notificationOpen)}
            aria-label="通知消息"
            className="relative p-2 text-[#6b7280] hover:text-[#374151] hover:bg-gray-50 rounded-md transition-all duration-150"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[11px] font-medium rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {notificationOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-[#e5e7eb] py-2 z-50">
              <div className="px-4 py-2 border-b border-[#e5e7eb] flex items-center justify-between">
                <span className="text-sm font-medium text-[#111827]">通知消息</span>
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.map(notification => (
                  <div
                    key={notification.id}
                    onClick={() => { setNotificationOpen(false); navigate('/alerts') }}
                    className={cn(
                      'px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors duration-150',
                      notification.unread && 'bg-blue-50/50'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                        notification.unread ? 'bg-[#3b82f6]' : 'bg-gray-300'
                      )} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[#111827]">{notification.title}</p>
                        <p className="text-xs text-[#6b7280] mt-0.5 truncate">{notification.message}</p>
                        <p className="text-xs text-gray-400 mt-1">{notification.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-[#e5e7eb]">
                <a
                  href="/alerts"
                  onClick={event => {
                    event.preventDefault()
                    setNotificationOpen(false)
                    navigate('/alerts')
                  }}
                  className="text-xs text-[#3b82f6] hover:underline flex items-center justify-center"
                >
                  查看全部通知
                </a>
              </div>
            </div>
          )}
        </div>

        {/* User dropdown */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1.5 pr-3 text-[#374151] hover:bg-gray-50 rounded-md transition-all duration-150"
          >
            <div className="w-8 h-8 bg-[#3b82f6] rounded-full flex items-center justify-center text-white text-sm font-medium">
              <User className="w-4 h-4" />
            </div>
            <div className="hidden sm:flex flex-col items-start">
              <span className="text-sm font-medium leading-tight">{displayName}</span>
              <span className="text-xs text-[#6b7280] leading-tight">{displayRole}</span>
            </div>
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-lg border border-[#e5e7eb] py-1 z-50">
              <div className="px-4 py-3 border-b border-[#e5e7eb]">
                <p className="text-sm font-medium text-[#111827]">{displayName}</p>
                <p className="text-xs text-[#6b7280]">{userInfo.username || displayRole}</p>
              </div>
              {userMenuLinks.map(item => {
                const Icon = item.icon
                return (
                  <button
                    key={item.path}
                    type="button"
                    className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-[#374151] transition-colors hover:bg-gray-50"
                    onClick={() => {
                      setUserMenuOpen(false)
                      navigate(item.path)
                    }}
                  >
                    <Icon className="w-4 h-4 text-gray-400" />
                    {item.label}
                  </button>
                )
              })}
              <div className="border-t border-[#e5e7eb] mt-1 pt-1">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  退出登录
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
