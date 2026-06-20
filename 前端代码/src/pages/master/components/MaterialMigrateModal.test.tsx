import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MaterialMigrateModal } from './MaterialMigrateModal'
import type { Category, Material } from '@/types'

const baseMaterial: Material = {
  id: 'mat-1',
  code: 'MAT-001',
  name: '测试物料',
  spec: '1ml',
  unit: '瓶',
  price: 10,
  stock: 0,
  minStock: 1,
  maxStock: 100,
  safetyStock: 2,
  categoryId: 'leaf-current',
  status: 'active',
  createdAt: '2026-06-20',
  updatedAt: '2026-06-20',
}

function category(overrides: Partial<Category>): Category {
  return {
    id: 'cat',
    code: 'CAT',
    name: '分类',
    parentId: null,
    level: 1,
    sortOrder: 0,
    status: 'active',
    children: [],
    count: 0,
    createdAt: '2026-06-20',
    updatedAt: '2026-06-20',
    ...overrides,
  }
}

describe('MaterialMigrateModal', () => {
  it('only offers active leaf categories as migration targets', () => {
    render(
      <MaterialMigrateModal
        open
        material={baseMaterial}
        currentCategory={category({ id: 'leaf-current', name: '当前末级分类' })}
        categories={[
          category({
            id: 'summary',
            code: 'SUM',
            name: '汇总分类',
            children: [category({ id: 'summary-child', parentId: 'summary', name: '子分类' })],
          }),
          category({ id: 'inactive-leaf', code: 'OFF', name: '停用末级分类', status: 'inactive' }),
          category({ id: 'leaf-target', code: 'LEAF', name: '可用末级分类' }),
        ]}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('请选择目标分类'))

    expect(screen.getByText('可用末级分类 (LEAF)')).toBeInTheDocument()
    expect(screen.queryByText('汇总分类 (SUM)')).not.toBeInTheDocument()
    expect(screen.queryByText('停用末级分类 (OFF)')).not.toBeInTheDocument()
  })
})
