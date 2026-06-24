import { describe, expect, it } from 'vitest'
import { ROLE_MENU_MAP } from '@/lib/permissions'
import { getVisibleMenuGroups } from './AppSidebar'

function groupTitles(role: keyof typeof ROLE_MENU_MAP) {
  return getVisibleMenuGroups(role, ROLE_MENU_MAP[role]).map(group => group.title)
}

function itemLabels(role: keyof typeof ROLE_MENU_MAP, groupTitle: string) {
  return getVisibleMenuGroups(role, ROLE_MENU_MAP[role])
    .find(group => group.title === groupTitle)
    ?.items.map(item => item.label) || []
}

describe('AppSidebar business-order navigation', () => {
  it('puts admin setup and master data before downstream execution groups', () => {
    expect(groupTitles('admin')).toEqual([
      '系统设置',
      '基础数据',
      '采购管理',
      '库存作业',
      '成本管理',
      '概览',
    ])
    expect(itemLabels('admin', '系统设置').slice(0, 2)).toEqual(['角色权限', '用户管理'])
  })

  it('puts procurement on supplier then purchase order handoff before inventory context', () => {
    expect(groupTitles('procurement')).toEqual([
      '采购管理',
      '库存作业',
      '基础数据',
      '概览',
    ])
    expect(itemLabels('procurement', '采购管理')).toEqual(['供应商管理', '采购订单'])
  })

  it('puts finance context and configuration before cost reports', () => {
    expect(groupTitles('finance')).toEqual([
      '基础数据',
      '成本管理',
      '系统设置',
      '概览',
    ])
    expect(itemLabels('finance', '成本管理').slice(0, 4)).toEqual([
      'ABC配置',
      '成本池',
      '收费映射',
      '消耗对账',
    ])
    expect(itemLabels('finance', '成本管理')).toContain('供应商成本')
  })

  it('keeps managers insight-first and read-only', () => {
    expect(groupTitles('manager')).toEqual([
      '概览',
      '库存作业',
      '成本管理',
    ])
    expect(itemLabels('manager', '成本管理')).toEqual(['成本看板', '盈利分析', '成本趋势'])
  })
})
