import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { outboundApi } from '@/api/inventory'
import { bomApi, materialApi, projectApi } from '@/api/master'
import { reconciliationApi } from '@/api/reconciliation'
import { mapOutboundRecordToForm } from './Outbound'
import Outbound from './Outbound'
import type { Material } from '@/types'
import type { OutboundRecord } from '@/types'

vi.mock('@/api/inventory')
vi.mock('@/api/master')
vi.mock('@/api/reconciliation')
vi.mock('sonner')

const xlsxMocks = vi.hoisted(() => ({
  jsonToSheet: vi.fn((rows: unknown[]) => ({ rows })),
  bookNew: vi.fn(() => ({ Sheets: {}, SheetNames: [] })),
  bookAppendSheet: vi.fn(),
  writeFile: vi.fn(),
}))

vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: xlsxMocks.jsonToSheet,
    book_new: xlsxMocks.bookNew,
    book_append_sheet: xlsxMocks.bookAppendSheet,
  },
  writeFile: xlsxMocks.writeFile,
}))

const mockMaterial: Material = {
  id: 'material-1',
  code: 'M001',
  name: '苏木素',
  spec: '10ml',
  unit: '瓶',
  price: 10,
  stock: 10,
  minStock: 1,
  maxStock: 100,
  safetyStock: 5,
  categoryId: 'cat-1',
  status: 'active',
  createdAt: '',
  updatedAt: '',
}

describe('Outbound page material candidates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    vi.stubGlobal('React', React)
    window.history.replaceState(null, '', '/')

    vi.mocked(outboundApi.getList).mockResolvedValue({
      list: [],
      pagination: { total: 0, page: 1, pageSize: 10 },
    } as any)
    vi.mocked(outboundApi.getStats).mockResolvedValue({
      monthTotal: 0,
      completed: 0,
      pending: 0,
      cancelled: 0,
      quickCounts: { all: 0, today: 0, week: 0, month: 0 },
    } as any)
    vi.mocked(outboundApi.create).mockResolvedValue({} as any)
    vi.mocked(materialApi.getList).mockResolvedValue({
      list: [mockMaterial],
      pagination: { total: 1 },
    } as any)
    vi.mocked(materialApi.getDetail).mockResolvedValue({
      ...mockMaterial,
      batches: [
        {
          id: 'batch-1',
          materialId: mockMaterial.id,
          batchNo: 'BATCH-001',
          quantity: 10,
          remaining: 6,
          expiryDate: '2027-06-30',
          inboundId: 'inbound-1',
          inboundPrice: 12.5,
          status: 'normal',
          createdAt: '',
        },
      ],
    } as any)
    vi.mocked(projectApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(bomApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(reconciliationApi.getCases).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
  })

  it('refreshes active material candidates before opening create modal and blocks stale material submission', async () => {
    const staleMaterial = {
      ...mockMaterial,
      id: 'mat-stale-outbound',
      code: 'STALE-OUT',
      name: '已停用旧出库候选',
    } as Material
    vi.mocked(materialApi.getList)
      .mockResolvedValueOnce({ list: [staleMaterial], pagination: { total: 1 } } as any)
      .mockResolvedValueOnce({ list: [], pagination: { total: 0 } } as any)

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    await waitFor(() => expect(materialApi.getList).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: '出库登记' }))

    await waitFor(() => expect(materialApi.getList).toHaveBeenCalledTimes(2))
    expect(materialApi.getList).toHaveBeenLastCalledWith({ page: 1, pageSize: 999, status: 'active' })
    await waitFor(() => expect(screen.queryByText('已停用旧出库候选')).not.toBeInTheDocument())

    fireEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => expect(outboundApi.create).not.toHaveBeenCalled())
  })

  it('labels BOM outbound rows consistently in the table and selected export', async () => {
    const bomRecord = {
      id: 'out-bom-1',
      outboundNo: 'OB-BOM-001',
      type: 'bom',
      projectId: 'project-1',
      projectName: 'HE制片',
      caseNo: 'CASE-001',
      sampleCount: 2,
      items: [
        {
          id: 'item-1',
          outboundId: 'out-bom-1',
          materialId: 'material-1',
          materialName: '苏木素',
          batchId: 'batch-1',
          batchNo: 'BATCH-001',
          quantity: 3,
          unit: 'ml',
          unitCost: 10,
          totalCost: 30,
        },
      ],
      totalCost: 30,
      abcTotalCost: 45,
      feeAmount: 60,
      profit: 15,
      costStatus: 'costed',
      operator: 'admin',
      status: 'completed',
      remark: 'BOM带出',
      createdAt: '2026-06-20T01:00:00.000Z',
    } satisfies OutboundRecord

    vi.mocked(outboundApi.getList).mockResolvedValue({
      list: [bomRecord],
      pagination: { total: 1, page: 1, pageSize: 10 },
    } as any)

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    expect(await screen.findByText('OB-BOM-001')).toBeInTheDocument()
    expect(screen.getByText('BOM出库')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '编辑' })).not.toBeInTheDocument()

    const rowCheckbox = screen.getAllByRole('checkbox')[1]
    fireEvent.click(rowCheckbox)
    fireEvent.click(screen.getByRole('button', { name: '导出' }))

    await waitFor(() => expect(xlsxMocks.writeFile).toHaveBeenCalled())
    expect(xlsxMocks.jsonToSheet).toHaveBeenCalledWith([
      expect.objectContaining({
        出库单号: 'OB-BOM-001',
        类型: 'BOM出库',
      }),
    ])
  })

  it('does not offer transfer or scrap creation from the generic outbound form', async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))

    await waitFor(() => expect(screen.getByTestId('outbound-type-select')).toBeInTheDocument())
    fireEvent.click(screen.getByTestId('outbound-type-select').firstElementChild as Element)

    await waitFor(() => expect(screen.getByTestId('option-project')).toBeInTheDocument())
    expect(screen.queryByTestId('option-transfer')).not.toBeInTheDocument()
    expect(screen.queryByTestId('option-scrap')).not.toBeInTheDocument()
  })

  it('does not request LIS cases when warehouse users open outbound registration', async () => {
    localStorage.setItem('user', JSON.stringify({ role: 'warehouse_manager', username: 'wangkq' }))
    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))

    await waitFor(() => expect(screen.getByTestId('project-select')).toBeInTheDocument())
    expect(reconciliationApi.getCases).not.toHaveBeenCalled()
  })

  it('lets warehouse select an explicit batch for ordinary outbound and submits the batch fact', async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))

    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('material-1'))

    fireEvent.click(screen.getByTestId('outbound-batch-select-0').firstElementChild as Element)
    expect(await screen.findByTestId('option-batch-1')).toHaveTextContent('BATCH-001 (余6瓶 @¥12.50)')
    fireEvent.click(await screen.findByTestId('option-batch-1'))

    fireEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => expect(outboundApi.create).toHaveBeenCalled())
    expect(outboundApi.create).toHaveBeenCalledWith(expect.objectContaining({
      items: [expect.objectContaining({ materialId: 'material-1', batchId: 'batch-1', quantity: 1 })],
    }))
  })

  it('disables ordinary outbound submit when selected batch remaining is insufficient', async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('material-1'))

    fireEvent.click(screen.getByTestId('outbound-batch-select-0').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-batch-1'))
    fireEvent.change(screen.getByTestId('quantity-input-0'), { target: { value: '7' } })

    expect(await screen.findByText('出库数量不能超过批次剩余 6瓶')).toBeInTheDocument()
    expect(screen.getByTestId('submit-btn')).toBeDisabled()
    fireEvent.click(screen.getByTestId('submit-btn'))
    expect(outboundApi.create).not.toHaveBeenCalled()
  })

  it('shows BOM automatic batch allocation preview before submit', async () => {
    vi.mocked(projectApi.getList).mockResolvedValue({
      list: [{
        id: 'project-1',
        code: 'P001',
        name: 'HE制片',
        type: 'routine',
        bomId: 'bom-1',
        bomName: 'HE制片BOM',
        bomVersion: 'v1',
        status: 'active',
        createdAt: '',
      }],
      pagination: { total: 1 },
    } as any)
    vi.mocked(bomApi.getList).mockResolvedValue({
      list: [{
        id: 'bom-1',
        code: 'BOM-001',
        name: 'HE制片BOM',
        version: 'v1',
        type: 'routine',
        status: 'active',
        materialCount: 1,
        unitCost: 25,
        materials: [],
        versionHistory: [],
        createdAt: '',
        updatedAt: '',
      }],
      pagination: { total: 1 },
    } as any)
    vi.mocked(bomApi.getDetail).mockResolvedValue({
      id: 'bom-1',
      code: 'BOM-001',
      name: 'HE制片BOM',
      version: 'v1',
      type: 'routine',
      status: 'active',
      materialCount: 1,
      unitCost: 25,
      materials: [{
        id: 'material-1',
        name: '苏木素',
        spec: '10ml',
        usagePerSample: 2,
        unit: 'ml',
        price: 12.5,
        stock: 6,
        costRatio: 1,
      }],
      versionHistory: [],
      createdAt: '',
      updatedAt: '',
    } as any)

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.click((await screen.findByTestId('project-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-project-1'))
    fireEvent.change(screen.getByTestId('sample-count-input'), { target: { value: '2' } })

    expect(await screen.findByTestId('bom-batch-preview')).toBeInTheDocument()
    expect(screen.getByText('预计批次扣减')).toBeInTheDocument()
    expect(screen.getByText('BATCH-001 × 4ml')).toBeInTheDocument()
    expect(screen.getByText('可出库')).toBeInTheDocument()
  })

  it('disables BOM outbound submit when automatic batch availability is insufficient', async () => {
    vi.mocked(projectApi.getList).mockResolvedValue({
      list: [{
        id: 'project-1',
        code: 'P001',
        name: 'HE制片',
        type: 'routine',
        bomId: 'bom-1',
        bomName: 'HE制片BOM',
        bomVersion: 'v1',
        status: 'active',
        createdAt: '',
      }],
      pagination: { total: 1 },
    } as any)
    vi.mocked(bomApi.getList).mockResolvedValue({
      list: [{
        id: 'bom-1',
        code: 'BOM-001',
        name: 'HE制片BOM',
        version: 'v1',
        type: 'routine',
        status: 'active',
        materialCount: 1,
        unitCost: 25,
        materials: [],
        versionHistory: [],
        createdAt: '',
        updatedAt: '',
      }],
      pagination: { total: 1 },
    } as any)
    vi.mocked(bomApi.getDetail).mockResolvedValue({
      id: 'bom-1',
      code: 'BOM-001',
      name: 'HE制片BOM',
      version: 'v1',
      type: 'routine',
      status: 'active',
      materialCount: 1,
      unitCost: 25,
      materials: [{
        id: 'material-1',
        name: '苏木素',
        spec: '10ml',
        usagePerSample: 2,
        unit: 'ml',
        price: 12.5,
        stock: 3,
        costRatio: 1,
      }],
      versionHistory: [],
      createdAt: '',
      updatedAt: '',
    } as any)
    vi.mocked(materialApi.getDetail).mockResolvedValue({
      ...mockMaterial,
      batches: [
        {
          id: 'batch-1',
          materialId: mockMaterial.id,
          batchNo: 'BATCH-001',
          quantity: 10,
          remaining: 3,
          expiryDate: '2027-06-30',
          inboundId: 'inbound-1',
          inboundPrice: 12.5,
          status: 'normal',
          createdAt: '',
        },
      ],
    } as any)

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.click((await screen.findByTestId('project-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-project-1'))
    fireEvent.change(screen.getByTestId('sample-count-input'), { target: { value: '2' } })

    expect(await screen.findByText('批次库存不足：需要 4ml，可用 3ml')).toBeInTheDocument()
    expect(screen.getByTestId('submit-btn')).toBeDisabled()
    fireEvent.click(screen.getByTestId('submit-btn'))
    expect(outboundApi.create).not.toHaveBeenCalled()
  })
})

describe('mapOutboundRecordToForm', () => {
  it('preserves selected batch when editing an outbound record', () => {
    const record: OutboundRecord = {
      id: 'out-1',
      outboundNo: 'OB-001',
      type: 'project',
      projectId: 'project-1',
      projectName: 'HE制片',
      caseNo: 'CASE-001',
      items: [
        {
          id: 'item-1',
          outboundId: 'out-1',
          materialId: 'material-1',
          materialName: '苏木素',
          batchId: 'batch-late',
          batchNo: 'BATCH-LATE',
          quantity: 3,
          unit: 'ml',
          unitCost: 10,
          totalCost: 30,
          usage: 'external',
          receiver: '外部实验室',
        },
      ],
      totalCost: 30,
      operator: 'admin',
      status: 'completed',
      remark: '保留批次',
      createdAt: '2026-06-17 09:00:00',
    }

    expect(mapOutboundRecordToForm(record)).toMatchObject({
      type: 'project',
      projectId: 'project-1',
      caseNo: 'CASE-001',
      items: [
        {
          materialId: 'material-1',
          batchId: 'batch-late',
          quantity: 3,
          usage: 'external',
          receiver: '外部实验室',
        },
      ],
      remark: '保留批次',
    })
  })
})
