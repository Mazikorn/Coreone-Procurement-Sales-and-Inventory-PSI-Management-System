import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EditCaseModal } from './EditCaseModal'
import type { LisCase, ProjectReconcile } from '../hooks/useReconciliationPage'

const unmatchedCase: LisCase = {
  id: 'case-1',
  case_no: 'CASE-001',
  project_id: '',
  project_name: '未知项目',
  operator: 'lis',
  operate_time: '2026-06-20 09:00:00',
  status: 'unmatched',
  projectName: '未知项目',
  hasBom: false,
}

const projects: ProjectReconcile[] = [{
  id: 'project-1',
  code: 'P-001',
  name: '已配置BOM项目',
  bom_id: 'bom-1',
  type: 'ihc',
  case_count: 0,
  outbound_count: 0,
  hasBom: true,
  boms: [{ id: 'bom-1', code: 'BOM-001', name: 'BOM-001' }],
}]

describe('EditCaseModal', () => {
  it('moves an unmatched case to modified when linking a project with BOM', () => {
    const setEditCaseProjectId = vi.fn()
    const setEditCaseStatus = vi.fn()

    render(
      <EditCaseModal
        open
        editCaseTarget={unmatchedCase}
        editCaseProjectId=""
        setEditCaseProjectId={setEditCaseProjectId}
        editCaseStatus="unmatched"
        setEditCaseStatus={setEditCaseStatus}
        projects={projects}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    fireEvent.click(screen.getAllByText('请选择')[0])
    fireEvent.click(screen.getByTestId('option-project-1'))

    expect(setEditCaseProjectId).toHaveBeenCalledWith('project-1')
    expect(setEditCaseStatus).toHaveBeenCalledWith('modified')
  })

  it('summarizes case edit result and downstream chains before saving', () => {
    render(
      <EditCaseModal
        open
        editCaseTarget={unmatchedCase}
        editCaseProjectId="project-1"
        setEditCaseProjectId={vi.fn()}
        editCaseStatus="modified"
        setEditCaseStatus={vi.fn()}
        projects={projects}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('病例修正结果确认')).toBeInTheDocument()
    expect(screen.getByText('确认后将接住：LIS病例、检测项目、BOM理论消耗、项目对账、成本差异、审计记录')).toBeInTheDocument()
    expect(screen.getByText('病理号 CASE-001')).toBeInTheDocument()
    expect(screen.getByText('检测项目 已配置BOM项目')).toBeInTheDocument()
    expect(screen.getByText('BOM状态 已关联BOM')).toBeInTheDocument()
    expect(screen.getByText('状态 已修改')).toBeInTheDocument()
  })

  it('blocks saving when no project is selected for the case correction', () => {
    render(
      <EditCaseModal
        open
        editCaseTarget={unmatchedCase}
        editCaseProjectId=""
        setEditCaseProjectId={vi.fn()}
        editCaseStatus="modified"
        setEditCaseStatus={vi.fn()}
        projects={projects}
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    )

    expect(screen.getByText('请选择检测项目，系统才能把病例接到 BOM、项目对账和成本差异链路。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存修改' })).toBeDisabled()
  })
})
