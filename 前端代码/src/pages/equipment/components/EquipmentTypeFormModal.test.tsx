import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import EquipmentTypeFormModal from './EquipmentTypeFormModal'
import type { EquipmentTypeForm } from '../hooks/useEquipmentTypePage'

const form: EquipmentTypeForm = {
  code: 'EQT-LOCKED',
  name: '染色设备',
  description: '',
  status: 'inactive',
  defaultPurchasePrice: 100000,
  defaultDepreciableLifeYears: 5,
  defaultValue: 10000,
  defaultDepreciationMethod: 'straight_line',
  defaultTotalCapacity: 0,
  defaultCapacityUnit: 'minutes',
}

describe('EquipmentTypeFormModal', () => {
  it('keeps backend-controlled type code read-only while editing and shows status', () => {
    render(
      <EquipmentTypeFormModal
        open
        type="edit"
        form={form}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.getByRole('dialog', { name: '编辑设备类型' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('EQT-LOCKED')).toHaveAttribute('readonly')
    expect(screen.getByText('禁用')).toBeInTheDocument()
  })
})
