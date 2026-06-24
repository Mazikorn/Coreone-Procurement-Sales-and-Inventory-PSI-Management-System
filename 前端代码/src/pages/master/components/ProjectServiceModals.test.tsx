import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectCreateModal } from './ProjectCreateModal'
import { ProjectDeleteModal } from './ProjectDeleteModal'
import { ProjectEditModal } from './ProjectEditModal'

const bom = {
  id: 'bom-he-1',
  code: 'BOM-HE-001',
  name: 'HE制片BOM',
  version: 'v1',
  type: 'he',
  status: 'active',
  materialCount: 2,
  supportableSamples: 50,
  unitCost: 12.5,
  materials: [
    { id: 'mat-1', name: '苏木素', spec: '10ml', usagePerSample: 1, unit: 'ml', price: 5, stock: 20 },
  ],
}

const form = {
  type: 'he',
  code: 'PRJ-HE-001',
  name: 'HE制片',
  cycle: '1天',
  manager: '王坤强',
  status: 'active' as const,
  description: '用于常规制片',
  bomId: 'bom-he-1',
}

const editingRow = {
  id: 'project-1',
  code: 'PRJ-HE-001',
  name: 'HE制片',
  type: 'he',
  status: 'active',
  createdAt: '2026-06-01',
}

describe('Project service modals', () => {
  it('summarizes selected BOM and downstream chains before creating a service', () => {
    render(
      <ProjectCreateModal
        open
        form={form}
        createStep={2}
        bomOption="select"
        boms={[bom as any]}
        isSubmitting={false}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onSetCreateStep={vi.fn()}
        onSetBomOption={vi.fn()}
        onSubmit={vi.fn()}
      />,
    )

    expect(screen.getByText('检测服务结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：检测服务、BOM、出库、LIS对账、项目成本、审计记录')).toBeInTheDocument()
    expect(screen.getByText('服务 HE制片')).toBeInTheDocument()
    expect(screen.getByText('BOM HE制片BOM')).toBeInTheDocument()
    expect(screen.getByText('单样本成本 ¥12.50')).toBeInTheDocument()
  })

  it('makes missing BOM impact explicit before saving project BOM edits', () => {
    render(
      <ProjectEditModal
        open
        editingRow={editingRow as any}
        form={{ ...form, bomId: '' }}
        editTab="bom"
        boms={[bom as any]}
        isSubmitting={false}
        onClose={vi.fn()}
        onChange={vi.fn()}
        onSetEditTab={vi.fn()}
        onSubmit={vi.fn()}
        onOpenDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('检测服务变更确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：检测服务、BOM、出库、LIS对账、项目成本、审计记录')).toBeInTheDocument()
    expect(screen.getByText('BOM 未关联')).toBeInTheDocument()
    expect(screen.getByText('未关联BOM，后续出库、LIS对账和成本核算需要先补齐BOM')).toBeInTheDocument()
  })

  it('explains downstream business impact before deleting an unreferenced service', () => {
    render(
      <ProjectDeleteModal
        open
        editingRow={editingRow as any}
        deleteCheck={{
          project: { id: 'project-1', code: 'PRJ-HE-001', name: 'HE制片' },
          deletable: true,
          impacts: {
            bomCount: 0,
            outboundCount: 0,
            lisCaseCount: 0,
          },
          reasons: [],
        } as any}
        checkingDelete={false}
        isSubmitting={false}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )

    expect(screen.getByText('确定要删除该检测服务吗？')).toBeInTheDocument()
    expect(screen.getByText('未发现业务引用，可以删除；删除后该检测服务不会再用于新BOM绑定、项目出库、LIS对账、项目成本归集和审计筛选。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '确认删除' })).toBeEnabled()
  })
})
