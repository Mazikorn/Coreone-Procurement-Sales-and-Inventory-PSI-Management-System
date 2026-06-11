import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { equipmentApi } from '@/api/master'
import { usePagination } from '@/hooks/usePagination'
import type { EquipmentType } from '@/types'

export interface EquipmentTypeForm {
  code: string
  name: string
  description: string
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
  defaultPurchasePrice: 0,
  defaultDepreciableLifeYears: 5,
  defaultValue: 0,
  defaultDepreciationMethod: 'straight_line',
  defaultTotalCapacity: 0,
  defaultCapacityUnit: 'minutes',
}

export function useEquipmentTypePage() {
  const [searchInput, setSearchInput] = useState('')
  const [keyword, setKeyword] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [modalType, setModalType] = useState<null | 'create' | 'edit'>(null)
  const [form, setForm] = useState<EquipmentTypeForm>(defaultForm)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<EquipmentType | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { data, loading, page, pageSize, total, setPage, setPageSize, refresh } = usePagination(
    (params) => equipmentApi.getTypes({ ...params, keyword, status: statusFilter || undefined }),
    { initialPage: 1, initialPageSize: 20, deps: [keyword, statusFilter] }
  )

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
    setSubmitting(true)
    try {
      if (modalType === 'create') {
        await equipmentApi.createType(form)
        toast.success('设备类型创建成功')
      } else if (editingId) {
        await equipmentApi.updateType(editingId, form)
        toast.success('设备类型更新成功')
      }
      closeModal()
      refresh()
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
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || err?.message || '删除失败')
    }
  }, [deleteTarget, refresh])

  return {
    data, loading, page, pageSize, total, setPage, setPageSize, refresh,
    searchInput, setSearchInput, keyword, statusFilter, setStatusFilter,
    modalType, form, setForm, editingId, deleteTarget, setDeleteTarget, submitting,
    handleSearch, handleReset, openCreate, openEdit, closeModal, handleSubmit, handleDelete,
  }
}
