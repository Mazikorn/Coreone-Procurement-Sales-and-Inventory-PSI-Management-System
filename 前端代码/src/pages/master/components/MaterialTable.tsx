import { Search, CheckCircle2, XCircle, Trash2, RotateCcw, Edit2, Eye, Power } from 'lucide-react'
import type { Material } from '@/types'
import { Pagination } from '@/components/ui/Pagination'

interface Props {
  data: Material[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  selectedIds: Set<string>
  keyword: string
  categoryId: string
  supplierId: string
  quickFilter: string
  categories: { id: string; name: string }[]
  suppliers: { id: string; name: string }[]
  getCategoryName: (id?: string) => string
  getSupplierName: (id?: string) => string
  statusBadge: (status: string) => React.ReactNode
  onKeywordChange: (v: string) => void
  onCategoryIdChange: (v: string) => void
  onSupplierIdChange: (v: string) => void
  onQuickFilterChange: (v: 'all' | 'active' | 'inactive' | 'low-stock') => void
  onSearch: () => void
  onReset: () => void
  onToggleSelectAll: () => void
  onToggleSelect: (id: string) => void
  onClearSelection: () => void
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
  onOpenDetail: (row: Material) => void
  onOpenEdit: (row: Material) => void
  onToggleStatus: (row: Material) => void
  onDelete: (id: string) => void
  onBatchToggleStatus: (status: 'active' | 'inactive') => void
  onBatchDelete: () => void
}

export function MaterialTable({
  data, loading, total, page, pageSize, selectedIds,
  keyword, categoryId, supplierId, quickFilter, categories, suppliers,
  getCategoryName, getSupplierName, statusBadge,
  onKeywordChange, onCategoryIdChange, onSupplierIdChange, onQuickFilterChange,
  onSearch, onReset,
  onToggleSelectAll, onToggleSelect, onClearSelection,
  onPageChange, onPageSizeChange,
  onOpenDetail, onOpenEdit, onToggleStatus, onDelete,
  onBatchToggleStatus, onBatchDelete,
}: Props) {
  const quickFilterTabs = [
    { key: 'all' as const, label: '全部' },
    { key: 'active' as const, label: '已启用' },
    { key: 'inactive' as const, label: '已停用' },
    { key: 'low-stock' as const, label: '低库存' },
  ]

  return (
    <div className="space-y-4">
      {/* Quick Filter Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1 w-fit">
        {quickFilterTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => onQuickFilterChange(tab.key)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              quickFilter === tab.key ? 'bg-blue-500 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Bar */}
      <div className="flex items-center gap-3 bg-white p-4 rounded-lg border border-gray-200 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="搜索物料名称、编码"
            value={keyword}
            onChange={e => onKeywordChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onSearch() }}
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={categoryId}
          onChange={e => onCategoryIdChange(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[140px]"
        >
          <option value="">全部分类</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={supplierId}
          onChange={e => onSupplierIdChange(e.target.value)}
          className="px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-w-[140px]"
        >
          <option value="">全部供应商</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button onClick={onSearch} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium">
          <Search className="w-4 h-4" />
          查询
        </button>
        <button onClick={onReset} className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium">
          <RotateCcw className="w-4 h-4" />
          重置
        </button>
      </div>

      {/* Batch Actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <input
              type="checkbox"
              checked={data.length > 0 && selectedIds.size === data.length}
              onChange={onToggleSelectAll}
              className="w-4 h-4 rounded border-gray-300 text-blue-600"
            />
            <span>已选择 <strong>{selectedIds.size}</strong> 项</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => onBatchToggleStatus('active')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-white rounded-md border border-transparent hover:border-gray-200 transition-colors">
              <CheckCircle2 className="w-3.5 h-3.5" />
              批量启用
            </button>
            <button onClick={() => onBatchToggleStatus('inactive')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 hover:bg-white rounded-md border border-transparent hover:border-gray-200 transition-colors">
              <XCircle className="w-3.5 h-3.5" />
              批量停用
            </button>
            <button onClick={onBatchDelete} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-white rounded-md border border-transparent hover:border-red-200 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
              批量删除
            </button>
            <button onClick={onClearSelection} className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">取消选择</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={data.length > 0 && selectedIds.size === data.length}
                    onChange={onToggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">物料编码</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">物料名称</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">规格</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">分类</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">供应商</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">库存</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-[140px]">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">暂无数据</td></tr>
              ) : data.map(row => (
                <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(row.id) ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={() => onToggleSelect(row.id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    />
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-600">{row.code}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.name}</td>
                  <td className="px-4 py-3 text-gray-500">{row.spec || '-'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                      {getCategoryName(row.categoryId)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{getSupplierName(row.supplierId)}</td>
                  <td className="px-4 py-3">
                    <span className={`text-sm font-medium ${row.stock <= row.minStock ? 'text-red-600' : 'text-gray-900'}`}>
                      {row.stock}
                    </span>
                  </td>
                  <td className="px-4 py-3">{statusBadge(row.status)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => onOpenDetail(row)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="详情">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onOpenEdit(row)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="编辑">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onToggleStatus(row)} className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors" title={row.status === 'active' ? '停用' : '启用'}>
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => onDelete(row.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="删除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200">
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
