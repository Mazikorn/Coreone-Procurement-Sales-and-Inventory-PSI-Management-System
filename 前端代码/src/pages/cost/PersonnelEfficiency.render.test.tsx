import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reportsApi } from '@/api/reports'
import PersonnelEfficiency from './PersonnelEfficiency'

vi.mock('@/api/reports', () => ({
  reportsApi: {
    getPersonnelEfficiency: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

vi.mock('recharts', () => {
  const passthrough = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>
  return {
    LineChart: passthrough,
    Line: () => <div />,
    BarChart: passthrough,
    Bar: () => <div />,
    XAxis: () => <div />,
    YAxis: () => <div />,
    CartesianGrid: () => <div />,
    Tooltip: () => <div />,
    Legend: () => <div />,
    ResponsiveContainer: passthrough,
  }
})

describe('PersonnelEfficiency', () => {
  beforeEach(() => {
    vi.mocked(reportsApi.getPersonnelEfficiency).mockReset()
  })

  it('uses backend summary instead of recalculating report totals from ranking rows', async () => {
    vi.mocked(reportsApi.getPersonnelEfficiency).mockResolvedValue({
      summary: {
        personCount: 3,
        totalOutput: 20,
        totalLaborCost: 999,
        totalStandardHours: 12.5,
        avgEfficiency: 1.23,
        costPerOutput: 49.95,
      },
      ranking: [
        {
          id: 'tech-a',
          name: '技术员A',
          role: 'technician',
          efficiency: 0.5,
          totalCost: 100,
          outputCount: 5,
          standardHours: 1,
          outputPerHour: 5,
          costPerOutput: 20,
        },
      ],
      trend: [],
    } as any)

    render(<PersonnelEfficiency />)

    await waitFor(() => expect(reportsApi.getPersonnelEfficiency).toHaveBeenCalledWith({
      timeRange: '6m',
      role: 'all',
    }))

    expect(screen.getByText('人员数量').parentElement).toHaveTextContent('3')
    expect(screen.getByText('平均效率').parentElement).toHaveTextContent('1.23')
    expect(screen.getByText('总人工成本').parentElement).toHaveTextContent('¥999.00')
    expect(screen.getByText('总人工成本').parentElement).not.toHaveTextContent('¥100.00')
    expect(screen.getByText('单位产出成本').parentElement).toHaveTextContent('¥49.95')
  })
})
