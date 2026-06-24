import React from 'react'
import { Search } from 'lucide-react'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { OperationLog } from '@/types'
import { Pagination } from '@/components/ui/Pagination'

interface Props {
  data: OperationLog[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  keyword: string
  typeFilter: string
  moduleFilter: string
  sourceFilter: string
  userFilter: string
  startDate: string
  endDate: string
  dateError?: string
  logTypes: { value: string; label: string }[]
  modules: { value: string; label: string }[]
  sources: { value: string; label: string }[]
  users: { value: string; label: string }[]
  getLogType: (op: string, operationType?: string) => { value: string; label: string; className: string }
  getAvatarChar: (name: string) => string
  getModuleLabel: (moduleVal: string) => string
  getSourceLabel: (sourceVal?: string) => string
  onKeywordChange: (v: string) => void
  onTypeFilterChange: (v: string) => void
  onModuleFilterChange: (v: string) => void
  onSourceFilterChange: (v: string) => void
  onUserFilterChange: (v: string) => void
  onStartDateChange: (v: string) => void
  onEndDateChange: (v: string) => void
  onSearch: () => void
  onReset: () => void
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
  onOpenDetail: (row: OperationLog) => void
}

export function LogsTable({
  data, loading, total, page, pageSize,
  keyword, typeFilter, moduleFilter, sourceFilter, userFilter, startDate, endDate, dateError = '',
  logTypes, modules, sources, users,
  getLogType, getAvatarChar, getModuleLabel, getSourceLabel,
  onKeywordChange, onTypeFilterChange, onModuleFilterChange, onSourceFilterChange, onUserFilterChange,
  onStartDateChange, onEndDateChange,
  onSearch, onReset,
  onPageChange, onPageSizeChange,
  onOpenDetail,
}: Props) {
  const normalizedKeyword = keyword.trim().toLowerCase()

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
        <span className="text-base font-semibold text-gray-900">审计记录</span>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={keyword}
              onChange={e => onKeywordChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && onSearch()}
              placeholder="单号/物料/操作内容"
              className="h-10 w-44 rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none transition-all focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
            />
          </div>
          <SearchableSelect
            value={typeFilter}
            onChange={val => onTypeFilterChange(val)}
            options={[
              { value: '', label: '全部操作类型' },
              ...logTypes.map(t => ({ value: t.value, label: t.label })),
            ]}
            placeholder="全部操作类型"
            className="w-32"
          />
          <SearchableSelect
            value={moduleFilter}
            onChange={val => onModuleFilterChange(val)}
            options={modules.map(m => ({ value: m.value, label: m.label }))}
            placeholder="全部模块"
            className="w-32"
          />
          <SearchableSelect
            value={sourceFilter}
            onChange={val => onSourceFilterChange(val || 'all')}
            options={sources.map(s => ({ value: s.value, label: s.label }))}
            placeholder="统一审计"
            className="w-32"
          />
          <SearchableSelect
            value={userFilter}
            onChange={val => onUserFilterChange(val)}
            options={users.map(u => ({ value: u.value, label: u.label }))}
            placeholder="全部用户"
            className="w-36"
          />
          <input
            type="date"
            value={startDate}
            onChange={e => onStartDateChange(e.target.value)}
            aria-invalid={Boolean(dateError)}
            aria-describedby={dateError ? 'logs-date-error' : undefined}
            className="h-10 px-3 text-sm text-gray-900 bg-white border border-gray-200 rounded-md outline-none transition-all focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 aria-[invalid=true]:border-red-500"
          />
          <span className="text-gray-500">至</span>
          <input
            type="date"
            value={endDate}
            onChange={e => onEndDateChange(e.target.value)}
            aria-invalid={Boolean(dateError)}
            aria-describedby={dateError ? 'logs-date-error' : undefined}
            className="h-10 px-3 text-sm text-gray-900 bg-white border border-gray-200 rounded-md outline-none transition-all focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10 aria-[invalid=true]:border-red-500"
          />
          <button onClick={onSearch} className="h-10 px-4 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm transition-all">查询</button>
          <button onClick={onReset} className="h-10 px-4 text-sm font-medium text-gray-700 bg-transparent hover:bg-gray-100 rounded-md transition-all">重置</button>
        </div>
      </div>
      {normalizedKeyword && (
        <div className="border-b border-blue-100 bg-blue-50 px-5 py-3">
          <div className="text-sm font-medium text-blue-900">当前回看业务标识：{keyword.trim()}</div>
          <div className="mt-1 text-xs text-blue-700">列表已限定与该标识相关的操作、库存、成本和对账证据。</div>
        </div>
      )}
      {dateError && (
        <p id="logs-date-error" role="alert" className="px-5 pt-3 text-sm text-red-600">
          {dateError}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              {['操作时间', '操作用户', '来源', '操作类型', '操作模块', '业务单据', '操作内容', '操作'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-700 tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center">
                  {normalizedKeyword ? (
                    <div className="space-y-2">
                      <div className="text-sm font-medium text-gray-900">未找到 {keyword.trim()} 的审计证据</div>
                      <div className="text-sm text-gray-500">
                        请确认单号是否正确，或返回业务页面查看该单据是否已生成库存、批次、成本或对账记录。
                      </div>
                    </div>
                  ) : (
                    <span className="text-gray-400">暂无审计记录</span>
                  )}
                </td>
              </tr>
            ) : data.map(row => {
              const logType = getLogType(row.operation, row.operationType)
              const businessToken = String(row.businessId || row.auditEvent?.businessId || row.auditEvent?.subjectId || '').toLowerCase()
              const isCurrentBusiness = Boolean(normalizedKeyword && businessToken.includes(normalizedKeyword))
              return (
                <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3.5 font-mono text-[13px] text-gray-700">{new Date(row.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 bg-blue-50 rounded-full flex items-center justify-center text-blue-500 text-xs font-medium">
                        {getAvatarChar(row.username)}
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{row.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 font-medium">{row.sourceLabel || getSourceLabel(row.sourceType)}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${logType.className}`}>
                      {logType.label}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 font-medium">{getModuleLabel(row.module || (row.requestData?.module as string) || '')}</span>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-[13px] text-gray-600">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.businessId && row.businessUrl ? (
                        <a
                          href={row.businessUrl}
                          className="text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          {row.businessId}
                        </a>
                      ) : row.businessId || '-'}
                      {isCurrentBusiness && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                          当前单据
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-sm text-gray-900">{row.description}</div>
                    {row.auditEvent && (
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span>标准事件：{row.auditEvent.eventCode}</span>
                        <span>证据：{row.auditEvent.evidenceSource}</span>
                      </div>
                    )}
                    {row.requestData && (
                      <div className="text-xs text-gray-500 mt-0.5">{JSON.stringify(row.requestData).slice(0, 60)}...</div>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    <button onClick={() => onOpenDetail(row)} className="h-8 px-3 text-[13px] text-gray-700 hover:bg-gray-100 rounded-md transition-colors">详情</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-gray-50">
        <span className="text-sm text-gray-500">共 {total} 条记录</span>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onChangePage={onPageChange}
          onChangePageSize={onPageSizeChange}
        />
      </div>
    </div>
  )
}
