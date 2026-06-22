import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { equipmentApi } from '@/api/master'
import { useEquipmentPage } from './useEquipmentPage'

vi.mock('@/api/master', () => ({
  equipmentApi: {
    getTypes: vi.fn(),
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

const equipment = {
  id: 'eq-1',
  code: 'EQ-001',
  name: '染色机',
  model: 'D-1',
  manufacturer: 'DAKO',
  purchasePrice: 100000,
  purchaseDate: '2026-01-01',
  depreciableLifeYears: 5,
  residualValue: 10000,
  depreciationMethod: 'straight_line',
  totalCapacity: 0,
  capacityUnit: 'minutes',
  status: 'active',
  locationId: '',
  typeId: '',
  typeName: null,
  annualDepreciation: 18000,
  accumulatedDepreciation: 0,
  netBookValue: 100000,
  createdAt: '2026-06-20T00:00:00.000Z',
  updatedAt: '2026-06-20T00:00:00.000Z',
} as const

describe('useEquipmentPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
    localStorage.clear()
    localStorage.setItem('user', JSON.stringify({ role: 'admin' }))
    vi.mocked(equipmentApi.getTypes).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(equipmentApi.getList).mockResolvedValue({ list: [equipment], pagination: { total: 1 } } as any)
    vi.mocked(equipmentApi.getStats).mockResolvedValue({ total: 1, active: 1, inactive: 0, scrapped: 0, totalValue: 100000 } as any)
    vi.mocked(equipmentApi.update).mockResolvedValue({ id: 'eq-1' } as any)
  })

  it('allows technician users with equipment module access to manage assets', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'technician' }))

    const { result } = renderHook(() => useEquipmentPage())

    expect(result.current.canManageEquipmentAssets).toBe(true)
  })

  it('keeps pathologist users read-only for equipment assets', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'pathologist', permissions: ['equipment:view'] }))

    const { result } = renderHook(() => useEquipmentPage())

    expect(result.current.canManageEquipmentAssets).toBe(false)
  })

  it('keeps backend-controlled equipment code out of edit updates', async () => {
    const { result } = renderHook(() => useEquipmentPage())
    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.openEdit(equipment as any)
      result.current.setForm({
        ...result.current.form,
        code: 'EQ-CHANGED-BY-UI',
        name: '更新后的染色机',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(equipmentApi.update).toHaveBeenCalledWith('eq-1', expect.objectContaining({
      code: 'EQ-001',
      name: '更新后的染色机',
    }))
  })

  it('keeps deleted equipment review context from audit links', async () => {
    window.history.replaceState(null, '', '/equipment?keyword=EQ-DEEP-001&includeDeleted=true')
    vi.mocked(equipmentApi.getList).mockResolvedValue({
      list: [{ ...equipment, id: 'eq-deleted-001', isDeleted: true }],
      pagination: { total: 1 },
    } as any)

    const { result } = renderHook(() => useEquipmentPage())

    await waitFor(() => expect(equipmentApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      keyword: 'EQ-DEEP-001',
      includeDeleted: true,
    })))
    await waitFor(() => expect(equipmentApi.getStats).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'EQ-DEEP-001',
      includeDeleted: true,
    })))
    expect(result.current.keyword).toBe('EQ-DEEP-001')
    expect(result.current.searchInput).toBe('EQ-DEEP-001')
    expect(result.current.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'eq-deleted-001', isDeleted: true }),
    ]))
  })
})
