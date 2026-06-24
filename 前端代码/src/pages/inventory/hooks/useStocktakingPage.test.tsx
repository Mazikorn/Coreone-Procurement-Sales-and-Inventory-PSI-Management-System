import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryApi } from '@/api/inventory'
import { materialApi } from '@/api/master'
import { stocktakingApi } from '@/api/stocktaking'
import { STOCKTAKING_SCOPE_PAGE_SIZE, useStocktakingPage } from './useStocktakingPage'
import { toast } from 'sonner'

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
    vi.mocked(stocktakingApi.create).mockResolvedValue({ id: 'stk-created', stocktakingNo: 'ST-20260622-001', status: 'completed' } as any)
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

  it('opens stocktaking creation directly when the dashboard passes action=create', async () => {
    window.history.replaceState(null, '', '/stocktaking?action=create')

    const { result } = renderHook(() => useStocktakingPage())

    await waitFor(() => expect(result.current.modalType).toBe('create'))

    expect(result.current.createStep).toBe(1)
    expect(materialApi.getList).toHaveBeenCalledWith({ page: 1, pageSize: 999, status: 'active' })
  })

  it('prefills a batch-scoped stocktaking draft from inventory row URL parameters', async () => {
    window.history.replaceState(
      null,
      '',
      '/stocktaking?action=create&materialId=mat-1&scopeType=batch&batchId=batch-1&locationId=loc-1&systemStock=6'
    )
    vi.mocked(inventoryApi.getList).mockResolvedValueOnce({
      list: [{
        id: 'inv-row-1',
        materialId: 'mat-1',
        batchId: 'batch-1',
        batchNo: 'BATCH-1',
        locationId: 'loc-1',
        locationName: 'A1',
        stock: 6,
      }],
      pagination: { total: 1 },
    } as any)

    const { result } = renderHook(() => useStocktakingPage())

    await waitFor(() => expect(result.current.modalType).toBe('create'))

    expect(result.current.form).toEqual(expect.objectContaining({
      materialId: 'mat-1',
      scopeType: 'batch',
      batchId: 'batch-1',
      locationId: 'loc-1',
      systemStock: 6,
      actualStock: '',
      remark: '来自库存列表现场盘点',
    }))
    expect(inventoryApi.getList).toHaveBeenCalledWith({
      materialId: 'mat-1',
      page: 1,
      pageSize: STOCKTAKING_SCOPE_PAGE_SIZE,
    })
    expect(result.current.inventoryRows).toEqual([
      expect.objectContaining({
        batchId: 'batch-1',
        locationId: 'loc-1',
        stock: 6,
      }),
    ])
  })

  it('keeps the created stocktaking number so users can confirm and audit the new record', async () => {
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
        actualStock: 5,
        remark: '',
      })
    })

    await act(async () => {
      await result.current.handleCreateSubmit()
    })

    expect(result.current.createStep).toBe(3)
    expect(result.current.createdRecord?.stocktakingNo).toBe('ST-20260622-001')
  })

  it('blocks location-scoped stocktaking without a location so the stock fact has a clear scope', async () => {
    const { result } = renderHook(() => useStocktakingPage())

    await act(async () => {
      await result.current.openCreate()
    })

    act(() => {
      result.current.setForm({
        materialId: 'mat-1',
        scopeType: 'location',
        locationId: '',
        batchId: '',
        systemStock: 6,
        actualStock: 5,
        remark: '',
      })
    })

    await act(async () => {
      await result.current.handleCreateSubmit()
    })

    expect(stocktakingApi.create).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('请选择盘点库位，库位盘点必须明确库存归属')
  })

  it('blocks batch-scoped stocktaking without a batch so the stock fact can be traced', async () => {
    const { result } = renderHook(() => useStocktakingPage())

    await act(async () => {
      await result.current.openCreate()
    })

    act(() => {
      result.current.setForm({
        materialId: 'mat-1',
        scopeType: 'batch',
        locationId: '',
        batchId: '',
        systemStock: 6,
        actualStock: 5,
        remark: '',
      })
    })

    await act(async () => {
      await result.current.handleCreateSubmit()
    })

    expect(stocktakingApi.create).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('请选择盘点批次，批次盘点必须接住批次追溯链路')
  })

  it('keeps the newly created stocktaking visible when the follow-up list refresh fails', async () => {
    vi.mocked(stocktakingApi.getList)
      .mockResolvedValueOnce({ list: [], pagination: { total: 0, page: 1, pageSize: 20 } } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(stocktakingApi.create).mockResolvedValueOnce({
      id: 'stk-visible',
      stocktakingNo: 'ST-VISIBLE-001',
      status: 'completed',
      createdAt: '2026-06-22T10:00:00.000Z',
    } as any)

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
        actualStock: 5,
        remark: '现场盘点',
      })
    })

    await act(async () => {
      await result.current.handleCreateSubmit()
    })

    expect(result.current.keyword).toBe('ST-VISIBLE-001')
    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'stk-visible',
        stocktakingNo: 'ST-VISIBLE-001',
        materialId: 'mat-1',
        materialName: '测试物料',
        materialCode: 'MAT-001',
        materialUnit: '瓶',
        systemStock: 6,
        actualStock: 5,
        difference: -1,
        status: 'completed',
        remark: '现场盘点',
      }),
    ])
    expect(result.current.total).toBe(1)
    expect(toast.success).toHaveBeenCalledWith('盘点任务已创建', {
      description: '已生成 ST-VISIBLE-001，当前只记录盘点差异；确认差异后才会调整库存、库位/批次、预警和审计链路',
    })
  })

  it('shows the backend reason when stocktaking creation fails and keeps the draft open', async () => {
    vi.mocked(stocktakingApi.create).mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: '该批次已存在未确认盘点，请先确认或撤销后再创建',
          },
        },
      },
    })

    const { result } = renderHook(() => useStocktakingPage())

    await act(async () => {
      await result.current.openCreate()
    })

    act(() => {
      result.current.setForm({
        materialId: 'mat-1',
        scopeType: 'batch',
        locationId: 'loc-1',
        batchId: 'batch-1',
        systemStock: 6,
        actualStock: 5,
        remark: '现场盘点',
      })
    })

    await act(async () => {
      await result.current.handleCreateSubmit()
    })

    expect(toast.error).toHaveBeenCalledWith('该批次已存在未确认盘点，请先确认或撤销后再创建')
    expect(result.current.modalType).toBe('create')
    expect(result.current.createStep).toBe(1)
    expect(result.current.form).toEqual(expect.objectContaining({
      materialId: 'mat-1',
      scopeType: 'batch',
      batchId: 'batch-1',
      actualStock: 5,
      remark: '现场盘点',
    }))
  })

  it('removes a withdrawn stocktaking from the current list when the follow-up refresh fails', async () => {
    vi.mocked(stocktakingApi.getList)
      .mockResolvedValueOnce({
        list: [{
          id: 'stk-withdrawn',
          stocktakingNo: 'ST-WITHDRAWN-001',
          materialId: 'mat-1',
          materialName: '测试物料',
          systemStock: 6,
          actualStock: 5,
          difference: -1,
          operator: '张三',
          status: 'completed',
          createdAt: '2026-06-22T10:00:00.000Z',
        }, {
          id: 'stk-kept',
          stocktakingNo: 'ST-KEPT-001',
          materialId: 'mat-1',
          materialName: '测试物料',
          systemStock: 10,
          actualStock: 10,
          difference: 0,
          operator: '李四',
          status: 'completed',
          createdAt: '2026-06-22T11:00:00.000Z',
        }],
        pagination: { total: 2, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(stocktakingApi.delete).mockResolvedValueOnce({ success: true } as any)

    const { result } = renderHook(() => useStocktakingPage())

    await waitFor(() => expect(result.current.data).toHaveLength(2))

    act(() => {
      result.current.openDelete(result.current.data[0])
    })

    await act(async () => {
      await result.current.handleDelete()
    })

    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'stk-kept',
        stocktakingNo: 'ST-KEPT-001',
      }),
    ])
    expect(result.current.total).toBe(1)
    expect(result.current.deleteConfirmOpen).toBe(false)
    expect(result.current.recordToDelete).toBeNull()
    expect(toast.success).toHaveBeenCalledWith('盘点记录已撤销', {
      description: 'ST-WITHDRAWN-001 已撤销；未确认盘点不会改动库存、批次、预警或成本，审计记录可按单号回看',
    })
  })

  it('keeps the confirmed stocktaking visible when the follow-up list refresh fails', async () => {
    vi.mocked(stocktakingApi.getList)
      .mockResolvedValueOnce({
        list: [{
          id: 'stk-confirm-visible',
          stocktakingNo: 'ST-CONFIRM-VISIBLE-001',
          materialId: 'mat-1',
          materialName: '测试物料',
          materialCode: 'MAT-001',
          materialUnit: '瓶',
          systemStock: 6,
          actualStock: 5,
          difference: -1,
          operator: '张三',
          status: 'completed',
          createdAt: '2026-06-22T10:00:00.000Z',
          remark: '现场盘点',
        }],
        pagination: { total: 1, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('confirm refresh failed'))
    vi.mocked(stocktakingApi.confirm).mockResolvedValueOnce({ success: true } as any)

    const { result } = renderHook(() => useStocktakingPage())

    await waitFor(() => expect(result.current.data[0]?.stocktakingNo).toBe('ST-CONFIRM-VISIBLE-001'))

    act(() => {
      result.current.openAdjust(result.current.data[0])
    })

    await act(async () => {
      await result.current.handleAdjustConfirm({ reason: 'physical', remark: '复核后确认差异' })
    })

    await waitFor(() => expect(stocktakingApi.confirm).toHaveBeenCalledWith('stk-confirm-visible', {
      reason: 'physical',
      remark: '复核后确认差异',
    }))
    expect(result.current.keyword).toBe('ST-CONFIRM-VISIBLE-001')
    expect(result.current.statusFilter).toBe('confirmed')
    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'stk-confirm-visible',
        stocktakingNo: 'ST-CONFIRM-VISIBLE-001',
        status: 'confirmed',
        difference: -1,
        remark: '复核后确认差异',
      }),
    ])
    expect(result.current.total).toBe(1)
    expect(result.current.modalType).toBeNull()
    expect(result.current.detailRow).toBeNull()
    expect(toast.success).toHaveBeenCalledWith('盘点差异已确认', {
      description: 'ST-CONFIRM-VISIBLE-001 已确认差异 -1；库存、库位/批次、预警、库存流水和审计记录已按单号接住',
    })
  })

  it('shows the backend reason when stocktaking difference confirmation fails', async () => {
    vi.mocked(stocktakingApi.getList).mockResolvedValueOnce({
      list: [{
        id: 'stk-confirm-fail',
        stocktakingNo: 'ST-CONFIRM-FAIL-001',
        materialId: 'mat-1',
        materialName: '测试物料',
        materialCode: 'MAT-001',
        materialUnit: '瓶',
        systemStock: 6,
        actualStock: 5,
        difference: -1,
        operator: '张三',
        status: 'completed',
        createdAt: '2026-06-22T10:00:00.000Z',
        remark: '现场盘点',
      }],
      pagination: { total: 1, page: 1, pageSize: 20 },
    } as any)
    vi.mocked(stocktakingApi.confirm).mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: '该批次已有后续出库，不能直接确认盘点差异',
          },
        },
      },
    })

    const { result } = renderHook(() => useStocktakingPage())

    await waitFor(() => expect(result.current.data[0]?.stocktakingNo).toBe('ST-CONFIRM-FAIL-001'))

    act(() => {
      result.current.openAdjust(result.current.data[0])
    })

    await act(async () => {
      await result.current.handleAdjustConfirm({ reason: 'physical', remark: '复核后确认差异' })
    })

    expect(toast.error).toHaveBeenCalledWith('该批次已有后续出库，不能直接确认盘点差异')
    expect(result.current.modalType).toBe('adjust')
    expect(result.current.detailRow?.stocktakingNo).toBe('ST-CONFIRM-FAIL-001')
  })
})
