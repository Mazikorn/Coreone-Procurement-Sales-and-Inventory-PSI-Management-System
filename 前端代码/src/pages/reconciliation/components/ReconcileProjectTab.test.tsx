import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
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

const projectWithoutBom: ProjectReconcile = {
  ...project,
  id: 'project-no-bom',
  bom_id: null,
  hasBom: false,
  boms: [],
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
    <MemoryRouter>
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
        projectAuditExceptions={{}}
      />
    </MemoryRouter>,
  )
}

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{location.pathname}{location.search}</div>
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

  it('opens unified audit evidence from a project material difference row', () => {
    render(
      <MemoryRouter initialEntries={['/reconciliation']}>
        <ReconcileProjectTab
          loading={false}
          projects={[project]}
          expandedProject="project-1"
          projectMaterials={{ 'project-1': [materialDiff] }}
          onToggleProject={vi.fn()}
          getDiffClass={() => 'text-red-600'}
          canFixBom={false}
          onFixBom={vi.fn()}
          onAuditProject={vi.fn()}
          auditingProjectId={null}
          projectAuditExceptions={{}}
        />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: '审计证据' }))

    const keyword = encodeURIComponent(`${project.name} ${materialDiff.materialName}`)
    expect(screen.getByTestId('location')).toHaveTextContent(`/logs?keyword=${keyword}`)
  })

  it('opens the filtered project BOM configuration target when a reconciliation project has no BOM', () => {
    render(
      <MemoryRouter initialEntries={['/reconciliation']}>
        <ReconcileProjectTab
          loading={false}
          projects={[projectWithoutBom]}
          expandedProject="project-no-bom"
          projectMaterials={{}}
          onToggleProject={vi.fn()}
          getDiffClass={() => 'text-red-600'}
          canFixBom={false}
          onFixBom={vi.fn()}
          onAuditProject={vi.fn()}
          auditingProjectId={null}
          projectAuditExceptions={{}}
        />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: '配置BOM' }))

    const keyword = encodeURIComponent(projectWithoutBom.name)
    expect(screen.getByTestId('location')).toHaveTextContent(
      `/projects?keyword=${keyword}&bom=unconfigured&action=edit&projectId=project-no-bom&tab=bom`
    )
  })

  it('opens the filtered cost exception queue after reconciliation audit creates an exception', () => {
    render(
      <MemoryRouter initialEntries={['/reconciliation']}>
        <ReconcileProjectTab
          loading={false}
          projects={[project]}
          expandedProject="project-1"
          projectMaterials={{ 'project-1': [materialDiff] }}
          onToggleProject={vi.fn()}
          getDiffClass={() => 'text-red-600'}
          canFixBom={false}
          onFixBom={vi.fn()}
          onAuditProject={vi.fn()}
          auditingProjectId={null}
          projectAuditExceptions={{
            'project-1': [{ exceptionNo: 'CE-RECON-001', materialId: 'mat-1', status: 'danger' }],
          }}
          dateParams={{ startDate: '2036-06-01', endDate: '2036-06-30' }}
        />
        <LocationProbe />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: '处理成本异常' }))

    expect(screen.getByTestId('location')).toHaveTextContent(
      '/abc/alerts?projectId=project-1&exceptionType=reconciliation_variance&status=open&startDate=2036-06-01&endDate=2036-06-30&keyword=CE-RECON-001'
    )
  })

  it('shows an actionable next step for material differences before users leave reconciliation', () => {
    renderTab(true)

    expect(screen.getByText('实际用量偏大')).toBeInTheDocument()
    expect(screen.getByText('下一步：先查审计证据核对LIS病例、BOM理论消耗和出库批次；标准用量不准则修正BOM后重审差异，已生成异常则进入成本异常队列处理。')).toBeInTheDocument()
  })
})
