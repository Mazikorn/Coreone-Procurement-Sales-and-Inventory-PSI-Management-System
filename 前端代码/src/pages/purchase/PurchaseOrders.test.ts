import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { purchaseOrderApi } from '@/api/inventory'
import { materialApi, supplierApi } from '@/api/master'
import {
  applySelectedMaterialToPurchaseForm,
  canEditPurchaseOrder,
  canReceivePurchaseOrders,
  canWritePurchaseOrders,
  purchaseOrderToForm,
  type PurchaseOrderForm,
} from './PurchaseOrders'
import PurchaseOrders from './PurchaseOrders'
import type { Material, PurchaseOrder } from '@/types'
import { toast } from 'sonner'

vi.mock('@/api/inventory')
vi.mock('@/api/master')
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function LocationProbe() {
  const location = useLocation()
  return React.createElement('div', { 'data-testid': 'location' }, `${location.pathname}${location.search}`)
}

function renderPurchaseOrders(initialEntry = '/purchase-orders') {
  return render(
    React.createElement(
      MemoryRouter,
      { initialEntries: [initialEntry] },
      React.createElement(LocationProbe),
      React.createElement(PurchaseOrders)
    )
  )
}

const baseForm: PurchaseOrderForm = {
  materialId: '',
  supplierId: '',
  orderedQty: 1,
  unitPrice: 0,
  unit: '个',
  expectedDate: '',
  remark: '',
}

describe('applySelectedMaterialToPurchaseForm', () => {
  it('copies selected material unit and reference price into the purchase form', () => {
    const material = {
      id: 'mat-ml',
      code: 'MAT-ML',
      name: '显色液',
      spec: '10ml',
      unit: 'ml',
      price: 12.5,
      supplierId: 'sup-default',
      stock: 10,
      minStock: 0,
      maxStock: 100,
      safetyStock: 5,
      categoryId: 'cat-1',
      status: 'active',
      createdAt: '2026-06-16',
      updatedAt: '2026-06-16',
    } satisfies Material

    expect(applySelectedMaterialToPurchaseForm(baseForm, material)).toEqual({
      ...baseForm,
      materialId: 'mat-ml',
      supplierId: 'sup-default',
      unit: 'ml',
      unitPrice: 12.5,
    })
  })

  it('keeps the existing form when no material is found', () => {
    expect(applySelectedMaterialToPurchaseForm(baseForm, undefined)).toBe(baseForm)
  })
})

describe('purchase order role capabilities', () => {
  it('allows warehouse managers to receive but not create or cancel purchase orders', () => {
    expect(canReceivePurchaseOrders('warehouse_manager')).toBe(true)
    expect(canWritePurchaseOrders('warehouse_manager')).toBe(false)
  })

  it('allows procurement users to create and cancel purchase orders, but leaves receiving to warehouse users', () => {
    expect(canReceivePurchaseOrders('procurement')).toBe(false)
    expect(canWritePurchaseOrders('procurement')).toBe(true)
  })

  it('allows procurement to edit only orders that have not been received', () => {
    expect(canEditPurchaseOrder('procurement', { status: 'pending', receivedQty: 0 })).toBe(true)
    expect(canEditPurchaseOrder('admin', { status: 'pending', receivedQty: 0 })).toBe(true)
    expect(canEditPurchaseOrder('warehouse_manager', { status: 'pending', receivedQty: 0 })).toBe(false)
    expect(canEditPurchaseOrder('procurement', { status: 'partial', receivedQty: 2 })).toBe(false)
    expect(canEditPurchaseOrder('procurement', { status: 'cancelled', receivedQty: 0 })).toBe(false)
  })
})

describe('purchaseOrderToForm', () => {
  it('prefills editable purchase order fields from the selected pending order', () => {
    const order: PurchaseOrder = {
      id: 'po-1',
      orderNo: 'PO-001',
      materialId: 'mat-1',
      materialName: '显色液',
      supplierId: 'sup-1',
      supplierName: '供应商A',
      orderedQty: 5,
      receivedQty: 0,
      remainingQty: 5,
      unit: 'ml',
      unitPrice: 9,
      totalAmount: 45,
      expectedDate: '2026-07-03',
      status: 'pending',
      remark: '更正采购数量和单价',
      createdAt: '2026-06-20',
      updatedAt: '2026-06-20',
    }

    expect(purchaseOrderToForm(order)).toEqual({
      materialId: 'mat-1',
      supplierId: 'sup-1',
      orderedQty: 5,
      unitPrice: 9,
      unit: 'ml',
      expectedDate: '2026-07-03',
      remark: '更正采购数量和单价',
    })
  })
})

describe('PurchaseOrders page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    window.history.replaceState(null, '', '/purchase-orders')
    window.localStorage.clear()
    window.localStorage.setItem('user', JSON.stringify({
      id: 'USER-PROC',
      username: 'caigou',
      realName: '采购员',
      role: 'procurement',
      permissions: ['purchase_orders:view', 'purchase_orders:create'],
      status: 'active',
      createdAt: '2026-06-20T00:00:00.000Z',
    }))
    vi.mocked(materialApi.getList).mockResolvedValue({
      list: [
        {
          id: 'mat-po-1',
          code: 'MAT-PO-001',
          name: '采购深链物料',
          spec: '1ml',
          unit: '瓶',
          price: 12,
          stock: 10,
          minStock: 0,
          maxStock: 100,
          safetyStock: 5,
          categoryId: 'cat-1',
          status: 'active',
          createdAt: '2026-06-20',
          updatedAt: '2026-06-20',
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 999 },
    } as any)
    vi.mocked(supplierApi.getList).mockResolvedValue({
      list: [
        {
          id: 'sup-1',
          code: 'SUP-001',
          name: '采购深链供应商',
          contact: '张三',
          phone: '13800000000',
          status: 'active',
          createdAt: '2026-06-20',
          updatedAt: '2026-06-20',
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 999 },
    } as any)
    vi.mocked(purchaseOrderApi.getList).mockResolvedValue({
      list: [
        {
          id: 'po-1',
          orderNo: 'PO-DEEP-001',
          materialId: 'mat-po-1',
          materialName: '采购深链物料',
          supplierId: 'sup-1',
          supplierName: '采购深链供应商',
          orderedQty: 5,
          receivedQty: 0,
          remainingQty: 5,
          unit: '瓶',
          unitPrice: 12,
          totalAmount: 60,
          status: 'pending',
          createdAt: '2026-06-20T01:00:00.000Z',
          updatedAt: '2026-06-20T01:00:00.000Z',
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 20 },
    } as any)
  })

  it('uses keyword and status from URL so work links open a filtered purchase order list', async () => {
    window.history.replaceState(null, '', '/purchase-orders?keyword=PO-DEEP-001&status=pending,partial')

    renderPurchaseOrders('/purchase-orders?keyword=PO-DEEP-001&status=pending,partial')

    await waitFor(() => {
      expect(purchaseOrderApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'PO-DEEP-001',
        status: 'pending,partial',
      }))
    })
    expect(screen.getByPlaceholderText('搜索订单号/物料名称...')).toHaveValue('PO-DEEP-001')
  })

  it('opens the create modal directly when the dashboard passes action=create', async () => {
    window.history.replaceState(null, '', '/purchase-orders?action=create')

    renderPurchaseOrders('/purchase-orders?action=create')

    expect(await screen.findByText('确认创建')).toBeInTheDocument()
  })

  it('prefills a new purchase order from low-stock work links', async () => {
    window.history.replaceState(
      null,
      '',
      '/purchase-orders?action=create&materialId=mat-po-1&orderedQty=4&remark=%E6%9D%A5%E8%87%AA%E5%BA%93%E5%AD%98%E9%A2%84%E8%AD%A6'
    )

    renderPurchaseOrders('/purchase-orders?action=create&materialId=mat-po-1&orderedQty=4&remark=%E6%9D%A5%E8%87%AA%E5%BA%93%E5%AD%98%E9%A2%84%E8%AD%A6')

    expect(await screen.findByText('确认创建')).toBeInTheDocument()
    expect(screen.getByText('采购深链物料 (MAT-PO-001)')).toBeInTheDocument()
    expect(screen.getByDisplayValue('4')).toBeInTheDocument()
    expect(screen.getByDisplayValue('12')).toBeInTheDocument()
    expect(screen.getByDisplayValue('瓶')).toBeInTheDocument()
    expect(screen.getByDisplayValue('来自库存预警')).toBeInTheDocument()
    expect(screen.getByText('采购创建确认')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('采购订单、入库、库存、预警记录、审计记录'))).toBeInTheDocument()
    expect(screen.getAllByText('采购深链供应商').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('采购数量 4 瓶')).toBeInTheDocument()
    expect(screen.getByText('预计金额 ¥48.00')).toBeInTheDocument()
  })

  it('shows expected arrival date in the purchase creation confirmation before saving', async () => {
    window.history.replaceState(null, '', '/purchase-orders?action=create')
    const { container } = renderPurchaseOrders('/purchase-orders?action=create')

    expect(await screen.findByText('确认创建')).toBeInTheDocument()
    fireEvent.click(screen.getAllByText('请选择')[0])
    fireEvent.click(await screen.findByTestId('option-mat-po-1'))
    fireEvent.click(screen.getAllByText('请选择')[0])
    fireEvent.click(await screen.findByTestId('option-sup-1'))

    const expectedDateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(expectedDateInput, { target: { value: '2026-07-05' } })

    expect(screen.getByText('预计到货 2026-07-05')).toBeInTheDocument()
    expect(screen.getByText('到货后进入入库收货队列')).toBeInTheDocument()
  })

  it('focuses the newly created purchase order so procurement users can confirm the saved result', async () => {
    window.history.replaceState(null, '', '/purchase-orders?status=cancelled&keyword=old-order')
    vi.mocked(purchaseOrderApi.create).mockResolvedValueOnce({
      id: 'po-created',
      orderNo: 'PO-CREATED-001',
    } as any)

    renderPurchaseOrders('/purchase-orders?status=cancelled&keyword=old-order')

    fireEvent.click(await screen.findByRole('button', { name: '新建采购订单' }))
    await screen.findByRole('button', { name: '确认创建' })
    fireEvent.click(screen.getAllByText('请选择')[0])
    fireEvent.click(await screen.findByTestId('option-mat-po-1'))
    fireEvent.click(screen.getAllByText('请选择')[0])
    fireEvent.click(await screen.findByTestId('option-sup-1'))
    fireEvent.click(screen.getByRole('button', { name: '确认创建' }))

    await waitFor(() => expect(screen.getByPlaceholderText('搜索订单号/物料名称...')).toHaveValue('PO-CREATED-001'))
    await waitFor(() => {
      expect(purchaseOrderApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'PO-CREATED-001',
        status: undefined,
      }))
    })
    expect(toast.success).toHaveBeenCalledWith('采购订单创建成功', {
      description: '已生成 PO-CREATED-001，后续收货会进入入库、库存、预警记录和审计链路',
    })
  })

  it('shows the backend reason when purchase order creation is rejected and keeps the form open', async () => {
    vi.mocked(purchaseOrderApi.create).mockRejectedValueOnce({
      message: '供应商已停用，不能创建采购订单，请先更换供应商或恢复供应商状态',
    })

    renderPurchaseOrders()

    fireEvent.click(await screen.findByRole('button', { name: '新建采购订单' }))
    await screen.findByRole('button', { name: '确认创建' })
    fireEvent.click(screen.getAllByText('请选择')[0])
    fireEvent.click(await screen.findByTestId('option-mat-po-1'))
    fireEvent.click(screen.getAllByText('请选择')[0])
    fireEvent.click(await screen.findByTestId('option-sup-1'))
    fireEvent.click(screen.getByRole('button', { name: '确认创建' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('供应商已停用，不能创建采购订单，请先更换供应商或恢复供应商状态')
    })
    expect(screen.getByRole('button', { name: '确认创建' })).toBeInTheDocument()
    expect(screen.getByText('采购深链物料 (MAT-PO-001)')).toBeInTheDocument()
    expect(screen.getAllByText('采购深链供应商').length).toBeGreaterThanOrEqual(1)
  })

  it('keeps the newly created purchase order visible when the follow-up list refresh fails', async () => {
    vi.mocked(purchaseOrderApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(purchaseOrderApi.create).mockResolvedValueOnce({
      id: 'po-visible',
      orderNo: 'PO-VISIBLE-001',
      materialId: 'mat-po-1',
      supplierId: 'sup-1',
      orderedQty: 4,
      unitPrice: 12,
    } as any)

    renderPurchaseOrders()

    fireEvent.click(await screen.findByRole('button', { name: '新建采购订单' }))
    await screen.findByRole('button', { name: '确认创建' })
    fireEvent.click(screen.getAllByText('请选择')[0])
    fireEvent.click(await screen.findByTestId('option-mat-po-1'))
    fireEvent.click(screen.getAllByText('请选择')[0])
    fireEvent.click(await screen.findByTestId('option-sup-1'))
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: '确认创建' }))

    expect(await screen.findByText('PO-VISIBLE-001')).toBeInTheDocument()
    expect(screen.getByText('采购深链物料')).toBeInTheDocument()
    expect(screen.getByText('采购深链供应商')).toBeInTheDocument()
    expect(screen.getByText('4 瓶')).toBeInTheDocument()
    expect(screen.getByText('0 瓶')).toBeInTheDocument()
    expect(screen.getByText('¥48.00')).toBeInTheDocument()
    expect(screen.getByText('待收货')).toBeInTheDocument()
    expect(screen.getByText('共 1 条记录')).toBeInTheDocument()
  })

  it('clears the created purchase order fallback once the focused refresh returns the server row', async () => {
    const createdOrder = {
      id: 'po-server-created',
      orderNo: 'PO-SERVER-CREATED-001',
      materialId: 'mat-po-1',
      materialName: '采购深链物料',
      supplierId: 'sup-1',
      supplierName: '采购深链供应商',
      orderedQty: 4,
      receivedQty: 0,
      remainingQty: 4,
      unit: '瓶',
      unitPrice: 12,
      totalAmount: 48,
      status: 'pending',
      createdAt: '2026-06-20T01:00:00.000Z',
      updatedAt: '2026-06-20T01:00:00.000Z',
    }
    let serverReturnsCreatedOrder = true
    vi.mocked(purchaseOrderApi.getList).mockImplementation(async (params: any = {}) => {
      if (params.keyword === 'PO-SERVER-CREATED-001') {
        return {
          list: serverReturnsCreatedOrder ? [createdOrder] : [],
          pagination: { total: serverReturnsCreatedOrder ? 1 : 0, page: 1, pageSize: 20 },
        } as any
      }
      return {
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any
    })
    vi.mocked(purchaseOrderApi.create).mockResolvedValueOnce(createdOrder as any)

    renderPurchaseOrders()

    fireEvent.click(await screen.findByRole('button', { name: '新建采购订单' }))
    await screen.findByRole('button', { name: '确认创建' })
    fireEvent.click(screen.getAllByText('请选择')[0])
    fireEvent.click(await screen.findByTestId('option-mat-po-1'))
    fireEvent.click(screen.getAllByText('请选择')[0])
    fireEvent.click(await screen.findByTestId('option-sup-1'))
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '4' } })
    fireEvent.click(screen.getByRole('button', { name: '确认创建' }))

    expect(await screen.findByText('PO-SERVER-CREATED-001')).toBeInTheDocument()
    serverReturnsCreatedOrder = false
    fireEvent.change(screen.getByPlaceholderText('搜索订单号/物料名称...'), { target: { value: 'unrelated-order' } })
    await waitFor(() => expect(screen.queryByText('PO-SERVER-CREATED-001')).not.toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('搜索订单号/物料名称...'), { target: { value: 'PO-SERVER-CREATED-001' } })

    await waitFor(() => expect(purchaseOrderApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'PO-SERVER-CREATED-001',
    })))
    await waitFor(() => expect(screen.queryByText('PO-SERVER-CREATED-001')).not.toBeInTheDocument())
    expect(screen.getByText('共 0 条记录')).toBeInTheDocument()
  })

  it('focuses the cancelled purchase order so users can verify the result and audit trail', async () => {
    window.history.replaceState(null, '', '/purchase-orders?status=pending&keyword=PO-DEEP-001')

    renderPurchaseOrders('/purchase-orders?status=pending&keyword=PO-DEEP-001')

    await screen.findByText('PO-DEEP-001')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认取消' }))

    await waitFor(() => expect(purchaseOrderApi.cancel).toHaveBeenCalledWith('po-1'))
    await waitFor(() => {
      expect(purchaseOrderApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'PO-DEEP-001',
        status: 'cancelled',
      }))
    })
    expect(toast.success).toHaveBeenCalledWith('订单已取消', {
      description: 'PO-DEEP-001 的待入库数量已从入库候选移除；库存、批次和成本不产生回退，审计记录可按单号回看',
    })
  })

  it('keeps the cancelled purchase order visible when the follow-up list refresh fails', async () => {
    vi.mocked(purchaseOrderApi.getList)
      .mockResolvedValueOnce({
        list: [
          {
            id: 'po-cancel-visible',
            orderNo: 'PO-CANCEL-VISIBLE-001',
            materialId: 'mat-po-1',
            materialName: '采购深链物料',
            supplierId: 'sup-1',
            supplierName: '采购深链供应商',
            orderedQty: 5,
            receivedQty: 0,
            remainingQty: 5,
            unit: '瓶',
            unitPrice: 12,
            totalAmount: 60,
            status: 'pending',
            createdAt: '2026-06-20T01:00:00.000Z',
            updatedAt: '2026-06-20T01:00:00.000Z',
          },
        ],
        pagination: { total: 1, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('cancel refresh failed'))

    renderPurchaseOrders()

    await screen.findByText('PO-CANCEL-VISIBLE-001')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认取消' }))

    await waitFor(() => expect(purchaseOrderApi.cancel).toHaveBeenCalledWith('po-cancel-visible'))
    expect(screen.getByPlaceholderText('搜索订单号/物料名称...')).toHaveValue('PO-CANCEL-VISIBLE-001')
    expect(await screen.findByText('PO-CANCEL-VISIBLE-001')).toBeInTheDocument()
    expect(screen.getAllByText('已取消').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('采购深链物料')).toBeInTheDocument()
    expect(screen.getByText('采购深链供应商')).toBeInTheDocument()
    expect(screen.getByText('共 1 条记录')).toBeInTheDocument()
  })

  it('clears the cancelled purchase order fallback once the focused refresh returns the server row', async () => {
    const pendingOrder = {
      id: 'po-cancel-server',
      orderNo: 'PO-CANCEL-SERVER-001',
      materialId: 'mat-po-1',
      materialName: '采购深链物料',
      supplierId: 'sup-1',
      supplierName: '采购深链供应商',
      orderedQty: 5,
      receivedQty: 0,
      remainingQty: 5,
      unit: '瓶',
      unitPrice: 12,
      totalAmount: 60,
      status: 'pending',
      createdAt: '2026-06-20T01:00:00.000Z',
      updatedAt: '2026-06-20T01:00:00.000Z',
    }
    const cancelledOrder = {
      ...pendingOrder,
      status: 'cancelled',
      updatedAt: '2026-06-20T02:00:00.000Z',
    }
    let serverReturnsCancelledOrder = true
    vi.mocked(purchaseOrderApi.getList).mockImplementation(async (params: any = {}) => {
      if (params.keyword === 'PO-CANCEL-SERVER-001' && params.status === 'cancelled') {
        return {
          list: serverReturnsCancelledOrder ? [cancelledOrder] : [],
          pagination: { total: serverReturnsCancelledOrder ? 1 : 0, page: 1, pageSize: 20 },
        } as any
      }
      if (!params.keyword) {
        return {
          list: [pendingOrder],
          pagination: { total: 1, page: 1, pageSize: 20 },
        } as any
      }
      return {
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any
    })

    renderPurchaseOrders()

    await screen.findByText('PO-CANCEL-SERVER-001')
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认取消' }))

    await waitFor(() => expect(purchaseOrderApi.cancel).toHaveBeenCalledWith('po-cancel-server'))
    expect(await screen.findByText('PO-CANCEL-SERVER-001')).toBeInTheDocument()
    expect(screen.getAllByText('已取消').length).toBeGreaterThanOrEqual(1)

    serverReturnsCancelledOrder = false
    fireEvent.change(screen.getByPlaceholderText('搜索订单号/物料名称...'), { target: { value: 'unrelated-order' } })
    await waitFor(() => expect(screen.queryByText('PO-CANCEL-SERVER-001')).not.toBeInTheDocument())

    fireEvent.change(screen.getByPlaceholderText('搜索订单号/物料名称...'), { target: { value: 'PO-CANCEL-SERVER-001' } })

    await waitFor(() => expect(purchaseOrderApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'PO-CANCEL-SERVER-001',
      status: 'cancelled',
    })))
    await waitFor(() => expect(screen.queryByText('PO-CANCEL-SERVER-001')).not.toBeInTheDocument())
    expect(screen.getByText('共 0 条记录')).toBeInTheDocument()
  })

  it('opens audit evidence from the purchase order row', async () => {
    renderPurchaseOrders()

    await screen.findByText('PO-DEEP-001')
    fireEvent.click(screen.getByRole('button', { name: /审计证据 PO-DEEP-001/ }))

    expect(screen.getByTestId('location')).toHaveTextContent('/logs?keyword=PO-DEEP-001')
  })

  it('opens audit evidence from the purchase order detail modal', async () => {
    renderPurchaseOrders()

    await screen.findByText('PO-DEEP-001')
    fireEvent.click(screen.getByRole('button', { name: '详情' }))
    fireEvent.click(screen.getByRole('button', { name: '审计证据' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/logs?keyword=PO-DEEP-001')
  })

  it('passes purchase order source facts when warehouse users receive into inbound', async () => {
    window.localStorage.setItem('user', JSON.stringify({
      id: 'USER-WHM',
      username: 'wangkq',
      realName: '王坤强',
      role: 'warehouse_manager',
      permissions: ['purchase_orders:view'],
      status: 'active',
      createdAt: '2026-06-20T00:00:00.000Z',
    }))

    renderPurchaseOrders()

    await screen.findByText('PO-DEEP-001')
    fireEvent.click(screen.getByRole('button', { name: '收货' }))
    expect(await screen.findByText('入库带入确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：采购订单、入库单、库存批次、库位、成本、审计记录')).toBeInTheDocument()
    expect(screen.getByText('采购深链物料')).toBeInTheDocument()
    expect(screen.getByText('采购深链供应商')).toBeInTheDocument()
    expect(screen.getByText('本次入库 5 瓶')).toBeInTheDocument()
    expect(screen.getByText('入库单价 ¥12.00')).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: '去入库' }))

    expect(screen.getByTestId('location')).toHaveTextContent('/inbound?')
    expect(screen.getByTestId('location')).toHaveTextContent('action=create')
    expect(screen.getByTestId('location')).toHaveTextContent('type=purchase')
    expect(screen.getByTestId('location')).toHaveTextContent('purchaseOrderId=po-1')
    expect(screen.getByTestId('location')).toHaveTextContent('purchaseOrderNo=PO-DEEP-001')
    expect(screen.getByTestId('location')).toHaveTextContent('materialId=mat-po-1')
    expect(screen.getByTestId('location')).toHaveTextContent('supplierId=sup-1')
    expect(screen.getByTestId('location')).toHaveTextContent('quantity=5')
    expect(screen.getByTestId('location')).toHaveTextContent('price=12')
    const target = new URLSearchParams((screen.getByTestId('location').textContent || '').split('?')[1])
    expect(target.get('remainingQty')).toBe('5')
    expect(target.get('unit')).toBe('瓶')
    expect(target.get('materialName')).toBe('采购深链物料')
    expect(target.get('supplierName')).toBe('采购深链供应商')
  })

  it('blocks receive navigation when the receive quantity exceeds the remaining quantity', async () => {
    window.localStorage.setItem('user', JSON.stringify({
      id: 'USER-WHM',
      username: 'wangkq',
      realName: '王坤强',
      role: 'warehouse_manager',
      permissions: ['purchase_orders:view'],
      status: 'active',
      createdAt: '2026-06-20T00:00:00.000Z',
    }))

    renderPurchaseOrders()

    await screen.findByText('PO-DEEP-001')
    fireEvent.click(screen.getByRole('button', { name: '收货' }))
    fireEvent.change(screen.getByLabelText(/本次收货数量/), { target: { value: '6' } })

    expect(screen.getByText('本次收货数量超过剩余可收货 5，请按实收数量修改。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '去入库' })).toBeDisabled()
    expect(screen.getByTestId('location')).toHaveTextContent('/purchase-orders')
  })
})
