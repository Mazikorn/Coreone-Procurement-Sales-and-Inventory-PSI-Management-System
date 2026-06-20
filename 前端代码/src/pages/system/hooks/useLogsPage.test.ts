import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { logsApi } from '@/api/logs'
import { usersApi } from '@/api/users'
import { downloadBlobFile } from '@/lib/utils'
import { toast } from 'sonner'
import { MODULES, useLogsPage } from './useLogsPage'
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
    vi.mocked(logsApi.getStats).mockResolvedValue({
      todayOps: 1,
      loginCount: 1,
      dataChanges: 1,
      activeUsers: 1,
    } as any)
    vi.mocked(logsApi.export).mockResolvedValue(new Blob(['csv']) as any)
    vi.mocked(logsApi.clean).mockResolvedValue({ deletedCount: 3, beforeDate: '2026-03-19' } as any)
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

  it('uses operationType and HTTP method fallback instead of defaulting unknown operations to login', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getList).toHaveBeenCalled())

    expect(result.current.getLogType('POST /stocktaking', 'create').label).toBe('新增')
    expect(result.current.getLogType('POST /stocktaking').label).toBe('新增')
    expect(result.current.getLogType('GET /logs', 'other').label).toBe('操作')
  })

  it('copies the current page date filters into the export form when opened', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getList).toHaveBeenCalled())

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
    await waitFor(() => expect(logsApi.getList).toHaveBeenCalled())

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
      startDate: '2026-06-01',
      endDate: '2026-06-16',
      format: 'csv',
    }))
    expect(downloadBlobFile).toHaveBeenCalledWith(expect.any(Blob), expect.stringMatching(/^logs_\d{8}_\d{6}\.csv$/))
  })

  it('does not export when export date range is reversed', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getList).toHaveBeenCalled())

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
    await waitFor(() => expect(logsApi.getList).toHaveBeenCalledTimes(1))

    act(() => {
      result.current.setStartDate('2026-06-30')
      result.current.setEndDate('2026-06-01')
    })

    await waitFor(() => expect(result.current.total).toBe(0))
    act(() => {
      result.current.handleSearch()
    })

    expect(toast.error).toHaveBeenCalledWith('开始日期不能晚于结束日期')
    expect(logsApi.getList).toHaveBeenCalledTimes(1)
  })

  it('cleans logs through backend API and refreshes list/statistics', async () => {
    const { result } = renderHook(() => useLogsPage())
    await waitFor(() => expect(logsApi.getList).toHaveBeenCalled())

    act(() => {
      result.current.setCleanRange('90')
    })

    try {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-17T12:00:00Z'))
      await act(async () => {
        await result.current.handleClean()
      })

      expect(logsApi.clean).toHaveBeenCalledWith('2026-03-19')
      expect(logsApi.getList).toHaveBeenCalledTimes(2)
      expect(logsApi.getStats).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })
})
