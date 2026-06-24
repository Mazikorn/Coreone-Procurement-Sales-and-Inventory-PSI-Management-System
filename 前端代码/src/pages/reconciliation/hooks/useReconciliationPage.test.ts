import { act, renderHook, waitFor } from '@testing-library/react'
import { reconciliationApi } from '@/api/reconciliation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { StrictMode, createElement, type ReactNode } from 'react'
import { toast } from 'sonner'
import { buildLisImportPreview, buildLisImportTemplateCsv, buildLisImportValidation, buildReconciliationExportFilename, buildReconciliationExportParams, getLisImportRefreshTargets, getReconciliationPeriodRange, parseLisImportData, useReconciliationPage, validateReconciliationDateRange } from './useReconciliationPage'
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

function StrictWrapper({ children }: { children: ReactNode }) {
  return createElement(StrictMode, null, children)
}

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
    vi.mocked(reconciliationApi.getProjectMaterials).mockResolvedValue({ list: [] } as any)
    vi.mocked(reconciliationApi.getMaterials).mockResolvedValue({ list: [] } as any)
    vi.mocked(reconciliationApi.getCases).mockResolvedValue({ list: [], pagination: { page: 1, pageSize: 20, total: 0 } } as any)
    vi.mocked(reconciliationApi.getLogs).mockResolvedValue({ list: [], pagination: { page: 1, pageSize: 20, total: 0 } } as any)
    vi.mocked(reconciliationApi.importCases).mockResolvedValue({ count: 1, unmatched: 0 } as any)
    vi.mocked(reconciliationApi.importLisFile).mockResolvedValue({ imported: 1, failed: 0, unmatched: 0 } as any)
    vi.mocked(reconciliationApi.auditProjectMaterials).mockResolvedValue({ created: 1, updated: 0, resolved: 0 } as any)
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

  it('builds local date ranges without timezone day shifting', () => {
    expect(getReconciliationPeriodRange('month', new Date(2026, 5, 21, 12))).toEqual({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    })
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

  it('uses keyword from URL so audit links open a filtered case reconciliation list', async () => {
    window.history.replaceState(null, '', '/reconciliation?keyword=CASE-DEEP-001')
    const periodRange = getReconciliationPeriodRange('month')

    const { result } = renderHook(() => useReconciliationPage())

    await waitFor(() => expect(reconciliationApi.getCases).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
      startDate: periodRange.startDate,
      endDate: periodRange.endDate,
      search: 'CASE-DEEP-001',
    })))
    expect(result.current.activeTab).toBe('case')
    expect(result.current.caseSearch).toBe('CASE-DEEP-001')
  })

  it('uses projectId from URL so outbound links open the project reconciliation detail directly', async () => {
    window.history.replaceState(null, '', '/reconciliation?projectId=project-1')
    vi.mocked(reconciliationApi.getProjects).mockResolvedValueOnce({
      list: [{
        id: 'project-1',
        code: 'P001',
        name: 'HE制片',
        type: 'routine',
        case_count: 2,
        outbound_count: 1,
        bom_id: 'bom-1',
        boms: [],
      }],
    } as any)
    vi.mocked(reconciliationApi.getProjectMaterials).mockResolvedValueOnce({
      list: [{
        materialId: 'material-1',
        materialName: '苏木素',
        spec: '10ml',
        bomUsagePerSample: 1,
        bomUnit: '瓶',
        theoryQty: 2,
        actualQty: 2,
        actualUnit: '瓶',
        diff: 0,
        diffRate: 0,
        status: 'match',
      }],
    } as any)

    const { result } = renderHook(() => useReconciliationPage())

    await waitFor(() => expect(reconciliationApi.getProjectMaterials).toHaveBeenCalledWith(
      'project-1',
      result.current.dateParams,
    ))
    expect(result.current.activeTab).toBe('reconcile')
    expect(result.current.expandedProject).toBe('project-1')
    expect(result.current.projectMaterials['project-1']).toEqual([
      expect.objectContaining({ materialName: '苏木素' }),
    ])
  })

  it('uses URL date range when opening a project reconciliation deep link', async () => {
    window.history.replaceState(null, '', '/reconciliation?projectId=project-1&startDate=2036-06-01&endDate=2036-06-30')
    vi.mocked(reconciliationApi.getProjects).mockResolvedValueOnce({
      list: [{
        id: 'project-1',
        code: 'P001',
        name: 'HE制片',
        type: 'routine',
        case_count: 2,
        outbound_count: 1,
        bom_id: 'bom-1',
        boms: [],
      }],
    } as any)
    vi.mocked(reconciliationApi.getProjectMaterials).mockResolvedValueOnce({
      list: [{
        materialId: 'material-1',
        materialName: '苏木素',
        spec: '10ml',
        bomUsagePerSample: 1,
        bomUnit: '瓶',
        theoryQty: 2,
        actualQty: 4,
        actualUnit: '瓶',
        diff: 2,
        diffRate: 100,
        status: 'danger',
      }],
    } as any)

    const { result } = renderHook(() => useReconciliationPage())

    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalledWith({
      startDate: '2036-06-01',
      endDate: '2036-06-30',
    }))
    await waitFor(() => expect(reconciliationApi.getProjectMaterials).toHaveBeenCalledWith(
      'project-1',
      { startDate: '2036-06-01', endDate: '2036-06-30' },
    ))
    expect(result.current.startDate).toBe('2036-06-01')
    expect(result.current.endDate).toBe('2036-06-30')
    expect(result.current.expandedProject).toBe('project-1')
  })

  it('keeps URL date range under React StrictMode so the live page does not fall back to current month', async () => {
    window.history.replaceState(null, '', '/reconciliation?projectId=project-1&startDate=2036-06-01&endDate=2036-06-30')
    const defaultMonthRange = getReconciliationPeriodRange('month')
    vi.mocked(reconciliationApi.getProjects).mockResolvedValue({
      list: [{
        id: 'project-1',
        code: 'P001',
        name: 'HE制片',
        type: 'routine',
        case_count: 2,
        outbound_count: 1,
        bom_id: 'bom-1',
        boms: [],
      }],
    } as any)
    vi.mocked(reconciliationApi.getProjectMaterials).mockResolvedValue({
      list: [{
        materialId: 'material-1',
        materialName: '苏木素',
        spec: '10ml',
        bomUsagePerSample: 1,
        bomUnit: '瓶',
        theoryQty: 2,
        actualQty: 4,
        actualUnit: '瓶',
        diff: 2,
        diffRate: 100,
        status: 'danger',
      }],
    } as any)

    const { result } = renderHook(() => useReconciliationPage(), { wrapper: StrictWrapper })

    await waitFor(() => expect(result.current.startDate).toBe('2036-06-01'))
    await waitFor(() => expect(reconciliationApi.getProjectMaterials).toHaveBeenCalledWith(
      'project-1',
      { startDate: '2036-06-01', endDate: '2036-06-30' },
    ))
    expect(result.current.endDate).toBe('2036-06-30')
    expect(reconciliationApi.getProjects).not.toHaveBeenCalledWith(defaultMonthRange)
    expect(window.location.search).toContain('startDate=2036-06-01')
    expect(window.location.search).toContain('endDate=2036-06-30')
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

  it('routes users to unmatched LIS cases after import so the reconciliation chain can be completed', async () => {
    vi.mocked(reconciliationApi.importCases).mockResolvedValueOnce({ count: 3, unmatched: 2 } as any)

    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())

    act(() => {
      result.current.setImportData([
        'CASE-UNMATCHED-1,未建项目A,2026-06-16 09:00,张三',
        'CASE-UNMATCHED-2,未建项目B,2026-06-16 10:00,李四',
        'CASE-MATCHED-1,HE制片,2026-06-16 11:00,王五',
      ].join('\n'))
    })

    await act(async () => {
      await result.current.handleImport()
    })

    expect(result.current.activeTab).toBe('case')
    expect(result.current.caseFilterStatus).toBe('unmatched')
    expect(result.current.caseSearch).toBe('')
    expect(result.current.caseFilterProject).toBe('')
    expect(toast.success).toHaveBeenCalledWith('成功导入 3 条病例数据，2 条未匹配项目，请在未关联BOM病例中处理')
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

  it('shows the backend reason when LIS import is rejected and keeps the draft for retry', async () => {
    vi.mocked(reconciliationApi.importCases).mockRejectedValueOnce({
      response: {
        data: {
          error: {
            message: '第 2 行病理号 CASE-DUP-001 已存在，请确认后重新导入',
          },
        },
      },
    })

    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())

    act(() => {
      result.current.setImportModalOpen(true)
      result.current.setImportData('CASE-DUP-001,HE制片,2026-06-16 09:00,张三')
    })

    await act(async () => {
      await result.current.handleImport()
    })

    expect(toast.error).toHaveBeenCalledWith('第 2 行病理号 CASE-DUP-001 已存在，请确认后重新导入')
    expect(result.current.importModalOpen).toBe(true)
    expect(result.current.importData).toBe('CASE-DUP-001,HE制片,2026-06-16 09:00,张三')
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
    expect(reconciliationApi.auditProjectMaterials).toHaveBeenCalledWith('project-old', result.current.dateParams)
    expect(reconciliationApi.auditProjectMaterials).toHaveBeenCalledWith('project-new', result.current.dateParams)
    expect(toast.success).toHaveBeenCalledWith('病例信息已更新，并已重新审计相关项目：新增 2，更新 0，关闭 0')
  })

  it('automatically audits old and new projects after editing a LIS case project', async () => {
    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())
    vi.mocked(reconciliationApi.updateCase).mockResolvedValueOnce({} as any)
    vi.mocked(reconciliationApi.auditProjectMaterials)
      .mockResolvedValueOnce({ created: 0, updated: 1, resolved: 0 } as any)
      .mockResolvedValueOnce({ created: 1, updated: 0, resolved: 0 } as any)
    vi.mocked(reconciliationApi.getSummary).mockClear()
    vi.mocked(reconciliationApi.getProjects).mockClear()

    act(() => {
      result.current.openEditCaseModal({
        id: 'case-move',
        case_no: 'CASE-MOVE-001',
        project_id: 'project-old',
        project_name: '旧项目',
        projectName: '旧项目',
        operator: '张三',
        operate_time: '2026-06-16 09:00:00',
        status: 'normal',
        hasBom: true,
      })
      result.current.setEditCaseProjectId('project-new')
      result.current.setEditCaseStatus('modified')
    })

    await act(async () => {
      await result.current.handleEditCase()
    })

    expect(reconciliationApi.updateCase).toHaveBeenCalledWith('case-move', expect.objectContaining({
      projectId: 'project-new',
      status: 'modified',
    }))
    expect(reconciliationApi.auditProjectMaterials).toHaveBeenNthCalledWith(1, 'project-old', result.current.dateParams)
    expect(reconciliationApi.auditProjectMaterials).toHaveBeenNthCalledWith(2, 'project-new', result.current.dateParams)
    expect(reconciliationApi.getSummary).toHaveBeenCalled()
    expect(reconciliationApi.getProjects).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('病例信息已更新，并已重新审计相关项目：新增 1，更新 1，关闭 0')
  })

  it('keeps the case edit result clear when automatic project audit fails', async () => {
    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())
    vi.mocked(reconciliationApi.updateCase).mockResolvedValueOnce({} as any)
    vi.mocked(reconciliationApi.auditProjectMaterials).mockRejectedValueOnce(new Error('审计失败'))

    act(() => {
      result.current.openEditCaseModal({
        id: 'case-audit-fail',
        case_no: 'CASE-AUDIT-FAIL',
        project_id: '',
        project_name: '未知项目',
        projectName: '未知项目',
        operator: '张三',
        operate_time: '2026-06-16 09:00:00',
        status: 'unmatched',
        hasBom: false,
      })
      result.current.setEditCaseProjectId('project-linked')
      result.current.setEditCaseStatus('modified')
    })

    await act(async () => {
      await result.current.handleEditCase()
    })

    expect(reconciliationApi.updateCase).toHaveBeenCalled()
    expect(reconciliationApi.auditProjectMaterials).toHaveBeenCalledWith('project-linked', result.current.dateParams)
    expect(result.current.editCaseModalOpen).toBe(false)
    expect(toast.error).toHaveBeenCalledWith('病例信息已更新，但自动审计失败，请在项目对账中点击审计差异重试')
    expect(toast.error).not.toHaveBeenCalledWith('更新失败')
  })

  it('does not report project audit as failed when only the follow-up material refresh fails', async () => {
    const originalMaterial = {
      materialId: 'mat-audit',
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
    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())
    vi.mocked(reconciliationApi.auditProjectMaterials).mockResolvedValueOnce({
      created: 1,
      updated: 2,
      resolved: 0,
    } as any)
    vi.mocked(reconciliationApi.getProjectMaterials).mockRejectedValueOnce(new Error('刷新失败'))

    act(() => {
      result.current.setProjectMaterials({ 'project-1': [originalMaterial] })
    })
    await act(async () => {
      await result.current.handleAuditProject('project-1')
    })

    expect(reconciliationApi.auditProjectMaterials).toHaveBeenCalledWith('project-1', result.current.dateParams)
    expect(reconciliationApi.getProjectMaterials).toHaveBeenCalledWith('project-1', result.current.dateParams)
    expect(result.current.projectMaterials['project-1']).toEqual([originalMaterial])
    expect(result.current.auditingProjectId).toBeNull()
    expect(toast.success).toHaveBeenCalledWith('审计完成：新增 1，更新 2，关闭 0')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('keeps project audit cost exceptions available for the next handling step', async () => {
    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())
    vi.mocked(reconciliationApi.auditProjectMaterials).mockResolvedValueOnce({
      created: 1,
      updated: 0,
      resolved: 0,
      exceptions: [
        { id: 'ex-1', exceptionNo: 'CE-RECON-001', materialId: 'mat-1', status: 'danger' },
      ],
    } as any)
    vi.mocked(reconciliationApi.getProjectMaterials).mockResolvedValueOnce({ list: [] } as any)

    await act(async () => {
      await result.current.handleAuditProject('project-1')
    })

    expect(result.current.projectAuditExceptions['project-1']).toEqual([
      { id: 'ex-1', exceptionNo: 'CE-RECON-001', materialId: 'mat-1', status: 'danger' },
    ])
  })

  it('keeps the corrected BOM usage visible when only the detail refresh fails', async () => {
    const originalMaterial = {
      materialId: 'mat-1',
      materialName: '苏木精',
      spec: '500ml',
      bomUsagePerSample: 1,
      bomUnit: 'ml',
      theoryQty: 10,
      actualQty: 15,
      actualUnit: 'ml',
      diff: -5,
      diffRate: 50,
      status: 'danger',
      price: 1,
      theoryUnit: 'ml',
    }
    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())
    vi.mocked(reconciliationApi.createLog).mockResolvedValueOnce({ id: 'log-1' } as any)
    vi.mocked(reconciliationApi.getProjectMaterials).mockRejectedValueOnce(new Error('刷新失败'))

    act(() => {
      result.current.setProjectMaterials({ 'project-1': [originalMaterial] })
      result.current.openFixBomModal(originalMaterial, 'project-1')
      result.current.setFixNewUsage(1.5)
      result.current.setFixNewUnit('ml')
      result.current.setFixReason('复核后更新标准用量')
    })

    await act(async () => {
      await result.current.handleFixBom()
    })

    expect(reconciliationApi.createLog).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      materialId: 'mat-1',
      newUsage: 1.5,
      newUnit: 'ml',
    }))
    expect(reconciliationApi.auditProjectMaterials).toHaveBeenCalledWith('project-1', result.current.dateParams)
    expect(toast.success).toHaveBeenCalledWith('BOM用量已修正，并已重新审计差异：新增 1，更新 0，关闭 0')
    expect(result.current.projectMaterials['project-1'][0]).toMatchObject({
      materialId: 'mat-1',
      bomUsagePerSample: 1.5,
      bomUnit: 'ml',
    })
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('automatically audits project material differences after a BOM usage fix', async () => {
    const originalMaterial = {
      materialId: 'mat-auto-audit',
      materialName: '抗体',
      spec: '7ml',
      bomUsagePerSample: 1,
      bomUnit: '滴',
      theoryQty: 10,
      actualQty: 15,
      actualUnit: '滴',
      diff: -5,
      diffRate: 50,
      status: 'danger',
      price: 20,
      theoryUnit: '滴',
    }
    const auditedMaterial = {
      ...originalMaterial,
      bomUsagePerSample: 1.5,
      diff: 0,
      diffRate: 0,
      status: 'match',
    }
    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())
    vi.mocked(reconciliationApi.createLog).mockResolvedValueOnce({ id: 'log-auto-audit' } as any)
    vi.mocked(reconciliationApi.auditProjectMaterials).mockResolvedValueOnce({
      created: 0,
      updated: 1,
      resolved: 1,
    } as any)
    vi.mocked(reconciliationApi.getProjectMaterials).mockResolvedValueOnce({ list: [auditedMaterial] } as any)
    vi.mocked(reconciliationApi.getSummary).mockClear()

    act(() => {
      result.current.setProjectMaterials({ 'project-auto': [originalMaterial] })
      result.current.openFixBomModal(originalMaterial, 'project-auto')
      result.current.setFixNewUsage(1.5)
      result.current.setFixNewUnit('滴')
      result.current.setFixReason('按实际复核同步标准用量')
    })

    await act(async () => {
      await result.current.handleFixBom()
    })

    expect(reconciliationApi.createLog).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-auto',
      materialId: 'mat-auto-audit',
      newUsage: 1.5,
      newUnit: '滴',
    }))
    expect(reconciliationApi.auditProjectMaterials).toHaveBeenCalledWith('project-auto', result.current.dateParams)
    expect(reconciliationApi.getProjectMaterials).toHaveBeenCalledWith('project-auto', result.current.dateParams)
    expect(result.current.projectMaterials['project-auto'][0]).toMatchObject({
      materialId: 'mat-auto-audit',
      bomUsagePerSample: 1.5,
      status: 'match',
    })
    expect(reconciliationApi.getSummary).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('BOM用量已修正，并已重新审计差异：新增 0，更新 1，关闭 1')
  })

  it('keeps the BOM fix result clear when automatic audit sync fails', async () => {
    const originalMaterial = {
      materialId: 'mat-audit-fail',
      materialName: '试剂盒',
      spec: '盒',
      bomUsagePerSample: 1,
      bomUnit: '盒',
      theoryQty: 4,
      actualQty: 6,
      actualUnit: '盒',
      diff: -2,
      diffRate: 50,
      status: 'danger',
      price: 200,
      theoryUnit: '盒',
    }
    const { result } = renderHook(() => useReconciliationPage())
    await waitFor(() => expect(reconciliationApi.getProjects).toHaveBeenCalled())
    vi.mocked(reconciliationApi.createLog).mockResolvedValueOnce({ id: 'log-audit-fail' } as any)
    vi.mocked(reconciliationApi.auditProjectMaterials).mockRejectedValueOnce(new Error('审计服务暂不可用'))

    act(() => {
      result.current.setProjectMaterials({ 'project-audit-fail': [originalMaterial] })
      result.current.openFixBomModal(originalMaterial, 'project-audit-fail')
      result.current.setFixNewUsage(2)
      result.current.setFixNewUnit('盒')
      result.current.setFixReason('标准用量复核')
    })

    await act(async () => {
      await result.current.handleFixBom()
    })

    expect(reconciliationApi.createLog).toHaveBeenCalled()
    expect(reconciliationApi.auditProjectMaterials).toHaveBeenCalledWith('project-audit-fail', result.current.dateParams)
    expect(result.current.projectMaterials['project-audit-fail'][0]).toMatchObject({
      materialId: 'mat-audit-fail',
      bomUsagePerSample: 2,
      bomUnit: '盒',
    })
    expect(result.current.auditingProjectId).toBeNull()
    expect(toast.error).toHaveBeenCalledWith('BOM用量已修正，但自动审计失败，请点击审计差异重试')
    expect(toast.error).not.toHaveBeenCalledWith('修正失败')
  })
})
