import { act, renderHook, waitFor } from '@testing-library/react'
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
    vi.mocked(supplierApi.create).mockResolvedValue({
      id: 'supplier-created',
      code: 'SUP-CREATED-001',
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

  it('focuses the newly created supplier so procurement can immediately use it for purchasing', async () => {
    window.history.replaceState(null, '', '/suppliers?keyword=old-supplier')

    const { result } = renderHook(() => useSuppliersPage())

    act(() => {
      result.current.setForm({
        ...result.current.form,
        name: '新建采购供应商',
        contact: '李采购',
        phone: '13800138000',
      })
    })
    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(supplierApi.create).toHaveBeenCalledWith(expect.objectContaining({
      name: '新建采购供应商',
      contact: '李采购',
      phone: '13800138000',
    }))
    await waitFor(() => expect(result.current.searchKeyword).toBe('SUP-CREATED-001'))
    await waitFor(() => {
      expect(supplierApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'SUP-CREATED-001',
      }))
    })
  })

  it('keeps the newly created supplier visible when the focused refresh fails', async () => {
    vi.mocked(supplierApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(supplierApi.create).mockResolvedValueOnce({
      id: 'supplier-visible',
      code: 'SUP-VISIBLE-001',
      name: '可回看供应商',
      contact: '王采购',
      phone: '13900139000',
      email: 'supplier@example.com',
      address: '上海市徐汇区',
      taxNo: '91310000MA1KVISIBLE',
      bankName: '招商银行',
      bankAccount: '6225880000000000',
      status: 'active',
    } as any)

    const { result } = renderHook(() => useSuppliersPage())
    await waitFor(() => expect(supplierApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.setForm({
        ...result.current.form,
        name: '可回看供应商',
        contact: '王采购',
        phone: '13900139000',
        email: 'supplier@example.com',
        address: '上海市徐汇区',
        taxNo: '91310000MA1KVISIBLE',
        bankName: '招商银行',
        bankAccount: '6225880000000000',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(result.current.searchKeyword).toBe('SUP-VISIBLE-001')
    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'supplier-visible',
        code: 'SUP-VISIBLE-001',
        name: '可回看供应商',
        contact: '王采购',
        phone: '13900139000',
        taxNo: '91310000MA1KVISIBLE',
      }),
    ])
    expect(result.current.total).toBe(1)

    act(() => {
      result.current.toggleSelectAll()
    })
    expect(result.current.selectedIds).toEqual(new Set(['supplier-visible']))
  })

  it('explains downstream business impact before changing a supplier status', async () => {
    const { result } = renderHook(() => useSuppliersPage())
    await waitFor(() => expect(supplierApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.handleToggleStatus({
        id: 'supplier-status',
        code: 'SUP-STATUS-001',
        name: '待停用供应商',
        contact: '李采购',
        phone: '13800138000',
        status: 'active',
      } as any)
    })

    expect(result.current.confirmProps?.title).toBe('停用供应商')
    expect(result.current.confirmProps?.description).toBe('停用后该供应商不会出现在新采购订单、入库收货、供应商退货和物料默认供应商选择中；已有采购、入库、退货、成本和审计记录保留。')
  })

  it('explains downstream business impact before batch supplier status changes', async () => {
    vi.mocked(supplierApi.getList).mockResolvedValueOnce({
      list: [
        {
          id: 'supplier-batch',
          code: 'SUP-BATCH-001',
          name: '批量供应商',
          contact: '王采购',
          phone: '13900139000',
          status: 'active',
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 20 },
    } as any)

    const { result } = renderHook(() => useSuppliersPage())
    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.toggleSelectAll()
      result.current.batchToggleStatus('inactive')
    })

    expect(result.current.confirmProps?.title).toBe('批量停用供应商')
    expect(result.current.confirmProps?.description).toBe('批量停用后这些供应商不会出现在新采购订单、入库收货、供应商退货和物料默认供应商选择中；已有业务和审计记录保留。')
  })

  it('explains downstream business impact before deleting a supplier', async () => {
    const { result } = renderHook(() => useSuppliersPage())
    await waitFor(() => expect(supplierApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.handleDelete('supplier-delete')
    })

    expect(result.current.confirmProps?.title).toBe('删除供应商')
    expect(result.current.confirmProps?.description).toBe('删除后该供应商不会再用于新采购订单、入库收货、供应商退货、供应商成本净额和物料默认供应商选择；已有采购、入库、退货、成本和审计记录仍保留可回看。')
  })

  it('explains downstream business impact before batch supplier deletion', async () => {
    vi.mocked(supplierApi.getList).mockResolvedValueOnce({
      list: [
        {
          id: 'supplier-batch-delete',
          code: 'SUP-DELETE-001',
          name: '待批量删除供应商',
          contact: '王采购',
          phone: '13900139000',
          status: 'inactive',
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 20 },
    } as any)

    const { result } = renderHook(() => useSuppliersPage())
    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.toggleSelectAll()
    })
    expect(result.current.selectedIds).toEqual(new Set(['supplier-batch-delete']))

    act(() => {
      result.current.batchDelete()
    })

    expect(result.current.confirmProps?.title).toBe('批量删除供应商')
    expect(result.current.confirmProps?.description).toBe('确认删除 1 个供应商？删除后这些供应商不会再用于新采购订单、入库收货、供应商退货、供应商成本净额和物料默认供应商选择；已有采购、入库、退货、成本和审计记录仍保留可回看。')
  })
})
