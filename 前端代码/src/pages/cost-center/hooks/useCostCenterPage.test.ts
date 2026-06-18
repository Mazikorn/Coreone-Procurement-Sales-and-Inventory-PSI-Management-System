import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { indirectCostApi } from '@/api/master'
import { toast } from 'sonner'
import { useCostCenterPage } from './useCostCenterPage'

vi.mock('@/api/master', () => ({
  indirectCostApi: {
    getList: vi.fn(),
    getStats: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    getAllocations: vi.fn(),
    recordAllocation: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const mockCenter = {
  id: 'cc-1',
  code: 'IDC-001',
  name: '房租成本',
  costType: 'rent',
  monthlyAmount: 1000,
  allocationBase: 'sample_count',
  status: 'active',
}

describe('useCostCenterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(indirectCostApi.getList).mockResolvedValue({
      list: [mockCenter],
      pagination: { page: 1, pageSize: 20, total: 1 },
    } as any)
    vi.mocked(indirectCostApi.getStats).mockResolvedValue({
      total: 1,
      active: 1,
      totalMonthly: 1000,
      allocationCount: 0,
    } as any)
    vi.mocked(indirectCostApi.getAllocations).mockResolvedValue({ list: [] } as any)
  })

  it('does not submit negative monthly amount', async () => {
    const { result } = renderHook(() => useCostCenterPage())
    await waitFor(() => expect(indirectCostApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.setForm({
        code: 'IDC-002',
        name: '水电成本',
        costType: 'utilities',
        monthlyAmount: -1,
        allocationBase: 'sample_count',
        description: '',
        status: 'active',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(indirectCostApi.create).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('月度金额必须大于等于0')
  })

  it('does not submit allocation when base value is zero', async () => {
    const { result } = renderHook(() => useCostCenterPage())
    await waitFor(() => expect(indirectCostApi.getList).toHaveBeenCalled())

    await act(async () => {
      await result.current.openAllocation(mockCenter as any)
    })
    act(() => {
      result.current.setAllocationForm({
        yearMonth: '2026-06',
        totalAmount: 1000,
        allocationBaseValue: 0,
      })
    })

    await act(async () => {
      await result.current.handleAllocationSubmit()
    })

    expect(indirectCostApi.recordAllocation).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('分摊基础值必须大于0')
  })

  it('does not submit allocation with invalid year month', async () => {
    const { result } = renderHook(() => useCostCenterPage())
    await waitFor(() => expect(indirectCostApi.getList).toHaveBeenCalled())

    await act(async () => {
      await result.current.openAllocation(mockCenter as any)
    })
    act(() => {
      result.current.setAllocationForm({
        yearMonth: '2026-6',
        totalAmount: 1000,
        allocationBaseValue: 100,
      })
    })

    await act(async () => {
      await result.current.handleAllocationSubmit()
    })

    expect(indirectCostApi.recordAllocation).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('年月格式必须为 YYYY-MM')
  })

  it('does not send all as a real status filter', async () => {
    const { result } = renderHook(() => useCostCenterPage())
    await waitFor(() => expect(indirectCostApi.getList).toHaveBeenCalled())
    vi.mocked(indirectCostApi.getList).mockClear()

    act(() => {
      result.current.handleStatusChange('all')
    })

    await waitFor(() => expect(indirectCostApi.getList).toHaveBeenCalled())
    expect(indirectCostApi.getList).toHaveBeenLastCalledWith(expect.not.objectContaining({
      status: 'all',
    }))
  })
})
