import { Outlet, useLocation, Navigate } from 'react-router-dom'
import { useMemo } from 'react'
import AppSidebar from './AppSidebar'
import TopBar from './TopBar'
import { ROLE_MENU_MAP } from '@/lib/permissions'

function decodeBase64Url(str: string): string {
  const padding = '='.repeat((4 - (str.length % 4)) % 4)
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding
  return atob(base64)
}

function getUserRole(): string | null {
  try {
    const token = localStorage.getItem('token')
    if (token) {
      const payload = JSON.parse(decodeBase64Url(token.split('.')[1]))
      if (payload.role) return payload.role
    }
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const user = JSON.parse(userStr)
      return user.role || null
    }
  } catch { /* ignore */ }
  return null
}

export default function AppLayout() {
  const location = useLocation()
  const role = getUserRole()

  const allowedPaths = useMemo(() => {
    if (!role) return []
    return ROLE_MENU_MAP[role] || ROLE_MENU_MAP.technician
  }, [role])

  // 路由守卫：未登录重定向到登录页，无权限重定向到首页
  if (!role) {
    return <Navigate to="/login" replace />
  }
  const hasAccess = allowedPaths.includes(location.pathname)
  if (!hasAccess) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex min-h-screen bg-[#f9fafb]">
      {/* Sidebar */}
      <AppSidebar />

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen">
        {/* TopBar */}
        <TopBar />

        {/* Page content */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
