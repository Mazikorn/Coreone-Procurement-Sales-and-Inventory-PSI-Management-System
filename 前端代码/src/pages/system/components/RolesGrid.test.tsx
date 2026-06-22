import React from 'react'
import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Role } from '@/types'
import { RolesGrid } from './RolesGrid'

const warehouseRole: Role = {
  id: 'role-warehouse',
  code: 'warehouse_manager',
  name: '仓库管理员',
  description: '负责库存、入库、出库、盘点管理',
  permissions: ['inventory:view'],
  status: 'active',
  dataScope: 'dept',
  userCount: 2,
  isSystem: true,
  associatedUsers: [],
  createdAt: '2026-06-20T08:00:00',
}

const customRole: Role = {
  id: 'role-custom',
  code: 'role_custom_auditor',
  name: '审计查看员',
  description: '只读查看审计数据',
  permissions: ['logs:view'],
  status: 'active',
  dataScope: 'self',
  userCount: 0,
  associatedUsers: [],
  createdAt: '2026-06-20T09:00:00',
}

describe('RolesGrid', () => {
  it('uses backend isSystem to protect system roles', () => {
    render(
      <RolesGrid
        data={[warehouseRole, customRole]}
        loading={false}
        onDetail={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        getDataScopeLabel={() => '本部门数据'}
      />
    )

    const warehouseCard = screen.getByText('仓库管理员').closest('div[class*="bg-white"]')!
    expect(within(warehouseCard).getByText('系统角色')).toBeInTheDocument()
    expect(within(warehouseCard).queryByText('编辑')).not.toBeInTheDocument()
    expect(within(warehouseCard).queryByText('删除')).not.toBeInTheDocument()

    const customCard = screen.getByText('审计查看员').closest('div[class*="bg-white"]')!
    expect(within(customCard).getByText('自定义')).toBeInTheDocument()
    expect(within(customCard).getByText('编辑')).toBeInTheDocument()
    expect(within(customCard).getByText('删除')).toBeInTheDocument()
  })

  it('does not protect a role only because its code matches an old seeded role name', () => {
    render(
      <RolesGrid
        data={[{ ...warehouseRole, isSystem: false }]}
        loading={false}
        onDetail={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        getDataScopeLabel={() => '本部门数据'}
      />
    )

    const warehouseCard = screen.getByText('仓库管理员').closest('div[class*="bg-white"]')!
    expect(within(warehouseCard).getByText('自定义')).toBeInTheDocument()
    expect(within(warehouseCard).getByText('编辑')).toBeInTheDocument()
    expect(within(warehouseCard).getByText('删除')).toBeInTheDocument()
  })
})
