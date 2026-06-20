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
})
