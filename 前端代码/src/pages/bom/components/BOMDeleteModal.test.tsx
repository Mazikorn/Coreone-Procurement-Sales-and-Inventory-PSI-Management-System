import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { BOM, BOMDeleteCheck } from '@/types'
import { BOMDeleteModal } from './BOMDeleteModal'

const bom: BOM = {
  id: 'bom-1',
  code: 'BOM-001',
  name: '免疫组化BOM',
  version: 'v1.0',
  type: 'ihc',
  materialCount: 1,
  unitCost: 10,
  status: 'active',
  materials: [],
  versionHistory: [],
  createdAt: '2026-06-23',
  updatedAt: '2026-06-23',
}

describe('BOMDeleteModal', () => {
  it('explains downstream business impact before deleting an unreferenced BOM', () => {
    const deleteCheck: BOMDeleteCheck = {
      bom: { id: 'bom-1', code: 'BOM-001', name: '免疫组化BOM' },
      deletable: true,
      impacts: { projectCount: 0, outboundDetailCount: 0 },
      reasons: [],
    }

    render(
      <BOMDeleteModal
        open
        editingId="bom-1"
        data={[bom]}
        deleteCheck={deleteCheck}
        checkingDelete={false}
        isSubmitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('确定要删除该BOM吗？')).toBeInTheDocument()
    expect(screen.getByText('未发现业务引用，可以删除；删除后该BOM不会再用于新检测服务绑定、项目出库、LIS对账、ABC成本计算、项目成本归集和审计筛选。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认删除' })).toBeEnabled()
  })
})
