import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BOMFormModal } from './BOMFormModal'
import type { BOMForm } from '../hooks/useBOMPage'
import type { Project } from '@/types'

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

function renderModal(form: BOMForm, projects: Project[]) {
  render(
    <BOMFormModal
      open
      type={form.code ? 'edit' : 'create'}
      form={form}
      allMaterials={[]}
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
})
