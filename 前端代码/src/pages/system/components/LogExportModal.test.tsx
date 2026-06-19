import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LogExportModal } from './LogExportModal'
import type { LogFormData } from '../hooks/useLogsPage'

const form: LogFormData = {
  startDate: '2026-06-30',
  endDate: '2026-06-01',
  format: 'csv',
  includeBasic: true,
  includeDetail: true,
  includeIP: false,
  includeDiff: false,
}

describe('LogExportModal', () => {
  it('shows a visible date range validation error before exporting logs', () => {
    render(
      <LogExportModal
        open
        form={form}
        dateError="开始日期不能晚于结束日期"
        onClose={vi.fn()}
        onChange={vi.fn()}
        onExport={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('开始日期不能晚于结束日期')
    const dateInputs = screen.getAllByDisplayValue(/2026-06-/)
    expect(dateInputs).toHaveLength(2)
    expect(dateInputs[0]).toHaveAttribute('aria-invalid', 'true')
    expect(dateInputs[1]).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows a visible content validation error before exporting an empty log file', () => {
    render(
      <LogExportModal
        open
        form={{
          ...form,
          startDate: '2026-06-01',
          endDate: '2026-06-30',
          includeBasic: false,
          includeDetail: false,
          includeIP: false,
          includeDiff: false,
        }}
        contentError="请至少选择一项导出内容"
        onClose={vi.fn()}
        onChange={vi.fn()}
        onExport={vi.fn()}
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('请至少选择一项导出内容')
  })
})
