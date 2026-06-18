import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LogCleanModal } from './LogCleanModal'

describe('LogCleanModal', () => {
  it('requires explicit confirmation before cleaning all logs', () => {
    const onConfirm = vi.fn()
    render(
      <LogCleanModal
        open
        range="all"
        beforeDate="9999-12-31"
        onClose={vi.fn()}
        onChange={vi.fn()}
        onConfirm={onConfirm}
      />
    )

    const confirmButton = screen.getByRole('button', { name: /确认清理/i })
    expect(confirmButton).toBeDisabled()

    fireEvent.change(screen.getByPlaceholderText('清理全部日志'), { target: { value: '清理全部日志' } })
    expect(confirmButton).toBeEnabled()

    fireEvent.click(confirmButton)
    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('allows ranged log cleanup without extra phrase input', () => {
    const onConfirm = vi.fn()
    render(
      <LogCleanModal
        open
        range="90"
        beforeDate="2026-03-19"
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
