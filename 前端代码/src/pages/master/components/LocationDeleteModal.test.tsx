import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Location, LocationDeleteCheck } from '@/types'
import { LocationDeleteModal } from './LocationDeleteModal'

const location: Location = {
  id: 'loc-1',
  code: 'LOC-001',
  name: '冷藏库位',
  type: 'shelf',
  parentId: null,
  zone: 'A区',
  shelf: '01架',
  position: '02位',
  capacity: 100,
  used: 0,
  status: 'active',
  createdAt: '2026-06-23',
}

describe('LocationDeleteModal', () => {
  it('explains downstream business impact before deleting an unreferenced location', () => {
    const deleteCheck: LocationDeleteCheck = {
      location: { id: 'loc-1', code: 'LOC-001', name: '冷藏库位' },
      deletable: true,
      impacts: {
        childLocationCount: 0,
        materialCount: 0,
        inventoryCount: 0,
        inventoryLocationCount: 0,
        inboundCount: 0,
        transferCount: 0,
      },
      reasons: [],
    }

    render(
      <LocationDeleteModal
        open
        target={location}
        deleteCheck={deleteCheck}
        checkingDelete={false}
        deleting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('确定要删除该库位吗？')).toBeInTheDocument()
    expect(screen.getByText('未发现业务引用，可以删除；删除后该库位不会再用于新物料默认库位、入库上架、库存批次、调拨、盘点、预警和审计筛选。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认删除' })).toBeEnabled()
  })
})
