import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StocktakingAdjustModal, STOCKTAKING_REASON_OPTIONS } from './StocktakingAdjustModal'
import type { StocktakingRecord } from '../hooks/useStocktakingPage'

const row: StocktakingRecord = {
  id: 'st-001',
  stocktakingNo: 'ST-001',
  materialId: 'mat-001',
  materialName: '测试物料',
  materialCode: 'MAT-001',
  materialUnit: '瓶',
  systemStock: 10,
  actualStock: 8,
  difference: -2,
  operator: 'admin',
  status: 'completed',
  createdAt: '2026-06-20T10:00:00Z',
}

const scopedRow: StocktakingRecord = {
  ...row,
  id: 'st-002',
  stocktakingNo: 'ST-002',
  materialName: '青霉素钠',
  materialCode: 'MED-001',
  materialUnit: '瓶',
  locationId: 'loc-01',
  locationName: '常温库-A1',
  batchId: 'batch-01',
  batchNo: 'BATCH-202606',
  systemStock: 10,
  actualStock: 7,
  difference: -3,
}

describe('StocktakingAdjustModal', () => {
  it('submits a canonical stocktaking reason code and trimmed remark', () => {
    const onConfirm = vi.fn()
    render(
      <StocktakingAdjustModal
        open
        row={row}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    )

    expect(STOCKTAKING_REASON_OPTIONS.map(option => option.value)).toEqual([
      '',
      'normal',
      'record',
      'physical',
      'other',
    ])

    fireEvent.click(screen.getByText('选择原因'))
    fireEvent.click(screen.getByTestId('option-physical'))
    fireEvent.change(screen.getByPlaceholderText('请输入处理说明（选填）'), {
      target: { value: '  月末复核  ' },
    })
    fireEvent.click(screen.getByRole('button', { name: /确认调整/ }))

    expect(onConfirm).toHaveBeenCalledWith({
      reason: 'physical',
      remark: '月末复核',
    })
  })

  it('shows the downstream adjustment facts before confirming a stocktaking difference', () => {
    render(
      <StocktakingAdjustModal
        open
        row={scopedRow}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('调整结果确认')).toBeInTheDocument()
    expect(screen.getByText('ST-002')).toBeInTheDocument()
    expect(screen.getByText('青霉素钠')).toBeInTheDocument()
    expect(screen.getByText('常温库-A1')).toBeInTheDocument()
    expect(screen.getByText('BATCH-202606')).toBeInTheDocument()
    expect(screen.getByText('10瓶')).toBeInTheDocument()
    expect(screen.getByText('7瓶')).toBeInTheDocument()
    expect(screen.getAllByText('-3瓶').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText((content) => content.includes('库存、批次、库位、库存流水、审计记录'))).toBeInTheDocument()
  })

  it('blocks adjustment confirmation until a difference reason is selected', () => {
    const onConfirm = vi.fn()
    render(
      <StocktakingAdjustModal
        open
        row={scopedRow}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />
    )

    expect(screen.getByText('请选择差异原因，系统才能记录库存调整原因并形成审计证据。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /确认调整/ })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /确认调整/ }))

    expect(onConfirm).not.toHaveBeenCalled()
  })
})
