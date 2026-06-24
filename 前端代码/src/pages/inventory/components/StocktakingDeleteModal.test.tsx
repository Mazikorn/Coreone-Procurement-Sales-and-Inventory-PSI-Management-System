import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { StocktakingDeleteModal } from './StocktakingDeleteModal'
import type { StocktakingRecord } from '../hooks/useStocktakingPage'

const baseRecord: StocktakingRecord = {
  id: 'stk-delete-1',
  stocktakingNo: 'ST-DELETE-001',
  materialId: 'mat-1',
  materialName: '苏木素',
  materialUnit: '瓶',
  systemStock: 5,
  actualStock: 3,
  difference: -2,
  status: 'completed',
  operator: '王库管',
  createdAt: '2026-06-23T10:00:00.000Z',
}

describe('StocktakingDeleteModal', () => {
  it('explains that withdrawing an unconfirmed stocktaking does not change inventory facts', () => {
    render(
      <StocktakingDeleteModal
        open
        row={baseRecord}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('撤销影响确认')).toBeInTheDocument()
    expect(screen.getByText('该盘点尚未确认，撤销只关闭差异记录，不会改动库存、批次、预警或成本。')).toBeInTheDocument()
    expect(screen.getByText('审计记录可按单号回看。')).toBeInTheDocument()
    expect(screen.queryByText('撤销后库存将自动回滚到盘点前状态。')).not.toBeInTheDocument()
  })

  it('explains rollback impact when withdrawing a confirmed stocktaking', () => {
    render(
      <StocktakingDeleteModal
        open
        row={{ ...baseRecord, status: 'confirmed' }}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('撤销影响确认')).toBeInTheDocument()
    expect(screen.getByText('撤销后会回退已确认的库存、库位/批次、预警和库存流水。')).toBeInTheDocument()
    expect(screen.getByText('审计记录可按单号回看。')).toBeInTheDocument()
  })
})
