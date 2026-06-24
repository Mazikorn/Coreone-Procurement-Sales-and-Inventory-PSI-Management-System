import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CategoryFormModal } from './CategoryFormModal'
import type { Category } from '@/types'
import type { FormData } from '../hooks/useCategoriesPage'

const parentCategory: Category = {
  id: 'parent-cat',
  code: 'CAT-PARENT',
  name: '试剂耗材',
  parentId: null,
  level: 1,
  sortOrder: 0,
  status: 'active',
  count: 0,
  isLeaf: false,
  createdAt: '2026-06-23',
  updatedAt: '2026-06-23',
}

const form: FormData = {
  code: 'CAT-NEW',
  name: '免疫组化试剂',
  parentId: 'parent-cat',
  level: 2,
  sortOrder: 5,
  remark: '用于免疫组化相关物料',
}

describe('CategoryFormModal', () => {
  it('summarizes category result and downstream chains before saving', () => {
    render(
      <CategoryFormModal
        open
        editingId={null}
        form={form}
        flatList={[parentCategory]}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('分类结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：物料建档、物料编码、库存筛选、BOM选料、成本分类、审计记录')).toBeInTheDocument()
    expect(screen.getByText('分类 免疫组化试剂')).toBeInTheDocument()
    expect(screen.getByText('上级分类 试剂耗材')).toBeInTheDocument()
    expect(screen.getByText('层级 二级分类')).toBeInTheDocument()
    expect(screen.getByText('排序 5')).toBeInTheDocument()
  })
})
