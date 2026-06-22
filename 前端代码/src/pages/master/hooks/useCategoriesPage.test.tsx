import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { categoryApi } from '@/api/master'
import type { Category } from '@/types'
import { useCategoriesPage } from './useCategoriesPage'

vi.mock('@/api/master')
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function category(overrides: Partial<Category>): Category {
  return {
    id: 'cat',
    code: 'CAT-001',
    name: '测试分类',
    parentId: null,
    level: 1,
    sortOrder: 0,
    status: 'active',
    count: 0,
    isLeaf: false,
    createdAt: '2026-06-21',
    updatedAt: '2026-06-21',
    ...overrides,
  }
}

describe('useCategoriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/categories')
    vi.mocked(categoryApi.getTree).mockResolvedValue([] as any)
  })

  it('uses keyword from URL so audit links open a filtered category tree', async () => {
    window.history.replaceState(null, '', '/categories?keyword=CAT-DEEP-001')
    const matchingLeaf = category({
      id: 'leaf',
      code: 'CAT-DEEP-001',
      name: '深链验证分类',
      parentId: 'root',
      level: 2,
      isLeaf: true,
    })
    const root = category({
      id: 'root',
      code: 'ROOT',
      name: '上级分类',
      children: [matchingLeaf],
    })
    const unrelated = category({
      id: 'unrelated',
      code: 'OTHER',
      name: '无关分类',
    })
    vi.mocked(categoryApi.getTree).mockResolvedValue([root, unrelated] as any)

    const { result } = renderHook(() => useCategoriesPage())

    await waitFor(() => expect(result.current.flatList).toHaveLength(3))
    expect(result.current.searchKeyword).toBe('CAT-DEEP-001')
    expect(result.current.filterMatch(root)).toBe(true)
    expect(result.current.filterMatch(matchingLeaf)).toBe(true)
    expect(result.current.filterMatch(unrelated)).toBe(false)
  })

  it('keeps deleted category review context from audit links', async () => {
    window.history.replaceState(null, '', '/categories?keyword=cat-deleted-001&includeDeleted=true')
    vi.mocked(categoryApi.getTree).mockResolvedValue([
      category({
        id: 'cat-deleted-001',
        code: 'CAT-DEL-001',
        name: '已删除审计分类',
        isDeleted: true,
        isLeaf: true,
      }),
    ] as any)

    const { result } = renderHook(() => useCategoriesPage())

    await waitFor(() => expect(categoryApi.getTree).toHaveBeenCalledWith({
      includeDeleted: true,
    }))
    expect(result.current.searchKeyword).toBe('cat-deleted-001')
    expect(result.current.flatList).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'cat-deleted-001',
        isDeleted: true,
      }),
    ]))
    expect(result.current.filterMatch(result.current.flatList[0])).toBe(true)
  })
})
