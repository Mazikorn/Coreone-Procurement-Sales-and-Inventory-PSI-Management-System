import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Calculator, Database, RefreshCw, RotateCcw, Search } from 'lucide-react'
import { toast } from 'sonner'
import { abcApi } from '@/api/abc'
import { Pagination } from '@/components/ui/Pagination'
import { getUserRole } from '@/lib/permissions'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'

interface CostPool {
  id: string
  activityCenterId?: string
  activityCenterName: string
  activityCenterCode?: string
  yearMonth: string
  directCost: number
  indirectCost: number
  totalCost: number
  driverQuantity: number
  driverRate: number
  source?: string
  description?: string
}

interface SourceTotals {
  sampleCount?: number
  materialCost?: number
  laborCost?: number
  equipmentCost?: number
  indirectCost?: number
  outboundCount?: number
}

const sourceLabels: Record<string, string> = {
  auto_collect: '自动归集',
  manual: '手工录入',
  sync: '来源同步',
}

const sourceStyles: Record<string, string> = {
  auto_collect: 'bg-blue-50 text-blue-700 border-blue-200',
  manual: 'bg-amber-50 text-amber-700 border-amber-200',
  sync: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

function unwrapList(payload: any): CostPool[] {
  return payload?.list || payload?.items || (Array.isArray(payload) ? payload : [])
}

function getTotal(payload: any, list: CostPool[]) {
  return payload?.pagination?.total ?? payload?.total ?? list.length
}

export function CostPoolList() {
  const [month, setMonth] = useState(currentMonth())
  const [keyword, setKeyword] = useState('')
  const [source, setSource] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [total, setTotal] = useState(0)
  const [pools, setPools] = useState<CostPool[]>([])
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState<string | null>(null)
  const [sourceTotals, setSourceTotals] = useState<SourceTotals | null>(null)

  const canWrite = useMemo(() => {
    const role = getUserRole()
    return role === 'admin' || role === 'finance'
  }, [])

  const filteredPools = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    if (!normalized) return pools
    return pools.filter(pool =>
      `${pool.activityCenterName} ${pool.activityCenterCode || ''} ${pool.description || ''}`
        .toLowerCase()
        .includes(normalized)
    )
  }, [keyword, pools])

  const totals = useMemo(() => {
    return pools.reduce(
      (acc, pool) => ({
        totalCost: acc.totalCost + Number(pool.totalCost || 0),
        driverQuantity: acc.driverQuantity + Number(pool.driverQuantity || 0),
        directCost: acc.directCost + Number(pool.directCost || 0),
        indirectCost: acc.indirectCost + Number(pool.indirectCost || 0),
      }),
      { totalCost: 0, driverQuantity: 0, directCost: 0, indirectCost: 0 }
    )
  }, [pools])

  const loadPools = async () => {
    setLoading(true)
    try {
      const payload = await abcApi.getCostPools({
        yearMonth: month,
        source: source || undefined,
        keyword: keyword.trim() || undefined,
        page,
        pageSize,
      })
      const list = unwrapList(payload)
      setPools(list)
      setTotal(getTotal(payload, list))
    } catch (err) {
      console.error('load cost pools failed', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPools()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, source, keyword, page, pageSize])

  const runAction = async (action: 'sync' | 'auto-collect' | 'recalculate') => {
    setActing(action)
    try {
      const result =
        action === 'sync'
          ? await abcApi.syncCostPools(month)
          : action === 'auto-collect'
            ? await abcApi.autoCollectCostPools(month)
            : await abcApi.recalculateCostPools(month)

      const nextSourceTotals = result?.sourceTotals || result?.collectResult?.sourceTotals || null
      setSourceTotals(nextSourceTotals)
      const messages = {
        sync: '费用来源已同步',
        'auto-collect': '成本池已自动归集',
        recalculate: '成本池已重算',
      }
      toast.success(messages[action])
      await loadPools()
    } catch (err) {
      console.error('cost pool action failed', err)
    } finally {
      setActing(null)
    }
  }

  const resetFilters = () => {
    setKeyword('')
    setSource('')
    setPage(1)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">成本池</h1>
          <p className="mt-1 text-sm text-gray-500">
            按期间归集人工、设备、间接费用，形成作业中心动因费率。
          </p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runAction('sync')}
              disabled={acting !== null}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Database className="h-4 w-4" />
              同步来源
            </button>
            <button
              type="button"
              onClick={() => runAction('auto-collect')}
              disabled={acting !== null}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Calculator className="h-4 w-4" />
              自动归集
            </button>
            <button
              type="button"
              onClick={() => runAction('recalculate')}
              disabled={acting !== null}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RotateCcw className="h-4 w-4" />
              重算快照
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <div className="border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium text-gray-500">成本池总额</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{formatCurrency(totals.totalCost)}</div>
        </div>
        <div className="border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium text-gray-500">直接成本</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{formatCurrency(totals.directCost)}</div>
        </div>
        <div className="border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium text-gray-500">间接成本</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{formatCurrency(totals.indirectCost)}</div>
        </div>
        <div className="border border-gray-200 bg-white p-4">
          <div className="text-xs font-medium text-gray-500">动因量</div>
          <div className="mt-2 text-xl font-semibold text-gray-900">{formatNumber(totals.driverQuantity, 0)}</div>
        </div>
      </div>

      {sourceTotals && (
        <div className="grid gap-3 border border-blue-100 bg-blue-50/50 p-4 md:grid-cols-5">
          <SourceTotal label="出库数" value={formatNumber(sourceTotals.outboundCount, 0)} />
          <SourceTotal label="样本量" value={formatNumber(sourceTotals.sampleCount, 0)} />
          <SourceTotal label="人工来源" value={formatCurrency(sourceTotals.laborCost)} />
          <SourceTotal label="设备来源" value={formatCurrency(sourceTotals.equipmentCost)} />
          <SourceTotal label="间接来源" value={formatCurrency(sourceTotals.indirectCost)} />
        </div>
      )}

      <div className="border border-gray-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              成本期间
              <input
                type="month"
                value={month}
                onChange={event => {
                  setMonth(event.target.value)
                  setPage(1)
                }}
                className="h-10 rounded-md border border-gray-300 px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-gray-500">
              来源
              <select
                value={source}
                onChange={event => {
                  setSource(event.target.value)
                  setPage(1)
                }}
                className="h-10 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
              >
                <option value="">全部来源</option>
                <option value="auto_collect">自动归集</option>
                <option value="manual">手工录入</option>
                <option value="sync">来源同步</option>
              </select>
            </label>
            <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-xs font-medium text-gray-500">
              搜索
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  value={keyword}
                  onChange={event => {
                    setKeyword(event.target.value)
                    setPage(1)
                  }}
                  placeholder="作业中心 / 编码 / 说明"
                  className="h-10 w-full rounded-md border border-gray-300 pl-9 pr-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/10"
                />
              </div>
            </label>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loadPools}
              disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              刷新
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              重置
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <Th>作业中心</Th>
                <Th>来源</Th>
                <Th align="right">直接成本</Th>
                <Th align="right">间接成本</Th>
                <Th align="right">总成本</Th>
                <Th align="right">动因量</Th>
                <Th align="right">动因费率</Th>
                <Th>计算公式</Th>
                <Th>说明</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">加载中...</td>
                </tr>
              ) : filteredPools.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-10 text-center text-sm text-gray-500">
                    暂无成本池数据，可先执行自动归集。
                  </td>
                </tr>
              ) : (
                filteredPools.map(pool => (
                  <tr key={pool.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3">
                      <div className="text-sm font-medium text-gray-900">{pool.activityCenterName}</div>
                      <div className="text-xs text-gray-500">{pool.activityCenterCode || '-'}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={cn(
                        'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                        sourceStyles[pool.source || ''] || 'border-gray-200 bg-gray-50 text-gray-600'
                      )}>
                        {sourceLabels[pool.source || ''] || pool.source || '-'}
                      </span>
                    </td>
                    <Td align="right">{formatCurrency(pool.directCost)}</Td>
                    <Td align="right">{formatCurrency(pool.indirectCost)}</Td>
                    <Td align="right" strong>{formatCurrency(pool.totalCost)}</Td>
                    <Td align="right">{formatNumber(pool.driverQuantity, 0)}</Td>
                    <Td align="right" strong>{formatCurrency(pool.driverRate)}</Td>
                    <td className="min-w-[240px] px-4 py-3 text-sm text-gray-700">
                      总成本 / 动因量 = {formatCurrency(pool.totalCost)} / {formatNumber(pool.driverQuantity, 0)}
                    </td>
                    <td className="min-w-[220px] px-4 py-3 text-sm text-gray-500">
                      {pool.description || '按本期来源自动归集'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="border-t border-gray-200 p-4">
          <Pagination
            page={page}
            pageSize={pageSize}
            total={total}
            onChangePage={setPage}
            onChangePageSize={next => {
              setPageSize(next)
              setPage(1)
            }}
          />
        </div>
      </div>
    </div>
  )
}

function SourceTotal({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-blue-700">{label}</div>
      <div className="mt-1 text-base font-semibold text-gray-900">{value}</div>
    </div>
  )
}

function Th({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={cn(
      'whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-normal text-gray-500',
      align === 'right' ? 'text-right' : 'text-left'
    )}>
      {children}
    </th>
  )
}

function Td({
  children,
  align = 'left',
  strong = false,
}: {
  children: ReactNode
  align?: 'left' | 'right'
  strong?: boolean
}) {
  return (
    <td className={cn(
      'whitespace-nowrap px-4 py-3 text-sm text-gray-700',
      align === 'right' && 'text-right',
      strong && 'font-semibold text-gray-900'
    )}>
      {children}
    </td>
  )
}

export default CostPoolList
