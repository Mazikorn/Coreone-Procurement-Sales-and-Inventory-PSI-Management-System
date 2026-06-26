export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'],
  warehouse_manager: [
    'dashboard', 'inventory', 'inbound', 'outbound', 'stocktaking',
    'categories', 'materials', 'suppliers', 'locations', 'alerts',
    'returns', 'scraps', 'transfers', 'supplier_returns',
    'projects:view', 'bom:view', 'purchase_orders:view',
  ],
  technician: [
    'dashboard', 'inventory', 'projects', 'bom', 'materials', 'alerts',
    'equipment', 'labor_times', 'cost_analysis',
  ],
  pathologist: [
    'dashboard', 'inventory', 'projects:view', 'bom:view',
    'cost_analysis', 'alerts', 'equipment:view', 'labor_times:view',
  ],
  procurement: [
    'dashboard', 'inventory', 'inbound', 'categories', 'materials',
    'suppliers', 'purchase_orders', 'supplier_returns', 'alerts',
  ],
  finance: [
    'dashboard', 'cost_analysis', 'logs', 'alerts', 'labor_times',
    'projects:view', 'bom:view', 'materials:view',
    'supplier_returns:view', // P1-14：财务只读访问供应商退货（退款应收对账），写操作仍限 admin/仓管/采购
  ],
  manager: [
    'dashboard',
    'inventory:view',
    'alerts:view',
    'cost_analysis:view',
  ],
}

export const SYSTEM_ROLE_CODES = Object.keys(ROLE_PERMISSIONS)
