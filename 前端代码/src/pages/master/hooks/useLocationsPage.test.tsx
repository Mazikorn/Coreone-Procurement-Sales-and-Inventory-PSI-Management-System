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

  it('focuses the newly created location so inbound users can immediately confirm the usable storage point', async () => {
    const parent = location({ id: 'parent', code: 'LOC-PARENT', name: '父级库区', zone: 'A区' })
    const created = location({
      id: 'loc-created',
      code: 'LOC-CREATED-001',
      name: '新建冷藏库位',
      parentId: 'parent',
      zone: 'A区',
      shelf: '02架',
      position: '03位',
    })
    vi.mocked(locationApi.getList).mockImplementation(async (params: any = {}) => {
      if (params.keyword === 'old-location' || params.status === 'inactive') {
        return { list: [], pagination: { total: 0, page: 1, pageSize: 1000 } } as any
      }
      if (params.keyword === 'LOC-CREATED-001') {
        return { list: [created], pagination: { total: 1, page: 1, pageSize: 1000 } } as any
      }
      return { list: [parent], pagination: { total: 1, page: 1, pageSize: 1000 } } as any
    })
    vi.mocked(locationApi.create).mockResolvedValue(created as any)

    const { result } = renderHook(() => useLocationsPage())
    await waitFor(() => expect(result.current.data).toEqual([parent]))

    act(() => {
      result.current.setSearchKeyword('old-location')
    })
    act(() => {
      result.current.setSearchStatus('inactive')
      result.current.handleSearch()
      result.current.setSelectedNodeId('old-node')
    })
    await waitFor(() => expect(result.current.data).toHaveLength(0))

    act(() => {
      result.current.openCreate()
    })
    act(() => {
      result.current.setForm({
        ...result.current.form,
        code: 'LOC-DRAFT-001',
        name: '新建冷藏库位',
        type: 'shelf',
        parentId: 'parent',
        levelData: ['A区', '02架', '03位'],
        capacity: 50,
        status: 'active',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(locationApi.create).toHaveBeenCalledWith(expect.objectContaining({
      code: 'LOC-DRAFT-001',
      name: '新建冷藏库位',
      parentId: 'parent',
      zone: 'A区',
      shelf: '02架',
      position: '03位',
      capacity: 50,
      status: 'active',
    }))
    expect(result.current.searchKeyword).toBe('LOC-CREATED-001')
    expect(result.current.keyword).toBe('LOC-CREATED-001')
    expect(result.current.searchStatus).toBe('all')
    expect(result.current.selectedNodeId).toBe(null)
    expect(result.current.expandedIds.has('parent')).toBe(true)
    await waitFor(() => {
      expect(locationApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        page: 1,
        pageSize: 1000,
        keyword: 'LOC-CREATED-001',
        status: undefined,
      }))
    })
  })

  it('keeps the newly created location visible when the focused refresh fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const created = location({
      id: 'loc-visible',
      code: 'LOC-VISIBLE-001',
      name: '可回看冷藏库位',
      zone: 'B区',
      shelf: '01架',
      position: '02位',
      capacity: 80,
    })
    vi.mocked(locationApi.getList)
      .mockResolvedValueOnce({ list: [], pagination: { total: 0, page: 1, pageSize: 1000 } } as any)
      .mockRejectedValueOnce(new Error('focused refresh failed'))
      .mockResolvedValue({ list: [], pagination: { total: 0, page: 1, pageSize: 1000 } } as any)
    vi.mocked(locationApi.create).mockResolvedValueOnce(created as any)

    const { result } = renderHook(() => useLocationsPage())
    await waitFor(() => expect(locationApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.openCreate()
      result.current.setForm({
        ...result.current.form,
        code: 'LOC-DRAFT-VISIBLE',
        name: '可回看冷藏库位',
        type: 'shelf',
        parentId: '',
        levelData: ['B区', '01架', '02位'],
        capacity: 80,
        status: 'active',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(result.current.keyword).toBe('LOC-VISIBLE-001')
    expect(result.current.searchKeyword).toBe('LOC-VISIBLE-001')
    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'loc-visible',
        code: 'LOC-VISIBLE-001',
        name: '可回看冷藏库位',
        zone: 'B区',
        shelf: '01架',
        position: '02位',
        capacity: 80,
      }),
    ])
    expect(result.current.displayLocations).toEqual([
      expect.objectContaining({ id: 'loc-visible' }),
    ])
    expect(result.current.flatLocations.get('loc-visible')?.name).toBe('可回看冷藏库位')
    consoleErrorSpy.mockRestore()
  })
})
