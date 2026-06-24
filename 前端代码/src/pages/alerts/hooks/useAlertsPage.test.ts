import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { alertsApi } from '@/api/alerts'
import { buildAlertHandleRemark, type AlertItem, useAlertsPage } from './useAlertsPage'
import { toast } from 'sonner'

vi.mock('@/api/alerts')
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const pendingAlert = (id = 'alert-1'): AlertItem => ({
  id,
  type: 'low-stock',
  level: 'warning',
  materialId: 'mat-1',
  materialName: id === 'alert-2' ? '免疫试剂B' : '免疫试剂A',
  message: id === 'alert-2' ? '免疫试剂B库存不足' : '免疫试剂A库存不足',
  status: 'pending',
  currentStock: 1,
  threshold: 5,
  createdAt: '2026-06-22T09:00:00.000Z',
})

describe('buildAlertHandleRemark', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.setItem('user', JSON.stringify({ role: 'admin' }))
    window.history.replaceState(null, '', '/alerts')
    vi.mocked(alertsApi.getList).mockResolvedValue({
      list: [],
      pagination: { total: 0, page: 1, pageSize: 10 },
    } as any)
    vi.mocked(alertsApi.getStats).mockResolvedValue({
      total: 0,
      pending: 0,
      processed: 0,
      ignored: 0,
      today: 0,
      month: 0,
    } as any)
    vi.mocked(alertsApi.process).mockResolvedValue({} as any)
    vi.mocked(alertsApi.ignore).mockResolvedValue({} as any)
    vi.mocked(alertsApi.batchHandle).mockResolvedValue({} as any)
  })

  it('records the selected handling conclusion and opinion', () => {
    expect(buildAlertHandleRemark({
      result: 'purchase_followed',
      opinion: '已通知采购补货',
    })).toBe('处理结论：采购跟进中\n处理意见：已通知采购补货')
  })

  it('does not claim inventory was adjusted by the alert handler', () => {
    expect(buildAlertHandleRemark({
      result: 'adjusted',
      opinion: '库存已修正',
    })).toBe('处理结论：其他处理\n处理意见：库存已修正')
  })

  it('reads the spec quick URL parameter and maps handled to the processed alert status request', async () => {
    window.history.replaceState(null, '', '/alerts?quick=handled&page=3')

    const { result } = renderHook(() => useAlertsPage())

    await waitFor(() => expect(alertsApi.getList).toHaveBeenCalled())
    expect(result.current.quickFilter).toBe('processed')
    expect(alertsApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      page: 3,
      pageSize: 10,
      status: 'processed,auto_resolved,handled',
    }))
  })

  it('writes quick filter changes to the spec quick URL parameter and resets pagination', async () => {
    window.history.replaceState(null, '', '/alerts?page=4&quickFilter=processed')

    const { result } = renderHook(() => useAlertsPage())
    await waitFor(() => expect(alertsApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.setQuickFilter('pending')
      result.current.setPage(1)
    })

    await waitFor(() => expect(window.location.search).toContain('quick=pending'))
    expect(window.location.search).not.toContain('quickFilter=')
    expect(window.location.search).not.toContain('page=4')
  })

  it('reads spec type and level URL parameters and maps them to existing API values', async () => {
    window.history.replaceState(null, '', '/alerts?type=stock_low&level=urgent&page=5')

    renderHook(() => useAlertsPage())

    await waitFor(() => expect(alertsApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      page: 5,
      pageSize: 10,
      type: 'low-stock',
      level: 'danger',
    })))
  })

  it('writes type and level filter changes to spec URL parameters and resets pagination', async () => {
    window.history.replaceState(null, '', '/alerts?page=4')

    const { result } = renderHook(() => useAlertsPage())
    await waitFor(() => expect(alertsApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.setFilter({
        ...result.current.filter,
        type: 'expiry',
        level: 'important',
      } as any)
      result.current.setPage(1)
    })

    await waitFor(() => expect(window.location.search).toContain('type=expiring'))
    expect(window.location.search).toContain('level=important')
    expect(window.location.search).not.toContain('page=4')
  })

  it('resets all filters and removes query parameters', async () => {
    window.history.replaceState(null, '', '/alerts?page=7&pageSize=20&keyword=abc&type=stock_low&level=urgent&quick=pending&status=ignored&startDate=2026-01-01&endDate=2026-01-31')

    const { result } = renderHook(() => useAlertsPage())
    await waitFor(() => expect(alertsApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.resetFilters()
    })

    await waitFor(() => expect(window.location.search).toBe(''))
    expect(result.current.filter).toEqual({
      keyword: '',
      type: 'all',
      level: 'all',
      status: 'all',
      dateRange: ['', ''],
    })
    expect(result.current.quickFilter).toBe('all')
    expect(result.current.page).toBe(1)
    expect(result.current.pageSize).toBe(10)
  })

  it('keeps a processed alert confirmable in the list when the follow-up refresh fails', async () => {
    vi.mocked(alertsApi.getList)
      .mockResolvedValueOnce({
        list: [pendingAlert()],
        pagination: { total: 1, page: 1, pageSize: 10 },
      } as any)
      .mockRejectedValue(new Error('refresh failed'))
    vi.mocked(alertsApi.getStats)
      .mockResolvedValueOnce({
        total: 1,
        pending: 1,
        processed: 0,
        ignored: 0,
        today: 1,
        month: 1,
      } as any)
      .mockRejectedValue(new Error('stats refresh failed'))

    const { result } = renderHook(() => useAlertsPage())
    await waitFor(() => expect(result.current.data[0]?.status).toBe('pending'))

    await act(async () => {
      await result.current.handleProcess('alert-1', '已通知采购补货')
    })

    expect(alertsApi.process).toHaveBeenCalledWith('alert-1', { remark: '已通知采购补货' })
    await waitFor(() => expect(alertsApi.getList).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.data[0]?.status).toBe('processed'))
    expect(result.current.error).toBeNull()
    expect(result.current.stats.pending).toBe(0)
    expect(result.current.stats.processed).toBe(1)
    expect(toast.success).toHaveBeenCalledWith('处理成功', {
      description: 'alert-1 已记录处理结论和意见；预警进入已处理，库存、批次和采购事实不会自动变更，仍需通过采购、入库或盘点闭环',
    })
  })

  it('removes an ignored alert from the pending queue when refresh fails after the action succeeds', async () => {
    window.history.replaceState(null, '', '/alerts?quick=pending')
    vi.mocked(alertsApi.getList)
      .mockResolvedValueOnce({
        list: [pendingAlert()],
        pagination: { total: 1, page: 1, pageSize: 10 },
      } as any)
      .mockRejectedValue(new Error('refresh failed'))
    vi.mocked(alertsApi.getStats)
      .mockResolvedValueOnce({
        total: 1,
        pending: 1,
        processed: 0,
        ignored: 0,
        today: 1,
        month: 1,
      } as any)
      .mockRejectedValue(new Error('stats refresh failed'))

    const { result } = renderHook(() => useAlertsPage())
    await waitFor(() => expect(result.current.data).toHaveLength(1))

    await act(async () => {
      await result.current.handleIgnore('alert-1', '已核实无需处理')
    })

    expect(alertsApi.ignore).toHaveBeenCalledWith('alert-1', { remark: '已核实无需处理' })
    await waitFor(() => expect(alertsApi.getList).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.data).toHaveLength(0))
    expect(result.current.error).toBeNull()
    expect(result.current.total).toBe(0)
    expect(result.current.stats.pending).toBe(0)
    expect(result.current.stats.ignored).toBe(1)
    expect(toast.success).toHaveBeenCalledWith('已忽略', {
      description: 'alert-1 已记录忽略原因；预警进入已忽略，库存、批次和采购事实不会自动变更，审计记录可按预警ID回看',
    })
  })

  it('clears processed batch alerts from the pending queue without waiting for list refresh', async () => {
    window.history.replaceState(null, '', '/alerts?quick=pending')
    vi.mocked(alertsApi.getList)
      .mockResolvedValueOnce({
        list: [pendingAlert('alert-1'), pendingAlert('alert-2')],
        pagination: { total: 2, page: 1, pageSize: 10 },
      } as any)
      .mockRejectedValue(new Error('refresh failed'))
    vi.mocked(alertsApi.getStats)
      .mockResolvedValueOnce({
        total: 2,
        pending: 2,
        processed: 0,
        ignored: 0,
        today: 2,
        month: 2,
      } as any)
      .mockRejectedValue(new Error('stats refresh failed'))

    const { result } = renderHook(() => useAlertsPage())
    await waitFor(() => expect(result.current.data).toHaveLength(2))

    act(() => {
      result.current.setSelectedIds(new Set(['alert-1', 'alert-2']))
    })
    await act(async () => {
      await result.current.handleBatchProcess()
    })

    expect(alertsApi.batchHandle).toHaveBeenCalledWith(['alert-1', 'alert-2'], {
      action: 'processed',
      remark: '批量处理',
    })
    await waitFor(() => expect(alertsApi.getList).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(result.current.data).toHaveLength(0))
    expect(result.current.error).toBeNull()
    expect(result.current.selectedIds.size).toBe(0)
    expect(result.current.total).toBe(0)
    expect(result.current.stats.pending).toBe(0)
    expect(result.current.stats.processed).toBe(2)
    expect(toast.success).toHaveBeenCalledWith('已处理 2 条预警', {
      description: '已记录 2 条预警的批量处理结论；库存、批次和采购事实不会自动变更，仍需通过采购、入库或盘点闭环',
    })
  })
})
