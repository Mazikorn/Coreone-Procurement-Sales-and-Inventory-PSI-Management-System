import { act, renderHook, waitFor } from '@testing-library/react'
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

  it('focuses the newly created category so material users can immediately classify new materials', async () => {
    const parent = category({
      id: 'parent-cat',
      code: 'CAT-PARENT',
      name: '试剂耗材',
      level: 1,
      isLeaf: false,
      children: [],
    })
    const created = category({
      id: 'cat-created',
      code: 'CAT-CREATED-001',
      name: '新建检测分类',
      parentId: 'parent-cat',
      level: 2,
      isLeaf: true,
    })
    vi.mocked(categoryApi.getTree).mockResolvedValue([parent] as any)
    vi.mocked(categoryApi.create).mockResolvedValue(created as any)

    const { result } = renderHook(() => useCategoriesPage())
    await waitFor(() => expect(result.current.flatList).toEqual([parent]))

    act(() => {
      result.current.setSearchKeyword('old-category')
      result.current.openCreate('parent-cat', 2)
    })
    act(() => {
      result.current.setForm({
        ...result.current.form,
        code: 'CAT-DRAFT-001',
        name: '新建检测分类',
        parentId: 'parent-cat',
        level: 2,
        sortOrder: 3,
        remark: '用于新物料建档',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(categoryApi.create).toHaveBeenCalledWith(expect.objectContaining({
      code: 'CAT-DRAFT-001',
      name: '新建检测分类',
      parentId: 'parent-cat',
      level: 2,
      sortOrder: 3,
      remark: '用于新物料建档',
    }))
    expect(result.current.searchKeyword).toBe('CAT-CREATED-001')
    expect(result.current.selectedId).toBe('cat-created')
    expect(result.current.expandedIds.has('parent-cat')).toBe(true)
  })

  it('keeps the newly created category visible when the follow-up tree refresh fails', async () => {
    const parent = category({
      id: 'parent-cat',
      code: 'CAT-PARENT',
      name: '试剂耗材',
      level: 1,
      isLeaf: false,
      children: [],
    })
    const created = category({
      id: 'cat-visible',
      code: 'CAT-VISIBLE-001',
      name: '可回看分类',
      parentId: 'parent-cat',
      level: 2,
      sortOrder: 4,
      isLeaf: true,
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(categoryApi.getTree)
      .mockResolvedValueOnce([parent] as any)
      .mockRejectedValueOnce(new Error('tree refresh failed'))
    vi.mocked(categoryApi.create).mockResolvedValueOnce(created as any)

    const { result } = renderHook(() => useCategoriesPage())
    await waitFor(() => expect(result.current.flatList).toEqual([parent]))

    act(() => {
      result.current.openCreate('parent-cat', 2)
      result.current.setForm({
        ...result.current.form,
        code: 'CAT-DRAFT-VISIBLE',
        name: '可回看分类',
        parentId: 'parent-cat',
        level: 2,
        sortOrder: 4,
        remark: '用于新物料建档',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(result.current.searchKeyword).toBe('CAT-VISIBLE-001')
    expect(result.current.selectedId).toBe('cat-visible')
    expect(result.current.expandedIds.has('parent-cat')).toBe(true)
    expect(result.current.flatList).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'cat-visible',
        code: 'CAT-VISIBLE-001',
        name: '可回看分类',
        parentId: 'parent-cat',
        level: 2,
        sortOrder: 4,
      }),
    ]))
    expect(result.current.selectedNode).toEqual(expect.objectContaining({
      id: 'cat-visible',
      name: '可回看分类',
    }))
    expect(result.current.getBreadcrumb('cat-visible').map(item => item.name)).toEqual(['试剂耗材', '可回看分类'])
    consoleErrorSpy.mockRestore()
  })

  it('inserts a fallback-created category under its real nested parent only', async () => {
    const nestedParent = category({
      id: 'nested-parent',
      code: 'CAT-NESTED',
      name: '二级父分类',
      parentId: 'root',
      level: 2,
      isLeaf: false,
      children: [],
    })
    const root = category({
      id: 'root',
      code: 'CAT-ROOT',
      name: '根分类',
      level: 1,
      isLeaf: false,
      children: [nestedParent],
    })
    const unrelated = category({
      id: 'unrelated',
      code: 'CAT-OTHER',
      name: '无关分类',
      level: 1,
      isLeaf: false,
      children: [
        category({
          id: 'unrelated-child',
          code: 'CAT-OTHER-CHILD',
          name: '无关子分类',
          parentId: 'unrelated',
          level: 2,
          isLeaf: true,
        }),
      ],
    })
    const created = category({
      id: 'cat-nested-visible',
      code: 'CAT-NESTED-VISIBLE',
      name: '深层新分类',
      parentId: 'nested-parent',
      level: 3,
      sortOrder: 7,
      isLeaf: true,
    })
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(categoryApi.getTree)
      .mockResolvedValueOnce([root, unrelated] as any)
      .mockRejectedValueOnce(new Error('tree refresh failed'))
    vi.mocked(categoryApi.create).mockResolvedValueOnce(created as any)

    const { result } = renderHook(() => useCategoriesPage())
    await waitFor(() => expect(result.current.flatList.map(item => item.id)).toEqual(['root', 'nested-parent', 'unrelated', 'unrelated-child']))

    act(() => {
      result.current.openCreate('nested-parent', 3)
      result.current.setForm({
        ...result.current.form,
        code: 'CAT-DRAFT-NESTED',
        name: '深层新分类',
        parentId: 'nested-parent',
        level: 3,
        sortOrder: 7,
        remark: '用于深层分类回看',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    const rootNode = result.current.tree.find(item => item.id === 'root')
    const unrelatedNode = result.current.tree.find(item => item.id === 'unrelated')
    expect(rootNode?.children?.[0].children).toEqual([
      expect.objectContaining({ id: 'cat-nested-visible' }),
    ])
    expect(unrelatedNode?.children || []).toEqual([
      expect.objectContaining({ id: 'unrelated-child' }),
    ])
    expect(result.current.getBreadcrumb('cat-nested-visible').map(item => item.name)).toEqual(['根分类', '二级父分类', '深层新分类'])
    consoleErrorSpy.mockRestore()
  })

  it('does not duplicate the fallback category once backend refresh returns it nested in the tree', async () => {
    const parent = category({
      id: 'parent-cat',
      code: 'CAT-PARENT',
      name: '试剂耗材',
      level: 1,
      isLeaf: false,
      children: [],
    })
    const created = category({
      id: 'cat-returned',
      code: 'CAT-RETURNED-001',
      name: '刷新返回分类',
      parentId: 'parent-cat',
      level: 2,
      isLeaf: true,
    })
    const refreshedParent = {
      ...parent,
      children: [created],
    }
    vi.mocked(categoryApi.getTree)
      .mockResolvedValueOnce([parent] as any)
      .mockResolvedValueOnce([refreshedParent] as any)
      .mockResolvedValueOnce([] as any)
    vi.mocked(categoryApi.create).mockResolvedValueOnce(created as any)

    const { result } = renderHook(() => useCategoriesPage())
    await waitFor(() => expect(result.current.flatList.map(item => item.id)).toEqual(['parent-cat']))

    act(() => {
      result.current.openCreate('parent-cat', 2)
      result.current.setForm({
        ...result.current.form,
        code: 'CAT-DRAFT-RETURNED',
        name: '刷新返回分类',
        parentId: 'parent-cat',
        level: 2,
        sortOrder: 5,
        remark: '用于刷新去重验证',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    await waitFor(() => {
      expect(result.current.tree[0]?.children?.filter(item => item.id === 'cat-returned')).toHaveLength(1)
    })
    expect(result.current.flatList.filter(item => item.id === 'cat-returned')).toHaveLength(1)
    expect(result.current.selectedNode).toEqual(expect.objectContaining({
      id: 'cat-returned',
      name: '刷新返回分类',
    }))

    await act(async () => {
      await result.current.fetchData()
    })

    expect(result.current.flatList.filter(item => item.id === 'cat-returned')).toHaveLength(0)
  })
})
