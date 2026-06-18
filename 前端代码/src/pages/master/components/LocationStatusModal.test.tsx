import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LocationStatusModal } from './LocationStatusModal'
import type { Location, LocationStatusCheck } from '@/types'

const location: Location = {
  id: 'loc-1',
  code: 'LOC-001',
  name: '一号库位',
  type: 'shelf',
  zone: 'A区',
  capacity: 100,
  used: 0,
  status: 'active',
  createdAt: '2026-06-18',
}

describe('LocationStatusModal', () => {
  it('shows blocking impacts and disables confirm when location has inventory location stock', () => {
    const statusCheck: LocationStatusCheck = {
      location: { id: 'loc-1', code: 'LOC-001', name: '一号库位' },
      targetStatus: 'inactive',
      canChange: false,
      impacts: {
        activeChildLocationCount: 0,
        activeMaterialCount: 0,
        inventoryCount: 0,
        inventoryLocationCount: 1,
      },
      reasons: ['存在 1 条多库位库存明细引用'],
    }

    render(
      <LocationStatusModal
        open
        target={location}
        targetStatus="inactive"
        statusCheck={statusCheck}
        checkingStatus={false}
        updatingStatus={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('无法停用库位')).toBeInTheDocument()
    expect(screen.getByText('库位库存')).toBeInTheDocument()
    expect(screen.getByText('存在 1 条多库位库存明细引用，请先解除引用后再停用。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认停用' })).toBeDisabled()
  })
})
