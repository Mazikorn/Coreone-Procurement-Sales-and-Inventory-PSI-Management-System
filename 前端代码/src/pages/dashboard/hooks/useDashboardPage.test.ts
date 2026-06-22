import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { abcApi } from '@/api/abc'
import { alertsApi } from '@/api/alerts'
import { inboundApi, inventoryApi, outboundApi } from '@/api/inventory'
import { useDashboardPage } from './useDashboardPage'

vi.mock('@/api/abc')
vi.mock('@/api/alerts')
vi.mock('@/api/inventory')

function setRole(role: string) {
  localStorage.setItem('user', JSON.stringify({
    id: `USER-${role}`,
    username: role,
    realName: role,
    role,
  }))
}

describe('useDashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()

    vi.mocked(inventoryApi.getStats).mockResolvedValue({ totalMaterials: 0 } as any)
    vi.mocked(alertsApi.getList).mockResolvedValue({ list: [] } as any)
    vi.mocked(inboundApi.getStats).mockResolvedValue({ total: 0, completed: 0 } as any)
    vi.mocked(inboundApi.getList).mockResolvedValue({ list: [] } as any)
    vi.mocked(outboundApi.getStats).mockResolvedValue({ total: 0, completed: 0 } as any)
    vi.mocked(outboundApi.getList).mockResolvedValue({ list: [] } as any)
    vi.mocked(abcApi.getDashboard).mockResolvedValue({ summary: { totalCost: 0, totalFee: 0, totalProfit: 0, profitRate: 0, caseCount: 0 } } as any)
  })

  it('does not make inventory, inbound, or outbound dashboard calls for finance users', async () => {
    setRole('finance')

    const { result } = renderHook(() => useDashboardPage())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(abcApi.getDashboard).toHaveBeenCalled()
    expect(alertsApi.getList).toHaveBeenCalled()
    expect(inventoryApi.getStats).not.toHaveBeenCalled()
    expect(inboundApi.getStats).not.toHaveBeenCalled()
    expect(inboundApi.getList).not.toHaveBeenCalled()
    expect(outboundApi.getStats).not.toHaveBeenCalled()
    expect(outboundApi.getList).not.toHaveBeenCalled()
  })

  it('does not make inbound dashboard calls for technician users', async () => {
    setRole('technician')

    renderHook(() => useDashboardPage())

    await waitFor(() => expect(outboundApi.getStats).toHaveBeenCalled())

    expect(inventoryApi.getStats).toHaveBeenCalled()
    expect(inboundApi.getStats).not.toHaveBeenCalled()
    expect(inboundApi.getList).not.toHaveBeenCalled()
    expect(outboundApi.getList).toHaveBeenCalled()
  })

  it('keeps pathologist dashboard on read-only cost insight without outbound execution calls', async () => {
    setRole('pathologist')

    const { result } = renderHook(() => useDashboardPage())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(abcApi.getDashboard).toHaveBeenCalled()
    expect(outboundApi.getStats).not.toHaveBeenCalled()
    expect(outboundApi.getList).not.toHaveBeenCalled()
    expect(result.current.config.quickActions.map(action => action.navigateTo)).not.toContain('/outbound')
  })

  it('does not make outbound dashboard calls for procurement users', async () => {
    setRole('procurement')

    renderHook(() => useDashboardPage())

    await waitFor(() => expect(inboundApi.getStats).toHaveBeenCalled())

    expect(inventoryApi.getStats).toHaveBeenCalled()
    expect(inboundApi.getList).toHaveBeenCalled()
    expect(outboundApi.getStats).not.toHaveBeenCalled()
    expect(outboundApi.getList).not.toHaveBeenCalled()
  })

  it('uses pending alert records instead of inventory warning totals for dashboard alert count', async () => {
    setRole('warehouse_manager')
    vi.mocked(inventoryApi.getStats).mockResolvedValue({
      totalMaterials: 10,
      lowStockCount: 7,
      expiringCount: 2,
      expiredCount: 1,
    } as any)
    vi.mocked(alertsApi.getList).mockResolvedValue({
      list: [
        { id: 'alert-1', type: 'low-stock', level: 'warning', materialName: 'A', message: 'A库存不足' },
        { id: 'alert-2', type: 'expiry', level: 'urgent', materialName: 'B', message: 'B即将过期' },
      ],
    } as any)

    const { result } = renderHook(() => useDashboardPage())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.alertCount).toBe(2)
  })

  it('loads manager operating insight without execution-flow stats or recent execution lists', async () => {
    setRole('manager')

    const { result } = renderHook(() => useDashboardPage())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.role).toBe('manager')
    expect(inventoryApi.getStats).toHaveBeenCalled()
    expect(alertsApi.getList).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending', pageSize: 5 }))
    expect(abcApi.getDashboard).toHaveBeenCalled()
    expect(inboundApi.getStats).not.toHaveBeenCalled()
    expect(inboundApi.getList).not.toHaveBeenCalled()
    expect(outboundApi.getStats).not.toHaveBeenCalled()
    expect(outboundApi.getList).not.toHaveBeenCalled()
    expect(result.current.config.quickActions.map(action => action.navigateTo)).toEqual([
      '/alerts',
      '/inventory',
      '/abc/dashboard',
      '/abc/trend',
      '/abc/profitability',
    ])
  })

  it('orders recent inbound and outbound activities by their real timestamps', async () => {
    setRole('warehouse_manager')
    vi.mocked(inboundApi.getList).mockResolvedValue({
      list: [
        {
          id: 'old-inbound',
          materialName: '旧入库物料',
          quantity: 1,
          unit: '支',
          operator: '仓管',
          createdAt: '2026-06-20T08:00:00.000Z',
        },
      ],
    } as any)
    vi.mocked(outboundApi.getList).mockResolvedValue({
      list: [
        {
          id: 'new-outbound',
          outboundNo: 'OUT-NEW',
          projectName: '新出库项目',
          operator: '仓管',
          createdAt: '2026-06-20T09:00:00.000Z',
        },
      ],
    } as any)

    const { result } = renderHook(() => useDashboardPage())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.activities[0].id).toBe('out-new-outbound')
    expect(result.current.activities[1].id).toBe('in-old-inbound')
  })
})
