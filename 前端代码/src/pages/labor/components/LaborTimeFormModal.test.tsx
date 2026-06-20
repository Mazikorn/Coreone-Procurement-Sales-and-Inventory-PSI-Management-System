import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { LaborTimeForm } from '../hooks/useLaborTimePage'
import { LaborTimeFormModal } from './LaborTimeFormModal'

const form: LaborTimeForm = {
  stepCode: 'LAB-IHC-LOCKED',
  stepName: '抗体孵育',
  projectType: 'ihc',
  standardMinutes: 30,
  laborRatePerMinute: 2,
  isEquipmentStep: false,
  description: '',
  sortOrder: 10,
  referenceSource: 'system',
}

describe('LaborTimeFormModal', () => {
  it('keeps step code and project type read-only while editing', () => {
    render(
      <LaborTimeFormModal
        open
        type="edit"
        form={form}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    )

    expect(screen.getByDisplayValue('LAB-IHC-LOCKED')).toHaveAttribute('readonly')
    expect(screen.getByText('免疫组化')).toBeInTheDocument()
  })
})
