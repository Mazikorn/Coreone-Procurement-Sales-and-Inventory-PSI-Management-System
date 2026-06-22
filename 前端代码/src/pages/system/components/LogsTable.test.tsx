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
  sourceFilter: 'all',
  userFilter: '',
  startDate: '2026-06-30',
  endDate: '2026-06-01',
  logTypes: [],
  modules: [{ value: '', label: '全部模块' }],
  sources: [{ value: 'all', label: '统一审计' }],
  users: [{ value: '', label: '全部用户' }],
  getLogType: () => ({ value: 'other', label: '操作', className: 'bg-gray-100 text-gray-600' }),
  getAvatarChar: () => '?',
  getModuleLabel: () => '系统',
  getSourceLabel: () => '统一审计',
  onKeywordChange: noop,
  onTypeFilterChange: noop,
  onModuleFilterChange: noop,
  onSourceFilterChange: noop,
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
    expect(screen.getByText('审计记录')).toBeInTheDocument()
    expect(screen.getByText('暂无审计记录')).toBeInTheDocument()
    const dateInputs = screen.getAllByDisplayValue(/2026-06-/)
    expect(dateInputs).toHaveLength(2)
    expect(dateInputs[0]).toHaveAttribute('aria-invalid', 'true')
    expect(dateInputs[1]).toHaveAttribute('aria-invalid', 'true')
  })

  it('renders business document as a clickable link when audit row provides a businessUrl', () => {
    render(
      <LogsTable
        {...baseProps}
        data={[{
          id: 'log-linked-business',
          userId: 'u-1',
          username: '李仓管',
          operation: 'inbound',
          operationType: 'update',
          module: 'inbound',
          description: '批次库位增加',
          requestData: { relatedId: 'IN-LINK-001' },
          sourceType: 'batch_location',
          sourceLabel: '批次库位流水',
          businessId: 'IN-LINK-001',
          businessUrl: '/inbound?keyword=IN-LINK-001',
          auditEvent: {
            eventCode: 'batch_location.inbound.update',
            action: 'update',
            subjectType: 'inbound',
            subjectId: 'IN-LINK-001',
            businessId: 'IN-LINK-001',
            businessUrl: '/inbound?keyword=IN-LINK-001',
            actor: '李仓管',
            evidenceSource: 'batch_location_adjustments',
            summary: '批次库位增加',
          },
          ip: '',
          userAgent: '',
          createdAt: '2026-06-20 10:00:00',
        }]}
        total={1}
        dateError=""
      />,
    )

    const businessLink = screen.getByRole('link', { name: 'IN-LINK-001' })
    expect(businessLink).toHaveAttribute('href', '/inbound?keyword=IN-LINK-001')
    expect(screen.getByText('标准事件：batch_location.inbound.update')).toBeInTheDocument()
    expect(screen.getByText('证据：batch_location_adjustments')).toBeInTheDocument()
  })
})
