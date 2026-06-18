import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FormData } from '../hooks/useRolesPage'
import { RoleFormModal } from './RoleFormModal'

const form: FormData = {
  code: 'custom-role',
  name: '自定义角色',
  description: '',
  permissions: [],
  status: 'active',
  dataScope: 'dept',
}

describe('RoleFormModal', () => {
  it('uses backend permission keys for configurable modules', () => {
    const onTogglePermission = vi.fn()
    render(
      <RoleFormModal
        open
        type="create"
        form={form}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        onTogglePermission={onTogglePermission}
      />
    )

    fireEvent.click(within(screen.getByText('供应商退货').closest('tr')!).getAllByRole('checkbox')[0])
    fireEvent.click(within(screen.getByText('检测服务').closest('tr')!).getAllByRole('checkbox')[0])

    expect(onTogglePermission).toHaveBeenCalledWith('supplier_returns', 'view')
    expect(onTogglePermission).toHaveBeenCalledWith('projects', 'view')
  })
})
