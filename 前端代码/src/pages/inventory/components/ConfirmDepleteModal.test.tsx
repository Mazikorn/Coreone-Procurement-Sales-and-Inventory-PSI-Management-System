import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmDepleteModal } from './ConfirmDepleteModal'

describe('ConfirmDepleteModal', () => {
  it('summarizes depletion result and downstream chains before confirming', () => {
    render(
      <ConfirmDepleteModal
        open
        item={{
          id: 'tracking-1',
          materialName: 'DAB染色液',
          spec: '1ml',
          batch: 'BATCH-DPL-001',
          remaining: 3,
          unit: 'ml',
        }}
        depleteType="abnormal"
        remainValue="0.5"
        expiredReason="污染废弃"
        expiredRemark=""
        onClose={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRemainValue={vi.fn()}
        onChangeExpiredReason={vi.fn()}
        onChangeExpiredRemark={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('耗尽结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：使用中记录、批次、耗尽记录、库存状态、审计记录')).toBeInTheDocument()
    expect(screen.getByText('当前剩余 3 ml')).toBeInTheDocument()
    expect(screen.getByText('实际剩余 0.5 ml')).toBeInTheDocument()
    expect(screen.getByText('耗尽类型 异常耗尽')).toBeInTheDocument()
  })

  it('does not treat an empty remaining value as zero in the confirmation', () => {
    render(
      <ConfirmDepleteModal
        open
        item={{
          id: 'tracking-1',
          materialName: 'DAB染色液',
          spec: '1ml',
          batch: 'BATCH-DPL-001',
          remaining: 3,
          unit: 'ml',
        }}
        depleteType="normal"
        remainValue=""
        expiredReason=""
        expiredRemark=""
        onClose={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRemainValue={vi.fn()}
        onChangeExpiredReason={vi.fn()}
        onChangeExpiredRemark={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('实际剩余 待填写')).toBeInTheDocument()
  })

  it('blocks abnormal depletion confirmation until a reason is provided', () => {
    render(
      <ConfirmDepleteModal
        open
        item={{
          id: 'tracking-1',
          materialName: 'DAB染色液',
          spec: '1ml',
          batch: 'BATCH-DPL-001',
          remaining: 3,
          unit: 'ml',
        }}
        depleteType="abnormal"
        remainValue="0"
        expiredReason=""
        expiredRemark=""
        onClose={vi.fn()}
        onChangeType={vi.fn()}
        onChangeRemainValue={vi.fn()}
        onChangeExpiredReason={vi.fn()}
        onChangeExpiredRemark={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('请填写耗尽原因，系统才能解释异常耗尽并形成审计记录。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认耗尽' })).toBeDisabled()
  })
})
