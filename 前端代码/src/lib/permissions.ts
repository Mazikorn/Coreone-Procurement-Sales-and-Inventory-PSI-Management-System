export function decodeBase64Url(str: string): string {
  const padding = '='.repeat((4 - (str.length % 4)) % 4)
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/') + padding
  return atob(base64)
}

export function getUserRole(): string | null {
  try {
    // 优先从 localStorage.user 读取角色
    const userStr = localStorage.getItem('user')
    if (userStr) {
      try {
        const user = JSON.parse(userStr)
        if (user.role) return user.role
      } catch {
        // 解析失败，回退到 JWT token
      }
    }

    // 回退到 JWT token
    const token = localStorage.getItem('token')
    if (!token) return null
    const parts = token.split('.')
    if (parts.length < 2) return null
    const payload = JSON.parse(decodeBase64Url(parts[1]))
    return payload.role ?? null
  } catch {
    return null
  }
}

export function getUserPermissions(): string[] {
  try {
    const userStr = localStorage.getItem('user')
    if (!userStr) return []
    const user = JSON.parse(userStr)
    return Array.isArray(user.permissions) ? user.permissions : []
  } catch {
    return []
  }
}

// 角色-菜单权限映射
// 侧边栏显示 24 项，其余页面通过 URL 直接访问（高级用户/财务）
export const ROLE_MENU_MAP: Record<string, string[]> = {
  admin: [
    // 概览
    '/', '/alerts',
    // 库存作业
    '/inventory', '/inbound', '/outbound', '/returns', '/supplier-returns', '/transfers', '/scraps', '/stocktaking',
    // 成本管理（含 ABC 配置入口）
    '/abc/dashboard', '/abc/slide-cost', '/abc/profitability', '/abc/fee-comparison', '/abc/trend',
    '/abc/fee-mappings', '/reconciliation', '/abc/activity-centers',
    // 采购管理
    '/purchase-orders', '/suppliers',
    // 基础数据
    '/materials', '/categories', '/locations', '/projects', '/bom', '/equipment', '/labor-times',
    // 系统设置
    '/users', '/roles', '/logs',
    // ABC 高级页面（URL 直接访问）
    '/abc/cost-drivers', '/abc/cost-pools', '/abc/budgets', '/abc/quality-costs',
    '/abc/variance', '/abc/quarterly-adjustment', '/abc/alerts', '/abc/audit',
    '/abc/forecast', '/abc/supplier-cost', '/abc/equipment-efficiency', '/abc/personnel-efficiency', '/abc/model-validation',
    '/equipment/types', '/equipment/depreciation', '/indirect-costs',
  ],
  warehouse_manager: [
    '/', '/alerts',
    '/inventory', '/inbound', '/outbound', '/returns', '/supplier-returns', '/transfers', '/scraps', '/stocktaking',
    '/suppliers', '/locations', '/materials', '/categories',
  ],
  technician: [
    '/', '/alerts',
    '/inventory', '/projects', '/bom',
    '/materials', '/categories', '/equipment', '/labor-times',
    '/abc/dashboard', '/abc/slide-cost', '/abc/profitability', '/abc/fee-comparison', '/abc/fee-mappings', '/abc/trend',
  ],
  procurement: [
    '/', '/alerts',
    '/inventory', '/inbound', '/materials', '/suppliers', '/purchase-orders', '/supplier-returns', '/categories',
  ],
  finance: [
    '/', '/alerts',
    '/reconciliation', '/categories', '/logs',
    '/abc/dashboard', '/abc/slide-cost', '/abc/profitability', '/abc/fee-comparison', '/abc/fee-mappings', '/abc/trend',
    '/abc/activity-centers',
    // ABC 高级页面
    '/abc/cost-drivers', '/abc/cost-pools', '/abc/budgets', '/abc/quality-costs',
    '/abc/variance', '/abc/quarterly-adjustment', '/abc/alerts', '/abc/audit',
    '/abc/forecast', '/abc/supplier-cost', '/abc/equipment-efficiency', '/abc/personnel-efficiency', '/abc/model-validation',
    '/indirect-costs',
  ],
  pathologist: [
    '/', '/alerts',
    '/inventory', '/projects', '/bom', '/reconciliation',
    '/categories', '/equipment', '/labor-times',
    '/abc/dashboard', '/abc/slide-cost', '/abc/profitability', '/abc/fee-comparison', '/abc/fee-mappings', '/abc/trend',
    '/abc/forecast', '/abc/model-validation',
  ],
}

const PERMISSION_PATH_MAP: Record<string, string[]> = {
  inventory: ['/inventory'],
  inbound: ['/inbound'],
  outbound: ['/outbound'],
  stocktaking: ['/stocktaking'],
  returns: ['/returns'],
  scraps: ['/scraps'],
  transfers: ['/transfers'],
  supplier_returns: ['/supplier-returns'],
  purchase_orders: ['/purchase-orders'],
  projects: ['/projects'],
  bom: ['/bom'],
  categories: ['/categories'],
  materials: ['/materials'],
  suppliers: ['/suppliers'],
  locations: ['/locations'],
  equipment: ['/equipment', '/equipment/types', '/equipment/depreciation'],
  labor_times: ['/labor-times'],
  cost_analysis: [
    '/reconciliation',
    '/indirect-costs',
    '/abc/dashboard',
    '/abc/slide-cost',
    '/abc/profitability',
    '/abc/fee-comparison',
    '/abc/fee-mappings',
    '/abc/trend',
  ],
  alerts: ['/alerts'],
  users: ['/users'],
  roles: ['/roles'],
  logs: ['/logs'],
}

function moduleFromPermission(permission: string) {
  if (permission === '*') return '*'
  return permission.split(':')[0]
}

export function getAllowedPaths(role = getUserRole(), permissions = getUserPermissions()): string[] {
  if (!role) return []
  if (ROLE_MENU_MAP[role]) return ROLE_MENU_MAP[role]
  const modules = new Set(permissions.map(moduleFromPermission))
  if (modules.has('*')) return ROLE_MENU_MAP.admin

  const paths = new Set<string>(['/'])
  for (const module of modules) {
    for (const path of PERMISSION_PATH_MAP[module] || []) {
      paths.add(path)
    }
  }
  return [...paths]
}
