import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInventoryPage } from './useInventoryPage'
import { bomApi, categoryApi, locationApi, materialApi, projectApi, userApi } from '@/api/master'
import { depletionApi, inventoryApi, outboundApi, scrapApi } from '@/api/inventory'
import { toast } from 'sonner'

vi.mock('@/api/master')
vi.mock('@/api/inventory')
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

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
    vi.mocked(projectApi.getList).mockResolvedValue({
      list: [{ id: 'PROJECT-001', code: 'PRJ001', name: 'HE制片', status: 'active' }],
      pagination: { total: 1 },
    } as any)
    vi.mocked(categoryApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(locationApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(userApi.getList).mockResolvedValue({ list: [{ id: 'USER-001', realName: '管理员' }], pagination: { total: 1 } } as any)
    vi.mocked(materialApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(bomApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(outboundApi.create).mockResolvedValue({ id: 'outbound-1' } as any)
    vi.mocked(scrapApi.batchCreate).mockResolvedValue({ createdCount: 1, ids: ['scrap-1'] } as any)
  })

  it('lets warehouse inventory users load depletion tabs without fetching admin-only users', async () => {
    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => expect(projectApi.getList).toHaveBeenCalled())

    expect(userApi.getList).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.userList).toEqual([
      expect.objectContaining({
        id: 'USER-WHM',
        real_name: '王坤强',
      }),
    ]))
    expect(depletionApi.getTracking).toHaveBeenCalledWith({ status: 'in-use' })
    expect(depletionApi.getDepletion).toHaveBeenCalledTimes(1)
    expect(result.current.canAccessDepletion).toBe(true)
    expect(result.current.canManageDepletionActions).toBe(true)
  })

  it('maps depletion tracking and depleted records returned by the backend snake_case API', async () => {
    vi.mocked(depletionApi.getTracking).mockResolvedValue({
      list: [
        {
          id: 'tracking-1',
          material_id: 'MAT-DPL-001',
          material_name: 'DAB染色液',
          batch: 'BATCH-DPL-001',
          spec: '1ml',
          total_qty: 10,
          remaining: 3,
          unit: 'ml',
          days_used: 5,
          expected_days: 12,
          status: 'in-use',
        },
      ],
    } as any)
    vi.mocked(depletionApi.getDepletion).mockResolvedValue({
      list: [
        {
          id: 'DPL-001',
          material_name: '苏木素染液',
          batch: 'BATCH-DPL-OLD',
          spec: '500ml',
          deplete_type: 'abnormal',
          deplete_reason: '瓶口污染',
          operator: 'wangkq',
          total_qty: 8,
          remain_qty: 1,
          unit: 'ml',
          start_date: '2026-06-01',
          end_date: '2026-06-22',
          actual_days: 21,
        },
      ],
    } as any)

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => expect(result.current.depletionTracking).toHaveLength(1))
    expect(result.current.depletionTracking[0]).toEqual(expect.objectContaining({
      id: 'tracking-1',
      materialName: 'DAB染色液',
      batch: 'BATCH-DPL-001',
      totalQty: 10,
      remaining: 3,
      daysUsed: 5,
      expectedDays: 12,
    }))
    expect(result.current.depletedRecords[0]).toEqual(expect.objectContaining({
      id: 'DPL-001',
      materialName: '苏木素染液',
      batch: 'BATCH-DPL-OLD',
      depleteType: '异常耗尽',
      depleteReason: '瓶口污染',
      operator: 'wangkq',
      totalQty: 8,
      remainQty: 1,
      startDate: '2026-06-01',
      endDate: '2026-06-22',
      actualDays: 21,
    }))
  })

  it('keeps adjusted remaining visible after updating depletion remain even when the follow-up refresh fails', async () => {
    vi.mocked(depletionApi.getTracking)
      .mockResolvedValueOnce({
        list: [
          {
            id: 'tracking-remain-1',
            material_name: 'DAB染色液',
            batch: 'BATCH-REMAIN-001',
            spec: '1ml',
            total_qty: 10,
            remaining: 6,
            unit: 'ml',
            days_used: 4,
            expected_days: 12,
            status: 'in-use',
          },
        ],
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => expect(result.current.depletionTracking).toHaveLength(1))

    act(() => {
      result.current.setSelectedDepletionItem(result.current.depletionTracking[0])
      result.current.setEditRemainValue('2')
      result.current.setEditRemainReason('现场复核剩余量')
      result.current.setEditRemainModalOpen(true)
    })

    await act(async () => {
      await result.current.confirmEditRemain()
    })

    expect(depletionApi.updateRemain).toHaveBeenCalledWith('tracking-remain-1', {
      remaining: 2,
      reason: '现场复核剩余量',
    })
    expect(result.current.depletionTracking[0]).toEqual(expect.objectContaining({
      id: 'tracking-remain-1',
      remaining: 2,
      progress: 80,
    }))
    expect(result.current.editRemainModalOpen).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('剩余量已更新', {
      description: '使用中记录、批次余量、耗材消耗和审计链路已同步',
    })
    expect(toast.error).not.toHaveBeenCalledWith('剩余量更新失败')
  })

  it('keeps a confirmed depletion in completed records when the follow-up refresh fails', async () => {
    vi.mocked(depletionApi.getTracking)
      .mockResolvedValueOnce({
        list: [
          {
            id: 'tracking-deplete-1',
            material_name: '苏木素染液',
            batch: 'BATCH-DPL-DONE',
            spec: '500ml',
            total_qty: 8,
            remaining: 3,
            unit: 'ml',
            days_used: 6,
            expected_days: 10,
            status: 'in-use',
          },
        ],
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => expect(result.current.depletionTracking).toHaveLength(1))

    act(() => {
      result.current.setSelectedDepletionItem(result.current.depletionTracking[0])
      result.current.setDepleteType('abnormal')
      result.current.setDepleteRemainValue('1')
      result.current.setExpiredReason('瓶口污染')
      result.current.setConfirmDepleteModalOpen(true)
    })

    await act(async () => {
      await result.current.confirmDeplete()
    })

    expect(depletionApi.deplete).toHaveBeenCalledWith('tracking-deplete-1', {
      remain_qty: 1,
      deplete_type: 'abnormal',
      deplete_reason: '瓶口污染',
    })
    expect(result.current.depletionTracking).toHaveLength(0)
    expect(result.current.depletedRecords[0]).toEqual(expect.objectContaining({
      id: 'tracking-deplete-1',
      materialName: '苏木素染液',
      batch: 'BATCH-DPL-DONE',
      depleteType: '异常耗尽',
      depleteReason: '瓶口污染',
      totalQty: 8,
      remainQty: 1,
      unit: 'ml',
      actualDays: 6,
    }))
    expect(result.current.confirmDepleteModalOpen).toBe(false)
    expect(toast.success).toHaveBeenCalledWith('已确认耗尽', {
      description: '使用中记录已归档，批次、耗尽记录、库存状态和审计链路已同步',
    })
    expect(toast.error).not.toHaveBeenCalledWith('确认耗尽失败')
  })

  it('keeps pathologist depletion access read-only', async () => {
    localStorage.setItem('user', JSON.stringify({
      id: 'USER-PATH',
      username: 'liuyf',
      realName: '刘医生',
      role: 'pathologist',
    }))

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => expect(depletionApi.getTracking).toHaveBeenCalledWith({ status: 'in-use' }))
    expect(result.current.canAccessDepletion).toBe(true)
    expect(result.current.canManageDepletionActions).toBe(false)
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

  it('uses keyword from URL so audit and business links land on a filtered inventory view', async () => {
    window.history.replaceState(null, '', '/inventory?keyword=BATCH-URL-001')

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => {
      expect(inventoryApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'BATCH-URL-001',
      }))
      expect(inventoryApi.getStats).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'BATCH-URL-001',
      }))
    })
    expect(result.current.keyword).toBe('BATCH-URL-001')
  })

  it('uses quick low-stock URL parameter so dashboard todos land on the shortage list', async () => {
    window.history.replaceState(null, '', '/inventory?quick=low-stock')

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => {
      expect(inventoryApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        status: 'low-stock',
      }))
    })
    expect(result.current.quickFilter).toBe('low-stock')
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
      result.current.setScrapResponsiblePerson(' 张三 ')
      result.current.setScrapResponsibleDepartment(' 病理科 ')
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
        responsiblePerson: '张三',
        responsibleDepartment: '病理科',
      }),
    ])
  })

  it('keeps scrapped stock visible after batch scrap even when the follow-up inventory refresh fails', async () => {
    vi.mocked(inventoryApi.getList)
      .mockResolvedValueOnce({
        list: [
          {
            id: 'INV-MAT-006-BATCH-006',
            materialId: 'MAT-006',
            batchId: 'BATCH-006',
            batch: 'B-006',
            code: 'MAT-006',
            name: '即时报废物料',
            spec: '5ml',
            unit: '盒',
            stock: 3,
            totalStock: 3,
            minStock: 1,
            maxStock: 100,
            availableStock: 3,
            status: 'normal',
          },
        ],
        pagination: { total: 1 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.toggleSelectOne('INV-MAT-006-BATCH-006')
      result.current.setScrapReason('damaged')
      result.current.setScrapResponsiblePerson(' 李四 ')
      result.current.setScrapResponsibleDepartment(' 仓库 ')
    })

    await act(async () => {
      await result.current.confirmBatchScrap()
    })

    expect(scrapApi.batchCreate).toHaveBeenCalledWith([
      expect.objectContaining({
        materialId: 'MAT-006',
        batchId: 'BATCH-006',
        quantity: 3,
        reason: 'damaged',
        responsiblePerson: '李四',
        responsibleDepartment: '仓库',
      }),
    ])
    expect(result.current.data[0]).toEqual(expect.objectContaining({
      id: 'INV-MAT-006-BATCH-006',
      stock: 0,
      availableStock: 0,
    }))
    expect(toast.success).toHaveBeenCalledWith('报废登记成功', {
      description: '已报废 1 项物料，库存和批次已扣减，报废记录进入成本、库存流水和审计链路',
    })
    expect(toast.error).not.toHaveBeenCalledWith('报废登记失败')
  })

  it('shows the backend reason when quick batch scrap fails', async () => {
    vi.mocked(inventoryApi.getList).mockResolvedValue({
      list: [
        {
          id: 'INV-MAT-SCRAP-LOCKED-BATCH',
          materialId: 'MAT-SCRAP-LOCKED',
          batchId: 'BATCH-SCRAP-LOCKED',
          batch: 'B-SCRAP-LOCKED',
          code: 'MAT-SCRAP-LOCKED',
          name: '锁定报废物料',
          spec: '5ml',
          unit: '盒',
          stock: 3,
          totalStock: 3,
          minStock: 1,
          maxStock: 100,
          availableStock: 3,
          status: 'normal',
        },
      ],
      pagination: { total: 1 },
    } as any)
    vi.mocked(scrapApi.batchCreate).mockRejectedValueOnce({
      response: {
        data: {
          message: '该批次已被盘点锁定，不能报废',
        },
      },
    })

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => expect(result.current.data).toHaveLength(1))

    act(() => {
      result.current.toggleSelectOne('INV-MAT-SCRAP-LOCKED-BATCH')
      result.current.setScrapReason('damaged')
    })

    await act(async () => {
      await result.current.confirmBatchScrap()
    })

    expect(toast.error).toHaveBeenCalledWith('该批次已被盘点锁定，不能报废')
    expect(result.current.selectedIds.has('INV-MAT-SCRAP-LOCKED-BATCH')).toBe(true)
    expect(result.current.scrapReason).toBe('damaged')
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

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1)
      expect(result.current.projectList).toHaveLength(1)
    })

    act(() => {
      result.current.openOutboundModal(result.current.data[0])
    })

    const rowId = result.current.outboundMaterials[0].rowId
    act(() => {
      result.current.updateOutboundUser(rowId, '王坤强')
      result.current.updateOutboundProject(rowId, 'PROJECT-001')
    })

    await act(async () => {
      await result.current.confirmOutbound()
    })

    expect(outboundApi.create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'PROJECT-001',
      items: [
        expect.objectContaining({
          materialId: 'MAT-002',
          batchId: 'BATCH-003',
          quantity: 1,
        }),
      ],
    }))
  })

  it('keeps the deducted stock visible after outbound even when the follow-up inventory refresh fails', async () => {
    vi.mocked(inventoryApi.getList)
      .mockResolvedValueOnce({
        list: [
          {
            id: 'INV-MAT-005-BATCH-005',
            materialId: 'MAT-005',
            batchId: 'BATCH-005',
            batch: 'B-005',
            code: 'MAT-005',
            name: '即时扣减物料',
            spec: '5ml',
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
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(outboundApi.create).mockResolvedValueOnce({
      id: 'outbound-quick-visible',
      outboundNo: 'OUT-QUICK-VISIBLE-001',
    } as any)

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1)
      expect(result.current.projectList).toHaveLength(1)
    })

    act(() => {
      result.current.openOutboundModal(result.current.data[0])
    })

    const rowId = result.current.outboundMaterials[0].rowId
    act(() => {
      result.current.updateOutboundQuantity(rowId, '2')
      result.current.updateOutboundUser(rowId, '王坤强')
      result.current.updateOutboundProject(rowId, 'PROJECT-001')
    })

    await act(async () => {
      await result.current.confirmOutbound()
    })

    expect(outboundApi.create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'PROJECT-001',
      items: [
        expect.objectContaining({
          materialId: 'MAT-005',
          batchId: 'BATCH-005',
          quantity: 2,
        }),
      ],
    }))
    expect(result.current.data[0]).toEqual(expect.objectContaining({
      id: 'INV-MAT-005-BATCH-005',
      stock: 4,
      availableStock: 4,
    }))
    expect(toast.success).toHaveBeenCalledWith('出库登记成功', {
      description: '已生成 OUT-QUICK-VISIBLE-001，库存和批次已扣减；成本和审计可按单号回看，项目对账请按项目进入消耗对账查看实际出库影响',
    })
    expect(toast.error).not.toHaveBeenCalledWith('出库登记失败')
  })

  it('shows the backend reason when quick outbound fails', async () => {
    vi.mocked(inventoryApi.getList).mockResolvedValue({
      list: [
        {
          id: 'INV-MAT-OUTBOUND-LOCKED-BATCH',
          materialId: 'MAT-OUTBOUND-LOCKED',
          batchId: 'BATCH-OUTBOUND-LOCKED',
          batch: 'B-OUTBOUND-LOCKED',
          code: 'MAT-OUTBOUND-LOCKED',
          name: '锁定出库物料',
          spec: '5ml',
          unit: '盒',
          stock: 3,
          totalStock: 3,
          minStock: 1,
          maxStock: 100,
          availableStock: 3,
          status: 'normal',
        },
      ],
      pagination: { total: 1 },
    } as any)
    vi.mocked(outboundApi.create).mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: '批次库存不足：需要 4盒，可用 3盒',
          },
        },
      },
    })

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => {
      expect(result.current.data).toHaveLength(1)
      expect(result.current.projectList).toHaveLength(1)
    })

    act(() => {
      result.current.openOutboundModal(result.current.data[0])
    })

    const rowId = result.current.outboundMaterials[0].rowId
    act(() => {
      result.current.updateOutboundQuantity(rowId, '2')
      result.current.updateOutboundUser(rowId, '王坤强')
      result.current.updateOutboundProject(rowId, 'PROJECT-001')
    })

    await act(async () => {
      await result.current.confirmOutbound()
    })

    expect(toast.error).toHaveBeenCalledWith('批次库存不足：需要 4盒，可用 3盒')
    expect(result.current.outboundModalOpen).toBe(true)
  })

  it('blocks quick outbound from inventory when project ownership is missing or mixed', async () => {
    vi.mocked(inventoryApi.getList).mockResolvedValue({
      list: [
        {
          id: 'INV-MAT-003-BATCH-A',
          materialId: 'MAT-003',
          batchId: 'BATCH-A',
          batch: 'B-A',
          code: 'MAT-003',
          name: '快捷出库物料A',
          spec: '2ml',
          unit: '盒',
          stock: 6,
          totalStock: 6,
          minStock: 1,
          maxStock: 100,
          availableStock: 6,
          status: 'normal',
        },
        {
          id: 'INV-MAT-004-BATCH-B',
          materialId: 'MAT-004',
          batchId: 'BATCH-B',
          batch: 'B-B',
          code: 'MAT-004',
          name: '快捷出库物料B',
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
      pagination: { total: 2 },
    } as any)
    vi.mocked(projectApi.getList).mockResolvedValue({
      list: [
        { id: 'PROJECT-001', code: 'PRJ001', name: 'HE制片', status: 'active' },
        { id: 'PROJECT-002', code: 'PRJ002', name: 'IHC染色', status: 'active' },
      ],
      pagination: { total: 2 },
    } as any)

    const { result } = renderHook(() => useInventoryPage())

    await waitFor(() => {
      expect(result.current.data).toHaveLength(2)
      expect(result.current.projectList).toHaveLength(2)
    })

    act(() => {
      result.current.openOutboundModal(result.current.data[0])
    })

    const firstRowId = result.current.outboundMaterials[0].rowId
    act(() => {
      result.current.updateOutboundUser(firstRowId, '王坤强')
    })

    await act(async () => {
      await result.current.confirmOutbound()
    })

    expect(outboundApi.create).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('请选择检测项目，快捷出库必须归属到项目才能进入成本和对账')

    act(() => {
      result.current.toggleSelectOne('INV-MAT-003-BATCH-A')
      result.current.toggleSelectOne('INV-MAT-004-BATCH-B')
    })
    act(() => {
      result.current.confirmBatchOutboundOnly()
    })
    const rowIds = result.current.outboundMaterials.map(item => item.rowId)
    expect(rowIds).toHaveLength(2)
    act(() => {
      result.current.updateOutboundUser(rowIds[0], '王坤强')
      result.current.updateOutboundProject(rowIds[0], 'PROJECT-001')
      result.current.updateOutboundUser(rowIds[1], '王坤强')
      result.current.updateOutboundProject(rowIds[1], 'PROJECT-002')
    })

    await act(async () => {
      await result.current.confirmOutbound()
    })

    expect(outboundApi.create).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('一次快捷出库只能关联一个检测项目，请分项目分别出库')
  })
})
