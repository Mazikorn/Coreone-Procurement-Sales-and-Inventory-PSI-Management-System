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

  it('confirms export scope and evidence handoff before users download an audit file', () => {
    render(
      <LogExportModal
        open
        form={{
          ...form,
          startDate: '2026-06-01',
          endDate: '2026-06-30',
          includeIP: true,
        }}
        filterSummary={['业务标识 IN-EXPORT-001', '来源 批次库位流水']}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onExport={vi.fn()}
      />,
    )

    expect(screen.getByText('导出结果确认')).toBeInTheDocument()
    expect(screen.getByText('导出后用于审计交接、问题复核和外部留痕；当前页面筛选会一起带到导出请求。')).toBeInTheDocument()
    expect(screen.getByText('筛选范围 业务标识 IN-EXPORT-001 / 来源 批次库位流水')).toBeInTheDocument()
    expect(screen.getByText('时间范围 2026-06-01 至 2026-06-30')).toBeInTheDocument()
    expect(screen.getByText('导出内容 基本信息、操作详情、IP地址和设备信息')).toBeInTheDocument()
    expect(screen.getByText('建议保留基本信息和操作详情，否则外部接收人可能无法按单号、用户和动作回看证据。')).toBeInTheDocument()
  })
})
