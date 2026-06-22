import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MaterialFormModal } from './MaterialFormModal'
import { MaterialDetailModal } from './MaterialDetailModal'
import type { FormData } from '../hooks/useMaterialsPage'
import type { Material } from '@/types'

const form: FormData = {
  code: 'MAT-A11Y-001',
  barcode: '',
  name: '苏木素染色液',
  spec: '1/ml',
  unit: '瓶',
  categoryId: 'cat-a11y',
  supplierId: '',
  locationId: 'loc-a11y',
  price: 18.5,
  minStock: 4,
  maxStock: 90,
  safetyStock: 11,
  status: 'active',
  remark: '',
}

const material: Material = {
  id: 'mat-a11y',
  code: 'MAT-A11Y-001',
  name: '苏木素染色液',
  spec: '1/ml',
  unit: '瓶',
  price: 18.5,
  stock: 0,
  minStock: 4,
  maxStock: 90,
  safetyStock: 11,
  locationId: 'loc-a11y',
  categoryId: 'cat-a11y',
  status: 'active',
  createdAt: '2026-06-22',
  updatedAt: '2026-06-22',
}

describe('Material modals accessibility', () => {
  it('exposes the material form as a named dialog', () => {
    render(
      <MaterialFormModal
        open
        editingId="mat-a11y"
        form={form}
        specPart={{ amount: '1', unit: 'ml' }}
        categories={[{ id: 'cat-a11y', name: '染色试剂' }]}
        suppliers={[]}
        locations={[{ id: 'loc-a11y', name: 'A冷藏柜' }]}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onSpecPartChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: '编辑物料' })).toBeInTheDocument()
  })

  it('exposes the material detail as a named dialog', () => {
    render(
      <MaterialDetailModal
        open
        row={material}
        getCategoryName={() => '染色试剂'}
        getSupplierName={() => '-'}
        getLocationName={() => 'A冷藏柜'}
        statusBadge={() => <span>启用</span>}
        onClose={vi.fn()}
        onEdit={vi.fn()}
      />,
    )

    expect(screen.getByRole('dialog', { name: '物料详情' })).toBeInTheDocument()
  })
})
