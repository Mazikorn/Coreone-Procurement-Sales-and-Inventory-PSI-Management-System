import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supplierApi } from '@/api/master'
import type { Supplier } from '@/types'

export interface FormData {
  id?: string
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
}

type ModalType = 'create' | 'edit' | 'detail' | null

const emptyForm: FormData = {
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
}

const avatarColors = [
  { bg: '#dbeafe', text: '#1d4ed8' },
  { bg: '#dcfce7', text: '#15803d' },
  { bg: '#fef3c7', text: '#b45309' },
  { bg: '#fee2e2', text: '#b91c1c' },
  { bg: '#ede9fe', text: '#6d28d9' },
]

export function useSuppliersPage() {
  const initialParams = new URLSearchParams(window.location.search)
  const initialKeyword = initialParams.get('keyword') || ''
  const initialIncludeDeleted = initialParams.get('includeDeleted') === 'true'
  const [data, setData] = useState<Supplier[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(20)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchKeyword, setSearchKeyword] = useState(initialKeyword)
  const [searchStatus, setSearchStatus] = useState('all')
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, newThisMonth: 0 })
  const [modalType, setModalType] = useState<ModalType>(null)
  const [form, setForm] = useState<FormData>(emptyForm)
  const [detailRow, setDetailRow] = useState<Supplier | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmProps, setConfirmProps] = useState<{
    title: string
    description: string
    confirmText?: string
    confirmVariant?: 'danger' | 'primary'
    onConfirm: () => void
  } | null>(null)

  const loadData = useCallback(async () => {
    try {
      setLoading(true)
      const res = await supplierApi.getList({
        page,
        pageSize,
        keyword: searchKeyword || undefined,
        status: searchStatus !== 'all' ? searchStatus : undefined,
        includeDeleted: initialIncludeDeleted || undefined,
      } as any)
      setData(res?.list || [])
      setTotal(res?.pagination?.total || res?.total || 0)
    } catch {
      toast.error('加载供应商失败')
    } finally {
      setLoading(false)
    }
  }, [initialIncludeDeleted, page, pageSize, searchKeyword, searchStatus])

  useEffect(() => {
    loadData()
  }, [loadData])

  useEffect(() => {
    setSelectedIds(new Set())
  }, [page, pageSize, searchKeyword, searchStatus])

  useEffect(() => {
    supplierApi.getStats({
      keyword: searchKeyword || undefined,
      status: searchStatus !== 'all' ? searchStatus : undefined,
      includeDeleted: initialIncludeDeleted || undefined,
    })
      .then((res: any) => setStats({
        total: Number(res?.total || 0),
        active: Number(res?.active || 0),
        inactive: Number(res?.inactive || 0),
        newThisMonth: Number(res?.newThisMonth || 0),
      }))
      .catch(() => setStats({ total, active: 0, inactive: 0, newThisMonth: 0 }))
  }, [initialIncludeDeleted, searchKeyword, searchStatus, total])

  const getAvatarColor = (name: string) => {
    const code = Array.from(name || 'S').reduce((sum, char) => sum + char.charCodeAt(0), 0)
    return avatarColors[code % avatarColors.length]
  }

  const openCreate = () => {
    setForm(emptyForm)
    setModalType('create')
  }

  const openEdit = (row: Supplier) => {
    setForm({
      id: row.id,
      code: row.code || '',
      name: row.name || '',
      contact: row.contact || '',
      phone: row.phone || '',
      email: row.email || '',
      address: row.address || '',
      taxNo: row.taxNo || '',
      bankName: row.bankName || '',
      bankAccount: row.bankAccount || '',
      status: row.status || 'active',
    })
    setModalType('edit')
  }

  const openDetail = (row: Supplier) => {
    setDetailRow(row)
    setModalType('detail')
  }

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.contact.trim() || !form.phone.trim()) {
      toast.error('请填写供应商名称、联系人和电话')
      return
    }
    try {
      const payload = {
        name: form.name.trim(),
        contact: form.contact.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        taxNo: form.taxNo.trim() || undefined,
        bankName: form.bankName.trim() || undefined,
        bankAccount: form.bankAccount.trim() || undefined,
        status: form.status,
      }
      if (modalType === 'edit' && form.id) {
        await supplierApi.update(form.id, payload)
        toast.success('供应商已更新')
      } else {
        await supplierApi.create(payload)
        toast.success('供应商已创建')
      }
      setModalType(null)
      await loadData()
    } catch {
      toast.error('保存供应商失败')
    }
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    setSelectedIds(prev => (
      data.length > 0 && prev.size === data.length
        ? new Set()
        : new Set(data.map(item => item.id))
    ))
  }

  const clearSelection = () => setSelectedIds(new Set())

  const askConfirm = (props: NonNullable<typeof confirmProps>) => {
    setConfirmProps(props)
    setConfirmOpen(true)
  }

  const deleteSupplier = async (id: string) => {
    try {
      await supplierApi.delete(id)
      toast.success('供应商已删除')
      await loadData()
    } catch {
      toast.error('删除供应商失败')
    }
  }

  const handleDelete = (id: string) => {
    askConfirm({
      title: '删除供应商',
      description: '删除后无法恢复，确认继续？',
      confirmText: '删除',
      confirmVariant: 'danger',
      onConfirm: () => deleteSupplier(id),
    })
  }

  const handleToggleStatus = (row: Supplier) => {
    const nextStatus = row.status === 'active' ? 'inactive' : 'active'
    askConfirm({
      title: nextStatus === 'active' ? '启用供应商' : '停用供应商',
      description: `确认将“${row.name}”改为${nextStatus === 'active' ? '合作中' : '已终止'}？`,
      confirmText: '确认',
      confirmVariant: 'primary',
      onConfirm: async () => {
        try {
          await supplierApi.update(row.id, { status: nextStatus })
          toast.success('状态已更新')
          await loadData()
        } catch {
          toast.error('状态更新失败')
        }
      },
    })
  }

  const batchToggleStatus = (status: 'active' | 'inactive') => {
    askConfirm({
      title: status === 'active' ? '批量启用供应商' : '批量停用供应商',
      description: `确认处理 ${selectedIds.size} 个供应商？`,
      confirmText: '确认',
      confirmVariant: 'primary',
      onConfirm: async () => {
        try {
          await supplierApi.batchStatus(Array.from(selectedIds), status)
          toast.success('批量状态已更新')
          clearSelection()
          await loadData()
        } catch {
          toast.error('批量更新失败')
        }
      },
    })
  }

  const batchDelete = () => {
    askConfirm({
      title: '批量删除供应商',
      description: `确认删除 ${selectedIds.size} 个供应商？`,
      confirmText: '删除',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          await supplierApi.batchDelete(Array.from(selectedIds))
          toast.success('批量删除完成')
          clearSelection()
          await loadData()
        } catch {
          toast.error('批量删除失败')
        }
      },
    })
  }

  const handleSearch = () => {
    setPage(1)
    loadData()
  }

  const handleReset = () => {
    setSearchKeyword('')
    setSearchStatus('all')
    setPage(1)
  }

  return {
    data,
    loading,
    total,
    page,
    pageSize,
    selectedIds,
    searchKeyword,
    searchStatus,
    modalType,
    form,
    detailRow,
    confirmOpen,
    confirmProps,
    stats,
    setPage,
    setPageSize,
    setSearchKeyword,
    setSearchStatus,
    setModalType,
    setForm,
    setConfirmOpen,
    openCreate,
    openEdit,
    openDetail,
    handleSubmit,
    toggleSelect,
    toggleSelectAll,
    clearSelection,
    batchDelete,
    batchToggleStatus,
    handleToggleStatus,
    handleDelete,
    handleSearch,
    handleReset,
    getAvatarColor,
  }
}
