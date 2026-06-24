import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useInboundPage } from './useInboundPage'
import { inboundApi, purchaseOrderApi } from '@/api/inventory'
import { materialApi, supplierApi, locationApi } from '@/api/master'
import type { InboundRecord, Material, Supplier, Location } from '@/types'
import { toast } from 'sonner'

vi.mock('@/api/inventory')
vi.mock('@/api/master')
vi.mock('sonner')

const mockMaterials: Material[] = [
  { id: 'mat-1', code: 'M001', name: '耗材A', spec: '10ml', unit: '盒', price: 50, stock: 100, minStock: 10, maxStock: 500, safetyStock: 20, categoryId: 'cat-1', status: 'active', createdAt: '', updatedAt: '' },
]

const mockSuppliers: Supplier[] = [
  { id: 'sup-1', code: 'S001', name: '供应商A', status: 'active', cooperationCount: 5, totalAmount: 10000, rating: 4, createdAt: '', updatedAt: '' },
]

const mockLocations: Location[] = [
  { id: 'loc-1', code: 'L001', name: 'A1-01', type: 'shelf', zone: 'A区', capacity: 100, used: 50, status: 'active', createdAt: '' },
]

const mockInboundRecord: InboundRecord = {
  id: 'inb-1',
  inboundNo: 'IN-20240526-001',
  type: 'purchase',
  materialId: 'mat-1',
  materialName: '耗材A',
  quantity: 100,
  unit: '盒',
  price: 50,
  amount: 5000,
  locationId: 'loc-1',
  operator: 'admin',
  status: 'completed',
  createdAt: '2024-05-26T08:00:00Z',
}

const mockInboundRecord2: InboundRecord = {
  ...mockInboundRecord,
  id: 'inb-2',
  inboundNo: 'IN-20240526-002',
  batchNo: 'B002',
}

describe('useInboundPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    localStorage.setItem('user', JSON.stringify({ id: 'USER-ADMIN', username: 'admin', realName: '管理员', role: 'admin' }))
    window.history.replaceState(null, '', '/')

    vi.mocked(inboundApi.getList).mockResolvedValue({
      list: [mockInboundRecord, mockInboundRecord2],
      pagination: { total: 2, page: 1, pageSize: 20 },
    } as any)
    vi.mocked(inboundApi.getStats).mockResolvedValue({ total: 1, completed: 1, cancelled: 0, amount: 5000, supplierCount: 1, pendingOrders: 0 } as any)
    vi.mocked(inboundApi.checkDeletable).mockResolvedValue({ data: { canDelete: true } } as any)
    vi.mocked(inboundApi.delete).mockResolvedValue({} as any)
    vi.mocked(inboundApi.cancel).mockResolvedValue({} as any)
    vi.mocked(inboundApi.create).mockResolvedValue({} as any)
    vi.mocked(inboundApi.update).mockResolvedValue({} as any)
    vi.mocked(inboundApi.createTransfer).mockResolvedValue({} as any)

    vi.mocked(materialApi.getList).mockResolvedValue({ list: mockMaterials, pagination: { total: 1 } } as any)
    vi.mocked(supplierApi.getList).mockResolvedValue({ list: mockSuppliers, pagination: { total: 1 } } as any)
    vi.mocked(locationApi.getList).mockResolvedValue({ list: mockLocations, pagination: { total: 1 } } as any)
    vi.mocked(purchaseOrderApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(purchaseOrderApi.receive).mockResolvedValue({} as any)
  })

  it('should fetch purchase orders and stats on mount', async () => {
    renderHook(() => useInboundPage())

    await waitFor(() => {
      expect(purchaseOrderApi.getList).toHaveBeenCalledWith({ status: 'pending,partial', page: 1, pageSize: 999 })
      expect(inboundApi.getStats).toHaveBeenCalled()
    })
  })

  it('should fetch purchase orders and locations for warehouse inbound users', async () => {
    localStorage.setItem('user', JSON.stringify({
      id: 'USER-WHM',
      username: 'wangkq',
      realName: '王坤强',
      role: 'warehouse_manager',
    }))

    renderHook(() => useInboundPage())

    await waitFor(() => expect(inboundApi.getStats).toHaveBeenCalled())

    expect(purchaseOrderApi.getList).toHaveBeenCalledWith({ status: 'pending,partial', page: 1, pageSize: 999 })
    expect(locationApi.getList).toHaveBeenCalled()
  })

  it('should not fetch locations for procurement inbound users', async () => {
    localStorage.setItem('user', JSON.stringify({
      id: 'USER-PROC',
      username: 'caigou',
      realName: '采购员',
      role: 'procurement',
    }))

    renderHook(() => useInboundPage())

    await waitFor(() => expect(purchaseOrderApi.getList).toHaveBeenCalled())

    expect(locationApi.getList).not.toHaveBeenCalled()
  })

  it('should fetch inbound list on mount', async () => {
    const { result } = renderHook(() => useInboundPage())

    await waitFor(() => {
      expect(inboundApi.getList).toHaveBeenCalled()
      expect(result.current.data.length).toBeGreaterThan(0)
    })
  })

  it('should reset page to 1 when search keyword changes', async () => {
    const { result } = renderHook(() => useInboundPage())

    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setSearchKeyword('test')
    })

    await waitFor(() => {
      expect(result.current.page).toBe(1)
    })
  })

  it('should open cancel modal without delete pre-check', async () => {
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleDelete(mockInboundRecord)
    })

    expect(inboundApi.checkDeletable).not.toHaveBeenCalled()
    expect(result.current.modalType).toBe('cancel')
    expect(result.current.selectedRecord?.id).toBe('inb-1')
    expect(inboundApi.cancel).not.toHaveBeenCalled()
  })

  it('should validate form before submit — missing material', async () => {
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setForm({
        type: 'purchase', materialId: '', batchNo: '', quantity: 0, price: 0,
        supplierId: '', locationId: '', fromLocationId: '', fromLocationName: '',
        productionDate: '', expiryDate: '', remark: '', purchaseOrderId: '',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(inboundApi.create).not.toHaveBeenCalled()
  })

  it('should validate form before submit — quantity must be positive', async () => {
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setForm({
        type: 'purchase', materialId: 'mat-1', batchNo: '', quantity: 0, price: 50,
        supplierId: '', locationId: 'loc-1', fromLocationId: '', fromLocationName: '',
        productionDate: '', expiryDate: '', remark: '', purchaseOrderId: '',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(inboundApi.create).not.toHaveBeenCalled()
  })

  it('should validate form before submit — batch, location and expiry facts are required', async () => {
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setForm({
        type: 'direct', materialId: 'mat-1', batchNo: '', quantity: 10, price: 50,
        supplierId: 'sup-1', locationId: 'loc-1', fromLocationId: '', fromLocationName: '',
        productionDate: '', expiryDate: '2027-12-31', remark: '', purchaseOrderId: '',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(inboundApi.create).not.toHaveBeenCalled()

    act(() => {
      result.current.setForm(prev => ({ ...prev, batchNo: 'B001', locationId: '', expiryDate: '2027-12-31' }))
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(inboundApi.create).not.toHaveBeenCalled()

    act(() => {
      result.current.setForm(prev => ({ ...prev, batchNo: 'B001', locationId: 'loc-1', expiryDate: '' }))
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(inboundApi.create).not.toHaveBeenCalled()
  })

  it('should validate purchase inbound before submit — purchase order must be linked', async () => {
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setForm({
        type: 'purchase', materialId: 'mat-1', batchNo: 'B001', quantity: 10, price: 50,
        supplierId: 'sup-1', locationId: 'loc-1', fromLocationId: '', fromLocationName: '',
        productionDate: '', expiryDate: '2027-12-31', remark: '', purchaseOrderId: '',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(inboundApi.create).not.toHaveBeenCalled()
  })

  it('refreshes active material candidates before opening create modal and clears stale material selection', async () => {
    const staleMaterial = {
      ...mockMaterials[0],
      id: 'mat-stale',
      code: 'STALE-001',
      name: '已停用旧候选',
      status: 'active',
    } as Material
    vi.mocked(materialApi.getList)
      .mockResolvedValueOnce({ list: [staleMaterial], pagination: { total: 1 } } as any)
      .mockResolvedValueOnce({ list: [], pagination: { total: 0 } } as any)

    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.materials[0]?.id).toBe('mat-stale'))

    await act(async () => {
      await result.current.openCreate()
    })

    expect(materialApi.getList).toHaveBeenLastCalledWith({ page: 1, pageSize: 999, status: 'active' })
    await waitFor(() => expect(result.current.materials).toHaveLength(0))
    expect(result.current.modalType).toBe('create')
    expect(result.current.form.materialId).toBe('')
  })

  it('should create inbound on valid submit', async () => {
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setForm({
        type: 'direct', materialId: 'mat-1', batchNo: 'B001', quantity: 10, price: 50,
        supplierId: 'sup-1', locationId: 'loc-1', fromLocationId: '', fromLocationName: '',
        productionDate: '', expiryDate: '2027-12-31', remark: '', purchaseOrderId: '',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    await waitFor(() => {
      expect(inboundApi.create).toHaveBeenCalled()
    })
  })

  it('shows the backend reason when inbound creation is rejected and keeps the form open', async () => {
    vi.mocked(inboundApi.create).mockRejectedValueOnce({
      message: '采购订单剩余可入库数量不足，请按实收数量调整',
    })
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.openCreate()
    })
    act(() => {
      result.current.setForm({
        type: 'direct', materialId: 'mat-1', batchNo: 'B001', quantity: 10, price: 50,
        supplierId: 'sup-1', locationId: 'loc-1', fromLocationId: '', fromLocationName: '',
        productionDate: '2026-06-22', expiryDate: '2027-12-31', remark: '现场收货', purchaseOrderId: '',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(toast.error).toHaveBeenCalledWith('采购订单剩余可入库数量不足，请按实收数量调整')
    expect(result.current.modalType).toBe('create')
    expect(result.current.form).toEqual(expect.objectContaining({
      materialId: 'mat-1',
      batchNo: 'B001',
      quantity: 10,
      locationId: 'loc-1',
      remark: '现场收货',
    }))
  })

  it('preserves the linked purchase order when editing a purchase inbound record', async () => {
    const purchaseInbound = {
      ...mockInboundRecord,
      purchaseOrderId: 'po-1',
      purchaseOrderNo: 'PO-001',
      batchNo: 'B001',
      locationId: 'loc-1',
      expiryDate: '2027-12-31',
    } satisfies InboundRecord
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.openEdit(purchaseInbound)
    })

    expect(result.current.form.purchaseOrderId).toBe('po-1')

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(inboundApi.update).toHaveBeenCalledWith('inb-1', expect.objectContaining({
      batchNo: 'B001',
      quantity: 100,
      locationId: 'loc-1',
      expiryDate: '2027-12-31',
    }))
    expect(inboundApi.create).not.toHaveBeenCalled()
  })

  it('keeps edited inbound facts visible when the follow-up list refresh fails', async () => {
    const existingRecord = {
      ...mockInboundRecord,
      type: 'direct',
      batchNo: 'B-OLD',
      supplierId: 'sup-1',
      supplierName: '供应商A',
      locationId: 'loc-1',
      locationName: 'A1-01',
      productionDate: '2026-01-01',
      expiryDate: '2027-01-01',
      remark: '旧备注',
    } satisfies InboundRecord
    let didUpdate = false
    vi.mocked(inboundApi.getList).mockImplementation(async () => {
      if (didUpdate) throw new Error('refresh failed')
      return {
        list: [existingRecord],
        pagination: { total: 1, page: 1, pageSize: 20 },
      } as any
    })
    vi.mocked(inboundApi.update).mockImplementation(async () => {
      didUpdate = true
      return {
        id: 'inb-1',
        amount: 660,
      } as any
    })

    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.openEdit(result.current.data[0])
      result.current.setForm({
        type: 'direct', materialId: 'mat-1', batchNo: 'B-NEW', quantity: 12, price: 55,
        supplierId: 'sup-1', locationId: 'loc-1', fromLocationId: '', fromLocationName: '',
        productionDate: '2026-06-23', expiryDate: '2028-06-23', remark: '现场复核后修正', purchaseOrderId: '',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    await waitFor(() => expect(inboundApi.update).toHaveBeenCalledWith('inb-1', expect.objectContaining({
      batchNo: 'B-NEW',
      quantity: 12,
      price: 55,
      supplierId: 'sup-1',
      locationId: 'loc-1',
      productionDate: '2026-06-23',
      expiryDate: '2028-06-23',
      remark: '现场复核后修正',
    })))
    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'inb-1',
        inboundNo: 'IN-20240526-001',
        materialName: '耗材A',
        batchNo: 'B-NEW',
        quantity: 12,
        unit: '盒',
        price: 55,
        amount: 660,
        supplierName: '供应商A',
        locationName: 'A1-01',
        productionDate: '2026-06-23',
        expiryDate: '2028-06-23',
        remark: '现场复核后修正',
        status: 'completed',
      }),
    ])
    expect(result.current.total).toBe(1)
  })

  it('focuses the newly created inbound record so users can confirm the saved result', async () => {
    vi.mocked(inboundApi.create).mockResolvedValueOnce({
      id: 'inb-created',
      inboundNo: 'IN-CREATED-001',
      status: 'completed',
    } as any)

    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setSearchKeyword('old-filter')
      result.current.setFilterStatus('cancelled')
      result.current.setFilterType('purchase')
      result.current.setForm({
        type: 'direct', materialId: 'mat-1', batchNo: 'B001', quantity: 10, price: 50,
        supplierId: 'sup-1', locationId: 'loc-1', fromLocationId: '', fromLocationName: '',
        productionDate: '', expiryDate: '2027-12-31', remark: '', purchaseOrderId: '',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    expect(result.current.searchKeyword).toBe('IN-CREATED-001')
    expect(result.current.filterStatus).toBe('')
    expect(result.current.filterType).toBe('')
    expect(result.current.modalType).toBeNull()
    expect(toast.success).toHaveBeenCalledWith('入库成功', {
      description: '已生成 IN-CREATED-001，库存、批次、库位、成本、效期预警和审计链路可按单号回看',
    })
  })

  it('keeps the newly created inbound visible when the follow-up list refresh fails', async () => {
    vi.mocked(inboundApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(inboundApi.create).mockResolvedValueOnce({
      id: 'inb-visible',
      inboundNo: 'IN-VISIBLE-001',
      type: 'direct',
      materialId: 'mat-1',
      batchNo: 'B001',
      quantity: 10,
      price: 50,
      supplierId: 'sup-1',
      locationId: 'loc-1',
      status: 'completed',
    } as any)

    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setForm({
        type: 'direct', materialId: 'mat-1', batchNo: 'B001', quantity: 10, price: 50,
        supplierId: 'sup-1', locationId: 'loc-1', fromLocationId: '', fromLocationName: '',
        productionDate: '2026-06-22', expiryDate: '2027-12-31', remark: '', purchaseOrderId: '',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    await waitFor(() => expect(result.current.searchKeyword).toBe('IN-VISIBLE-001'))
    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'inb-visible',
        inboundNo: 'IN-VISIBLE-001',
        materialName: '耗材A',
        batchNo: 'B001',
        quantity: 10,
        unit: '盒',
        price: 50,
        amount: 500,
        supplierName: '供应商A',
        locationName: 'A1-01',
        status: 'completed',
      }),
    ])
    expect(result.current.total).toBe(1)
  })

  it('clears the created inbound fallback once the focused refresh returns the server row', async () => {
    const createdInbound = {
      id: 'inb-server-created',
      inboundNo: 'IN-SERVER-CREATED-001',
      type: 'direct',
      materialId: 'mat-1',
      materialName: '耗材A',
      batchNo: 'B-SERVER',
      quantity: 10,
      unit: '盒',
      price: 50,
      amount: 500,
      supplierId: 'sup-1',
      supplierName: '供应商A',
      locationId: 'loc-1',
      locationName: 'A1-01',
      status: 'completed',
      createdAt: '2026-06-23T10:00:00.000Z',
    }
    vi.mocked(inboundApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any)
      .mockResolvedValueOnce({
        list: [createdInbound],
        pagination: { total: 1, page: 1, pageSize: 20 },
      } as any)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any)
    vi.mocked(inboundApi.create).mockResolvedValueOnce(createdInbound as any)

    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setForm({
        type: 'direct', materialId: 'mat-1', batchNo: 'B-SERVER', quantity: 10, price: 50,
        supplierId: 'sup-1', locationId: 'loc-1', fromLocationId: '', fromLocationName: '',
        productionDate: '2026-06-22', expiryDate: '2027-12-31', remark: '', purchaseOrderId: '',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    await waitFor(() => expect(result.current.data.filter(item => item.id === 'inb-server-created')).toHaveLength(1))

    await act(async () => {
      result.current.refresh()
    })

    await waitFor(() => expect(inboundApi.getList).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(result.current.data.filter(item => item.id === 'inb-server-created')).toHaveLength(0))
    expect(result.current.total).toBe(0)
  })

  it('marks a cancelled fallback-created inbound as cancelled when both follow-up refreshes fail', async () => {
    vi.mocked(inboundApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('create refresh failed'))
      .mockRejectedValueOnce(new Error('cancel refresh failed'))
    vi.mocked(inboundApi.create).mockResolvedValueOnce({
      id: 'inb-created-then-cancelled',
      inboundNo: 'IN-CREATED-CANCELLED-001',
      type: 'direct',
      materialId: 'mat-1',
      batchNo: 'B001',
      quantity: 10,
      price: 50,
      supplierId: 'sup-1',
      locationId: 'loc-1',
      status: 'completed',
    } as any)
    vi.mocked(inboundApi.cancel).mockResolvedValueOnce({} as any)

    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setForm({
        type: 'direct', materialId: 'mat-1', batchNo: 'B001', quantity: 10, price: 50,
        supplierId: 'sup-1', locationId: 'loc-1', fromLocationId: '', fromLocationName: '',
        productionDate: '2026-06-22', expiryDate: '2027-12-31', remark: '', purchaseOrderId: '',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    await waitFor(() => expect(result.current.data[0]?.inboundNo).toBe('IN-CREATED-CANCELLED-001'))

    await act(async () => {
      result.current.handleDelete(result.current.data[0])
    })
    await act(async () => {
      await result.current.handleCancelInbound()
    })

    await waitFor(() => expect(inboundApi.cancel).toHaveBeenCalledWith('inb-created-then-cancelled', '页面取消入库'))
    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: 'inb-created-then-cancelled',
        inboundNo: 'IN-CREATED-CANCELLED-001',
        status: 'cancelled',
        cancelReason: '页面取消入库',
      }),
    ])
    expect(result.current.total).toBe(1)
    expect(toast.success).toHaveBeenCalledWith('取消成功', {
      description: 'IN-CREATED-CANCELLED-001 已取消，库存、批次、采购收货数量、成本和审计记录已同步回退',
    })
  })

  it('should not call purchase order receive after purchase inbound create', async () => {
    vi.mocked(inboundApi.create).mockResolvedValueOnce({
      id: 'inb-purchase-created',
      inboundNo: 'IN-PURCHASE-001',
      status: 'completed',
    } as any)
    vi.mocked(purchaseOrderApi.getList).mockResolvedValue({
      list: [{ id: 'po-1', orderNo: 'PO-001', materialName: '耗材A', remainingQty: 20 }],
      pagination: { total: 1 },
    } as any)
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setSelectedOrderId('po-1')
      result.current.setForm({
        type: 'purchase', materialId: 'mat-1', batchNo: 'B001', quantity: 10, price: 50,
        supplierId: 'sup-1', locationId: 'loc-1', fromLocationId: '', fromLocationName: '',
        productionDate: '', expiryDate: '2027-12-31', remark: '', purchaseOrderId: 'po-1',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    await waitFor(() => {
      expect(inboundApi.create).toHaveBeenCalled()
    })
    expect(purchaseOrderApi.receive).not.toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('入库成功，已更新采购订单收货数量', {
      description: '已生成 IN-PURCHASE-001，采购订单、库存、批次、库位、成本和审计链路可按单号回看',
    })
  })

  it('should restore cancelled inbound', async () => {
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.openRestore(mockInboundRecord)
    })

    await act(async () => {
      await result.current.handleRestoreInbound()
    })

    expect(inboundApi.update).toHaveBeenCalledWith('inb-1', { status: 'completed' })
  })

  it('should cancel inbound records instead of deleting them', async () => {
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await result.current.handleDelete(mockInboundRecord)
    })

    await act(async () => {
      await result.current.handleCancelInbound()
    })

    expect(inboundApi.cancel).toHaveBeenCalledWith('inb-1', '页面取消入库')
    expect(inboundApi.delete).not.toHaveBeenCalled()
  })

  it('should print selected inbound rows instead of stale single record', async () => {
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.handlePrintRecord(mockInboundRecord)
    })
    expect(result.current.printRecords.map(r => r.id)).toEqual(['inb-1'])

    act(() => {
      result.current.toggleSelectOne('inb-2')
    })
    expect(Array.from(result.current.selectedIds)).toEqual(['inb-2'])

    act(() => {
      result.current.handleBatchPrint()
    })

    expect(result.current.selectedRecord).toBeNull()
    expect(result.current.printRecords.map(r => r.id)).toEqual(['inb-2'])
    expect(result.current.modalType).toBe('print')
  })

  it('should handle reset filters', async () => {
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setSearchKeyword('test')
      result.current.setFilterStatus('completed')
    })

    await waitFor(() => expect(result.current.searchKeyword).toBe('test'))

    act(() => {
      result.current.handleResetFilters()
    })

    expect(result.current.searchKeyword).toBe('')
    expect(result.current.filterStatus).toBe('')
  })

  it('opens a direct inbound form when the dashboard passes action=create&type=direct', async () => {
    window.history.replaceState(null, '', '/inbound?action=create&type=direct')

    const { result } = renderHook(() => useInboundPage())

    await waitFor(() => expect(result.current.modalType).toBe('create'))

    expect(result.current.form.type).toBe('direct')
    expect(result.current.form.purchaseOrderId).toBe('')
    expect(result.current.selectedOrderId).toBe('')
  })

  it('prefills purchase source remark when opened from a purchase order receive link', async () => {
    window.history.replaceState(
      null,
      '',
      '/inbound?action=create&type=purchase&purchaseOrderId=po-1&purchaseOrderNo=PO-001&materialId=mat-1&supplierId=sup-1&quantity=8&price=50'
    )

    const { result } = renderHook(() => useInboundPage())

    await waitFor(() => expect(result.current.modalType).toBe('create'))

    expect(result.current.form.type).toBe('purchase')
    expect(result.current.form.purchaseOrderId).toBe('po-1')
    expect(result.current.form.purchaseOrderNo).toBe('PO-001')
    expect(result.current.selectedOrderId).toBe('po-1')
    expect(result.current.form.materialId).toBe('mat-1')
    expect(result.current.form.supplierId).toBe('sup-1')
    expect(result.current.form.quantity).toBe(8)
    expect(result.current.form.price).toBe(50)
    expect(result.current.form.remark).toBe('来自采购订单 PO-001')
  })

  it('keeps purchase receive facts from URL as a local order candidate when the order list is not loaded', async () => {
    vi.mocked(purchaseOrderApi.getList).mockResolvedValue({
      list: [],
      pagination: { total: 0 },
    } as any)
    window.history.replaceState(
      null,
      '',
      '/inbound?action=create&type=purchase&purchaseOrderId=po-url&purchaseOrderNo=PO-URL-001&materialId=mat-1&materialName=%E8%80%97%E6%9D%90A&supplierId=sup-1&supplierName=%E4%BE%9B%E5%BA%94%E5%95%86A&quantity=8&remainingQty=8&price=50&unit=%E7%9B%92'
    )

    const { result } = renderHook(() => useInboundPage())

    await waitFor(() => expect(result.current.modalType).toBe('create'))

    expect(result.current.selectedOrderId).toBe('po-url')
    expect(result.current.purchaseOrders).toEqual([
      expect.objectContaining({
        id: 'po-url',
        orderNo: 'PO-URL-001',
        materialId: 'mat-1',
        materialName: '耗材A',
        supplierId: 'sup-1',
        supplierName: '供应商A',
        remainingQty: 8,
        unitPrice: 50,
        unit: '盒',
      }),
    ])
  })
})
