import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LogsTable } from './LogsTable'

const noop = vi.fn()

const baseProps = {
  data: [],
  loading: false,
  total: 0,
  page: 1,
  pageSize: 20,
  keyword: '',
  typeFilter: '',
  moduleFilter: '',
  userFilter: '',
  startDate: '2026-06-30',
  endDate: '2026-06-01',
  logTypes: [],
  modules: [{ value: '', label: '全部模块' }],
  users: [{ value: '', label: '全部用户' }],
  getLogType: () => ({ value: 'other', label: '操作', className: 'bg-gray-100 text-gray-600' }),
  getAvatarChar: () => '?',
  getModuleLabel: () => '系统',
  onKeywordChange: noop,
  onTypeFilterChange: noop,
  onModuleFilterChange: noop,
  onUserFilterChange: noop,
  onStartDateChange: noop,
  onEndDateChange: noop,
  onSearch: noop,
  onReset: noop,
  onPageChange: noop,
  onPageSizeChange: noop,
  onOpenDetail: noop,
}

describe('LogsTable', () => {
  it('shows a visible date range validation error before users read an empty log list as fact', () => {
    render(
      <LogsTable
        {...baseProps}
        dateError="开始日期不能晚于结束日期"
      />,
    )

    expect(screen.getByRole('alert')).toHaveTextContent('开始日期不能晚于结束日期')
    const dateInputs = screen.getAllByDisplayValue(/2026-06-/)
    expect(dateInputs).toHaveLength(2)
    expect(dateInputs[0]).toHaveAttribute('aria-invalid', 'true')
    expect(dateInputs[1]).toHaveAttribute('aria-invalid', 'true')
  })
})
