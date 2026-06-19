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
