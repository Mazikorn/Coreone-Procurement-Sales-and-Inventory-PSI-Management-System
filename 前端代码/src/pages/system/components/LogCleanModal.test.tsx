import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LogCleanModal } from './LogCleanModal'

describe('LogCleanModal', () => {
  it('does not offer unsafe all-log cleanup', () => {
    render(
      <LogCleanModal
        open
        range="180"
        beforeDate="2025-12-19"
        onClose={vi.fn()}
        onChange={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.queryByText('全部日志')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText('清理全部日志')).not.toBeInTheDocument()
    expect(screen.getByText('将清理 2025-12-19 之前的操作日志。')).toBeInTheDocument()
    expect(screen.getByText('清理前会生成归档内容哈希和链式哈希；库存流水、批次库位流水、成本审计和对账修正等业务事实不会被清理。')).toBeInTheDocument()
  })

  it('allows retention-safe historical log cleanup without extra phrase input', () => {
    const onConfirm = vi.fn()
    render(
      <LogCleanModal
        open
        range="180"
        beforeDate="2025-12-19"
        onClose={vi.fn()}
        onChange={vi.fn()}
        onConfirm={onConfirm}
      />
    )

    const confirmButton = screen.getByRole('button', { name: /确认清理/i })
    expect(confirmButton).toBeEnabled()
    fireEvent.click(confirmButton)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })
})
