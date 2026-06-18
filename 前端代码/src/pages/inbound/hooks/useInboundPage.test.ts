import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { useInboundPage } from './useInboundPage'
import { inboundApi, purchaseOrderApi } from '@/api/inventory'
import { materialApi, supplierApi, locationApi } from '@/api/master'
import type { InboundRecord, Material, Supplier, Location } from '@/types'

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

  it('should not fetch purchase orders or locations for warehouse inbound users', async () => {
    localStorage.setItem('user', JSON.stringify({
      id: 'USER-WHM',
      username: 'wangkq',
      realName: '王坤强',
      role: 'warehouse_manager',
    }))

    renderHook(() => useInboundPage())

    await waitFor(() => expect(inboundApi.getStats).toHaveBeenCalled())

    expect(purchaseOrderApi.getList).not.toHaveBeenCalled()
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

  it('should create inbound on valid submit', async () => {
    const { result } = renderHook(() => useInboundPage())
    await waitFor(() => expect(result.current.loading).toBe(false))

    act(() => {
      result.current.setForm({
        type: 'purchase', materialId: 'mat-1', batchNo: 'B001', quantity: 10, price: 50,
        supplierId: 'sup-1', locationId: 'loc-1', fromLocationId: '', fromLocationName: '',
        productionDate: '', expiryDate: '', remark: '', purchaseOrderId: '',
      })
    })

    await act(async () => {
      await result.current.handleSubmit()
    })

    await waitFor(() => {
      expect(inboundApi.create).toHaveBeenCalled()
    })
  })

  it('should not call purchase order receive after purchase inbound create', async () => {
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
})
