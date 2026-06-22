import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryApi } from '@/api/inventory'
import { materialApi } from '@/api/master'
import { stocktakingApi } from '@/api/stocktaking'
import { STOCKTAKING_SCOPE_PAGE_SIZE, useStocktakingPage } from './useStocktakingPage'

vi.mock('@/api/inventory')
vi.mock('@/api/master')
vi.mock('@/api/stocktaking')
vi.mock('sonner')

describe('useStocktakingPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/stocktaking')

    vi.mocked(stocktakingApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(stocktakingApi.getStats).mockResolvedValue({ completed: 0, confirmed: 0, diffCount: 0, accuracy: 100 } as any)
    vi.mocked(materialApi.getList).mockResolvedValue({
      list: [{
        id: 'mat-1',
        code: 'MAT-001',
        name: '测试物料',
        spec: '1ml',
        unit: '瓶',
        categoryId: 'cat-1',
        price: 12,
        stock: 6,
        minStock: 0,
        maxStock: 100,
        safetyStock: 5,
        status: 'active',
        createdAt: '',
        updatedAt: '',
      }],
      pagination: { total: 1 },
    } as any)
    vi.mocked(inventoryApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
  })

  it('loads inventory scope rows within the inventory API page-size limit', async () => {
    const { result } = renderHook(() => useStocktakingPage())

    await act(async () => {
      await result.current.openCreate()
    })

    act(() => {
      result.current.setForm({
        materialId: 'mat-1',
        scopeType: 'material',
        locationId: '',
        batchId: '',
        systemStock: 6,
        actualStock: '',
        remark: '',
      })
    })

    await waitFor(() => {
      expect(inventoryApi.getList).toHaveBeenCalledWith({
        materialId: 'mat-1',
        page: 1,
        pageSize: STOCKTAKING_SCOPE_PAGE_SIZE,
      })
    })

    expect(STOCKTAKING_SCOPE_PAGE_SIZE).toBeLessThanOrEqual(200)
  })
})
