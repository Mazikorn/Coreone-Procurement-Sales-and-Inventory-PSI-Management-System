import { render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scrapApi } from '@/api/inventory'
import { materialApi } from '@/api/master'
import { getScrapAmount, requiresScrapReview } from './Scraps'
import Scraps from './Scraps'

vi.mock('@/api/inventory')
vi.mock('@/api/master')
vi.mock('sonner')

describe('Scraps helpers', () => {
  it('flags high-value scrap by material price and quantity', () => {
    expect(getScrapAmount({ price: 600 } as any, 2)).toBe(1200)
    expect(requiresScrapReview({ price: 600 } as any, 2)).toBe(true)
    expect(requiresScrapReview({ price: 100 } as any, 2)).toBe(false)
  })
})

describe('Scraps page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    window.history.replaceState(null, '', '/scraps')
    vi.mocked(materialApi.getList).mockResolvedValue({
      list: [
        {
          id: 'mat-1',
          code: 'MAT-001',
          name: '苏木素',
          unit: '瓶',
          stock: 5,
          price: 100,
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 999 },
    } as any)
    vi.mocked(scrapApi.getList).mockResolvedValue({
      list: [
        {
          id: 'scrap-1',
          scrapNo: 'SC-DEEP-001',
          materialId: 'mat-1',
          materialName: '苏木素',
          unit: '瓶',
          batchNo: 'BATCH-001',
          quantity: 1,
          reason: 'damaged',
          operator: 'admin',
          status: 'completed',
          reviewStatus: 'not_required',
          scrapAmount: 100,
          createdAt: '2026-06-20T01:00:00.000Z',
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 20 },
    } as any)
  })

  it('uses keyword from URL so audit links open a filtered scrap list', async () => {
    window.history.replaceState(null, '', '/scraps?keyword=SC-DEEP-001')

    render(React.createElement(Scraps))

    await waitFor(() => {
      expect(scrapApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'SC-DEEP-001',
      }))
    })
    expect(screen.getByPlaceholderText('搜索报废单号/物料/批次/责任人...')).toHaveValue('SC-DEEP-001')
  })
})
