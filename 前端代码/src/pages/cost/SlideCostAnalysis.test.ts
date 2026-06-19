import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { abcApi } from '@/api/abc'
import { downloadTextFile } from '@/lib/utils'
import SlideCostAnalysis, { normalizeProfitabilityRows } from './SlideCostAnalysis'

vi.mock('@/api/abc', () => ({
  abcApi: {
    getProfitability: vi.fn(),
    exportData: vi.fn(),
  },
}))

vi.mock('@/lib/utils', () => ({
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' '),
  downloadTextFile: vi.fn(),
  formatCurrency: (num: number | undefined) => {
    if (num === undefined || num === null) return '-'
    return '¥' + num.toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  },
}))

describe('normalizeProfitabilityRows', () => {
  it('按月份和项目类型过滤，并保留物料/作业成本拆分', () => {
    const rows = [
      {
        outboundId: 'out-1',
        projectId: 'proj-1',
        projectName: 'HE检测',
        projectType: 'he',
        costMonth: '2026-06',
        sampleCount: 3,
        materialCost: 120,
        activityCost: 60,
        totalCost: 180,
        feeAmount: 300,
        profit: 120,
      },
      {
        outboundId: 'out-2',
        projectId: 'proj-1',
        projectName: 'HE检测',
        projectType: 'he',
        costMonth: '2026-06',
        sampleCount: 2,
        materialCost: 80,
        activityCost: 40,
        totalCost: 120,
        feeAmount: 200,
        profit: 80,
      },
      {
        outboundId: 'out-other-month',
        projectId: 'proj-1',
        projectName: 'HE检测',
        projectType: 'he',
        costMonth: '2026-05',
        sampleCount: 99,
        materialCost: 999,
        activityCost: 999,
        totalCost: 1998,
        feeAmount: 1998,
        profit: 0,
      },
      {
        outboundId: 'out-other-type',
        projectId: 'proj-2',
        projectName: 'IHC检测',
        projectType: 'ihc',
        costMonth: '2026-06',
        sampleCount: 99,
        materialCost: 999,
        activityCost: 999,
        totalCost: 1998,
        feeAmount: 1998,
        profit: 0,
      },
    ]

    const result = normalizeProfitabilityRows(rows, '2026-06', 'he')

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      bomId: 'proj-1',
      bomName: 'HE检测',
      sampleCount: 5,
      materialCost: 200,
      activityCost: 100,
      totalCost: 300,
      feeAmount: 500,
      profit: 200,
      avgCostPerSlide: 60,
      profitRate: 0.4,
    })
  })
})

describe('SlideCostAnalysis', () => {
  beforeEach(() => {
    vi.mocked(abcApi.getProfitability).mockReset()
    vi.mocked(abcApi.exportData).mockReset()
    vi.mocked(downloadTextFile).mockReset()
  })

  it('displays project type labels in the table instead of internal enum values', async () => {
    vi.mocked(abcApi.getProfitability).mockResolvedValue({
      list: [
        {
          outboundId: 'out-he-1',
          projectId: 'proj-he',
          projectName: 'HE检测',
          projectType: 'he',
          costMonth: new Date().toISOString().slice(0, 7),
          sampleCount: 2,
          materialCost: 40,
          activityCost: 20,
          totalCost: 60,
          feeAmount: 120,
          profit: 60,
        },
      ],
    } as any)

    render(React.createElement(SlideCostAnalysis))

    await waitFor(() => expect(screen.getByText('HE检测')).toBeInTheDocument())

    const row = screen.getByText('HE检测').closest('tr')
    expect(row).not.toBeNull()
    expect(within(row!).getByText('HE染色')).toBeInTheDocument()
    expect(within(row!).queryByText('he')).not.toBeInTheDocument()
  })

  it('exports the filtered full table data with project type labels', async () => {
    vi.mocked(abcApi.getProfitability).mockResolvedValue({
      list: Array.from({ length: 21 }, (_, index) => ({
        outboundId: `out-he-${index + 1}`,
        projectId: `proj-he-${index + 1}`,
        projectName: `HE检测${String(index + 1).padStart(2, '0')}`,
        projectType: 'he',
        costMonth: new Date().toISOString().slice(0, 7),
        sampleCount: 1,
        materialCost: 10,
        activityCost: 5,
        totalCost: 15,
        feeAmount: 30,
        profit: 15,
      })),
    } as any)
    vi.mocked(abcApi.exportData).mockResolvedValue({
      filename: 'abc-cost-export.csv',
      content: 'project_type\nhe',
      mimeType: 'text/csv;charset=utf-8',
    } as any)

    render(React.createElement(SlideCostAnalysis))

    await waitFor(() => expect(screen.getByText('HE检测01')).toBeInTheDocument())

    fireEvent.click(screen.getByRole('button', { name: /导出/ }))

    await waitFor(() => expect(downloadTextFile).toHaveBeenCalled())
    const [, content, mimeType] = vi.mocked(downloadTextFile).mock.calls[0]
    expect(mimeType).toBe('text/csv;charset=utf-8')
    expect(content).toContain('HE染色')
    expect(content).toContain('HE检测21')
    expect(content).not.toContain('project_type\nhe')
  })
})
