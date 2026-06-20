import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { returnApi } from '@/api/inventory'
import Returns from './Returns'

vi.mock('@/api/inventory')
vi.mock('sonner')

describe('Returns page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    vi.mocked(returnApi.getList).mockResolvedValue({
      list: [
        {
          id: 'return-1',
          returnNo: 'RT-001',
          outboundItemId: 'out-item-1',
          outboundNo: 'OB-001',
          materialId: 'mat-1',
          materialName: '苏木素',
          batchId: 'batch-1',
          batchNo: 'B-001',
          quantity: 1,
          unitCost: 12,
          totalCost: 12,
          reason: 'unused',
          operator: 'admin',
          status: 'completed',
          remark: '',
          createdAt: '2026-06-20T01:00:00.000Z',
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 20 },
    } as any)
    vi.mocked(returnApi.getSources).mockResolvedValue({
      list: [
        {
          outboundItemId: 'out-item-1',
          outboundId: 'out-1',
          outboundNo: 'OB-001',
          materialId: 'mat-1',
          materialName: '苏木素',
          unit: '瓶',
          batchId: 'batch-1',
          batchNo: 'B-001',
          outboundQuantity: 3,
          returnedQuantity: 1,
          returnableQuantity: 2,
          unitCost: 12,
          totalCost: 36,
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 999 },
    } as any)
    vi.mocked(returnApi.create).mockResolvedValue({ id: 'return-created' })
  })

  it('creates returns from an outbound item source and shows source outbound number', async () => {
    render(React.createElement(Returns))

    expect(await screen.findByText('RT-001')).toBeInTheDocument()
    expect(screen.getByText('OB-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '退库登记' }))
    await waitFor(() => expect(returnApi.getSources).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId('return-source-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-out-item-1'))
    fireEvent.click(screen.getByTestId('return-reason-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-unused'))
    fireEvent.change(screen.getByTestId('return-quantity-input'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('return-confirm-btn'))

    await waitFor(() => expect(returnApi.create).toHaveBeenCalledWith({
      outboundItemId: 'out-item-1',
      quantity: 2,
      reason: 'unused',
      remark: '',
    }))
  })
})
