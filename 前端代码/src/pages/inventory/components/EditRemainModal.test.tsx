import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { EditRemainModal } from './EditRemainModal'

describe('EditRemainModal', () => {
  it('summarizes remaining adjustment and downstream chains before saving', () => {
    render(
      <EditRemainModal
        open
        item={{
          id: 'tracking-1',
          materialName: 'DAB染色液',
          spec: '1ml',
          batch: 'BATCH-DPL-001',
          totalQty: 10,
          remaining: 3,
          unit: 'ml',
        }}
        remainValue="2.5"
        reason="现场复核后修正"
        onClose={vi.fn()}
        onChangeValue={vi.fn()}
        onChangeReason={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('剩余量调整确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：使用中记录、批次、剩余量、耗材消耗、审计记录')).toBeInTheDocument()
    expect(screen.getByText('当前剩余 3 ml')).toBeInTheDocument()
    expect(screen.getByText('调整后剩余 2.5 ml')).toBeInTheDocument()
    expect(screen.getByText('已用量 7.5 ml')).toBeInTheDocument()
  })

  it('does not treat an empty remaining value as zero in the confirmation', () => {
    render(
      <EditRemainModal
        open
        item={{
          id: 'tracking-1',
          materialName: 'DAB染色液',
          spec: '1ml',
          batch: 'BATCH-DPL-001',
          totalQty: 10,
          remaining: 3,
          unit: 'ml',
        }}
        remainValue=""
        reason=""
        onClose={vi.fn()}
        onChangeValue={vi.fn()}
        onChangeReason={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('调整后剩余 待填写')).toBeInTheDocument()
    expect(screen.getByText('已用量 待填写')).toBeInTheDocument()
  })

  it('blocks saving until an adjustment reason is provided', () => {
    const onConfirm = vi.fn()
    render(
      <EditRemainModal
        open
        item={{
          id: 'tracking-1',
          materialName: 'DAB染色液',
          spec: '1ml',
          batch: 'BATCH-DPL-001',
          totalQty: 10,
          remaining: 3,
          unit: 'ml',
        }}
        remainValue="2.5"
        reason=""
        onClose={vi.fn()}
        onChangeValue={vi.fn()}
        onChangeReason={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByText('请填写调整原因，系统才能解释剩余量修正并形成审计记录。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    expect(onConfirm).not.toHaveBeenCalled()
  })
})
