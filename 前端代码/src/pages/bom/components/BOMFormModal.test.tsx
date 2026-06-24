import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BOMFormModal } from './BOMFormModal'
import type { BOMForm } from '../hooks/useBOMPage'
import type { Material, Project } from '@/types'

const baseForm: BOMForm = {
  code: 'BOM-SVC',
  name: '服务候选BOM',
  version: 'v1.0',
  type: 'ihc',
  serviceId: '',
  description: '',
  status: 'active',
  supportableSamples: 0,
  feeStandardId: '',
  feeCategory: '',
  materials: [],
  generalReagents: [],
  generalConsumables: [],
  qualityControls: [],
}

const project = (patch: Partial<Project>): Project => ({
  id: 'project-1',
  code: 'PRJ-001',
  name: '检测服务',
  type: 'ihc',
  status: 'active',
  createdAt: '2026-06-19T00:00:00.000Z',
  updatedAt: '2026-06-19T00:00:00.000Z',
  ...patch,
})

const material = (patch: Partial<Material>): Material => ({
  id: 'mat-1',
  code: 'MAT-001',
  name: '苏木素',
  spec: '10ml',
  unit: 'ml',
  price: 10,
  stock: 20,
  minStock: 0,
  maxStock: 100,
  safetyStock: 5,
  categoryId: 'cat-1',
  status: 'active',
  createdAt: '2026-06-19T00:00:00.000Z',
  updatedAt: '2026-06-19T00:00:00.000Z',
  ...patch,
})

function renderModal(form: BOMForm, projects: Project[], materials: Material[] = []) {
  render(
    <BOMFormModal
      open
      type={form.code ? 'edit' : 'create'}
      form={form}
      allMaterials={materials}
      allProjects={projects}
      onClose={vi.fn()}
      onChange={vi.fn()}
      onSubmit={vi.fn()}
    />
  )
}

function openServiceOptions() {
  fireEvent.click(screen.getByText('不关联检测服务'))
  return screen.getByText('不关联检测服务').closest('[data-testid]')?.parentElement || document.body
}

describe('BOMFormModal service options', () => {
  it('excludes services already bound to another BOM when creating a BOM', () => {
    renderModal(
      { ...baseForm, code: '' },
      [
        project({ id: 'project-free', code: 'FREE', name: '未绑定服务' }),
        project({ id: 'project-bound', code: 'BOUND', name: '已绑定服务', bomId: 'bom-other' }),
      ]
    )

    const serviceArea = openServiceOptions()

    expect(within(serviceArea).getByText('FREE - 未绑定服务')).toBeInTheDocument()
    expect(within(serviceArea).queryByText('BOUND - 已绑定服务')).not.toBeInTheDocument()
  })

  it('keeps the currently selected bound service visible while editing its BOM', () => {
    renderModal(
      { ...baseForm, serviceId: 'project-current' },
      [
        project({ id: 'project-current', code: 'CUR', name: '当前已绑定服务', bomId: 'bom-current' }),
        project({ id: 'project-other', code: 'OTHER', name: '其它已绑定服务', bomId: 'bom-other' }),
      ]
    )

    expect(screen.getByText('CUR - 当前已绑定服务')).toBeInTheDocument()
  })

  it('keeps backend-controlled version read-only while editing a BOM', () => {
    renderModal({ ...baseForm, version: 'v1.3' }, [])

    expect(screen.getByDisplayValue('v1.3')).toHaveAttribute('readonly')
  })

  it('keeps backend-controlled BOM code read-only while editing a BOM', () => {
    renderModal({ ...baseForm, code: 'BOM-LOCKED' }, [])

    expect(screen.getByDisplayValue('BOM-LOCKED')).toHaveAttribute('readonly')
  })

  it('shows supportable samples as a read-only calculated value', () => {
    renderModal({ ...baseForm, supportableSamples: 12 }, [])

    expect(screen.getByDisplayValue('12')).toHaveAttribute('readonly')
  })

  it('summarizes BOM result and downstream chains before saving', () => {
    renderModal(
      {
        ...baseForm,
        serviceId: 'project-1',
        materials: [
          { materialId: 'mat-1', name: '苏木素', spec: '10ml', usagePerSample: 1.5, unit: 'ml' },
        ],
        generalReagents: [
          { materialId: 'mat-2', name: '缓冲液', spec: '100ml', usagePerSample: 0.5, unit: 'ml' },
        ],
        qualityControls: [
          { materialId: 'mat-3', name: '质控片', spec: '片', usagePerBatch: 2, unit: '片', coversSamples: 10 },
        ],
      },
      [project({ id: 'project-1', code: 'PRJ-001', name: '检测服务' })],
      [
        material({ id: 'mat-1', price: 10 }),
        material({ id: 'mat-2', price: 2 }),
        material({ id: 'mat-3', price: 5, unit: '片' }),
      ],
    )

    expect(screen.getByText('BOM结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：BOM、检测服务、自动出库、LIS对账、项目成本、审计记录')).toBeInTheDocument()
    expect(screen.getByText('关联服务 检测服务')).toBeInTheDocument()
    expect(screen.getByText('核心物料 1项')).toBeInTheDocument()
    expect(screen.getByText('扩展项 2项')).toBeInTheDocument()
    expect(screen.getByText('预估单样本材料成本 ¥17.00')).toBeInTheDocument()
  })
})
