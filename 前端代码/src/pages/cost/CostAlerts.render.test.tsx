import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { abcApi } from '@/api/abc'
import CostAlerts from './CostAlerts'

vi.mock('@/api/abc', () => ({
  abcApi: {
    getExceptions: vi.fn(),
    resolveException: vi.fn(),
    ignoreException: vi.fn(),
    retryException: vi.fn(),
  },
}))

describe('CostAlerts page state', () => {
  beforeEach(() => {
    vi.mocked(abcApi.getExceptions).mockReset()
  })

  it('loads exception records from audit deep link keyword on first render', async () => {
    vi.mocked(abcApi.getExceptions).mockResolvedValueOnce({
      list: [
        {
          id: 'exception-deep-link-1',
          exceptionNo: 'CE-AUDIT-DEEP-001',
          exceptionType: 'missing_fee_mapping',
          outboundNo: 'OUT-AUDIT-DEEP-001',
          projectName: '免疫组化项目',
          severity: 'error',
          status: 'open',
          message: 'BOM 未配置收费映射',
          retryCount: 0,
          outboundId: 'outbound-deep-link-1',
          createdAt: '2026-06-20T00:00:00Z',
        },
      ],
      summary: {
        total: 1,
        status: { open: 1, resolved: 0, ignored: 0 },
        severity: { error: 1, warning: 0, info: 0 },
      },
      pagination: { total: 1 },
    })

    render(
      <MemoryRouter initialEntries={['/abc/alerts?keyword=CE-AUDIT-DEEP-001']}>
        <CostAlerts />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(abcApi.getExceptions).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'CE-AUDIT-DEEP-001',
        page: 1,
        pageSize: 20,
      }))
    })
    expect(screen.getByPlaceholderText('异常编号、出库单、项目')).toHaveValue('CE-AUDIT-DEEP-001')
    expect(await screen.findByText('CE-AUDIT-DEEP-001')).toBeInTheDocument()
    expect(screen.getByText('BOM 未配置收费映射')).toBeInTheDocument()
  })

  it('clears stale exception rows and summary when refresh fails', async () => {
    vi.mocked(abcApi.getExceptions)
      .mockResolvedValueOnce({
        list: [
          {
            id: 'exception-1',
            exceptionNo: 'CE-STALE',
            exceptionType: 'abc_calculation_failed',
            outboundNo: 'OUT-STALE',
            projectName: '胃癌筛查项目',
            severity: 'error',
            status: 'open',
            message: '旧异常不能残留',
            retryCount: 0,
            outboundId: 'outbound-1',
            createdAt: '2026-06-20T00:00:00Z',
          },
        ],
        summary: {
          total: 1,
          status: { open: 1, resolved: 0, ignored: 0 },
          severity: { error: 1, warning: 0, info: 0 },
        },
        pagination: { total: 1 },
      })
      .mockRejectedValueOnce(new Error('network down'))

    render(
      <MemoryRouter>
        <CostAlerts />
      </MemoryRouter>
    )

    expect(await screen.findByText('CE-STALE')).toBeInTheDocument()
    expect(screen.getByText('旧异常不能残留')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /刷新/ }))

    await waitFor(() => expect(abcApi.getExceptions).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(screen.queryByText('CE-STALE')).not.toBeInTheDocument()
      expect(screen.queryByText('旧异常不能残留')).not.toBeInTheDocument()
      expect(screen.getByText('暂无成本异常')).toBeInTheDocument()
    })
    const summaryCards = screen.getAllByText('0')
    expect(summaryCards.length).toBeGreaterThanOrEqual(4)
  })
})
