import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { abcApi } from '@/api/abc'
import QualityCostAnalysis from './QualityCostAnalysis'

vi.mock('@/api/abc', () => ({
  abcApi: {
    getQualityCosts: vi.fn(),
    getQualityCostSummary: vi.fn(),
    createQualityCost: vi.fn(),
  },
}))

vi.mock('@/components/ui/Modal', () => ({
  Modal: ({ children, title }: { children: React.ReactNode; title: string }) => (
    <div role="dialog" aria-label={title}>
      {children}
    </div>
  ),
}))

describe('QualityCostAnalysis display labels', () => {
  beforeEach(() => {
    vi.mocked(abcApi.getQualityCosts).mockReset()
    vi.mocked(abcApi.getQualityCostSummary).mockReset()
    vi.mocked(abcApi.createQualityCost).mockReset()

    vi.mocked(abcApi.getQualityCosts).mockResolvedValue({
      list: [
        {
          id: 'quality-cost-1',
          yearMonth: '2026-06',
          costType: 'prevention',
          subType: 'training',
          amount: 1200,
          description: '入职培训',
        },
      ],
    })
    vi.mocked(abcApi.getQualityCostSummary).mockResolvedValue({
      totalQualityCost: 1200,
      preventionCost: 1200,
      appraisalCost: 0,
      internalFailureCost: 0,
      externalFailureCost: 0,
    })
  })

  it('displays and searches quality cost subtype labels instead of internal enum values', async () => {
    render(<QualityCostAnalysis />)

    const row = await screen.findByText('入职培训')
    const costRow = row.closest('tr')
    expect(costRow).not.toBeNull()
    expect(within(costRow as HTMLTableRowElement).getByText('培训费用')).toBeInTheDocument()
    expect(within(costRow as HTMLTableRowElement).queryByText('training')).not.toBeInTheDocument()

    fireEvent.change(screen.getByPlaceholderText('搜索质量成本...'), { target: { value: '培训费用' } })

    await waitFor(() => {
      expect(screen.getByText('入职培训')).toBeInTheDocument()
      expect(screen.queryByText('暂无质量成本数据')).not.toBeInTheDocument()
    })
  })
})
