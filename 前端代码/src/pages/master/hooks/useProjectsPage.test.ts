import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bomApi, projectApi } from '@/api/master'
import { useProjectsPage } from './useProjectsPage'

vi.mock('@/api/master', () => ({
  bomApi: {
    getList: vi.fn(),
  },
  projectApi: {
    getList: vi.fn(),
    getStats: vi.fn(),
  },
}))

vi.mock('@/hooks/useUrlParams', () => ({
  useUrlParams: () => ({
    get: vi.fn(() => ''),
    getNumber: vi.fn((_key: string, fallback: number) => fallback),
    setMultiple: vi.fn(),
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

describe('useProjectsPage permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.mocked(projectApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(projectApi.getStats).mockResolvedValue({ total: 0, active: 0, inactive: 0, noBom: 0 } as any)
    vi.mocked(bomApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
  })

  it('allows technician users to maintain project modeling', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'technician' }))

    const { result } = renderHook(() => useProjectsPage())

    expect(result.current.canWrite).toBe(true)
  })

  it('keeps pathologist and warehouse users read-only for project modeling', () => {
    localStorage.setItem('user', JSON.stringify({ role: 'pathologist', permissions: ['projects:view'] }))
    const pathologist = renderHook(() => useProjectsPage())
    expect(pathologist.result.current.canWrite).toBe(false)
    pathologist.unmount()

    localStorage.setItem('user', JSON.stringify({ role: 'warehouse_manager', permissions: ['projects:view'] }))
    const warehouse = renderHook(() => useProjectsPage())
    expect(warehouse.result.current.canWrite).toBe(false)
    warehouse.unmount()
  })
})
