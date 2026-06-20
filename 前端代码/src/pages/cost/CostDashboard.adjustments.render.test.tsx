import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { abcApi } from '@/api/abc'
import { reportsApi } from '@/api/reports'
import CostDashboard from './CostDashboard'

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Pie: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Cell: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
}))

vi.mock('@/api/abc', () => ({
  abcApi: {
    getDashboard: vi.fn(),
    getPeriods: vi.fn(),
    getCostRuns: vi.fn(),
    getAdjustments: vi.fn(),
    approveAdjustment: vi.fn(),
    rejectAdjustment: vi.fn(),
    createAdjustment: vi.fn(),
  },
}))

vi.mock('@/api/reports', () => ({
  reportsApi: {
    getCostMonthlyComparison: vi.fn(),
  },
}))

const dashboardResponse = {
  summary: {
    totalCost: 100,
    totalFee: 180,
    totalProfit: 80,
    profitRate: 0.44,
    caseCount: 1,
    sampleCount: 1,
    materialCost: 60,
    activityCost: 40,
    adjustmentAmount: 0,
    pendingAdjustmentCount: 1,
    costChange: 0,
    feeChange: 0,
    profitChange: 0,
  },
  profitByProject: [],
  costByActivity: [],
  alerts: [],
}

const periodResponse = {
  list: [{ id: 'period-1', yearMonth: '2026-06', status: 'calculated' }],
}

const emptyListResponse = { list: [] }

describe('CostDashboard adjustment refresh', () => {
  beforeEach(() => {
    window.localStorage.setItem('user', JSON.stringify({ role: 'finance', username: 'sunli' }))
    vi.mocked(abcApi.getDashboard).mockReset()
    vi.mocked(abcApi.getPeriods).mockReset()
    vi.mocked(abcApi.getCostRuns).mockReset()
    vi.mocked(abcApi.getAdjustments).mockReset()
    vi.mocked(abcApi.approveAdjustment).mockReset()
    vi.mocked(abcApi.rejectAdjustment).mockReset()
    vi.mocked(abcApi.createAdjustment).mockReset()
    vi.mocked(reportsApi.getCostMonthlyComparison).mockReset()
  })

  it('marks an approved adjustment as handled even if the follow-up dashboard refresh fails', async () => {
    vi.mocked(abcApi.getDashboard)
      .mockResolvedValueOnce(dashboardResponse)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(abcApi.getPeriods).mockResolvedValue(periodResponse)
    vi.mocked(abcApi.getCostRuns).mockResolvedValue(emptyListResponse)
    vi.mocked(abcApi.getAdjustments).mockResolvedValue({
      list: [
        {
          id: 'adjustment-1',
          adjustmentNo: 'ADJ-209906-001',
          yearMonth: '2026-06',
          adjustmentType: 'closed_period_adjustment',
          amount: 128,
          reason: '财务复核调整',
          status: 'pending',
          submittedBy: 'admin',
        },
      ],
    })
    vi.mocked(abcApi.approveAdjustment).mockResolvedValue({
      id: 'adjustment-1',
      adjustmentNo: 'ADJ-209906-001',
      yearMonth: '2026-06',
      adjustmentType: 'closed_period_adjustment',
      amount: 128,
      reason: '财务复核调整',
      status: 'approved',
      submittedBy: 'admin',
      reviewedBy: 'sunli',
    })
    vi.mocked(reportsApi.getCostMonthlyComparison).mockResolvedValue(null)

    render(
      <MemoryRouter>
        <CostDashboard />
      </MemoryRouter>
    )

    expect(await screen.findByText('ADJ-209906-001')).toBeInTheDocument()
    expect(screen.getByText('待审核')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /通过/ }))

    await waitFor(() => expect(abcApi.approveAdjustment).toHaveBeenCalledWith('adjustment-1', { remark: '成本看板审核' }))
    await waitFor(() => {
      expect(screen.queryByText('待审核')).not.toBeInTheDocument()
      expect(screen.getByText('已通过')).toBeInTheDocument()
      expect(screen.getByText('sunli')).toBeInTheDocument()
    })
  })

  it('keeps a newly created adjustment visible if the follow-up dashboard refresh fails', async () => {
    vi.mocked(abcApi.getDashboard)
      .mockResolvedValueOnce({
        ...dashboardResponse,
        summary: {
          ...dashboardResponse.summary,
          pendingAdjustmentCount: 0,
        },
      })
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(abcApi.getPeriods).mockResolvedValue({
      list: [{ id: 'period-1', yearMonth: '2026-06', status: 'closed' }],
    })
    vi.mocked(abcApi.getCostRuns).mockResolvedValue(emptyListResponse)
    vi.mocked(abcApi.getAdjustments).mockResolvedValue(emptyListResponse)
    vi.mocked(abcApi.createAdjustment).mockResolvedValue({
      id: 'adjustment-created',
      adjustmentNo: 'ADJ-209906-002',
      yearMonth: '2026-06',
      adjustmentType: 'closed_period_adjustment',
      amount: 256,
      reason: '关账后折旧补差',
      status: 'pending',
      submittedBy: 'sunli',
    })
    vi.mocked(reportsApi.getCostMonthlyComparison).mockResolvedValue(null)

    render(
      <MemoryRouter>
        <CostDashboard />
      </MemoryRouter>
    )

    expect(await screen.findByRole('button', { name: /^调整单$/ })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: /^调整单$/ }))
    fireEvent.change(screen.getByPlaceholderText('正数增加成本，负数冲减成本'), { target: { value: '256' } })
    fireEvent.change(screen.getByPlaceholderText('例如：关账后发现设备折旧分摊差异，经财务复核调整'), {
      target: { value: '关账后折旧补差' },
    })
    fireEvent.click(screen.getByRole('button', { name: '提交调整单' }))

    await waitFor(() => expect(abcApi.createAdjustment).toHaveBeenCalledWith({
      yearMonth: '2026-06',
      adjustmentType: 'closed_period_adjustment',
      amount: 256,
      reason: '关账后折旧补差',
    }))
    await waitFor(() => {
      expect(screen.getByText('ADJ-209906-002')).toBeInTheDocument()
      expect(screen.getByText('待审核')).toBeInTheDocument()
      expect(screen.getByText('关账后折旧补差')).toBeInTheDocument()
      expect(screen.getByText('sunli')).toBeInTheDocument()
      expect(screen.getByText(/\/ 1$/)).toBeInTheDocument()
    })
  })
})
