import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reportsApi } from '@/api/reports'
import CostVarianceAnalysis from './CostVarianceAnalysis'

vi.mock('@/api/reports', () => ({
  reportsApi: {
    getCostVariance: vi.fn(),
  },
}))

vi.mock('recharts', () => {
  const passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    BarChart: passthrough,
    Bar: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    CartesianGrid: () => <div />,
    Tooltip: () => <div />,
    ResponsiveContainer: passthrough,
    Legend: () => <div />,
    Cell: () => <div />,
    LineChart: passthrough,
    Line: () => <div />,
  }
})

describe('CostVarianceAnalysis date range validation', () => {
  beforeEach(() => {
    vi.mocked(reportsApi.getCostVariance).mockReset()
    vi.mocked(reportsApi.getCostVariance).mockResolvedValue({
      summary: { totalActual: 0, totalStandard: 0, totalVariance: 0, varianceRate: 0 },
      items: [],
    })
  })

  it('shows a visible month range validation error before requesting reversed report dates', async () => {
    const { container } = render(<CostVarianceAnalysis />)
    await waitFor(() => expect(reportsApi.getCostVariance).toHaveBeenCalled())

    const [startInput, endInput] = Array.from(container.querySelectorAll('input[type="month"]'))
    fireEvent.change(startInput, { target: { value: '2026-07' } })
    fireEvent.change(endInput, { target: { value: '2026-06' } })

    expect(screen.getByText('开始月份不能晚于结束月份')).toBeInTheDocument()
    await waitFor(() => {
      expect(reportsApi.getCostVariance).not.toHaveBeenCalledWith(expect.objectContaining({
        startDate: '2026-07-01',
        endDate: '2026-06-28',
      }))
    })
  })
})
