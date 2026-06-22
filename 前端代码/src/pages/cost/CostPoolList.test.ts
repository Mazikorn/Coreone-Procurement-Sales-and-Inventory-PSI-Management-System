import { render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { abcApi } from '@/api/abc'
import { CostPoolList, isManualCostPoolFormReady } from './CostPoolList'

vi.mock('@/api/abc', () => ({
  abcApi: {
    getCostPools: vi.fn(),
    createCostPool: vi.fn(),
    syncCostPools: vi.fn(),
    autoCollectCostPools: vi.fn(),
    recalculateCostPools: vi.fn(),
    getActivityCenters: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('CostPoolList helpers', () => {
  it('requires activity center, non-negative costs, positive driver quantity and adjustment reason', () => {
    expect(isManualCostPoolFormReady({
      activityCenterId: 'center-1',
      directCost: '100',
      indirectCost: '20',
      driverQuantity: '10',
      adjustmentReason: '月末人工成本补录',
      sourceDocumentNo: '',
      attachmentUrl: '',
      description: '',
    })).toBe(true)

    expect(isManualCostPoolFormReady({
      activityCenterId: 'center-1',
      directCost: '100',
      indirectCost: '20',
      driverQuantity: '10',
      adjustmentReason: '   ',
      sourceDocumentNo: '',
      attachmentUrl: '',
      description: '',
    })).toBe(false)

    expect(isManualCostPoolFormReady({
      activityCenterId: 'center-1',
      directCost: '100',
      indirectCost: '20',
      driverQuantity: '0',
      adjustmentReason: '月末人工成本补录',
      sourceDocumentNo: '',
      attachmentUrl: '',
      description: '',
    })).toBe(false)
  })
})

describe('CostPoolList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
    localStorage.clear()
    localStorage.setItem('user', JSON.stringify({ role: 'finance' }))
    vi.mocked(abcApi.getCostPools).mockResolvedValue({
      list: [{
        id: 'POOL-PW-DEEP-001',
        activityCenterName: '深链验证成本池中心',
        activityCenterCode: 'AC-PW-DEEP-001',
        yearMonth: '2026-06',
        directCost: 100,
        indirectCost: 20,
        totalCost: 120,
        driverQuantity: 10,
        driverRate: 12,
        source: 'manual',
        adjustmentReason: '页面深链验证调整',
        sourceDocumentNo: 'DOC-PW-DEEP-001',
        description: '成本池深链验证说明',
      }],
      pagination: { total: 1 },
    } as any)
  })

  it('uses keyword from URL so audit links open a filtered cost pool list', async () => {
    window.history.replaceState(null, '', '/abc/cost-pools?keyword=POOL-PW-DEEP-001')

    render(createElement(CostPoolList))

    await waitFor(() => expect(abcApi.getCostPools).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'POOL-PW-DEEP-001',
      page: 1,
      pageSize: 10,
    })))
    expect(screen.getByPlaceholderText('作业中心 / 编码 / 说明')).toHaveValue('POOL-PW-DEEP-001')
    expect(await screen.findByText('深链验证成本池中心')).toBeInTheDocument()
    expect(screen.getByText('DOC-PW-DEEP-001')).toBeInTheDocument()
  })
})
