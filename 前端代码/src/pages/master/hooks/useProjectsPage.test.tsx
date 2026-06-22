import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bomApi, projectApi } from '@/api/master'
import { useProjectsPage } from './useProjectsPage'

vi.mock('@/api/master')
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

describe('useProjectsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/projects')
    window.localStorage.setItem('user', JSON.stringify({ role: 'admin', username: 'admin' }))

    vi.mocked(projectApi.getList).mockResolvedValue({
      list: [],
      pagination: { total: 0, page: 1, pageSize: 20 },
    } as any)
    vi.mocked(projectApi.getStats).mockResolvedValue({
      total: 0,
      active: 0,
      inactive: 0,
      noBom: 0,
    } as any)
    vi.mocked(bomApi.getList).mockResolvedValue({
      list: [],
      pagination: { total: 0 },
    } as any)
  })

  it('checks status impacts before saving an edit that changes project status', async () => {
    vi.mocked(projectApi.checkStatus).mockResolvedValue({
      project: { id: 'prj-edit-status', code: 'PRJ-001', name: '免疫组化检测' },
      targetStatus: 'inactive',
      canChange: true,
      impacts: {
        bomCount: 1,
        directBomCount: 1,
        serviceBomCount: 0,
        outboundCount: 1,
        lisCaseCount: 1,
        invalidBomCount: 0,
      },
      reasons: [],
      warnings: ['停用后该检测服务不能用于新出库'],
    } as any)

    const { result } = renderHook(() => useProjectsPage())
    await waitFor(() => expect(projectApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.openEdit({
        id: 'prj-edit-status',
        code: 'PRJ-001',
        name: '免疫组化检测',
        type: 'ihc',
        cycle: '2天',
        manager: '张三',
        status: 'active',
        description: '原说明',
        bomId: 'bom-1',
      } as any)
    })

    act(() => {
      result.current.setForm({
        ...result.current.form,
        name: '免疫组化检测-更新',
        status: 'inactive',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(projectApi.checkStatus).toHaveBeenCalledWith('prj-edit-status', 'inactive')
    expect(projectApi.update).not.toHaveBeenCalled()
    expect(result.current.statusTarget?.id).toBe('prj-edit-status')
    expect(result.current.statusTargetStatus).toBe('inactive')
    expect(result.current.statusCheck?.warnings).toContain('停用后该检测服务不能用于新出库')
  })

  it('allows technicians to manage projects because they own project and BOM configuration', async () => {
    window.localStorage.setItem('user', JSON.stringify({ role: 'technician', username: 'zhangwei' }))

    const { result } = renderHook(() => useProjectsPage())
    await waitFor(() => expect(projectApi.getList).toHaveBeenCalled())

    expect(result.current.canWrite).toBe(true)
  })

  it('keeps deleted project review context from audit links', async () => {
    window.history.replaceState(null, '', '/projects?keyword=prj-deleted-001&includeDeleted=true')
    vi.mocked(projectApi.getList).mockResolvedValue({
      list: [{
        id: 'prj-deleted-001',
        code: 'PRJ-DEL-001',
        name: '已删除检测项目',
        type: 'ihc',
        status: 'active',
        isDeleted: true,
        createdAt: '2026-06-22',
      }],
      pagination: { total: 1, page: 1, pageSize: 20 },
    } as any)

    const { result } = renderHook(() => useProjectsPage())

    await waitFor(() => expect(projectApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'prj-deleted-001',
      includeDeleted: true,
    })))
    expect(projectApi.getStats).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'prj-deleted-001',
      includeDeleted: true,
    }))
    expect(result.current.data).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'prj-deleted-001',
        isDeleted: true,
      }),
    ]))
  })

  it('uses the original readonly service code when editing even if local form state is mutated', async () => {
    vi.mocked(projectApi.update).mockResolvedValue({} as any)

    const { result } = renderHook(() => useProjectsPage())
    await waitFor(() => expect(projectApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.openEdit({
        id: 'prj-readonly-code',
        code: 'PRJ-LOCKED-001',
        name: 'HE检测',
        type: 'he',
        cycle: '1天',
        manager: '李四',
        status: 'active',
        description: '原说明',
        bomId: '',
      } as any)
    })

    act(() => {
      result.current.setForm({
        ...result.current.form,
        code: 'PRJ-MUTATED-999',
        name: 'HE检测-更新',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(projectApi.update).toHaveBeenCalledWith('prj-readonly-code', expect.objectContaining({
      code: 'PRJ-LOCKED-001',
      name: 'HE检测-更新',
    }))
    expect(projectApi.update).toHaveBeenCalledWith('prj-readonly-code', expect.not.objectContaining({
      code: 'PRJ-MUTATED-999',
    }))
  })

  it('submits the full edit payload after status impact confirmation', async () => {
    vi.mocked(projectApi.checkStatus).mockResolvedValue({
      project: { id: 'prj-confirm-status', code: 'PRJ-002', name: 'HE检测' },
      targetStatus: 'inactive',
      canChange: true,
      impacts: {
        bomCount: 0,
        directBomCount: 0,
        serviceBomCount: 0,
        outboundCount: 0,
        lisCaseCount: 0,
        invalidBomCount: 0,
      },
      reasons: [],
      warnings: ['停用后该检测服务不能用于新出库'],
    } as any)
    vi.mocked(projectApi.update).mockResolvedValue({} as any)

    const { result } = renderHook(() => useProjectsPage())
    await waitFor(() => expect(projectApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.openEdit({
        id: 'prj-confirm-status',
        code: 'PRJ-002',
        name: 'HE检测',
        type: 'he',
        cycle: '1天',
        manager: '李四',
        status: 'active',
        description: '原说明',
        bomId: 'bom-old',
      } as any)
    })

    act(() => {
      result.current.setForm({
        ...result.current.form,
        name: 'HE检测-更新',
        cycle: '3天',
        manager: '王五',
        description: '更新说明',
        bomId: 'bom-new',
        status: 'inactive',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })
    await act(async () => {
      await result.current.handleStatusConfirm()
    })

    expect(projectApi.update).toHaveBeenCalledWith('prj-confirm-status', expect.objectContaining({
      code: 'PRJ-002',
      name: 'HE检测-更新',
      type: 'he',
      cycle: '3天',
      manager: '王五',
      description: '更新说明',
      bomId: 'bom-new',
      status: 'inactive',
    }))
  })
})
