import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { UsePaginationReturn } from '@/hooks/usePagination'
import { LogListTab } from './LogListTab'
import type { ReconcileLog } from '../hooks/useReconciliationPage'

function makePagination(data: ReconcileLog[]): UsePaginationReturn<ReconcileLog> {
  return {
    data,
    loading: false,
    error: null,
    page: 1,
    pageSize: 20,
    total: data.length,
    setPage: vi.fn(),
    setPageSize: vi.fn(),
    refresh: vi.fn(),
  }
}

describe('LogListTab', () => {
  it('opens a detail dialog with the full correction context', () => {
    render(
      <LogListTab
        logPagination={makePagination([
          {
            id: 'log-detail-1',
            type: 'bom_fix',
            target_id: 'mat-1',
            target_name: 'HER2抗体',
            field: 'usage_per_sample,unit',
            old_value: '1 支',
            new_value: '2 ml',
            reason: '质控复核发现原始BOM低估用量，需要按复核记录调整。',
            operator: 'admin',
            created_at: '2026-06-18 10:30:00',
          },
        ])}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))

    const dialog = screen.getByRole('dialog', { name: '修正日志详情' })
    expect(within(dialog).getByText('2026-06-18 10:30:00')).toBeInTheDocument()
    expect(within(dialog).getByText('admin')).toBeInTheDocument()
    expect(within(dialog).getByText('HER2抗体')).toBeInTheDocument()
    expect(within(dialog).getByText('usage_per_sample,unit')).toBeInTheDocument()
    expect(within(dialog).getByText('1 支')).toBeInTheDocument()
    expect(within(dialog).getByText('2 ml')).toBeInTheDocument()
    expect(within(dialog).getByText('质控复核发现原始BOM低估用量，需要按复核记录调整。')).toBeInTheDocument()
  })

  it('shows case edit logs as readable project and status changes instead of raw JSON', () => {
    render(
      <LogListTab
        logPagination={makePagination([
          {
            id: 'case-edit-1',
            type: 'case_edit',
            target_id: 'case-1',
            target_name: 'CASE-001',
            field: 'project_id,project_name,status',
            old_value: JSON.stringify({
              projectId: 'project-old',
              projectName: '导入匹配项目',
              status: 'unmatched',
            }),
            new_value: JSON.stringify({
              projectId: 'project-new',
              projectName: '编辑后项目',
              status: 'modified',
            }),
            reason: '病例对账信息更新',
            operator: 'admin',
            created_at: '2026-06-18 11:30:00',
          },
        ])}
      />
    )

    expect(screen.getByText('修改病例')).toBeInTheDocument()
    expect(screen.getByText(/项目：导入匹配项目 -> 编辑后项目/)).toBeInTheDocument()
    expect(screen.getByText(/状态：未关联 -> 已修改/)).toBeInTheDocument()
    expect(screen.queryByText(/"projectId"/)).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '查看详情' }))

    const dialog = screen.getByRole('dialog', { name: '修正日志详情' })
    expect(within(dialog).getByText('修改病例')).toBeInTheDocument()
    expect(within(dialog).getByText('导入匹配项目 -> 编辑后项目')).toBeInTheDocument()
    expect(within(dialog).getByText('未关联 -> 已修改')).toBeInTheDocument()
    expect(within(dialog).queryByText(/"projectId"/)).not.toBeInTheDocument()
  })
})
