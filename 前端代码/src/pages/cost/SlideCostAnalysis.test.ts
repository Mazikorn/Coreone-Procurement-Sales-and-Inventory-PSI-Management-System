import { describe, expect, it } from 'vitest'
import { normalizeProfitabilityRows } from './SlideCostAnalysis'

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
