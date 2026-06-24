import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { BatchOutboundModal } from './BatchOutboundModal'

describe('BatchOutboundModal', () => {
  it('explains that batch outbound continues into registration to complete downstream facts', () => {
    render(
      <BatchOutboundModal
        open
        selectedCount={2}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('已选择 2 个批次')).toBeInTheDocument()
    expect(screen.getByText('下一步：进入出库登记，补齐检测项目、领用人和用途后再确认出库。')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：库存、批次、项目成本、项目消耗对账、审计记录')).toBeInTheDocument()
  })

  it('does not continue when no batch is selected', () => {
    const onConfirm = vi.fn()

    render(
      <BatchOutboundModal
        open
        selectedCount={0}
        onClose={vi.fn()}
        onConfirm={onConfirm}
      />,
    )

    expect(screen.getByText('请先在库存列表勾选需要出库的批次。')).toBeInTheDocument()
    const confirmButton = screen.getByTestId('batch-outbound-confirm-btn')
    expect(confirmButton).toBeDisabled()

    fireEvent.click(confirmButton)

    expect(onConfirm).not.toHaveBeenCalled()
  })
})
