import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { returnApi } from '@/api/inventory'
import Returns from './Returns'
import { toast } from 'sonner'

vi.mock('@/api/inventory')
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function LocationProbe() {
  const location = useLocation()
  return React.createElement('div', { 'data-testid': 'location-path' }, `${location.pathname}${location.search}`)
}

function renderReturns(withLocationProbe = false) {
  return render(React.createElement(
    MemoryRouter,
    null,
    React.createElement(Returns),
    withLocationProbe ? React.createElement(LocationProbe) : null,
  ))
}

describe('Returns page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    window.history.replaceState(null, '', '/returns')
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
    vi.mocked(returnApi.create).mockResolvedValue({ id: 'return-created', returnNo: 'RT-CREATED-001' } as any)
  })

  it('creates returns from an outbound item source and shows source outbound number', async () => {
    renderReturns()

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

  it('opens a prefilled return draft from an outbound item URL', async () => {
    window.history.replaceState(
      null,
      '',
      '/returns?action=create&outboundItemId=out-item-1&quantity=2&reason=unused&remark=%E6%9D%A5%E8%87%AA%E5%87%BA%E5%BA%93%E8%AF%A6%E6%83%85%E9%80%80%E5%BA%93',
    )

    renderReturns()

    expect(await screen.findByText('退库结果确认')).toBeInTheDocument()
    expect(screen.getByTestId('return-quantity-input')).toHaveValue(2)
    expect(screen.getByText('来源出库 OB-001')).toBeInTheDocument()
    expect(screen.getByText('恢复库存 2 瓶')).toBeInTheDocument()
    expect(screen.getByText('成本回冲 ¥24.00')).toBeInTheDocument()
    expect(screen.getByText('剩余可退 0 瓶')).toBeInTheDocument()
    expect(screen.getAllByText('未使用退回').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByDisplayValue('来自出库详情退库')).toBeInTheDocument()
  })

  it('shows the downstream return facts before warehouse users confirm restored inventory', async () => {
    renderReturns()

    fireEvent.click(await screen.findByRole('button', { name: '退库登记' }))
    await waitFor(() => expect(returnApi.getSources).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId('return-source-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-out-item-1'))
    fireEvent.change(screen.getByTestId('return-quantity-input'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('return-reason-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-unused'))

    await waitFor(() => expect(screen.getByText('退库结果确认')).toBeInTheDocument())
    expect(screen.getAllByText('苏木素').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('B-001').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('来源出库 OB-001')).toBeInTheDocument()
    expect(screen.getByText('恢复库存 2 瓶')).toBeInTheDocument()
    expect(screen.getByText('成本回冲 ¥24.00')).toBeInTheDocument()
    expect(screen.getByText('剩余可退 0 瓶')).toBeInTheDocument()
    expect(screen.getAllByText('未使用退回').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText((content) => content.includes('库存、批次、出库回冲、成本、库存流水、审计记录'))).toBeInTheDocument()
  })

  it('blocks return confirmation when quantity exceeds the returnable source quantity', async () => {
    renderReturns()

    fireEvent.click(await screen.findByRole('button', { name: '退库登记' }))
    await waitFor(() => expect(returnApi.getSources).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId('return-source-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-out-item-1'))
    fireEvent.change(screen.getByTestId('return-quantity-input'), { target: { value: '3' } })

    expect(screen.getByText('退库数量不能超过可退数量 2 瓶，请按实际退回数量修改。')).toBeInTheDocument()
    expect(screen.getByTestId('return-confirm-btn')).toBeDisabled()

    fireEvent.click(screen.getByTestId('return-confirm-btn'))

    expect(returnApi.create).not.toHaveBeenCalled()
  })

  it('uses keyword from URL so audit links open a filtered returns list', async () => {
    window.history.replaceState(null, '', '/returns?keyword=RT-DEEP-001')

    renderReturns()

    await waitFor(() => {
      expect(returnApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'RT-DEEP-001',
      }))
    })
    expect(screen.getByPlaceholderText('搜索退库单号/物料/原因...')).toHaveValue('RT-DEEP-001')
  })

  it('focuses the newly created return record so warehouse users can confirm restored inventory', async () => {
    window.history.replaceState(null, '', '/returns?keyword=old-return')

    renderReturns()

    fireEvent.click(await screen.findByRole('button', { name: '退库登记' }))
    await waitFor(() => expect(returnApi.getSources).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId('return-source-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-out-item-1'))
    fireEvent.click(screen.getByTestId('return-reason-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-unused'))
    fireEvent.click(screen.getByTestId('return-confirm-btn'))

    await waitFor(() => expect(screen.getByPlaceholderText('搜索退库单号/物料/原因...')).toHaveValue('RT-CREATED-001'))
    await waitFor(() => {
      expect(returnApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'RT-CREATED-001',
      }))
    })
  })

  it('keeps the newly created return visible when the follow-up list refresh fails', async () => {
    vi.mocked(returnApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(returnApi.create).mockResolvedValueOnce({
      id: 'return-created-visible',
      returnNo: 'RT-CREATED-VISIBLE-001',
    } as any)

    renderReturns()

    fireEvent.click(await screen.findByRole('button', { name: '退库登记' }))
    await waitFor(() => expect(returnApi.getSources).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId('return-source-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-out-item-1'))
    fireEvent.click(screen.getByTestId('return-reason-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-unused'))
    fireEvent.change(screen.getByTestId('return-quantity-input'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('return-confirm-btn'))

    expect(await screen.findByText('RT-CREATED-VISIBLE-001')).toBeInTheDocument()
    expect(screen.getByText('OB-001')).toBeInTheDocument()
    expect(screen.getByText('苏木素')).toBeInTheDocument()
    expect(screen.getByText('B-001')).toBeInTheDocument()
    expect(screen.getByText('2 瓶')).toBeInTheDocument()
    expect(screen.getByText('未使用退回')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('退库登记成功', {
      description: '已生成 RT-CREATED-VISIBLE-001，库存、批次、出库回冲、成本和审计链路可按单号回看',
    })
  })

  it('removes a cancelled fallback-created return when both follow-up refreshes fail', async () => {
    vi.mocked(returnApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('create refresh failed'))
      .mockRejectedValueOnce(new Error('cancel refresh failed'))
    vi.mocked(returnApi.create).mockResolvedValueOnce({
      id: 'return-created-then-cancelled',
      returnNo: 'RT-CREATED-CANCELLED-001',
    } as any)
    vi.mocked(returnApi.delete).mockResolvedValueOnce({} as any)

    renderReturns()

    fireEvent.click(await screen.findByRole('button', { name: '退库登记' }))
    await waitFor(() => expect(returnApi.getSources).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId('return-source-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-out-item-1'))
    fireEvent.click(screen.getByTestId('return-reason-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-unused'))
    fireEvent.change(screen.getByTestId('return-quantity-input'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('return-confirm-btn'))

    expect(await screen.findByText('RT-CREATED-CANCELLED-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '撤销' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认撤销' }))

    await waitFor(() => expect(returnApi.delete).toHaveBeenCalledWith('return-created-then-cancelled'))
    expect(screen.queryByText('RT-CREATED-CANCELLED-001')).not.toBeInTheDocument()
    expect(screen.getByText('暂无退库记录')).toBeInTheDocument()
    expect(screen.getByText('共 0 条记录')).toBeInTheDocument()
  })

  it('explains the real inventory and audit effects before cancelling a return', async () => {
    renderReturns()

    expect(await screen.findByText('RT-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '撤销' }))

    expect(await screen.findByText('撤销退库记录')).toBeInTheDocument()
    expect(screen.getByText((content) => (
      content.includes('撤销后将反向扣回本次退库恢复的库存和批次余量')
      && content.includes('同步回退成本回冲和库存流水')
      && content.includes('重新触发库存预警检查')
      && content.includes('审计记录将保留撤销动作')
    ))).toBeInTheDocument()
  })

  it('opens audit evidence from a return row so warehouse users do not search logs manually', async () => {
    renderReturns(true)

    expect(await screen.findByText('RT-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /审计证据 RT-001/ }))

    expect(screen.getByTestId('location-path')).toHaveTextContent('/logs?keyword=RT-001')
  })
})
