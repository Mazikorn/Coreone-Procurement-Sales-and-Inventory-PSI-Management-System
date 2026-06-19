import { fireEvent, render, screen, within } from '@testing-library/react'
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Reconciliation from './Reconciliation'
import type { TabType } from './hooks/useReconciliationPage'

const mockHandleExport = vi.fn()
let activeTab: TabType = 'reconcile'

vi.mock('./hooks/useReconciliationPage', () => ({
  useReconciliationPage: () => ({
    activeTab,
    setActiveTab: vi.fn((tab: TabType) => { activeTab = tab }),
    period: 'month',
    setPeriod: vi.fn(),
    startDate: '2026-06-01',
    setStartDate: vi.fn(),
    endDate: '2026-06-30',
    setEndDate: vi.fn(),
    loading: false,
    exporting: false,
    summary: { totalCases: 0, linkedOutbounds: 0, unlinkedOutbounds: 0, projectsWithoutBom: 0 },
    projects: [],
    expandedProject: null,
    projectMaterials: {},
    materials: [],
    caseSearch: '',
    setCaseSearch: vi.fn(),
    caseFilterProject: '',
    setCaseFilterProject: vi.fn(),
    caseFilterStatus: '',
    setCaseFilterStatus: vi.fn(),
    importModalOpen: false,
    setImportModalOpen: vi.fn(),
    fixBomModalOpen: false,
    editCaseModalOpen: false,
    importData: '',
    setImportData: vi.fn(),
    importErrors: [],
    fixTarget: null,
    fixTargetProjectId: null,
    fixNewUsage: 0,
    setFixNewUsage: vi.fn(),
    fixNewUnit: '',
    setFixNewUnit: vi.fn(),
    fixReason: '',
    setFixReason: vi.fn(),
    editCaseTarget: null,
    editCaseProjectId: '',
    setEditCaseProjectId: vi.fn(),
    editCaseStatus: '',
    setEditCaseStatus: vi.fn(),
    casePagination: { list: [], loading: false, page: 1, pageSize: 20, total: 0, setPage: vi.fn(), setPageSize: vi.fn(), refresh: vi.fn() },
    logPagination: { list: [], loading: false, page: 1, pageSize: 20, total: 0, setPage: vi.fn(), setPageSize: vi.fn(), refresh: vi.fn() },
    loadProjectMaterials: vi.fn(),
    handleAuditProject: vi.fn(),
    auditingProjectId: null,
    handleExport: mockHandleExport,
    handleImport: vi.fn(),
    handleFixBom: vi.fn(),
    handleEditCase: vi.fn(),
    openFixBomModal: vi.fn(),
    openEditCaseModal: vi.fn(),
    resetCaseFilters: vi.fn(),
    getDiffClass: vi.fn(() => 'text-gray-600'),
    getStatusBadge: vi.fn(() => 'text-gray-600'),
    getStatusLabel: vi.fn((status: string) => status),
  }),
}))

describe('Reconciliation export dialog', () => {
  beforeEach(() => {
    activeTab = 'material'
    mockHandleExport.mockReset()
  })

  it('opens an export confirmation dialog before starting the download', () => {
    render(<Reconciliation />)

    fireEvent.click(screen.getByRole('button', { name: '导出报表' }))

    expect(mockHandleExport).not.toHaveBeenCalled()
    const dialog = screen.getByRole('dialog', { name: '导出对账报表' })
    expect(dialog).toBeInTheDocument()
    expect(within(dialog).getByText('按物料汇总')).toBeInTheDocument()
    expect(within(dialog).getByText('2026-06-01 至 2026-06-30')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '确认导出' }))
    expect(mockHandleExport).toHaveBeenCalledTimes(1)
  })
})
