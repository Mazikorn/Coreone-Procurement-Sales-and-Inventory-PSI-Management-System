import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { supplierApi } from '@/api/master'
import { useSuppliersPage } from './useSuppliersPage'

vi.mock('@/api/master')
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('useSuppliersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/suppliers')
    vi.mocked(supplierApi.getList).mockResolvedValue({
      list: [],
      pagination: { total: 0, page: 1, pageSize: 20 },
    } as any)
    vi.mocked(supplierApi.getStats).mockResolvedValue({
      total: 0,
      active: 0,
      inactive: 0,
      newThisMonth: 0,
    } as any)
  })

  it('uses keyword from URL so audit links open a filtered supplier list', async () => {
    window.history.replaceState(null, '', '/suppliers?keyword=SUP-DEEP-001')

    const { result } = renderHook(() => useSuppliersPage())

    await waitFor(() => {
      expect(supplierApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'SUP-DEEP-001',
      }))
    })
    await waitFor(() => {
      expect(supplierApi.getStats).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'SUP-DEEP-001',
      }))
    })
    expect(result.current.searchKeyword).toBe('SUP-DEEP-001')
  })

  it('passes includeDeleted from audit URL so deleted suppliers can be reviewed', async () => {
    window.history.replaceState(null, '', '/suppliers?keyword=supplier-deleted-id&includeDeleted=true')

    const { result } = renderHook(() => useSuppliersPage())

    await waitFor(() => {
      expect(supplierApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'supplier-deleted-id',
        includeDeleted: true,
      }))
    })
    await waitFor(() => {
      expect(supplierApi.getStats).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'supplier-deleted-id',
        includeDeleted: true,
      }))
    })
    expect(result.current.searchKeyword).toBe('supplier-deleted-id')
  })
})
