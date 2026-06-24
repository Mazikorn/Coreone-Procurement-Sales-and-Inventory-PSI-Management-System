import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { scrapApi } from '@/api/inventory'
import { materialApi } from '@/api/master'
import { getScrapAmount, requiresScrapReview } from './Scraps'
import Scraps from './Scraps'
import { toast } from 'sonner'

vi.mock('@/api/inventory')
vi.mock('@/api/master')
vi.mock('sonner')

function LocationProbe() {
  const location = useLocation()
  return React.createElement('div', { 'data-testid': 'location-path' }, `${location.pathname}${location.search}`)
}

function renderScraps(withLocationProbe = false) {
  return render(React.createElement(
    MemoryRouter,
    null,
    React.createElement(Scraps),
    withLocationProbe ? React.createElement(LocationProbe) : null,
  ))
}

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
    vi.mocked(materialApi.getDetail).mockResolvedValue({
      id: 'mat-1',
      code: 'MAT-001',
      name: '苏木素',
      unit: '瓶',
      stock: 5,
      price: 100,
      batches: [
        {
          id: 'batch-1',
          materialId: 'mat-1',
          batchNo: 'BATCH-001',
          quantity: 5,
          remaining: 5,
          inboundPrice: 100,
          status: 'normal',
        },
      ],
    } as any)
    vi.mocked(scrapApi.create).mockResolvedValue({
      id: 'scrap-created',
      scrapNo: 'SC-CREATED-001',
      reviewStatus: 'not_required',
    } as any)
  })

  it('uses keyword from URL so audit links open a filtered scrap list', async () => {
    window.history.replaceState(null, '', '/scraps?keyword=SC-DEEP-001')

    renderScraps()

    await waitFor(() => {
      expect(scrapApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'SC-DEEP-001',
      }))
    })
    expect(screen.getByPlaceholderText('搜索报废单号/物料/批次/责任人...')).toHaveValue('SC-DEEP-001')
  })

  it('focuses the newly created scrap record so warehouse users can confirm the inventory loss and responsibility chain', async () => {
    window.history.replaceState(null, '', '/scraps?keyword=old-scrap')

    renderScraps()

    fireEvent.click(await screen.findByRole('button', { name: '报废登记' }))
    await waitFor(() => expect(materialApi.getList).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId('scrap-material-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-1'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('mat-1'))

    fireEvent.click(screen.getByTestId('scrap-batch-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-batch-1'))
    fireEvent.click(screen.getByTestId('scrap-reason-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-damaged'))
    fireEvent.click(screen.getByTestId('scrap-confirm-btn'))

    await waitFor(() => expect(scrapApi.create).toHaveBeenCalledWith(expect.objectContaining({
      materialId: 'mat-1',
      batchId: 'batch-1',
      quantity: 1,
      reason: 'damaged',
    })))
    await waitFor(() => expect(screen.getByPlaceholderText('搜索报废单号/物料/批次/责任人...')).toHaveValue('SC-CREATED-001'))
    await waitFor(() => {
      expect(scrapApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'SC-CREATED-001',
      }))
    })
  })

  it('auto-selects the only available batch so scrap registration does not require a redundant click', async () => {
    renderScraps()

    fireEvent.click(await screen.findByRole('button', { name: '报废登记' }))
    fireEvent.click(screen.getByTestId('scrap-material-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-1'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('mat-1'))

    fireEvent.click(screen.getByTestId('scrap-reason-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-damaged'))
    fireEvent.click(screen.getByTestId('scrap-confirm-btn'))

    await waitFor(() => expect(scrapApi.create).toHaveBeenCalledWith(expect.objectContaining({
      materialId: 'mat-1',
      batchId: 'batch-1',
      quantity: 1,
      reason: 'damaged',
    })))
  })

  it('shows the downstream scrap facts before warehouse users confirm the loss', async () => {
    renderScraps()

    fireEvent.click(await screen.findByRole('button', { name: '报废登记' }))
    fireEvent.click(screen.getByTestId('scrap-material-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-1'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('mat-1'))

    fireEvent.click(screen.getByTestId('scrap-reason-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-damaged'))

    await waitFor(() => expect(screen.getByText('报废结果确认')).toBeInTheDocument())
    expect(screen.getAllByText('苏木素').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('BATCH-001').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('1 瓶').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('批次扣减 1 瓶')).toBeInTheDocument()
    expect(screen.getByText('预计损耗 ¥100.00')).toBeInTheDocument()
    expect(screen.getByText('直接完成报废登记')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('库存、批次、成本、库存流水、审计记录'))).toBeInTheDocument()
  })

  it('opens a prefilled scrap draft from an inventory batch URL', async () => {
    window.history.replaceState(
      null,
      '',
      '/scraps?action=create&materialId=mat-1&batchId=batch-1&quantity=2&reason=damaged&remark=%E6%9D%A5%E8%87%AA%E5%BA%93%E5%AD%98%E5%88%97%E8%A1%A8%E6%8A%A5%E5%BA%9F',
    )

    renderScraps()

    expect(await screen.findByRole('heading', { name: '报废登记' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('scrap-quantity-input')).toHaveValue(2))
    expect(screen.getAllByText('苏木素').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('BATCH-001').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('批次扣减 2 瓶')).toBeInTheDocument()
    expect(screen.getByText('预计损耗 ¥200.00')).toBeInTheDocument()
    expect(screen.getByText('批次余量')).toBeInTheDocument()
    expect(screen.getByText('3 瓶')).toBeInTheDocument()
    expect(screen.getAllByText('破损报废').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByDisplayValue('来自库存列表报废')).toBeInTheDocument()
  })

  it('makes the stock effect explicit before and after high-value scrap is submitted for review', async () => {
    vi.mocked(materialApi.getList).mockResolvedValue({
      list: [
        {
          id: 'mat-high',
          code: 'MAT-HIGH',
          name: '高值试剂',
          unit: '瓶',
          stock: 5,
          price: 600,
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 999 },
    } as any)
    vi.mocked(materialApi.getDetail).mockResolvedValue({
      id: 'mat-high',
      code: 'MAT-HIGH',
      name: '高值试剂',
      unit: '瓶',
      stock: 5,
      price: 600,
      batches: [
        {
          id: 'batch-high',
          materialId: 'mat-high',
          batchNo: 'BATCH-HIGH-001',
          quantity: 5,
          remaining: 5,
          inboundPrice: 600,
          status: 'normal',
        },
      ],
    } as any)
    vi.mocked(scrapApi.create).mockResolvedValueOnce({
      id: 'scrap-high',
      scrapNo: 'SC-HIGH-001',
      materialId: 'mat-high',
      batchId: 'batch-high',
      quantity: 2,
      reason: 'damaged',
      operator: 'warehouse',
      status: 'pending_review',
      reviewStatus: 'pending',
      requiresReview: true,
      scrapAmount: 1200,
    } as any)

    renderScraps()

    fireEvent.click(await screen.findByRole('button', { name: '报废登记' }))
    fireEvent.click(screen.getByTestId('scrap-material-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-high'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('mat-high'))

    fireEvent.change(screen.getByTestId('scrap-quantity-input'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('scrap-reason-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-damaged'))
    fireEvent.change(screen.getByPlaceholderText('填写本次损耗责任人'), { target: { value: '张三' } })
    fireEvent.change(screen.getByPlaceholderText('填写责任部门'), { target: { value: '仓库' } })

    expect(await screen.findByText('先扣减库存，进入待复核')).toBeInTheDocument()
    expect(screen.getByText((content) => (
      content.includes('达到高价值报废标准，确认后先扣减库存并进入待复核，驳回会自动恢复库存。')
    ))).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('scrap-confirm-btn'))

    await waitFor(() => expect(scrapApi.create).toHaveBeenCalledWith(expect.objectContaining({
      materialId: 'mat-high',
      batchId: 'batch-high',
      quantity: 2,
      reason: 'damaged',
      responsiblePerson: '张三',
      responsibleDepartment: '仓库',
    })))
    expect(toast.success).toHaveBeenCalledWith('报废已登记，待复核', {
      description: '已生成 SC-HIGH-001，库存和批次已扣减；待复核通过后完成报废闭环，驳回会恢复库存并保留审计记录',
    })
  })

  it('blocks scrap confirmation when quantity exceeds the selected batch remaining quantity', async () => {
    renderScraps()

    fireEvent.click(await screen.findByRole('button', { name: '报废登记' }))
    fireEvent.click(screen.getByTestId('scrap-material-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-1'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('mat-1'))

    fireEvent.click(screen.getByTestId('scrap-reason-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-damaged'))
    fireEvent.change(screen.getByTestId('scrap-quantity-input'), { target: { value: '6' } })

    expect(screen.getByText('报废数量不能超过所选批次剩余 5 瓶，请按实际可报废数量修改。')).toBeInTheDocument()
    expect(screen.getByTestId('scrap-confirm-btn')).toBeDisabled()

    fireEvent.click(screen.getByTestId('scrap-confirm-btn'))

    expect(scrapApi.create).not.toHaveBeenCalled()
  })

  it('keeps the newly created scrap visible when the follow-up list refresh fails', async () => {
    vi.mocked(scrapApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(scrapApi.create).mockResolvedValueOnce({
      id: 'scrap-visible',
      scrapNo: 'SC-VISIBLE-001',
      materialId: 'mat-1',
      batchId: 'batch-1',
      quantity: 1,
      reason: 'damaged',
      operator: 'warehouse',
      status: 'completed',
      reviewStatus: 'not_required',
      scrapAmount: 100,
    } as any)

    renderScraps()

    fireEvent.click(await screen.findByRole('button', { name: '报废登记' }))
    fireEvent.click(screen.getByTestId('scrap-material-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-1'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('mat-1'))

    fireEvent.click(screen.getByTestId('scrap-batch-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-batch-1'))
    fireEvent.click(screen.getByTestId('scrap-reason-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-damaged'))
    fireEvent.click(screen.getByTestId('scrap-confirm-btn'))

    expect(await screen.findByText('SC-VISIBLE-001')).toBeInTheDocument()
    expect(screen.getByText('苏木素')).toBeInTheDocument()
    expect(screen.getByText('BATCH-001')).toBeInTheDocument()
    expect(screen.getByText('1 瓶')).toBeInTheDocument()
    expect(screen.getByText('破损报废')).toBeInTheDocument()
    expect(screen.getByText('¥100.00')).toBeInTheDocument()
  })

  it('keeps the reviewed scrap focused with the updated status when the follow-up list refresh fails', async () => {
    vi.mocked(scrapApi.getList)
      .mockResolvedValueOnce({
        list: [
          {
            id: 'scrap-review',
            scrapNo: 'SC-REVIEW-001',
            materialId: 'mat-1',
            materialName: '苏木素',
            unit: '瓶',
            batchNo: 'BATCH-001',
            quantity: 1,
            reason: 'damaged',
            operator: 'warehouse',
            status: 'pending_review',
            responsiblePerson: '张三',
            responsibleDepartment: '仓库',
            reviewStatus: 'pending',
            scrapAmount: 1200,
            createdAt: '2026-06-20T01:00:00.000Z',
          },
        ],
        pagination: { total: 1, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(scrapApi.review).mockResolvedValueOnce({
      id: 'scrap-review',
      status: 'completed',
      reviewStatus: 'approved',
    } as any)

    renderScraps()

    expect(await screen.findByText('SC-REVIEW-001')).toBeInTheDocument()
    expect(screen.getByText('待复核')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('复核通过'))
    fireEvent.click(await screen.findByRole('button', { name: '确认通过' }))

    await waitFor(() => {
      expect(scrapApi.review).toHaveBeenCalledWith('scrap-review', {
        status: 'approved',
        reason: undefined,
      })
    })
    await waitFor(() => {
      expect(screen.getByPlaceholderText('搜索报废单号/物料/批次/责任人...')).toHaveValue('SC-REVIEW-001')
    })
    await waitFor(() => expect(screen.queryByText('复核通过报废')).not.toBeInTheDocument())
    expect(screen.getByText('复核通过')).toBeInTheDocument()
    expect(screen.queryByText('待复核')).not.toBeInTheDocument()
  })

  it('removes a withdrawn scrap from the current list when the follow-up refresh fails', async () => {
    vi.mocked(scrapApi.getList)
      .mockResolvedValueOnce({
        list: [
          {
            id: 'scrap-withdrawn',
            scrapNo: 'SC-WITHDRAWN-001',
            materialId: 'mat-1',
            materialName: '苏木素',
            unit: '瓶',
            batchNo: 'BATCH-001',
            quantity: 1,
            reason: 'damaged',
            operator: 'warehouse',
            status: 'completed',
            reviewStatus: 'not_required',
            scrapAmount: 100,
            createdAt: '2026-06-20T01:00:00.000Z',
          },
          {
            id: 'scrap-kept',
            scrapNo: 'SC-KEPT-001',
            materialId: 'mat-1',
            materialName: '苏木素',
            unit: '瓶',
            batchNo: 'BATCH-002',
            quantity: 2,
            reason: 'expired',
            operator: 'warehouse',
            status: 'completed',
            reviewStatus: 'not_required',
            scrapAmount: 200,
            createdAt: '2026-06-20T02:00:00.000Z',
          },
        ],
        pagination: { total: 2, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('delete refresh failed'))
    vi.mocked(scrapApi.delete).mockResolvedValueOnce({ success: true } as any)

    renderScraps()

    expect(await screen.findByText('SC-WITHDRAWN-001')).toBeInTheDocument()
    expect(screen.getByText('SC-KEPT-001')).toBeInTheDocument()

    fireEvent.click(screen.getAllByTitle('撤销')[0])
    fireEvent.click(await screen.findByRole('button', { name: '确认撤销' }))

    await waitFor(() => expect(scrapApi.delete).toHaveBeenCalledWith('scrap-withdrawn'))
    expect(screen.queryByText('SC-WITHDRAWN-001')).not.toBeInTheDocument()
    expect(screen.getByText('SC-KEPT-001')).toBeInTheDocument()
    expect(screen.getByText('共 1 条记录')).toBeInTheDocument()
  })

  it('explains the real inventory, cost and audit effects before cancelling a scrap', async () => {
    renderScraps()

    expect(await screen.findByText('SC-DEEP-001')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('撤销'))

    expect(await screen.findByRole('heading', { name: '确认撤销' })).toBeInTheDocument()
    expect(screen.getByText((content) => (
      content.includes('撤销后将恢复本次报废扣减的库存和批次余量')
      && content.includes('回滚损耗成本和库存流水')
      && content.includes('重新触发库存预警检查')
      && content.includes('审计记录将保留撤销动作')
    ))).toBeInTheDocument()
  })

  it('opens audit evidence from a scrap row so warehouse users do not search logs manually', async () => {
    renderScraps(true)

    expect(await screen.findByText('SC-DEEP-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /审计证据 SC-DEEP-001/ }))

    expect(screen.getByTestId('location-path')).toHaveTextContent('/logs?keyword=SC-DEEP-001')
  })
})
