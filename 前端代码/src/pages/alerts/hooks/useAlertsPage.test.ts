import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { alertsApi } from '@/api/alerts'
import { buildAlertHandleRemark, useAlertsPage } from './useAlertsPage'

vi.mock('@/api/alerts')
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('buildAlertHandleRemark', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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
})
