import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { equipmentApi } from '@/api/master'
import { useEquipmentTypePage } from './useEquipmentTypePage'

vi.mock('@/api/master', () => ({
  equipmentApi: {
    getTypes: vi.fn(),
    getTypeStats: vi.fn(),
    createType: vi.fn(),
    updateType: vi.fn(),
    deleteType: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const equipmentType = {
  id: 'type-1',
  code: 'EQT-001',
  name: '染色设备',
  description: '',
  status: 'active',
  defaultPurchasePrice: 100000,
  defaultDepreciableLifeYears: 5,
  defaultValue: 10000,
  defaultDepreciationMethod: 'straight_line',
  defaultTotalCapacity: 0,
  defaultCapacityUnit: 'minutes',
  equipmentCount: 0,
  createdAt: '2026-06-20T00:00:00.000Z',
  updatedAt: '2026-06-20T00:00:00.000Z',
} as const

describe('useEquipmentTypePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
    localStorage.clear()
    localStorage.setItem('user', JSON.stringify({ role: 'admin' }))
    vi.mocked(equipmentApi.getTypes).mockResolvedValue({ list: [equipmentType], pagination: { total: 1 } } as any)
    vi.mocked(equipmentApi.getTypeStats).mockResolvedValue({ total: 1, active: 1, equipmentCount: 0 } as any)
    vi.mocked(equipmentApi.updateType).mockResolvedValue({ id: 'type-1' } as any)
  })

  it('allows technician users with equipment module access to manage equipment types', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'technician' }))

    const { result } = renderHook(() => useEquipmentTypePage())

    expect(result.current.canManageEquipmentTypes).toBe(true)
  })

  it('keeps pathologist users read-only for equipment types', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'pathologist', permissions: ['equipment:view'] }))

    const { result } = renderHook(() => useEquipmentTypePage())

    expect(result.current.canManageEquipmentTypes).toBe(false)
  })

  it('keeps backend-controlled type code and submits status changes on edit', async () => {
    const { result } = renderHook(() => useEquipmentTypePage())
    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.openEdit(equipmentType as any)
      result.current.setForm({
        ...result.current.form,
        code: 'EQT-CHANGED-BY-UI',
        name: '停用染色设备',
        status: 'inactive',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(equipmentApi.updateType).toHaveBeenCalledWith('type-1', expect.objectContaining({
      code: 'EQT-001',
      name: '停用染色设备',
      status: 'inactive',
    }))
  })

  it('keeps deleted equipment type review context from audit links', async () => {
    window.history.replaceState(null, '', '/equipment/types?keyword=EQT-DEEP-001&includeDeleted=true')
    vi.mocked(equipmentApi.getTypes).mockResolvedValue({
      list: [{ ...equipmentType, id: 'type-deleted-001', isDeleted: true }],
      pagination: { total: 1 },
    } as any)

    const { result } = renderHook(() => useEquipmentTypePage())

    await waitFor(() => expect(equipmentApi.getTypes).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      keyword: 'EQT-DEEP-001',
      includeDeleted: true,
    })))
    await waitFor(() => expect(equipmentApi.getTypeStats).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'EQT-DEEP-001',
      includeDeleted: true,
    })))
    expect(result.current.keyword).toBe('EQT-DEEP-001')
    expect(result.current.searchInput).toBe('EQT-DEEP-001')
    expect(result.current.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'type-deleted-001', isDeleted: true }),
    ]))
  })
})
