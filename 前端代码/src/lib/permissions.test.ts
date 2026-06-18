import { describe, expect, it } from 'vitest'
import { getAllowedPaths, ROLE_MENU_MAP } from './permissions'

describe('ROLE_MENU_MAP', () => {
  it('allows finance to read operation logs without granting user or role management', () => {
    expect(ROLE_MENU_MAP.finance).toContain('/logs')
    expect(ROLE_MENU_MAP.finance).not.toContain('/users')
    expect(ROLE_MENU_MAP.finance).not.toContain('/roles')
  })

  it('derives custom role paths from backend permission keys', () => {
    expect(getAllowedPaths('custom_inventory_reader', ['inventory:view'])).toEqual(['/', '/inventory'])
    expect(getAllowedPaths('custom_role_admin', ['roles:view', 'users:view'])).toEqual(['/', '/roles', '/users'])
  })
})
