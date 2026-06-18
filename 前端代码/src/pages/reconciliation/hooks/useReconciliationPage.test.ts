import { describe, expect, it } from 'vitest'
import { buildLisImportPreview, buildLisImportTemplateCsv, buildLisImportValidation, buildReconciliationExportParams, parseLisImportData, validateReconciliationDateRange } from './useReconciliationPage'

describe('parseLisImportData', () => {
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
})
