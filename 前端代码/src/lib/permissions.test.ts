import { describe, expect, it } from 'vitest'
import { getAllowedPaths, ROLE_MENU_MAP } from './permissions'

describe('ROLE_MENU_MAP', () => {
  const retiredCostPaths = ['/abc/forecast', '/abc/supplier-cost', '/abc/equipment-efficiency']

  it('does not expose retired cost placeholder routes without real pages', () => {
    for (const paths of Object.values(ROLE_MENU_MAP)) {
      for (const path of retiredCostPaths) {
        expect(paths).not.toContain(path)
      }
    }
  })

  it('allows finance to read operation logs without granting user or role management', () => {
    expect(ROLE_MENU_MAP.finance).toContain('/logs')
    expect(ROLE_MENU_MAP.finance).not.toContain('/users')
    expect(ROLE_MENU_MAP.finance).not.toContain('/roles')
  })

  it('lets finance read project and BOM context needed for ABC configuration', () => {
    expect(ROLE_MENU_MAP.finance).toEqual(expect.arrayContaining(['/projects', '/bom']))
    expect(ROLE_MENU_MAP.finance).not.toContain('/materials')
  })

  it('keeps procurement focused on purchase handoff instead of warehouse inbound execution', () => {
    expect(ROLE_MENU_MAP.procurement).toContain('/purchase-orders')
    expect(ROLE_MENU_MAP.procurement).toContain('/suppliers')
    expect(ROLE_MENU_MAP.procurement).not.toContain('/inbound')
  })

  it('keeps technical modeling visible to technicians and read-focused doctors without warehouse execution pages', () => {
    expect(ROLE_MENU_MAP.technician).toEqual(expect.arrayContaining(['/projects', '/bom', '/equipment', '/labor-times']))
    expect(ROLE_MENU_MAP.technician).not.toContain('/outbound')
    expect(ROLE_MENU_MAP.pathologist).toEqual(expect.arrayContaining(['/projects', '/bom', '/equipment', '/labor-times']))
    expect(ROLE_MENU_MAP.pathologist).not.toContain('/outbound')
  })

  it('lets technicians review consumption and slice cost without finance configuration entries', () => {
    expect(ROLE_MENU_MAP.technician).toEqual(expect.arrayContaining(['/reconciliation', '/abc/slide-cost']))
    expect(ROLE_MENU_MAP.technician).not.toContain('/abc/fee-mappings')
    expect(ROLE_MENU_MAP.technician).not.toContain('/abc/activity-centers')
    expect(ROLE_MENU_MAP.technician).not.toContain('/abc/cost-pools')
  })

  it('keeps pathologists on read-only insight pages without reconciliation or finance configuration entries', () => {
    expect(ROLE_MENU_MAP.pathologist).toEqual(expect.arrayContaining([
      '/projects',
      '/bom',
      '/abc/slide-cost',
      '/abc/profitability',
      '/abc/trend',
      '/alerts',
    ]))
    expect(ROLE_MENU_MAP.pathologist).not.toContain('/reconciliation')
    expect(ROLE_MENU_MAP.pathologist).not.toContain('/abc/fee-mappings')
    expect(ROLE_MENU_MAP.pathologist).not.toContain('/abc/activity-centers')
    expect(ROLE_MENU_MAP.pathologist).not.toContain('/abc/cost-pools')
  })

  it('keeps managers focused on read-only operating insight without execution or configuration entries', () => {
    expect(ROLE_MENU_MAP.manager).toEqual(expect.arrayContaining([
      '/',
      '/alerts',
      '/inventory',
      '/abc/dashboard',
      '/abc/trend',
      '/abc/profitability',
    ]))
    expect(ROLE_MENU_MAP.manager).not.toContain('/users')
    expect(ROLE_MENU_MAP.manager).not.toContain('/roles')
    expect(ROLE_MENU_MAP.manager).not.toContain('/logs')
    expect(ROLE_MENU_MAP.manager).not.toContain('/inbound')
    expect(ROLE_MENU_MAP.manager).not.toContain('/outbound')
    expect(ROLE_MENU_MAP.manager).not.toContain('/stocktaking')
    expect(ROLE_MENU_MAP.manager).not.toContain('/reconciliation')
    expect(ROLE_MENU_MAP.manager).not.toContain('/abc/fee-mappings')
    expect(ROLE_MENU_MAP.manager).not.toContain('/abc/activity-centers')
    expect(ROLE_MENU_MAP.manager).not.toContain('/abc/cost-pools')
  })

  it('derives custom role paths from backend permission keys', () => {
    expect(getAllowedPaths('custom_inventory_reader', ['inventory:view'])).toEqual(['/', '/inventory'])
    expect(getAllowedPaths('custom_role_admin', ['roles:view', 'users:view'])).toEqual(['/', '/roles', '/users'])
    expect(getAllowedPaths('custom_model_reader', ['projects:view', 'bom:view', 'equipment:view', 'labor_times:view']))
      .toEqual(['/', '/projects', '/bom', '/equipment', '/equipment/types', '/equipment/depreciation', '/labor-times'])
  })

  it('keeps custom cost read-only roles on insight pages without finance execution or configuration entries', () => {
    const costObserverPaths = getAllowedPaths('custom_cost_observer', ['cost_analysis:view'])

    expect(costObserverPaths).toEqual([
      '/',
      '/abc/dashboard',
      '/abc/slide-cost',
      '/abc/profitability',
      '/abc/fee-comparison',
      '/abc/trend',
    ])
    expect(costObserverPaths).not.toContain('/reconciliation')
    expect(costObserverPaths).not.toContain('/indirect-costs')
    expect(costObserverPaths).not.toContain('/abc/fee-mappings')
    expect(costObserverPaths).not.toContain('/abc/activity-centers')
    expect(costObserverPaths).not.toContain('/abc/cost-pools')
  })

  it('keeps module-level custom cost roles broad enough for finance operations', () => {
    expect(getAllowedPaths('custom_finance_worker', ['cost_analysis'])).toEqual([
      '/',
      '/reconciliation',
      '/indirect-costs',
      '/abc/dashboard',
      '/abc/slide-cost',
      '/abc/profitability',
      '/abc/fee-comparison',
      '/abc/fee-mappings',
      '/abc/trend',
    ])
  })
})
