import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { supplierApi } from '@/api/master'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import type { Supplier } from '@/types'

export interface FormData {
  code: string
  name: string
  contact: string
  phone: string
  email: string
  address: string
  taxNo: string
  bankName: string
  bankAccount: string
  status: 'active' | 'inactive'
  rating: number
}

const defaultForm: FormData = {
  code: '',
  name: '',
  contact: '',
  phone: '',
  email: '',
  address: '',
  taxNo: '',
  bankName: '',
  bankAccount: '',
  status: 'active',
  rating: 5,
}

export function useSuppliersPage() {
  const url = useUrlParams()
  const [searchKeyword, setSearchKeyword] = useState(url.get('keyword', ''))
  const [searchStatus, setSearchStatus] = useState(url.get('status', ''))
  const [keyword, setKeyword] = useState(url.get('keyword', ''))
  const [status, setStatus] = useState(url.get('status', ''))
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [modalType, setModalType] = useState<'create' | 'edit' | 'detail' | null>(null)
  const [form, setForm] = useState<FormData>(defaultForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailRow, setDetailRow] = useState<Supplier | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmProps, setConfirmProps] = useState<{
    title: string
    description: string
    confirmText: string
    confirmVariant: 'primary' | 'danger'
    onConfirm: () => void
  } | null>(null)

  const fetchFn = useCallback(
    async (params: { page: number; pageSize: number }) => {
      const res: any = await supplierApi.getList({
        ...params,
        keyword: keyword || undefined,
        status: status || undefined,
      })
      return {
        list: res?.list || res?.data?.list || [],
        pagination: res?.pagination || res?.data?.pagination,
      }
    },
    [keyword, status]
  )

  const {
    data,
    loading,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    refresh,
  } = usePagination<Supplier>({
    fetchFn,
    initialPage: Math.max(1, url.getNumber('page', 1)),
    initialPageSize: 20,
    deps: [keyword, status],
  })

  const stats = useMemo(() => {
    const all = data
    return {
      total: total || 0,
      active: all.filter(s => s.status === 'active').length,
      inactive: all.filter(s => s.status === 'inactive').length,
      newThisMonth: all.filter(s => {
        const d = new Date(s.createdAt)
        const now = new Date()
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      }).length,
    }
  }, [data, total])

  const getAvatarColor = (name: string) => {
    const colors = [
      { bg: 'bg-blue-100', text: 'text-blue-600' },
      { bg: 'bg-green-100', text: 'text-green-600' },
      { bg: 'bg-purple-100', text: 'text-purple-600' },
      { bg: 'bg-orange-100', text: 'text-orange-600' },
      { bg: 'bg-pink-100', text: 'text-pink-600' },
    ]
    const idx = name.charCodeAt(0) % colors.length
    return colors[idx]
  }

  const handleSearch = () => { setKeyword(searchKeyword); setStatus(searchStatus); setPage(1) }
  const handleReset = () => { setSearchKeyword(''); setSearchStatus(''); setKeyword(''); setStatus(''); setPage(1) }

  const toggleSelectAll = () => {
    if (data.length > 0 && selectedIds.size === data.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(data.map(d => d.id)))
  }
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }
  const clearSelection = () => setSelectedIds(new Set())

  const openCreate = () => { setForm(defaultForm); setEditingId(null); setModalType('create') }
  const openEdit = (row: Supplier) => {
    setDetailRow(row)
    setForm({
      code: row.code, name: row.name, contact: row.contact || '', phone: row.phone || '',
      email: row.email || '', address: row.address || '', taxNo: row.taxNo || '',
      bankName: row.bankName || '', bankAccount: row.bankAccount || '',
      status: row.status, rating: row.rating,
    })
    setEditingId(row.id)
    setModalType('edit')
  }
  const openDetail = (row: Supplier) => { setDetailRow(row); setModalType('detail') }

  const handleSubmit = async () => {
    if (!form.code || !form.name) { toast.error('请填写编码和名称'); return }
    try {
      if (editingId) {
        await supplierApi.update(editingId, form)
        toast.success('修改成功')
      } else {
        await supplierApi.create(form)
        toast.success('创建成功')
      }
      setModalType(null)
      refresh()
    } catch {
      toast.error(editingId ? '修改失败' : '创建失败')
    }
  }

  const handleToggleStatus = async (row: Supplier) => {
    try {
      await supplierApi.update(row.id, { status: row.status === 'active' ? 'inactive' : 'active' })
      toast.success('状态已更新')
      refresh()
    } catch {
      toast.error('操作失败')
    }
  }

  const handleDelete = (id: string) => {
    const row = data.find(s => s.id === id)
    if (!row) return

    setConfirmProps({
      title: '确认删除',
      description: `确定要删除供应商「${row.name}」吗？此操作不可撤销。`,
      confirmText: '确认删除',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          await supplierApi.delete(row.id)
          toast.success('删除成功')
          refresh()
        } catch {
          toast.error('删除失败')
        }
      },
    })
    setConfirmOpen(true)
  }

  const batchDelete = async () => {
    const ids = Array.from(selectedIds)
    for (const id of ids) {
      try { await supplierApi.delete(id) } catch { /* skip */ }
    }
    toast.success(`已删除 ${ids.length} 个供应商`)
    clearSelection()
    refresh()
  }

  const batchToggleStatus = async (status: 'active' | 'inactive') => {
    const ids = Array.from(selectedIds)
    for (const id of ids) {
      try { await supplierApi.update(id, { status }) } catch { /* skip */ }
    }
    toast.success(`已更新 ${ids.length} 个供应商状态`)
    clearSelection()
    refresh()
  }

  return {
    stats,
    data, loading, total, page, pageSize, setPage, setPageSize,
    selectedIds,
    searchKeyword, setSearchKeyword, searchStatus, setSearchStatus,
    getAvatarColor,
    handleSearch, handleReset,
    toggleSelectAll, toggleSelect, clearSelection,
    batchDelete, batchToggleStatus,
    openCreate, openEdit, openDetail,
    handleToggleStatus, handleDelete,
    modalType, setModalType,
    form, setForm,
    handleSubmit,
    detailRow,
    confirmOpen, setConfirmOpen, confirmProps,
  }
}
