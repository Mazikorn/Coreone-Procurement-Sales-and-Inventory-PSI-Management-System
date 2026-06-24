import { render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import InboundFormModal, { applyPurchaseOrderToInboundForm, type FormData } from './InboundFormModal'

const baseForm: FormData = {
  type: 'purchase',
  materialId: '',
  batchNo: '',
  quantity: 0,
  price: 0,
  supplierId: '',
  locationId: 'loc-1',
  fromLocationId: '',
  fromLocationName: '',
  productionDate: '',
  expiryDate: '',
  remark: '',
  purchaseOrderId: '',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('applyPurchaseOrderToInboundForm', () => {
  it('prefills inbound form from the selected purchase order', () => {
    expect(applyPurchaseOrderToInboundForm(baseForm, {
      id: 'po-1',
      orderNo: 'PO-001',
      materialId: 'mat-1',
      supplierId: 'sup-1',
      remainingQty: 12,
      unitPrice: 18.5,
    })).toEqual({
      ...baseForm,
      purchaseOrderId: 'po-1',
      purchaseOrderNo: 'PO-001',
      materialId: 'mat-1',
      supplierId: 'sup-1',
      quantity: 12,
      price: 18.5,
    })
  })

  it('clears only the purchase order relation when the user selects no order', () => {
    expect(applyPurchaseOrderToInboundForm({
      ...baseForm,
      purchaseOrderId: 'po-1',
      purchaseOrderNo: 'PO-001',
      materialId: 'mat-1',
      supplierId: 'sup-1',
      quantity: 12,
      price: 18.5,
    }, undefined)).toEqual({
      ...baseForm,
      materialId: 'mat-1',
      supplierId: 'sup-1',
      quantity: 12,
      price: 18.5,
      purchaseOrderId: '',
      purchaseOrderNo: '',
    })
  })
})

describe('InboundFormModal outcome preview', () => {
  it('summarizes the downstream facts before confirming purchase inbound', () => {
    vi.stubGlobal('React', React)

    render(
      React.createElement(InboundFormModal, {
        open: true,
        modalType: 'create',
        form: {
          ...baseForm,
          purchaseOrderId: 'po-1',
          materialId: 'mat-1',
          supplierId: 'sup-1',
          locationId: 'loc-1',
          batchNo: 'B-IN-001',
          quantity: 8,
          price: 50,
          expiryDate: '2027-12-31',
        },
        setForm: vi.fn(),
        materials: [{
          id: 'mat-1',
          code: 'M001',
          name: '苏木素',
          spec: '10ml',
          unit: '瓶',
          price: 50,
          stock: 0,
          minStock: 1,
          maxStock: 100,
          safetyStock: 5,
          categoryId: 'cat-1',
          status: 'active',
          createdAt: '',
          updatedAt: '',
        }],
        locations: [{ id: 'loc-1', name: 'A1-01', code: 'A101', type: 'shelf', status: 'active', createdAt: '', updatedAt: '' } as any],
        suppliers: [{ id: 'sup-1', name: '供应商A', code: 'SUP-A', status: 'active', createdAt: '', updatedAt: '' } as any],
        purchaseOrders: [{
          id: 'po-1',
          orderNo: 'PO-001',
          materialId: 'mat-1',
          materialName: '苏木素',
          supplierId: 'sup-1',
          remainingQty: 8,
          unitPrice: 50,
        }],
        selectedOrderId: 'po-1',
        setSelectedOrderId: vi.fn(),
        selectedRecord: null,
        submitting: false,
        onClose: vi.fn(),
        onSubmit: vi.fn(),
      }),
    )

    expect(screen.getByText('入库结果确认')).toBeInTheDocument()
    expect(screen.getByText('采购订单 PO-001')).toBeInTheDocument()
    expect(screen.getByText('批次 B-IN-001')).toBeInTheDocument()
    expect(screen.getByText('库位 A1-01')).toBeInTheDocument()
    expect(screen.getByText('有效期 2027-12-31')).toBeInTheDocument()
    expect(screen.getByText('收货进度 +8瓶 / 待入库 8瓶 / 入库后剩余 0瓶')).toBeInTheDocument()
  })

  it('uses inbound quantity wording for direct inbound instead of purchase receiving progress', () => {
    vi.stubGlobal('React', React)

    render(
      React.createElement(InboundFormModal, {
        open: true,
        modalType: 'create',
        form: {
          ...baseForm,
          type: 'direct',
          materialId: 'mat-1',
          supplierId: 'sup-1',
          locationId: 'loc-1',
          batchNo: 'B-DIRECT-001',
          quantity: 3,
          price: 20,
          expiryDate: '2027-12-31',
          purchaseOrderId: '',
        },
        setForm: vi.fn(),
        materials: [{
          id: 'mat-1',
          code: 'M001',
          name: '苏木素',
          spec: '10ml',
          unit: '瓶',
          price: 50,
          stock: 0,
          minStock: 1,
          maxStock: 100,
          safetyStock: 5,
          categoryId: 'cat-1',
          status: 'active',
          createdAt: '',
          updatedAt: '',
        }],
        locations: [{ id: 'loc-1', name: 'A1-01', code: 'A101', type: 'shelf', status: 'active', createdAt: '', updatedAt: '' } as any],
        suppliers: [{ id: 'sup-1', name: '供应商A', code: 'SUP-A', status: 'active', createdAt: '', updatedAt: '' } as any],
        purchaseOrders: [],
        selectedOrderId: '',
        setSelectedOrderId: vi.fn(),
        selectedRecord: null,
        submitting: false,
        onClose: vi.fn(),
        onSubmit: vi.fn(),
      }),
    )

    expect(screen.getByText('入库数量 +3瓶')).toBeInTheDocument()
    expect(screen.queryByText(/收货进度/)).not.toBeInTheDocument()
  })

  it('keeps the purchase order number visible when purchase order options are not loaded yet', () => {
    vi.stubGlobal('React', React)

    render(
      React.createElement(InboundFormModal, {
        open: true,
        modalType: 'create',
        form: {
          ...baseForm,
          purchaseOrderId: 'po-1',
          purchaseOrderNo: 'PO-001',
          materialId: 'mat-1',
          supplierId: 'sup-1',
          locationId: 'loc-1',
          batchNo: 'B-IN-001',
          quantity: 8,
          price: 50,
          expiryDate: '2027-12-31',
        },
        setForm: vi.fn(),
        materials: [{
          id: 'mat-1',
          code: 'M001',
          name: '苏木素',
          spec: '10ml',
          unit: '瓶',
          price: 50,
          stock: 0,
          minStock: 1,
          maxStock: 100,
          safetyStock: 5,
          categoryId: 'cat-1',
          status: 'active',
          createdAt: '',
          updatedAt: '',
        }],
        locations: [{ id: 'loc-1', name: 'A1-01', code: 'A101', type: 'shelf', status: 'active', createdAt: '', updatedAt: '' } as any],
        suppliers: [{ id: 'sup-1', name: '供应商A', code: 'SUP-A', status: 'active', createdAt: '', updatedAt: '' } as any],
        purchaseOrders: [],
        selectedOrderId: 'po-1',
        setSelectedOrderId: vi.fn(),
        selectedRecord: null,
        submitting: false,
        onClose: vi.fn(),
        onSubmit: vi.fn(),
      }),
    )

    expect(screen.getByText('采购订单 PO-001')).toBeInTheDocument()
  })

  it('blocks purchase inbound when quantity exceeds the remaining purchase quantity', () => {
    const onSubmit = vi.fn()
    vi.stubGlobal('React', React)

    render(
      React.createElement(InboundFormModal, {
        open: true,
        modalType: 'create',
        form: {
          ...baseForm,
          purchaseOrderId: 'po-1',
          materialId: 'mat-1',
          supplierId: 'sup-1',
          locationId: 'loc-1',
          batchNo: 'B-IN-001',
          quantity: 10,
          price: 50,
          expiryDate: '2027-12-31',
        },
        setForm: vi.fn(),
        materials: [{
          id: 'mat-1',
          code: 'M001',
          name: '苏木素',
          spec: '10ml',
          unit: '瓶',
          price: 50,
          stock: 0,
          minStock: 1,
          maxStock: 100,
          safetyStock: 5,
          categoryId: 'cat-1',
          status: 'active',
          createdAt: '',
          updatedAt: '',
        }],
        locations: [{ id: 'loc-1', name: 'A1-01', code: 'A101', type: 'shelf', status: 'active', createdAt: '', updatedAt: '' } as any],
        suppliers: [{ id: 'sup-1', name: '供应商A', code: 'SUP-A', status: 'active', createdAt: '', updatedAt: '' } as any],
        purchaseOrders: [{
          id: 'po-1',
          orderNo: 'PO-001',
          materialId: 'mat-1',
          materialName: '苏木素',
          supplierId: 'sup-1',
          remainingQty: 8,
          unitPrice: 50,
        }],
        selectedOrderId: 'po-1',
        setSelectedOrderId: vi.fn(),
        selectedRecord: null,
        submitting: false,
        onClose: vi.fn(),
        onSubmit,
      }),
    )

    expect(screen.getByText('本次入库数量超过待入库数量 8，请按实收数量修改；如果不是采购收货，请改为直接入库。')).toBeInTheDocument()
    const confirmButton = screen.getByRole('button', { name: '确认入库' })
    expect(confirmButton).toBeDisabled()
  })
})
