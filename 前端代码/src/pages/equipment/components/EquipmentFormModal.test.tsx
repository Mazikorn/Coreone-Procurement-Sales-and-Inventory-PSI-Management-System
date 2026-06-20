import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EquipmentFormModal } from './EquipmentFormModal'
import type { EquipmentForm } from '../hooks/useEquipmentPage'

const form: EquipmentForm = {
  code: 'EQ-LOCKED',
  name: '染色机',
  model: '',
  manufacturer: '',
  purchasePrice: 100000,
  purchaseDate: '2026-01-01',
  depreciableLifeYears: 5,
  residualValue: 10000,
  depreciationMethod: 'straight_line',
  totalCapacity: 0,
  capacityUnit: 'minutes',
  status: 'active',
  locationId: '',
  typeId: '',
}

describe('EquipmentFormModal', () => {
  it('keeps backend-controlled equipment code read-only while editing', () => {
    render(
      <EquipmentFormModal
        open
        type="edit"
        form={form}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.getByDisplayValue('EQ-LOCKED')).toHaveAttribute('readonly')
  })
})
