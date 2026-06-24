import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inboundApi, purchaseOrderApi, supplierReturnApi } from '@/api/inventory'
import { materialApi, supplierApi } from '@/api/master'
import SupplierReturns, { canAccessPurchaseOrders, validateSupplierReturnForm, type SupplierReturnFormState } from './SupplierReturns'
import type { Batch, Material } from '@/types'

vi.mock('@/api/inventory')
vi.mock('@/api/master')
vi.mock('sonner')

function LocationProbe() {
  const location = useLocation()
  return React.createElement('div', { 'data-testid': 'location-path' }, `${location.pathname}${location.search}`)
}

const baseForm: SupplierReturnFormState = {
  materialId: 'mat-1',
  quantity: 1,
  batchId: 'batch-1',
  supplierId: 'supplier-1',
  purchaseOrderId: '',
  inboundRecordId: '',
  reason: 'quality_issue',
  refundAmount: '',
  trackingNo: '',
  remark: '',
}

const material = {
  id: 'mat-1',
  code: 'MAT-1',
  name: '退货物料',
  spec: '1ml',
  unit: '瓶',
  price: 10,
  stock: 10,
  minStock: 0,
  maxStock: 100,
  safetyStock: 5,
  categoryId: 'cat-1',
  status: 'active',
  createdAt: '2026-06-17',
  updatedAt: '2026-06-17',
} satisfies Material

const batches = [
  {
    id: 'batch-1',
    materialId: 'mat-1',
    batchNo: 'BATCH-1',
    quantity: 10,
    remaining: 3,
    expiryDate: '2027-01-01',
    inboundId: 'inbound-1',
    inboundPrice: 12,
    supplierId: 'supplier-1',
    status: 'normal',
    createdAt: '2026-06-17',
  },
] satisfies Batch[]

describe('validateSupplierReturnForm', () => {
  it('requires a supplier so supplier cost and refund facts are attributable', () => {
    expect(validateSupplierReturnForm({ ...baseForm, supplierId: '' }, material, batches)).toBe('请选择退货供应商')
  })

  it('requires a selected batch when the material has available batches', () => {
    expect(validateSupplierReturnForm({ ...baseForm, batchId: '' }, material, batches)).toBe('请选择退货批次')
  })

  it('blocks quantity greater than selected batch remaining quantity', () => {
    expect(validateSupplierReturnForm({ ...baseForm, quantity: 4 }, material, batches)).toBe('退货数量不能超过所选批次剩余量')
  })

  it('blocks batches that do not belong to the selected supplier', () => {
    expect(validateSupplierReturnForm({ ...baseForm, supplierId: 'supplier-2' }, material, batches)).toBe('退货批次与供应商不一致')
  })

  it('accepts a valid material, batch, quantity and reason combination', () => {
    expect(validateSupplierReturnForm(baseForm, material, batches)).toBeNull()
  })
})

describe('canAccessPurchaseOrders', () => {
  it('allows warehouse managers to load purchase order sources for supplier returns', () => {
    expect(canAccessPurchaseOrders('warehouse_manager')).toBe(true)
  })
})

describe('SupplierReturns page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    window.localStorage.clear()
    window.localStorage.setItem('user', JSON.stringify({
      id: 'USER-WH',
      username: 'warehouse',
      realName: '仓库',
      role: 'warehouse_manager',
      permissions: ['supplier_returns:view', 'supplier_returns:create'],
      status: 'active',
      createdAt: '2026-06-22T00:00:00.000Z',
    }))

    vi.mocked(supplierReturnApi.getList).mockResolvedValue({
      list: [],
      pagination: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
    } as any)
    vi.mocked(supplierReturnApi.create).mockResolvedValue({
      id: 'sr-created',
      returnNo: 'SR-CREATED-001',
    } as any)
    vi.mocked(materialApi.getList).mockResolvedValue({
      list: [material],
      pagination: { total: 1, page: 1, pageSize: 999, totalPages: 1 },
    } as any)
    vi.mocked(materialApi.getDetail).mockResolvedValue({
      ...material,
      batches,
    } as any)
    vi.mocked(supplierApi.getList).mockResolvedValue({
      list: [{ id: 'supplier-1', code: 'SUP-1', name: '退货供应商', status: 'active', createdAt: '', updatedAt: '' }],
      pagination: { total: 1, page: 1, pageSize: 999, totalPages: 1 },
    } as any)
    vi.mocked(purchaseOrderApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(inboundApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
  })

  it('keeps date-scoped supplier cost evidence links scoped to the same refunded return period', async () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns?supplierId=supplier-1&status=refunded&startDate=2033-01-01&endDate=2033-01-31'] },
        React.createElement(SupplierReturns)
      )
    )

    await waitFor(() => {
      expect(supplierReturnApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        supplierId: 'supplier-1',
        status: 'refunded',
        startDate: '2033-01-01',
        endDate: '2033-01-31',
      }))
    })
  })

  it('shows the downstream supplier return facts before users confirm the inventory and refund impact', async () => {
    vi.mocked(purchaseOrderApi.getList).mockResolvedValue({
      list: [{
        id: 'po-1',
        orderNo: 'PO-001',
        materialId: 'mat-1',
        materialName: '退货物料',
        supplierId: 'supplier-1',
        supplierName: '退货供应商',
        orderedQty: 10,
        receivedQty: 10,
        remainingQty: 0,
        unit: '瓶',
        unitPrice: 12,
        totalAmount: 120,
        status: 'completed',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      }],
      pagination: { total: 1 },
    } as any)
    vi.mocked(inboundApi.getList).mockResolvedValue({
      list: [{
        id: 'inbound-1',
        inboundNo: 'IB-001',
        type: 'purchase',
        materialId: 'mat-1',
        materialName: '退货物料',
        batchNo: 'BATCH-1',
        quantity: 10,
        unit: '瓶',
        price: 12,
        amount: 120,
        supplierId: 'supplier-1',
        supplierName: '退货供应商',
        locationId: 'loc-1',
        operator: 'warehouse',
        status: 'completed',
        purchaseOrderId: 'po-1',
        purchaseOrderNo: 'PO-001',
        createdAt: '2026-06-20T01:00:00.000Z',
      }],
      pagination: { total: 1 },
    } as any)

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns'] },
        React.createElement(SupplierReturns)
      )
    )

    fireEvent.click(await screen.findByRole('button', { name: '新建退货' }))

    fireEvent.click((await screen.findByTestId('supplier-return-material-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-1'))
    await screen.findAllByText(/BATCH-1/)
    fireEvent.click((await screen.findByTestId('supplier-return-reason-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-quality_issue'))

    await waitFor(() => expect(screen.getByText('退货结果确认')).toBeInTheDocument())
    expect(screen.getAllByText('退货物料').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('BATCH-1').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('退货供应商').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('批次扣减 1 瓶')).toBeInTheDocument()
    expect(screen.getByText('批次余量 2 瓶')).toBeInTheDocument()
    expect(screen.getByText('预计退款 ¥12.00')).toBeInTheDocument()
    expect(screen.getByText('PO-001')).toBeInTheDocument()
    expect(screen.getByText('IB-001')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('库存、批次、采购退货、供应商成本净额、退款状态、审计记录'))).toBeInTheDocument()
  })

  it('focuses the newly created supplier return so users can confirm the inventory-affecting result', async () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns?status=cancelled&supplierId=supplier-old&keyword=old-return'] },
        React.createElement(SupplierReturns)
      )
    )

    fireEvent.click(await screen.findByRole('button', { name: '新建退货' }))

    fireEvent.click((await screen.findByTestId('supplier-return-supplier-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-supplier-1'))
    fireEvent.click((await screen.findByTestId('supplier-return-material-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-1'))
    await screen.findAllByText(/BATCH-1/)
    fireEvent.click((await screen.findByTestId('supplier-return-reason-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-quality_issue'))

    await waitFor(() => {
      expect(screen.getByTestId('supplier-return-refund-amount-input')).toHaveValue(12)
    })

    fireEvent.click(screen.getByTestId('supplier-return-confirm-btn'))

    await waitFor(() => {
      expect(supplierReturnApi.create).toHaveBeenCalledWith(expect.objectContaining({
        refundAmount: 12,
      }))
    })
    await waitFor(() => expect(screen.getByPlaceholderText('搜索退货单号/物料/原因...')).toHaveValue('SR-CREATED-001'))
    await waitFor(() => {
      expect(supplierReturnApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'SR-CREATED-001',
        status: undefined,
        supplierId: undefined,
      }))
    })
  })

  it('fills supplier and refund amount from the selected batch so users do not re-enter source facts', async () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns'] },
        React.createElement(SupplierReturns)
      )
    )

    fireEvent.click(await screen.findByRole('button', { name: '新建退货' }))

    fireEvent.click((await screen.findByTestId('supplier-return-material-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-1'))
    await screen.findAllByText(/BATCH-1/)

    fireEvent.click((await screen.findByTestId('supplier-return-reason-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-quality_issue'))

    await waitFor(() => {
      expect(screen.getByTestId('supplier-return-refund-amount-input')).toHaveValue(12)
    })

    fireEvent.click(screen.getByTestId('supplier-return-confirm-btn'))

    await waitFor(() => {
      expect(supplierReturnApi.create).toHaveBeenCalledWith(expect.objectContaining({
        batchId: 'batch-1',
        supplierId: 'supplier-1',
        refundAmount: 12,
      }))
    })
  })

  it('opens a prefilled supplier return draft from an inventory batch URL', async () => {
    vi.mocked(purchaseOrderApi.getList).mockResolvedValue({
      list: [{
        id: 'po-1',
        orderNo: 'PO-001',
        materialId: 'mat-1',
        materialName: '退货物料',
        supplierId: 'supplier-1',
        supplierName: '退货供应商',
        orderedQty: 10,
        receivedQty: 10,
        remainingQty: 0,
        unit: '瓶',
        unitPrice: 12,
        totalAmount: 120,
        status: 'completed',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      }],
      pagination: { total: 1 },
    } as any)
    vi.mocked(inboundApi.getList).mockResolvedValue({
      list: [{
        id: 'inbound-1',
        inboundNo: 'IB-001',
        type: 'purchase',
        materialId: 'mat-1',
        materialName: '退货物料',
        batchNo: 'BATCH-1',
        quantity: 10,
        unit: '瓶',
        price: 12,
        amount: 120,
        supplierId: 'supplier-1',
        supplierName: '退货供应商',
        locationId: 'loc-1',
        operator: 'warehouse',
        status: 'completed',
        purchaseOrderId: 'po-1',
        purchaseOrderNo: 'PO-001',
        createdAt: '2026-06-20T01:00:00.000Z',
      }],
      pagination: { total: 1 },
    } as any)

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns?action=create&materialId=mat-1&batchId=batch-1&quantity=2&reason=quality_issue&remark=%E6%9D%A5%E8%87%AA%E5%BA%93%E5%AD%98%E5%88%97%E8%A1%A8%E9%80%80%E4%BE%9B'] },
        React.createElement(SupplierReturns)
      )
    )

    expect(await screen.findByText('新建退货给供应商')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('supplier-return-quantity-input')).toHaveValue(2))
    await waitFor(() => expect(screen.getByTestId('supplier-return-refund-amount-input')).toHaveValue(24))
    expect(screen.getAllByText('退货物料').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/BATCH-1/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('退货供应商').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('批次扣减 2 瓶')).toBeInTheDocument()
    expect(screen.getByText('批次余量 1 瓶')).toBeInTheDocument()
    expect(screen.getAllByText('质量问题').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('PO-001')).toBeInTheDocument()
    expect(screen.getByText('IB-001')).toBeInTheDocument()
    expect(screen.getByDisplayValue('来自库存列表退供')).toBeInTheDocument()
  })

  it('uses the inbound source to preselect the matching batch in a supplier return draft', async () => {
    vi.mocked(materialApi.getDetail).mockResolvedValue({
      ...material,
      batches: [
        {
          ...batches[0],
          id: 'batch-other',
          batchNo: 'BATCH-OTHER',
          inboundId: 'inbound-other',
          remaining: 5,
        },
        batches[0],
      ],
    } as any)
    vi.mocked(purchaseOrderApi.getList).mockResolvedValue({
      list: [{
        id: 'po-1',
        orderNo: 'PO-001',
        materialId: 'mat-1',
        supplierId: 'supplier-1',
        supplierName: '退货供应商',
        orderedQty: 10,
        receivedQty: 10,
        remainingQty: 0,
        unit: '瓶',
        unitPrice: 12,
        totalAmount: 120,
        status: 'completed',
        createdAt: '2026-06-20T00:00:00.000Z',
        updatedAt: '2026-06-20T00:00:00.000Z',
      }],
      pagination: { total: 1 },
    } as any)
    vi.mocked(inboundApi.getList).mockResolvedValue({
      list: [{
        id: 'inbound-1',
        inboundNo: 'IB-001',
        type: 'purchase',
        materialId: 'mat-1',
        materialName: '退货物料',
        batchNo: 'BATCH-1',
        quantity: 10,
        unit: '瓶',
        price: 12,
        amount: 120,
        supplierId: 'supplier-1',
        supplierName: '退货供应商',
        locationId: 'loc-1',
        operator: 'warehouse',
        status: 'completed',
        purchaseOrderId: 'po-1',
        purchaseOrderNo: 'PO-001',
        createdAt: '2026-06-20T01:00:00.000Z',
      }],
      pagination: { total: 1 },
    } as any)

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns?action=create&materialId=mat-1&inboundRecordId=inbound-1&quantity=2&reason=quality_issue&remark=%E6%9D%A5%E8%87%AA%E5%85%A5%E5%BA%93%E8%AF%A6%E6%83%85%E9%80%80%E4%BE%9B'] },
        React.createElement(SupplierReturns)
      )
    )

    expect(await screen.findByText('新建退货给供应商')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('supplier-return-quantity-input')).toHaveValue(2))
    await waitFor(() => expect(screen.getByTestId('supplier-return-refund-amount-input')).toHaveValue(24))
    expect(screen.getAllByText(/BATCH-1/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('批次扣减 2 瓶')).toBeInTheDocument()
    expect(screen.getByText('批次余量 1 瓶')).toBeInTheDocument()
    expect(screen.getByText('IB-001')).toBeInTheDocument()
    expect(screen.getByText('PO-001')).toBeInTheDocument()
    expect(screen.getByDisplayValue('来自入库详情退供')).toBeInTheDocument()
  })

  it('blocks supplier return confirmation when quantity exceeds the selected batch remaining quantity', async () => {
    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns'] },
        React.createElement(SupplierReturns)
      )
    )

    fireEvent.click(await screen.findByRole('button', { name: '新建退货' }))

    fireEvent.click((await screen.findByTestId('supplier-return-material-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-1'))
    await screen.findAllByText(/BATCH-1/)
    fireEvent.click((await screen.findByTestId('supplier-return-batch-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-batch-1'))
    fireEvent.click((await screen.findByTestId('supplier-return-reason-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-quality_issue'))
    fireEvent.change(screen.getByTestId('supplier-return-quantity-input'), { target: { value: '4' } })

    expect(screen.getByText('退货数量不能超过所选批次剩余量 3 瓶，请按实际退回数量修改。')).toBeInTheDocument()
    expect(screen.getByTestId('supplier-return-confirm-btn')).toBeDisabled()

    fireEvent.click(screen.getByTestId('supplier-return-confirm-btn'))

    expect(supplierReturnApi.create).not.toHaveBeenCalled()
  })

  it('keeps the newly created supplier return visible when the follow-up list refresh fails', async () => {
    vi.mocked(supplierReturnApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(supplierReturnApi.create).mockResolvedValueOnce({
      id: 'sr-visible',
      returnNo: 'SR-VISIBLE-001',
      materialId: 'mat-1',
      batchId: 'batch-1',
      quantity: 1,
      supplierId: 'supplier-1',
      reason: 'quality_issue',
      refundAmount: 12,
    } as any)

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns'] },
        React.createElement(SupplierReturns)
      )
    )

    fireEvent.click(await screen.findByRole('button', { name: '新建退货' }))

    fireEvent.click((await screen.findByTestId('supplier-return-supplier-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-supplier-1'))
    fireEvent.click((await screen.findByTestId('supplier-return-material-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-1'))
    await screen.findAllByText(/BATCH-1/)
    fireEvent.click((await screen.findByTestId('supplier-return-reason-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-quality_issue'))
    fireEvent.click(screen.getByTestId('supplier-return-confirm-btn'))

    expect(await screen.findByText('SR-VISIBLE-001')).toBeInTheDocument()
    expect(screen.getByText('退货物料')).toBeInTheDocument()
    expect(screen.getByText('BATCH-1')).toBeInTheDocument()
    expect(screen.getByText('退货供应商')).toBeInTheDocument()
    expect(screen.getByText('质量问题')).toBeInTheDocument()
    expect(screen.getByText('¥12.00')).toBeInTheDocument()
  })

  it('removes a deleted fallback-created supplier return when both follow-up refreshes fail', async () => {
    vi.mocked(supplierReturnApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
      } as any)
      .mockRejectedValueOnce(new Error('create refresh failed'))
      .mockRejectedValueOnce(new Error('delete refresh failed'))
    vi.mocked(supplierReturnApi.create).mockResolvedValueOnce({
      id: 'sr-created-then-deleted',
      returnNo: 'SR-CREATED-DELETED-001',
      materialId: 'mat-1',
      batchId: 'batch-1',
      quantity: 1,
      supplierId: 'supplier-1',
      reason: 'quality_issue',
      refundAmount: 12,
    } as any)
    vi.mocked(supplierReturnApi.delete).mockResolvedValueOnce({} as any)

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns'] },
        React.createElement(SupplierReturns)
      )
    )

    fireEvent.click(await screen.findByRole('button', { name: '新建退货' }))

    fireEvent.click((await screen.findByTestId('supplier-return-supplier-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-supplier-1'))
    fireEvent.click((await screen.findByTestId('supplier-return-material-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-1'))
    await screen.findAllByText(/BATCH-1/)
    fireEvent.click((await screen.findByTestId('supplier-return-reason-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-quality_issue'))
    fireEvent.click(screen.getByTestId('supplier-return-confirm-btn'))

    expect(await screen.findByText('SR-CREATED-DELETED-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /删除/ }))
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(supplierReturnApi.delete).toHaveBeenCalledWith('sr-created-then-deleted'))
    expect(screen.queryByText('SR-CREATED-DELETED-001')).not.toBeInTheDocument()
    expect(screen.getByText('暂无退货记录')).toBeInTheDocument()
    expect(screen.getByText('共 0 条记录')).toBeInTheDocument()
  })

  it('explains the real inventory and supplier cost effects before deleting a pending supplier return', async () => {
    vi.mocked(supplierReturnApi.getList).mockResolvedValueOnce({
      list: [{
        id: 'sr-delete',
        returnNo: 'SR-DELETE-001',
        materialId: 'mat-1',
        materialName: '退货物料',
        batchId: 'batch-1',
        batchNo: 'BATCH-1',
        quantity: 1,
        supplierId: 'supplier-1',
        supplierName: '退货供应商',
        reason: 'quality_issue',
        refundAmount: 12,
        status: 'pending',
        operator: 'warehouse',
        createdAt: '2026-06-22T10:00:00.000Z',
        updatedAt: '2026-06-22T10:00:00.000Z',
      }],
      pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    } as any)

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns'] },
        React.createElement(SupplierReturns)
      )
    )

    expect(await screen.findByText('SR-DELETE-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /删除/ }))

    expect(await screen.findByRole('heading', { name: '确认删除' })).toBeInTheDocument()
    expect(screen.getByText((content) => (
      content.includes('删除后将恢复本次退货扣减的库存和批次余量')
      && content.includes('同步更新供应商成本净额和库存流水')
      && content.includes('重新触发库存预警检查')
      && content.includes('审计记录将保留删除动作')
    ))).toBeInTheDocument()
  })

  it('keeps an updated supplier return status visible when the follow-up list refresh fails', async () => {
    vi.mocked(supplierReturnApi.getList)
      .mockResolvedValueOnce({
        list: [{
          id: 'sr-status',
          returnNo: 'SR-STATUS-001',
          materialId: 'mat-1',
          materialName: '退货物料',
          batchId: 'batch-1',
          batchNo: 'BATCH-1',
          quantity: 1,
          supplierId: 'supplier-1',
          supplierName: '退货供应商',
          reason: 'quality_issue',
          refundAmount: 12,
          status: 'pending',
          operator: 'warehouse',
          createdAt: '2026-06-22T10:00:00.000Z',
          updatedAt: '2026-06-22T10:00:00.000Z',
        }],
        pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(supplierReturnApi.updateStatus).mockResolvedValueOnce({
      id: 'sr-status',
      status: 'shipped',
    } as any)

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns'] },
        React.createElement(SupplierReturns)
      )
    )

    expect(await screen.findByText('SR-STATUS-001')).toBeInTheDocument()
    expect(screen.getByText('待发货')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /详情/ }))
    fireEvent.click(await screen.findByRole('button', { name: '标记为已发货' }))

    expect(supplierReturnApi.updateStatus).not.toHaveBeenCalled()
    expect(await screen.findByText('确认状态流转')).toBeInTheDocument()
    expect(screen.getAllByText((content) => content.includes('SR-STATUS-001')).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText((content) => content.includes('待发货 -> 已发货'))).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('库存、批次、供应商成本净额、退款状态、审计记录'))).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '确认流转' }))

    await waitFor(() => expect(supplierReturnApi.updateStatus).toHaveBeenCalledWith('sr-status', 'shipped'))
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    expect(await screen.findByText('已发货')).toBeInTheDocument()
    expect(screen.queryByText('待发货')).not.toBeInTheDocument()
    expect(screen.getByPlaceholderText('搜索退货单号/物料/原因...')).toHaveValue('SR-STATUS-001')
  })

  it('explains the real inventory and supplier cost effects before cancelling a supplier return status', async () => {
    vi.mocked(supplierReturnApi.getList).mockResolvedValueOnce({
      list: [{
        id: 'sr-cancel',
        returnNo: 'SR-CANCEL-001',
        materialId: 'mat-1',
        materialName: '退货物料',
        batchId: 'batch-1',
        batchNo: 'BATCH-1',
        quantity: 1,
        supplierId: 'supplier-1',
        supplierName: '退货供应商',
        reason: 'quality_issue',
        refundAmount: 12,
        status: 'shipped',
        operator: 'warehouse',
        createdAt: '2026-06-22T10:00:00.000Z',
        updatedAt: '2026-06-22T10:00:00.000Z',
      }],
      pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    } as any)

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns'] },
        React.createElement(SupplierReturns)
      )
    )

    expect(await screen.findByText('SR-CANCEL-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /详情/ }))
    fireEvent.click(await screen.findByRole('button', { name: '取消退货' }))

    expect(await screen.findByRole('heading', { name: '确认取消退货' })).toBeInTheDocument()
    expect(screen.getByText((content) => (
      content.includes('取消后将恢复本次退货扣减的库存和批次余量')
      && content.includes('同步更新供应商成本净额和库存流水')
      && content.includes('重新触发库存预警检查')
      && content.includes('审计记录将保留取消动作')
    ))).toBeInTheDocument()
  })

  it('opens audit evidence from a supplier return row so users do not search logs manually', async () => {
    vi.mocked(supplierReturnApi.getList).mockResolvedValueOnce({
      list: [{
        id: 'sr-audit',
        returnNo: 'SR-AUDIT-001',
        materialId: 'mat-1',
        materialName: '退货物料',
        batchId: 'batch-1',
        batchNo: 'BATCH-1',
        quantity: 1,
        supplierId: 'supplier-1',
        supplierName: '退货供应商',
        reason: 'quality_issue',
        refundAmount: 12,
        status: 'pending',
        operator: 'warehouse',
        createdAt: '2026-06-22T10:00:00.000Z',
        updatedAt: '2026-06-22T10:00:00.000Z',
      }],
      pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    } as any)

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns'] },
        React.createElement(SupplierReturns),
        React.createElement(LocationProbe),
      )
    )

    expect(await screen.findByText('SR-AUDIT-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /审计证据 SR-AUDIT-001/ }))

    expect(screen.getByTestId('location-path')).toHaveTextContent('/logs?keyword=SR-AUDIT-001')
  })

  it('keeps deleted supplier returns reviewable from audit links without exposing repeat delete actions', async () => {
    vi.mocked(supplierReturnApi.getList).mockResolvedValue({
      list: [{
        id: 'sr-deleted-review',
        returnNo: 'SR-DELETED-REVIEW-001',
        materialId: 'mat-1',
        materialName: '退货物料',
        batchId: 'batch-1',
        batchNo: 'BATCH-1',
        quantity: 1,
        supplierId: 'supplier-1',
        supplierName: '退货供应商',
        reason: 'quality_issue',
        refundAmount: 12,
        status: 'pending',
        isDeleted: true,
        operator: 'warehouse',
        createdAt: '2026-06-22T10:00:00.000Z',
        updatedAt: '2026-06-22T10:00:00.000Z',
      }],
      pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    } as any)

    render(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/supplier-returns?keyword=SR-DELETED-REVIEW-001&includeDeleted=true'] },
        React.createElement(SupplierReturns),
        React.createElement(LocationProbe),
      )
    )

    expect(await screen.findByText('SR-DELETED-REVIEW-001')).toBeInTheDocument()
    await waitFor(() => expect(supplierReturnApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'SR-DELETED-REVIEW-001',
      includeDeleted: true,
    })))
    expect(screen.getByText('已删除')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /删除/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /审计证据 SR-DELETED-REVIEW-001/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查询' }))

    expect(screen.getByTestId('location-path')).toHaveTextContent('/supplier-returns?keyword=SR-DELETED-REVIEW-001&includeDeleted=true')
  })
})
