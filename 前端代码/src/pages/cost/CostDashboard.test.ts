import { describe, expect, it } from 'vitest'
import {
  buildDashboardComparisonParams,
  buildCostAlertsOverviewLink,
  getClosePeriodBlockReason,
  getComparisonDirectionMeta,
  getDashboardOpenExceptionCount,
} from './CostDashboard'

describe('getComparisonDirectionMeta', () => {
  it('成本上升时使用红色上升状态', () => {
    expect(getComparisonDirectionMeta('up')).toEqual({
      cardClassName: 'bg-red-50',
      labelClassName: 'text-red-600',
      valueClassName: 'text-red-600',
      icon: 'up',
    })
  })

  it('成本持平时使用中性状态', () => {
    expect(getComparisonDirectionMeta('flat')).toEqual({
      cardClassName: 'bg-gray-50',
      labelClassName: 'text-gray-600',
      valueClassName: 'text-gray-700',
      icon: 'flat',
    })
  })
})

describe('getDashboardOpenExceptionCount', () => {
  it('优先使用看板全量开放异常数，避免最近 10 条低估', () => {
    expect(getDashboardOpenExceptionCount(37, 10)).toBe(37)
  })

  it('后端未返回统计时回退到可见异常条数', () => {
    expect(getDashboardOpenExceptionCount(undefined, 6)).toBe(6)
  })
})

describe('buildCostAlertsOverviewLink', () => {
  it('看板查看全部异常时包含本月和无月份异常', () => {
    expect(buildCostAlertsOverviewLink('2026-04')).toBe('/abc/alerts?yearMonth=2026-04&status=open&includeUnassigned=1')
  })
})

describe('buildDashboardComparisonParams', () => {
  it('成本看板月度环比使用 ABC 快照口径', () => {
    expect(buildDashboardComparisonParams('2026-04')).toEqual({ month: '2026-04', source: 'abc' })
  })
})

describe('getClosePeriodBlockReason', () => {
  it('没有成本期间时提示先开启期间', () => {
    expect(getClosePeriodBlockReason(undefined, 0, 0)).toBe('请先开启成本期间')
  })

  it('存在开放异常时阻止关账', () => {
    expect(getClosePeriodBlockReason('calculated', 2, 0)).toBe('仍有 2 条开放成本异常')
  })

  it('存在未补算或成本异常出库时阻止关账', () => {
    expect(getClosePeriodBlockReason('calculated', 0, 3)).toBe('仍有 3 单未补算或成本异常')
  })

  it('期间已核算且没有阻断项时允许关账', () => {
    expect(getClosePeriodBlockReason('calculated', 0, 0)).toBe('')
  })
})
