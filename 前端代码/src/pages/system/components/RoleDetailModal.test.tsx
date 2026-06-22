import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Role } from '@/types'
import { RoleDetailModal } from './RoleDetailModal'

const role: Role = {
  id: 'role-warehouse',
  code: 'warehouse_manager',
  name: '仓库管理员',
  description: '负责库存管理',
  permissions: ['inventory:view'],
  status: 'active',
  dataScope: 'self',
  isSystem: true,
  userCount: 1,
  associatedUsers: [
    {
      id: 'user-warehouse',
      username: 'wangkq',
      realName: '王克强',
      department: '病理科',
      status: 'active',
      lastLogin: '2026-06-17T08:40:00',
      createdAt: '2026-06-16T08:00:00',
    },
  ],
  createdAt: '2026-06-15T08:00:00',
}

describe('RoleDetailModal', () => {
  it('renders associated users instead of a fixed empty state', () => {
    render(<RoleDetailModal open role={role} onClose={vi.fn()} />)

    expect(screen.getByText('系统角色')).toBeInTheDocument()
    expect(screen.getByText('关联用户')).toBeInTheDocument()
    expect(screen.getByText('王克强')).toBeInTheDocument()
    expect(screen.getByText('wangkq · 病理科')).toBeInTheDocument()
    expect(screen.getByText('仅本人数据')).toBeInTheDocument()
    expect(screen.getByText('正常')).toBeInTheDocument()
    expect(screen.queryByText('暂无关联用户数据')).not.toBeInTheDocument()
  })

  it('shows custom when backend does not mark a seeded-code role as system', () => {
    render(<RoleDetailModal open role={{ ...role, isSystem: false }} onClose={vi.fn()} />)

    expect(screen.getByText('自定义')).toBeInTheDocument()
    expect(screen.queryByText('系统角色')).not.toBeInTheDocument()
  })
})
