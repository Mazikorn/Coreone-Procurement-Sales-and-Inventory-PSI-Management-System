import { act, renderHook, waitFor } from '@testing-library/react'
import { reconciliationApi } from '@/api/reconciliation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { buildLisImportPreview, buildLisImportTemplateCsv, buildLisImportValidation, buildReconciliationExportFilename, buildReconciliationExportParams, getLisImportRefreshTargets, parseLisImportData, useReconciliationPage, validateReconciliationDateRange } from './useReconciliationPage'
import { downloadBlobFile } from '@/lib/utils'

vi.mock('@/api/reconciliation')
vi.mock('@/lib/utils', () => ({
  downloadBlobFile: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

describe('parseLisImportData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/reconciliation')
    vi.mocked(reconciliationApi.getSummary).mockResolvedValue({
      totalCases: 0,
      linkedOutbounds: 0,
      unlinkedOutbounds: 0,
      projectsWithoutBom: 0,
    } as any)
    vi.mocked(reconciliationApi.getProjects).mockResolvedValue({ list: [] } as any)
    vi.mocked(reconciliationApi.getMaterials).mockResolvedValue({ list: [] } as any)
    vi.mocked(reconciliationApi.getCases).mockResolvedValue({ list: [], pagination: { page: 1, pageSize: 20, total: 0 } } as any)
    vi.mocked(reconciliationApi.getLogs).mockResolvedValue({ list: [], pagination: { page: 1, pageSize: 20, total: 0 } } as any)
    vi.mocked(reconciliationApi.importCases).mockResolvedValue({ count: 1, unmatched: 0 } as any)
    vi.mocked(reconciliationApi.importLisFile).mockResolvedValue({ imported: 1, failed: 0, unmatched: 0 } as any)
  })

  it('parses quoted CSV fields without shifting LIS columns', () => {
    const rows = parseLisImportData([
      '病理号,检测项目,操作时间,操作人',
      'P24050187,"免疫组化,HER2",2026-06-16 09:00,"张三,复核"',
    ].join('\n'))

    expect(rows).toEqual([
      {
        caseNo: 'P24050187',
        projectName: '免疫组化,HER2',
        operateTime: '2026-06-16 09:00',
        operator: '张三,复核',
      },
    ])
  })

  it('supports tab-delimited LIS text and English headers', () => {
    const rows = parseLisImportData([
      'case_no\tproject_name\toperate_time\toperator',
      'P24050188\tHE制片\t2026-06-16 10:00\t李四',
    ].join('\n'))

    expect(rows).toEqual([
      {
        caseNo: 'P24050188',
        projectName: 'HE制片',
        operateTime: '2026-06-16 10:00',
        operator: '李四',
      },
    ])
  })

  it('falls back to the legacy four-column order when no header exists', () => {
    const rows = parseLisImportData('P24050189,特殊染色,2026-06-16 11:00,王五')

    expect(rows).toEqual([
      {
        caseNo: 'P24050189',
        projectName: '特殊染色',
        operateTime: '2026-06-16 11:00',
        operator: '王五',
      },
    ])
  })

  it('includes active case filters when exporting reconciliation cases', () => {
    expect(buildReconciliationExportParams({
      activeTab: 'case',
      dateParams: { startDate: '2026-06-01', endDate: '2026-06-30' },
      caseSearch: 'CASE-001',
      caseFilterProject: 'project-1',
      caseFilterStatus: 'modified',
    })).toEqual({
      type: 'case',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
      search: 'CASE-001',
      projectId: 'project-1',
      status: 'modified',
    })
  })

  it('includes selected export format and omits filters for current tab all-data exports', () => {
    expect(buildReconciliationExportParams({
      activeTab: 'case',
      dateParams: { startDate: '2026-06-01', endDate: '2026-06-30' },
      caseSearch: 'CASE-001',
      caseFilterProject: 'project-1',
      caseFilterStatus: 'modified',
      format: 'xlsx',
      scope: 'all',
    })).toEqual({
      type: 'case',
      format: 'xlsx',
      scope: 'all',
    })
  })

  it('builds traceable reconciliation export filenames for blob downloads', () => {
    expect(buildReconciliationExportFilename({
      type: 'project',
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    }, 'csv')).toBe('reconciliation-project-2026-06-01_2026-06-30.csv')

    expect(buildReconciliationExportFilename({ type: 'case' }, 'xlsx')).toMatch(/^reconciliation-case-\d{4}-\d{2}-\d{2}\.xlsx$/)
  })

  it('downloads the backend Excel export blob directly', async () => {
    const xlsxBlob = new Blob(['xlsx-binary'], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    vi.mocked(reconciliationApi.exportData).mockResolvedValue(xlsxBlob as any)

    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())

    await act(async () => {
      await result.current.handleExport({ format: 'xlsx', scope: 'all' })
    })

    expect(reconciliationApi.exportData).toHaveBeenCalledWith({
      type: 'project',
      format: 'xlsx',
      scope: 'all',
    })
    expect(downloadBlobFile).toHaveBeenCalledWith(
      xlsxBlob,
      expect.stringMatching(/^reconciliation-project-\d{4}-\d{2}-\d{2}\.xlsx$/)
    )
  })

  it('rejects impossible and reversed reconciliation date ranges before requests', () => {
    expect(validateReconciliationDateRange({ startDate: '2026-02-30', endDate: '2026-03-01' })).toEqual({
      valid: false,
      message: '日期格式必须为 YYYY-MM-DD',
    })

    expect(validateReconciliationDateRange({ startDate: '2026-06-30', endDate: '2026-06-01' })).toEqual({
      valid: false,
      message: '开始日期不能晚于结束日期',
    })

    expect(validateReconciliationDateRange({ startDate: '2026-06-01', endDate: '2026-06-30' })).toEqual({
      valid: true,
      message: '',
    })
  })

  it('reports invalid LIS operate time with row-level import errors', () => {
    const rows = parseLisImportData([
      '病理号,检测项目,操作时间,操作人',
      'P24050190,HE制片,2026-06-16 09:00,张三',
      'P24050191,HE制片,not-a-date,李四',
    ].join('\n'))

    expect(buildLisImportValidation(rows)).toEqual({
      validItems: [
        {
          caseNo: 'P24050190',
          projectName: 'HE制片',
          operateTime: '2026-06-16 09:00',
          operator: '张三',
        },
      ],
      errors: [
        expect.objectContaining({
          row: 2,
          caseNo: 'P24050191',
          message: expect.stringContaining('检测时间格式错误'),
        }),
      ],
    })
  })

  it('builds a real LIS import template csv', () => {
    expect(buildLisImportTemplateCsv()).toBe([
      '病理号,检测项目,操作时间,操作人',
      'P24050187,HE制片,2026-06-17 09:00:00,张三',
    ].join('\n'))
  })

  it('keeps blank case number rows visible in the LIS import preview', () => {
    const preview = buildLisImportPreview([
      '病理号,检测项目,操作时间,操作人',
      ',HE制片,2026-06-16 09:00,张三',
      'P24050192,HE制片,not-a-date,李四',
      'P24050193,HE制片,2026-06-16 10:00,王五',
    ].join('\n'))

    expect(preview.total).toBe(3)
    expect(preview.validCount).toBe(1)
    expect(preview.failedCount).toBe(2)
    expect(preview.errors).toEqual([
      expect.objectContaining({ row: 1, message: '病理号不能为空' }),
      expect.objectContaining({ row: 2, caseNo: 'P24050192', message: expect.stringContaining('检测时间格式错误') }),
    ])
  })

  it('refreshes the visible reconciliation data after a successful LIS import', () => {
    expect(getLisImportRefreshTargets('reconcile')).toEqual({
      summary: true,
      projects: true,
      materials: false,
      cases: false,
      clearProjectMaterials: true,
    })
    expect(getLisImportRefreshTargets('material')).toEqual({
      summary: true,
      projects: false,
      materials: true,
      cases: false,
      clearProjectMaterials: false,
    })
    expect(getLisImportRefreshTargets('case')).toEqual({
      summary: true,
      projects: true,
      materials: false,
      cases: true,
      clearProjectMaterials: false,
    })
  })

  it('refreshes project reconciliation data after importing LIS cases on the project tab', async () => {
    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())
    const callsBeforeImport = vi.mocked(reconciliationApi.getProjects).mock.calls.length

    act(() => {
      result.current.setImportData('CASE-IMPORT-REFRESH,HE制片,2026-06-16 09:00,张三')
    })
    await act(async () => {
      await result.current.handleImport()
    })

    expect(reconciliationApi.importCases).toHaveBeenCalledWith({
      items: [{
        caseNo: 'CASE-IMPORT-REFRESH',
        projectName: 'HE制片',
        operateTime: '2026-06-16 09:00',
        operator: '张三',
      }],
    })
    expect(reconciliationApi.getProjects).toHaveBeenCalledTimes(callsBeforeImport + 1)
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('成功导入 1 条病例数据'))
  })

  it('uploads the original LIS file through FormData import when a file was selected', async () => {
    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())
    const file = new File(['病理号,检测项目,操作时间,操作人\nCASE-FILE,HE制片,2026-06-16 09:00,张三'], 'lis.csv', { type: 'text/csv' })

    act(() => {
      result.current.setImportData('CASE-FILE,HE制片,2026-06-16 09:00,张三')
      result.current.setImportFile(file)
    })
    await act(async () => {
      await result.current.handleImport()
    })

    expect(reconciliationApi.importLisFile).toHaveBeenCalledWith(file)
    expect(reconciliationApi.importCases).not.toHaveBeenCalled()
  })

  it('passes the selected date range when loading correction logs', async () => {
    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())
    vi.mocked(reconciliationApi.getLogs).mockClear()

    act(() => {
      result.current.setStartDate('2026-06-01')
      result.current.setEndDate('2026-06-30')
      result.current.setActiveTab('log')
    })

    await waitFor(() => expect(reconciliationApi.getLogs).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    })))
  })

  it('refreshes reconciliation summary and project counts after editing a LIS case project', async () => {
    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())
    vi.mocked(reconciliationApi.getSummary).mockClear()
    vi.mocked(reconciliationApi.getProjects).mockClear()
    vi.mocked(reconciliationApi.updateCase).mockResolvedValueOnce({} as any)

    act(() => {
      result.current.openEditCaseModal({
        id: 'case-1',
        case_no: 'CASE-001',
        project_id: 'project-old',
        project_name: '旧项目',
        projectName: '旧项目',
        operator: '张三',
        operate_time: '2026-06-16 09:00:00',
        status: 'normal',
        hasBom: true,
      })
      result.current.setEditCaseProjectId('project-new')
    })

    await act(async () => {
      await result.current.handleEditCase()
    })

    expect(reconciliationApi.updateCase).toHaveBeenCalledWith('case-1', expect.objectContaining({
      projectId: 'project-new',
    }))
    await waitFor(() => expect(reconciliationApi.getSummary).toHaveBeenCalled())
    expect(reconciliationApi.getProjects).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('病例信息已更新')
  })
})
