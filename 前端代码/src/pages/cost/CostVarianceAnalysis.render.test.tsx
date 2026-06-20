import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { abcApi } from '@/api/abc'
import { reportsApi } from '@/api/reports'
import CostVarianceAnalysis from './CostVarianceAnalysis'

vi.mock('@/api/abc', () => ({
  abcApi: {
    getVarianceAnalysis: vi.fn(),
  },
}))

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
    vi.mocked(abcApi.getVarianceAnalysis).mockReset()
    vi.mocked(reportsApi.getCostVariance).mockReset()
    vi.mocked(abcApi.getVarianceAnalysis).mockResolvedValue({
      summary: { totalActual: 0, totalStandard: 0, totalVariance: 0, varianceRate: 0 },
      list: [],
    })
    vi.mocked(reportsApi.getCostVariance).mockResolvedValue({ summary: null, items: [] })
  })

  it('shows a visible month range validation error before requesting reversed report dates', async () => {
    const { container } = render(<CostVarianceAnalysis />)
    await waitFor(() => expect(abcApi.getVarianceAnalysis).toHaveBeenCalled())

    const [startInput, endInput] = Array.from(container.querySelectorAll('input[type="month"]'))
    fireEvent.change(startInput, { target: { value: '2026-07' } })
    fireEvent.change(endInput, { target: { value: '2026-06' } })

    expect(screen.getByText('开始月份不能晚于结束月份')).toBeInTheDocument()
    await waitFor(() => {
      expect(abcApi.getVarianceAnalysis).not.toHaveBeenCalledWith(expect.objectContaining({
        startDate: '2026-07-01',
        endDate: '2026-06-28',
      }))
    })
  })

  it('loads current ABC variance data and renders list rows from the list contract', async () => {
    vi.mocked(abcApi.getVarianceAnalysis).mockResolvedValueOnce({
      summary: { totalActual: 1200, totalStandard: 1000, totalVariance: 200, varianceRate: 20 },
      list: [
        {
          projectId: 'project-1',
          projectName: '胃癌筛查项目',
          materialActual: 1000,
          materialStandard: 1000,
          laborActual: 0,
          laborStandard: 0,
          equipmentActual: 0,
          equipmentStandard: 0,
          qcActual: 0,
          indirectActual: 200,
          indirectStandard: 0,
          totalActual: 1200,
          totalStandard: 1000,
          totalVariance: 200,
          varianceRate: 20,
          sampleCount: 5,
          month: '2026-06',
        },
      ],
    })

    render(<CostVarianceAnalysis />)

    expect(await screen.findByText('胃癌筛查项目')).toBeInTheDocument()
    expect(screen.getByText('+20.00%')).toBeInTheDocument()
    await waitFor(() => {
      expect(abcApi.getVarianceAnalysis).toHaveBeenCalledWith(expect.objectContaining({
        compareType: 'project',
      }))
    })
    expect(reportsApi.getCostVariance).not.toHaveBeenCalled()
  })

  it('uses the supported BOM variance dimension instead of the legacy material dimension', async () => {
    vi.mocked(abcApi.getVarianceAnalysis)
      .mockResolvedValueOnce({
        summary: { totalActual: 0, totalStandard: 0, totalVariance: 0, varianceRate: 0 },
        list: [],
      })
      .mockResolvedValueOnce({
        summary: { totalActual: 850, totalStandard: 800, totalVariance: 50, varianceRate: 6.25 },
        list: [
          {
            id: 'bom-1',
            bomId: 'bom-1',
            bomName: 'HE染色BOM',
            projectId: 'project-1',
            projectName: '不应作为BOM维度主标签',
            materialActual: 800,
            materialStandard: 800,
            laborActual: 0,
            laborStandard: 0,
            equipmentActual: 0,
            equipmentStandard: 0,
            qcActual: 0,
            indirectActual: 50,
            indirectStandard: 0,
            totalActual: 850,
            totalStandard: 800,
            totalVariance: 50,
            varianceRate: 6.25,
            sampleCount: 8,
            month: '2026-06',
          },
        ],
      })

    const { container } = render(<CostVarianceAnalysis />)
    await waitFor(() => expect(abcApi.getVarianceAnalysis).toHaveBeenCalledTimes(1))

    fireEvent.change(container.querySelector('select') as HTMLSelectElement, { target: { value: 'bom' } })

    expect(await screen.findByText('HE染色BOM')).toBeInTheDocument()
    expect(screen.queryByText('不应作为BOM维度主标签')).not.toBeInTheDocument()
    await waitFor(() => {
      expect(abcApi.getVarianceAnalysis).toHaveBeenLastCalledWith(expect.objectContaining({
        compareType: 'bom',
      }))
    })
  })
})
