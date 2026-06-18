import { describe, expect, it } from 'vitest'
import { validateSupplierReturnForm, type SupplierReturnFormState } from './SupplierReturns'
import type { Batch, Material } from '@/types'

const baseForm: SupplierReturnFormState = {
  materialId: 'mat-1',
  quantity: 1,
  batchId: 'batch-1',
  supplierId: '',
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
    status: 'normal',
    createdAt: '2026-06-17',
  },
] satisfies Batch[]

describe('validateSupplierReturnForm', () => {
  it('requires a selected batch when the material has available batches', () => {
    expect(validateSupplierReturnForm({ ...baseForm, batchId: '' }, material, batches)).toBe('请选择退货批次')
  })

  it('blocks quantity greater than selected batch remaining quantity', () => {
    expect(validateSupplierReturnForm({ ...baseForm, quantity: 4 }, material, batches)).toBe('退货数量不能超过所选批次剩余量')
  })

  it('accepts a valid material, batch, quantity and reason combination', () => {
    expect(validateSupplierReturnForm(baseForm, material, batches)).toBeNull()
  })
})
