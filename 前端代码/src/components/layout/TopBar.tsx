import { useState, useRef, useEffect } from 'react'
import { Bell, User, LogOut, Search, ChevronRight, Settings, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { alertsApi } from '@/api/alerts'

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
  '/cost-analysis': '物料成本分析',
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
  '/abc/forecast': '成本预测',
  '/abc/supplier-cost': '供应商成本',
  '/abc/equipment-efficiency': '设备效率',
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

export default function TopBar() {
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notificationRef = useRef<HTMLDivElement>(null)
  const location = useLocation()

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
      const token = localStorage.getItem('token')
      if (token) {
        const payload = JSON.parse(decodeBase64Url(token.split('.')[1]))
        return {
          realName: payload.realName || payload.username || '用户',
          role: payload.role || '',
          username: payload.username || '',
        }
      }
      const userStr = localStorage.getItem('user')
      if (userStr) {
        const user = JSON.parse(userStr)
        return {
          realName: user.realName || user.username || '用户',
          role: user.role || '',
          username: user.username || '',
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
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    localStorage.removeItem('token')
    toast.success('已退出登录')
    window.location.href = '/login'
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
        <div className="relative hidden sm:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="全局搜索..."
            className="w-64 pl-10 pr-4 py-2 bg-[#f9fafb] border border-[#e5e7eb] rounded-md text-sm text-[#374151] placeholder:text-gray-400 focus:outline-none focus:border-[#3b82f6] focus:ring-3 focus:ring-[rgba(59,130,246,0.1)] transition-all duration-150"
          />
        </div>

        {/* Notifications */}
        <div className="relative" ref={notificationRef}>
          <button
            onClick={() => setNotificationOpen(!notificationOpen)}
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
                {unreadCount > 0 && (
                  <span className="text-xs text-[#3b82f6] cursor-pointer hover:underline">
                    标记全部已读
                  </span>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {notifications.map(notification => (
                  <div
                    key={notification.id}
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
              <a
                href="/users"
                className="flex items-center gap-2 px-4 py-2 text-sm text-[#374151] hover:bg-gray-50 transition-colors"
                onClick={() => setUserMenuOpen(false)}
              >
                <User className="w-4 h-4 text-gray-400" />
                个人信息
              </a>
              <a
                href="/roles"
                className="flex items-center gap-2 px-4 py-2 text-sm text-[#374151] hover:bg-gray-50 transition-colors"
                onClick={() => setUserMenuOpen(false)}
              >
                <Settings className="w-4 h-4 text-gray-400" />
                系统设置
              </a>
              <a
                href="/logs"
                className="flex items-center gap-2 px-4 py-2 text-sm text-[#374151] hover:bg-gray-50 transition-colors"
                onClick={() => setUserMenuOpen(false)}
              >
                <FileText className="w-4 h-4 text-gray-400" />
                操作日志
              </a>
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
