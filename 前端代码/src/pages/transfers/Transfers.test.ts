import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryApi, transferApi } from '@/api/inventory'
import { locationApi, materialApi } from '@/api/master'
import { validateTransferForm, type TransferFormState } from './Transfers'
import Transfers from './Transfers'
import type { Batch, Material } from '@/types'
import { toast } from 'sonner'

vi.mock('@/api/inventory')
vi.mock('@/api/master')
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

function renderTransfers(withLocationProbe = false) {
  return render(React.createElement(
    MemoryRouter,
    null,
    React.createElement(Transfers),
    withLocationProbe ? React.createElement(LocationProbe) : null,
  ))
}

const baseForm: TransferFormState = {
  materialId: 'mat-1',
  batchNo: 'BATCH-1',
  quantity: 3,
  fromLocationId: 'loc-a',
  toLocationId: 'loc-b',
  remark: '',
}

const material = {
  id: 'mat-1',
  code: 'MAT-1',
  name: '调拨物料',
  spec: '1ml',
  unit: '瓶',
  price: 10,
  stock: 10,
  minStock: 0,
  maxStock: 100,
  safetyStock: 5,
  locationId: 'loc-a',
  categoryId: 'cat-1',
  status: 'active',
  createdAt: '2026-06-18',
  updatedAt: '2026-06-18',
} satisfies Material

const batches = [
  {
    id: 'batch-1',
    materialId: 'mat-1',
    batchNo: 'BATCH-1',
    quantity: 10,
    remaining: 4,
    expiryDate: '2027-01-01',
    inboundId: 'inbound-1',
    inboundPrice: 12,
    status: 'normal',
    createdAt: '2026-06-18',
  },
] satisfies Batch[]

describe('validateTransferForm', () => {
  it('blocks transfer quantity greater than source location stock even when total stock is enough', () => {
    expect(validateTransferForm(baseForm, material, 2, batches)).toBe('调拨数量不能超过来源库位可用库存 2 瓶')
  })

  it('requires confirmed source location stock before submitting a location transfer', () => {
    expect(validateTransferForm(baseForm, material, null, batches)).toBe('来源库位库存暂未确认，请重新选择来源库位或刷新后再调拨')
  })

  it('blocks same source and target location', () => {
    expect(validateTransferForm({ ...baseForm, toLocationId: 'loc-a' }, material, 10, batches)).toBe('来源库位和目标库位不能相同')
  })

  it('requires a batch when the material has available batches', () => {
    expect(validateTransferForm({ ...baseForm, batchNo: '' }, material, 10, batches)).toBe('请选择调拨批次')
  })

  it('blocks quantity greater than selected batch remaining quantity', () => {
    expect(validateTransferForm({ ...baseForm, quantity: 5 }, material, 10, batches)).toBe('调拨数量不能超过所选批次剩余量 4 瓶')
  })

  it('accepts a valid material, source location, target location and quantity combination', () => {
    expect(validateTransferForm(baseForm, material, 5)).toBeNull()
    expect(validateTransferForm(baseForm, material, 5, [{ ...batches[0], remaining: 5 }])).toBeNull()
  })
})

describe('Transfers page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('React', React)
    window.history.replaceState(null, '', '/transfers')
    vi.mocked(materialApi.getList).mockResolvedValue({
      list: [
        {
          ...material,
          id: 'mat-transfer-1',
          code: 'MAT-TF-001',
          name: '调拨深链物料',
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 999 },
    } as any)
    vi.mocked(locationApi.getList).mockResolvedValue({
      list: [
        { id: 'loc-a', code: 'LOC-A', name: 'A冷藏柜', type: 'shelf', zone: 'A区', status: 'active' },
        { id: 'loc-b', code: 'LOC-B', name: 'B备用柜', type: 'shelf', zone: 'B区', status: 'active' },
      ],
      pagination: { total: 2, page: 1, pageSize: 999 },
    } as any)
    vi.mocked(transferApi.getList).mockResolvedValue({
      list: [
        {
          id: 'transfer-1',
          inboundNo: 'TF-DEEP-001',
          materialId: 'mat-transfer-1',
          materialName: '调拨深链物料',
          batchNo: 'BATCH-TF-001',
          quantity: 2,
          fromLocationId: 'loc-a',
          fromLocationName: 'A冷藏柜',
          toLocationId: 'loc-b',
          toLocationName: 'B备用柜',
          operator: 'admin',
          status: 'completed',
          remark: '',
          createdAt: '2026-06-20T01:00:00.000Z',
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 20 },
    } as any)
    vi.mocked(materialApi.getDetail).mockResolvedValue({
      ...material,
      id: 'mat-transfer-1',
      code: 'MAT-TF-001',
      name: '调拨深链物料',
      batches: [
        {
          ...batches[0],
          id: 'batch-transfer-1',
          materialId: 'mat-transfer-1',
          batchNo: 'BATCH-TF-001',
          remaining: 4,
        },
      ],
    } as any)
    vi.mocked(inventoryApi.getList).mockResolvedValue({
      list: [
        {
          materialId: 'mat-transfer-1',
          locationId: 'loc-a',
          stock: 4,
        },
      ],
      pagination: { total: 1, page: 1, pageSize: 20 },
    } as any)
    vi.mocked(transferApi.createInbound).mockResolvedValue({ id: 'transfer-created', inboundNo: 'TF-CREATED-001' } as any)
  })

  it('uses keyword from URL so audit links open a filtered transfer list', async () => {
    window.history.replaceState(null, '', '/transfers?keyword=TF-DEEP-001')

    renderTransfers()

    await waitFor(() => {
      expect(transferApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'TF-DEEP-001',
      }))
    })
    expect(screen.getByPlaceholderText('搜索调拨单号/物料/批次/库位...')).toHaveValue('TF-DEEP-001')
  })

  it('focuses the newly created transfer so warehouse users can verify the moved stock location', async () => {
    window.history.replaceState(null, '', '/transfers?keyword=old-transfer')

    renderTransfers()

    fireEvent.click(await screen.findByRole('button', { name: '调拨入库' }))
    await waitFor(() => expect(materialApi.getList).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId('transfer-material-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-transfer-1'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('mat-transfer-1'))

    fireEvent.click(screen.getByTestId('transfer-to-location-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-loc-b'))

    await waitFor(() => expect(inventoryApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      materialId: 'mat-transfer-1',
      locationId: 'loc-a',
    })))
    await waitFor(() => expect(screen.getByTestId('transfer-confirm-btn')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('transfer-confirm-btn'))

    await waitFor(() => expect(transferApi.createInbound).toHaveBeenCalledWith(expect.objectContaining({
      materialId: 'mat-transfer-1',
      batchNo: 'BATCH-TF-001',
      fromLocationId: 'loc-a',
      toLocationId: 'loc-b',
    })))
    await waitFor(() => expect(screen.getByPlaceholderText('搜索调拨单号/物料/批次/库位...')).toHaveValue('TF-CREATED-001'))
    await waitFor(() => {
      expect(transferApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'TF-CREATED-001',
      }))
    })
  })

  it('shows the downstream transfer facts before warehouse users confirm the move', async () => {
    renderTransfers()

    fireEvent.click(await screen.findByRole('button', { name: '调拨入库' }))
    await waitFor(() => expect(materialApi.getList).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId('transfer-material-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-transfer-1'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('mat-transfer-1'))

    fireEvent.change(screen.getByTestId('transfer-quantity-input'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('transfer-to-location-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-loc-b'))

    await waitFor(() => expect(screen.getByText('调拨结果确认')).toBeInTheDocument())
    expect(screen.getAllByText('调拨深链物料').length).toBeGreaterThanOrEqual(1)
    await waitFor(() => expect(screen.getAllByText(/BATCH-TF-001/).length).toBeGreaterThanOrEqual(1))
    expect(screen.getAllByText('A冷藏柜').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('B备用柜').length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText('2 瓶').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('来源调出 2 瓶')).toBeInTheDocument()
    expect(screen.getByText('目标调入 2 瓶')).toBeInTheDocument()
    expect(screen.getByText((content) => content.includes('库存、批次、库位、库存流水、审计记录'))).toBeInTheDocument()
  })

  it('opens a prefilled transfer draft from an inventory batch URL', async () => {
    window.history.replaceState(
      null,
      '',
      '/transfers?action=create&materialId=mat-transfer-1&batchNo=BATCH-TF-001&fromLocationId=loc-a&quantity=2&remark=%E6%9D%A5%E8%87%AA%E5%BA%93%E5%AD%98%E5%88%97%E8%A1%A8%E8%B0%83%E6%8B%A8'
    )

    renderTransfers()

    expect(await screen.findByText('调拨入库登记')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('transfer-quantity-input')).toHaveValue(2))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('mat-transfer-1'))
    await waitFor(() => expect(inventoryApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      materialId: 'mat-transfer-1',
      locationId: 'loc-a',
    })))
    expect(screen.getAllByText('调拨深链物料').length).toBeGreaterThanOrEqual(1)
    await waitFor(() => expect(screen.getAllByText(/BATCH-TF-001/).length).toBeGreaterThanOrEqual(1))
    expect(screen.getAllByText('A冷藏柜').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByDisplayValue('来自库存列表调拨')).toBeInTheDocument()
    expect(screen.getByTestId('transfer-confirm-btn')).toBeDisabled()

    fireEvent.click(screen.getByTestId('transfer-to-location-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-loc-b'))

    await waitFor(() => expect(screen.getByText('调拨结果确认')).toBeInTheDocument())
    expect(screen.getByText('来源调出 2 瓶')).toBeInTheDocument()
    expect(screen.getByText('目标调入 2 瓶')).toBeInTheDocument()
  })

  it('blocks transfer confirmation when quantity exceeds the selected batch remaining quantity', async () => {
    renderTransfers()

    fireEvent.click(await screen.findByRole('button', { name: '调拨入库' }))
    await waitFor(() => expect(materialApi.getList).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId('transfer-material-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-transfer-1'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('mat-transfer-1'))

    fireEvent.click(screen.getByTestId('transfer-to-location-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-loc-b'))
    fireEvent.change(screen.getByTestId('transfer-quantity-input'), { target: { value: '5' } })

    expect(screen.getByText('调拨数量不能超过所选批次剩余量 4 瓶，请按实际可调拨数量修改。')).toBeInTheDocument()
    expect(screen.getByTestId('transfer-confirm-btn')).toBeDisabled()

    fireEvent.click(screen.getByTestId('transfer-confirm-btn'))

    expect(transferApi.createInbound).not.toHaveBeenCalled()
  })

  it('keeps the newly created transfer visible when the follow-up list refresh fails', async () => {
    vi.mocked(transferApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(transferApi.createInbound).mockResolvedValueOnce({
      id: 'transfer-created-visible',
      inboundNo: 'TF-CREATED-VISIBLE-001',
      materialId: 'mat-transfer-1',
      quantity: 2,
      fromLocationId: 'loc-a',
      toLocationId: 'loc-b',
    } as any)

    renderTransfers()

    fireEvent.click(await screen.findByRole('button', { name: '调拨入库' }))
    fireEvent.click(screen.getByTestId('transfer-material-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-transfer-1'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('mat-transfer-1'))

    fireEvent.change(screen.getByTestId('transfer-quantity-input'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('transfer-to-location-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-loc-b'))

    await waitFor(() => expect(screen.getByTestId('transfer-confirm-btn')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('transfer-confirm-btn'))

    expect(await screen.findByText('TF-CREATED-VISIBLE-001')).toBeInTheDocument()
    expect(screen.getByText('调拨深链物料')).toBeInTheDocument()
    expect(screen.getByText('2 瓶')).toBeInTheDocument()
    expect(screen.getByText('A冷藏柜')).toBeInTheDocument()
    expect(screen.getByText('B备用柜')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('调拨入库登记成功', {
      description: '已生成 TF-CREATED-VISIBLE-001，来源库位、目标库位、批次、库存流水和审计链路可按单号回看',
    })
  })

  it('removes a cancelled transfer from the current list when the follow-up refresh fails', async () => {
    vi.mocked(transferApi.getList)
      .mockResolvedValueOnce({
        list: [
          {
            id: 'transfer-cancel',
            inboundNo: 'TF-CANCEL-001',
            materialId: 'mat-transfer-1',
            materialName: '调拨深链物料',
            batchNo: 'BATCH-TF-001',
            quantity: 2,
            fromLocationId: 'loc-a',
            fromLocationName: 'A冷藏柜',
            toLocationId: 'loc-b',
            toLocationName: 'B备用柜',
            operator: 'admin',
            status: 'completed',
            remark: '',
            createdAt: '2026-06-20T01:00:00.000Z',
          },
        ],
        pagination: { total: 1, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(transferApi.delete).mockResolvedValueOnce({} as any)

    renderTransfers()

    expect(await screen.findByText('TF-CANCEL-001')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('撤销'))
    fireEvent.click(await screen.findByRole('button', { name: '确认撤销' }))

    await waitFor(() => expect(transferApi.delete).toHaveBeenCalledWith('transfer-cancel'))
    await waitFor(() => expect(screen.queryByText('确认撤销')).not.toBeInTheDocument())
    expect(screen.queryByText('TF-CANCEL-001')).not.toBeInTheDocument()
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
    expect(screen.getByText('共 0 条记录')).toBeInTheDocument()
  })

  it('explains the real location and audit effects before cancelling a transfer', async () => {
    renderTransfers()

    expect(await screen.findByText('TF-DEEP-001')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('撤销'))

    expect(await screen.findByRole('heading', { name: '确认撤销' })).toBeInTheDocument()
    expect(screen.getByText((content) => (
      content.includes('撤销后不会改变物料总库存')
      && content.includes('目标库位将调回来源库位')
      && content.includes('同步回滚批次库位余量')
      && content.includes('写入库存流水和审计记录')
    ))).toBeInTheDocument()
  })

  it('removes a cancelled fallback-created transfer when both follow-up refreshes fail', async () => {
    vi.mocked(transferApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 20 },
      } as any)
      .mockRejectedValueOnce(new Error('create refresh failed'))
      .mockRejectedValueOnce(new Error('delete refresh failed'))
    vi.mocked(transferApi.createInbound).mockResolvedValueOnce({
      id: 'transfer-created-then-cancelled',
      inboundNo: 'TF-CREATED-CANCELLED-001',
      materialId: 'mat-transfer-1',
      quantity: 2,
      fromLocationId: 'loc-a',
      toLocationId: 'loc-b',
    } as any)
    vi.mocked(transferApi.delete).mockResolvedValueOnce({} as any)

    renderTransfers()

    fireEvent.click(await screen.findByRole('button', { name: '调拨入库' }))
    fireEvent.click(screen.getByTestId('transfer-material-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-mat-transfer-1'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('mat-transfer-1'))

    fireEvent.change(screen.getByTestId('transfer-quantity-input'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('transfer-to-location-select').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-loc-b'))

    await waitFor(() => expect(screen.getByTestId('transfer-confirm-btn')).not.toBeDisabled())
    fireEvent.click(screen.getByTestId('transfer-confirm-btn'))

    expect(await screen.findByText('TF-CREATED-CANCELLED-001')).toBeInTheDocument()

    fireEvent.click(screen.getByTitle('撤销'))
    fireEvent.click(await screen.findByRole('button', { name: '确认撤销' }))

    await waitFor(() => expect(transferApi.delete).toHaveBeenCalledWith('transfer-created-then-cancelled'))
    expect(screen.queryByText('TF-CREATED-CANCELLED-001')).not.toBeInTheDocument()
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
    expect(screen.getByText('共 0 条记录')).toBeInTheDocument()
  })

  it('opens audit evidence from a transfer row so warehouse users do not search logs manually', async () => {
    renderTransfers(true)

    expect(await screen.findByText('TF-DEEP-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /审计证据 TF-DEEP-001/ }))

    expect(screen.getByTestId('location-path')).toHaveTextContent('/logs?keyword=TF-DEEP-001')
  })
})
