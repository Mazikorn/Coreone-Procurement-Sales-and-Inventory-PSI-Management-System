import { useState, useEffect, useCallback } from 'react'
import { logsApi } from '@/api/logs'
import { usersApi } from '@/api/users'
import type { OperationLog } from '@/types'
import { toast } from 'sonner'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import { downloadBlobFile } from '@/lib/utils'

export interface LogFormData {
  startDate: string
  endDate: string
  format: 'csv'
  includeBasic: boolean
  includeDetail: boolean
  includeIP: boolean
  includeDiff: boolean
}

export type LogCleanRange = '30' | '90' | '180' | 'all'

export const LOG_TYPES = [
  { value: 'login', label: '登录', className: 'bg-blue-50 text-blue-500' },
  { value: 'logout', label: '登出', className: 'bg-gray-100 text-gray-500' },
  { value: 'create', label: '新增', className: 'bg-green-50 text-green-500' },
  { value: 'update', label: '修改', className: 'bg-yellow-50 text-yellow-600' },
  { value: 'delete', label: '删除', className: 'bg-red-50 text-red-500' },
  { value: 'export', label: '导出', className: 'bg-blue-50 text-blue-500' },
  { value: 'import', label: '导入', className: 'bg-orange-50 text-orange-500' },
]

const OTHER_LOG_TYPE = { value: 'other', label: '操作', className: 'bg-gray-100 text-gray-600' }

export const MODULES = [
  { value: '', label: '全部模块' },
  { value: 'inventory', label: '库存管理' },
  { value: 'inbound', label: '入库管理' },
  { value: 'outbound', label: '出库管理' },
  { value: 'stocktaking', label: '库存盘点' },
  { value: 'returns', label: '退库管理' },
  { value: 'scraps', label: '报废管理' },
  { value: 'transfers', label: '调拨管理' },
  { value: 'supplier_returns', label: '供应商退货' },
  { value: 'purchase_orders', label: '采购订单' },
  { value: 'suppliers', label: '供应商管理' },
  { value: 'categories', label: '物料分类' },
  { value: 'materials', label: '物料管理' },
  { value: 'locations', label: '库位管理' },
  { value: 'projects', label: '检测项目' },
  { value: 'bom', label: 'BOM清单' },
  { value: 'alerts', label: '预警中心' },
  { value: 'reconciliation', label: '成本对账' },
  { value: 'equipment', label: '设备管理' },
  { value: 'labor', label: '标准工时' },
  { value: 'indirect_costs', label: '间接成本中心' },
  { value: 'cost', label: '成本管理' },
  { value: 'user', label: '用户管理' },
  { value: 'role', label: '角色权限' },
  { value: 'system', label: '系统设置' },
]

const ALL_USER_OPTION = { value: '', label: '全部用户' }
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function isValidDateOnly(value: string) {
  if (!value) return true
  if (!DATE_ONLY_PATTERN.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function getDateRangeError(start: string, end: string) {
  if (!isValidDateOnly(start) || !isValidDateOnly(end)) return '日期格式必须为 YYYY-MM-DD'
  if (start && end && start > end) return '开始日期不能晚于结束日期'
  return ''
}

export function useLogsPage() {
  const { get, getNumber, setMultiple } = useUrlParams()

  const [keyword, setKeyword] = useState(get('keyword') || '')
  const [typeFilter, setTypeFilter] = useState(get('type') || '')
  const [moduleFilter, setModuleFilter] = useState(get('module') || '')
  const [userFilter, setUserFilter] = useState(get('user') || '')
  const [startDate, setStartDate] = useState(get('startDate') || '')
  const [endDate, setEndDate] = useState(get('endDate') || '')
  const [stats, setStats] = useState({ todayOps: 0, loginCount: 0, dataChanges: 0, activeUsers: 0 })
  const [userOptions, setUserOptions] = useState([ALL_USER_OPTION])

  const urlPage = Math.max(1, getNumber('page', 1))
  const urlPageSize = [10, 20, 50, 100].includes(getNumber('pageSize', 20))
    ? getNumber('pageSize', 20)
    : 20

  const fetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      if (getDateRangeError(startDate, endDate)) {
        return { list: [], pagination: { page, pageSize, total: 0 } }
      }
      const res = await logsApi.getList({
        page, pageSize,
        ...(keyword && { keyword }),
        ...(typeFilter && { type: typeFilter as any }),
        ...(moduleFilter && { module: moduleFilter as any }),
        ...(userFilter && { username: userFilter }),
        ...(startDate && { startDate }),
        ...(endDate && { endDate }),
      })
      return { list: res?.list || [], pagination: res?.pagination }
    },
    [keyword, typeFilter, moduleFilter, userFilter, startDate, endDate]
  )

  const {
    data, loading, page, pageSize, total,
    setPage, setPageSize, refresh,
  } = usePagination<OperationLog>({
    fetchFn,
    initialPage: urlPage,
    initialPageSize: urlPageSize,
    deps: [keyword, typeFilter, moduleFilter, userFilter, startDate, endDate],
  })

  useEffect(() => {
    setMultiple({
      page: page > 1 ? page : null,
      pageSize: pageSize !== 20 ? pageSize : null,
      keyword: keyword || null,
      type: typeFilter || null,
      module: moduleFilter || null,
      user: userFilter || null,
      startDate: startDate || null,
      endDate: endDate || null,
    })
  }, [page, pageSize, keyword, typeFilter, moduleFilter, userFilter, startDate, endDate, setMultiple])

  useEffect(() => {
    logsApi.getStats()
      .then((res: any) => setStats({
        todayOps: Number(res?.todayOps || 0),
        loginCount: Number(res?.loginCount || 0),
        dataChanges: Number(res?.dataChanges || 0),
        activeUsers: Number(res?.activeUsers || 0),
      }))
      .catch(() => {
        // 统计失败不阻断日志列表使用。
      })
  }, [])

  useEffect(() => {
    usersApi.getList({ page: 1, pageSize: 1000 })
      .then((res: any) => {
        const list = res?.list || []
        const options = list
          .map((user: any) => {
            const username = String(user.username || '').trim()
            const realName = String(user.realName || '').trim()
            if (!username) return null
            return {
              value: username,
              label: realName && realName !== username ? `${username}（${realName}）` : username,
            }
          })
          .filter(Boolean) as Array<{ value: string; label: string }>

        const deduped = Array.from(new Map(options.map(option => [option.value, option])).values())
        setUserOptions([ALL_USER_OPTION, ...deduped])
      })
      .catch(() => {
        setUserOptions([ALL_USER_OPTION])
      })
  }, [])

  const [detailLog, setDetailLog] = useState<OperationLog | null>(null)
  const [showDetail, setShowDetail] = useState(false)
  const [showExport, setShowExport] = useState(false)
  const [showClean, setShowClean] = useState(false)
  const [cleanRange, setCleanRange] = useState<LogCleanRange>('90')

  const [exportForm, setExportForm] = useState<LogFormData>({
    startDate: '', endDate: '', format: 'csv',
    includeBasic: true, includeDetail: true, includeIP: false, includeDiff: false,
  })
  const dateError = getDateRangeError(startDate, endDate)
  const exportDateError = getDateRangeError(exportForm.startDate, exportForm.endDate)
  const exportContentError = !exportForm.includeBasic && !exportForm.includeDetail && !exportForm.includeIP && !exportForm.includeDiff
    ? '请至少选择一项导出内容'
    : ''

  const handleSearch = () => {
    if (dateError) {
      toast.error(dateError)
      setPage(1)
      return
    }
    setPage(1)
  }
  const handleReset = () => {
    setKeyword(''); setTypeFilter(''); setModuleFilter(''); setUserFilter('');
    setStartDate(''); setEndDate(''); setPage(1)
  }

  const openDetail = (row: OperationLog) => {
    setDetailLog(row)
    setShowDetail(true)
  }

  const openExport = () => {
    setExportForm(prev => ({
      ...prev,
      startDate,
      endDate,
    }))
    setShowExport(true)
  }

  const getLogType = (op: string, operationType?: string) => {
    const normalizedType = operationType?.toLowerCase()
    const explicit = LOG_TYPES.find(type => type.value === normalizedType)
    if (explicit) return explicit

    const lower = op.toLowerCase()
    if (lower.includes('login')) return LOG_TYPES[0]
    if (lower.includes('logout')) return LOG_TYPES[1]
    if (lower.includes('create') || lower.includes('add') || lower.startsWith('post ')) return LOG_TYPES[2]
    if (lower.includes('update') || lower.includes('edit') || lower.startsWith('put ') || lower.startsWith('patch ')) return LOG_TYPES[3]
    if (lower.includes('delete') || lower.includes('remove') || lower.startsWith('delete ')) return LOG_TYPES[4]
    if (lower.includes('export')) return LOG_TYPES[5]
    if (lower.includes('import')) return LOG_TYPES[6]
    return OTHER_LOG_TYPE
  }

  const getAvatarChar = (name: string) => name ? name.charAt(0) : '?'
  const getModuleLabel = (moduleVal: string) => MODULES.find(m => m.value === moduleVal)?.label || moduleVal || '系统'

  const buildExportFilename = () => {
    const now = new Date()
    const pad = (value: number) => String(value).padStart(2, '0')
    const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
    const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    return `logs_${date}_${time}.csv`
  }

  const getCleanBeforeDate = (range: LogCleanRange) => {
    if (range === 'all') return '9999-12-31'
    const date = new Date()
    date.setDate(date.getDate() - Number(range))
    return date.toISOString().slice(0, 10)
  }

  const handleExport = async () => {
    if (exportContentError) {
      toast.warning(exportContentError)
      return
    }
    if (exportDateError) {
      toast.error(exportDateError)
      return
    }
    try {
      const blob = await logsApi.export({
        ...(keyword && { keyword }),
        ...(typeFilter && { type: typeFilter }),
        ...(moduleFilter && { module: moduleFilter }),
        ...(userFilter && { username: userFilter }),
        ...(exportForm.startDate && { startDate: exportForm.startDate }),
        ...(exportForm.endDate && { endDate: exportForm.endDate }),
        format: exportForm.format,
        includeBasic: exportForm.includeBasic,
        includeDetail: exportForm.includeDetail,
        includeIP: exportForm.includeIP,
        includeDiff: exportForm.includeDiff,
      })
      downloadBlobFile(blob, buildExportFilename())
      toast.success('导出成功')
      setShowExport(false)
    } catch (e) { toast.error('导出失败') }
  }

  const handleClean = async () => {
    try {
      const beforeDate = getCleanBeforeDate(cleanRange)
      const res = await logsApi.clean(beforeDate)
      toast.success(`清理成功，共删除 ${res?.deletedCount || 0} 条日志`)
      setShowClean(false)
      refresh()
      logsApi.getStats()
        .then((statsRes: any) => setStats({
          todayOps: Number(statsRes?.todayOps || 0),
          loginCount: Number(statsRes?.loginCount || 0),
          dataChanges: Number(statsRes?.dataChanges || 0),
          activeUsers: Number(statsRes?.activeUsers || 0),
        }))
        .catch(() => {})
    } catch (e) {
      toast.error('清理失败')
    }
  }

  return {
    data, loading, page, pageSize, total, setPage, setPageSize, refresh,
    keyword, setKeyword, typeFilter, setTypeFilter,
    moduleFilter, setModuleFilter, userFilter, setUserFilter,
    startDate, setStartDate, endDate, setEndDate,
    detailLog, setDetailLog,
    showDetail, setShowDetail,
    showExport, setShowExport,
    exportForm, setExportForm,
    showClean, setShowClean,
    cleanRange, setCleanRange,
    stats,
    userOptions,
    dateError,
    exportDateError,
    exportContentError,
    handleSearch, handleReset,
    openDetail, openExport,
    getLogType, getAvatarChar, getModuleLabel,
    handleExport, handleClean, getCleanBeforeDate,
  }
}
