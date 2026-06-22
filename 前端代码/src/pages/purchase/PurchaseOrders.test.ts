import { render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter } from 'react-router-dom'
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

vi.mock('@/api/inventory')
vi.mock('@/api/master')
vi.mock('sonner')

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

  it('uses keyword from URL so audit links open a filtered purchase order list', async () => {
    window.history.replaceState(null, '', '/purchase-orders?keyword=PO-DEEP-001')

    render(React.createElement(MemoryRouter, null, React.createElement(PurchaseOrders)))

    await waitFor(() => {
      expect(purchaseOrderApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'PO-DEEP-001',
      }))
    })
    expect(screen.getByPlaceholderText('搜索订单号/物料名称...')).toHaveValue('PO-DEEP-001')
  })
})
