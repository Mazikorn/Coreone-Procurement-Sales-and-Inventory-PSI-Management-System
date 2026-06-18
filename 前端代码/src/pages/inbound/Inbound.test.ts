import { describe, expect, it } from 'vitest'
import { applyScannedMaterialToInboundForm } from './Inbound'
import type { FormData } from './components/InboundFormModal'
import type { Material } from '@/types'

const baseForm: FormData = {
  type: 'purchase',
  materialId: '',
  batchNo: '',
  quantity: 0,
  price: 3,
  supplierId: 'old-supplier',
  locationId: 'old-location',
  fromLocationId: '',
  fromLocationName: '',
  productionDate: '',
  expiryDate: '',
  remark: '',
  purchaseOrderId: '',
}

describe('applyScannedMaterialToInboundForm', () => {
  it('prefills direct inbound fields from the scanned material', () => {
    const material = {
      id: 'mat-1',
      price: 18.5,
      supplierId: 'sup-1',
      locationId: 'loc-1',
    } as Material

    expect(applyScannedMaterialToInboundForm(baseForm, material)).toEqual({
      ...baseForm,
      type: 'direct',
      materialId: 'mat-1',
      price: 18.5,
      supplierId: 'sup-1',
      locationId: 'loc-1',
    })
  })

  it('keeps existing supplier and location when barcode lookup does not return them', () => {
    const material = {
      id: 'mat-2',
      price: undefined,
    } as Material

    expect(applyScannedMaterialToInboundForm(baseForm, material)).toEqual({
      ...baseForm,
      type: 'direct',
      materialId: 'mat-2',
    })
  })
})
