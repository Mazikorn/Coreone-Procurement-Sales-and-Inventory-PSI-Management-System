// 角色-菜单权限映射（与 PRD-v1.0-FINAL 权限矩阵保持一致）
export const ROLE_MENU_MAP: Record<string, string[]> = {
  admin: [
    '/', '/inventory', '/inbound', '/outbound', '/returns', '/scraps', '/transfers', '/stocktaking',
    '/projects', '/bom', '/reconciliation', '/cost-analysis',
    '/categories', '/materials', '/alerts',
    '/purchase-orders', '/suppliers', '/locations', '/users', '/roles', '/logs',
  ],
  warehouse_manager: [
    '/', '/inventory', '/inbound', '/outbound', '/returns', '/scraps', '/transfers', '/stocktaking',
    '/suppliers', '/locations', '/materials', '/categories', '/alerts',
  ],
  technician: [
    '/', '/inventory', '/projects', '/bom', '/reconciliation',
    '/cost-analysis', '/materials', '/categories', '/alerts',
  ],
  procurement: [
    '/', '/inventory', '/inbound', '/materials', '/suppliers', '/purchase-orders', '/categories', '/alerts',
  ],
  finance: [
    '/', '/inventory', '/reconciliation', '/cost-analysis', '/categories', '/alerts',
  ],
  pathologist: [
    '/', '/inventory', '/projects', '/bom', '/reconciliation', '/cost-analysis',
  ],
}
