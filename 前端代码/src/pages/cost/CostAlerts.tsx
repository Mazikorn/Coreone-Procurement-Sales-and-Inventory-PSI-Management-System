import React, { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, EyeOff, RefreshCw, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { abcApi } from '@/api/abc'
import { Modal } from '@/components/ui/Modal'
import { Pagination } from '@/components/ui/Pagination'

interface CostException {
  id: string
  exceptionNo: string
  exceptionType: string
  sourceModule?: string
  sourceId?: string
  outboundId?: string
  outboundNo?: string
  projectName?: string
  bomName?: string
  yearMonth?: string
  severity: 'info' | 'warning' | 'error'
  status: 'open' | 'resolved' | 'ignored'
  message: string
  details?: any
  retryCount?: number
  resolvedBy?: string
  resolvedAt?: string
  createdAt: string
}

interface CostExceptionSummary {
  total: number
  status: Record<'open' | 'resolved' | 'ignored', number>
  severity: Record<'error' | 'warning' | 'info', number>
}

const SEVERITY_LABELS: Record<string, { label: string; className: string }> = {
  error: { label: '错误', className: 'bg-red-100 text-red-700' },
  warning: { label: '警告', className: 'bg-amber-100 text-amber-700' },
  info: { label: '提示', className: 'bg-blue-100 text-blue-700' },
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  open: { label: '待处理', className: 'bg-amber-50 text-amber-700' },
  resolved: { label: '已解决', className: 'bg-emerald-50 text-emerald-700' },
  ignored: { label: '已忽略', className: 'bg-gray-100 text-gray-600' },
}

const TYPE_LABELS: Record<string, string> = {
  bom_material_skipped: 'BOM耗材跳过',
  abc_calculation_failed: 'ABC核算失败',
  cost_recalculation_failed: '重算失败',
  missing_bom: '缺少BOM',
  missing_project: '缺少项目',
}

const listPayload = <T,>(data: any): T[] => data?.list || data?.items || data || []

export function normalizeExceptionSummary(summary?: Partial<CostExceptionSummary> | null): CostExceptionSummary {
  return {
    total: Number(summary?.total) || 0,
    status: {
      open: Number(summary?.status?.open) || 0,
      resolved: Number(summary?.status?.resolved) || 0,
      ignored: Number(summary?.status?.ignored) || 0,
    },
    severity: {
      error: Number(summary?.severity?.error) || 0,
      warning: Number(summary?.severity?.warning) || 0,
      info: Number(summary?.severity?.info) || 0,
    },
  }
}

export function buildInitialCostAlertFilters(searchParams: URLSearchParams, defaultMonth: string) {
  const outboundId = searchParams.get('outboundId') || ''
  const keyword = searchParams.get('keyword') || ''
  const explicitYearMonth = searchParams.get('yearMonth')
  const includeUnassigned = searchParams.get('includeUnassigned') === '1' || searchParams.get('includeUnassigned') === 'true'
  return {
    status: searchParams.get('status') || 'open',
    severity: searchParams.get('severity') || '',
    yearMonth: explicitYearMonth ?? (outboundId || keyword ? '' : defaultMonth),
    keyword,
    outboundId,
    includeUnassigned,
  }
}

export function getRetryToastMessage(result: any) {
  const status = result?.exception?.status
  if (status === 'open') {
    return { type: 'warning' as const, message: '重试已完成，异常仍待处理' }
  }
  if (status === 'resolved') {
    return { type: 'success' as const, message: '重试已完成，异常已解决' }
  }
  return { type: 'success' as const, message: '重试已完成' }
}

export default function CostAlerts() {
  const [searchParams] = useSearchParams()
  const [initialFilters] = useState(() =>
    buildInitialCostAlertFilters(searchParams, new Date().toISOString().slice(0, 7))
  )
  const [exceptions, setExceptions] = useState<CostException[]>([])
  const [summary, setSummary] = useState<CostExceptionSummary>(() => normalizeExceptionSummary())
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [filters, setFilters] = useState(initialFilters)
  const [actionModal, setActionModal] = useState<{
    type: 'resolve' | 'ignore'
    exception: CostException
  } | null>(null)
  const [remark, setRemark] = useState('')

  useEffect(() => {
    loadExceptions()
  }, [filters.status, filters.severity, filters.yearMonth, filters.outboundId, filters.includeUnassigned, page, pageSize])

  const loadExceptions = async (nextPage = page, nextPageSize = pageSize) => {
    try {
      setLoading(true)
      const data = await abcApi.getExceptions({
        page: nextPage,
        pageSize: nextPageSize,
        status: filters.status || undefined,
        severity: filters.severity || undefined,
        yearMonth: filters.yearMonth || undefined,
        includeUnassigned: filters.includeUnassigned ? '1' : undefined,
        keyword: filters.keyword || undefined,
        outboundId: filters.outboundId || undefined,
      })
      const nextList = listPayload<CostException>(data)
      setExceptions(nextList)
      setSummary(normalizeExceptionSummary(data?.summary))
      setTotal(Number(data?.pagination?.total ?? data?.total ?? nextList.length) || 0)
    } catch {
      setExceptions([])
      setSummary(normalizeExceptionSummary())
      setTotal(0)
      toast.error('加载成本异常失败')
    } finally {
      setLoading(false)
    }
  }

  const stats = useMemo(() => ({
    total: summary.total,
    open: summary.status.open,
    error: summary.severity.error,
    warning: summary.severity.warning,
  }), [summary])

  const openAction = (type: 'resolve' | 'ignore', exception: CostException) => {
    setRemark('')
    setActionModal({ type, exception })
  }

  const submitAction = async () => {
    if (!actionModal) return
    try {
      setActionLoading(true)
      if (actionModal.type === 'resolve') {
        if (!remark.trim()) {
          toast.error('请填写处理说明')
          return
        }
        await abcApi.resolveException(actionModal.exception.id, { remark: remark.trim() })
        toast.success('异常已解决')
      } else {
        if (!remark.trim()) {
          toast.error('请填写忽略原因')
          return
        }
        await abcApi.ignoreException(actionModal.exception.id, { reason: remark.trim() })
        toast.success('异常已忽略')
      }
      setActionModal(null)
      await loadExceptions()
    } catch {
      // 统一错误提示已在请求拦截器处理
    } finally {
      setActionLoading(false)
    }
  }

  const retryException = async (exception: CostException) => {
    try {
      setActionLoading(true)
      const result = await abcApi.retryException(exception.id)
      const toastMessage = getRetryToastMessage(result)
      if (toastMessage.type === 'warning') {
        toast.warning(toastMessage.message)
      } else {
        toast.success(toastMessage.message)
      }
      await loadExceptions()
    } catch {
      // 统一错误提示已在请求拦截器处理
    } finally {
      setActionLoading(false)
    }
  }

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setPage(1)
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const searchExceptions = () => {
    setPage(1)
    void loadExceptions(1)
  }

  const changePageSize = (nextPageSize: number) => {
    setPageSize(nextPageSize)
    setPage(1)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">成本异常中心</h1>
          <p className="text-sm text-gray-500 mt-1">ABC 核算异常台账</p>
        </div>
        <button
          type="button"
          onClick={() => loadExceptions()}
          disabled={loading}
          className="h-10 px-4 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <AlertTriangle className="h-4 w-4 text-blue-500" />
            匹配异常
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            待处理
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{stats.open}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            错误
          </div>
          <div className="text-2xl font-bold text-red-600 mt-1">{stats.error}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            警告
          </div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{stats.warning}</div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4" />
            <input
              type="text"
              placeholder="异常编号、出库单、项目"
              value={filters.keyword}
              onChange={(e) => updateFilter('keyword', e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') searchExceptions() }}
              className="w-full h-10 pl-10 pr-4 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
            />
          </div>
          <input
            type="month"
            value={filters.yearMonth}
            onChange={(e) => updateFilter('yearMonth', e.target.value)}
            className="h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          />
          <select
            value={filters.status}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          >
            <option value="">全部状态</option>
            <option value="open">待处理</option>
            <option value="resolved">已解决</option>
            <option value="ignored">已忽略</option>
          </select>
          <select
            value={filters.severity}
            onChange={(e) => updateFilter('severity', e.target.value)}
            className="h-10 px-3 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
          >
            <option value="">全部级别</option>
            <option value="error">错误</option>
            <option value="warning">警告</option>
            <option value="info">提示</option>
          </select>
        </div>
        <div className="mt-3 flex items-center justify-end">
          <button
            type="button"
            onClick={searchExceptions}
            disabled={loading}
            className="h-9 px-4 text-sm text-white bg-[#3b82f6] rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            查询
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">异常编号</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">类型</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">来源</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">内容</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">级别</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">重试</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-[190px]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">加载中...</td>
                </tr>
              ) : exceptions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">暂无成本异常</td>
                </tr>
              ) : (
                exceptions.map(item => {
                  const severity = SEVERITY_LABELS[item.severity] || SEVERITY_LABELS.info
                  const status = STATUS_LABELS[item.status] || STATUS_LABELS.open
                  return (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-mono text-gray-700">{item.exceptionNo}</td>
                      <td className="px-4 py-3 text-gray-700">{TYPE_LABELS[item.exceptionType] || item.exceptionType}</td>
                      <td className="px-4 py-3 text-gray-600">
                        <div>{item.outboundNo || item.sourceModule || '-'}</div>
                        <div className="text-xs text-gray-400">{item.projectName || item.bomName || item.yearMonth || '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-700 max-w-md">
                        <div className="line-clamp-2">{item.message}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${severity.className}`}>{severity.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs ${status.className}`}>{status.label}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{item.retryCount || 0}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openAction('resolve', item)}
                            disabled={item.status !== 'open' || actionLoading}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 rounded transition-colors inline-flex items-center gap-1"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            解决
                          </button>
                          <button
                            type="button"
                            onClick={() => openAction('ignore', item)}
                            disabled={item.status !== 'open' || actionLoading}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-100 disabled:opacity-40 rounded transition-colors inline-flex items-center gap-1"
                          >
                            <EyeOff className="h-3.5 w-3.5" />
                            忽略
                          </button>
                          <button
                            type="button"
                            onClick={() => retryException(item)}
                            disabled={item.status !== 'open' || !item.outboundId || actionLoading}
                            title={!item.outboundId ? '该异常没有关联出库记录，不能自动重试' : undefined}
                            className="px-2 py-1 text-xs text-gray-600 hover:text-blue-700 hover:bg-blue-50 disabled:opacity-40 rounded transition-colors inline-flex items-center gap-1"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            重试
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
        {total > 0 && (
          <div className="border-t border-gray-100 px-4 py-3">
            <Pagination
              page={page}
              pageSize={pageSize}
              total={total}
              onChangePage={setPage}
              onChangePageSize={changePageSize}
            />
          </div>
        )}
      </div>

      {actionModal && (
        <Modal
          title={actionModal.type === 'resolve' ? '解决成本异常' : '忽略成本异常'}
          onClose={() => setActionModal(null)}
          size="sm"
        >
          <div className="space-y-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">{actionModal.exception.exceptionNo}</div>
              <div className="text-sm text-gray-900">{actionModal.exception.message}</div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {actionModal.type === 'resolve' ? '处理说明' : '忽略原因'}
              </label>
              <textarea
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-200 rounded-md focus:outline-none focus:ring-[3px] focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setActionModal(null)}
              className="h-10 px-4 text-sm text-gray-600 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submitAction}
              disabled={actionLoading}
              className="h-10 px-4 text-sm text-white bg-[#3b82f6] rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors"
            >
              确认
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
