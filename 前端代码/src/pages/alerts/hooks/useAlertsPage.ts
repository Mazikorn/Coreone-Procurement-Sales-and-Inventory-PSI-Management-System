import { useState, useEffect, useCallback } from 'react'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import { alertsApi } from '@/api/alerts'
import type { Alert } from '@/types'
import { toast } from 'sonner'

export interface AlertItem extends Alert {
  batchNo?: string
  ruleId?: string
  triggerCondition?: string
  projectName?: string
}

export type AlertTypeFilter = 'all' | 'low-stock' | 'expiry' | 'stagnant'
export type AlertStatusFilter = 'all' | 'pending' | 'processed' | 'ignored' | 'history'

export interface FilterState {
  keyword: string
  type: AlertTypeFilter
  status: AlertStatusFilter
  dateRange: [string, string]
}

export interface ModalState {
  type: 'handle' | 'consumption-handle' | 'consumption-detail' | 'detail' | null
  alert: AlertItem | null
}

export const ALERT_HANDLE_RESULT_MAP: Record<string, string> = {
  purchase_followed: '采购跟进中',
  no_action_needed: '已核实无需处理',
  normal: '标记为正常波动',
  observe: '关注观察，下季度再评估',
  optimize: '已核实，需优化流程',
  adjust_threshold_suggested: '建议调整预警阈值',
  other: '其他处理',
}

export function buildAlertHandleRemark(form: { opinion: string; result: string }) {
  const resultLabel = ALERT_HANDLE_RESULT_MAP[form.result] || ALERT_HANDLE_RESULT_MAP.other
  const opinion = form.opinion.trim()
  return opinion
    ? `处理结论：${resultLabel}\n处理意见：${opinion}`
    : `处理结论：${resultLabel}`
}

export const ALERT_TYPE_MAP: Record<string, { label: string; bg: string; text: string }> = {
  'low-stock': { label: '库存不足', bg: 'bg-red-50', text: 'text-red-600' },
  'expiry': { label: '即将过期', bg: 'bg-yellow-50', text: 'text-yellow-600' },
  'stagnant': { label: '消耗异常', bg: 'bg-green-50', text: 'text-green-600' },
}

export const STATUS_MAP: Record<string, { label: string; bg: string; text: string }> = {
  'pending': { label: '待处理', bg: 'bg-yellow-50', text: 'text-yellow-700' },
  'processed': { label: '已处理', bg: 'bg-green-50', text: 'text-green-700' },
  'ignored': { label: '已忽略', bg: 'bg-gray-50', text: 'text-gray-600' },
  'auto_resolved': { label: '已处理', bg: 'bg-green-50', text: 'text-green-700' },
  'dismissed': { label: '已忽略', bg: 'bg-gray-50', text: 'text-gray-600' },
  'handled': { label: '已处理', bg: 'bg-green-50', text: 'text-green-700' },
}

export function useAlertsPage() {
  const url = useUrlParams()

  const initialPage = Math.max(1, url.getNumber('page', 1))
  const initialPageSize = [10, 20, 50, 100].includes(url.getNumber('pageSize', 10))
    ? url.getNumber('pageSize', 10)
    : 10

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [modal, setModal] = useState<ModalState>({ type: null, alert: null })
  const [filter, setFilter] = useState<FilterState>({
    keyword: url.get('keyword', ''),
    type: (url.get('type', 'all') as AlertTypeFilter) || 'all',
    status: (url.get('status', 'all') as AlertStatusFilter) || 'all',
    dateRange: [url.get('startDate', ''), url.get('endDate', '')] as [string, string],
  })
  const [debouncedKeyword, setDebouncedKeyword] = useState(filter.keyword)
  const [quickFilter, setQuickFilter] = useState<AlertStatusFilter>(
    (url.get('quickFilter', 'all') as AlertStatusFilter) || 'all'
  )
  const [handleForm, setHandleForm] = useState({
    opinion: '',
    result: 'purchase_followed',
  })
  const [stats, setStats] = useState({
    pending: 0,
    processed: 0,
    ignored: 0,
    today: 0,
    month: 0,
    total: 0,
  })

  const normalizeStatus = (status: AlertStatusFilter) => {
    if (status === 'all') return undefined
    if (status === 'processed') return 'processed,auto_resolved,handled'
    if (status === 'ignored') return 'ignored,dismissed'
    if (status === 'history') return 'processed,ignored,auto_resolved,dismissed,handled'
    return status
  }

  const effectiveStatus = quickFilter !== 'all'
    ? normalizeStatus(quickFilter)
    : normalizeStatus(filter.status)
  const effectiveType = filter.type !== 'all' ? filter.type : undefined

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedKeyword(filter.keyword), 300)
    return () => window.clearTimeout(timer)
  }, [filter.keyword])

  const fetchFn = useCallback(
    async (params: { page: number; pageSize: number }) => {
      const res = await alertsApi.getList({
        ...params,
        keyword: debouncedKeyword || undefined,
        type: effectiveType,
        status: effectiveStatus,
        startDate: filter.dateRange[0] || undefined,
        endDate: filter.dateRange[1] || undefined,
      })
      return {
        list: res?.list || [],
        pagination: res?.pagination,
      }
    },
    [
      debouncedKeyword,
      filter.type,
      filter.status,
      filter.dateRange[0],
      filter.dateRange[1],
      quickFilter,
    ]
  )

  const {
    data,
    loading,
    error,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    refresh,
  } = usePagination<AlertItem>({
    fetchFn,
    initialPage,
    initialPageSize,
    deps: [
      debouncedKeyword,
      filter.type,
      filter.status,
      filter.dateRange[0],
      filter.dateRange[1],
      quickFilter,
    ],
  })

  // URL 同步
  useEffect(() => {
    url.setMultiple({
      page: page > 1 ? page : null,
      pageSize: pageSize !== 10 ? pageSize : null,
      keyword: filter.keyword || null,
      type: filter.type !== 'all' ? filter.type : null,
      status: filter.status !== 'all' ? filter.status : null,
      quickFilter: quickFilter !== 'all' ? quickFilter : null,
      startDate: filter.dateRange[0] || null,
      endDate: filter.dateRange[1] || null,
    })
  }, [page, pageSize, filter.keyword, filter.type, filter.status, filter.dateRange, quickFilter])

  const loadStats = useCallback(async () => {
    try {
      const res: any = await alertsApi.getStats({
        keyword: debouncedKeyword || undefined,
        type: effectiveType,
        status: effectiveStatus,
        startDate: filter.dateRange[0] || undefined,
        endDate: filter.dateRange[1] || undefined,
      })
      setStats({
        pending: Number(res?.pending || 0),
        processed: Number(res?.processed || 0),
        ignored: Number(res?.ignored || 0),
        today: Number(res?.today || 0),
        month: Number(res?.month || 0),
        total: Number(res?.total || 0),
      })
    } catch (e) {
      console.error(e)
      setStats((prev) => prev)
    }
  }, [
    debouncedKeyword,
    filter.type,
    filter.status,
    filter.dateRange[0],
    filter.dateRange[1],
    quickFilter,
  ])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // 清空选择当筛选/分页变化时
  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, pageSize, filter.keyword, filter.type, filter.status, filter.dateRange, quickFilter])

  const handleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  const handleSelectAll = () => {
    if (data.length > 0 && selectedIds.size === data.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(data.map((a) => a.id)))
    }
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleProcess = async (id: string, remark?: string) => {
    try {
      await alertsApi.process(id, { remark })
      toast.success('处理成功')
      refresh()
      loadStats()
      setModal({ type: null, alert: null })
    } catch {
      toast.error('处理失败')
    }
  }

  const handleIgnore = async (id: string, remark?: string) => {
    try {
      await alertsApi.ignore(id, { remark })
      toast.success('已忽略')
      refresh()
      loadStats()
    } catch {
      toast.error('操作失败')
    }
  }

  const getAlertTypeInfo = (type: string) => {
    return (
      ALERT_TYPE_MAP[type] || {
        label: type,
        bg: 'bg-gray-50',
        text: 'text-gray-600',
      }
    )
  }

  const getStatusInfo = (status: string) => {
    return (
      STATUS_MAP[status] || {
        label: status,
        bg: 'bg-gray-50',
        text: 'text-gray-600',
      }
    )
  }

  const openModal = (type: ModalState['type'], alert: AlertItem) => {
    setModal({ type, alert })
    setHandleForm({ opinion: '', result: type === 'consumption-handle' ? 'normal' : 'purchase_followed' })
  }

  const closeModal = () => setModal({ type: null, alert: null })

  const isConsumption = (type: string) => type === 'stagnant'

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return dateStr
    }
  }

  const handleBatchProcess = async () => {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    try {
      await alertsApi.batchHandle(ids, { action: 'processed', remark: '批量处理' })
      toast.success(`已处理 ${ids.length} 条预警`)
      clearSelection()
      refresh()
      loadStats()
    } catch {
      toast.error('批量处理失败')
    }
  }

  const openHistory = () => {
    setQuickFilter('history')
    setFilter((prev) => ({ ...prev, status: 'all' }))
    setPage(1)
  }

  return {
    filter,
    setFilter,
    quickFilter,
    setQuickFilter,
    selectedIds,
    setSelectedIds,
    modal,
    setModal,
    handleForm,
    setHandleForm,
    data,
    loading,
    error,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    refresh,
    stats,
    handleSelect,
    handleSelectAll,
    clearSelection,
    handleProcess,
    handleIgnore,
    getAlertTypeInfo,
    getStatusInfo,
    openModal,
    closeModal,
    isConsumption,
    formatDate,
    handleBatchProcess,
    openHistory,
  }
}
