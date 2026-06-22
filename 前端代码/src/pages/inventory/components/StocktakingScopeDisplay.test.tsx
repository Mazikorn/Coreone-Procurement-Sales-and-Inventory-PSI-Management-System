import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StocktakingDetailModal } from './StocktakingDetailModal'
import { StocktakingTable } from './StocktakingTable'
import type { StocktakingRecord } from '../hooks/useStocktakingPage'

const scopedRecord: StocktakingRecord = {
  id: 'stocktaking-001',
  stocktakingNo: 'ST-20260620-001',
  materialId: 'mat-001',
  materialCode: 'MAT-001',
  materialName: '测试物料',
  materialUnit: '瓶',
  locationId: 'loc-001',
  locationName: 'A1-01',
  batchId: 'batch-001',
  batchNo: 'B-001',
  systemStock: 6,
  actualStock: 5,
  difference: -1,
  operator: '仓管',
  status: 'completed',
  createdAt: '2026-06-20T08:00:00.000Z',
}

describe('Stocktaking scope display', () => {
  it('shows batch-location scope in the stocktaking table', () => {
    render(
      <StocktakingTable
        data={[scopedRecord]}
        loading={false}
        total={1}
        page={1}
        pageSize={20}
        keyword=""
        statusFilter=""
        statusOptions={[{ value: '', label: '全部状态' }]}
        onKeywordChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onQuery={vi.fn()}
        onReset={vi.fn()}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        onOpenDetail={vi.fn()}
        onOpenAdjust={vi.fn()}
        onOpenDelete={vi.fn()}
      />
    )

    expect(screen.getByText('批次库位')).toBeInTheDocument()
    expect(screen.getByText('A1-01 / B-001')).toBeInTheDocument()
    expect(screen.getByText('-1瓶')).toBeInTheDocument()
  })

  it('shows batch and location facts in the detail modal', () => {
    render(
      <StocktakingDetailModal
        open
        row={scopedRecord}
        onClose={vi.fn()}
        onAdjust={vi.fn()}
      />
    )

    expect(screen.getByText('批次库位')).toBeInTheDocument()
    expect(screen.getAllByText('A1-01').length).toBeGreaterThan(0)
    expect(screen.getAllByText('B-001').length).toBeGreaterThan(0)
    expect(screen.getByText('-1')).toBeInTheDocument()
  })
})
