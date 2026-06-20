import { useState, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { equipmentApi } from '@/api/master'
import { usePagination } from '@/hooks/usePagination'
import { getUserPermissions, getUserRole } from '@/lib/permissions'
import type { EquipmentType } from '@/types'

export interface EquipmentTypeForm {
  code: string
  name: string
  description: string
  status: 'active' | 'inactive'
  defaultPurchasePrice: number
  defaultDepreciableLifeYears: number
  defaultValue: number
  defaultDepreciationMethod: string
  defaultTotalCapacity: number
  defaultCapacityUnit: string
}

const defaultForm: EquipmentTypeForm = {
  code: '',
  name: '',
  description: '',
  status: 'active',
  defaultPurchasePrice: 0,
  defaultDepreciableLifeYears: 5,
  defaultValue: 0,
  defaultDepreciationMethod: 'straight_line',
  defaultTotalCapacity: 0,
  defaultCapacityUnit: 'minutes',
}

function canManageEquipmentTypeRecords() {
  const role = getUserRole()
  if (['admin', 'technician', 'pathologist'].includes(role || '')) {
    return true
  }
  const permissions = getUserPermissions()
  return permissions.includes('*')
    || permissions.includes('equipment')
    || permissions.some(permission => ['equipment:add', 'equipment:edit', 'equipment:delete'].includes(permission))
}

export function useEquipmentTypePage() {
  const canManageEquipmentTypes = canManageEquipmentTypeRecords()
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [stats, setStats] = useState({ total: 0, active: 0, equipmentCount: 0 })
  const [modalType, setModalType] = useState<null | 'create' | 'edit'>(null)
  const [form, setForm] = useState<EquipmentTypeForm>(defaultForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EquipmentType | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data, loading, page, pageSize, total, setPage, setPageSize, refresh } = usePagination<EquipmentType>({
    fetchFn: async (params) => {
      const res = await equipmentApi.getTypes({ ...params, keyword, status: statusFilter || undefined })
      return { list: res?.list || [], pagination: res?.pagination }
    },
    initialPage: 1,
    initialPageSize: 20,
    deps: [keyword, statusFilter],
  })

  const loadStats = useCallback(async () => {
    try {
      const res = await equipmentApi.getTypeStats({
        keyword: keyword || undefined,
        status: statusFilter || undefined,
      })
      setStats({
        total: Number(res.total || 0),
        active: Number(res.active || 0),
        equipmentCount: Number(res.equipmentCount || 0),
      })
    } catch {
      setStats({ total, active: 0, equipmentCount: 0 })
    }
  }, [keyword, statusFilter, total])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const handleSearch = useCallback(() => {
    setKeyword(searchInput)
    setPage(1)
  }, [searchInput, setPage])

  const handleReset = useCallback(() => {
    setSearchInput('')
    setKeyword('')
    setStatusFilter('')
    setPage(1)
  }, [setPage])

  const handleStatusChange = useCallback((value: string) => {
    setStatusFilter(value)
    setPage(1)
  }, [setPage])

  const openCreate = useCallback(() => {
    setForm(defaultForm)
    setEditingId(null)
    setModalType('create')
  }, [])

  const openEdit = useCallback((row: EquipmentType) => {
    setForm({
      code: row.code,
      name: row.name,
      description: row.description || '',
      status: row.status || 'active',
      defaultPurchasePrice: row.defaultPurchasePrice || 0,
      defaultDepreciableLifeYears: row.defaultDepreciableLifeYears || 5,
      defaultValue: row.defaultValue || 0,
      defaultDepreciationMethod: row.defaultDepreciationMethod || 'straight_line',
      defaultTotalCapacity: row.defaultTotalCapacity || 0,
      defaultCapacityUnit: row.defaultCapacityUnit || 'minutes',
    })
    setEditingId(row.id)
    setModalType('edit')
  }, [])

  const closeModal = useCallback(() => {
    setModalType(null)
    setEditingId(null)
    setForm(defaultForm)
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('请填写类型编码和名称')
      return
    }
    if (form.defaultPurchasePrice < 0) {
      toast.error('默认采购价必须大于等于0')
      return
    }
    if (form.defaultValue < 0) {
      toast.error('默认残值必须大于等于0')
      return
    }
    if (form.defaultValue > form.defaultPurchasePrice) {
      toast.error('默认残值不能大于默认采购价')
      return
    }
    if (form.defaultDepreciableLifeYears <= 0) {
      toast.error('默认折旧年限必须大于0')
      return
    }
    if (form.defaultTotalCapacity < 0) {
      toast.error('默认总产能必须大于等于0')
      return
    }
    if (form.defaultDepreciationMethod === 'units_of_production' && form.defaultTotalCapacity <= 0) {
      toast.error('工作量法必须填写大于0的默认总产能')
      return
    }
    setSubmitting(true)
    try {
      if (modalType === 'create') {
        await equipmentApi.createType(form)
        toast.success('设备类型创建成功')
      } else if (editingId) {
        const current = data.find(item => item.id === editingId)
        await equipmentApi.updateType(editingId, {
          ...form,
          code: current?.code || form.code,
        })
        toast.success('设备类型更新成功')
      }
      closeModal()
      refresh()
      loadStats()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || err?.message || '操作失败')
    } finally {
      setSubmitting(false)
    }
  }, [form, modalType, editingId, closeModal, refresh])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return
    try {
      await equipmentApi.deleteType(deleteTarget.id)
      toast.success('设备类型已删除')
      setDeleteTarget(null)
      refresh()
      loadStats()
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || err?.message || '删除失败')
    }
  }, [deleteTarget, refresh])

  return {
    canManageEquipmentTypes,
    data, loading, page, pageSize, total, setPage, setPageSize, refresh,
    stats,
    searchInput, setSearchInput, keyword, statusFilter, setStatusFilter,
    handleStatusChange,
    modalType, form, setForm, editingId, deleteTarget, setDeleteTarget, submitting,
    handleSearch, handleReset, openCreate, openEdit, closeModal, handleSubmit, handleDelete,
  }
}
