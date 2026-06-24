import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import * as React from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { outboundApi } from '@/api/inventory'
import { bomApi, materialApi, projectApi } from '@/api/master'
import { reconciliationApi } from '@/api/reconciliation'
import { toast } from 'sonner'
import { mapOutboundRecordToForm } from './Outbound'
import Outbound from './Outbound'
import type { Material } from '@/types'
import type { OutboundRecord } from '@/types'

vi.mock('@/api/inventory')
vi.mock('@/api/master')
vi.mock('@/api/reconciliation')
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

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

function LocationProbe() {
  const location = useLocation()
  return React.createElement('div', { 'data-testid': 'location-path' }, `${location.pathname}${location.search}`)
}

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

const mockProject = {
  id: 'project-1',
  code: 'P001',
  name: 'HE制片',
  type: 'routine',
  status: 'active',
  createdAt: '',
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
    vi.mocked(projectApi.getList).mockResolvedValue({ list: [mockProject], pagination: { total: 1 } } as any)
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
      projectName: undefined,
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

  it('shows usage and receiver in outbound detail so warehouse users can verify handoff without offline checks', async () => {
    const outboundRecord = {
      id: 'out-external-1',
      outboundNo: 'OB-EXT-001',
      type: 'project',
      projectId: 'project-1',
      projectName: 'HE制片',
      items: [
        {
          id: 'item-external-1',
          outboundId: 'out-external-1',
          materialId: 'material-1',
          materialName: '苏木素',
          batchId: 'batch-1',
          batchNo: 'BATCH-001',
          quantity: 2,
          unit: 'ml',
          unitCost: 12.5,
          totalCost: 25,
          usage: 'external',
          receiver: '外部病理中心',
        },
      ],
      totalCost: 25,
      abcTotalCost: 25,
      feeAmount: 0,
      profit: 0,
      costStatus: 'costed',
      operator: 'admin',
      status: 'completed',
      remark: '外给回看',
      createdAt: '2026-06-20T01:00:00.000Z',
    } satisfies OutboundRecord

    vi.mocked(outboundApi.getList).mockResolvedValue({
      list: [outboundRecord],
      pagination: { total: 1, page: 1, pageSize: 10 },
    } as any)

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    expect(await screen.findByText('OB-EXT-001')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '详情' }))

    expect(await screen.findByText('出库详情')).toBeInTheDocument()
    expect(screen.getByText('外给')).toBeInTheDocument()
    expect(screen.getByText('外部病理中心')).toBeInTheDocument()
  })

  it('links outbound detail to the unified audit timeline with the outbound number already filtered', async () => {
    const outboundRecord = {
      id: 'out-audit-1',
      outboundNo: 'OB-AUDIT-001',
      type: 'project',
      projectId: 'project-1',
      projectName: 'HE制片',
      items: [
        {
          id: 'item-audit-1',
          outboundId: 'out-audit-1',
          materialId: 'material-1',
          materialName: '苏木素',
          batchId: 'batch-1',
          batchNo: 'BATCH-001',
          quantity: 2,
          unit: 'ml',
          unitCost: 12.5,
          totalCost: 25,
        },
      ],
      totalCost: 25,
      operator: 'admin',
      status: 'completed',
      createdAt: '2026-06-20T01:00:00.000Z',
    } satisfies OutboundRecord

    vi.mocked(outboundApi.getList).mockResolvedValue({
      list: [outboundRecord],
      pagination: { total: 1, page: 1, pageSize: 10 },
    } as any)

    render(React.createElement(
      MemoryRouter,
      null,
      React.createElement(Outbound),
      React.createElement(LocationProbe),
    ))

    expect(await screen.findByText('OB-AUDIT-001')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '详情' }))
    fireEvent.click(await screen.findByRole('button', { name: '审计证据' }))

    expect(screen.getByTestId('location-path')).toHaveTextContent('/logs?keyword=OB-AUDIT-001')
  })

  it('opens a prefilled return draft from an outbound detail item', async () => {
    const outboundRecord = {
      id: 'out-return-1',
      outboundNo: 'OB-RETURN-001',
      type: 'project',
      projectId: 'project-1',
      projectName: 'HE制片',
      items: [
        {
          id: 'item-return-1',
          outboundId: 'out-return-1',
          materialId: 'material-1',
          materialName: '苏木素',
          batchId: 'batch-1',
          batchNo: 'BATCH-001',
          quantity: 2,
          unit: '瓶',
          unitCost: 12.5,
          totalCost: 25,
          usage: 'self',
          receiver: '张三',
        },
      ],
      totalCost: 25,
      operator: 'admin',
      status: 'completed',
      createdAt: '2026-06-20T01:00:00.000Z',
    } satisfies OutboundRecord

    vi.mocked(outboundApi.getList).mockResolvedValue({
      list: [outboundRecord],
      pagination: { total: 1, page: 1, pageSize: 10 },
    } as any)

    render(React.createElement(
      MemoryRouter,
      null,
      React.createElement(Outbound),
      React.createElement(LocationProbe),
    ))

    expect(await screen.findByText('OB-RETURN-001')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '详情' }))
    fireEvent.click(await screen.findByRole('button', { name: /退库 苏木素 BATCH-001/ }))

    const locationText = screen.getByTestId('location-path').textContent || ''
    const target = new URL(locationText, 'http://localhost')
    expect(target.pathname).toBe('/returns')
    expect(target.searchParams.get('action')).toBe('create')
    expect(target.searchParams.get('outboundItemId')).toBe('item-return-1')
    expect(target.searchParams.get('quantity')).toBe('1')
    expect(target.searchParams.get('reason')).toBe('unused')
    expect(target.searchParams.get('remark')).toBe('来自出库详情退库：OB-RETURN-001 / 苏木素 / BATCH-001')
  })

  it('opens audit evidence directly from an outbound row so users do not open detail first', async () => {
    const outboundRecord = {
      id: 'out-audit-row-1',
      outboundNo: 'OB-AUDIT-ROW-001',
      type: 'project',
      projectId: 'project-1',
      projectName: 'HE制片',
      items: [
        {
          id: 'item-audit-row-1',
          outboundId: 'out-audit-row-1',
          materialId: 'material-1',
          materialName: '苏木素',
          batchId: 'batch-1',
          batchNo: 'BATCH-001',
          quantity: 2,
          unit: 'ml',
          unitCost: 12.5,
          totalCost: 25,
        },
      ],
      totalCost: 25,
      operator: 'admin',
      status: 'completed',
      createdAt: '2026-06-20T01:00:00.000Z',
    } satisfies OutboundRecord

    vi.mocked(outboundApi.getList).mockResolvedValue({
      list: [outboundRecord],
      pagination: { total: 1, page: 1, pageSize: 10 },
    } as any)

    render(React.createElement(
      MemoryRouter,
      null,
      React.createElement(Outbound),
      React.createElement(LocationProbe),
    ))

    expect(await screen.findByText('OB-AUDIT-ROW-001')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /审计证据 OB-AUDIT-ROW-001/ }))

    expect(screen.getByTestId('location-path')).toHaveTextContent('/logs?keyword=OB-AUDIT-ROW-001')
  })

  it('opens project reconciliation directly from an outbound row so users do not search the project manually', async () => {
    const outboundRecord = {
      id: 'out-reconcile-row-1',
      outboundNo: 'OB-RECONCILE-ROW-001',
      type: 'project',
      projectId: 'project-1',
      projectName: 'HE制片',
      items: [
        {
          id: 'item-reconcile-row-1',
          outboundId: 'out-reconcile-row-1',
          materialId: 'material-1',
          materialName: '苏木素',
          batchId: 'batch-1',
          batchNo: 'BATCH-001',
          quantity: 2,
          unit: 'ml',
          unitCost: 12.5,
          totalCost: 25,
        },
      ],
      totalCost: 25,
      operator: 'admin',
      status: 'completed',
      createdAt: '2026-06-20T01:00:00.000Z',
    } satisfies OutboundRecord

    vi.mocked(outboundApi.getList).mockResolvedValue({
      list: [outboundRecord],
      pagination: { total: 1, page: 1, pageSize: 10 },
    } as any)

    render(React.createElement(
      MemoryRouter,
      null,
      React.createElement(Outbound),
      React.createElement(LocationProbe),
    ))

    expect(await screen.findByText('OB-RECONCILE-ROW-001')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /项目对账 HE制片/ }))

    expect(screen.getByTestId('location-path')).toHaveTextContent('/reconciliation?projectId=project-1')
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

  it('opens outbound registration directly when the dashboard passes action=create', async () => {
    window.history.replaceState(null, '', '/outbound?action=create')

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    expect(await screen.findByTestId('outbound-type-select')).toBeInTheDocument()
    expect(materialApi.getList).toHaveBeenLastCalledWith({ page: 1, pageSize: 999, status: 'active' })
  })

  it('does not request LIS cases when warehouse users open outbound registration', async () => {
    localStorage.setItem('user', JSON.stringify({ role: 'warehouse_manager', username: 'wangkq' }))
    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))

    await waitFor(() => expect(screen.getByTestId('project-select')).toBeInTheDocument())
    expect(reconciliationApi.getCases).not.toHaveBeenCalled()
  })

  it('uses the LIS case project default BOM to show batch deduction without manual BOM lookup', async () => {
    localStorage.setItem('user', JSON.stringify({ role: 'technician', username: 'tech' }))
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
    vi.mocked(reconciliationApi.getCases).mockResolvedValue({
      list: [{
        id: 'case-1',
        caseNo: 'CASE-LIS-001',
        projectId: 'project-1',
        projectName: 'HE制片',
        bomId: null,
        hasBom: true,
      }],
      pagination: { total: 1 },
    } as any)

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.click((await screen.findByTestId('lis-case-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-CASE-LIS-001'))
    fireEvent.change(screen.getByTestId('sample-count-input'), { target: { value: '2' } })

    await waitFor(() => expect(bomApi.getDetail).toHaveBeenCalledWith('bom-1'))
    expect(screen.getByTestId('project-select')).toHaveTextContent('HE制片')
    expect(screen.getByTestId('bom-select')).toHaveTextContent('HE制片BOM')
    expect(await screen.findByTestId('bom-batch-preview')).toBeInTheDocument()
    expect(screen.getByText('BATCH-001 × 4ml')).toBeInTheDocument()
    expect(screen.getByText('可出库')).toBeInTheDocument()
  })

  it('lets warehouse select an explicit batch for ordinary outbound and submits the batch fact', async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.click((await screen.findByTestId('project-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-project-1'))

    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('material-1'))

    fireEvent.click(screen.getByTestId('outbound-batch-select-0').firstElementChild as Element)
    expect(await screen.findByTestId('option-batch-1')).toHaveTextContent('BATCH-001 (余6瓶 @¥12.50)')
    fireEvent.click(await screen.findByTestId('option-batch-1'))

    fireEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => expect(outboundApi.create).toHaveBeenCalled())
    expect(outboundApi.create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      items: [expect.objectContaining({ materialId: 'material-1', batchId: 'batch-1', quantity: 1 })],
    }))
  })

  it('auto-selects the only available batch for ordinary outbound so users do not confirm the obvious batch', async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.click((await screen.findByTestId('project-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-project-1'))

    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('material-1'))
    expect(await screen.findByText('按所选批次扣减库存和成本')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => expect(outboundApi.create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      items: [expect.objectContaining({
        materialId: 'material-1',
        batchId: 'batch-1',
        quantity: 1,
      })],
    })))
  })

  it('blocks ordinary outbound when available batches exist but the user has not selected one', async () => {
    vi.mocked(materialApi.getDetail).mockResolvedValue({
      ...mockMaterial,
      batches: [
        {
          id: 'batch-early',
          materialId: mockMaterial.id,
          batchNo: 'BATCH-EARLY',
          quantity: 10,
          remaining: 3,
          expiryDate: '2027-01-31',
          inboundId: 'inbound-early',
          inboundPrice: 12,
          status: 'normal',
          createdAt: '',
        },
        {
          id: 'batch-late',
          materialId: mockMaterial.id,
          batchNo: 'BATCH-LATE',
          quantity: 10,
          remaining: 4,
          expiryDate: '2027-06-30',
          inboundId: 'inbound-late',
          inboundPrice: 13,
          status: 'normal',
          createdAt: '',
        },
      ],
    } as any)

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.click((await screen.findByTestId('project-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-project-1'))

    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('material-1'))
    expect(await screen.findByText('请选择批次，系统会按批次扣减库存和成本')).toBeInTheDocument()
    expect(screen.getByTestId('submit-btn')).toBeDisabled()

    fireEvent.click(screen.getByTestId('submit-btn'))

    expect(outboundApi.create).not.toHaveBeenCalled()
  })

  it('blocks ordinary outbound when the selected material has no available batch', async () => {
    vi.mocked(materialApi.getDetail).mockResolvedValue({
      ...mockMaterial,
      batches: [],
    } as any)

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.click((await screen.findByTestId('project-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-project-1'))

    expect(await screen.findByText('当前物料没有可用批次，不能直接出库')).toBeInTheDocument()
    expect(screen.getByText('普通出库缺少可扣减批次')).toBeInTheDocument()
    expect(screen.getByText('下一步：先补入库或调拨可用批次，再登记本次出库。')).toBeInTheDocument()
    expect(screen.getByTestId('submit-btn')).toBeDisabled()

    fireEvent.click(screen.getByTestId('submit-btn'))

    expect(outboundApi.create).not.toHaveBeenCalled()
  })

  it('focuses the newly created outbound record so users can confirm the saved result', async () => {
    window.history.replaceState(null, '', '/outbound?status=cancelled&type=bom')
    vi.mocked(outboundApi.create).mockResolvedValueOnce({
      id: 'out-created',
      outboundNo: 'OUT-CREATED-001',
      status: 'completed',
    } as any)

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.change(await screen.findByPlaceholderText('搜索出库单号/耗材名称/批号...'), { target: { value: 'old-filter' } })
    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.click((await screen.findByTestId('project-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-project-1'))

    fireEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => expect(screen.getByPlaceholderText('搜索出库单号/耗材名称/批号...')).toHaveValue('OUT-CREATED-001'))
    await waitFor(() => {
      expect(outboundApi.getList).toHaveBeenCalledWith(expect.objectContaining({
        keyword: 'OUT-CREATED-001',
        status: undefined,
        type: undefined,
      }))
    })
  })

  it('keeps the newly created outbound record visible when the follow-up list refresh fails', async () => {
    vi.mocked(outboundApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 10 },
      } as any)
      .mockRejectedValueOnce(new Error('refresh failed'))
    vi.mocked(outboundApi.create).mockResolvedValueOnce({
      id: 'out-created-visible',
      outboundNo: 'OUT-CREATED-VISIBLE-001',
      type: 'project',
      projectId: 'project-1',
      totalCost: 12.5,
      status: 'completed',
      createdAt: '2026-06-22T10:00:00.000Z',
    } as any)

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.click((await screen.findByTestId('project-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-project-1'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('material-1'))
    fireEvent.click(screen.getByTestId('outbound-batch-select-0').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-batch-1'))
    fireEvent.click(screen.getByTestId('submit-btn'))

    expect(await screen.findByText('OUT-CREATED-VISIBLE-001')).toBeInTheDocument()
    expect(screen.getByText('HE制片')).toBeInTheDocument()
    expect(screen.getByText('苏木素')).toBeInTheDocument()
    expect(screen.getByText('BATCH-001')).toBeInTheDocument()
    expect(screen.getByText('1 瓶')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('出库登记成功', {
      description: '已生成 OUT-CREATED-VISIBLE-001，批次库存、成本和审计可按单号回看；项目对账请按项目进入消耗对账查看实际出库影响',
    })
    expect(toast.error).not.toHaveBeenCalledWith('出库登记失败')
  })

  it('keeps edited outbound facts visible when the follow-up list refresh fails', async () => {
    const existingRecord = {
      id: 'out-edit-visible',
      outboundNo: 'OUT-EDIT-VISIBLE-001',
      type: 'project',
      projectId: 'project-1',
      projectName: 'HE制片',
      items: [
        {
          id: 'item-old',
          outboundId: 'out-edit-visible',
          materialId: 'material-1',
          materialName: '苏木素',
          batchId: 'batch-old',
          batchNo: 'BATCH-OLD',
          quantity: 1,
          unit: '瓶',
          unitCost: 10,
          totalCost: 10,
          usage: 'self',
        },
      ],
      totalCost: 10,
      operator: 'admin',
      status: 'completed',
      remark: '旧备注',
      createdAt: '2026-06-22T09:00:00.000Z',
    } satisfies OutboundRecord
    let didUpdate = false
    vi.mocked(outboundApi.getList).mockImplementation(async () => {
      if (didUpdate) throw new Error('refresh failed')
      return {
        list: [existingRecord],
        pagination: { total: 1, page: 1, pageSize: 10 },
      } as any
    })
    vi.mocked(outboundApi.update).mockImplementation(async () => {
      didUpdate = true
      return {
        id: 'out-edit-visible',
        totalCost: 25,
      } as any
    })

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    expect(await screen.findByText('OUT-EDIT-VISIBLE-001')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('material-1'))
    fireEvent.click(screen.getByTestId('outbound-batch-select-0').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-batch-1'))
    fireEvent.change(screen.getByTestId('quantity-input-0'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('usage-select-0').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-external'))
    fireEvent.change(screen.getByTestId('receiver-input-0'), { target: { value: '外部实验室' } })
    fireEvent.change(screen.getByTestId('remark-input'), { target: { value: '已按现场交接更新' } })
    fireEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => expect(outboundApi.update).toHaveBeenCalledWith('out-edit-visible', expect.objectContaining({
      projectId: 'project-1',
      items: [expect.objectContaining({
        materialId: 'material-1',
        batchId: 'batch-1',
        quantity: 2,
        usage: 'external',
        receiver: '外部实验室',
      })],
      remark: '已按现场交接更新',
    })))
    expect(await screen.findByText('BATCH-001')).toBeInTheDocument()
    expect(screen.getByText('2 瓶')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '详情' }))
    expect(await screen.findAllByText('¥25.00')).not.toHaveLength(0)
    expect(await screen.findByText('外部实验室')).toBeInTheDocument()
    expect(screen.getByText('已按现场交接更新')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('出库更新成功', {
      description: '已同步批次库存、成本和审计记录；项目对账请按项目进入消耗对账查看实际出库影响',
    })
    expect(toast.error).not.toHaveBeenCalledWith('出库更新失败')
  })

  it('removes a deleted fallback-created outbound when both follow-up refreshes fail', async () => {
    vi.mocked(outboundApi.getList)
      .mockResolvedValueOnce({
        list: [],
        pagination: { total: 0, page: 1, pageSize: 10 },
      } as any)
      .mockRejectedValueOnce(new Error('create refresh failed'))
      .mockRejectedValueOnce(new Error('delete refresh failed'))
    vi.mocked(outboundApi.create).mockResolvedValueOnce({
      id: 'out-created-then-deleted',
      outboundNo: 'OUT-CREATED-DELETED-001',
      type: 'project',
      projectId: 'project-1',
      totalCost: 12.5,
      status: 'completed',
      createdAt: '2026-06-22T10:00:00.000Z',
    } as any)
    vi.mocked(outboundApi.delete).mockResolvedValueOnce({} as any)

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.click((await screen.findByTestId('project-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-project-1'))
    await waitFor(() => expect(materialApi.getDetail).toHaveBeenCalledWith('material-1'))
    fireEvent.click(screen.getByTestId('outbound-batch-select-0').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-batch-1'))
    fireEvent.click(screen.getByTestId('submit-btn'))

    expect(await screen.findByText('OUT-CREATED-DELETED-001')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }))

    await waitFor(() => expect(outboundApi.delete).toHaveBeenCalledWith('out-created-then-deleted'))
    expect(screen.queryByText('OUT-CREATED-DELETED-001')).not.toBeInTheDocument()
    expect(screen.getByText('暂无数据')).toBeInTheDocument()
    expect(screen.getByText('共 0 条记录')).toBeInTheDocument()
  })

  it('blocks ordinary outbound without project so stock, cost and reconciliation can trace ownership', async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    await waitFor(() => expect(screen.getByTestId('project-select')).toBeInTheDocument())

    fireEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => expect(outboundApi.create).not.toHaveBeenCalled())
    expect(toast.error).toHaveBeenCalledWith('请选择检测项目，出库必须归属到项目才能进入成本和对账')
  })

  it('requires receiver when ordinary outbound is marked as external usage', async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.click((await screen.findByTestId('project-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-project-1'))
    fireEvent.click(screen.getByTestId('usage-select-0').firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-external'))

    fireEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => expect(outboundApi.create).not.toHaveBeenCalled())
    expect(toast.error).toHaveBeenCalledWith('外给出库必须填写接收方，便于后续对账和追踪')

    fireEvent.change(screen.getByTestId('receiver-input-0'), { target: { value: '外部实验室' } })
    fireEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => expect(outboundApi.create).toHaveBeenCalled())
    expect(outboundApi.create).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      items: [expect.objectContaining({ usage: 'external', receiver: '外部实验室' })],
    }))
  })

  it('explains the next step when BOM outbound has a case number but no costable BOM', async () => {
    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.change(await screen.findByTestId('case-no-input'), { target: { value: 'CASE-MANUAL-001' } })
    fireEvent.change(screen.getByTestId('sample-count-input'), { target: { value: '2' } })
    fireEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => expect(outboundApi.createBom).not.toHaveBeenCalled())
    expect(toast.error).toHaveBeenCalledWith('请选择已配置BOM的检测服务或LIS病例，BOM出库必须有BOM才能扣减库存并进入成本核算')
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

  it('confirms BOM outbound downstream facts after successful submission', async () => {
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
    vi.mocked(outboundApi.createBom).mockResolvedValueOnce({
      id: 'out-bom-created',
      outboundNo: 'OUT-BOM-CREATED-001',
      type: 'bom',
      projectId: 'project-1',
      sampleCount: 2,
      totalCost: 50,
      abcTotalCost: 75,
      costStatus: 'cost_calculated',
      status: 'completed',
      createdAt: '2026-06-23T10:00:00.000Z',
    } as any)

    render(React.createElement(MemoryRouter, null, React.createElement(Outbound)))

    fireEvent.click(await screen.findByRole('button', { name: '出库登记' }))
    fireEvent.click((await screen.findByTestId('project-select')).firstElementChild as Element)
    fireEvent.click(await screen.findByTestId('option-project-1'))
    fireEvent.change(screen.getByTestId('sample-count-input'), { target: { value: '2' } })

    expect(await screen.findByTestId('bom-batch-preview')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => expect(outboundApi.createBom).toHaveBeenCalledWith(expect.objectContaining({
      bomId: 'bom-1',
      projectId: 'project-1',
      sampleCount: 2,
    })))
    expect(await screen.findByText('OUT-BOM-CREATED-001')).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('BOM出库登记成功', {
      description: '已生成 OUT-BOM-CREATED-001，批次库存、BOM用量、ABC成本、成本异常和审计可按单号回看；项目对账请按项目进入消耗对账查看实际出库影响',
    })
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
          batchNo: 'BATCH-LATE',
          unitCost: 10,
          quantity: 3,
          usage: 'external',
          receiver: '外部实验室',
        },
      ],
      remark: '保留批次',
    })
  })
})
