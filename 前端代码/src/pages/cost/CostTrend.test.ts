import { describe, expect, it } from 'vitest'
import { normalizeSlideCostTrendRows } from './CostTrend'

describe('normalizeSlideCostTrendRows', () => {
  it('兼容月度汇总型趋势数据并补齐图表字段', () => {
    const result = normalizeSlideCostTrendRows([
      {
        month: '2026-06',
        totalCost: 300,
        materialCost: 210,
        activityCost: 90,
        sampleCount: 5,
      },
    ])

    expect(result).toEqual([
      {
        month: '2026-06',
        bomId: 'all',
        bomName: '全部BOM/项目',
        projectType: 'all',
        costPerSlide: 60,
        materialCost: 210,
        activityCost: 90,
        feeAmount: 0,
        marginRate: 0,
      },
    ])
  })

  it('优先使用明细行已有的BOM名称和利润率', () => {
    const result = normalizeSlideCostTrendRows([
      {
        month: '2026-06',
        bomId: 'bom-1',
        bomName: 'HE标准BOM',
        projectType: 'he',
        costPerSlide: 12.5,
        materialCost: 20,
        activityCost: 5,
        feeAmount: 100,
        marginRate: 0.25,
      },
    ])

    expect(result[0]).toMatchObject({
      bomId: 'bom-1',
      bomName: 'HE标准BOM',
      projectType: 'he',
      costPerSlide: 12.5,
      marginRate: 0.25,
    })
  })
})
