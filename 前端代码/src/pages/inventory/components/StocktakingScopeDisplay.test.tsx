import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
}

describe('Stocktaking scope display', () => {
  it('shows batch-location scope in the stocktaking table', () => {
    render(
      <MemoryRouter>
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
      </MemoryRouter>
    )

    expect(screen.getByText('批次库位')).toBeInTheDocument()
    expect(screen.getByText('A1-01 / B-001')).toBeInTheDocument()
    expect(screen.getByText('-1瓶')).toBeInTheDocument()
    expect(screen.getByText('待处理差异')).toBeInTheDocument()
  })

  it('shows batch and location facts in the detail modal', () => {
    render(
      <MemoryRouter>
        <StocktakingDetailModal
          open
          row={scopedRecord}
          onClose={vi.fn()}
          onAdjust={vi.fn()}
        />
      </MemoryRouter>
    )

    expect(screen.getByText('批次库位')).toBeInTheDocument()
    expect(screen.getAllByText('A1-01').length).toBeGreaterThan(0)
    expect(screen.getAllByText('B-001').length).toBeGreaterThan(0)
    expect(screen.getByText('-1')).toBeInTheDocument()
    expect(screen.getByText('待处理差异')).toBeInTheDocument()
    expect(screen.getByText('库存尚未调整')).toBeInTheDocument()
  })

  it('opens unified audit evidence from stocktaking detail', () => {
    render(
      <MemoryRouter initialEntries={['/stocktaking']}>
        <StocktakingDetailModal
          open
          row={{ ...scopedRecord, status: 'confirmed' }}
          onClose={vi.fn()}
          onAdjust={vi.fn()}
        />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: '审计证据' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/logs?keyword=${encodeURIComponent(scopedRecord.stocktakingNo)}`,
    )
  })

  it('opens unified audit evidence from a stocktaking record row', () => {
    render(
      <MemoryRouter initialEntries={['/stocktaking']}>
        <StocktakingTable
          data={[{ ...scopedRecord, status: 'confirmed' }]}
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
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: '审计证据' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      `/logs?keyword=${encodeURIComponent(scopedRecord.stocktakingNo)}`,
    )
  })
})
