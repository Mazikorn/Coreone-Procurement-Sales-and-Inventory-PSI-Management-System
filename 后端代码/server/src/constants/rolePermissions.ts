export const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['*'],
  warehouse_manager: [
    'dashboard', 'inventory', 'inbound', 'outbound', 'stocktaking',
    'categories', 'materials', 'suppliers', 'locations', 'alerts',
    'returns', 'scraps', 'transfers', 'supplier_returns',
    'projects', 'bom:view', 'purchase_orders:view',
  ],
  technician: [
    'dashboard', 'inventory', 'outbound', 'projects', 'bom', 'materials', 'alerts',
    'equipment', 'labor_times:view', 'cost_analysis',
  ],
  pathologist: [
    'dashboard', 'inventory', 'outbound', 'projects', 'bom', 'materials',
    'cost_analysis', 'alerts', 'equipment', 'labor_times:view',
  ],
  procurement: [
    'dashboard', 'inventory', 'inbound', 'categories', 'materials',
    'suppliers', 'purchase_orders', 'supplier_returns', 'alerts',
  ],
  finance: [
    'dashboard', 'cost_analysis', 'logs', 'alerts', 'labor_times',
  ],
}
