import { describe, expect, it } from 'vitest'
import {
  applySelectedMaterialToPurchaseForm,
  canReceivePurchaseOrders,
  canWritePurchaseOrders,
  type PurchaseOrderForm,
} from './PurchaseOrders'
import type { Material } from '@/types'

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
})
