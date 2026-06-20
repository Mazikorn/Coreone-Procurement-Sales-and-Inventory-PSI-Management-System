import React from 'react'
import { Search, Loader2, FolderOpen } from 'lucide-react'
import { Pagination } from '@/components/ui/Pagination'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import type { Project } from '@/types'

const typeMap: Record<string, string> = {
  he: '病理技术-HE制片',
  ihc: '病理技术-免疫组化',
  ss: '病理技术-特殊染色',
  mp: '分子诊断',
  cyto: '病理诊断-细胞学检测',
}

const typeBadgeClass: Record<string, string> = {
  he: 'bg-blue-50 text-blue-600',
  ihc: 'bg-indigo-50 text-indigo-600',
  ss: 'bg-teal-50 text-teal-600',
  mp: 'bg-purple-50 text-purple-600',
  cyto: 'bg-amber-50 text-amber-600',
}

const typeOptions = [
  { value: '', label: '全部类型' },
  { value: 'he', label: '病理技术-HE制片' },
  { value: 'ihc', label: '病理技术-免疫组化' },
  { value: 'ss', label: '病理技术-特殊染色' },
  { value: 'mp', label: '分子诊断' },
  { value: 'cyto', label: '病理诊断-细胞学检测' },
]

const statusOptions = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '已启用' },
  { value: 'inactive', label: '已停用' },
]

const bomOptions = [
  { value: '', label: 'BOM配置' },
  { value: 'configured', label: '已配置' },
  { value: 'unconfigured', label: '未配置' },
]

interface Props {
  data: Project[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  keyword: string
  typeFilter: string
  statusFilter: string
  bomFilter: string
  selectedIds: Set<string>
  canWrite: boolean
  onKeywordChange: (v: string) => void
  onTypeFilterChange: (v: string) => void
  onStatusFilterChange: (v: string) => void
  onBomFilterChange: (v: string) => void
  onQuery: () => void
  onReset: () => void
  onToggleSelectAll: (checked: boolean) => void
  onToggleSelectOne: (id: string, checked: boolean) => void
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
  onOpenEdit: (row: Project) => void
  onOpenCopy: (row: Project) => void
  onToggleStatus: (row: Project) => void
  onOpenDelete: (row: Project) => void
  onBatchEnable: () => void
  onBatchDisable: () => void
  onClearSelection: () => void
}

export function ProjectTable({
  data,
  loading,
  total,
  page,
  pageSize,
  keyword,
  typeFilter,
  statusFilter,
  bomFilter,
  selectedIds,
  canWrite,
  onKeywordChange,
  onTypeFilterChange,
  onStatusFilterChange,
  onBomFilterChange,
  onQuery,
  onReset,
  onToggleSelectAll,
  onToggleSelectOne,
  onPageChange,
  onPageSizeChange,
  onOpenEdit,
  onOpenCopy,
  onToggleStatus,
  onOpenDelete,
  onBatchEnable,
  onBatchDisable,
  onClearSelection,
}: Props) {
  const isAllSelected = data.length > 0 && selectedIds.size === data.length

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <span className="text-base font-semibold text-gray-900">服务列表</span>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="搜索服务名称/编号..."
              value={keyword}
              onChange={e => onKeywordChange(e.target.value)}
              className="w-56 pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <SearchableSelect
            value={typeFilter}
            onChange={val => onTypeFilterChange(val)}
            options={typeOptions.map(o => ({ value: o.value, label: o.label }))}
            placeholder="全部类型"
            className="w-32"
          />
          <SearchableSelect
            value={statusFilter}
            onChange={val => onStatusFilterChange(val)}
            options={statusOptions.map(o => ({ value: o.value, label: o.label }))}
            placeholder="全部状态"
            className="w-32"
          />
          <SearchableSelect
            value={bomFilter}
            onChange={val => onBomFilterChange(val)}
            options={bomOptions.map(o => ({ value: o.value, label: o.label }))}
            placeholder="BOM配置"
            className="w-36"
          />
          <button
            onClick={onQuery}
            className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 text-sm font-medium transition-colors"
          >
            查询
          </button>
          <button
            onClick={onReset}
            className="px-4 py-2 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
          >
            重置
          </button>
        </div>
      </div>

      {canWrite && selectedIds.size > 0 && (
        <div className="px-5 py-3 bg-blue-50 border-b border-blue-100 flex items-center gap-3">
          <span className="text-sm text-gray-700">
            已选择 <span className="font-semibold">{selectedIds.size}</span> 项
          </span>
          <button onClick={onBatchEnable} className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-md text-sm hover:bg-gray-50 transition-colors">
            批量启用
          </button>
          <button onClick={onBatchDisable} className="px-3 py-1.5 bg-white text-gray-700 border border-gray-300 rounded-md text-sm hover:bg-gray-50 transition-colors">
            批量停用
          </button>
          <button onClick={onClearSelection} className="px-3 py-1.5 text-gray-500 hover:text-gray-700 text-sm transition-colors">
            取消选择
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {canWrite && (
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={e => onToggleSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">服务编号</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">服务名称</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">服务类型</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">检测周期</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">BOM配置</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">可支撑样本数</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">状态</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={canWrite ? 9 : 8} className="px-4 py-12 text-center text-gray-400">
                  <div className="flex items-center justify-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />加载中...
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 9 : 8} className="px-4 py-12 text-center text-gray-400">
                  <FolderOpen className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                  <div>暂无检测服务</div>
                  <div className="text-xs mt-1">点击"新建服务"添加检测服务</div>
                </td>
              </tr>
            ) : data.map(row => (
              <tr key={row.id} className="hover:bg-gray-50 transition-colors">
                {canWrite && (
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={e => onToggleSelectOne(row.id, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                )}
                <td className="px-4 py-3 font-mono text-gray-600 text-xs">{row.code}</td>
                <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${typeBadgeClass[row.type] || 'bg-gray-100 text-gray-600'}`}>
                    {typeMap[row.type] || row.type}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">{row.cycle || '-'}</td>
                <td className="px-4 py-3">
                  {row.bomId ? (
                    <span className="text-gray-700 text-sm">{row.bomName || '已配置'}</span>
                  ) : (
                    <span className="text-gray-400 text-sm">未配置</span>
                  )}
                </td>
                <td
                  title={row.bomId ? '根据关联BOM物料用量和当前可用库存实时计算' : '未配置BOM，暂无法计算'}
                  className={`px-4 py-3 font-medium ${
                    row.supportableSamples !== undefined && row.supportableSamples !== null && row.supportableSamples <= 10
                      ? 'text-red-500'
                      : row.supportableSamples !== undefined && row.supportableSamples !== null && row.supportableSamples <= 50
                        ? 'text-amber-500'
                        : 'text-gray-700'
                  }`}
                >
                  {row.supportableSamples !== undefined && row.supportableSamples !== null ? row.supportableSamples : '-'}
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    row.status === 'active' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {row.status === 'active' ? '已启用' : '已停用'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {canWrite ? (
                      <>
                        <button
                          onClick={() => onOpenEdit(row)}
                          className="px-2 py-1 text-gray-500 hover:text-blue-600 text-xs font-medium transition-colors"
                        >
                          编辑
                        </button>
                        <button
                          onClick={() => onOpenCopy(row)}
                          className="px-2 py-1 text-gray-500 hover:text-blue-600 text-xs font-medium transition-colors"
                        >
                          复制
                        </button>
                        <button
                          onClick={() => onToggleStatus(row)}
                          className="px-2 py-1 text-gray-500 hover:text-amber-600 text-xs font-medium transition-colors"
                        >
                          {row.status === 'active' ? '停用' : '启用'}
                        </button>
                        <button
                          onClick={() => onOpenDelete(row)}
                          className="px-2 py-1 text-gray-500 hover:text-red-600 text-xs font-medium transition-colors"
                        >
                          删除
                        </button>
                      </>
                    ) : (
                      <span className="px-2 py-1 text-gray-400 text-xs">只读</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-5 py-3 border-t border-gray-200">
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </div>
    </div>
  )
}
