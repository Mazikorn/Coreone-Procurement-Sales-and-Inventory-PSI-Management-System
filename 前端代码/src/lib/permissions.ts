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
    '/reconciliation', '/cost-analysis', '/abc/activity-centers',
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
    '/inventory', '/projects', '/bom', '/reconciliation', '/cost-analysis',
    '/materials', '/categories', '/equipment', '/labor-times',
    '/abc/dashboard', '/abc/slide-cost', '/abc/profitability', '/abc/fee-comparison', '/abc/trend',
  ],
  procurement: [
    '/', '/alerts',
    '/inventory', '/inbound', '/materials', '/suppliers', '/purchase-orders', '/supplier-returns', '/categories',
  ],
  finance: [
    '/', '/alerts',
    '/inventory', '/reconciliation', '/cost-analysis', '/categories',
    '/abc/dashboard', '/abc/slide-cost', '/abc/profitability', '/abc/fee-comparison', '/abc/trend',
    '/abc/activity-centers',
    // ABC 高级页面
    '/abc/cost-drivers', '/abc/cost-pools', '/abc/budgets', '/abc/quality-costs',
    '/abc/variance', '/abc/quarterly-adjustment', '/abc/alerts', '/abc/audit',
    '/abc/forecast', '/abc/supplier-cost', '/abc/equipment-efficiency', '/abc/personnel-efficiency', '/abc/model-validation',
    '/indirect-costs',
  ],
  pathologist: [
    '/', '/alerts',
    '/inventory', '/projects', '/bom', '/reconciliation', '/cost-analysis',
    '/categories', '/equipment', '/labor-times',
    '/abc/dashboard', '/abc/slide-cost', '/abc/profitability', '/abc/fee-comparison', '/abc/trend',
    '/abc/forecast', '/abc/model-validation',
  ],
}
