import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BOMCopyModal } from './BOMCopyModal'
import type { BOM } from '@/types'

const bom = {
  id: 'bom-1',
  code: 'BOM-001',
  name: '免疫组化BOM',
  version: 'v1.0',
  type: 'ihc',
  status: 'active',
  materialCount: 1,
  supportableSamples: 10,
  unitCost: 20,
  createdAt: '2026-06-18T00:00:00.000Z',
  updatedAt: '2026-06-18T00:00:00.000Z',
} as BOM

describe('BOMCopyModal', () => {
  it('makes material copy mandatory and explains service binding is not copied', () => {
    render(
      <BOMCopyModal
        open
        editingId="bom-1"
        copyForm={{ name: '免疫组化BOM 副本', copyInfo: true, copyMaterials: true }}
        data={[bom]}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('物料清单（必选）')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '物料清单（必选）' })).toBeDisabled()
    expect(screen.getByText('复制后不会继承原检测服务绑定，请在新BOM中重新关联。')).toBeInTheDocument()
  })

  it('disables confirmation when the original BOM has no material rows', () => {
    render(
      <BOMCopyModal
        open
        editingId="bom-empty"
        copyForm={{ name: '空BOM 副本', copyInfo: true, copyMaterials: true }}
        data={[{ ...bom, id: 'bom-empty', materialCount: 0, materials: [] }]}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('原BOM缺少物料清单，不能复制。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认复制' })).toBeDisabled()
  })
})
