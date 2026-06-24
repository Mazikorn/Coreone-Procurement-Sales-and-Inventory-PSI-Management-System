import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bomApi, projectApi } from '@/api/master'
import { useProjectsPage } from './useProjectsPage'
import { toast } from 'sonner'

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

  it('opens the project edit modal on the BOM tab from reconciliation work links', async () => {
    window.history.replaceState(null, '', '/projects?keyword=未配置BOM项目&bom=unconfigured&action=edit&projectId=project-no-bom&tab=bom')
    vi.mocked(projectApi.getList).mockResolvedValue({
      list: [{
        id: 'project-no-bom',
        code: 'PRJ-NO-BOM',
        name: '未配置BOM项目',
        type: 'ihc',
        cycle: '2天',
        manager: '技师',
        status: 'active',
        description: '来自对账差异',
        bomId: '',
        createdAt: '2026-06-22',
      }],
      pagination: { total: 1, page: 1, pageSize: 20 },
    } as any)

    const { result } = renderHook(() => useProjectsPage())

    await waitFor(() => expect(projectApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      keyword: '未配置BOM项目',
      bomFilter: 'unconfigured',
    })))
    await waitFor(() => expect(result.current.modalType).toBe('edit'))

    expect(result.current.editingRow?.id).toBe('project-no-bom')
    expect(result.current.editTab).toBe('bom')
    expect(result.current.form.name).toBe('未配置BOM项目')
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

  it('focuses the newly created project so BOM, outbound, and reconciliation users can immediately use the service', async () => {
    window.history.replaceState(null, '', '/projects?page=5&keyword=old-project&type=fish&status=inactive&bom=unconfigured')
    vi.mocked(projectApi.create).mockResolvedValue({
      id: 'prj-created',
      code: 'PRJ-CREATED-001',
      name: '新建检测服务',
    } as any)

    const { result } = renderHook(() => useProjectsPage())
    await waitFor(() => expect(projectApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.openCreate()
    })
    act(() => {
      result.current.setForm({
        ...result.current.form,
        code: 'PRJ-DRAFT-001',
        name: '新建检测服务',
        type: 'ihc',
        cycle: '2天',
        manager: '张技师',
        status: 'active',
        description: '用于当天出库和对账',
        bomId: 'bom-1',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(projectApi.create).toHaveBeenCalledWith(expect.objectContaining({
      code: 'PRJ-DRAFT-001',
      name: '新建检测服务',
      type: 'ihc',
      cycle: '2天',
      manager: '张技师',
      status: 'active',
      description: '用于当天出库和对账',
      bomId: 'bom-1',
    }))
    expect(result.current.keyword).toBe('PRJ-CREATED-001')
    expect(result.current.typeFilter).toBe('')
    expect(result.current.statusFilter).toBe('')
    expect(result.current.bomFilter).toBe('')
    await waitFor(() => {
      expect(projectApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        page: 1,
        pageSize: 20,
        keyword: 'PRJ-CREATED-001',
      }))
    })
    const focusedCall = vi.mocked(projectApi.getList).mock.calls.find(([params]) =>
      params.keyword === 'PRJ-CREATED-001'
    )?.[0] as any
    expect(focusedCall).not.toHaveProperty('type')
    expect(focusedCall).not.toHaveProperty('status')
    expect(focusedCall).not.toHaveProperty('bomFilter')
  })

  it('keeps the newly created project visible when the focused refresh fails', async () => {
    vi.mocked(projectApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValue(new Error('列表刷新失败'))
    vi.mocked(projectApi.create).mockResolvedValue({
      id: 'prj-created-local',
      code: 'PRJ-CREATED-LOCAL',
      name: '现场新增检测服务',
      createdAt: '2026-06-23',
    } as any)

    const { result } = renderHook(() => useProjectsPage())
    await waitFor(() => expect(projectApi.getList).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.openCreate()
    })
    act(() => {
      result.current.setForm({
        ...result.current.form,
        code: 'PRJ-DRAFT-LOCAL',
        name: '现场新增检测服务',
        type: 'ihc',
        cycle: '2天',
        manager: '张技师',
        status: 'active',
        description: '当天出库要用',
        bomId: 'bom-1',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })
    await waitFor(() => expect(projectApi.getList).toHaveBeenCalledTimes(2))

    expect(result.current.data[0]).toEqual(expect.objectContaining({
      id: 'prj-created-local',
      code: 'PRJ-CREATED-LOCAL',
      name: '现场新增检测服务',
      type: 'ihc',
      status: 'active',
      bomId: 'bom-1',
    }))
    expect(result.current.total).toBe(1)
    expect(toast.success).toHaveBeenCalledWith('检测服务创建成功')
    expect(toast.error).not.toHaveBeenCalledWith('操作失败')
  })

  it('keeps edited project facts visible when the follow-up refresh fails', async () => {
    vi.mocked(projectApi.getList)
      .mockResolvedValueOnce({
        list: [{
          id: 'prj-edit-local',
          code: 'PRJ-EDIT-LOCAL',
          name: 'HE检测',
          type: 'he',
          cycle: '1天',
          manager: '李四',
          status: 'active',
          description: '原说明',
          bomId: '',
          createdAt: '2026-06-23',
        }],
        pagination: { total: 1, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValue(new Error('列表刷新失败'))
    vi.mocked(projectApi.update).mockResolvedValue({} as any)

    const { result } = renderHook(() => useProjectsPage())
    await waitFor(() => expect(result.current.data[0]?.id).toBe('prj-edit-local'))

    act(() => {
      result.current.openEdit(result.current.data[0])
    })
    act(() => {
      result.current.setForm({
        ...result.current.form,
        name: 'HE检测-更新',
        cycle: '3天',
        manager: '王五',
        description: '已补齐BOM说明',
        bomId: 'bom-new',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(result.current.data[0]).toEqual(expect.objectContaining({
      id: 'prj-edit-local',
      code: 'PRJ-EDIT-LOCAL',
      name: 'HE检测-更新',
      cycle: '3天',
      manager: '王五',
      description: '已补齐BOM说明',
      bomId: 'bom-new',
    }))
    expect(toast.success).toHaveBeenCalledWith('检测服务更新成功')
    expect(toast.error).not.toHaveBeenCalledWith('操作失败')
  })

  it('removes a disabled project from the active filter when the refresh fails', async () => {
    window.history.replaceState(null, '', '/projects?status=active')
    vi.mocked(projectApi.getList)
      .mockResolvedValueOnce({
        list: [{
          id: 'prj-disable-local',
          code: 'PRJ-DISABLE-LOCAL',
          name: '待停用检测服务',
          type: 'he',
          status: 'active',
          createdAt: '2026-06-23',
        }],
        pagination: { total: 1, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValue(new Error('列表刷新失败'))
    vi.mocked(projectApi.checkStatus).mockResolvedValue({
      project: { id: 'prj-disable-local', code: 'PRJ-DISABLE-LOCAL', name: '待停用检测服务' },
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
      warnings: [],
    } as any)
    vi.mocked(projectApi.update).mockResolvedValue({} as any)

    const { result } = renderHook(() => useProjectsPage())
    await waitFor(() => expect(result.current.data[0]?.id).toBe('prj-disable-local'))

    await act(async () => {
      await result.current.openStatus(result.current.data[0])
    })
    await act(async () => {
      await result.current.handleStatusConfirm()
    })

    expect(result.current.data).toHaveLength(0)
    expect(result.current.total).toBe(0)
    expect(result.current.selectedIds.size).toBe(0)
    expect(toast.success).toHaveBeenCalledWith('检测服务已停用')
    expect(toast.error).not.toHaveBeenCalledWith('操作失败')
  })

  it('focuses a single imported project so users can confirm the Excel row entered the system', async () => {
    window.history.replaceState(null, '', '/projects?page=5&keyword=old-project&type=fish&status=inactive&bom=unconfigured')
    vi.mocked(projectApi.create).mockResolvedValue({
      id: 'prj-imported',
      code: 'PRJ-IMPORTED-001',
      name: '导入检测服务',
    } as any)

    const { result } = renderHook(() => useProjectsPage())
    await waitFor(() => expect(projectApi.getList).toHaveBeenCalled())

    await act(async () => {
      await result.current.handleImportProjects([{
        code: 'PRJ-IMPORT-DRAFT-001',
        name: '导入检测服务',
        type: 'ihc',
        cycle: '2天',
        manager: '张技师',
        status: 'active',
        description: '来自线下Excel',
        bomId: 'bom-1',
      }])
    })

    expect(projectApi.create).toHaveBeenCalledWith(expect.objectContaining({
      code: 'PRJ-IMPORT-DRAFT-001',
      name: '导入检测服务',
      type: 'ihc',
      cycle: '2天',
      manager: '张技师',
      status: 'active',
      description: '来自线下Excel',
      bomId: 'bom-1',
    }))
    expect(result.current.keyword).toBe('PRJ-IMPORTED-001')
    expect(result.current.typeFilter).toBe('')
    expect(result.current.statusFilter).toBe('')
    expect(result.current.bomFilter).toBe('')
    await waitFor(() => {
      expect(projectApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        page: 1,
        pageSize: 20,
        keyword: 'PRJ-IMPORTED-001',
      }))
    })
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
