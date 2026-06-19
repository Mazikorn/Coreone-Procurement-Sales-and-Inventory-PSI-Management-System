import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { categoryApi, materialApi, supplierApi } from '@/api/master'
import { useMaterialsPage } from './useMaterialsPage'

vi.mock('@/api/master')
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('useMaterialsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/materials')
    window.localStorage.setItem('user', JSON.stringify({ role: 'admin', username: 'admin' }))

    vi.mocked(materialApi.getList).mockResolvedValue({
      list: [],
      pagination: { total: 0, page: 1, pageSize: 20 },
    } as any)
    vi.mocked(materialApi.getStats).mockResolvedValue({
      total: 0,
      active: 0,
      inactive: 0,
      lowStock: 0,
    } as any)
    vi.mocked(categoryApi.getList).mockResolvedValue({
      list: [],
      pagination: { total: 0 },
    } as any)
    vi.mocked(supplierApi.getList).mockResolvedValue({
      list: [],
      pagination: { total: 0 },
    } as any)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the spec quick URL parameter and maps low to low stock API params', async () => {
    window.history.replaceState(null, '', '/materials?quick=low&page=4')

    const { result } = renderHook(() => useMaterialsPage())

    await waitFor(() => expect(materialApi.getList).toHaveBeenCalled())
    expect(result.current.quickFilter).toBe('low-stock')
    expect(materialApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      page: 4,
      pageSize: 20,
      lowStock: true,
    }))
  })

  it('writes quick filter changes to the spec quick URL parameter and resets pagination', async () => {
    window.history.replaceState(null, '', '/materials?page=5&status=active')

    const { result } = renderHook(() => useMaterialsPage())
    await waitFor(() => expect(materialApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.setQuickFilter('inactive')
      result.current.setPage(1)
    })

    await waitFor(() => expect(window.location.search).toContain('quick=inactive'))
    expect(window.location.search).not.toContain('status=')
    expect(window.location.search).not.toContain('page=5')
  })

  it('debounces keyword API requests for 300ms while keeping the URL in sync', async () => {
    const { result } = renderHook(() => useMaterialsPage())
    await waitFor(() => expect(materialApi.getList).toHaveBeenCalled())
    vi.mocked(materialApi.getList).mockClear()
    vi.useFakeTimers()

    act(() => {
      result.current.setKeyword('Ki-67')
    })

    expect(window.location.search).toContain('keyword=Ki-67')
    expect(materialApi.getList).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(materialApi.getList).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    await Promise.resolve()
    expect(materialApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'Ki-67',
    }))
  })

  it('resets pagination when the keyword filter changes', async () => {
    window.history.replaceState(null, '', '/materials?page=5')
    vi.mocked(materialApi.getList).mockImplementation(async (params: any) => ({
      list: [],
      pagination: { total: 100, page: params.page, pageSize: params.pageSize },
    } as any))

    const { result } = renderHook(() => useMaterialsPage())
    await waitFor(() => expect(result.current.page).toBe(5))

    act(() => {
      result.current.setKeyword('HER2')
    })

    await waitFor(() => expect(result.current.page).toBe(1))
    expect(window.location.search).toContain('keyword=HER2')
    expect(window.location.search).not.toContain('page=5')
  })

  it('resets pagination when category or supplier filters change', async () => {
    window.history.replaceState(null, '', '/materials?page=5')
    vi.mocked(materialApi.getList).mockImplementation(async (params: any) => ({
      list: [],
      pagination: { total: 100, page: params.page, pageSize: params.pageSize },
    } as any))

    const { result } = renderHook(() => useMaterialsPage())
    await waitFor(() => expect(result.current.page).toBe(5))

    act(() => {
      result.current.setCategoryId('cat-1')
    })

    await waitFor(() => expect(result.current.page).toBe(1))
    expect(window.location.search).toContain('categoryId=cat-1')
    expect(window.location.search).not.toContain('page=5')
    expect(materialApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      categoryId: 'cat-1',
    }))

    act(() => {
      result.current.setPage(5)
    })
    await waitFor(() => expect(result.current.page).toBe(5))

    act(() => {
      result.current.setSupplierId('sup-1')
    })

    await waitFor(() => expect(result.current.page).toBe(1))
    expect(window.location.search).toContain('supplierId=sup-1')
    expect(window.location.search).not.toContain('page=5')
    expect(materialApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      categoryId: 'cat-1',
      supplierId: 'sup-1',
    }))
  })
})
