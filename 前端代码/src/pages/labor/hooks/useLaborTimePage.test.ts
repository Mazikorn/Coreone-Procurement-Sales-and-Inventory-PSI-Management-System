import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { laborTimeApi } from '@/api/master'
import { useLaborTimePage } from './useLaborTimePage'

vi.mock('@/api/master', () => ({
  laborTimeApi: {
    getList: vi.fn(),
    getStats: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const laborTime = {
  id: 'labor-1',
  stepCode: 'LAB-IHC-LOCKED',
  stepName: '抗体孵育',
  projectType: 'ihc',
  standardMinutes: 30,
  laborRatePerMinute: 2,
  isEquipmentStep: false,
  description: '',
  sortOrder: 10,
  referenceSource: 'system',
  referenceSourceLabel: '系统预设',
  createdAt: '2026-06-20T00:00:00.000Z',
  updatedAt: '2026-06-20T00:00:00.000Z',
} as const

describe('useLaborTimePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
    localStorage.clear()
    localStorage.setItem('user', JSON.stringify({ role: 'admin' }))
    vi.mocked(laborTimeApi.getList).mockResolvedValue({ list: [laborTime], pagination: { total: 1 } } as any)
    vi.mocked(laborTimeApi.getStats).mockResolvedValue({ total: 1, totalMinutes: 30, avgRate: 2, equipmentSteps: 0 } as any)
    vi.mocked(laborTimeApi.update).mockResolvedValue({ id: 'labor-1' } as any)
  })

  it('allows finance users to manage labor time cost parameters', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'finance' }))

    const { result } = renderHook(() => useLaborTimePage())

    expect(result.current.canManageLaborTimes).toBe(true)
  })

  it('allows technician users to manage standard labor time steps', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'technician' }))

    const { result } = renderHook(() => useLaborTimePage())

    expect(result.current.canManageLaborTimes).toBe(true)
  })

  it('keeps pathologist users read-only for standard labor times', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'pathologist', permissions: ['labor_times:view'] }))

    const { result } = renderHook(() => useLaborTimePage())

    expect(result.current.canManageLaborTimes).toBe(false)
  })

  it('keeps backend-controlled step code and project type out of edit updates', async () => {
    const { result } = renderHook(() => useLaborTimePage())
    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.openEdit(laborTime as any)
      result.current.setForm({
        standardMinutes: laborTime.standardMinutes,
        laborRatePerMinute: laborTime.laborRatePerMinute,
        isEquipmentStep: laborTime.isEquipmentStep,
        description: laborTime.description,
        sortOrder: laborTime.sortOrder,
        referenceSource: laborTime.referenceSource,
        stepCode: 'LAB-CHANGED-BY-UI',
        projectType: 'he',
        stepName: '更新后的抗体孵育',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(laborTimeApi.update).toHaveBeenCalledWith('labor-1', expect.objectContaining({
      stepCode: 'LAB-IHC-LOCKED',
      projectType: 'ihc',
      stepName: '更新后的抗体孵育',
    }))
  })

  it('uses keyword from URL so audit links open a filtered labor time list', async () => {
    window.history.replaceState(null, '', '/labor-times?keyword=LAB-DEEP-001')

    const { result } = renderHook(() => useLaborTimePage())

    await waitFor(() => expect(laborTimeApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      keyword: 'LAB-DEEP-001',
    })))
    await waitFor(() => expect(laborTimeApi.getStats).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'LAB-DEEP-001',
    })))
    expect(result.current.searchInput).toBe('LAB-DEEP-001')
  })
})
