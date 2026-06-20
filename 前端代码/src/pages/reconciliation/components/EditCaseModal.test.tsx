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
})
