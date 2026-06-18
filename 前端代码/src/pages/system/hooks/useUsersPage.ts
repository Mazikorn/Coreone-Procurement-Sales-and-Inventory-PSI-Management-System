import { useState, useEffect, useCallback } from 'react'
import { usersApi } from '@/api/users'
import { rolesApi } from '@/api/roles'
import type { User } from '@/types'
import { toast } from 'sonner'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'

export interface FormData {
  username: string
  password: string
  realName: string
  role: string
  department: string
  phone: string
  email: string
  status: 'active' | 'inactive'
}

export interface RoleItem {
  id: string
  name: string
  code: string
  userCount: number
  description: string
  permissions: string[]
  isSystem?: boolean
}

export function getTemporaryPasswordOrThrow(res: { temporaryPassword?: string } | null | undefined) {
  if (!res?.temporaryPassword) {
    throw new Error('接口未返回临时密码')
  }
  return res.temporaryPassword
}

export function useUsersPage() {
  const { get, getNumber, setMultiple } = useUrlParams()

  const [keyword, setKeyword] = useState(get('keyword') || '')
  const [roleFilter, setRoleFilter] = useState(get('role') || '')
  const [statusFilter, setStatusFilter] = useState(get('status') || '')
  const [selectedRoleId, setSelectedRoleId] = useState(get('roleId') || '')
  const [stats, setStats] = useState({ totalUsers: 0, activeUsers: 0, inactiveUsers: 0, adminUsers: 0 })
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const urlPage = Math.max(1, getNumber('page', 1))
  const urlPageSize = [10, 20, 50, 100].includes(getNumber('pageSize', 20))
    ? getNumber('pageSize', 20)
    : 20

  const fetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const res = await usersApi.getList({
        page, pageSize,
        ...(keyword && { keyword }),
        ...(roleFilter && { role: roleFilter }),
        ...(statusFilter && { status: statusFilter }),
        ...(selectedRoleId && { roleId: selectedRoleId }),
      })
      return { list: res?.list || [], pagination: res?.pagination }
    },
    [keyword, roleFilter, statusFilter, selectedRoleId]
  )

  const {
    data, loading, page, pageSize, total,
    setPage, setPageSize, refresh,
  } = usePagination<User>({
    fetchFn,
    initialPage: urlPage,
    initialPageSize: urlPageSize,
    deps: [keyword, roleFilter, statusFilter, selectedRoleId],
  })

  useEffect(() => {
    setMultiple({
      page: page > 1 ? page : null,
      pageSize: pageSize !== 20 ? pageSize : null,
      keyword: keyword || null,
      role: roleFilter || null,
      status: statusFilter || null,
      roleId: selectedRoleId || null,
    })
  }, [page, pageSize, keyword, roleFilter, statusFilter, selectedRoleId, setMultiple])

  const [modalType, setModalType] = useState<'create' | 'edit' | 'detail' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailUser, setDetailUser] = useState<User | null>(null)
  const [form, setForm] = useState<FormData>({
    username: '', password: '', realName: '', role: '', department: '', phone: '', email: '', status: 'active'
  })

  const [roles, setRoles] = useState<RoleItem[]>([])

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmProps, setConfirmProps] = useState<{
    title: string
    description: string
    confirmText: string
    confirmVariant: 'danger' | 'primary'
    onConfirm: () => void
  } | null>(null)

  const openConfirm = (props: {
    title: string
    description: string
    confirmText: string
    confirmVariant: 'danger' | 'primary'
    onConfirm: () => void
  }) => {
    setConfirmProps(props)
    setConfirmOpen(true)
  }

  const fetchRoles = async () => {
    try {
      const res = await rolesApi.getList({ page: 1, pageSize: 100 })
      const list = res?.list || []
      setRoles(list.map((r: any) => ({
        id: r.id, name: r.name, code: r.code, userCount: r.userCount || 0,
        description: r.description || '', permissions: r.permissions || [],
        isSystem: r.code === 'admin'
      })))
    } catch (e) { console.error(e) }
  }

  useEffect(() => { fetchRoles() }, [])

  useEffect(() => {
    usersApi.getStats({
      ...(keyword && { keyword }),
      ...(roleFilter && { role: roleFilter }),
      ...(statusFilter && { status: statusFilter }),
      ...(selectedRoleId && { roleId: selectedRoleId }),
    })
      .then((res: any) => setStats({
        totalUsers: Number(res?.totalUsers || 0),
        activeUsers: Number(res?.activeUsers || 0),
        inactiveUsers: Number(res?.inactiveUsers || 0),
        adminUsers: Number(res?.adminUsers || 0),
      }))
      .catch(() => {
        setStats({ totalUsers: total, activeUsers: 0, inactiveUsers: 0, adminUsers: 0 })
      })
  }, [keyword, roleFilter, statusFilter, selectedRoleId, total])

  const openCreate = () => {
    setEditingId(null)
    setForm({ username: '', password: '', realName: '', role: '', department: '', phone: '', email: '', status: 'active' })
    setModalType('create')
  }

  const openEdit = (row: User) => {
    setEditingId(row.id)
    setForm({
      username: row.username, realName: row.realName, role: row.role,
      password: '',
      department: row.department || '', phone: row.phone || '', email: row.email || '',
      status: row.status
    })
    setModalType('edit')
  }

  const openDetail = (row: User) => {
    setDetailUser(row)
    setModalType('detail')
  }

  const handleSubmit = async () => {
    if (!form.username.trim() || !form.realName.trim() || !form.role.trim()) {
      toast.error('请填写必填字段')
      return
    }
    try {
      if (editingId) {
        await usersApi.update(editingId, form)
        toast.success('保存成功')
      } else {
        const res = await usersApi.create(form)
        if (res?.initialPassword) {
          toast.success(`创建成功，初始密码：${res.initialPassword}`)
        } else {
          toast.success('创建成功')
        }
      }
      setModalType(null)
      refresh()
    } catch (e) {
      toast.error('操作失败')
    }
  }

  const handleDelete = async (id: string) => {
    openConfirm({
      title: '确认删除',
      description: '确认删除该用户？删除后不可恢复。',
      confirmText: '删除',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          await usersApi.delete(id)
          toast.success('删除成功')
          refresh()
        } catch (e) { toast.error('删除失败') }
      },
    })
  }

  const handleToggleStatus = async (row: User) => {
    const newStatus = row.status === 'active' ? 'inactive' : 'active'
    try {
      await usersApi.update(row.id, { status: newStatus })
      toast.success(newStatus === 'active' ? '已启用' : '已停用')
      refresh()
    } catch (e) { toast.error('操作失败') }
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === data.length && data.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(data.map(row => row.id)))
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

  const clearSelection = () => setSelectedIds(new Set())

  const batchToggleStatus = async (status: 'active' | 'inactive') => {
    try {
      await usersApi.batchUpdateStatus([...selectedIds], status)
      toast.success(status === 'active' ? '批量启用成功' : '批量停用成功')
      clearSelection()
      refresh()
    } catch (e) {
      toast.error('批量操作失败')
    }
  }

  const batchDelete = () => {
    openConfirm({
      title: '确认批量删除',
      description: `确认删除选中的 ${selectedIds.size} 个用户？删除后不可恢复。`,
      confirmText: '删除',
      confirmVariant: 'danger',
      onConfirm: async () => {
        try {
          await usersApi.batchDelete([...selectedIds])
          toast.success('批量删除成功')
          clearSelection()
          refresh()
        } catch (e) {
          toast.error('批量删除失败')
        }
      },
    })
  }

  const handleResetPassword = async (id: string) => {
    openConfirm({
      title: '确认重置密码',
      description: '确认重置该用户密码？重置后用户需使用新密码登录。',
      confirmText: '重置',
      confirmVariant: 'primary',
      onConfirm: async () => {
        try {
          const res = await usersApi.resetPassword(id)
          const temporaryPassword = getTemporaryPasswordOrThrow(res)
          toast.success(`密码已重置为 ${temporaryPassword}`)
        } catch (e: any) {
          toast.error(e?.message ? `密码重置失败：${e.message}` : '密码重置失败')
        }
      },
    })
  }

  const handleSearch = () => { setPage(1) }
  const handleReset = () => {
    setKeyword(''); setRoleFilter(''); setStatusFilter(''); setSelectedRoleId(''); setPage(1)
  }

  const getAvatarChar = (name: string) => name ? name.charAt(0) : '?'

  return {
    data, loading, page, pageSize, total, setPage, setPageSize, refresh,
    keyword, setKeyword, roleFilter, setRoleFilter, statusFilter, setStatusFilter,
    selectedRoleId, setSelectedRoleId,
    modalType, setModalType,
    editingId, setEditingId,
    detailUser, setDetailUser,
    form, setForm,
    roles, setRoles,
    confirmOpen, setConfirmOpen, confirmProps, setConfirmProps,
    selectedIds, setSelectedIds,
    stats,
    handleSearch, handleReset,
    openCreate, openEdit, openDetail,
    handleSubmit, handleDelete, handleToggleStatus, handleResetPassword,
    toggleSelectAll, toggleSelect, clearSelection,
    batchDelete, batchToggleStatus,
    getAvatarChar,
  }
}
