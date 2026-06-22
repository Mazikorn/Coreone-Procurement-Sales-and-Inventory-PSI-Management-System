import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { locationApi } from '@/api/master'
import { useLocationsPage } from './useLocationsPage'
import type { Location } from '@/types'

vi.mock('@/api/master')
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function location(overrides: Partial<Location>): Location {
  return {
    id: 'loc',
    code: 'LOC-001',
    name: '测试库位',
    type: 'shelf',
    parentId: null,
    zone: 'A区',
    shelf: '',
    position: '',
    capacity: 100,
    used: 0,
    status: 'active',
    createdAt: '2026-06-20',
    ...overrides,
  }
}

describe('useLocationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    vi.mocked(locationApi.getTree).mockResolvedValue([] as any)
    vi.mocked(locationApi.getStats).mockResolvedValue({
      total: 0,
      active: 0,
      inactive: 0,
      avgUtilization: 0,
    } as any)
  })

  it('keeps an unfiltered location set for relationship selectors while list search is filtered', async () => {
    const parent = location({ id: 'parent', code: 'LOC-PARENT', name: '可选父级', zone: 'A区' })
    const child = location({ id: 'child', code: 'LOC-CHILD', name: '子库位', parentId: 'parent', shelf: '01架' })
    vi.mocked(locationApi.getList).mockImplementation(async (params: any = {}) => {
      if (params.keyword) {
        return { list: [child], pagination: { total: 1, page: 1, pageSize: 1000 } } as any
      }
      return { list: [parent, child], pagination: { total: 2, page: 1, pageSize: 1000 } } as any
    })

    const { result } = renderHook(() => useLocationsPage())
    await waitFor(() => expect(result.current.data).toHaveLength(2))

    act(() => {
      result.current.setSearchKeyword('子库位')
    })
    act(() => {
      result.current.handleSearch()
    })

    await waitFor(() => expect(result.current.data).toEqual([child]))
    expect(result.current.allLocations).toEqual([parent, child])
    expect(result.current.flatLocations.get('parent')?.name).toBe('可选父级')
  })

  it('uses keyword from URL so audit links open a filtered location list', async () => {
    window.history.replaceState(null, '', '/locations?keyword=LOC-DEEP-001')
    vi.mocked(locationApi.getList).mockResolvedValue({ list: [], pagination: { total: 0, page: 1, pageSize: 1000 } } as any)

    const { result } = renderHook(() => useLocationsPage())

    await waitFor(() => expect(locationApi.getStats).toHaveBeenCalledWith({
      keyword: 'LOC-DEEP-001',
      status: undefined,
    }))
    expect(locationApi.getList).toHaveBeenCalledWith({
      page: 1,
      pageSize: 1000,
      keyword: 'LOC-DEEP-001',
      status: undefined,
    })
    expect(result.current.keyword).toBe('LOC-DEEP-001')
    expect(result.current.searchKeyword).toBe('LOC-DEEP-001')
  })

  it('keeps deleted location review context from audit links', async () => {
    window.history.replaceState(null, '', '/locations?keyword=loc-deleted-001&includeDeleted=true')
    vi.mocked(locationApi.getList).mockResolvedValue({ list: [], pagination: { total: 0, page: 1, pageSize: 1000 } } as any)

    renderHook(() => useLocationsPage())

    await waitFor(() => expect(locationApi.getStats).toHaveBeenCalledWith({
      keyword: 'loc-deleted-001',
      status: undefined,
      includeDeleted: true,
    }))
    expect(locationApi.getList).toHaveBeenCalledWith({
      page: 1,
      pageSize: 1000,
      keyword: 'loc-deleted-001',
      status: undefined,
      includeDeleted: true,
    })
    expect(window.location.search).toContain('includeDeleted=true')
  })
})
