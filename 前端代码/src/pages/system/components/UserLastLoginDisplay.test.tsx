import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { User } from '@/types'
import type { RoleItem } from '../hooks/useUsersPage'
import { UserDetailModal } from './UserDetailModal'
import { UsersTable } from './UsersTable'

const user: User = {
  id: 'user-last-login',
  username: 'last-login-user',
  realName: '最后登录用户',
  role: 'technician',
  permissions: [],
  dataScope: 'dept',
  department: '病理科',
  phone: '',
  email: '',
  status: 'active',
  lastLogin: '2026-06-17T08:24:00',
  createdAt: '2026-06-16T09:00:00',
}

const roles: RoleItem[] = [
  { id: 'role-technician', code: 'technician', name: '技术员', userCount: 1, description: '', permissions: [] },
]

describe('user last login display', () => {
  it('renders last login in the users table instead of a fixed dash', () => {
    render(
      <UsersTable
        data={[user]}
        loading={false}
        total={1}
        page={1}
        pageSize={20}
        keyword=""
        roleFilter=""
        statusFilter=""
        selectedRoleId=""
        selectedIds={new Set()}
        roles={roles}
        onKeywordChange={vi.fn()}
        onRoleFilterChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onSelectedRoleIdChange={vi.fn()}
        onToggleSelectAll={vi.fn()}
        onToggleSelect={vi.fn()}
        onClearSelection={vi.fn()}
        onBatchToggleStatus={vi.fn()}
        onBatchDelete={vi.fn()}
        onSearch={vi.fn()}
        onReset={vi.fn()}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        onOpenDetail={vi.fn()}
        onOpenEdit={vi.fn()}
        onToggleStatus={vi.fn()}
        onResetPassword={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText(/2026\/06\/17/)).toBeInTheDocument()
    expect(screen.queryByText('-', { selector: 'td' })).not.toBeInTheDocument()
  })

  it('renders last login in the user detail modal', () => {
    render(
      <UserDetailModal
        open
        user={user}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    )

    expect(screen.getByText('最后登录')).toBeInTheDocument()
    expect(screen.getByText(/2026\/06\/17/)).toBeInTheDocument()
  })

  it('renders real role permissions in the user detail modal', () => {
    render(
      <UserDetailModal
        open
        user={{ ...user, permissions: ['inventory:view', 'inbound:create'] }}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    )

    expect(screen.getByText('2 项权限')).toBeInTheDocument()
    expect(screen.getByText('已授权: inventory:view')).toBeInTheDocument()
    expect(screen.getByText('已授权: inbound:create')).toBeInTheDocument()
    expect(screen.queryByText('暂无权限信息')).not.toBeInTheDocument()
  })

  it('renders the real data scope in the user detail modal', () => {
    render(
      <UserDetailModal
        open
        user={{ ...user, dataScope: 'self' }}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />
    )

    expect(screen.getByText('数据范围: 仅本人数据')).toBeInTheDocument()
    expect(screen.queryByText('数据范围: 本部门数据')).not.toBeInTheDocument()
  })
})
