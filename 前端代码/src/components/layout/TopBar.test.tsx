import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import TopBar from './TopBar'

vi.mock('@/api/alerts', () => ({
  alertsApi: {
    getList: vi.fn().mockResolvedValue({
      data: [
        {
          id: 'alert-1',
          type: 'low_stock',
          message: '库存低于安全库存',
          status: 'pending',
          created_at: new Date().toISOString(),
        },
      ],
    }),
  },
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-path">{location.pathname}</div>
}

function renderTopBar(user = { username: 'admin', realName: '管理员', role: 'admin' }) {
  localStorage.setItem('token', 'test-token')
  localStorage.setItem('user', JSON.stringify(user))
  return render(
    <MemoryRouter initialEntries={['/']}>
      <TopBar />
      <LocationProbe />
    </MemoryRouter>
  )
}

describe('TopBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('searches routes and navigates to the selected function', async () => {
    renderTopBar()

    fireEvent.change(screen.getByPlaceholderText('全局搜索...'), { target: { value: '退库' } })
    fireEvent.click(screen.getByRole('button', { name: /退库管理/ }))

    expect(screen.getByTestId('location-path')).toHaveTextContent('/returns')
    expect(screen.queryByText('无匹配功能')).not.toBeInTheDocument()
  })

  it('does not show a fake mark-all-read action in notifications', async () => {
    renderTopBar()

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: '通知消息' }))

    expect(screen.getByText('库存低于安全库存')).toBeInTheDocument()
    expect(screen.queryByText('标记全部已读')).not.toBeInTheDocument()
  })

  it('hides management shortcuts from non-admin user menu', () => {
    renderTopBar({ username: 'wangkq', realName: '王库管', role: 'warehouse_manager' })

    fireEvent.click(screen.getByText('王库管'))

    expect(screen.getAllByText('王库管').length).toBeGreaterThan(0)
    expect(screen.queryByText('个人信息')).not.toBeInTheDocument()
    expect(screen.queryByText('用户管理')).not.toBeInTheDocument()
    expect(screen.queryByText('角色权限')).not.toBeInTheDocument()
    expect(screen.queryByText('操作日志')).not.toBeInTheDocument()
    expect(screen.getByText('退出登录')).toBeInTheDocument()
  })
})
