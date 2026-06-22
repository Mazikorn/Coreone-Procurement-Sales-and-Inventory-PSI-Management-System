import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DepletionTab } from './DepletionTab'

const item = {
  id: 'tracking-1',
  materialName: 'DAB染色液',
  spec: '1ml',
  batch: 'BATCH-DPL-001',
  status: 'in-use',
  totalQty: 10,
  remaining: 3,
  unit: 'ml',
  daysUsed: 5,
  expectedDays: 12,
  progress: 70,
}

describe('DepletionTab', () => {
  it('shows depletion tracking records without execution buttons for read-only viewers', () => {
    render(
      <DepletionTab
        items={[item]}
        canManage={false}
        onEditRemain={vi.fn()}
        onConfirmDeplete={vi.fn()}
      />
    )

    expect(screen.getByText('DAB染色液')).toBeInTheDocument()
    expect(screen.getByText(/批次: BATCH-DPL-001/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '修改剩余量' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '确认耗尽' })).not.toBeInTheDocument()
  })
})
