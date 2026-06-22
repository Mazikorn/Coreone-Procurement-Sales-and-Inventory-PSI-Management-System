import { render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { transferApi } from '@/api/inventory'
import { locationApi, materialApi } from '@/api/master'
import { validateTransferForm, type TransferFormState } from './Transfers'
import Transfers from './Transfers'
import type { Batch, Material } from '@/types'

vi.mock('@/api/inventory')
vi.mock('@/api/master')
vi.mock('sonner')

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

describe('Transfers page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    window.history.replaceState(null, '', '/transfers')
    vi.mocked(materialApi.getList).mockResolvedValue({
      list: [
        {
          ...material,
          id: 'mat-transfer-1',
          code: 'MAT-TF-001',
          name: '调拨深链物料',
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 999 },
    } as any)
    vi.mocked(locationApi.getList).mockResolvedValue({
      list: [
        { id: 'loc-a', code: 'LOC-A', name: 'A冷藏柜', type: 'shelf', zone: 'A区', status: 'active' },
        { id: 'loc-b', code: 'LOC-B', name: 'B备用柜', type: 'shelf', zone: 'B区', status: 'active' },
      ],
      pagination: { total: 2, page: 1, pageSize: 999 },
    } as any)
    vi.mocked(transferApi.getList).mockResolvedValue({
      list: [
        {
          id: 'transfer-1',
          inboundNo: 'TF-DEEP-001',
          materialId: 'mat-transfer-1',
          materialName: '调拨深链物料',
          batchNo: 'BATCH-TF-001',
          quantity: 2,
          fromLocationId: 'loc-a',
          fromLocationName: 'A冷藏柜',
          toLocationId: 'loc-b',
          toLocationName: 'B备用柜',
          operator: 'admin',
          status: 'completed',
          remark: '',
          createdAt: '2026-06-20T01:00:00.000Z',
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 20 },
    } as any)
  })

  it('uses keyword from URL so audit links open a filtered transfer list', async () => {
    window.history.replaceState(null, '', '/transfers?keyword=TF-DEEP-001')

    render(React.createElement(Transfers))

    await waitFor(() => {
      expect(transferApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'TF-DEEP-001',
      }))
    })
    expect(screen.getByPlaceholderText('搜索调拨单号/物料/批次/库位...')).toHaveValue('TF-DEEP-001')
  })
})
