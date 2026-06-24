import { render, screen } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { bomApi, materialApi } from '@/api/master'
import { reconciliationApi } from '@/api/reconciliation'
import OutboundFormModal, { type FormData } from './OutboundFormModal'

vi.mock('@/api/master')
vi.mock('@/api/reconciliation')
vi.mock('@/lib/permissions', () => ({
  getUserRole: () => 'technician',
}))

const material = {
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

const project = {
  id: 'project-1',
  code: 'P001',
  name: 'HE制片',
  type: 'routine',
  status: 'active',
  bomId: 'bom-1',
  bomName: 'HE制片BOM',
  createdAt: '',
}

const projectWithoutBom = {
  ...project,
  id: 'project-no-bom',
  name: '未配置BOM检测项目',
  bomId: undefined,
  bomName: undefined,
}

const baseForm: FormData = {
  type: 'project',
  projectId: 'project-1',
  items: [],
  remark: '',
}

describe('OutboundFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(bomApi.getList).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
    vi.mocked(bomApi.getDetail).mockResolvedValue({ id: 'bom-1', name: 'HE制片BOM', materials: [] } as any)
    vi.mocked(materialApi.getDetail).mockResolvedValue({
      ...material,
      batches: [
        {
          id: 'batch-1',
          materialId: 'material-1',
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
    vi.mocked(reconciliationApi.getCases).mockResolvedValue({ list: [], pagination: { total: 0 } } as any)
  })

  it('summarizes ordinary outbound result and downstream chains before submit', async () => {
    render(
      <OutboundFormModal
        open
        editRecordId={null}
        form={{
          ...baseForm,
          items: [{
            materialId: 'material-1',
            batchId: 'batch-1',
            batchNo: 'BATCH-001',
            quantity: 2,
            usage: 'external',
            receiver: '外部实验室',
          }],
        }}
        materials={[material as any]}
        projects={[project as any]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onFormChange={vi.fn()}
      />,
    )

    expect(screen.getByText('出库结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：库存、批次、项目成本、项目消耗对账、审计记录')).toBeInTheDocument()
    expect(screen.getByText('关联项目 HE制片')).toBeInTheDocument()
    expect(await screen.findByText('苏木素 / BATCH-001 -2瓶 / 扣减后剩余 4瓶 -> 外部实验室')).toBeInTheDocument()
  })

  it('summarizes BOM outbound result and downstream chains before submit', async () => {
    render(
      <OutboundFormModal
        open
        editRecordId={null}
        form={{
          ...baseForm,
          bomId: 'bom-1',
          caseNo: 'CASE-001',
          sampleCount: 2,
        }}
        materials={[material as any]}
        projects={[project as any]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onFormChange={vi.fn()}
      />,
    )

    expect(screen.getByText('出库结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：库存、批次、BOM、项目成本、项目消耗对账、审计记录')).toBeInTheDocument()
    expect(screen.getByText('关联项目 HE制片')).toBeInTheDocument()
    expect(screen.getByText('病例号 CASE-001')).toBeInTheDocument()
    expect(screen.getByText('样本数 2')).toBeInTheDocument()
  })

  it('explains the next step before submitting a case-based outbound without a costable BOM', () => {
    render(
      <OutboundFormModal
        open
        editRecordId={null}
        form={{
          ...baseForm,
          projectId: 'project-no-bom',
          caseNo: 'CASE-MANUAL-001',
          sampleCount: 2,
        }}
        materials={[material as any]}
        projects={[projectWithoutBom as any]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onFormChange={vi.fn()}
      />,
    )

    expect(screen.getByText('BOM出库缺少可计费配置')).toBeInTheDocument()
    expect(screen.getByText('当前病例/样本数会触发BOM自动出库，但所选检测项目未绑定BOM。')).toBeInTheDocument()
    expect(screen.getByText('下一步：先在检测项目维护中绑定BOM，或选择已配置BOM的LIS病例。')).toBeInTheDocument()
  })

  it('explains how to unblock BOM outbound when automatic batch availability is insufficient', async () => {
    vi.mocked(bomApi.getDetail).mockResolvedValueOnce({
      id: 'bom-1',
      name: 'HE制片BOM',
      materials: [{
        id: 'material-1',
        name: '苏木素',
        usagePerSample: 4,
        unit: '瓶',
      }],
    } as any)

    render(
      <OutboundFormModal
        open
        editRecordId={null}
        form={{
          ...baseForm,
          bomId: 'bom-1',
          caseNo: 'CASE-STOCK-LOW',
          sampleCount: 2,
        }}
        materials={[material as any]}
        projects={[project as any]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onFormChange={vi.fn()}
      />,
    )

    expect(await screen.findByText('批次库存不足：需要 8瓶，可用 6瓶')).toBeInTheDocument()
    expect(screen.getByText('BOM批次不足，暂不能提交')).toBeInTheDocument()
    expect(screen.getByText('下一步：先补入库或调拨可用批次，再重新提交本次BOM出库。')).toBeInTheDocument()
    expect(screen.getByText('系统会继续保留病例号、样本数和BOM预览，避免重复录入。')).toBeInTheDocument()
  })

  it('blocks ordinary outbound with no available batch and explains the operational next step', async () => {
    vi.mocked(materialApi.getDetail).mockResolvedValueOnce({
      ...material,
      batches: [],
    } as any)

    render(
      <OutboundFormModal
        open
        editRecordId={null}
        form={{
          ...baseForm,
          items: [{
            materialId: 'material-1',
            quantity: 1,
          }],
        }}
        materials={[material as any]}
        projects={[project as any]}
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        onFormChange={vi.fn()}
      />,
    )

    expect(await screen.findByText('当前物料没有可用批次，不能直接出库')).toBeInTheDocument()
    expect(screen.getByText('普通出库缺少可扣减批次')).toBeInTheDocument()
    expect(screen.getByText('下一步：先补入库或调拨可用批次，再登记本次出库。')).toBeInTheDocument()
    expect(screen.getByText('系统会保留已选项目、物料、数量和用途，避免重新录入。')).toBeInTheDocument()
    expect(screen.getByTestId('submit-btn')).toBeDisabled()
  })
})
