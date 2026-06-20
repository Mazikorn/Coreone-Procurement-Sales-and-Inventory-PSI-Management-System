import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInventoryPage } from './useInventoryPage'
import { bomApi, categoryApi, locationApi, materialApi, projectApi, userApi } from '@/api/master'
import { depletionApi, inventoryApi, outboundApi, scrapApi } from '@/api/inventory'

vi.mock('@/api/master')
vi.mock('@/api/inventory')
vi.mock('sonner')

describe('useInventoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    window.history.replaceState(null, '', '/')
    localStorage.setItem('user', JSON.stringify({
      id: 'USER-WHM',
      username: 'wangkq',
      realName: '王坤强',
      role: 'warehouse_manager',
    }))

    vi.mocked(inventoryApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(inventoryApi.getStats).mockResolvedValue({} as any)
    vi.mocked(inventoryApi.getConsistencyCheck).mockResolvedValue({
      summary: { issueCount: 1, criticalCount: 1, warningCount: 0 },
      issues: [
        {
          code: 'INVENTORY_BATCH_MISMATCH',
          severity: 'critical',
          entityType: 'material',
          entityId: 'MAT-001',
          entityCode: 'MAT-001',
          entityName: 'DAB',
          message: '库存总账与启用批次剩余量汇总不一致',
          impacts: { inventoryStock: 10, activeBatchRemaining: 4 },
        },
      ],
    } as any)
    vi.mocked(depletionApi.getTracking).mockResolvedValue({ list: [] } as any)
    vi.mocked(depletionApi.getDepletion).mockResolvedValue({ list: [] } as any)
    vi.mocked(projectApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(categoryApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(locationApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(userApi.getList).mockResolvedValue({ list: [{ id: 'USER-001', realName: '管理员' }], pagination: { total: 1 } } as any)
    vi.mocked(materialApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(bomApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(outboundApi.create).mockResolvedValue({ id: 'outbound-1' } as any)
    vi.mocked(scrapApi.batchCreate).mockResolvedValue({ createdCount: 1, ids: ['scrap-1'] } as any)
  })

  it('does not fetch admin-only users list for non-admin inventory users', async () => {
    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => expect(projectApi.getList).toHaveBeenCalled())

    expect(userApi.getList).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.userList).toEqual([
      expect.objectContaining({
        id: 'USER-WHM',
        real_name: '王坤强',
      }),
    ]))
    expect(depletionApi.getTracking).not.toHaveBeenCalled()
    expect(depletionApi.getDepletion).not.toHaveBeenCalled()
    expect(result.current.canAccessDepletion).toBe(false)
  })

  it('does not fetch warehouse-only locations for technician inventory users', async () => {
    localStorage.setItem('user', JSON.stringify({
      id: 'USER-TECH',
      username: 'jishu',
      realName: '技术员',
      role: 'technician',
    }))

    renderHook(() => useInventoryPage())

    await waitFor(() => expect(projectApi.getList).toHaveBeenCalled())

    expect(locationApi.getList).not.toHaveBeenCalled()
    expect(userApi.getList).not.toHaveBeenCalled()
  })

  it('does not fetch project or location refs for procurement inventory users', async () => {
    localStorage.setItem('user', JSON.stringify({
      id: 'USER-PROC',
      username: 'caigou',
      realName: '采购员',
      role: 'procurement',
    }))

    renderHook(() => useInventoryPage())

    await waitFor(() => expect(categoryApi.getList).toHaveBeenCalled())

    expect(projectApi.getList).not.toHaveBeenCalled()
    expect(locationApi.getList).not.toHaveBeenCalled()
    expect(userApi.getList).not.toHaveBeenCalled()
  })

  it('keeps manager inventory users read-only for warehouse execution actions', async () => {
    localStorage.setItem('user', JSON.stringify({
      id: 'USER-MGR',
      username: 'guanli',
      realName: '顾管理',
      role: 'manager',
    }))

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => expect(categoryApi.getList).toHaveBeenCalled())

    expect(result.current.canManageInventoryActions).toBe(false)
    expect(projectApi.getList).not.toHaveBeenCalled()
    expect(locationApi.getList).not.toHaveBeenCalled()
    expect(userApi.getList).not.toHaveBeenCalled()

    act(() => {
      result.current.openOutboundModal()
      result.current.openBatchOutbound()
      result.current.openBatchScrap()
      result.current.toggleSelectOne('any-inventory-row')
      result.current.setScrapReason('expired')
    })

    expect(result.current.outboundModalOpen).toBe(false)
    expect(result.current.batchOutboundModalOpen).toBe(false)
    expect(result.current.batchScrapModalOpen).toBe(false)

    await act(async () => {
      await result.current.confirmBatchScrap()
    })

    expect(scrapApi.batchCreate).not.toHaveBeenCalled()
  })

  it('passes materialId from URL to inventory list and stats APIs', async () => {
    window.history.replaceState(null, '', '/inventory?materialId=MAT-URL-001')

    renderHook(() => useInventoryPage())

    await waitFor(() => {
      expect(inventoryApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        materialId: 'MAT-URL-001',
      }))
      expect(inventoryApi.getStats).toHaveBeenCalledWith(expect.objectContaining({
        materialId: 'MAT-URL-001',
      }))
    })
  })

  it('opens and stores inventory consistency check results', async () => {
    const { result } = renderHook(() => useInventoryPage())

    await act(async () => {
      await result.current.runConsistencyCheck()
    })

    expect(inventoryApi.getConsistencyCheck).toHaveBeenCalledTimes(1)
    expect(result.current.consistencyModalOpen).toBe(true)
    expect(result.current.consistencyLoading).toBe(false)
    expect(result.current.consistencyResult?.summary.issueCount).toBe(1)
    expect(result.current.consistencyResult?.issues[0].code).toBe('INVENTORY_BATCH_MISMATCH')
  })

  it('passes the selected batch id and batch remaining quantity to batch scrap', async () => {
    vi.mocked(inventoryApi.getList).mockResolvedValue({
      list: [
        {
          id: 'INV-MAT-001-BATCH-001',
          materialId: 'MAT-001',
          batchId: 'BATCH-001',
          batch: 'B-001',
          code: 'MAT-001',
          name: '测试物料',
          spec: '1ml',
          unit: '瓶',
          stock: 3,
          totalStock: 10,
          minStock: 1,
          maxStock: 100,
          availableStock: 3,
          status: 'normal',
        },
        {
          id: 'INV-MAT-001-BATCH-002',
          materialId: 'MAT-001',
          batchId: 'BATCH-002',
          batch: 'B-002',
          code: 'MAT-001',
          name: '测试物料',
          spec: '1ml',
          unit: '瓶',
          stock: 7,
          totalStock: 10,
          minStock: 1,
          maxStock: 100,
          availableStock: 7,
          status: 'normal',
        },
      ],
      pagination: { total: 2 },
    } as any)

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => expect(result.current.data).toHaveLength(2))

    act(() => {
      result.current.toggleSelectOne('INV-MAT-001-BATCH-001')
      result.current.setScrapReason('expired')
    })

    await act(async () => {
      await result.current.confirmBatchScrap()
    })

    expect(scrapApi.batchCreate).toHaveBeenCalledWith([
      expect.objectContaining({
        materialId: 'MAT-001',
        batchId: 'BATCH-001',
        quantity: 3,
        reason: 'expired',
      }),
    ])
  })

  it('passes the selected batch id when confirming outbound from an inventory batch row', async () => {
    vi.mocked(inventoryApi.getList).mockResolvedValue({
      list: [
        {
          id: 'INV-MAT-002-BATCH-003',
          materialId: 'MAT-002',
          batchId: 'BATCH-003',
          batch: 'B-003',
          code: 'MAT-002',
          name: '出库测试物料',
          spec: '2ml',
          unit: '盒',
          stock: 6,
          totalStock: 6,
          minStock: 1,
          maxStock: 100,
          availableStock: 6,
          status: 'normal',
        },
      ],
      pagination: { total: 1 },
    } as any)

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.openOutboundModal(result.current.data[0])
    })

    const rowId = result.current.outboundMaterials[0].rowId
    act(() => {
      result.current.updateOutboundUser(rowId, '王坤强')
    })

    await act(async () => {
      await result.current.confirmOutbound()
    })

    expect(outboundApi.create).toHaveBeenCalledWith(expect.objectContaining({
      items: [
        expect.objectContaining({
          materialId: 'MAT-002',
          batchId: 'BATCH-003',
          quantity: 1,
        }),
      ],
    }))
  })
})
