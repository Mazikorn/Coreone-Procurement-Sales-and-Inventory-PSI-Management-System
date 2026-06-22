import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { abcApi } from '@/api/abc'
import FeeMappingConfig from './FeeMappingConfig'

vi.mock('@/api/abc', () => ({
  abcApi: {
    getBomFeeMappingAudit: vi.fn(),
    runBomFeeMappingAudit: vi.fn(),
    getBomFeeMappings: vi.fn(),
    updateBomFeeMappings: vi.fn(),
    previewBomFeeMapping: vi.fn(),
    getFeeStandards: vi.fn(),
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

describe('FeeMappingConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
    vi.mocked(abcApi.getFeeStandards).mockResolvedValue([])
    vi.mocked(abcApi.getBomFeeMappingAudit).mockResolvedValue({
      list: [{
        bomId: 'BOM-PW-FEE-DEEP-001',
        bomCode: 'BOM-PW-FEE-DEEP-001',
        bomName: '深链验证收费映射BOM',
        bomType: 'ihc',
        status: 'mapped',
        mappingCount: 1,
        mappedFeeNames: ['IHC染色检查费'],
      }],
      pagination: { total: 1 },
      summary: { total: 1, mapped: 1, legacy: 0, missing: 0 },
    } as any)
  })

  it('uses keyword from URL so audit links open a filtered fee mapping list', async () => {
    window.history.replaceState(null, '', '/abc/fee-mappings?keyword=BOM-PW-FEE-DEEP-001')

    render(<FeeMappingConfig />)

    await waitFor(() => expect(abcApi.getBomFeeMappingAudit).toHaveBeenCalledWith(expect.objectContaining({
      keyword: 'BOM-PW-FEE-DEEP-001',
      status: undefined,
      page: 1,
      pageSize: 10,
    })))
    expect(screen.getByPlaceholderText('BOM名称 / 编号')).toHaveValue('BOM-PW-FEE-DEEP-001')
    expect(await screen.findByText('深链验证收费映射BOM')).toBeInTheDocument()
    expect(screen.getByText('IHC染色检查费')).toBeInTheDocument()
  })
})
