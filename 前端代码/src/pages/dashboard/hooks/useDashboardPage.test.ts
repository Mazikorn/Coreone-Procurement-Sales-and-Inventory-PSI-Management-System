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

    await waitFor(() => expect(inventoryApi.getStats).toHaveBeenCalled())

    expect(inventoryApi.getStats).toHaveBeenCalled()
    expect(inboundApi.getStats).not.toHaveBeenCalled()
    expect(inboundApi.getList).not.toHaveBeenCalled()
    expect(outboundApi.getStats).not.toHaveBeenCalled()
    expect(outboundApi.getList).not.toHaveBeenCalled()
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
    expect(inboundApi.getList).not.toHaveBeenCalled()
    expect(outboundApi.getStats).not.toHaveBeenCalled()
    expect(outboundApi.getList).not.toHaveBeenCalled()
  })

  it('points high-frequency warehouse actions at the actual work step instead of only the page', async () => {
    setRole('warehouse_manager')

    const { result } = renderHook(() => useDashboardPage())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.config.quickActions.map(({ label, desc, navigateTo }) => ({ label, desc, navigateTo }))).toEqual([
      {
        label: '新增入库',
        desc: '登记批号、库位并形成库存批次',
        navigateTo: '/inbound?action=create&type=direct',
      },
      {
        label: '项目出库',
        desc: '按项目扣减批次并进入成本对账',
        navigateTo: '/outbound?action=create',
      },
      {
        label: '采购订单',
        desc: '按采购单收货并生成入库单',
        navigateTo: '/purchase-orders?status=pending,partial',
      },
      {
        label: '库存盘点',
        desc: '按批次盘点并记录库存差异',
        navigateTo: '/stocktaking?action=create',
      },
    ])
  })

  it('lets procurement users start a purchase order directly from the dashboard', async () => {
    setRole('procurement')

    const { result } = renderHook(() => useDashboardPage())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.config.quickActions.map(({ label, desc, navigateTo }) => ({ label, desc, navigateTo }))).toEqual([
      {
        label: '新建采购订单',
        desc: '按补货需求建单，后续接入入库',
        navigateTo: '/purchase-orders?action=create',
      },
      {
        label: '待收货订单',
        desc: '查看交付进度，仓库收货入库',
        navigateTo: '/purchase-orders?status=pending,partial',
      },
    ])
  })

  it('keeps technician dashboard actions on modeling and review pages instead of warehouse execution', async () => {
    setRole('technician')

    const { result } = renderHook(() => useDashboardPage())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.config.quickActions.map(action => action.navigateTo)).toEqual([
      '/reconciliation',
      '/abc/slide-cost',
    ])
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
    expect(result.current.config.statCards.find(card => card.key === 'alertCount')?.navigateTo).toBe('/alerts?quick=pending')
    expect(result.current.config.quickActions.map(action => action.navigateTo)).toEqual([
      '/alerts?quick=pending',
      '/inventory',
      '/abc/dashboard',
      '/abc/trend',
      '/abc/profitability',
    ])
    expect(result.current.config.activityLinks).toEqual([])
  })

  it('only exposes recent-activity review links that the role can actually open', async () => {
    setRole('warehouse_manager')

    const { result } = renderHook(() => useDashboardPage())

    await waitFor(() => expect(result.current.loading).toBe(false))

    expect(result.current.config.activityLinks).toEqual([
      { label: '入库记录', path: '/inbound' },
      { label: '出库记录', path: '/outbound' },
    ])
  })

  it('orders recent inbound and outbound activities by their real timestamps', async () => {
    setRole('warehouse_manager')
    vi.mocked(inboundApi.getList).mockResolvedValue({
      list: [
        {
          id: 'old-inbound',
          inboundNo: 'IN-OLD',
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
    expect(result.current.activities[0].title).toBe('出库：OUT-NEW')
    expect(result.current.activities[0].desc).toBe('新出库项目 · 仓管')
    expect(result.current.activities[0].href).toBe('/outbound?keyword=OUT-NEW')
    expect(result.current.activities[1].id).toBe('in-old-inbound')
    expect(result.current.activities[1].title).toBe('入库：IN-OLD')
    expect(result.current.activities[1].desc).toBe('旧入库物料 · 数量 1支 · 仓管')
    expect(result.current.activities[1].href).toBe('/inbound?keyword=IN-OLD')
  })
})
