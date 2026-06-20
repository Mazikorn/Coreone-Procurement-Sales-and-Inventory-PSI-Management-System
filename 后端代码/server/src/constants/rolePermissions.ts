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
    'dashboard', 'inventory', 'projects:view', 'bom:view', 'materials',
    'cost_analysis', 'alerts', 'equipment:view', 'labor_times:view',
  ],
  procurement: [
    'dashboard', 'inventory', 'inbound', 'categories', 'materials',
    'suppliers', 'purchase_orders', 'supplier_returns', 'alerts',
  ],
  finance: [
    'dashboard', 'cost_analysis', 'logs', 'alerts', 'labor_times',
    'projects:view', 'bom:view', 'materials:view',
  ],
  manager: [
    'dashboard',
    'inventory:view',
    'alerts:view',
    'cost_analysis:view',
  ],
}
