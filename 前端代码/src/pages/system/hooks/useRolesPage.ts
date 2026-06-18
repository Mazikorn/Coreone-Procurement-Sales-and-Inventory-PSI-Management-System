import { useState, useEffect, useCallback } from 'react'
import { usePagination } from '@/hooks/usePagination'
import { useUrlParams } from '@/hooks/useUrlParams'
import { rolesApi } from '@/api/roles'
import type { Role } from '@/types'
import { toast } from 'sonner'

export interface FormData {
  code: string
  name: string
  description: string
  permissions: string[]
  status: 'active' | 'inactive'
  dataScope?: 'all' | 'dept' | 'self'
}

export interface PermissionModule {
  key: string
  label: string
  actions: ('view' | 'add' | 'edit' | 'delete')[]
}

export const PERMISSION_MODULES: PermissionModule[] = [
  { key: 'inventory', label: '库存管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'inbound', label: '入库管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'outbound', label: '出库管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'stocktaking', label: '盘点管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'returns', label: '退库管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'scraps', label: '报废管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'transfers', label: '调拨管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'supplier_returns', label: '供应商退货', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'purchase_orders', label: '采购订单', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'projects', label: '检测服务', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'bom', label: 'BOM管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'categories', label: '物料分类', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'materials', label: '耗材配置', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'suppliers', label: '供应商管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'locations', label: '库位管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'equipment', label: '设备管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'labor_times', label: '标准工时', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'cost_analysis', label: '成本与对账', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'alerts', label: '预警管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'users', label: '用户管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'roles', label: '角色管理', actions: ['view', 'add', 'edit', 'delete'] },
  { key: 'logs', label: '操作日志', actions: ['view'] },
]

export const DATA_SCOPE_OPTIONS = [
  { value: 'all' as const, label: '全部数据', desc: '可查看所有部门数据' },
  { value: 'dept' as const, label: '本部门数据', desc: '仅查看所属部门数据' },
  { value: 'self' as const, label: '仅本人数据', desc: '仅查看自己操作的数据' },
]

export function useRolesPage() {
  const { get, getNumber, setMultiple } = useUrlParams()

  const [keyword, setKeyword] = useState(get('keyword') || '')
  const [tabType, setTabType] = useState<'all' | 'system' | 'custom'>((get('tab') as 'system' | 'custom') || 'all')
  const [stats, setStats] = useState({ totalRoles: 0, systemRoles: 0, customRoles: 0, assignedUsers: 0 })

  const urlPage = Math.max(1, getNumber('page', 1))
  const urlPageSize = [10, 20, 50, 100].includes(getNumber('pageSize', 20))
    ? getNumber('pageSize', 20)
    : 20

  const fetchFn = useCallback(
    async ({ page, pageSize }: { page: number; pageSize: number }) => {
      const res = await rolesApi.getList({
        page,
        pageSize,
        ...(keyword && { keyword }),
        ...(tabType !== 'all' && { type: tabType }),
      })
      return { list: res?.list || [], pagination: res?.pagination }
    },
    [keyword, tabType]
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
  } = usePagination<Role>({
    fetchFn,
    initialPage: urlPage,
    initialPageSize: urlPageSize,
    deps: [keyword, tabType],
  })

  useEffect(() => {
    setMultiple({
      page: page > 1 ? page : null,
      pageSize: pageSize !== 20 ? pageSize : null,
      keyword: keyword || null,
      tab: tabType !== 'all' ? tabType : null,
    })
  }, [page, pageSize, keyword, tabType, setMultiple])

  const [modalType, setModalType] = useState<'create' | 'edit' | 'detail' | 'delete' | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailRole, setDetailRole] = useState<Role | null>(null)
  const [deleteRole, setDeleteRole] = useState<Role | null>(null)

  const [form, setForm] = useState<FormData>({
    code: '', name: '', description: '', permissions: [], status: 'active', dataScope: 'dept'
  })

  useEffect(() => {
    rolesApi.getStats({
      ...(keyword && { keyword }),
      ...(tabType !== 'all' && { type: tabType }),
    })
      .then((res: any) => setStats({
        totalRoles: Number(res?.totalRoles || 0),
        systemRoles: Number(res?.systemRoles || 0),
        customRoles: Number(res?.customRoles || 0),
        assignedUsers: Number(res?.assignedUsers || 0),
      }))
      .catch(() => {
        setStats({ totalRoles: total, systemRoles: 0, customRoles: 0, assignedUsers: 0 })
      })
  }, [keyword, tabType, total])

  const openCreate = () => {
    setEditingId(null)
    setForm({ code: `ROLE-${Date.now()}`, name: '', description: '', permissions: [], status: 'active', dataScope: 'dept' })
    setModalType('create')
  }

  const openEdit = (row: Role) => {
    setEditingId(row.id)
    setForm({
      code: row.code,
      name: row.name,
      description: row.description || '',
      permissions: row.permissions || [],
      status: row.status,
      dataScope: row.dataScope || (row.code === 'admin' ? 'all' : 'dept')
    })
    setModalType('edit')
  }

  const openDetail = (row: Role) => {
    setDetailRole(row)
    setModalType('detail')
  }

  const openDelete = (row: Role) => {
    setDeleteRole(row)
    setModalType('delete')
  }

  const togglePermission = (moduleKey: string, action: string) => {
    const permKey = `${moduleKey}:${action}`
    setForm(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permKey)
        ? prev.permissions.filter(p => p !== permKey)
        : [...prev.permissions, permKey]
    }))
  }

  const handleSubmit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('请填写必填字段')
      return
    }
    try {
      if (editingId) {
        await rolesApi.update(editingId, form)
      } else {
        await rolesApi.create(form)
      }
      toast.success(editingId ? '保存成功' : '创建成功')
      setModalType(null)
      refresh()
    } catch (e) {
      toast.error('操作失败')
    }
  }

  const handleDelete = async () => {
    if (!deleteRole) return
    try {
      await rolesApi.delete(deleteRole.id)
      toast.success('删除成功')
      setModalType(null)
      refresh()
    } catch (e) {
      toast.error('删除失败')
    }
  }

  const getDataScopeLabel = (role: Role) => {
    return DATA_SCOPE_OPTIONS.find(opt => opt.value === (role.dataScope || (role.code === 'admin' ? 'all' : 'dept')))?.label || '本部门数据'
  }

  return {
    data,
    loading,
    page,
    pageSize,
    total,
    setPage,
    setPageSize,
    refresh,
    keyword,
    setKeyword: (value: string) => {
      setKeyword(value)
      setPage(1)
    },
    tabType,
    setTabType: (value: 'all' | 'system' | 'custom') => {
      setTabType(value)
      setPage(1)
    },
    modalType,
    setModalType,
    editingId,
    setEditingId,
    detailRole,
    setDetailRole,
    deleteRole,
    setDeleteRole,
    form,
    setForm,
    stats,
    filteredData: data,
    openCreate,
    openEdit,
    openDetail,
    openDelete,
    togglePermission,
    handleSubmit,
    handleDelete,
    getDataScopeLabel,
  }
}
