import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Category } from '@/types'
import { CategoryDeleteModal } from './CategoryDeleteModal'

function category(overrides: Partial<Category> = {}): Category {
  return {
    id: 'cat-delete',
    code: 'CAT-DELETE',
    name: '待删除分类',
    parentId: null,
    level: 1,
    sortOrder: 0,
    status: 'active',
    count: 0,
    isLeaf: true,
    createdAt: '2026-06-23',
    updatedAt: '2026-06-23',
    ...overrides,
  }
}

describe('CategoryDeleteModal', () => {
  it('explains downstream business impact before deleting an unused category', () => {
    render(
      <CategoryDeleteModal
        open
        target={category({ name: '免疫组化试剂分类' })}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('确定要删除该分类吗？')).toBeInTheDocument()
    expect(screen.getByText('删除后该分类不会再用于新物料建档、库存筛选、BOM选料、成本分类和审计筛选；已有物料、库存、BOM、成本和审计记录仍保留可回看。')).toBeInTheDocument()
  })
})
