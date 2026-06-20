import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ReconcileProjectTab } from './ReconcileProjectTab'
import type { MaterialDiff, ProjectReconcile } from '../hooks/useReconciliationPage'

const project: ProjectReconcile = {
  id: 'project-1',
  code: 'P-001',
  name: 'IHC项目',
  bom_id: 'bom-1',
  type: 'ihc',
  case_count: 3,
  outbound_count: 2,
  hasBom: true,
  boms: [{ id: 'bom-1', code: 'BOM-001', name: 'IHC BOM' }],
}

const materialDiff: MaterialDiff = {
  materialId: 'mat-1',
  materialName: '抗体',
  spec: '7ml',
  bomUsagePerSample: 1,
  bomUnit: '滴',
  theoryQty: 3,
  actualQty: 5,
  actualUnit: '滴',
  diff: -2,
  diffRate: -66.67,
  status: 'danger',
  price: 20,
  theoryUnit: '滴',
}

function renderTab(canFixBom: boolean) {
  return render(
    <ReconcileProjectTab
      loading={false}
      projects={[project]}
      expandedProject="project-1"
      projectMaterials={{ 'project-1': [materialDiff] }}
      onToggleProject={vi.fn()}
      getDiffClass={() => 'text-red-600'}
      canFixBom={canFixBom}
      onFixBom={vi.fn()}
      onAuditProject={vi.fn()}
      auditingProjectId={null}
    />,
  )
}

describe('ReconcileProjectTab role actions', () => {
  it('hides BOM standard fixes when the current role only reconciles cost', () => {
    renderTab(false)

    expect(screen.queryByRole('button', { name: '修正BOM' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '审计差异' })).toBeInTheDocument()
  })

  it('keeps BOM standard fixes available for technical modeling roles', () => {
    renderTab(true)

    expect(screen.getByRole('button', { name: '修正BOM' })).toBeInTheDocument()
  })
})
