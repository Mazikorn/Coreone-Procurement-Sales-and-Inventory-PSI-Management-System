import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usersApi } from '@/api/users'
import { rolesApi } from '@/api/roles'
import { toast } from 'sonner'
import { getTemporaryPasswordOrThrow, useUsersPage } from './useUsersPage'

vi.mock('@/api/users', () => ({
  usersApi: {
    getList: vi.fn(),
    getStats: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    batchUpdateStatus: vi.fn(),
    batchDelete: vi.fn(),
    resetPassword: vi.fn(),
  },
}))

vi.mock('@/api/roles', () => ({
  rolesApi: {
    getList: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/hooks/useUrlParams', () => ({
  useUrlParams: () => ({
    get: vi.fn((_key: string, fallback = '') => fallback),
    getNumber: vi.fn((_key: string, fallback = 1) => fallback),
    setMultiple: vi.fn(),
  }),
}))

describe('useUsersPage password handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(usersApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(usersApi.getStats).mockResolvedValue({ totalUsers: 0, activeUsers: 0, inactiveUsers: 0, adminUsers: 0 } as any)
    vi.mocked(rolesApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
  })

  it('does not prefill the fixed default password when creating a user', async () => {
    const { result } = renderHook(() => useUsersPage())

    act(() => result.current.openCreate())

    expect(result.current.form.password).toBe('')
  })

  it('shows only the temporary password returned by the create API', async () => {
    vi.mocked(usersApi.create).mockResolvedValue({ id: 'user-1', initialPassword: 'Core@Temp12345' } as any)
    const { result } = renderHook(() => useUsersPage())

    act(() => result.current.openCreate())
    act(() => result.current.setForm({
      ...result.current.form,
      username: 'new-user',
      realName: '新用户',
      role: 'technician',
      password: '',
    }))
    await act(async () => {
      await result.current.handleSubmit()
    })

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('创建成功，初始密码：Core@Temp12345'))
    expect(toast.success).not.toHaveBeenCalledWith(expect.stringContaining('Abc@123456'))
  })

  it('trims user identity fields before create and rejects short initial passwords', async () => {
    vi.mocked(usersApi.create).mockResolvedValue({ id: 'user-trim', initialPassword: 'Core@Temp12345' } as any)
    const { result } = renderHook(() => useUsersPage())

    act(() => result.current.openCreate())
    act(() => result.current.setForm({
      ...result.current.form,
      username: '  trim-user  ',
      realName: '  修剪用户  ',
      role: ' technician ',
      department: ' 病理科 ',
      phone: ' 13800000000 ',
      email: ' trim@example.com ',
      password: '123',
    }))
    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(toast.error).toHaveBeenCalledWith('初始密码至少 8 位')
    expect(usersApi.create).not.toHaveBeenCalled()

    act(() => result.current.setForm({
      ...result.current.form,
      password: 'Strong@123',
    }))
    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(usersApi.create).toHaveBeenCalledWith(expect.objectContaining({
      username: 'trim-user',
      realName: '修剪用户',
      role: 'technician',
      department: '病理科',
      phone: '13800000000',
      email: 'trim@example.com',
      password: 'Strong@123',
    }))
  })

  it('does not fall back to a fixed password when reset API omits temporaryPassword', () => {
    expect(() => getTemporaryPasswordOrThrow({})).toThrow('接口未返回临时密码')
    expect(() => getTemporaryPasswordOrThrow(undefined)).toThrow('接口未返回临时密码')
    expect(getTemporaryPasswordOrThrow({ temporaryPassword: 'Core@Temp12345' })).toBe('Core@Temp12345')
  })

  it('keeps seeded business roles marked as system roles in user role selectors', async () => {
    vi.mocked(rolesApi.getList).mockResolvedValue({
      list: [
        { id: 'role-admin', code: 'admin', name: '管理员', userCount: 1, permissions: [], isSystem: true },
        { id: 'role-whm', code: 'warehouse_manager', name: '仓库管理员', userCount: 2, permissions: [] },
        { id: 'role-custom', code: 'custom_auditor', name: '审计查看员', userCount: 0, permissions: [], isSystem: false },
      ],
      pagination: { total: 3 },
    } as any)

    const { result } = renderHook(() => useUsersPage())

    await waitFor(() => expect(result.current.roles).toHaveLength(3))
    expect(result.current.roles.find(role => role.code === 'warehouse_manager')?.isSystem).toBe(true)
    expect(result.current.roles.find(role => role.code === 'custom_auditor')?.isSystem).toBe(false)
  })

  it('supports real batch status updates and batch deletes for selected users', async () => {
    vi.mocked(usersApi.getList).mockResolvedValue({
      list: [
        { id: 'user-1', username: 'u1', realName: '用户一', role: 'technician', permissions: [], status: 'active', createdAt: '2026-06-17' },
        { id: 'user-2', username: 'u2', realName: '用户二', role: 'technician', permissions: [], status: 'active', createdAt: '2026-06-17' },
      ],
      pagination: { total: 2 },
    } as any)
    vi.mocked(usersApi.batchUpdateStatus).mockResolvedValue({ updatedCount: 2 } as any)
    vi.mocked(usersApi.batchDelete).mockResolvedValue({ deletedCount: 2 } as any)
    const { result } = renderHook(() => useUsersPage())

    await waitFor(() => expect(result.current.data).toHaveLength(2))

    act(() => result.current.toggleSelectAll())
    expect(result.current.selectedIds).toEqual(new Set(['user-1', 'user-2']))

    await act(async () => {
      await result.current.batchToggleStatus('inactive')
    })

    expect(usersApi.batchUpdateStatus).toHaveBeenCalledWith(['user-1', 'user-2'], 'inactive')
    expect(usersApi.update).not.toHaveBeenCalled()
    expect(result.current.selectedIds.size).toBe(0)

    act(() => {
      result.current.toggleSelect('user-1')
      result.current.toggleSelect('user-2')
    })
    act(() => result.current.batchDelete())
    expect(result.current.confirmOpen).toBe(true)
    await act(async () => {
      await result.current.confirmProps?.onConfirm()
    })

    expect(usersApi.batchDelete).toHaveBeenCalledWith(['user-1', 'user-2'])
    expect(usersApi.delete).not.toHaveBeenCalled()
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('excludes protected admin accounts from batch selection', async () => {
    vi.mocked(usersApi.getList).mockResolvedValue({
      list: [
        { id: 'USER-001', username: 'admin', realName: '管理员', role: 'admin', permissions: ['*'], status: 'active', createdAt: '2026-06-17' },
        { id: 'user-1', username: 'u1', realName: '用户一', role: 'technician', permissions: [], status: 'active', createdAt: '2026-06-17' },
      ],
      pagination: { total: 2 },
    } as any)
    const { result } = renderHook(() => useUsersPage())

    await waitFor(() => expect(result.current.data).toHaveLength(2))

    act(() => result.current.toggleSelectAll())
    expect(result.current.selectedIds).toEqual(new Set(['user-1']))

    act(() => result.current.toggleSelect('USER-001'))
    expect(result.current.selectedIds).toEqual(new Set(['user-1']))
  })
})
