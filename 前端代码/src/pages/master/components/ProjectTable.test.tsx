import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectTable } from './ProjectTable'
import type { Project } from '@/types'

const baseProject = {
  cycle: '1天',
  status: 'active',
  createdAt: '2026-06-20',
} satisfies Partial<Project>

describe('ProjectTable', () => {
  it('shows the specific service subtype instead of collapsing pathology services into one category', () => {
    render(
      <ProjectTable
        data={[
          { ...baseProject, id: 'p-he', code: 'PRJ-HE', name: 'HE制片', type: 'he' },
          { ...baseProject, id: 'p-ihc', code: 'PRJ-IHC', name: '免疫组化', type: 'ihc' },
          { ...baseProject, id: 'p-ss', code: 'PRJ-SS', name: '特殊染色', type: 'ss' },
        ] as Project[]}
        loading={false}
        total={3}
        page={1}
        pageSize={20}
        keyword=""
        typeFilter=""
        statusFilter=""
        bomFilter=""
        selectedIds={new Set()}
        canWrite
        onKeywordChange={vi.fn()}
        onTypeFilterChange={vi.fn()}
        onStatusFilterChange={vi.fn()}
        onBomFilterChange={vi.fn()}
        onQuery={vi.fn()}
        onReset={vi.fn()}
        onToggleSelectAll={vi.fn()}
        onToggleSelectOne={vi.fn()}
        onPageChange={vi.fn()}
        onPageSizeChange={vi.fn()}
        onOpenEdit={vi.fn()}
        onOpenCopy={vi.fn()}
        onToggleStatus={vi.fn()}
        onOpenDelete={vi.fn()}
        onBatchEnable={vi.fn()}
        onBatchDisable={vi.fn()}
        onClearSelection={vi.fn()}
      />
    )

    expect(screen.getByText('病理技术-HE制片')).toBeInTheDocument()
    expect(screen.getByText('病理技术-免疫组化')).toBeInTheDocument()
    expect(screen.getByText('病理技术-特殊染色')).toBeInTheDocument()
  })
})
