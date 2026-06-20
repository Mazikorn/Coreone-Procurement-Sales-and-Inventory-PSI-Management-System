import React from 'react'
import { CheckCircle2, Search, Trash2, XCircle } from 'lucide-react'
import type { User } from '@/types'
import { Pagination } from '@/components/ui/Pagination'
import { SearchableSelect } from '@/components/ui/SearchableSelect'
import { formatDateTime } from '@/lib/utils'
import { isProtectedAdminUser, type RoleItem } from '../hooks/useUsersPage'

interface Props {
  data: User[]
  loading: boolean
  total: number
  page: number
  pageSize: number
  keyword: string
  roleFilter: string
  statusFilter: string
  selectedRoleId: string
  selectedIds: Set<string>
  roles: RoleItem[]
  onKeywordChange: (v: string) => void
  onRoleFilterChange: (v: string) => void
  onStatusFilterChange: (v: string) => void
  onSelectedRoleIdChange: (v: string) => void
  onToggleSelectAll: () => void
  onToggleSelect: (id: string) => void
  onClearSelection: () => void
  onBatchToggleStatus: (status: 'active' | 'inactive') => void
  onBatchDelete: () => void
  onSearch: () => void
  onReset: () => void
  onPageChange: (p: number) => void
  onPageSizeChange: (s: number) => void
  onOpenDetail: (row: User) => void
  onOpenEdit: (row: User) => void
  onToggleStatus: (row: User) => void
  onResetPassword: (id: string) => void
  onDelete: (id: string) => void
}

export function UsersTable({
  data, loading, total, page, pageSize,
  keyword, roleFilter, statusFilter, selectedRoleId, selectedIds, roles,
  onKeywordChange, onRoleFilterChange, onStatusFilterChange, onSelectedRoleIdChange,
  onToggleSelectAll, onToggleSelect, onClearSelection, onBatchToggleStatus, onBatchDelete,
  onSearch, onReset,
  onPageChange, onPageSizeChange,
  onOpenDetail, onOpenEdit, onToggleStatus, onResetPassword, onDelete,
}: Props) {
  const selectableIds = data.filter(row => !isProtectedAdminUser(row)).map(row => row.id)
  const allSelectableSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id))

  return (
    <div className="grid grid-cols-[300px_1fr] gap-5">
      {/* Role List */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden h-fit">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
          <span className="text-base font-semibold text-gray-900">角色列表</span>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {roles.map(role => (
            <div
              key={role.id}
              onClick={() => onSelectedRoleIdChange(role.id === selectedRoleId ? '' : role.id)}
              className={`p-4 rounded-lg border cursor-pointer transition-all ${selectedRoleId === role.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{role.name}</span>
                  {role.isSystem && (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-500 font-medium">系统角色</span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{role.userCount} 人</span>
              </div>
              <div className="text-xs text-gray-500 mb-2 line-clamp-1">{role.description || '-'}</div>
              <div className="flex flex-wrap gap-1">
                {role.permissions.slice(0, 3).map(p => (
                  <span key={p} className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{p}</span>
                ))}
                {role.permissions.length > 3 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">+{role.permissions.length - 3}</span>
                )}
              </div>
            </div>
          ))}
          {roles.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-8">暂无角色数据</div>
          )}
        </div>
      </div>

      <div className="space-y-3">
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <input
              type="checkbox"
              checked={allSelectableSelected}
              disabled={selectableIds.length === 0}
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

      {/* User Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-wrap gap-3">
          <span className="text-base font-semibold text-gray-900">用户列表</span>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="搜索用户名、姓名..."
                value={keyword}
                onChange={e => onKeywordChange(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSearch()}
                className="w-full h-10 pl-10 pr-4 text-sm text-gray-900 bg-white border border-gray-200 rounded-md outline-none transition-all focus:border-blue-500 focus:ring-[3px] focus:ring-blue-500/10"
              />
            </div>
            <SearchableSelect
              value={roleFilter}
              onChange={val => onRoleFilterChange(val)}
              options={[
                { value: '', label: '全部角色' },
                ...roles.map(r => ({ value: r.code, label: r.name })),
              ]}
              placeholder="全部角色"
              className="w-28"
            />
            <SearchableSelect
              value={statusFilter}
              onChange={val => onStatusFilterChange(val)}
              options={[
                { value: '', label: '全部状态' },
                { value: 'active', label: '正常' },
                { value: 'inactive', label: '禁用' },
              ]}
              placeholder="全部状态"
              className="w-28"
            />
            <button onClick={onSearch} className="h-10 px-4 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 shadow-sm transition-all">查询</button>
            <button onClick={onReset} className="h-10 px-4 text-sm font-medium text-gray-700 bg-transparent hover:bg-gray-100 rounded-md transition-all">重置</button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={allSelectableSelected}
                    disabled={selectableIds.length === 0}
                    onChange={onToggleSelectAll}
                    className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                  />
                </th>
                {['用户名', '姓名', '部门', '角色', '状态', '最后登录', '操作'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-700 tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">加载中...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">暂无数据</td></tr>
              ) : data.map(row => {
                const protectedAdmin = isProtectedAdminUser(row)
                return (
                <tr key={row.id} className={`hover:bg-gray-50 transition-colors ${selectedIds.has(row.id) ? 'bg-blue-50/50' : ''}`}>
                  <td className="px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      disabled={protectedAdmin}
                      onChange={() => onToggleSelect(row.id)}
                      className="rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                    />
                  </td>
                  <td className="px-4 py-3.5 font-medium text-gray-900">{row.username}</td>
                  <td className="px-4 py-3.5 text-gray-900">{row.realName}</td>
                  <td className="px-4 py-3.5 text-gray-700">{row.department || '-'}</td>
                  <td className="px-4 py-3.5 text-gray-700">{row.role}</td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${row.status === 'active' ? 'bg-green-50 text-green-500' : 'bg-gray-100 text-gray-500'}`}>
                      {row.status === 'active' ? '正常' : '禁用'}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-gray-500 text-sm">{formatDateTime(row.lastLogin || '')}</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1">
                      <button onClick={() => onOpenDetail(row)} className="h-8 px-3 text-[13px] text-gray-700 hover:bg-gray-100 rounded-md transition-colors">详情</button>
                      <button onClick={() => onOpenEdit(row)} className="h-8 px-3 text-[13px] text-gray-700 hover:bg-gray-100 rounded-md transition-colors">编辑</button>
                      {!protectedAdmin && (
                        <button onClick={() => onToggleStatus(row)} className="h-8 px-3 text-[13px] text-gray-700 hover:bg-gray-100 rounded-md transition-colors">
                          {row.status === 'active' ? '停用' : '启用'}
                        </button>
                      )}
                      <button onClick={() => onResetPassword(row.id)} className="h-8 px-3 text-[13px] text-gray-700 hover:bg-gray-100 rounded-md transition-colors">重置密码</button>
                      {!protectedAdmin && (
                        <button onClick={() => onDelete(row.id)} className="h-8 px-3 text-[13px] text-red-500 hover:bg-red-50 rounded-md transition-colors">删除</button>
                      )}
                    </div>
                  </td>
                </tr>
              )})}
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
      </div>
    </div>
  )
}
