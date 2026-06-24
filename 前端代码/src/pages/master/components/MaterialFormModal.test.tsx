import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MaterialFormModal } from './MaterialFormModal'
import type { FormData } from '../hooks/useMaterialsPage'

const form: FormData = {
  code: 'MAT-001',
  barcode: '690000000001',
  name: '苏木素染色液',
  spec: '100/ml',
  unit: '瓶',
  categoryId: 'cat-1',
  supplierId: 'supplier-1',
  locationId: 'loc-1',
  price: 18.5,
  minStock: 4,
  maxStock: 90,
  safetyStock: 11,
  status: 'active',
  remark: '',
}

describe('MaterialFormModal', () => {
  it('summarizes material result and downstream chains before saving', () => {
    render(
      <MaterialFormModal
        open
        editingId={null}
        form={form}
        specPart={{ amount: '100', unit: 'ml' }}
        categories={[{ id: 'cat-1', name: '染色试剂' }]}
        suppliers={[{ id: 'supplier-1', name: '华东供应商' }]}
        locations={[{ id: 'loc-1', name: 'A冷藏柜', code: 'LOC-A', zone: '冷藏区' }]}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onSpecPartChange={vi.fn()}
        onCategoryChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('物料结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：采购、入库、库存、批次、BOM、成本、预警、审计记录')).toBeInTheDocument()
    expect(screen.getByText('物料 苏木素染色液')).toBeInTheDocument()
    expect(screen.getByText('分类 染色试剂')).toBeInTheDocument()
    expect(screen.getByText('供应商 华东供应商')).toBeInTheDocument()
    expect(screen.getByText('默认库位 A冷藏柜')).toBeInTheDocument()
    expect(screen.getByText('库存阈值 安全 4 / 保险 11 / 最大 90 瓶')).toBeInTheDocument()
    expect(screen.getByText('参考单价 ¥18.50')).toBeInTheDocument()
  })
})
