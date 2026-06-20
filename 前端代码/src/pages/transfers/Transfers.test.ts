import { describe, expect, it } from 'vitest'
import { validateTransferForm, type TransferFormState } from './Transfers'
import type { Batch, Material } from '@/types'

const baseForm: TransferFormState = {
  materialId: 'mat-1',
  batchNo: 'BATCH-1',
  quantity: 3,
  fromLocationId: 'loc-a',
  toLocationId: 'loc-b',
  remark: '',
}

const material = {
  id: 'mat-1',
  code: 'MAT-1',
  name: '调拨物料',
  spec: '1ml',
  unit: '瓶',
  price: 10,
  stock: 10,
  minStock: 0,
  maxStock: 100,
  safetyStock: 5,
  locationId: 'loc-a',
  categoryId: 'cat-1',
  status: 'active',
  createdAt: '2026-06-18',
  updatedAt: '2026-06-18',
} satisfies Material

const batches = [
  {
    id: 'batch-1',
    materialId: 'mat-1',
    batchNo: 'BATCH-1',
    quantity: 10,
    remaining: 4,
    expiryDate: '2027-01-01',
    inboundId: 'inbound-1',
    inboundPrice: 12,
    status: 'normal',
    createdAt: '2026-06-18',
  },
] satisfies Batch[]

describe('validateTransferForm', () => {
  it('blocks transfer quantity greater than source location stock even when total stock is enough', () => {
    expect(validateTransferForm(baseForm, material, 2, batches)).toBe('调拨数量不能超过来源库位可用库存 2 瓶')
  })

  it('blocks same source and target location', () => {
    expect(validateTransferForm({ ...baseForm, toLocationId: 'loc-a' }, material, 10, batches)).toBe('来源库位和目标库位不能相同')
  })

  it('requires a batch when the material has available batches', () => {
    expect(validateTransferForm({ ...baseForm, batchNo: '' }, material, 10, batches)).toBe('请选择调拨批次')
  })

  it('blocks quantity greater than selected batch remaining quantity', () => {
    expect(validateTransferForm({ ...baseForm, quantity: 5 }, material, 10, batches)).toBe('调拨数量不能超过所选批次剩余量 4 瓶')
  })

  it('accepts a valid material, source location, target location and quantity combination', () => {
    expect(validateTransferForm(baseForm, material, 5)).toBeNull()
    expect(validateTransferForm(baseForm, material, 5, [{ ...batches[0], remaining: 5 }])).toBeNull()
  })
})
