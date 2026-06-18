import { describe, expect, it } from 'vitest'
import { validateTransferForm, type TransferFormState } from './Transfers'
import type { Material } from '@/types'

const baseForm: TransferFormState = {
  materialId: 'mat-1',
  batchNo: '',
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

describe('validateTransferForm', () => {
  it('blocks transfer quantity greater than source location stock even when total stock is enough', () => {
    expect(validateTransferForm(baseForm, material, 2)).toBe('调拨数量不能超过来源库位可用库存 2 瓶')
  })

  it('blocks same source and target location', () => {
    expect(validateTransferForm({ ...baseForm, toLocationId: 'loc-a' }, material, 10)).toBe('来源库位和目标库位不能相同')
  })

  it('accepts a valid material, source location, target location and quantity combination', () => {
    expect(validateTransferForm(baseForm, material, 5)).toBeNull()
  })
})
