import { describe, expect, it } from 'vitest'
import { aggregateProfitabilityRows } from './ProfitabilityAnalysis'

describe('aggregateProfitabilityRows', () => {
  it('按项目汇总同月同类型盈利数据', () => {
    const result = aggregateProfitabilityRows([
      {
        outboundId: 'out-1',
        projectId: 'proj-he',
        projectName: 'HE检测',
        projectType: 'he',
        costMonth: '2026-06',
        sampleCount: 2,
        materialCost: 40,
        activityCost: 20,
        totalCost: 60,
        feeAmount: 120,
        profit: 60,
      },
      {
        outboundId: 'out-2',
        projectId: 'proj-he',
        projectName: 'HE检测',
        projectType: 'he',
        costMonth: '2026-06',
        sampleCount: 3,
        materialCost: 90,
        activityCost: 30,
        totalCost: 120,
        feeAmount: 180,
        profit: 60,
      },
      {
        outboundId: 'out-other',
        projectId: 'proj-ihc',
        projectName: 'IHC检测',
        projectType: 'ihc',
        costMonth: '2026-06',
        sampleCount: 9,
        totalCost: 999,
        feeAmount: 999,
        profit: 0,
      },
    ], '2026-06', 'he')

    expect(result).toEqual([
      {
        projectId: 'proj-he',
        projectName: 'HE检测',
        projectType: 'he',
        caseCount: 2,
        sampleCount: 5,
        materialCost: 130,
        activityCost: 50,
        totalCost: 180,
        feeAmount: 300,
        profit: 120,
        profitRate: 0.4,
      },
    ])
  })
})
