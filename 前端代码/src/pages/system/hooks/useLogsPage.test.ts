import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logsApi } from '@/api/logs'
import { usersApi } from '@/api/users'
import { downloadBlobFile } from '@/lib/utils'
import { toast } from 'sonner'
import { LOG_SOURCES, MODULES, useLogsPage } from './useLogsPage'
import type { OperationLog } from '@/types'

vi.mock('@/api/logs')
vi.mock('@/api/users')
vi.mock('@/lib/utils', () => ({
  downloadBlobFile: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
  },
}))

const mockLog: OperationLog = {
  id: 'log-1',
  userId: 'user-1',
  username: 'admin',
  operation: 'create',
  module: 'inbound',
  description: '新增入库记录',
  requestData: { module: 'inbound' },
  responseData: {},
  sourceType: 'operation',
  sourceLabel: '操作日志',
  businessId: 'IN-001',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  createdAt: '2026-06-16T10:00:00Z',
}

describe('useLogsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/logs')
    vi.mocked(logsApi.getList).mockResolvedValue({
      list: [mockLog],
      pagination: { page: 1, pageSize: 20, total: 1 },
    } as any)
    vi.mocked(logsApi.getUnifiedList).mockResolvedValue({
      list: [mockLog],
      pagination: { page: 1, pageSize: 20, total: 1 },
    } as any)
    vi.mocked(logsApi.getStats).mockResolvedValue({
      todayOps: 1,
      loginCount: 1,
      dataChanges: 1,
      activeUsers: 1,
    } as any)
    vi.mocked(logsApi.getArchives).mockResolvedValue({
      list: [
        {
          id: 'archive-1',
          archiveNo: 'LOG-ARCH-UNIT',
          sourceType: 'operation',
          beforeDate: '2025-12-19',
          retentionDays: 180,
          rowCount: 3,
          contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
          previousChainHash: null,
          chainHash: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
          protectedFactCounts: { stock: 1, batchLocation: 1, abc: 1, reconciliation: 1 },
          createdBy: 'admin',
          createdAt: '2026-06-17T12:00:00Z',
        },
      ],
      pagination: { page: 1, pageSize: 5, total: 1, totalPages: 1 },
      reportSignature: {
        status: 'unsigned',
        algorithm: 'HMAC-SHA256',
        keyId: 'not-configured',
        signedPayload: 'reportHash',
        missingReason: 'COREONE_ARCHIVE_REPORT_SIGNING_SECRET_NOT_CONFIGURED',
      },
    } as any)
    vi.mocked(logsApi.verifyArchiveChain).mockResolvedValue({
      valid: true,
      checkedCount: 1,
      latestArchiveNo: 'LOG-ARCH-UNIT',
      latestChainHash: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
    } as any)
    vi.mocked(logsApi.exportArchiveVerificationReport).mockResolvedValue(new Blob(['{}'], { type: 'application/json' }) as any)
    vi.mocked(logsApi.export).mockResolvedValue(new Blob(['csv']) as any)
    vi.mocked(logsApi.clean).mockResolvedValue({
      deletedCount: 3,
      beforeDate: '2026-03-19',
      archiveNo: 'LOG-ARCH-UNIT',
      archiveHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      archiveChainHash: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
    } as any)
    vi.mocked(usersApi.getList).mockResolvedValue({
      list: [
        { id: 'u-admin', username: 'admin', realName: '系统管理员' },
        { id: 'u-auditor', username: 'auditor', realName: '审计员' },
      ],
      pagination: { page: 1, pageSize: 1000, total: 2 },
    } as any)
  })

  it('loads user filter options from real users instead of hardcoded names', async () => {
    const { result } = renderHook(() => useLogsPage())

    await waitFor(() => expect(usersApi.getList).toHaveBeenCalledWith({ page: 1, pageSize: 1000 }))

    expect(result.current.userOptions).toEqual([
      { value: '', label: '全部用户' },
      { value: 'admin', label: 'admin（系统管理员）' },
      { value: 'auditor', label: 'auditor（审计员）' },
    ])
    expect(result.current.userOptions.some(option => option.value === 'zhangsan')).toBe(false)
    expect(result.current.userOptions.some(option => option.value === 'lisi')).toBe(false)
  })

  it('includes operational modules that appear in real audit logs', () => {
    expect(MODULES).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'stocktaking', label: '库存盘点' }),
      expect.objectContaining({ value: 'scraps', label: '报废管理' }),
      expect.objectContaining({ value: 'purchase_orders', label: '采购订单' }),
      expect.objectContaining({ value: 'equipment', label: '设备管理' }),
      expect.objectContaining({ value: 'logs', label: '操作日志' }),
    ]))
  })

  it('loads unified audit timeline by default and falls back to operation logs by source filter', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getUnifiedList).toHaveBeenCalledWith(expect.objectContaining({
      page: 1,
      pageSize: 20,
    })))
    expect(logsApi.getList).not.toHaveBeenCalled()
    expect(LOG_SOURCES).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: 'all', label: '统一审计' }),
      expect.objectContaining({ value: 'stock', label: '库存流水' }),
      expect.objectContaining({ value: 'batch_location', label: '批次库位流水' }),
      expect.objectContaining({ value: 'abc', label: '成本审计' }),
      expect.objectContaining({ value: 'reconciliation', label: '对账修正' }),
    ]))

    act(() => {
      result.current.setSourceFilter('operation')
    })

    await waitFor(() => expect(logsApi.getList).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'operation',
    })))
  })

  it('loads recent archive credentials so administrators can review cleanup evidence after the toast disappears', async () => {
    const { result } = renderHook(() => useLogsPage())

    await waitFor(() => expect(logsApi.getArchives).toHaveBeenCalledWith({ page: 1, pageSize: 5 }))

    expect(result.current.archiveCredentials).toHaveLength(1)
    expect(result.current.archiveCredentials[0]).toMatchObject({
      archiveNo: 'LOG-ARCH-UNIT',
      contentHash: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      chainHash: '123456abcdef7890123456abcdef7890123456abcdef7890123456abcdef7890',
      rowCount: 3,
      protectedFactCounts: { stock: 1, batchLocation: 1, abc: 1, reconciliation: 1 },
    })
    expect(result.current.archiveReportSignature).toMatchObject({
      status: 'unsigned',
      keyId: 'not-configured',
      missingReason: 'COREONE_ARCHIVE_REPORT_SIGNING_SECRET_NOT_CONFIGURED',
    })
  })

  it('verifies archive chain integrity and keeps the result visible on the logs page', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getArchives).toHaveBeenCalled())

    await act(async () => {
      await result.current.handleVerifyArchiveChain()
    })

    expect(logsApi.verifyArchiveChain).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalledWith('归档链验证通过，共检查 1 份归档')
    expect(result.current.archiveVerification).toMatchObject({
      valid: true,
      checkedCount: 1,
      latestArchiveNo: 'LOG-ARCH-UNIT',
    })
  })

  it('exports archive chain verification report for external audit handoff', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getArchives).toHaveBeenCalled())

    await act(async () => {
      await result.current.handleExportArchiveVerificationReport()
    })

    expect(logsApi.exportArchiveVerificationReport).toHaveBeenCalled()
    expect(downloadBlobFile).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^archive_chain_verification_\d{8}_\d{6}\.json$/))
    expect(toast.success).toHaveBeenCalledWith('归档链验证报告已导出')
  })

  it('uses operationType and HTTP method fallback instead of defaulting unknown operations to login', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getUnifiedList).toHaveBeenCalled())

    expect(result.current.getLogType('POST /stocktaking', 'create').label).toBe('新增')
    expect(result.current.getLogType('POST /stocktaking').label).toBe('新增')
    expect(result.current.getLogType('GET /logs', 'other').label).toBe('操作')
    expect(result.current.getSourceLabel('stock')).toBe('库存流水')
    expect(result.current.getSourceLabel('batch_location')).toBe('批次库位流水')
  })

  it('copies the current page date filters into the export form when opened', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getUnifiedList).toHaveBeenCalled())

    act(() => {
      result.current.setStartDate('2026-06-01')
      result.current.setEndDate('2026-06-16')
    })

    act(() => {
      result.current.openExport()
    })

    expect(result.current.showExport).toBe(true)
    expect(result.current.exportForm.startDate).toBe('2026-06-01')
    expect(result.current.exportForm.endDate).toBe('2026-06-16')
  })

  it('exports logs through backend file stream with inherited filters', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getUnifiedList).toHaveBeenCalled())

    act(() => {
      result.current.setStartDate('2026-06-01')
      result.current.setEndDate('2026-06-16')
    })
    act(() => {
      result.current.openExport()
    })
    act(() => {
      result.current.setExportForm({ ...result.current.exportForm, format: 'csv' })
    })

    await act(async () => {
      await result.current.handleExport()
    })

    expect(logsApi.export).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'all',
      startDate: '2026-06-01',
      endDate: '2026-06-16',
      format: 'csv',
    }))
    expect(downloadBlobFile).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^logs_\d{8}_\d{6}\.csv$/))
  })

  it('exports the current audit source filter so unified audit facts can be exported', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getUnifiedList).toHaveBeenCalled())

    act(() => {
      result.current.setSourceFilter('batch_location')
      result.current.setKeyword('BLA-EXPORT')
    })
    act(() => {
      result.current.openExport()
    })

    await act(async () => {
      await result.current.handleExport()
    })

    expect(logsApi.export).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'batch_location',
      keyword: 'BLA-EXPORT',
    }))
  })

  it('does not export when export date range is reversed', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getUnifiedList).toHaveBeenCalled())

    act(() => {
      result.current.setExportForm({
        ...result.current.exportForm,
        startDate: '2026-06-30',
        endDate: '2026-06-01',
      })
    })

    await act(async () => {
      await result.current.handleExport()
    })

    expect(logsApi.export).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('开始日期不能晚于结束日期')
  })

  it('blocks list search when date range is reversed', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getUnifiedList).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.setStartDate('2026-06-30')
      result.current.setEndDate('2026-06-01')
    })

    await waitFor(() => expect(result.current.total).toBe(0))
    act(() => {
      result.current.handleSearch()
    })

    expect(toast.error).toHaveBeenCalledWith('开始日期不能晚于结束日期')
    expect(logsApi.getUnifiedList).toHaveBeenCalledTimes(1)
  })

  it('cleans logs through backend API and refreshes list/statistics', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getUnifiedList).toHaveBeenCalled())

    act(() => {
      result.current.setCleanRange('180')
    })

    try {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-17T12:00:00Z'))
      await act(async () => {
        await result.current.handleClean()
      })

      expect(logsApi.clean).toHaveBeenCalledWith('2025-12-19')
      expect(toast.success).toHaveBeenCalledWith('清理成功，共删除 3 条日志；归档 LOG-ARCH-UNIT，哈希 abcdef123456，链哈希 123456abcdef')
      expect(logsApi.getUnifiedList).toHaveBeenCalledTimes(2)
      expect(logsApi.getStats).toHaveBeenCalledTimes(2)
      expect(logsApi.getArchives).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
