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

  it('does not make outbound dashboard calls for procurement users', async () => {
    setRole('procurement')

    renderHook(() => useDashboardPage())

    await waitFor(() => expect(inboundApi.getStats).toHaveBeenCalled())

    expect(inventoryApi.getStats).toHaveBeenCalled()
    expect(inboundApi.getList).toHaveBeenCalled()
    expect(outboundApi.getStats).not.toHaveBeenCalled()
    expect(outboundApi.getList).not.toHaveBeenCalled()
  })
})
