import { describe, expect, it } from 'vitest'
import { applyPurchaseOrderToInboundForm, type FormData } from './InboundFormModal'

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

describe('applyPurchaseOrderToInboundForm', () => {
  it('prefills inbound form from the selected purchase order', () => {
    expect(applyPurchaseOrderToInboundForm(baseForm, {
      id: 'po-1',
      materialId: 'mat-1',
      supplierId: 'sup-1',
      remainingQty: 12,
      unitPrice: 18.5,
    })).toEqual({
      ...baseForm,
      purchaseOrderId: 'po-1',
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
    })
  })
})
